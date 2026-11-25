// The rider calculator: works out the rider cost of one headline act or host from the rider price list.
import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Item, RiderCalc, RiderPrice } from '../../shared/types.ts';
import type { RiderLineInput } from './api.ts';
import { ErrorBanner, Loading } from './components.tsx';
import { errorMessage, money } from './lib.ts';

/** What a line needs in order to offer the calculator: the price list, and where a rider is read and saved. */
export interface RiderTools {
  prices: RiderPrice[];
  load: (itemId: number) => Promise<RiderCalc>;
  save: (itemId: number, lines: RiderLineInput[]) => Promise<{ item: Item; rider: RiderCalc }>;
}

interface Row {
  key: number;
  name: string;
  unit: string;
  quantity: string;
}

let nextKey = 1;
const toRow = (name: string, unit: number, quantity: number): Row => ({ key: nextKey++, name, unit: String(unit), quantity: String(quantity) });

/** A cost as typed. Returns null if it is empty, not a number, or negative. */
const parseCost = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const parseQuantity = (text: string): number | null => {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 9999 ? n : null;
};
const cents = (n: number) => Math.round(n * 100);

export function RiderCalculator({
  item,
  tools,
  onSaved,
  onClose,
  draft,
}: {
  item: { id: number; name: string; riderCost: number; riderItems?: number };
  tools: RiderTools;
  onClose: () => void;
} & (
  | { onSaved: (item: Item) => void; draft?: undefined }
  /**
   * The booking does not exist yet (the add form). The items start from `lines`, nothing is read or saved on
   * the server, and "Use these items" hands the items to `onApply` for the add form to keep.
   */
  | { onSaved?: undefined; draft: { lines: RiderLineInput[]; onApply: (lines: RiderLineInput[]) => void } }
)) {
  const id = useId();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The "add an item" form.
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');

  // The calculation is read when the calculator opens. A booking whose rider cost was typed in starts empty.
  useEffect(() => {
    let live = true;
    if (draft) {
      setRows(draft.lines.map((l) => toRow(l.name, l.unitCost, l.quantity)));
      return;
    }
    const load = item.riderItems ? tools.load(item.id) : Promise.resolve<RiderCalc | null>(null);
    load
      .then((calc) => live && setRows(calc ? calc.lines.map((l) => toRow(l.name, l.unitCost, l.quantity)) : []))
      .catch((err) => live && setError(errorMessage(err)));
    return () => {
      live = false;
    };
    // Read once per booking: later edits in this panel must not be overwritten by a reload.
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) return error ? <ErrorBanner message={error} /> : <Loading />;

  const priced = rows.map((r) => ({ ...r, unitValue: parseCost(r.unit), quantityValue: parseQuantity(r.quantity) }));
  const total = priced.reduce((s, r) => s + (r.unitValue !== null && r.quantityValue !== null ? cents(r.unitValue) * r.quantityValue : 0), 0) / 100;
  const listed = tools.prices.find((p) => p.name.trim().toLowerCase() === newName.trim().toLowerCase());

  function pickName(value: string) {
    setNewName(value);
    const match = tools.prices.find((p) => p.name.trim().toLowerCase() === value.trim().toLowerCase());
    if (match) setNewUnit(String(match.cost));
  }

  function addRow(e: FormEvent) {
    e.preventDefault();
    const unit = parseCost(newUnit);
    const quantity = parseQuantity(newQuantity);
    if (!newName.trim()) return setError('Choose or type an item');
    if (unit === null) return setError(listed ? 'Enter a cost of 0 or more' : `${newName.trim()} is not in the price list, so enter its cost`);
    if (quantity === null) return setError('Enter a whole number of 1 or more for how many');
    setError(null);
    const same = rows!.find((r) => r.name.trim().toLowerCase() === newName.trim().toLowerCase() && parseCost(r.unit) === unit);
    setRows(
      same
        ? rows!.map((r) => (r === same ? { ...r, quantity: String((parseQuantity(r.quantity) ?? 0) + quantity) } : r))
        : [...rows!, toRow(listed?.name ?? newName.trim(), unit, quantity)],
    );
    setNewName('');
    setNewUnit('');
    setNewQuantity('1');
  }

  const change = (key: number, patch: Partial<Row>) => setRows(rows!.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save() {
    const lines: RiderLineInput[] = [];
    for (const r of priced) {
      if (!r.name.trim()) return setError('Every item needs a name');
      if (r.unitValue === null) return setError(`Enter a cost of 0 or more for ${r.name}`);
      if (r.quantityValue === null) return setError(`Enter a whole number of 1 or more for how many ${r.name}`);
      lines.push({ name: r.name.trim(), unitCost: r.unitValue, quantity: r.quantityValue });
    }
    if (draft) {
      draft.onApply(lines);
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await tools.save(item.id, lines);
      onSaved(saved.item);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rider-calc" role="group" aria-label={`Rider calculator for ${item.name}`}>
      <h3>Rider for {item.name}</h3>
      {!item.riderItems && item.riderCost > 0 && (
        <p className="muted small">
          The rider cost is {money(item.riderCost)}, typed in. Saving a rider here replaces it with the total of the items below.
        </p>
      )}
      <datalist id={`${id}-prices`}>
        {tools.prices.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="rider-lines">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">
                  Cost incl VAT (R)
                </th>
                <th scope="col" className="num">
                  How many
                </th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {priced.map((r) => (
                <tr key={r.key}>
                  <td>
                    <input aria-label="Item" value={r.name} maxLength={200} onChange={(e) => change(r.key, { name: e.target.value })} />
                  </td>
                  <td className="num">
                    <input
                      aria-label={`Cost of ${r.name}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={r.unit}
                      onChange={(e) => change(r.key, { unit: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      aria-label={`How many ${r.name}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={9999}
                      step={1}
                      value={r.quantity}
                      onChange={(e) => change(r.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="num strong">{r.unitValue !== null && r.quantityValue !== null ? money((cents(r.unitValue) * r.quantityValue) / 100) : '–'}</td>
                  <td>
                    <button type="button" className="icon-button" aria-label={`Remove ${r.name}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="rider-add" onSubmit={addRow} aria-label={`Add an item to the rider for ${item.name}`}>
        <div>
          <label htmlFor={`${id}-name`}>Item</label>
          <input
            id={`${id}-name`}
            list={`${id}-prices`}
            value={newName}
            maxLength={200}
            placeholder={tools.prices.length ? 'Choose or type an item' : 'Type an item'}
            onChange={(e) => pickName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${id}-unit`}>Cost incl VAT (R)</label>
          <input id={`${id}-unit`} type="number" inputMode="decimal" min={0} step="0.01" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-qty`}>How many</label>
          <input id={`${id}-qty`} type="number" inputMode="numeric" min={1} max={9999} step={1} value={newQuantity} onChange={(e) => setNewQuantity(e.target.value)} />
        </div>
        <button type="submit">Add item</button>
      </form>
      {tools.prices.length === 0 && <p className="muted small">The price list is empty. Add items on the Rider prices page, or type an item and its cost here.</p>}
      <ErrorBanner message={error} />
      <div className="rider-total">
        <span>
          Rider cost for {item.name}: <strong>{money(total)}</strong>
        </span>
        <span className="rider-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
            {draft ? 'Use these items' : 'Save rider cost'}
          </button>
          {rows.length > 0 && (
            <button type="button" onClick={() => setRows([])}>
              Clear items
            </button>
          )}
          <button type="button" onClick={onClose}>
            Close
          </button>
        </span>
      </div>
      {rows.length === 0 && item.riderItems ? <p className="muted small">Saving with no items sets the rider cost to R0,00.</p> : null}
    </div>
  );
}
