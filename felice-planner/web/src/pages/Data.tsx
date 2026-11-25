import { useState, type FormEvent } from 'react';
import type { GroupBy, ImportResult } from '../../../shared/types.ts';
import { ActualsImport } from '../ActualImport.tsx';
import { Card, ErrorBanner, PeriodPicker, TemplateLink, Toggle } from '../components.tsx';
import { errorMessage, lastMonths, money } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';

export function DataPage() {
  return (
    <>
      <header className="page-header">
        <h1>
          Import &amp; export <OrgBadge />
        </h1>
      </header>
      <ImportCard />
      <ActualsImport />
      <ExportCard />
    </>
  );
}

function ImportCard() {
  const { api } = useOrg();
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.importFile(file, year, dryRun));
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

  const replacing = preview?.weeks.filter((w) => w.exists).length ?? 0;

  return (
    <Card title="Import from Excel">
      <p className="muted">
        Accepts the original weekly planner layout (months and WEEK columns across the top), or a file exported from this app.
        Importing a week replaces that week's existing lines.
      </p>
      <p className="muted">
        Templates with example rows: <TemplateLink id="planned-weeks">planned weeks (Excel)</TemplateLink> or{' '}
        <TemplateLink id="planner-layout">the original planner layout (Excel)</TemplateLink>.
      </p>
      <form className="import-form" onSubmit={onPreview}>
        <div>
          <label htmlFor="import-file">Excel file (.xlsx)</label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
          />
        </div>
        <div>
          <label htmlFor="import-year">Year (planner layout only)</label>
          <input
            id="import-year"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPreview(null);
            }}
          />
        </div>
        <button type="submit" disabled={!file || busy}>
          Preview
        </button>
      </form>
      <ErrorBanner message={error} />

      {preview && (
        <div className="import-preview" aria-live="polite">
          <p>
            {preview.applied ? (
              <strong>Imported {preview.weeks.length} weeks.</strong>
            ) : (
              <>
                Found <strong>{preview.weeks.length} weeks</strong> ({preview.format === 'planner' ? 'planner layout' : 'app export'}).
                {replacing > 0 && ` ${replacing} already exist and will be replaced.`}
              </>
            )}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col" className="num">
                    Lines
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.weeks.map((w) => (
                  <tr key={w.label}>
                    <td>{w.label}</td>
                    <td className="num">{w.itemCount}</td>
                    <td className="num">{money(w.total)}</td>
                    <td>{preview.applied ? 'Imported' : w.exists ? 'Replaces existing' : 'New'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.warnings.length > 0 && (
            <details open>
              <summary>{preview.warnings.length} things to check</summary>
              <ul className="warnings">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {!preview.applied && (
            <button type="button" className="primary" disabled={busy} onClick={() => void run(false)}>
              Import {preview.weeks.length} weeks
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function ExportCard() {
  const { api } = useOrg();
  const [period, setPeriod] = useState(lastMonths(12));
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  return (
    <Card title="Export to Excel">
      <p className="muted">Downloads a summary sheet plus every line item. The file can be imported again.</p>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="toolbar">
        <Toggle
          label="Summary rows"
          value={groupBy}
          options={[
            { value: 'month', label: 'By month' },
            { value: 'week', label: 'By week' },
          ]}
          onChange={setGroupBy}
        />
        <a className="button primary" href={api.exportUrl(period.from, period.to, groupBy)} download>
          Download .xlsx
        </a>
      </div>
    </Card>
  );
}
