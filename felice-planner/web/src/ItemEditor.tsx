import { useEffect, useState, type FormEvent } from 'react';
import { SUGGESTED_ITEMS, hasRiderCost, type CategoryKey } from '../../shared/categories.ts';
import type { LineItem } from '../../shared/types.ts';
import type { ItemInput, RiderLineInput } from './api.ts';
import { ErrorBanner } from './components.tsx';
import { errorMessage, money } from './lib.ts';
import { RiderCalculator, type RiderTools } from './RiderCalculator.tsx';

/** How a list of lines is saved. The planner saves into a week; the recurring page saves into the standing list. */
export interface LineActions {
  add: (item: ItemInput) => Promise<LineItem>;
  update: (id: number, item: ItemInput) => Promise<LineItem>;
  remove: (id: number) => Promise<void>;
}

export function CategorySection<T extends LineItem>({
  actions,
  category,
  label,
  color,
  items,
  onItemsChange,
  hint,
  amountLabel,
  rider,
}: {
  actions: LineActions;
  category: CategoryKey;
  label: string;
  color: string;
  items: T[];
  onItemsChange: (items: T[]) => void;
  hint?: string;
  /** Names the money column when "Amount" is not the right word, for example "Rate" for resident DJs. */
  amountLabel?: string;
  /** When given, headline acts and hosts get a rider calculator that works out their rider cost. */
  rider?: RiderTools;
}) {
  const withRider = hasRiderCost(category);
  const amountWord = withRider ? 'Rate' : (amountLabel ?? 'Amount');
  const rateTotal = items.reduce((s, i) => s + i.amount, 0);
  const riderTotal = items.reduce((s, i) => s + i.riderCost, 0);
  const subtotal = rateTotal + riderTotal;
  const listId = `suggest-${category}`;
  const suggestions = SUGGESTED_ITEMS[category] ?? [];

  return (
    <section className="card category" aria-label={label} style={{ borderLeftColor: color }}>
      <header className="card-header">
        <h2>{label}</h2>
        <span className="num">
          {withRider && (
            <span className="muted small">
              Rate {money(rateTotal)} + Rider {money(riderTotal)} ={' '}
            </span>
          )}
          {money(subtotal)}
        </span>
      </header>
      {hint && <p className="muted small">{hint}</p>}
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <table className="items">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="num">
              {amountWord} (R)
            </th>
            {withRider && (
              <>
                <th scope="col" className="num">
                  Rider cost (R)
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </>
            )}
            <th scope="col">Notes</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              actions={actions}
              withRider={withRider}
              riderTools={rider}
              amountWord={amountWord}
              listId={suggestions.length ? listId : undefined}
              onSaved={(saved) => onItemsChange(items.map((i) => (i.id === saved.id ? ({ ...i, ...saved } as T) : i)))}
              onDeleted={() => onItemsChange(items.filter((i) => i.id !== item.id))}
            />
          ))}
        </tbody>
      </table>
      <AddItemForm
        actions={actions}
        category={category}
        label={label}
        withRider={withRider}
        riderTools={rider}
        amountWord={amountWord}
        listId={suggestions.length ? listId : undefined}
        onAdded={(item) => onItemsChange([...items, item as T])}
      />
    </section>
  );
}

