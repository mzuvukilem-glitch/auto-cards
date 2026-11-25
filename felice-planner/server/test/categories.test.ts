// The code shared by the server and the web app: categories, months, comparison groups and the lump-sum DJ rule.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  PAYMENT_BATCH_SIZE,
  RECURRING_CATEGORIES,
  VARIANCE_GROUPS,
  VARIANCE_GROUP_KEYS,
  addMonths,
  categoryLabel,
  emptyByCategory,
  emptyByGroup,
  groupLabel,
  groupOfCategory,
  groupTotals,
  hasRiderCost,
  isCategory,
  isIgnoredLump,
  isVarianceGroup,
  lumpResidentIsIgnored,
  monthKey,
  monthLabel,
  monthRange,
  parseMonthKey,
  weekLabel,
  type CategoryKey,
  type VarianceGroupKey,
} from '../../shared/categories.ts';

describe('categories', () => {
  test('there are eight, each with a key, a label and a colour; only some can recur; only acts and hosts carry a rider', () => {
    assert.equal(CATEGORIES.length, 8);
    assert.deepEqual(CATEGORY_KEYS, ['headline', 'resident', 'rider', 'standard', 'physical', 'social', 'hosts', 'other']);
    assert.ok(CATEGORIES.every((c) => /^#[0-9a-f]{6}$/.test(c.color)));
    assert.deepEqual(RECURRING_CATEGORIES, ['resident', 'rider', 'standard', 'physical', 'social', 'hosts']);
    assert.deepEqual(CATEGORY_KEYS.filter(hasRiderCost), ['headline', 'hosts']);
    assert.equal(PAYMENT_BATCH_SIZE, 5);
  });

  test('isCategory accepts the keys and nothing else', () => {
    for (const k of CATEGORY_KEYS) assert.equal(isCategory(k), true);
    for (const bad of ['Headline Acts', '', 'nope', 5, null, undefined, {}]) assert.equal(isCategory(bad), false);
  });

  test('labels, with the key itself for a category that no longer exists', () => {
    assert.equal(categoryLabel('hosts'), 'Hosts & Promoters');
    assert.equal(categoryLabel('retired' as CategoryKey), 'retired');
  });

  test('a fresh set of totals has every category at zero, and each call is a new object', () => {
    const a = emptyByCategory();
    assert.deepEqual(Object.keys(a), CATEGORY_KEYS);
    assert.ok(Object.values(a).every((v) => v === 0));
    a.headline = 5;
    assert.equal(emptyByCategory().headline, 0);
  });
});

describe('months and weeks', () => {
  test('month keys are zero-padded and can be read back', () => {
    assert.equal(monthKey(2026, 5), '2026-05');
    assert.equal(monthKey(2026, 11), '2026-11');
    assert.deepEqual(parseMonthKey('2026-05'), { year: 2026, month: 5 });
    for (const bad of ['2026-5', '2026-13', '2026-00', 'May 2026', '', '20266-01']) assert.equal(parseMonthKey(bad), null, bad);
  });

  test('labels use the full or the short month name, and "?" for a month that does not exist', () => {
    assert.equal(monthLabel(2026, 11), 'November 2026');
    assert.equal(monthLabel(2026, 11, true), 'Nov 2026');
    assert.equal(monthLabel(2026, 13), '? 2026');
    assert.equal(weekLabel(2026, 11, 2), 'November 2026 W2');
    assert.equal(weekLabel(2026, 11, 2, true), 'Nov 2026 W2');
  });

  test('adding months crosses year ends in both directions, and leaves a bad key alone', () => {
    assert.equal(addMonths('2026-11', 1), '2026-12');
    assert.equal(addMonths('2026-12', 1), '2027-01');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(addMonths('2026-05', 0), '2026-05');
    assert.equal(addMonths('2026-05', 25), '2028-06');
    assert.equal(addMonths('garbage', 3), 'garbage');
  });

  test('a range lists every month, inclusive, and is empty when it runs backwards', () => {
    assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
    assert.deepEqual(monthRange('2026-05', '2026-05'), ['2026-05']);
    assert.deepEqual(monthRange('2026-06', '2026-05'), []);
  });

  test('a range is cut off at 1200 months, so a mistake cannot run for ever', () => {
    assert.equal(monthRange('1900-01', '2100-12').length, 1200);
  });
});

describe('planned against actual groups', () => {
  test('there are six, and every category belongs to exactly one', () => {
    assert.deepEqual(VARIANCE_GROUP_KEYS, ['headline', 'resident', 'hosts', 'rider', 'standard', 'marketing']);
    const all = VARIANCE_GROUPS.flatMap((g) => [...g.categories]).sort();
    assert.deepEqual(all, [...CATEGORY_KEYS].sort());
    assert.equal(groupOfCategory('social'), 'marketing');
    assert.equal(groupOfCategory('physical'), 'marketing');
    assert.equal(groupOfCategory('other'), 'marketing');
    assert.equal(groupOfCategory('headline'), 'headline');
  });

  test('labels, with the key for an unknown group', () => {
    assert.equal(groupLabel('marketing'), 'Marketing & other');
    assert.equal(groupLabel('mystery' as VarianceGroupKey), 'mystery');
  });

  test('plan totals are folded into groups without losing any money', () => {
    const plan = { ...emptyByCategory(), headline: 100, social: 10, physical: 20, other: 30, standard: 5 };
    assert.deepEqual(groupTotals(plan), { headline: 100, resident: 0, hosts: 0, rider: 0, standard: 5, marketing: 60 });
    assert.equal(Object.values(groupTotals(plan)).reduce((s, n) => s + n, 0), 165);
  });

  test('isVarianceGroup and a fresh set of group totals', () => {
    for (const k of VARIANCE_GROUP_KEYS) assert.equal(isVarianceGroup(k), true);
    for (const bad of ['social', '', 7, null]) assert.equal(isVarianceGroup(bad), false);
    assert.deepEqual(emptyByGroup(), { headline: 0, resident: 0, hosts: 0, rider: 0, standard: 0, marketing: 0 });
  });
});

describe('the lump-sum Resident DJs rule', () => {
  const line = (category: CategoryKey, isDj: boolean) => ({ category, isDj });
  test('a lump sum stops counting as soon as there is an individual resident DJ', () => {
    assert.equal(lumpResidentIsIgnored([line('resident', false)]), false);
    assert.equal(lumpResidentIsIgnored([line('resident', false), line('resident', true)]), true);
    assert.equal(lumpResidentIsIgnored([line('standard', true)]), false, 'only a resident DJ counts');
    assert.equal(lumpResidentIsIgnored([]), false);
  });

  test('only the lump-sum line itself is ignored', () => {
    const lines = [line('resident', false), line('resident', true), line('standard', false)];
    assert.equal(isIgnoredLump(lines[0]!, lines), true);
    assert.equal(isIgnoredLump(lines[1]!, lines), false, 'a DJ is never ignored');
    assert.equal(isIgnoredLump(lines[2]!, lines), false, 'nor is another category');
    assert.equal(isIgnoredLump(lines[0]!, [lines[0]!]), false, 'with no DJs the lump sum counts');
  });
});
