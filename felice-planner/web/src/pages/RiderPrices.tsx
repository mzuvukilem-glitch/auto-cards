import { useEffect, useId, useState, type FormEvent } from 'react';
import type { RiderPrice, RiderPriceImportResult } from '../../../shared/types.ts';
import { Card, ErrorBanner, Loading, TemplateLink } from '../components.tsx';
import { errorMessage, money, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';

/** A cost as typed. Returns null if it is empty, not a number, or negative. */
const parseCost = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function RiderPricesPage() {
  const { api } = useOrg();
  const { data, error, loading, setData, reload } = useAsync(() => api.riderPrices(), []);
  const prices = data ?? [];
  const replace = (next: RiderPrice[]) => setData([...next].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));

  return (
    <>
      <header className="page-header">
        <h1>
          Rider prices <OrgBadge />
        </h1>
      </header>
      <Card title="How this works">
        <p>
          This is the list of drinks and items that riders are made of, with what each costs <strong>including VAT</strong>. On the Weekly planner, press{' '}
          <strong>Rider</strong> on a headline act or host, choose the items and how many, and the total becomes that booking's{' '}
          <strong>rider cost</strong>. It is included in the Rider Costs reports automatically.
        </p>
        <p className="muted">
          A rider keeps the prices it was worked out with, so changing a price here never changes a week you have already done. Each company has its own
          list.
        </p>
      </Card>
      <ErrorBanner message={error} />
      {loading && !data ? (
        <Loading />
      ) : (
        <Card title={`Price list (${prices.length} item${prices.length === 1 ? '' : 's'})`}>
          {prices.length === 0 ? (
            <p className="muted">The list is empty. Add items below, or import them from a file.</p>
          ) : (
            <div className="table-scroll">
              <table className="items price-list">
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" className="num">
                      Cost incl VAT (R)
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <PriceRow
                      key={p.id}
                      price={p}
                      onSaved={(saved) => replace(prices.map((x) => (x.id === saved.id ? saved : x)))}
                      onDeleted={() => replace(prices.filter((x) => x.id !== p.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AddPriceForm onAdded={(added) => replace([...prices, added])} />
        </Card>
      )}
      <PriceImport onImported={reload} />
    </>
  );
}

function PriceRow({ price, onSaved, onDeleted }: { price: RiderPrice; onSaved: (p: RiderPrice) => void; onDeleted: () => void }) {
  const { api } = useOrg();
  const [name, setName] = useState(price.name);
  const [cost, setCost] = useState(String(price.cost));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(price.name), [price.name]);
  useEffect(() => setCost(String(price.cost)), [price.cost]);

  async function save() {
    const value = parseCost(cost);
    if (name.trim() === price.name && value === price.cost) return;
    if (!name.trim() || value === null) {
      setError('Enter an item and a cost of 0 or more');
      return;
    }
    try {
      onSaved(await api.updateRiderPrice(price.id, { name, cost: value }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${price.name}" from the price list? Riders already worked out are not changed.`)) return;
    try {
      await api.deleteRiderPrice(price.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <tr>
        <td>
          <input aria-label="Item" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} onBlur={save} />
        </td>
        <td className="num">
          <input
            aria-label={`Cost of ${price.name}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            onBlur={save}
          />
        </td>
        <td>
          <button type="button" className="icon-button" aria-label={`Remove ${price.name}`} onClick={remove}>
            ✕
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={3}>
            <ErrorBanner message={error} />
          </td>
        </tr>
      )}
    </>
  );
}

function AddPriceForm({ onAdded }: { onAdded: (p: RiderPrice) => void }) {
  const { api } = useOrg();
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseCost(cost);
    if (!name.trim() || value === null) {
      setError('Enter an item and a cost of 0 or more');
      return;
    }
    try {
      onAdded(await api.addRiderPrice({ name, cost: value }));
      setName('');
      setCost('');
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="add-item" onSubmit={submit} aria-label="Add an item to the price list">
      <input aria-label="New item" placeholder="Item" value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
      <input
        aria-label="New item cost incl VAT"
        placeholder="Cost incl VAT"
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        required
        value={cost}
        onChange={(e) => setCost(e.target.value)}
      />
      <button type="submit">Add</button>
      <ErrorBanner message={error} />
    </form>
  );
}

/** Choose a file, check it, then import it. Listed items get the new cost, new items are added, nothing is removed. */
function PriceImport({ onImported }: { onImported: () => void }) {
  const { api } = useOrg();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [preview, setPreview] = useState<RiderPriceImportResult | null>(null);
  const [done, setDone] = useState<RiderPriceImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.importRiderPrices(file, dryRun);
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
  const changes = preview ? preview.added + preview.updated : 0;

  return (
    <Card title="Import price list">
      <p className="muted">
        Upload an Excel (.xlsx) or CSV file with an <strong>Item</strong> column (or <strong>Beverage</strong>) and a <strong>Cost</strong> column. The{' '}
        <strong>Sheet1</strong> tab of the Rider Calc workbook can be imported as it is. Items already listed get the new cost; new items are added; nothing
        is removed.
      </p>
      <p className="muted">
        Template with examples: <TemplateLink id="rider-prices">Excel</TemplateLink>.
      </p>
      <form
        className="import-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(true);
        }}
      >
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
            Found <strong>{preview.rows.length} items</strong>: {preview.added} new, {preview.updated} to update, {preview.unchanged} unchanged.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">
                    Cost incl VAT
                  </th>
                  <th scope="col">What happens</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td className="num">{money(r.cost)}</td>
                    <td>
                      {r.status === 'new' && 'Added'}
                      {r.status === 'update' && `Updated (now ${money(r.currentCost ?? 0)})`}
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
            {changes === 0 ? 'Nothing to import' : `Import ${changes} item${changes === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </Card>
  );
}
