import { useState } from 'react';
import { api } from '../api.ts';
import { Card, ErrorBanner, Loading, MonthField, PeriodPicker, Toggle } from '../components.tsx';
import { currentMonthKey, lastMonths, useAsync } from '../lib.ts';
import { useOrganisations } from '../org.tsx';
import { CompareView } from './Compare.tsx';
import { addMonths } from '../../../shared/categories.ts';

type Mode = 'org' | 'month';

const MODES: { value: Mode; label: string }[] = [
  { value: 'org', label: 'Organisation vs organisation' },
  { value: 'month', label: 'Month vs month (combined)' },
];

export function MasterComparePage() {
  const orgs = useOrganisations();
  const [mode, setMode] = useState<Mode>('org');

  return (
    <>
      <header className="page-header">
        <h1>Compare</h1>
      </header>
      <div className="toolbar">
        <Toggle label="Comparison type" value={mode} options={MODES} onChange={setMode} />
      </div>
      {mode === 'org' ? orgs.length >= 2 ? <OrgVsOrg /> : <p className="muted">Comparing organisations needs at least two.</p> : <MonthVsMonth />}
    </>
  );
}

function OrgVsOrg() {
  const orgs = useOrganisations();
  const [a, setA] = useState(orgs[0]!.slug);
  const [b, setB] = useState(orgs[1]!.slug);
  const [period, setPeriod] = useState(lastMonths(3));
  const { data, error, loading } = useAsync(() => api.master.compareOrgs(a, b, period.from, period.to), [a, b, period.from, period.to]);

  return (
    <>
      <div className="compare-pickers card">
        <OrgSelect label="Compare" value={a} onChange={setA} />
        <span aria-hidden="true" className="vs">
          vs
        </span>
        <OrgSelect label="With" value={b} onChange={setB} />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {a === b && <p className="muted">Pick two different organisations to see a difference.</p>}
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && <CompareView data={data} />}
    </>
  );
}

function OrgSelect({ label, value, onChange }: { label: string; value: string; onChange: (slug: string) => void }) {
  const orgs = useOrganisations();
  const id = `org-select-${label}`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {orgs.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MonthVsMonth() {
  const thisMonth = currentMonthKey();
  const [a, setA] = useState(addMonths(thisMonth, -1));
  const [b, setB] = useState(thisMonth);
  const { data, error, loading } = useAsync(() => api.master.compareMonths(a, b), [a, b]);

  return (
    <>
      <div className="compare-pickers card">
        <div>
          <label htmlFor="mc-a">Compare</label>
          <MonthField id="mc-a" label="Compare" value={a} onChange={setA} />
        </div>
        <span aria-hidden="true" className="vs">
          vs
        </span>
        <div>
          <label htmlFor="mc-b">With</label>
          <MonthField id="mc-b" label="With" value={b} onChange={setB} />
        </div>
      </div>
      <Card title="About this comparison">
        <p className="muted">Both organisations added together for each month.</p>
      </Card>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && <CompareView data={data} />}
    </>
  );
}
