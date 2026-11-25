import type { DatabaseSync } from 'node:sqlite';
import {
  CATEGORY_KEYS,
  emptyByCategory,
  emptyByGroup,
  groupTotals,
  monthKey,
  monthLabel,
  monthRange,
  parseMonthKey,
  VARIANCE_GROUP_KEYS,
  weekLabel,
  type CategoryKey,
  type VarianceGroupKey,
} from '../../shared/categories.ts';
import type {
  ActualWeekSummary,
  ByCategory,
  CompareReport,
  CompareSide,
  GroupBy,
  Organisation,
  OrgTotals,
  PlanActual,
  ResidentBookingRow,
  ResidentBookingsReport,
  SummaryReport,
  SummaryRow,
  TopEntry,
  VarianceReport,
  VarianceRow,
  WeekSummary,
} from '../../shared/types.ts';
import { COUNTED_ITEM } from './db.ts';
import type { Repo } from './repo.ts';

type Row = Record<string, unknown>;
type Month = { key: string; ym: number; year: number; month: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

function addInto(target: ByCategory, source: ByCategory) {
  for (const k of CATEGORY_KEYS) target[k] += source[k];
}

function roundAll(by: ByCategory): ByCategory {
  for (const k of CATEGORY_KEYS) by[k] = round2(by[k]);
  return by;
}

function rollUp(weeks: WeekSummary[]): OrgTotals {
  const byCategory = emptyByCategory();
  let total = 0;
  for (const w of weeks) {
    addInto(byCategory, w.byCategory);
    total += w.total;
  }
  return { byCategory: roundAll(byCategory), total: round2(total), weeks: weeks.length };
}

export type Reports = ReturnType<typeof createReports>;

/**
 * Reports over the organisations in `scope`. One organisation gives that company's reports;
 * several give the combined (master) reports, with a per-organisation breakdown.
 */
export function createReports(db: DatabaseSync, repo: Repo, scope: readonly Organisation[]) {
  if (scope.length === 0) throw new Error('Reports need at least one organisation');
  const ids = scope.map((o) => o.id);
  const inOrgs = `(${ids.map(() => '?').join(',')})`;
  const slugOf = new Map(scope.map((o) => [o.id, o.slug]));
  const nameOf = new Map(scope.map((o) => [o.id, o.name]));

  const q = {
    top: db.prepare(`
      SELECT MIN(i.name) AS name, SUM(i.amount_cents) AS cents, SUM(i.rider_cents) AS rider_cents, COUNT(*) AS n
      FROM items i JOIN weeks w ON w.id = i.week_id
      WHERE i.category = ? AND w.org_id IN ${inOrgs} AND (w.year * 100 + w.month) BETWEEN ? AND ? AND ${COUNTED_ITEM}
      GROUP BY lower(trim(i.name))
      ORDER BY SUM(i.amount_cents + i.rider_cents) DESC
      LIMIT ?`),
    headliners: db.prepare(`
      SELECT i.name, i.amount_cents, i.rider_cents, w.year, w.month, w.week_no
      FROM items i JOIN weeks w ON w.id = i.week_id
      WHERE i.category = 'headline' AND w.org_id IN ${inOrgs} AND (w.year * 100 + w.month) BETWEEN ? AND ?
      ORDER BY w.year, w.month, w.week_no, i.sort, i.id`),
    headlinersInWeek: db.prepare(`
      SELECT i.name, i.amount_cents, i.rider_cents, w.year, w.month, w.week_no
      FROM items i JOIN weeks w ON w.id = i.week_id
      WHERE i.category = 'headline' AND w.id = ? AND w.org_id IN ${inOrgs}
      ORDER BY i.sort, i.id`),
    lineItems: db.prepare(`
      SELECT w.org_id, w.year, w.month, w.week_no, i.category, i.name, i.amount_cents, i.rider_cents, i.notes, i.dj
      FROM items i JOIN weeks w ON w.id = i.week_id
      WHERE w.org_id IN ${inOrgs} AND (w.year * 100 + w.month) BETWEEN ? AND ? AND ${COUNTED_ITEM}
      ORDER BY w.org_id, w.year, w.month, w.week_no, i.category, i.sort, i.id`),
    bookings: db.prepare(`
      SELECT MIN(i.name) AS name, lower(trim(i.name)) AS who, w.year, w.month, COUNT(*) AS n, SUM(i.amount_cents) AS cents
      FROM items i JOIN weeks w ON w.id = i.week_id
      WHERE i.category = 'resident' AND i.dj = 1 AND w.org_id IN ${inOrgs} AND (w.year * 100 + w.month) BETWEEN ? AND ?
      GROUP BY lower(trim(i.name)), w.year, w.month`),
  };

  const toHeadliners = (rows: Row[]) =>
    rows.map((r) => ({
      name: String(r.name),
      amount: Number(r.amount_cents) / 100,
      riderCost: Number(r.rider_cents) / 100,
      week: weekLabel(Number(r.year), Number(r.month), Number(r.week_no), true),
    }));

  /** Total per organisation, with every organisation in scope present (even if it has nothing). */
  function byOrgTotal(weeks: WeekSummary[]): Record<string, number> {
    const out: Record<string, number> = Object.fromEntries(scope.map((o) => [o.slug, 0]));
    for (const w of weeks) {
      const slug = slugOf.get(w.orgId);
      if (slug) out[slug]! += w.total;
    }
    for (const k of Object.keys(out)) out[k] = round2(out[k]!);
    return out;
  }

  function byOrgDetail(weeks: WeekSummary[]): Record<string, OrgTotals> {
    return Object.fromEntries(scope.map((o) => [o.slug, rollUp(weeks.filter((w) => w.orgId === o.id))]));
  }

  function summary(from: Month, to: Month, groupBy: GroupBy): SummaryReport {
    const weeks = repo.weekSummaries(from.ym, to.ym);
    let rows: SummaryRow[];

    if (groupBy === 'week') {
      // The same week number in different organisations is shown as one row in the combined view.
      const groups = new Map<string, WeekSummary[]>();
      for (const w of weeks) {
        const key = `${monthKey(w.year, w.month)}-W${w.weekNo}`;
        groups.set(key, [...(groups.get(key) ?? []), w]);
      }
      rows = [...groups].map(([key, list]) => {
        const first = list[0]!;
        const r = rollUp(list);
        return {
          key,
          label: weekLabel(first.year, first.month, first.weekNo, true),
          year: first.year,
          month: first.month,
          weekNo: first.weekNo,
          weekId: scope.length === 1 ? first.id : null,
          weeks: list.length,
          byCategory: r.byCategory,
          total: r.total,
          byOrg: byOrgTotal(list),
        };
      });
    } else {
      // One row per month in the period, including months with nothing planned.
      rows = monthRange(from.key, to.key).map((key) => {
        const { year, month } = parseMonthKey(key)!;
        const inMonth = weeks.filter((w) => w.year === year && w.month === month);
        const r = rollUp(inMonth);
        return {
          key,
          label: monthLabel(year, month, true),
          year,
          month,
          weekNo: null,
          weekId: null,
          weeks: r.weeks,
          byCategory: r.byCategory,
          total: r.total,
          byOrg: byOrgTotal(inMonth),
        };
      });
    }

    const all = rollUp(weeks);
    return { from: from.key, to: to.key, groupBy, rows, totals: { ...all, byOrg: byOrgDetail(weeks) } };
  }

  function top(from: Month, to: Month, category: CategoryKey, limit: number): TopEntry[] {
    return (q.top.all(category, ...ids, from.ym, to.ym, limit) as Row[]).map((r) => ({
      name: String(r.name),
      total: Number(r.cents) / 100,
      riderTotal: Number(r.rider_cents) / 100,
      count: Number(r.n),
    }));
  }

  function monthSide(m: Month): CompareSide {
    return periodSide(m, m, monthLabel(m.year, m.month), m.key);
  }

  /** Everything in scope between two months, as one side of a comparison. */
  function periodSide(from: Month, to: Month, label: string, key: string): CompareSide {
    const r = rollUp(repo.weekSummaries(from.ym, to.ym));
    return {
      key,
      label,
      weeks: r.weeks,
      byCategory: r.byCategory,
      total: r.total,
      headliners: toHeadliners(q.headliners.all(...ids, from.ym, to.ym) as Row[]),
    };
  }

  function weekSide(weekId: number): CompareSide {
    const week = repo.getWeek(weekId);
    const ym = week.year * 100 + week.month;
    const summaryRow = repo.weekSummaries(ym, ym).find((w) => w.id === weekId)!; // getWeek has just found the week
    return {
      key: String(weekId),
      label: weekLabel(week.year, week.month, week.weekNo),
      weeks: 1,
      byCategory: roundAll({ ...summaryRow.byCategory }),
      total: round2(summaryRow.total),
      headliners: toHeadliners(q.headlinersInWeek.all(weekId, ...ids) as Row[]),
    };
  }

  function compareMonths(a: Month, b: Month): CompareReport {
    return { mode: 'month', a: monthSide(a), b: monthSide(b) };
  }

  function compareWeeks(a: number, b: number): CompareReport {
    return { mode: 'week', a: weekSide(a), b: weekSide(b) };
  }

  function lineItems(from: Month, to: Month) {
    return (q.lineItems.all(...ids, from.ym, to.ym) as Row[]).map((r) => ({
      org: nameOf.get(Number(r.org_id))!,
      year: Number(r.year),
      month: Number(r.month),
      weekNo: Number(r.week_no),
      category: r.category as CategoryKey,
      name: String(r.name),
      amount: Number(r.amount_cents) / 100,
      riderCost: Number(r.rider_cents) / 100,
      notes: String(r.notes),
      isDj: Number(r.dj) === 1,
    }));
  }

  /**
   * How many times each resident DJ was booked in each month, and what their rates came to.
   * A booking is one week a DJ is on, so a DJ on four weeks of a month was booked four times.
   * Most-booked first, then by name.
   */
  function residentBookings(from: Month, to: Month): ResidentBookingsReport {
    const months = monthRange(from.key, to.key).map((key) => {
      const { year, month } = parseMonthKey(key)!;
      return { key, label: monthLabel(year, month, true) };
    });
    const byDj = new Map<string, ResidentBookingRow>();
    const totals: ResidentBookingsReport['totals'] = { bookings: 0, paid: 0, byMonth: {} };
    const cents = new Map<string, number>(); // "who|month" -> cents, converted once at the end

    for (const r of q.bookings.all(...ids, from.ym, to.ym) as Row[]) {
      const who = String(r.who);
      const key = monthKey(Number(r.year), Number(r.month));
      const n = Number(r.n);
      const c = Number(r.cents);
      const row = byDj.get(who) ?? { name: String(r.name), bookings: 0, paid: 0, byMonth: {} };
      byDj.set(who, row);
      row.bookings += n;
      row.byMonth[key] = { bookings: n, paid: c / 100 };
      cents.set(`${who}|${key}`, c);
      const t = (totals.byMonth[key] ??= { bookings: 0, paid: 0 });
      t.bookings += n;
      totals.bookings += n;
    }

    // Money is summed in cents and converted once, so the columns always add up to the totals.
    const monthCents = new Map<string, number>();
    let allCents = 0;
    for (const [id, c] of cents) {
      const who = id.slice(0, id.lastIndexOf('|'));
      const key = id.slice(id.lastIndexOf('|') + 1);
      monthCents.set(key, (monthCents.get(key) ?? 0) + c);
      allCents += c;
      byDj.get(who)!.paid += c;
    }
    for (const row of byDj.values()) row.paid = round2(row.paid / 100);
    for (const [key, c] of monthCents) totals.byMonth[key]!.paid = c / 100;
    totals.paid = allCents / 100;

    const rows = [...byDj.values()].sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name));
    return { from: from.key, to: to.key, months, rows, totals };
  }

  /**
   * Planned against actual spend.
   *
   * Actuals are imported as totals only, so the comparison is on totals: the whole week, and each group
   * (headline acts, resident DJs, hosts, riders, standard costs, marketing and other). Only weeks that have
   * actuals are compared, so a week that has not happened yet never looks "under budget".
   */
  function variance(from: Month, to: Month, groupBy: GroupBy): VarianceReport {
    const planned = repo.weekSummaries(from.ym, to.ym);
    const actual = repo.actualSummaries(from.ym, to.ym);
    const weekKey = (orgId: number, y: number, m: number, w: number) => `${orgId}:${y}-${m}-${w}`;
    const plannedByWeek = new Map(planned.map((w) => [weekKey(w.orgId, w.year, w.month, w.weekNo), w]));

    const plannedGroups = (w: WeekSummary) => groupTotals(w.byCategory);

    function build(
      key: string,
      label: string,
      year: number,
      month: number,
      weekNo: number | null,
      plannedWeeks: WeekSummary[],
      actualWeeks: ActualWeekSummary[],
    ): VarianceRow {
      const byGroup = Object.fromEntries(VARIANCE_GROUP_KEYS.map((g) => [g, { planned: 0, actual: 0 }])) as Record<VarianceGroupKey, PlanActual>;
      const byOrg: Record<string, PlanActual> = Object.fromEntries(scope.map((o) => [o.slug, { planned: 0, actual: 0 }]));
      let plannedSum = 0;
      let actualSum = 0;
      let paid = 0;
      let unplanned = 0;

      for (const a of actualWeeks) {
        const p = plannedByWeek.get(weekKey(a.orgId, a.year, a.month, a.weekNo));
        const pg = p ? plannedGroups(p) : emptyByGroup();
        for (const g of VARIANCE_GROUP_KEYS) {
          byGroup[g].planned += pg[g];
          byGroup[g].actual += a.byGroup[g];
        }
        const slug = slugOf.get(a.orgId);
        if (slug) {
          byOrg[slug]!.planned += p?.total ?? 0;
          byOrg[slug]!.actual += a.total;
        }
        plannedSum += p?.total ?? 0;
        actualSum += a.total;
        paid += a.paid;
        if (!p) unplanned++;
      }
      for (const g of VARIANCE_GROUP_KEYS) {
        byGroup[g].planned = round2(byGroup[g].planned);
        byGroup[g].actual = round2(byGroup[g].actual);
      }
      for (const v of Object.values(byOrg)) {
        v.planned = round2(v.planned);
        v.actual = round2(v.actual);
      }
      return {
        key,
        label,
        year,
        month,
        weekNo,
        weeksPlanned: plannedWeeks.length,
        weeksCompared: actualWeeks.length,
        weeksUnplanned: unplanned,
        plannedAll: round2(plannedWeeks.reduce((s, w) => s + w.total, 0)),
        planned: round2(plannedSum),
        actual: round2(actualSum),
        paid: round2(paid),
        byGroup,
        byOrg,
      };
    }

    let rows: VarianceRow[];
    if (groupBy === 'week') {
      // The same week number in different organisations is one row in the combined view.
      const keys = new Map<string, { y: number; m: number; w: number; p: WeekSummary[]; a: ActualWeekSummary[] }>();
      const slot = (y: number, m: number, w: number) => {
        const k = `${monthKey(y, m)}-W${w}`;
        if (!keys.has(k)) keys.set(k, { y, m, w, p: [], a: [] });
        return keys.get(k)!;
      };
      for (const w of planned) slot(w.year, w.month, w.weekNo).p.push(w);
      for (const w of actual) slot(w.year, w.month, w.weekNo).a.push(w);
      rows = [...keys]
        .sort(([, x], [, y]) => x.y - y.y || x.m - y.m || x.w - y.w)
        .map(([k, v]) => build(k, weekLabel(v.y, v.m, v.w, true), v.y, v.m, v.w, v.p, v.a));
    } else {
      // One row per month in the period, including months with nothing in them.
      rows = monthRange(from.key, to.key).map((key) => {
        const { year, month } = parseMonthKey(key)!;
        return build(
          key,
          monthLabel(year, month, true),
          year,
          month,
          null,
          planned.filter((w) => w.year === year && w.month === month),
          actual.filter((w) => w.year === year && w.month === month),
        );
      });
    }

    const { key: _k, label: _l, year: _y, month: _m, weekNo: _w, ...totals } = build('total', 'Total', 0, 0, null, planned, actual);
    return { from: from.key, to: to.key, groupBy, rows, totals };
  }

  return { summary, top, compareMonths, compareWeeks, periodSide, lineItems, residentBookings, variance };
}
