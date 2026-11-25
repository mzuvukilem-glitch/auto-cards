// Copies the rider of one headline act or host onto other headline acts and hosts.
import { useState } from 'react';
import { categoryLabel } from '../../shared/categories.ts';
import type { Item } from '../../shared/types.ts';
import { ErrorBanner } from './components.tsx';
import { errorMessage, money } from './lib.ts';

export function CopyRiderPanel({
  item,
  targets,
  copy,
  onClose,
}: {
  item: { id: number; name: string };
  /** The bookings the rider can be copied to. The booking itself is left out. */
  targets: Item[];
  copy: (fromId: number, toIds: number[]) => Promise<void>;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const others = targets.filter((t) => t.id !== item.id);

  const toggle = (id: number) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const hasRider = (t: Item) => t.riderCost > 0 || (t.riderItems ?? 0) > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await copy(item.id, chosen);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="rider-calc" role="group" aria-label={`Copy the rider of ${item.name}`}>
      <h3>Copy the rider of {item.name} to</h3>
      {others.length === 0 ? (
        <p className="muted small">There is no other headline act or host in this week to copy it to.</p>
      ) : (
        <>
          <ul className="copy-targets">
            {others.map((t) => (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={chosen.includes(t.id)} onChange={() => toggle(t.id)} />
                  <span>
                    {t.name} <span className="muted small">({categoryLabel(t.category)})</span>
                    {hasRider(t) && (
                      <>
                        {' '}
                        <span className="muted small">has a rider of {money(t.riderCost)}, which will be replaced</span>
                      </>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="muted small">The items and the rider cost are copied. Prices are the ones the rider had when it was worked out.</p>
        </>
      )}
      <ErrorBanner message={error} />
      <span className="rider-actions">
        {others.length > 0 && (
          <button type="button" className="primary" disabled={busy || chosen.length === 0} onClick={() => void submit()}>
            Copy rider
          </button>
        )}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </span>
    </div>
  );
}
