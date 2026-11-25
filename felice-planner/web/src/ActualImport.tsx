import { useState, type FormEvent } from 'react';
import { MONTH_NAMES, VARIANCE_GROUPS, groupLabel, weekLabel } from '../../shared/categories.ts';
import type { ActualImportPreview, ActualSheetList, ActualWeekSummary, WeekSummary } from '../../shared/types.ts';
import { Card, ErrorBanner, Loading, TemplateLink } from './components.tsx';
import { errorMessage, money, useAsync } from './lib.ts';
import { useOrg } from './org.tsx';
import { Var } from './variance.tsx';

interface Known {
  actuals: ActualWeekSummary[];
  weeks: WeekSummary[];
}

type WeekRef = { year: number; month: number; weekNo: number };
const order = (w: WeekRef) => w.year * 1000 + w.month * 10 + w.weekNo;

/**
 * The week the next tab is probably for: the first planned week after the latest one that already has
 * actuals (they are imported at the end of each week, in order). Falls back to the earliest planned week
 * without actuals, then to week 1 of this month.
 */
function suggestWeek(known: Known | undefined, today: Date): WeekRef {
  const planned = known?.weeks ?? [];
  const done = new Set((known?.actuals ?? []).map(order));
  const lastDone = Math.max(-1, ...(known?.actuals ?? []).map(order));
  const next = planned.find((w) => order(w) > lastDone && !done.has(order(w))) ?? planned.find((w) => !done.has(order(w))) ?? planned.at(-1);
  return next ? { year: next.year, month: next.month, weekNo: next.weekNo } : { year: today.getFullYear(), month: today.getMonth() + 1, weekNo: 1 };
}

/** Everything about actual expenditure on the Import & export page. */
export function ActualsImport() {
  const { api } = useOrg();
  const known = useAsync(async () => {
    const [actuals, weeks] = await Promise.all([api.actuals(), api.weeks()]);
    return { actuals, weeks };
  }, []);

  return (
    <>
      <ImportCard known={known.data} onChanged={known.reload} />
      <ImportedList known={known.data} loading={known.loading} error={known.error} onChanged={known.reload} />
    </>
  );
}

