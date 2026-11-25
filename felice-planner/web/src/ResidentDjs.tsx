import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { PAYMENT_BATCH_SIZE } from '../../shared/categories.ts';
import type { DjImportResult, LineItem } from '../../shared/types.ts';
import type { ItemInput, OrgApi } from './api.ts';
import { Card, ErrorBanner, Loading, TemplateLink } from './components.tsx';
import { CategorySection, type LineActions } from './ItemEditor.tsx';
import { errorMessage, money, useAsync } from './lib.ts';

const RESIDENT_COLOR = '#0e7490';

const DJ_HINT =
  'Add each DJ with their rate. The Resident DJs cost is the total of the DJs listed here. Each DJ can be in a week once.';

/**
 * The Resident DJs part of a week, or of the recurring list: individual DJs with a rate (added by hand or
 * imported from a file), plus the older lump-sum lines if any. `items` is every line in the Resident DJs category.
 */
export function ResidentDjSection<T extends LineItem>({
  actions,
  importList,
  items,
  onItemsChange,
  onImported,
  extra,
}: {
  /** Saves a single DJ: add, change the rate or name, remove. */
  actions: LineActions;
  /** Reads a file of DJs. With dryRun the file is only checked, nothing is saved. */
  importList: (file: File, dryRun: boolean) => Promise<DjImportResult>;
  items: T[];
  onItemsChange: (items: T[]) => void;
  /** Called after a bulk import, so the page can load the saved lines again. */
  onImported: () => void;
  /** Extra cards shown under the DJ list, such as the payment schedule. */
  extra?: ReactNode;
}) {
  const djs = useMemo(() => items.filter((i) => i.isDj).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [items]);
  const lumps = items.filter((i) => !i.isDj);

  return (
    <>
      <CategorySection
        actions={actions}
        category="resident"
        label="Resident DJs"
        color={RESIDENT_COLOR}
        amountLabel="Rate"
        hint={DJ_HINT}
        items={djs}
        onItemsChange={(changed) => onItemsChange([...lumps, ...changed])}
      />
      <DjImport importList={importList} onImported={onImported} />
      {lumps.length > 0 && (
        <LumpSumLines
          lumps={lumps}
          derived={djs.length > 0}
          onRemove={async (id) => {
            await actions.remove(id);
            onItemsChange(items.filter((i) => i.id !== id));
          }}
        />
      )}
      {extra}
    </>
  );
}

