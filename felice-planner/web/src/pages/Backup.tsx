import { useState } from 'react';
import type { BackupSummary, RestoreResult } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Card, ErrorBanner } from '../components.tsx';
import { errorMessage } from '../lib.ts';

/** Back up the whole database to a file, and restore it from one. Covers every company. */
export function BackupPage() {
  return (
    <>
      <header className="page-header">
        <h1>Backup &amp; restore</h1>
      </header>
      <BackupCard />
      <RestoreCard />
    </>
  );
}

function BackupCard() {
  return (
    <Card title="Back up">
      <p className="muted">
        Saves <strong>everything</strong> for every company in one file: weeks and cost lines, riders and rider prices, recurring costs and imported
        actuals. Keep the file somewhere safe, such as a different drive or a cloud folder. It is safe to do while the planner is being used.
      </p>
      <a className="button primary" href={api.backup.url} download>
        Download backup
      </a>
    </Card>
  );
}

const COLUMNS: { label: string; value: (o: BackupSummary['orgs'][number]) => string | number }[] = [
  { label: 'Weeks', value: (o) => o.weeks },
  { label: 'Cost lines', value: (o) => o.lines },
  { label: 'Recurring costs', value: (o) => o.recurring },
  { label: 'Rider prices', value: (o) => o.riderPrices },
  { label: 'Actual weeks', value: (o) => o.actualWeeks },
  { label: 'Latest week', value: (o) => o.latestWeek ?? '–' },
];

function Comparison({ result }: { result: RestoreResult }) {
  return (
    <div className="table-scroll">
      <table className="report">
        <thead>
          <tr>
            <th scope="col">Company</th>
            <th scope="col">Data</th>
            {COLUMNS.map((c) => (
              <th key={c.label} scope="col" className="num">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.current.orgs.flatMap((now, i) => {
            const backup = result.backup.orgs[i]!;
            return [
              { key: `${now.slug}-now`, name: now.name, which: 'Now', org: now },
              { key: `${now.slug}-backup`, name: now.name, which: 'In the backup', org: backup },
            ].map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.which === 'Now' ? r.name : <span className="sr-only">{r.name}</span>}</th>
                <td>{r.which}</td>
                {COLUMNS.map((c) => (
                  <td key={c.label} className="num">
                    {c.value(r.org)}
                  </td>
                ))}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

function RestoreCard() {
  // The file that was chosen, and what checking it found. It can be restored once it has been checked.
  const [checked, setChecked] = useState<{ file: File; result: RestoreResult } | null>(null);
  const [done, setDone] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(file: File | null) {
    setChecked(null);
    setDone(null);
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      setChecked({ file, result: await api.backup.check(file) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function restore({ file, result }: { file: File; result: RestoreResult }) {
    const names = result.current.orgs.map((o) => o.name).join(' and ');
    if (!window.confirm(`Replace all the data for ${names} with this backup? What is there now is saved first, so this can be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await api.backup.restore(file));
      setChecked(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Restore from a backup">
      <p className="muted">
        Choose a backup file made by <em>Download backup</em> (or <code>npm run backup</code>). It is checked first and nothing changes until you
        press <strong>Restore</strong>. Restoring <strong>replaces all the data for every company</strong> with what is in the file.
      </p>
      <div className="import-form">
        <div>
          <label htmlFor="backup-file">Backup file (.db)</label>
          <input
            id="backup-file"
            type="file"
            accept=".db,.sqlite,application/octet-stream"
            key={done ? 'done' : 'choosing'}
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <ErrorBanner message={error} />
      {busy && !checked && <p className="muted" role="status">Working…</p>}
      {checked && (
        <div className="import-preview" aria-live="polite">
          <h3>What is in this backup</h3>
          <Comparison result={checked.result} />
          <p className="error">
            Restoring replaces what is under <em>Now</em> with what is in the backup. The current data is saved to a file first, so it can be put
            back if this was a mistake.
          </p>
          <button type="button" className="primary" disabled={busy} onClick={() => void restore(checked)}>
            Restore this backup
          </button>
        </div>
      )}
      {done && (
        <div className="import-preview" role="status">
          <p>
            <strong>Restored.</strong> The data that was here before is saved as <code>{done.safetyCopy}</code> in the planner's <code>server/backups</code>{' '}
            folder. Open the other pages again to see the restored data.
          </p>
          <Comparison result={done} />
        </div>
      )}
    </Card>
  );
}
