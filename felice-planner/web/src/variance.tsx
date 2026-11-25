import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { VARIANCE_GROUPS } from '../../shared/categories.ts';
import type { Organisation, PlanActual, VarianceReport, VarianceRow, VarianceTotals } from '../../shared/types.ts';
import { Card, Kpi } from './components.tsx';
import { money, money0, moneyCompact } from './lib.ts';

const PLANNED_COLOR = '#94a3b8';
const ACTUAL_COLOR = '#4338ca';
const tooltipMoney = (value: unknown) => money0(Number(value));

/** Actual minus planned, so a positive figure is an overspend. */
export const gap = (p: PlanActual) => Math.round((p.actual - p.planned) * 100) / 100;
const signed = (n: number) => (n > 0 ? `+${money(n)}` : money(n));

type Standing = 'over' | 'under' | 'on';
const standing = (diff: number): Standing => (diff > 0.005 ? 'over' : diff < -0.005 ? 'under' : 'on');
const STANDING_WORDS: Record<Standing, string> = { over: 'over plan', under: 'under plan', on: 'on plan' };

/** Variance with its direction written out, so it never relies on colour alone. */
export function Var({ planned, actual }: PlanActual) {
  const diff = gap({ planned, actual });
  const s = standing(diff);
  if (s === 'on') return <span className="muted">on plan</span>;
  const pct = planned > 0 ? `${(Math.abs(diff / planned) * 100).toFixed(1)}%` : null;
  return (
    <span className={`varcell ${s === 'over' ? 'up' : 'down'}`}>
      {s === 'over' ? '▲' : '▼'} {signed(diff)}
      <small>{pct ? `${pct} ${STANDING_WORDS[s]}` : `${STANDING_WORDS[s]} (nothing planned)`}</small>
    </span>
  );
}

/** The headline figures of a planned-vs-actual period. */
export function VarianceKpis({ totals }: { totals: VarianceTotals }) {
  const diff = gap(totals);
  const s = standing(diff);
  const pct = totals.planned > 0 ? `${(Math.abs(diff / totals.planned) * 100).toFixed(1)}% ${STANDING_WORDS[s]}` : STANDING_WORDS[s];
  const weeks = `${totals.weeksCompared} week${totals.weeksCompared === 1 ? '' : 's'} compared`;
  return (
    <div className="kpis">
      <Kpi label="Planned" value={money0(totals.planned)} hint={`${weeks}. The whole plan for the period is ${money0(totals.plannedAll)}.`} />
      <Kpi label="Actual" value={money0(totals.actual)} hint={`${money0(totals.paid)} paid, ${money0(totals.actual - totals.paid)} outstanding`} />
      <Kpi
        label="Variance (actual minus planned)"
        value={s === 'on' ? 'On plan' : signed(diff)}
        hint={s === 'on' ? undefined : pct}
        tone={s === 'over' ? 'over' : s === 'under' ? 'under' : undefined}
      />
    </div>
  );
}

/** Notes that explain what is, and is not, being compared. */
export function VarianceNotes({ totals }: { totals: VarianceTotals }) {
  return (
    <p className="muted small">
      Only weeks that have actual expenditure are compared, so a week that has not happened yet never looks under plan. Variance is
      actual minus planned: a positive figure is an overspend.
      {totals.weeksUnplanned > 0 &&
        ` ${totals.weeksUnplanned} compared week${totals.weeksUnplanned === 1 ? ' has' : 's have'} no plan, so ${totals.weeksUnplanned === 1 ? 'its' : 'their'} plan counts as R0.`}
    </p>
  );
}

