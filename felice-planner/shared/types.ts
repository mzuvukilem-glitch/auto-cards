// API contract shared by the server and the web app. All amounts are in rand (ZAR).
import type { CategoryKey, VarianceGroupKey } from './categories.ts';

export type ByCategory = Record<CategoryKey, number>;

/** A company with its own planner, recurring costs and reports (for example Felice or Alur). */
export interface Organisation {
  id: number;
  /** URL-safe short name, e.g. "felice". */
  slug: string;
  name: string;
  /** Accent colour used to tell the organisations apart. */
  color: string;
}

/** Totals for one organisation within a report. */
export interface OrgTotals {
  byCategory: ByCategory;
  total: number;
  weeks: number;
}
export type GroupBy = 'month' | 'week';
export type CompareMode = 'month' | 'week';

export interface Week {
  id: number;
  orgId: number;
  year: number;
  month: number;
  weekNo: number;
  notes: string;
}

export interface WeekSummary extends Week {
  byCategory: ByCategory;
  total: number;
  itemCount: number;
}

/** A cost line, either in a week or in the recurring-costs list. */
export interface LineItem {
  id: number;
  category: CategoryKey;
  name: string;
  /** The rate (fee) for headline acts and hosts; the cost for every other category. */
  amount: number;
  /** Rider cost for this booking. Always 0 outside headline acts and hosts. */
  riderCost: number;
  notes: string;
  /** True for an individual Resident DJ (the amount is that DJ's rate). False for every other line. */
  isDj: boolean;
  /** How many items the rider calculator holds for this booking. 0 or absent: the rider cost was typed in. */
  riderItems?: number;
}

export interface Item extends LineItem {
  weekId: number;
}

/** A standing cost that is added to every new week. */
export type RecurringItem = LineItem;

export interface WeekDetail extends Week {
  items: Item[];
}

export interface SummaryRow {
  key: string;
  label: string;
  year: number;
  month: number;
  weekNo: number | null;
  weekId: number | null;
  weeks: number;
  byCategory: ByCategory;
  total: number;
  /** Total per organisation (keyed by slug). */
  byOrg: Record<string, number>;
}

export interface SummaryReport {
  from: string;
  to: string;
  groupBy: GroupBy;
  rows: SummaryRow[];
  totals: {
    byCategory: ByCategory;
    total: number;
    weeks: number;
    /** Category totals per organisation (keyed by slug). */
    byOrg: Record<string, OrgTotals>;
  };
}

export interface TopEntry {
  name: string;
  /** Rates (or costs) added up. */
  total: number;
  /** Rider costs added up. */
  riderTotal: number;
  count: number;
}

export interface CompareSide {
  key: string;
  label: string;
  weeks: number;
  byCategory: ByCategory;
  total: number;
  headliners: { name: string; amount: number; riderCost: number; week: string }[];
}

export interface CompareReport {
  /** "org" compares two organisations over the same period. */
  mode: CompareMode | 'org';
  a: CompareSide;
  b: CompareSide;
}

// ---------------------------------------------------------------------------
// Resident DJs
// ---------------------------------------------------------------------------

/** What a bulk DJ import does with one DJ. */
export type DjImportStatus = 'new' | 'update' | 'unchanged';

export interface DjImportRow {
  name: string;
  rate: number;
  notes: string;
  status: DjImportStatus;
  /** The rate the DJ has now, when they are already in the week or list. */
  currentRate: number | null;
}

/** One entry of the rider price list: an item and what it costs, including VAT. */
export interface RiderPrice {
  id: number;
  name: string;
  cost: number;
}

/** One item asked for on a rider, with the price it had when it was calculated. */
export interface RiderLine {
  name: string;
  unitCost: number;
  quantity: number;
  /** unitCost times quantity. */
  total: number;
}

/** The rider of one headline act or host. `total` is that booking's rider cost. */
export interface RiderCalc {
  itemId: number;
  name: string;
  lines: RiderLine[];
  total: number;
}

export type PriceImportStatus = 'new' | 'update' | 'unchanged';

export interface RiderPriceImportRow {
  name: string;
  cost: number;
  status: PriceImportStatus;
  /** The cost in the price list now, when the item is already there. */
  currentCost: number | null;
}

export interface RiderPriceImportResult {
  applied: boolean;
  rows: RiderPriceImportRow[];
  added: number;
  updated: number;
  unchanged: number;
  warnings: string[];
}

export interface DjImportResult {
  applied: boolean;
  rows: DjImportRow[];
  added: number;
  updated: number;
  unchanged: number;
  /** The rates in the file added up. */
  total: number;
  warnings: string[];
}

export interface PaymentRow {
  /** Position in the whole schedule, starting at 1. */
  no: number;
  name: string;
  amount: number;
  notes: string;
}

export interface PaymentBatch {
  batchNo: number;
  payments: PaymentRow[];
  total: number;
}

