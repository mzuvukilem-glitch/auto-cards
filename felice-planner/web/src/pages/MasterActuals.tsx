import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GroupBy } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Card, ErrorBanner, Loading, PeriodPicker, Toggle } from '../components.tsx';
import { lastMonths, useAsync } from '../lib.ts';
import { useOrganisations } from '../org.tsx';
import { GroupChart, GroupTable, NoActuals, OrgChart, OrgTable, PeriodChart, PeriodTable, VarianceKpis, VarianceNotes } from '../variance.tsx';
import { HeadingLogos } from './MasterDashboard.tsx';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'month', label: 'By month' },
  { value: 'week', label: 'By week' },
];

/** Planned against actual spend for every organisation together. */
export function MasterActualsPage() {
  const orgs = useOrganisations();
  const [period, setPeriod] = useState(lastMonths(12));
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const { data, error, loading } = useAsync(() => api.master.variance(period.from, period.to, groupBy), [period.from, period.to, groupBy]);

  return (
    <>
      <header className="page-header">
        <h1>
          Plan vs actual <HeadingLogos orgs={orgs} />
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </header>
      <div className="toolbar">
        <Toggle label="Group rows" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
      </div>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && data.totals.weeksCompared === 0 && (
        <NoActuals>
          No actual expenditure has been imported for these months in any organisation. Import each week's tab from an organisation's{' '}
          <em>Import &amp; export</em> page:{' '}
          {orgs.map((o, i) => (
            <span key={o.slug}>
              {i > 0 && ', '}
              <Link to={`/o/${o.slug}/data`}>{o.name}</Link>
            </span>
          ))}
          .
        </NoActuals>
      )}
      {data && data.totals.weeksCompared > 0 && (
        <>
          <VarianceKpis totals={data.totals} />
          <VarianceNotes totals={data.totals} />
          <Card title="By organisation">
            <OrgChart totals={data.totals} orgs={orgs} />
            <OrgTable totals={data.totals} orgs={orgs} />
          </Card>
          <Card title={groupBy === 'month' ? 'Planned and actual per month (combined)' : 'Planned and actual per week (combined)'}>
            <PeriodChart rows={data.rows} />
            <PeriodTable rows={data.rows} label={groupBy === 'month' ? 'Month' : 'Week'} />
          </Card>
          <Card title="By cost group (combined)">
            <GroupChart totals={data.totals} />
            <GroupTable totals={data.totals} />
          </Card>
        </>
      )}
    </>
  );
}