/** Parses a money field. Returns null if it is empty, not a number, or negative. */
function parseMoney(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ItemRow({
  item,
  actions,
  withRider,
  riderTools,
  amountWord,
  listId,
  onSaved,
  onDeleted,
}: {
  item: LineItem;
  actions: LineActions;
  withRider: boolean;
  riderTools?: RiderTools;
  amountWord: string;
  listId?: string;
  onSaved: (item: LineItem) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(String(item.amount));
  const [rider, setRider] = useState(String(item.riderCost));
  const [notes, setNotes] = useState(item.notes);
  const [error, setError] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const calculated = (item.riderItems ?? 0) > 0;

  // Follow the saved values when they change from outside this row (for example after a file import
  // updates a rate). Each field has its own effect, so typing in one field is never overwritten by
  // another field's save finishing.
  useEffect(() => setName(item.name), [item.name]);
  useEffect(() => setAmount(String(item.amount)), [item.amount]);
  useEffect(() => setRider(String(item.riderCost)), [item.riderCost]);
  useEffect(() => setNotes(item.notes), [item.notes]);

  async function save() {
    const value = parseMoney(amount);
    const riderValue = withRider ? parseMoney(rider) : 0;
    if (name.trim() === item.name && value === item.amount && riderValue === item.riderCost && notes.trim() === item.notes) return;
    if (!name.trim() || value === null || riderValue === null) {
      setError(withRider ? 'Enter a name, a rate and a rider cost (0 or more)' : 'Enter a name and an amount of 0 or more');
      return;
    }
    try {
      const input: ItemInput = { category: item.category, name, amount: value, riderCost: withRider ? riderValue : undefined, notes };
      onSaved(await actions.update(item.id, input));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await actions.remove(item.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <tr>
        <td>
          <input aria-label="Name" value={name} maxLength={200} list={listId} onChange={(e) => setName(e.target.value)} onBlur={save} />
        </td>
        <td className="num">
          <input
            aria-label={`${amountWord} for ${item.name}`}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={save}
          />
        </td>
        {withRider && (
          <>
            <td className="num">
              <input
                aria-label={`Rider cost for ${item.name}`}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                required
                readOnly={calculated}
                title={calculated ? 'Worked out in the rider calculator' : undefined}
                value={rider}
                onChange={(e) => setRider(e.target.value)}
                onBlur={save}
              />
              {riderTools && (
                <button
                  type="button"
                  className="rider-button"
                  aria-expanded={calcOpen}
                  aria-label={`Rider calculator for ${item.name}`}
                  onClick={() => setCalcOpen((o) => !o)}
                >
                  {calculated ? `Rider: ${item.riderItems} item${item.riderItems === 1 ? '' : 's'}` : 'Calculate'}
                </button>
              )}
            </td>
            <td className="num strong">{money((parseMoney(amount) ?? 0) + (parseMoney(rider) ?? 0))}</td>
          </>
        )}
        <td>
          <input aria-label={`Notes for ${item.name}`} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} onBlur={save} />
        </td>
        <td>
          <button type="button" className="icon-button" aria-label={`Remove ${item.name}`} onClick={remove}>
            ✕
          </button>
        </td>
      </tr>
      {calcOpen && riderTools && (
        <tr>
          <td colSpan={6}>
            <RiderCalculator
              item={item}
              tools={riderTools}
              onSaved={(saved) => onSaved({ ...item, ...saved })}
              onClose={() => setCalcOpen(false)}
            />
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={withRider ? 6 : 4}>
            <ErrorBanner message={error} />
          </td>
        </tr>
      )}
    </>
  );
}

/** What the rider items of a new booking cost, in rand. */
const riderTotal = (lines: RiderLineInput[]) => lines.reduce((s, l) => s + Math.round(l.unitCost * 100) * l.quantity, 0) / 100;

function AddItemForm({
  actions,
  category,
  label,
  withRider,
  riderTools,
  amountWord,
  listId,
  onAdded,
}: {
  actions: LineActions;
  category: CategoryKey;
  label: string;
  withRider: boolean;
  riderTools?: RiderTools;
  amountWord: string;
  listId?: string;
  onAdded: (item: LineItem) => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [rider, setRider] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The rider items chosen for the new booking. They are saved with it once it has been added.
  const [riderLines, setRiderLines] = useState<RiderLineInput[]>([]);
  const [calcOpen, setCalcOpen] = useState(false);
  const calculated = riderLines.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseMoney(amount);
    const riderValue = calculated ? riderTotal(riderLines) : parseMoney(rider);
    if (!name.trim() || value === null || (withRider && riderValue === null)) {
      setError(withRider ? 'Enter a name, a rate and a rider cost (enter 0 if there is no rider)' : 'Enter a name and an amount of 0 or more');
      return;
    }
    let added: LineItem;
    try {
      added = await actions.add({ category, name, amount: value, riderCost: withRider ? riderValue! : undefined, notes: '' });
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    let failure: string | null = null;
    if (calculated && riderTools) {
      try {
        added = { ...added, ...(await riderTools.save(added.id, riderLines)).item };
      } catch (err) {
        failure = `${added.name} was added, but its rider items could not be saved (${errorMessage(err)}). Press Calculate on its line to try again.`;
      }
    }
    onAdded(added);
    setName('');
    setAmount('');
    setRider('');
    setRiderLines([]);
    setCalcOpen(false);
    setError(failure);
  }

  return (
    <>
      <form className={withRider ? 'add-item with-rider' : 'add-item'} onSubmit={submit} aria-label={`Add a line to ${label}`}>
        <input
          aria-label={`New ${label} name`}
          placeholder="Name"
          value={name}
          maxLength={200}
          list={listId}
          required
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label={`New ${label} ${amountWord.toLowerCase()}`}
          placeholder={amountWord}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {withRider && (
          <div>
            <input
              aria-label={`New ${label} rider cost`}
              placeholder="Rider cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              readOnly={calculated}
              title={calculated ? 'Worked out from the rider items' : undefined}
              value={calculated ? String(riderTotal(riderLines)) : rider}
              onChange={(e) => setRider(e.target.value)}
            />
            {riderTools && (
              <button
                type="button"
                className="rider-button"
                aria-expanded={calcOpen}
                aria-label={`Rider items for new ${label}`}
                onClick={() => setCalcOpen((o) => !o)}
              >
                {calculated ? `Rider: ${riderLines.length} item${riderLines.length === 1 ? '' : 's'}` : 'Choose rider items'}
              </button>
            )}
          </div>
        )}
        <button type="submit">Add</button>
        <ErrorBanner message={error} />
      </form>
      {calcOpen && riderTools && (
        <RiderCalculator
          item={{ id: 0, name: name.trim() || `new ${label}`, riderCost: 0 }}
          tools={riderTools}
          draft={{ lines: riderLines, onApply: setRiderLines }}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </>
  );
}