/** The resident DJs of one week, grouped into batches for a bulk payment. */
export interface PaymentSchedule {
  weekId: number;
  label: string;
  batchSize: number;
  batches: PaymentBatch[];
  count: number;
  total: number;
}

export interface BookingCell {
  bookings: number;
  paid: number;
}

export interface ResidentBookingRow extends BookingCell {
  name: string;
  /** Keyed by month ("YYYY-MM"). Months with no booking are absent. */
  byMonth: Record<string, BookingCell>;
}

/** How many times each resident DJ was booked in each month. One booking is one week a DJ is on. */
export interface ResidentBookingsReport {
  from: string;
  to: string;
  months: { key: string; label: string }[];
  rows: ResidentBookingRow[];
  totals: BookingCell & { byMonth: Record<string, BookingCell> };
}

export interface ImportWeekPreview {
  year: number;
  month: number;
  weekNo: number;
  label: string;
  itemCount: number;
  total: number;
  exists: boolean;
}

export interface ImportResult {
  format: 'planner' | 'flat';
  applied: boolean;
  weeks: ImportWeekPreview[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Actual expenditure, imported one week at a time from the weekly expense workbook as TOTALS ONLY
// (the sheet's section subtotals), and the planned-vs-actual reports built from it.
// ---------------------------------------------------------------------------

export type ByGroup = Record<VarianceGroupKey, number>;

/** One section total of an imported week, for example "LOCAL DJ's". */
export interface ActualSection {
  id: number;
  /** The heading on the sheet. */
  heading: string;
  group: VarianceGroupKey;
  /** The amount used: the sheet's subtotal, unless it was adjusted when importing. */
  amount: number;
  /** The subtotal printed on the sheet. */
  sheetAmount: number;
  paid: number;
}

/** One imported week of actual expenditure. */
export interface ActualWeekSummary {
  id: number;
  orgId: number;
  year: number;
  month: number;
  weekNo: number;
  /** The workbook tab it came from, e.g. "29-05". */
  label: string;
  byGroup: ByGroup;
  /** Actual cost: the sum of the section totals (amount due). */
  total: number;
  /** How much of it has been paid so far. */
  paid: number;
  /** True if any section total was changed from the sheet's figure when importing. */
  adjusted: boolean;
}

export interface ActualWeekDetail extends ActualWeekSummary {
  sections: ActualSection[];
}

export interface PlanActual {
  planned: number;
  actual: number;
}

/**
 * One period of a planned-vs-actual report.
 *
 * Only weeks that have actual expenditure are compared, so a week that has not happened yet can never
 * look "under budget". `planned` is the plan for those same weeks; `plannedAll` is the whole plan for
 * the period, for context. Variance is actual minus planned, so a positive variance is an overspend.
 */
export interface VarianceRow {
  key: string;
  label: string;
  year: number;
  month: number;
  weekNo: number | null;
  /** Weeks with a plan in the period (all of them, compared or not). */
  weeksPlanned: number;
  /** Weeks that have actuals, and so are compared. */
  weeksCompared: number;
  /** Compared weeks that have actuals but were never planned (their plan counts as 0). */
  weeksUnplanned: number;
  plannedAll: number;
  planned: number;
  actual: number;
  paid: number;
  byGroup: Record<VarianceGroupKey, PlanActual>;
  /** Planned and actual per organisation (keyed by slug). */
  byOrg: Record<string, PlanActual>;
}

export type VarianceTotals = Omit<VarianceRow, 'key' | 'label' | 'year' | 'month' | 'weekNo'>;

export interface VarianceReport {
  from: string;
  to: string;
  groupBy: GroupBy;
  rows: VarianceRow[];
  totals: VarianceTotals;
}

/** A tab of an expense workbook, offered when choosing which week to import. */
export interface ActualSheetInfo {
  name: string;
  /** The tab's total: its section subtotals added up. 0 means it is empty or is not a weekly tab. */
  total: number;
  sections: number;
}

export interface ActualSheetList {
  sheets: ActualSheetInfo[];
  /** The tab to pre-select: the last one that has data. */
  suggested: string | null;
}

export interface ActualSectionPreview {
  heading: string;
  group: VarianceGroupKey;
  /** The subtotal on the sheet. */
  sheetAmount: number;
  /** What will be imported (the sheet's figure unless adjusted). */
  amount: number;
}

export interface ActualImportPreview {
  applied: boolean;
  tab: string;
  year: number;
  month: number;
  weekNo: number;
  total: number;
  paid: number;
  byGroup: ByGroup;
  sections: ActualSectionPreview[];
  /** What was planned for this week, or null if the week has no plan. */
  planned: { total: number; byGroup: ByGroup } | null;
  /** True if actuals for this week were imported before and will be replaced. */
  replaces: boolean;
  adjusted: boolean;
  warnings: string[];
}