function ImportCard({ known, onChanged }: { known: Known | undefined; onChanged: () => void }) {
  const { api } = useOrg();
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<ActualSheetList | null>(null);
  const [tab, setTab] = useState('');
  const [week, setWeek] = useState<WeekRef>(() => suggestWeek(undefined, new Date()));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ActualImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPreview(null);
    setEdits({});
    setDone(null);
  };

  async function chooseFile(f: File | null) {
    setFile(f);
    setSheets(null);
    setTab('');
    reset();
    setError(null);
    if (!f) return;
    setBusy(true);
    try {
      const list = await api.actualSheets(f);
      setSheets(list);
      setTab(list.suggested ?? '');
      setWeek(suggestWeek(known, new Date()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Section totals that differ from what the sheet says, taken from what is currently shown. */
  function adjustments(from: ActualImportPreview, typed: Record<string, string>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of from.sections) {
      const shown = typed[s.heading] ?? String(s.amount);
      const n = Number(shown);
      if (shown.trim() !== '' && Number.isFinite(n) && n >= 0 && Math.round(n * 100) !== Math.round(s.sheetAmount * 100)) out[s.heading] = n;
    }
    return out;
  }

  async function run(dryRun: boolean, typed: Record<string, string> = edits) {
    if (!file || !tab) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importActual(file, { sheet: tab, ...week, adjust: preview ? adjustments(preview, typed) : undefined }, dryRun);
      if (result.applied) {
        setDone(`Imported ${weekLabel(result.year, result.month, result.weekNo)} from tab ${result.tab}: actual ${money(result.total)}.`);
        setPreview(null);
        setEdits({});
        onChanged();
      } else {
        setPreview(result);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const onPreview = (e: FormEvent) => {
    e.preventDefault();
    setEdits({});
    setPreview(null);
    setDone(null);
    void run(true, {});
  };

  /** A changed total is checked by the server again, so the comparison below always matches what will be saved. */
  function onAmountBlur(heading: string) {
    const shown = edits[heading];
    const n = Number(shown);
    if (shown === undefined) return;
    if (shown.trim() === '' || !Number.isFinite(n) || n < 0) {
      setError(`Enter an amount of 0 or more for ${heading}.`);
      return;
    }
    void run(true);
  }

  return (
    <Card title="Import actual expenditure">
      <p className="muted">
        Import the weekly expense sheet at the end of each week. Choose the file, pick the <strong>tab for that week</strong> and say which planned
        week it is. Only each section's <strong>subtotal</strong> is used; the individual lines are not read into the comparison. Importing a week
        again replaces it.
      </p>
      <p className="muted">
        Not sure how the workbook should look? Download the <TemplateLink id="actual-expenditure">expense workbook template</TemplateLink>, which has
        two example weeks and a READ ME tab.
      </p>
      <form className="import-form" onSubmit={onPreview}>
        <div>
          <label htmlFor="actual-file">Expense workbook (.xlsx)</label>
          <input
            id="actual-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {sheets && (
          <>
            <div>
              <label htmlFor="actual-tab">Tab (one week)</label>
              <select
                id="actual-tab"
                value={tab}
                onChange={(e) => {
                  setTab(e.target.value);
                  reset();
                }}
              >
                {sheets.sheets.map((s) => (
                  <option key={s.name} value={s.name} disabled={s.sections === 0}>
                    {s.name}
                    {s.sections === 0 ? ' (nothing to import)' : ` (${money(s.total)})`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="actual-month">Month</label>
              <select
                id="actual-month"
                value={week.month}
                onChange={(e) => {
                  setWeek({ ...week, month: Number(e.target.value) });
                  reset();
                }}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="actual-year">Year</label>
              <input
                id="actual-year"
                type="number"
                min={2000}
                max={2100}
                value={week.year}
                onChange={(e) => {
                  setWeek({ ...week, year: Number(e.target.value) });
                  reset();
                }}
              />
            </div>
            <div>
              <label htmlFor="actual-week">Week</label>
              <select
                id="actual-week"
                value={week.weekNo}
                onChange={(e) => {
                  setWeek({ ...week, weekNo: Number(e.target.value) });
                  reset();
                }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={busy || !tab}>
              Preview
            </button>
          </>
        )}
      </form>
      <ErrorBanner message={error} />
      {done && (
        <p className="import-preview" role="status">
          <strong>{done}</strong> It now appears in <em>Plan vs actual</em>.
        </p>
      )}
      {preview && (
        <Preview
          preview={preview}
          edits={edits}
          busy={busy}
          onEdit={(heading, value) => setEdits({ ...edits, [heading]: value })}
          onBlur={onAmountBlur}
          onImport={() => void run(false)}
        />
      )}
    </Card>
  );
}

function Preview({
  preview,
  edits,
  busy,
  onEdit,
  onBlur,
  onImport,
}: {
  preview: ActualImportPreview;
  edits: Record<string, string>;
  busy: boolean;
  onEdit: (heading: string, value: string) => void;
  onBlur: (heading: string) => void;
  onImport: () => void;
}) {
  const label = weekLabel(preview.year, preview.month, preview.weekNo);
  const plan = preview.planned;
  const hasMisc = preview.sections.some((s) => s.group === 'marketing');

  return (
    <div className="import-preview" aria-live="polite">
      <h3>
        {label} <span className="muted">from tab {preview.tab}</span>
      </h3>
      {preview.replaces && <p className="error">Actuals for {label} were imported before. Importing will replace them.</p>}
      {preview.warnings.length > 0 && (
        <details open>
          <summary>{preview.warnings.length} thing{preview.warnings.length === 1 ? '' : 's'} to check</summary>
          <ul className="warnings">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <h4>Section totals from the sheet</h4>
      {hasMisc && (
        <p className="muted small">
          The sheet's Miscellaneous total can include costs that belong to the other company. If it does, enter the amount that belongs here; the comparison below updates.
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Section</th>
              <th scope="col">Compared as</th>
              <th scope="col" className="num">
                On the sheet
              </th>
              <th scope="col" className="num">
                Amount to import
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.sections.map((s) => {
              const shown = edits[s.heading] ?? String(s.amount);
              const changed = Math.round(s.amount * 100) !== Math.round(s.sheetAmount * 100);
              return (
                <tr key={s.heading}>
                  <th scope="row">{s.heading}</th>
                  <td>{groupLabel(s.group)}</td>
                  <td className="num">{money(s.sheetAmount)}</td>
                  <td className="num">
                    <input
                      className="edit-amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      aria-label={`Amount to import for ${s.heading}`}
                      value={shown}
                      onChange={(e) => onEdit(s.heading, e.target.value)}
                      onBlur={() => onBlur(s.heading)}
                    />
                    {changed && <span className="adjusted-note"> changed from the sheet</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Actual for the week
              </th>
              <td className="num">{money(preview.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h4>Planned against actual for this week</h4>
      {plan === null ? (
        <p className="muted">{label} has no plan yet, so there is nothing to compare it with. You can still import it and add the plan later.</p>
      ) : (
        <div className="table-scroll">
          <table className="report">
            <thead>
              <tr>
                <th scope="col">Cost group</th>
                <th scope="col" className="num">
                  Planned
                </th>
                <th scope="col" className="num">
                  Actual
                </th>
                <th scope="col" className="num">
                  Variance
                </th>
              </tr>
            </thead>
            <tbody>
              {VARIANCE_GROUPS.map((g) => {
                const planned = plan.byGroup[g.key];
                const actual = preview.byGroup[g.key];
                return (
                  <tr key={g.key}>
                    <th scope="row">{g.label}</th>
                    <td className="num">{money(planned)}</td>
                    <td className="num">{money(actual)}</td>
                    <td className="num">{planned === 0 && actual === 0 ? '–' : <Var planned={planned} actual={actual} />}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="num">{money(plan.total)}</td>
                <td className="num">{money(preview.total)}</td>
                <td className="num">
                  <Var planned={plan.total} actual={preview.total} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <button type="button" className="primary" disabled={busy} onClick={onImport}>
        {preview.replaces ? `Replace ${label}` : `Import ${label}`}
      </button>
    </div>
  );
}

function ImportedList({ known, loading, error, onChanged }: { known: Known | undefined; loading: boolean; error: string | null; onChanged: () => void }) {
  const { api } = useOrg();
  const [problem, setProblem] = useState<string | null>(null);

  async function remove(w: ActualWeekSummary) {
    const name = weekLabel(w.year, w.month, w.weekNo);
    if (!window.confirm(`Remove the actuals imported for ${name}? The plan is not affected.`)) return;
    try {
      await api.deleteActual(w.id);
      onChanged();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  }

  const plannedFor = (w: ActualWeekSummary) => known?.weeks.find((p) => order(p) === order(w))?.total;
  const rows = [...(known?.actuals ?? [])].reverse(); // newest first

  return (
    <Card title="Imported actuals">
      <ErrorBanner message={error ?? problem} />
      {loading && !known && <Loading />}
      {known && rows.length === 0 && <p className="muted">Nothing imported yet.</p>}
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="report">
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Tab</th>
                <th scope="col" className="num">
                  Planned
                </th>
                <th scope="col" className="num">
                  Actual
                </th>
                <th scope="col" className="num">
                  Variance
                </th>
                <th scope="col" className="num">
                  Paid
                </th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const planned = plannedFor(w);
                return (
                  <tr key={w.id}>
                    <th scope="row">
                      {weekLabel(w.year, w.month, w.weekNo)}
                      {w.adjusted && <span className="adjusted-note"> adjusted</span>}
                    </th>
                    <td>{w.label}</td>
                    <td className="num">{planned === undefined ? <span className="muted">not planned</span> : money(planned)}</td>
                    <td className="num">{money(w.total)}</td>
                    <td className="num">{planned === undefined ? '–' : <Var planned={planned} actual={w.total} />}</td>
                    <td className="num">{money(w.paid)}</td>
                    <td>
                      <button type="button" className="icon-button" aria-label={`Remove actuals for ${weekLabel(w.year, w.month, w.weekNo)}`} onClick={() => void remove(w)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
