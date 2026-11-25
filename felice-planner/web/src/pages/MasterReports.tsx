import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CATEGORIES } from '../../../shared/categories.ts';
import type { GroupBy } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Card, ErrorBanner, Loading, PeriodPicker, Toggle } from '../components.tsx';
import { lastMonths, money, money0, moneyCompact, percent, useAsync } from '../lib.ts';
import { useOrganisations } from '../org.tsx';
import { HeadingLogos } from './MasterDashboard.tsx';
import { ResidentBookings, TopItems } from './Reports.tsx';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'month', label: 'By month' },
  { value: 'week', label: 'By week' },
];

export function MasterReportsPage() {
  const orgs = useOrganisations();
  const [period, setPeriod] = useState(lastMonths(12));
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const { data, error, loading } = useAsync(() => api.master.summary(period.from, period.to, groupBy), [period.from, period.to, groupBy]);

  const rows = data?.rows ?? [];
  const chartData = rows.map((r) => ({ label: r.label, ...r.byOrg }));

  return (
    <>
      <header className="page-header">
        <h1>
          Combined reports <HeadingLogos orgs={orgs} />
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </header>
      <div className="toolbar">
        <Toggle label="Group rows" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
        <a className="button" href={api.master.exportUrl(period.from, period.to, groupBy)} download>
          Export combined report to Excel
        </a>
      </div>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <Card title={`Spend ${groupBy === 'month' ? 'per month' : 'per week'}, by organisation`}>
            <figure aria-label="Stacked bar chart of spend by organisation. Figures are in the table below.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
                  <Tooltip formatter={(v) => money0(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {orgs.map((o) => (
                    <Bar key={o.slug} dataKey={o.slug} name={o.name} stackId="s" fill={o.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </figure>
          </Card>

          <Card title="Category by organisation">
            <div className="table-scroll">
              <table className="report">
                <caption className="sr-only">
                  Combined spend by category and organisation from {data.from} to {data.to}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    {orgs.map((o) => (
                      <th key={o.slug} scope="col" className="num">
                        {o.name}
                      </th>
                    ))}
                    <th scope="col" className="num">
                      Combined
                    </th>
                    <th scope="col" className="num">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((c) => (
                    <tr key={c.key}>
                      <th scope="row">{c.label}</th>
                      {orgs.map((o) => (
                        <td key={o.slug} className="num">
                          {data.totals.byOrg[o.slug]?.byCategory[c.key] ? money(data.totals.byOrg[o.slug]!.byCategory[c.key]) : '–'}
                        </td>
                      ))}
                      <td className="num strong">{money(data.totals.byCategory[c.key])}</td>
                      <td className="num muted">{data.totals.total ? percent(data.totals.byCategory[c.key] / data.totals.total) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {orgs.map((o) => (
                      <td key={o.slug} className="num">
                        {money(data.totals.byOrg[o.slug]?.total ?? 0)}
                      </td>
                    ))}
                    <td className="num">{money(data.totals.total)}</td>
                    <td className="num">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card title="Breakdown">
            <div className="table-scroll">
              <table className="report">
                <caption className="sr-only">
                  Combined spend by {groupBy} from {data.from} to {data.to}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{groupBy === 'month' ? 'Month' : 'Week'}</th>
                    <th scope="col" className="num">
                      Weeks
                    </th>
                    {orgs.map((o) => (
                      <th key={o.slug} scope="col" className="num">
                        {o.name}
                      </th>
                    ))}
                    {CATEGORIES.map((c) => (
                      <th key={c.key} scope="col" className="num">
                        {c.label}
                      </th>
                    ))}
                    <th scope="col" className="num">
                      Combined
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={orgs.length + CATEGORIES.length + 3} className="muted">
                        Nothing planned in this period.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.key} className={r.weeks === 0 ? 'empty-row' : undefined}>
                      <th scope="row">{r.label}</th>
                      <td className="num">{r.weeks}</td>
                      {orgs.map((o) => (
                        <td key={o.slug} className="num">
                          {r.byOrg[o.slug] ? money(r.byOrg[o.slug]!) : '–'}
                        </td>
                      ))}
                      {CATEGORIES.map((c) => (
                        <td key={c.key} className="num">
                          {r.byCategory[c.key] ? money(r.byCategory[c.key]) : '–'}
                        </td>
                      ))}
                      <td className="num strong">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td className="num">{data.totals.weeks}</td>
                    {orgs.map((o) => (
                      <td key={o.slug} className="num">
                        {money(data.totals.byOrg[o.slug]?.total ?? 0)}
                      </td>
                    ))}
                    {CATEGORIES.map((c) => (
                      <td key={c.key} className="num">
                        {money(data.totals.byCategory[c.key])}
                      </td>
                    ))}
                    <td className="num">{money(data.totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <TopItems from={period.from} to={period.to} load={(from, to, category) => api.master.top(from, to, category, 20)} />
          <ResidentBookings from={period.from} to={period.to} load={(from, to) => api.master.residentBookings(from, to)} />
        </>
      )}
    </>
  );
}
