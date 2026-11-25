import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CATEGORIES } from '../../../shared/categories.ts';
import type { SummaryReport, TopEntry } from '../../../shared/types.ts';
import { Card, ErrorBanner, Kpi, Loading, PeriodPicker } from '../components.tsx';
import { lastMonths, money, money0, moneyCompact, percent, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';
import { PlanVsActualCard } from '../variance.tsx';

const tooltipMoney = (value: unknown) => money0(Number(value));

export function DashboardPage() {
  const { api, path } = useOrg();
  const [period, setPeriod] = useState(lastMonths(12));
  const { data, error, loading } = useAsync(async () => {
    const [months, weeks, acts, hosts, variance] = await Promise.all([
      api.summary(period.from, period.to, 'month'),
      api.summary(period.from, period.to, 'week'),
      api.top(period.from, period.to, 'headline', 10),
      api.top(period.from, period.to, 'hosts', 10),
      api.variance(period.from, period.to, 'month'),
    ]);
    return { months, weeks, acts, hosts, variance };
  }, [period.from, period.to]);

  return (
    <>
      <header className="page-header">
        <h1>
          Dashboard <OrgBadge />
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </header>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && data.months.totals.weeks === 0 && (
        <Card title="No data in this period">
          <p>
            Nothing is planned between these months. Add a week in the <Link to={path('/planner')}>weekly planner</Link> or{' '}
            <Link to={path('/data')}>import a spreadsheet</Link>.
          </p>
        </Card>
      )}
      {data && data.months.totals.weeks > 0 && (
        <>
          <PlanVsActualCard report={data.variance} reportPath={path('/actuals')} importLinks={[{ to: path('/data'), label: 'Import & export' }]} />
          <DashboardBody {...data} />
        </>
      )}
    </>
  );
}

function DashboardBody({
  months,
  weeks,
  acts,
  hosts,
}: {
  months: SummaryReport;
  weeks: SummaryReport;
  acts: TopEntry[];
  hosts: TopEntry[];
}) {
  const { total, weeks: weekCount, byCategory } = months.totals;
  const activeMonths = months.rows.filter((r) => r.weeks > 0);
  const busiest = activeMonths.reduce((best, r) => (r.total > best.total ? r : best), activeMonths[0]!);
  const biggestCat = CATEGORIES.reduce((best, c) => (byCategory[c.key] > byCategory[best.key] ? c : best), CATEGORIES[0]);

  const monthData = months.rows.map((r) => ({ label: r.label, ...r.byCategory }));
  const weekData = weeks.rows.map((r) => ({ label: r.label, total: r.total }));
  const pieData = CATEGORIES.filter((c) => byCategory[c.key] > 0).map((c) => ({ name: c.label, value: byCategory[c.key], color: c.color }));

  return (
    <>
      <div className="kpis">
        <Kpi label="Total spend" value={money0(total)} hint={`${weekCount} weeks planned`} />
        <Kpi label="Average per week" value={money0(total / weekCount)} />
        <Kpi label="Average per active month" value={money0(total / activeMonths.length)} hint={`${activeMonths.length} months with events`} />
        <Kpi label="Busiest month" value={busiest.label} hint={money0(busiest.total)} />
        <Kpi label="Largest cost" value={biggestCat.label} hint={`${percent(byCategory[biggestCat.key] / total)} of spend`} />
      </div>

      <div className="grid-2">
        <Card title="Monthly spend by category">
          <figure aria-label="Stacked bar chart of monthly spend by category. The same figures are in Reports.">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
                <Tooltip formatter={tooltipMoney} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {CATEGORIES.map((c) => (
                  <Bar key={c.key} dataKey={c.key} name={c.label} stackId="spend" fill={c.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </figure>
        </Card>

        <Card title="Category split">
          <figure aria-label="Pie chart of spend by category">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={1}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipMoney} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </figure>
        </Card>
      </div>

      <Card title="Weekly totals">
        <figure aria-label="Line chart of total spend per week">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={weekData} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
              <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
              <Tooltip formatter={tooltipMoney} />
              <Line type="monotone" dataKey="total" name="Week total" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </figure>
      </Card>

      <div className="grid-2">
        <TopTable title="Top headline acts" entries={acts} countLabel="Bookings" />
        <TopTable title="Top hosts & promoters" entries={hosts} countLabel="Weeks" />
      </div>
    </>
  );
}

export function TopTable({ title, entries, countLabel }: { title: string; entries: TopEntry[]; countLabel: string }) {
  return (
    <Card title={title}>
      {entries.length === 0 ? (
        <p className="muted">None in this period.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="num">
                {countLabel}
              </th>
              <th scope="col" className="num">
                Rate
              </th>
              <th scope="col" className="num">
                Rider
              </th>
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name}>
                <td>{e.name}</td>
                <td className="num">{e.count}</td>
                <td className="num">{money(e.total)}</td>
                <td className="num">{money(e.riderTotal)}</td>
                <td className="num strong">{money(e.total + e.riderTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
