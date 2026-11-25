// Cost categories, taken from the "Event Marketing Timeline" sheet of the weekly planner.
export const CATEGORIES = [
  { key: 'headline', label: 'Headline Acts', color: '#4338ca' },
  { key: 'resident', label: 'Resident DJs', color: '#0e7490' },
  { key: 'rider', label: 'Rider Costs', color: '#b45309' },
  { key: 'standard', label: 'Standard Costs', color: '#047857' },
  { key: 'physical', label: 'Physical Marketing', color: '#6d28d9' },
  { key: 'social', label: 'Social Media', color: '#be185d' },
  { key: 'hosts', label: 'Hosts & Promoters', color: '#b91c1c' },
  { key: 'other', label: 'Other', color: '#475569' },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export const CATEGORY_KEYS: readonly CategoryKey[] = CATEGORIES.map((c) => c.key);

/** Categories that can be saved as recurring costs and added to every new week. Headline acts change weekly. */
export const RECURRING_CATEGORIES: readonly CategoryKey[] = ['resident', 'rider', 'standard', 'physical', 'social', 'hosts'];

/** Suggested line names per category, matching the planner rows. */
export const SUGGESTED_ITEMS: Partial<Record<CategoryKey, readonly string[]>> = {
  rider: ['Headline acts rider', 'Resident DJ rider', 'Hosts rider'],
  standard: ['MC', 'Graphics', 'Photographer', 'Bottle Girls'],
  physical: ['Corex Boards', 'Billboards', 'Mobile Boards'],
  social: ['Instagram', 'Facebook', 'Twitter', 'TikTok', 'Snapchat', 'LinkedIn'],
};

/**
 * Categories where every line is a person or act booked at a Rate, and must also carry that booking's
 * Rider Cost. Each line's rider cost is reported under "Rider Costs".
 */
export const RIDER_CATEGORIES: readonly CategoryKey[] = ['headline', 'hosts'];

export function hasRiderCost(category: CategoryKey): boolean {
  return RIDER_CATEGORIES.includes(category);
}

/** Resident DJs are paid in batches of this many people. */
export const PAYMENT_BATCH_SIZE = 5;

/**
 * Resident DJs can be captured as one lump-sum line (the older way) or as individual DJs, each with a rate.
 * As soon as a list of lines (a week, or the recurring list) contains individual DJs, its lump-sum Resident DJs
 * lines stop counting, so the cost is derived from the DJs and is never counted twice.
 */
export function lumpResidentIsIgnored(lines: readonly { category: CategoryKey; isDj: boolean }[]): boolean {
  return lines.some((l) => l.category === 'resident' && l.isDj);
}

/** True for a lump-sum Resident DJs line that no longer counts because individual DJs exist next to it. */
export function isIgnoredLump(line: { category: CategoryKey; isDj: boolean }, lines: readonly { category: CategoryKey; isDj: boolean }[]): boolean {
  return line.category === 'resident' && !line.isDj && lumpResidentIsIgnored(lines);
}

export function isCategory(value: unknown): value is CategoryKey {
  return typeof value === 'string' && (CATEGORY_KEYS as readonly string[]).includes(value);
}

export function categoryLabel(key: CategoryKey): string {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function emptyByCategory(): Record<CategoryKey, number> {
  return Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<CategoryKey, number>;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** "2026-05" */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function monthLabel(year: number, month: number, short = false): string {
  const name = MONTH_NAMES[month - 1] ?? '?';
  return `${short ? name.slice(0, 3) : name} ${year}`;
}

export function weekLabel(year: number, month: number, weekNo: number, short = false): string {
  return `${monthLabel(year, month, short)} W${weekNo}`;
}

/** Adds (or subtracts) months to a "YYYY-MM" key. */
export function addMonths(key: string, delta: number): string {
  const p = parseMonthKey(key);
  if (!p) return key;
  const idx = p.year * 12 + (p.month - 1) + delta;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Every month key from `from` to `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 1200; k = addMonths(k, 1)) out.push(k);
  return out;
}

// ---------------------------------------------------------------------------
// Planned vs actual
//
// Actual expenditure is imported as totals only (the sheet's section subtotals), so plan and actual are
// compared on groups that both sides can be measured in. Social media, physical marketing and "other"
// are one group because the sheet reports them together under Miscellaneous.
// ---------------------------------------------------------------------------

export const VARIANCE_GROUPS = [
  { key: 'headline', label: 'Headline Acts', categories: ['headline'] },
  { key: 'resident', label: 'Resident DJs', categories: ['resident'] },
  { key: 'hosts', label: 'Hosts & Promoters', categories: ['hosts'] },
  { key: 'rider', label: 'Rider Costs', categories: ['rider'] },
  { key: 'standard', label: 'Standard Costs', categories: ['standard'] },
  { key: 'marketing', label: 'Marketing & other', categories: ['social', 'physical', 'other'] },
] as const satisfies readonly { key: string; label: string; categories: readonly CategoryKey[] }[];

export type VarianceGroupKey = (typeof VARIANCE_GROUPS)[number]['key'];

export const VARIANCE_GROUP_KEYS: readonly VarianceGroupKey[] = VARIANCE_GROUPS.map((g) => g.key);

export function groupOfCategory(category: CategoryKey): VarianceGroupKey {
  return VARIANCE_GROUPS.find((g) => (g.categories as readonly CategoryKey[]).includes(category))!.key;
}

export function groupLabel(key: VarianceGroupKey): string {
  return VARIANCE_GROUPS.find((g) => g.key === key)?.label ?? key;
}

/** Folds per-category totals (the plan) into the comparison groups the actuals use. */
export function groupTotals(byCategory: Record<CategoryKey, number>): Record<VarianceGroupKey, number> {
  const out = Object.fromEntries(VARIANCE_GROUP_KEYS.map((k) => [k, 0])) as Record<VarianceGroupKey, number>;
  for (const c of CATEGORY_KEYS) out[groupOfCategory(c)] += byCategory[c];
  return out;
}

export function isVarianceGroup(value: unknown): value is VarianceGroupKey {
  return typeof value === 'string' && (VARIANCE_GROUP_KEYS as readonly string[]).includes(value);
}

export function emptyByGroup(): Record<VarianceGroupKey, number> {
  return Object.fromEntries(VARIANCE_GROUP_KEYS.map((k) => [k, 0])) as Record<VarianceGroupKey, number>;
}