/** The older way of capturing resident DJs: one lump-sum line. Shown so it can be seen and removed. */
function LumpSumLines<T extends LineItem>({ lumps, derived, onRemove }: { lumps: T[]; derived: boolean; onRemove: (id: number) => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);

  async function remove(item: T) {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await onRemove(item.id);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card title="Lump-sum Resident DJs line">
      <p className="muted small" role="status">
        {derived
          ? 'These lines are no longer counted, because the Resident DJs cost now comes from the individual DJs above. Remove them when you no longer need them.'
          : 'These lines are counted as they are. As soon as you add individual DJs above, they stop counting and the cost comes from the DJs instead.'}
      </p>
      <table className="items lump">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lumps.map((l) => (
            <tr key={l.id} className={derived ? 'ignored' : undefined}>
              <td>{l.name}</td>
              <td className="num">{money(l.amount)}</td>
              <td>{derived ? 'Not counted' : 'Counted'}</td>
              <td>
                <button type="button" className="icon-button" aria-label={`Remove ${l.name}`} onClick={() => void remove(l)}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorBanner message={error} />
    </Card>
  );
}

/** Choose a file, check it, then import it. Existing DJs are updated, new ones added. */
function DjImport({ importList, onImported }: { importList: (file: File, dryRun: boolean) => Promise<DjImportResult>; onImported: () => void }) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [preview, setPreview] = useState<DjImportResult | null>(null);
  const [done, setDone] = useState<DjImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importList(file, dryRun);
      if (dryRun) {
        setPreview(result);
        setDone(null);
      } else {
        setDone(result);
        setPreview(null);
        setFile(null);
        setFileKey((k) => k + 1);
        onImported();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const onPreview = (e: FormEvent) => {
    e.preventDefault();
    void run(true);
  };

  const changes = preview ? preview.added + preview.updated : 0;

  return (
    <Card title="Import resident DJs from a file">
      <p className="muted">
        Upload an Excel (.xlsx) or CSV file with a <strong>Name</strong> column and a <strong>Rate</strong> column. A <strong>Notes</strong> column is
        optional. DJs already listed get the new rate; new DJs are added; nobody is removed.
      </p>
      <p className="muted">
        Template with examples: <TemplateLink id="resident-djs">Excel</TemplateLink> or <TemplateLink id="resident-djs-csv">CSV</TemplateLink>.
      </p>
      <form className="import-form" onSubmit={onPreview}>
        <div>
          <label htmlFor={`${id}-file`}>File</label>
          <input
            key={fileKey}
            id={`${id}-file`}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setDone(null);
            }}
          />
        </div>
        <button type="submit" disabled={!file || busy}>
          Preview
        </button>
      </form>
      <ErrorBanner message={error} />

      {done && (
        <p role="status">
          <strong>Imported.</strong> {done.added} added, {done.updated} updated, {done.unchanged} unchanged.
        </p>
      )}

      {preview && (
        <div className="import-preview" aria-live="polite">
          <p>
            Found <strong>{preview.rows.length} DJs</strong> with rates adding up to <strong>{money(preview.total)}</strong>: {preview.added} new,{' '}
            {preview.updated} to update, {preview.unchanged} unchanged.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">DJ</th>
                  <th scope="col" className="num">
                    Rate
                  </th>
                  <th scope="col">What happens</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="num">{money(r.rate)}</td>
                    <td>
                      {r.status === 'new' && 'Added'}
                      {r.status === 'update' && `Updated (now ${money(r.currentRate ?? 0)})`}
                      {r.status === 'unchanged' && 'No change'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.warnings.length > 0 && (
            <details open>
              <summary>
                {preview.warnings.length} thing{preview.warnings.length === 1 ? '' : 's'} to check
              </summary>
              <ul className="warnings">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" className="primary" disabled={busy || changes === 0} onClick={() => void run(false)}>
            {changes === 0 ? 'Nothing to import' : `Import ${changes} DJ${changes === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </Card>
  );
}

/** The week's resident DJs in batches of 5 for a bulk payment, with an Excel download. */
export function PaymentSchedulePanel({
  api,
  weekId,
  signature,
}: {
  api: OrgApi;
  weekId: number;
  /** Changes whenever the week's DJs change, so the schedule is read again. */
  signature: string;
}) {
  const { data, error, loading } = useAsync(() => api.paymentSchedule(weekId), [weekId, signature]);

  return (
    <Card
      title="Payment schedule"
      actions={
        data && data.count > 0 ? (
          <a className="button primary" href={api.paymentScheduleUrl(weekId)} download>
            Download .xlsx
          </a>
        ) : undefined
      }
    >
      <p className="muted">
        The week's resident DJs by name, in batches of {PAYMENT_BATCH_SIZE}, for a bulk payment. Only the DJ rates are included.
      </p>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && data.count === 0 && <p className="muted">Add resident DJs to this week to generate a schedule.</p>}
      {data && data.count > 0 && (
        <div className="schedule">
          {data.batches.map((b) => (
            <div key={b.batchNo} className="schedule-batch">
              <table>
                <caption>
                  Batch {b.batchNo} of {data.batches.length}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">No.</th>
                    <th scope="col">DJ</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.no}>
                      <td>{p.no}</td>
                      <td>{p.name}</td>
                      <td className="num">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      Batch {b.batchNo} total
                    </th>
                    <td className="num">{money(b.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
          <p className="week-total-line">
            {data.count} DJ{data.count === 1 ? '' : 's'} in {data.batches.length} batch{data.batches.length === 1 ? '' : 'es'}. Total to pay:{' '}
            <strong>{money(data.total)}</strong>
          </p>
        </div>
      )}
    </Card>
  );
}

/** Wraps `add` so a DJ is saved through the resident DJ endpoint, whichever list it goes into. */
export function djActions(base: LineActions, addDj: (input: { name: string; rate: number; notes: string }) => Promise<LineItem>): LineActions {
  return {
    ...base,
    add: (item: ItemInput) => addDj({ name: item.name, rate: item.amount, notes: item.notes }),
  };
}
