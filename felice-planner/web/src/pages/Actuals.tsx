import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GroupBy } from '../../../shared/types.ts';
import { Card, ErrorBanner, Loading, PeriodPicker, Toggle } from '../components.tsx';
import { lastMonths, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';
import { GroupChart, GroupTable, NoActuals, PeriodChart, PeriodTable, VarianceKpis, VarianceNotes } from '../variance.tsx';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'month', label: 'By month' },
  { value: 'week', label: 'By week' },
];

/** Planned against actual spend for one organisation. */
export function ActualsPage() {
  const { api, path } = useOrg();
  const [period, setPeriod] = useState(lastMonths(12));
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const { data, error, loading } = useAsync(() => api.variance(period.from, period.to, groupBy), [period.from, period.to, groupBy]);

  return (
    <>
      <header className="page-header">
        <h1>
          Plan vs actual <OrgBadge />
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </header>
      <div className="toolbar">
        <Toggle label="Group rows" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
        <Link className="button" to={path('/data')}>
          Import this week's actuals
        </Link>
      </div>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && data.totals.weeksCompared === 0 && (
        <NoActuals>
          No actual expenditure has been imported for these months{data.totals.plannedAll > 0 ? ', although there is a plan' : ''}. At the end of each week, import
          that week's tab from the expense sheet on the <Link to={path('/data')}>Import &amp; export</Link> page.
        </NoActuals>
      )}
      {data && data.totals.weeksCompared > 0 && (
        <>
          <VarianceKpis totals={data.totals} />
          <VarianceNotes totals={data.totals} />
          <Card title={groupBy === 'month' ? 'Planned and actual per month' : 'Planned and actual per week'}>
            <PeriodChart rows={data.rows} />
            <PeriodTable rows={data.rows} label={groupBy === 'month' ? 'Month' : 'Week'} />
          </Card>
          <Card title="By cost group">
            <GroupChart totals={data.totals} />
            <GroupTable totals={data.totals} />
          </Card>
        </>
      )}
    </>
  );
}