/** Planned and actual for each period, side by side. */
export function PeriodChart({ rows }: { rows: VarianceRow[] }) {
  const data = rows.filter((r) => r.weeksCompared > 0).map((r) => ({ label: r.label, Planned: r.planned, Actual: r.actual }));
  if (data.length === 0) return null;
  return (
    <figure aria-label="Bar chart of planned and actual spend for each period. The same figures are in the table.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
          <Tooltip formatter={tooltipMoney} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Planned" fill={PLANNED_COLOR} />
          <Bar dataKey="Actual" fill={ACTUAL_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Planned and actual for each cost group over the whole period. */
export function GroupChart({ totals }: { totals: VarianceTotals }) {
  const data = VARIANCE_GROUPS.map((g) => ({ label: g.label, Planned: totals.byGroup[g.key].planned, Actual: totals.byGroup[g.key].actual }));
  return (
    <figure aria-label="Bar chart of planned and actual spend for each cost group. The same figures are in the table.">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
          <Tooltip formatter={tooltipMoney} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Planned" fill={PLANNED_COLOR} />
          <Bar dataKey="Actual" fill={ACTUAL_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Each cost group: planned, actual, variance. */
export function GroupTable({ totals }: { totals: VarianceTotals }) {
  return (
    <div className="table-scroll">
      <table className="report">
        <caption className="sr-only">Planned and actual spend by cost group</caption>
        <thead>
          <tr>
            <th scope="col">Cost group</th>
            <th scope="col" className="num">
              Planned
            </th>
            <th scope="col" className="num">
              Actual
            </th>
            <th scope="col" className="num">
              Variance
            </th>
          </tr>
        </thead>
        <tbody>
          {VARIANCE_GROUPS.map((g) => {
            const v = totals.byGroup[g.key];
            return (
              <tr key={g.key}>
                <th scope="row">{g.label}</th>
                <td className="num">{money(v.planned)}</td>
                <td className="num">{money(v.actual)}</td>
                <td className="num">{v.planned === 0 && v.actual === 0 ? '–' : <Var {...v} />}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="num">{money(totals.planned)}</td>
            <td className="num">{money(totals.actual)}</td>
            <td className="num">
              <Var planned={totals.planned} actual={totals.actual} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** One row per period: how many weeks were compared, planned, actual, variance. */
export function PeriodTable({ rows, label }: { rows: VarianceRow[]; label: string }) {
  return (
    <div className="table-scroll">
      <table className="report">
        <caption className="sr-only">Planned and actual spend by {label.toLowerCase()}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col" className="num">
              Weeks compared
            </th>
            <th scope="col" className="num">
              Planned
            </th>
            <th scope="col" className="num">
              Actual
            </th>
            <th scope="col" className="num">
              Variance
            </th>
            <th scope="col" className="num">
              Whole plan for the period
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Nothing in this period.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const compared = r.weeksCompared > 0;
            return (
              <tr key={r.key} className={compared || r.plannedAll > 0 ? undefined : 'empty-row'}>
                <th scope="row">{r.label}</th>
                <td className="num">{r.weeksCompared}</td>
                <td className="num">{compared ? money(r.planned) : '–'}</td>
                <td className="num">{compared ? money(r.actual) : '–'}</td>
                <td className="num">{compared ? <Var planned={r.planned} actual={r.actual} /> : <span className="muted">no actuals yet</span>}</td>
                <td className="num muted">{r.plannedAll ? money(r.plannedAll) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Each organisation's planned, actual and variance (for the combined view). */
export function OrgTable({ totals, orgs }: { totals: VarianceTotals; orgs: Organisation[] }) {
  return (
    <div className="table-scroll">
      <table className="report">
        <caption className="sr-only">Planned and actual spend by organisation</caption>
        <thead>
          <tr>
            <th scope="col">Organisation</th>
            <th scope="col" className="num">
              Planned
            </th>
            <th scope="col" className="num">
              Actual
            </th>
            <th scope="col" className="num">
              Variance
            </th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const v = totals.byOrg[o.slug] ?? { planned: 0, actual: 0 };
            const has = v.planned > 0 || v.actual > 0;
            return (
              <tr key={o.slug}>
                <th scope="row">{o.name}</th>
                <td className="num">{has ? money(v.planned) : '–'}</td>
                <td className="num">{has ? money(v.actual) : '–'}</td>
                <td className="num">{has ? <Var {...v} /> : <span className="muted">no actuals yet</span>}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Combined</th>
            <td className="num">{money(totals.planned)}</td>
            <td className="num">{money(totals.actual)}</td>
            <td className="num">
              <Var planned={totals.planned} actual={totals.actual} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Planned and actual for each organisation, as bars. */
export function OrgChart({ totals, orgs }: { totals: VarianceTotals; orgs: Organisation[] }) {
  const data = orgs.map((o) => ({ label: o.name, Planned: totals.byOrg[o.slug]?.planned ?? 0, Actual: totals.byOrg[o.slug]?.actual ?? 0 }));
  return (
    <figure aria-label="Bar chart of planned and actual spend for each organisation. The same figures are in the table.">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={12} />
          <YAxis tickFormatter={moneyCompact} fontSize={12} width={56} />
          <Tooltip formatter={tooltipMoney} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Planned" fill={PLANNED_COLOR} />
          <Bar dataKey="Actual" fill={ACTUAL_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}

/**
 * A short planned-vs-actual summary for a dashboard: the headline figures and the chart, with a link to the
 * full report. When nothing has been imported yet it says how to start instead.
 */
export function PlanVsActualCard({
  report,
  reportPath,
  importLinks,
  orgs,
}: {
  report: VarianceReport;
  reportPath: string;
  /** Where to import actuals: one link for an organisation, one per organisation for the master view. */
  importLinks: { to: string; label: string }[];
  /** Pass the organisations in the combined view to show each one's plan and actual. */
  orgs?: Organisation[];
}) {
  const t = report.totals;
  return (
    <Card title="Plan vs actual" actions={<Link to={reportPath}>Full report</Link>}>
      {t.weeksCompared === 0 ? (
        <p>
          No actual expenditure has been imported for this period yet. At the end of each week, import that week's tab:{' '}
          {importLinks.map((l, i) => (
            <span key={l.to}>
              {i > 0 && ', '}
              <Link to={l.to}>{l.label}</Link>
            </span>
          ))}
          .
        </p>
      ) : (
        <>
          <VarianceKpis totals={t} />
          <PeriodChart rows={report.rows} />
          {orgs && <OrgTable totals={t} orgs={orgs} />}
        </>
      )}
    </Card>
  );
}

/** Shown when nothing in the period has actuals yet. */
export function NoActuals({ children }: { children: React.ReactNode }) {
  return (
    <Card title="No actual expenditure in this period">
      <p>{children}</p>
    </Card>
  );
}
