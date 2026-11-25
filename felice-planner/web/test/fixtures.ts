import { VARIANCE_GROUP_KEYS, emptyByCategory, emptyByGroup, type CategoryKey, type VarianceGroupKey } from '../../shared/categories.ts';
import type {
  ByCategory,
  CompareReport,
  CompareSide,
  Item,
  LineItem,
  OrgTotals,
  PlanActual,
  RiderCalc,
  SummaryReport,
  SummaryRow,
  VarianceReport,
  VarianceRow,
  VarianceTotals,
  WeekDetail,
  WeekSummary,
} from '../../shared/types.ts';

export const cats = (partial: Partial<ByCategory> = {}): ByCategory => ({ ...emptyByCategory(), ...partial });
export const groups = (partial: Partial<Record<VarianceGroupKey, number>> = {}) => ({ ...emptyByGroup(), ...partial });

export function line(partial: Partial<Item> & { id: number; category: CategoryKey; name: string }): Item {
  return { weekId: 1, amount: 0, riderCost: 0, notes: '', isDj: false, ...partial };
}
export const lineItem = (partial: Partial<LineItem> & { id: number; category: CategoryKey; name: string }): LineItem => ({
  amount: 0,
  riderCost: 0,
  notes: '',
  isDj: false,
  ...partial,
});

export function weekSummary(partial: Partial<WeekSummary> & { id: number }): WeekSummary {
  return { orgId: 1, year: 2026, month: 5, weekNo: 1, notes: '', byCategory: cats(), total: 0, itemCount: 0, ...partial };
}
export function weekDetail(partial: Partial<WeekDetail> & { id: number }): WeekDetail {
  return { orgId: 1, year: 2026, month: 5, weekNo: 1, notes: '', items: [], ...partial };
}

export function summaryRow(partial: Partial<SummaryRow> & { key: string; label: string }): SummaryRow {
  return { year: 2026, month: 5, weekNo: null, weekId: null, weeks: 1, byCategory: cats(), total: 0, byOrg: {}, ...partial };
}
export function orgTotals(partial: Partial<OrgTotals> = {}): OrgTotals {
  return { byCategory: cats(), total: 0, weeks: 0, ...partial };
}
export function summaryReport(partial: Partial<SummaryReport> = {}): SummaryReport {
  return {
    from: '2026-01',
    to: '2026-06',
    groupBy: 'month',
    rows: [],
    totals: { byCategory: cats(), total: 0, weeks: 0, byOrg: {} },
    ...partial,
  };
}

export function side(partial: Partial<CompareSide> & { key: string; label: string }): CompareSide {
  return { weeks: 1, byCategory: cats(), total: 0, headliners: [], ...partial };
}
export function compareReport(partial: Partial<CompareReport> & Pick<CompareReport, 'a' | 'b'>): CompareReport {
  return { mode: 'month', ...partial };
}

export const planActual = (planned: number, actual: number): PlanActual => ({ planned, actual });
export function varianceByGroup(partial: Partial<Record<VarianceGroupKey, PlanActual>> = {}): Record<VarianceGroupKey, PlanActual> {
  return Object.fromEntries(VARIANCE_GROUP_KEYS.map((k) => [k, partial[k] ?? planActual(0, 0)])) as Record<VarianceGroupKey, PlanActual>;
}
export function varianceTotals(partial: Partial<VarianceTotals> = {}): VarianceTotals {
  return {
    weeksPlanned: 1,
    weeksCompared: 1,
    weeksUnplanned: 0,
    plannedAll: 0,
    planned: 0,
    actual: 0,
    paid: 0,
    byGroup: varianceByGroup(),
    byOrg: {},
    ...partial,
  };
}
export function varianceRow(partial: Partial<VarianceRow> & { key: string; label: string }): VarianceRow {
  return { year: 2026, month: 5, weekNo: null, ...varianceTotals(), ...partial };
}
export function varianceReport(partial: Partial<VarianceReport> = {}): VarianceReport {
  return { from: '2026-01', to: '2026-06', groupBy: 'month', rows: [], totals: varianceTotals(), ...partial };
}

export const riderCalc = (itemId: number, name: string, lines: RiderCalc['lines'] = []): RiderCalc => ({
  itemId,
  name,
  lines,
  total: lines.reduce((s, l) => s + l.total, 0),
});
