import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CATEGORIES } from '../../../shared/categories.ts';
import type { Organisation, SummaryReport, TopEntry } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { Card, ErrorBanner, Kpi, Loading, PeriodPicker } from '../components.tsx';
import { lastMonths, money, money0, moneyCompact, percent, useAsync } from '../lib.ts';
import { OrgLogo } from '../logos.tsx';
import { PlanVsActualCard } from '../variance.tsx';
import { useOrganisations } from '../org.tsx';
import { TopTable } from './Dashboard.tsx';

const tooltipMoney = (value: unknown) => money0(Number(value));

export function MasterDashboardPage() {
  const orgs = useOrganisations();
  const [period, setPeriod] = useState(lastMonths(12));
  const { data, error, loading } = useAsync(async () => {
    const [months, weeks, acts, hosts, variance] = await Promise.all([
      api.master.summary(period.from, period.to, 'month'),
      api.master.summary(period.from, period.to, 'week'),
      api.master.top(period.from, period.to, 'headline', 10),
      api.master.top(period.from, period.to, 'hosts', 10),
      api.master.variance(period.from, period.to, 'month'),
    ]);
    return { months, weeks, acts, hosts, variance };
  }, [period.from, period.to]);

  return (
    <>
      <header className="page-header">
        <h1>
          Master dashboard <HeadingLogos orgs={orgs} />
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </header>
      <ErrorBanner message={error} />
      {loading && !data && <Loading />}
      {data && data.months.totals.weeks === 0 && (
        <Card title="No data in this period">
          <p>
            Nothing is planned in any organisation between these months. Open an organisation to add weeks:{' '}
            {orgs.map((o, i) => (
              <span key={o.slug}>
                {i > 0 && ', '}
                <Link to={`/o/${o.slug}/planner`}>{o.name}</Link>
              </span>
            ))}
            .
          </p>
        </Card>
      )}
      {data && data.months.totals.weeks > 0 && (
        <>
          <PlanVsActualCard
            report={data.variance}
            reportPath="/master/actuals"
            importLinks={orgs.map((o) => ({ to: `/o/${o.slug}/data`, label: o.name }))}
            orgs={orgs}
          />
          <MasterBody orgs={orgs} {...data} />
        </>
      )}
    </>
  );
}

/** Every organisation's logo, shown next to a combined heading. */
export function HeadingLogos({ orgs }: { orgs: Organisation[] }) {
  return (
    <span className="org-badge heading-logos">
      {orgs.map((o) => (
        <OrgLogo key={o.slug} slug={o.slug} name={o.name} height={30} />
      ))}
    </span>
  );
}

function MasterBody({
  orgs,
  months,
  weeks,
  acts,
  hosts,
}: {
  orgs: Organisation[];
  months: SummaryReport;
  weeks: SummaryReport;
  acts: TopEntry[];
  hosts: TopEntry[];
}) {
  const { total, weeks: weekCount, byCategory } = months.totals;
  const activeMonths = months.rows.filter((r) => r.weeks > 0);
  const busiest = activeMonths.reduce((best, r) => (r.total > best.total ? r : best), activeMonths[0]!);

  const orgMonthData = months.rows.map((r) => ({ label: r.label, ...r.byOrg }));
  const categoryMonthData = months.rows.map((r) => ({ label: r.label, ...r.byCategory }));
  const weekData = weeks.rows.map((r) => ({ label: r.label, ...r.byOrg, combined: r.total }));

  return (
    <>
      <div className="kpis">
        <Kpi label="Combined spend" value={money0(total)} hint={`${weekCount} weeks planned across ${orgs.length} organisations`} />
        {orgs.map((o) => {
          const t = months.totals.byOrg[o.slug];
          return (
            <div key={o.slug} className="kpi org-kpi" style={{ borderTopColor: o.color }}>
              <div className="kpi-label">{o.name}</div>
              <div className="kpi-value">{money0(t?.total ?? 0)}</div>
              <div className="kpi-hint">
                {total ? percent((t?.total ?? 0) / total) : '0.0%'} of combined · {t?.weeks ?? 0} weeks
              </div>
            </div>
          );
        })}
        <Kpi label="Busiest month" value={busiest.label} hint={`${money0(busiest.total)} combined`} />
        <Kpi label="Average per active month" value={money0(total / activeMonths.length)} hint={`${activeMonths.length} months with events`} />
      </div>

      <div className="grid-2">
        <Card title="Monthly spend by organisation">
          <figure aria-label="Stacked bar chart of monthly spend for each organisation. The same figures are in Combined reports.">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={orgMonthData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
                <Tooltip formatter={tooltipMoney} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {orgs.map((o) => (
                  <Bar key={o.slug} dataKey={o.slug} name={o.name} stackId="orgs" fill={o.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </figure>
        </Card>

        <Card title="Monthly spend by category (combined)">
          <figure aria-label="Stacked bar chart of combined monthly spend by category">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={categoryMonthData} margin={{ left: 8, right: 8 }}>
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
      </div>

      <Card title="Weekly totals">
        <figure aria-label="Line chart of weekly spend for each organisation and combined">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={weekData} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} interval="preserveStartEnd" />
              <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
              <Tooltip formatter={tooltipMoney} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {orgs.map((o) => (
                <Line key={o.slug} type="monotone" dataKey={o.slug} name={o.name} stroke={o.color} strokeWidth={2} dot={{ r: 3 }} />
              ))}
              <Line type="monotone" dataKey="combined" name="Combined" stroke="#475569" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </figure>
      </Card>

      <Card title="By organisation">
        <div className="table-scroll">
          <table className="report">
            <thead>
              <tr>
                <th scope="col">Organisation</th>
                <th scope="col" className="num">
                  Weeks
                </th>
                <th scope="col" className="num">
                  Total
                </th>
                <th scope="col" className="num">
                  Average per week
                </th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col">Largest cost</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const t = months.totals.byOrg[o.slug];
                const largest = t ? CATEGORIES.reduce((best, c) => (t.byCategory[c.key] > t.byCategory[best.key] ? c : best), CATEGORIES[0]) : null;
                return (
                  <tr key={o.slug}>
                    <th scope="row">
                      <Link to={`/o/${o.slug}`}>{o.name}</Link>
                    </th>
                    <td className="num">{t?.weeks ?? 0}</td>
                    <td className="num">{money(t?.total ?? 0)}</td>
                    <td className="num">{t?.weeks ? money(t.total / t.weeks) : '–'}</td>
                    <td className="num">{total ? percent((t?.total ?? 0) / total) : '–'}</td>
                    <td>{t && t.total > 0 && largest ? `${largest.label} (${money0(t.byCategory[largest.key])})` : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Combined</th>
                <td className="num">{weekCount}</td>
                <td className="num">{money(total)}</td>
                <td className="num">{money(total / weekCount)}</td>
                <td className="num">100%</td>
                <td>
                  {(() => {
                    const c = CATEGORIES.reduce((best, x) => (byCategory[x.key] > byCategory[best.key] ? x : best), CATEGORIES[0]);
                    return `${c.label} (${money0(byCategory[c.key])})`;
                  })()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="grid-2">
        <TopTable title="Top headline acts (combined)" entries={acts} countLabel="Bookings" />
        <TopTable title="Top hosts & promoters (combined)" entries={hosts} countLabel="Weeks" />
      </div>
    </>
  );
}
