import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CATEGORIES, type CategoryKey } from '../../../shared/categories.ts';
import type { GroupBy, ResidentBookingsReport, TopEntry } from '../../../shared/types.ts';
import { Card, ErrorBanner, Loading, PeriodPicker, Toggle } from '../components.tsx';
import { lastMonths, money, money0, moneyCompact, percent, useAsync } from '../lib.ts';
import { OrgBadge, useOrg } from '../org.tsx';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'month', label: 'By month' },
  { value: 'week', label: 'By week' },
];

export function ReportsPage() {
  const { api, path } = useOrg();
  const [period, setPeriod] = useState(lastMonths(12));
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const { data, error, loading } = useAsync(() => api.summary(period.from, period.to, groupBy), [period.from, period.to, groupBy]);

  const rows = data?.rows ?? [];
  const chartData = rows.map((r) => ({ label: r.label, ...r.byCategory }));

  return (
    <>
      <header className="page-header">
        <h1>
          Reports <OrgBadge />
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </header>
      <div className="toolbar">
        <Toggle label="Group rows" value={groupBy} options={GROUP_OPTIONS} onChange={setGroupBy} />
        <a className="button" href={api.exportUrl(period.from, period.to, groupBy)} download>
          Export to Excel
        </a>
      </div>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <Card title={`Spend ${groupBy === 'month' ? 'per month' : 'per week'}`}>
            <figure aria-label="Stacked bar chart of spend by category. Figures are in the table below.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
                  <Tooltip formatter={(v) => money0(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {CATEGORIES.map((c) => (
                    <Bar key={c.key} dataKey={c.key} name={c.label} stackId="s" fill={c.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </figure>
          </Card>

          <Card title="Breakdown">
            <div className="table-scroll">
              <table className="report">
                <caption className="sr-only">
                  Spend by category from {data.from} to {data.to}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{groupBy === 'month' ? 'Month' : 'Week'}</th>
                    {groupBy === 'month' && (
                      <th scope="col" className="num">
                        Weeks
                      </th>
                    )}
                    {CATEGORIES.map((c) => (
                      <th key={c.key} scope="col" className="num">
                        {c.label}
                      </th>
                    ))}
                    <th scope="col" className="num">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={CATEGORIES.length + 3} className="muted">
                        Nothing planned in this period.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.key} className={r.weeks === 0 ? 'empty-row' : undefined}>
                      <th scope="row">{r.weekId ? <Link to={path(`/planner/${r.weekId}`)}>{r.label}</Link> : r.label}</th>
                      {groupBy === 'month' && <td className="num">{r.weeks}</td>}
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
                    {groupBy === 'month' && <td className="num">{data.totals.weeks}</td>}
                    {CATEGORIES.map((c) => (
                      <td key={c.key} className="num">
                        {money(data.totals.byCategory[c.key])}
                      </td>
                    ))}
                    <td className="num">{money(data.totals.total)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Share</th>
                    {groupBy === 'month' && <td />}
                    {CATEGORIES.map((c) => (
                      <td key={c.key} className="num muted">
                        {data.totals.total ? percent(data.totals.byCategory[c.key] / data.totals.total) : '–'}
                      </td>
                    ))}
                    <td className="num muted">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <TopItems from={period.from} to={period.to} load={(from, to, category) => api.top(from, to, category, 20)} />
          <ResidentBookings from={period.from} to={period.to} load={(from, to) => api.residentBookings(from, to)} />
        </>
      )}
    </>
  );
}

/**
 * How many times each resident DJ was booked in each month. A booking is one week a DJ is on.
 * `load` decides whether it is one organisation or all of them.
 */
export function ResidentBookings({
  from,
  to,
  load,
}: {
  from: string;
  to: string;
  load: (from: string, to: string) => Promise<ResidentBookingsReport>;
}) {
  const { data, error } = useAsync(() => load(from, to), [from, to]);

  return (
    <Card title="Resident DJ bookings per month">
      <p className="muted">
        How many times each resident DJ was booked in each month. One booking is one week a DJ is on. Individual DJs only: a lump-sum Resident DJs
        line has no names to count.
      </p>
      <ErrorBanner message={error} />
      {data && data.rows.length === 0 && <p className="muted">No resident DJs were booked in this period.</p>}
      {data && data.rows.length > 0 && (
        <div className="table-scroll">
          <table className="report">
            <caption className="sr-only">
              Resident DJ bookings per month from {data.from} to {data.to}
            </caption>
            <thead>
              <tr>
                <th scope="col">DJ</th>
                {data.months.map((m) => (
                  <th key={m.key} scope="col" className="num">
                    {m.label}
                  </th>
                ))}
                <th scope="col" className="num">
                  Bookings
                </th>
                <th scope="col" className="num">
                  Rates
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.name.toLowerCase()}>
                  <th scope="row">{r.name}</th>
                  {data.months.map((m) => (
                    <td key={m.key} className="num">
                      {r.byMonth[m.key]?.bookings ?? '–'}
                    </td>
                  ))}
                  <td className="num strong">{r.bookings}</td>
                  <td className="num">{money(r.paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {data.months.map((m) => (
                  <td key={m.key} className="num">
                    {data.totals.byMonth[m.key]?.bookings ?? '–'}
                  </td>
                ))}
                <td className="num">{data.totals.bookings}</td>
                <td className="num">{money(data.totals.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Top spend by name for one category. `load` decides whether it is one organisation or all of them. */
export function TopItems({
  from,
  to,
  load,
}: {
  from: string;
  to: string;
  load: (from: string, to: string, category: CategoryKey) => Promise<TopEntry[]>;
}) {
  const [category, setCategory] = useState<CategoryKey>('headline');
  const { data, error } = useAsync(() => load(from, to, category), [from, to, category]);

  return (
    <Card
      title="Top spend by name"
      actions={
        <div>
          <label htmlFor="top-category" className="sr-only">
            Category
          </label>
          <select id="top-category" value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <ErrorBanner message={error} />
      {data && data.length === 0 && <p className="muted">Nothing in this category for the period.</p>}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Name</th>
              <th scope="col" className="num">
                Times
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
              <th scope="col" className="num">
                Average
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((e, i) => (
              <tr key={e.name}>
                <td>{i + 1}</td>
                <td>{e.name}</td>
                <td className="num">{e.count}</td>
                <td className="num">{money(e.total)}</td>
                <td className="num">{money(e.riderTotal)}</td>
                <td className="num strong">{money(e.total + e.riderTotal)}</td>
                <td className="num">{money((e.total + e.riderTotal) / e.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
