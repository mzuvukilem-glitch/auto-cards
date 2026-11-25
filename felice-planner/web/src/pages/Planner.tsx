import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, MONTH_NAMES, hasRiderCost, isIgnoredLump, monthLabel, weekLabel } from '../../../shared/categories.ts';
import type { Item, WeekDetail, WeekSummary } from '../../../shared/types.ts';
import { Card, ErrorBanner, Loading } from '../components.tsx';
import { CategorySection, type LineActions } from '../ItemEditor.tsx';
import { errorMessage, money, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';
import { type RiderTools } from '../RiderCalculator.tsx';
import { PaymentSchedulePanel, ResidentDjSection, djActions } from '../ResidentDjs.tsx';

export function PlannerPage() {
  const { api, path } = useOrg();
  const params = useParams();
  const weekId = params.weekId ? Number(params.weekId) : null;
  const navigate = useNavigate();
  const weeks = useAsync(() => api.weeks(), []);

  const selected = weeks.data?.find((w) => w.id === weekId);
  const years = useMemo(() => {
    const set = new Set((weeks.data ?? []).map((w) => w.year));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [weeks.data]);
  const [year, setYear] = useState<number | null>(null);
  const shownYear = year ?? selected?.year ?? weeks.data?.at(-1)?.year ?? new Date().getFullYear();

  return (
    <>
      <header className="page-header">
        <h1>
          Weekly planner <OrgBadge />
        </h1>
      </header>
      <ErrorBanner message={weeks.error} />
      <div className="planner">
        <aside className="card week-list" aria-label="Weeks">
          <label htmlFor="year-select">Year</label>
          <select id="year-select" value={shownYear} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {weeks.loading && !weeks.data ? <Loading /> : <WeekList weeks={(weeks.data ?? []).filter((w) => w.year === shownYear)} />}
          <NewWeekForm
            year={shownYear}
            existing={weeks.data ?? []}
            onCreated={(w) => {
              weeks.reload();
              navigate(path(`/planner/${w.id}`));
            }}
          />
        </aside>
        <div className="week-pane">
          {weekId ? (
            <WeekEditor
              key={weekId}
              weekId={weekId}
              onChanged={weeks.reload}
              onDeleted={() => {
                weeks.reload();
                navigate(path('/planner'));
              }}
            />
          ) : (
            <Card title="Pick a week">
              <p className="muted">Choose a week on the left, or add a new one.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function WeekList({ weeks }: { weeks: WeekSummary[] }) {
  const { path } = useOrg();
  if (weeks.length === 0) return <p className="muted">No weeks in this year yet.</p>;
  const byMonth = new Map<number, WeekSummary[]>();
  for (const w of weeks) byMonth.set(w.month, [...(byMonth.get(w.month) ?? []), w]);
  return (
    <div>
      {[...byMonth].map(([month, list]) => (
        <div key={month} className="week-group">
          <h3>{MONTH_NAMES[month - 1]}</h3>
          <ul>
            {list.map((w) => (
              <li key={w.id}>
                <NavLink to={path(`/planner/${w.id}`)}>
                  <span>Week {w.weekNo}</span>
                  <span className="num">{money(w.total)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function NewWeekForm({ year, existing, onCreated }: { year: number; existing: WeekSummary[]; onCreated: (w: WeekDetail) => void }) {
  const { api } = useOrg();
  const id = useId();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [weekNo, setWeekNo] = useState(1);
  const [copy, setCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const taken = existing.some((w) => w.year === year && w.month === month && w.weekNo === weekNo);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createWeek({ year, month, weekNo, copyRecurring: copy }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="new-week" onSubmit={submit}>
      <h3>Add a week to {year}</h3>
      <div className="row">
        <div>
          <label htmlFor={`${id}-m`}>Month</label>
          <select id={`${id}-m`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-w`}>Week</label>
          <select id={`${id}-w`} value={weekNo} onChange={(e) => setWeekNo(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
        Add the recurring costs
      </label>
      {taken && <p className="muted small">{weekLabel(year, month, weekNo)} already exists.</p>}
      <ErrorBanner message={error} />
      <button type="submit" className="primary" disabled={busy || taken}>
        Add week
      </button>
    </form>
  );
}

const RIDER_HINT =
  'Rider costs captured on headline acts and hosts are included in the Rider Costs reports automatically. Add other rider lines here, such as the resident DJs.';

function WeekEditor({ weekId, onChanged, onDeleted }: { weekId: number; onChanged: () => void; onDeleted: () => void }) {
  const { api } = useOrg();
  const { data: week, error, loading, setData, reload } = useAsync(() => api.week(weekId), [weekId]);
  const [actionError, setActionError] = useState<string | null>(null);
  // The rider price list, for the rider calculator on headline acts and hosts.
  const prices = useAsync(() => api.riderPrices(), []);
  const riderTools = useMemo<RiderTools>(
    () => ({ prices: prices.data ?? [], load: (id) => api.itemRider(id), save: (id, lines) => api.saveRider(id, lines) }),
    [api, prices.data],
  );

  if (loading && !week) return <Loading />;
  if (error || !week) return <ErrorBanner message={error ?? 'Week not found'} />;

  const actions: LineActions = {
    add: (item) => api.addItem(week.id, item),
    update: (id, item) => api.updateItem(id, item),
    remove: (id) => api.deleteItem(id),
  };
  // A lump-sum Resident DJs line does not count once the week has individual DJs.
  const total = week.items.filter((i) => !isIgnoredLump(i, week.items)).reduce((s, i) => s + i.amount + i.riderCost, 0);
  const replaceItems = (items: Item[]) => {
    setData({ ...week, items });
    onChanged();
  };
  const djSignature = week.items
    .filter((i) => i.isDj)
    .map((i) => `${i.id}:${i.name}:${i.amount}`)
    .join('|');

  async function removeWeek() {
    if (!week || !window.confirm(`Delete ${weekLabel(week.year, week.month, week.weekNo)} and all its lines? This can't be undone.`)) return;
    try {
      await api.deleteWeek(week.id);
      onDeleted();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <>
      <div className="week-header card">
        <div>
          <h2>{weekLabel(week.year, week.month, week.weekNo)}</h2>
          <p className="muted">{monthLabel(week.year, week.month)}</p>
        </div>
        <div className="week-total">
          <span className="muted">Week total</span>
          <strong>{money(total)}</strong>
        </div>
        <button type="button" className="danger" onClick={removeWeek}>
          Delete week
        </button>
      </div>
      <ErrorBanner message={actionError} />
      <WeekNotes week={week} />
      {CATEGORIES.map((c) =>
        c.key === 'resident' ? (
          <ResidentDjSection
            key={c.key}
            actions={djActions(actions, (dj) => api.addResidentDj(week.id, dj))}
            importList={(file, dryRun) => api.importResidentDjs(week.id, file, dryRun)}
            items={week.items.filter((i) => i.category === 'resident')}
            onItemsChange={(changed) => replaceItems([...week.items.filter((i) => i.category !== 'resident'), ...changed])}
            onImported={() => {
              reload();
              onChanged();
            }}
            extra={<PaymentSchedulePanel api={api} weekId={week.id} signature={djSignature} />}
          />
        ) : (
          <CategorySection
            key={c.key}
            actions={actions}
            category={c.key}
            label={c.label}
            color={c.color}
            hint={c.key === 'rider' ? RIDER_HINT : undefined}
            rider={hasRiderCost(c.key) ? riderTools : undefined}
            items={week.items.filter((i) => i.category === c.key)}
            onItemsChange={(changed) => replaceItems([...week.items.filter((i) => i.category !== c.key), ...changed])}
          />
        ),
      )}
    </>
  );
}

function WeekNotes({ week }: { week: WeekDetail }) {
  const { api } = useOrg();
  const [notes, setNotes] = useState(week.notes);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setNotes(week.notes), [week.notes]);

  async function save() {
    if (notes.trim() === week.notes) return;
    try {
      await api.updateWeekNotes(week.id, notes);
      setStatus('Notes saved');
    } catch (err) {
      setStatus(errorMessage(err));
    }
  }

  return (
    <div className="card notes">
      <label htmlFor="week-notes">Week notes</label>
      <textarea id="week-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
      <span className="muted small" role="status">
        {status}
      </span>
    </div>
  );
}
