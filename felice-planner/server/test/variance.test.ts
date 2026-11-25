// Planned vs actual. Actuals are totals only. Only weeks that have actuals are compared.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { VARIANCE_GROUP_KEYS } from '../../shared/categories.ts';
import { openDb } from '../src/db.ts';
import type { NewActualSection } from '../src/repo.ts';
import { createStores } from '../src/stores.ts';
import { HttpError } from '../src/validate.ts';

const c = (n: number) => Math.round(n * 100);
const M = (key: string) => ({ key, ym: Number(key.replace('-', '')), year: Number(key.slice(0, 4)), month: Number(key.slice(5)) });
const NOV = M('2026-11');
const DEC = M('2026-12');

const section = (heading: string, group: NewActualSection['group'], amount: number, paid = 0, sheet = amount): NewActualSection => ({
  heading,
  group,
  amountCents: c(amount),
  sheetCents: c(sheet),
  paidCents: c(paid),
});

function setup() {
  const stores = createStores(openDb(':memory:'));
  const felice = stores.forOrg('felice')!;
  const alur = stores.forOrg('alur')!;

  /** A planned week: DJs 25,000, an act (20,000 + 2,000 rider), MC 4,000, Instagram 5,000, a 1,000 "other". */
  const plan = (s: typeof felice, month: number, weekNo: number) => {
    const w = s.repo.createWeek({ year: 2026, month, weekNo, notes: '' }, false);
    s.repo.addItem(w.id, { category: 'resident', name: 'DJs', amountCents: c(25000), notes: '' });
    s.repo.addItem(w.id, { category: 'headline', name: 'Act', amountCents: c(20000), riderCents: c(2000), notes: '' });
    s.repo.addItem(w.id, { category: 'standard', name: 'MC', amountCents: c(4000), notes: '' });
    s.repo.addItem(w.id, { category: 'social', name: 'Instagram', amountCents: c(5000), notes: '' });
    s.repo.addItem(w.id, { category: 'other', name: 'Misc', amountCents: c(1000), notes: '' });
    return w; // planned total 57,000
  };
  const actual = (s: typeof felice, month: number, weekNo: number, sections: NewActualSection[], label = 'tab') =>
    s.repo.importActualWeek({ year: 2026, month, weekNo, label, sections });

  return { stores, felice, alur, plan, actual };
}

describe('planned vs actual', () => {
  test('compares the plan with the imported totals, by week total and by group', () => {
    const { felice, plan, actual } = setup();
    plan(felice, 11, 1);
    actual(felice, 11, 1, [
      section("LOCAL DJ's", 'resident', 26000),
      section('HEADLINERS', 'headline', 21000),
      section('RIDERS', 'rider', 2500),
      section('RESIDENTS', 'standard', 4500),
      section('Miscellenious', 'marketing', 7000),
    ]);
    const r = felice.reports.variance(NOV, NOV, 'month');
    const nov = r.rows[0]!;
    assert.equal(nov.planned, 57000);
    assert.equal(nov.actual, 61000);
    assert.equal(nov.weeksCompared, 1);
    assert.deepEqual(nov.byGroup.resident, { planned: 25000, actual: 26000 });
    assert.deepEqual(nov.byGroup.headline, { planned: 20000, actual: 21000 });
    assert.deepEqual(nov.byGroup.rider, { planned: 2000, actual: 2500 }, 'planned rider cost on the act counts as Rider Costs');
    assert.deepEqual(nov.byGroup.standard, { planned: 4000, actual: 4500 });
    assert.deepEqual(nov.byGroup.marketing, { planned: 6000, actual: 7000 }, 'social + physical + other are one group');
    assert.deepEqual(nov.byGroup.hosts, { planned: 0, actual: 0 });
  });

  test('every group adds up to the week total, on both sides', () => {
    const { felice, plan, actual } = setup();
    plan(felice, 11, 1);
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 3000), section("LOCAL DJ's", 'resident', 24000), section('HEADLINERS', 'headline', 18000)]);
    const t = felice.reports.variance(NOV, NOV, 'month').totals;
    const sum = (side: 'planned' | 'actual') => VARIANCE_GROUP_KEYS.reduce((s, g) => s + c(t.byGroup[g][side]), 0);
    assert.equal(sum('planned'), c(t.planned));
    assert.equal(sum('actual'), c(t.actual));
    assert.equal(t.actual, 45000);
  });

  test('only weeks that have actuals are compared: an unspent future week is not "under budget"', () => {
    const { felice, plan, actual } = setup();
    plan(felice, 11, 1);
    plan(felice, 11, 2);
    plan(felice, 11, 3);
    actual(felice, 11, 1, [section("LOCAL DJ's", 'resident', 25000)]); // only week 1 has happened
    const nov = felice.reports.variance(NOV, NOV, 'month').rows[0]!;
    assert.equal(nov.weeksPlanned, 3);
    assert.equal(nov.weeksCompared, 1);
    assert.equal(nov.plannedAll, 171000, 'the whole plan, for context');
    assert.equal(nov.planned, 57000, 'but only week 1 is compared');
    assert.equal(nov.actual, 25000);
  });

  test('a month with no actuals at all compares nothing', () => {
    const { felice, plan } = setup();
    plan(felice, 11, 1);
    const nov = felice.reports.variance(NOV, NOV, 'month').rows[0]!;
    assert.equal(nov.weeksCompared, 0);
    assert.equal(nov.planned, 0);
    assert.equal(nov.actual, 0);
    assert.equal(nov.plannedAll, 57000);
  });

  test('actuals for a week that was never planned count against a plan of 0, and say so', () => {
    const { felice, actual } = setup();
    actual(felice, 11, 1, [section("LOCAL DJ's", 'resident', 25000)]);
    const nov = felice.reports.variance(NOV, NOV, 'month').rows[0]!;
    assert.equal(nov.planned, 0);
    assert.equal(nov.actual, 25000);
    assert.equal(nov.weeksUnplanned, 1);
  });

  test('by week, each week is its own row, in order, with planned weeks that have no actuals still listed', () => {
    const { felice, plan, actual } = setup();
    plan(felice, 11, 2);
    plan(felice, 11, 1);
    actual(felice, 11, 1, [section("LOCAL DJ's", 'resident', 26000)]);
    const rows = felice.reports.variance(NOV, NOV, 'week').rows;
    assert.deepEqual(rows.map((r) => [r.label, r.weeksCompared, r.planned, r.actual]), [['Nov 2026 W1', 1, 57000, 26000], ['Nov 2026 W2', 0, 0, 0]]);
  });

  test('months with nothing in them appear as empty rows, and the totals add up across months', () => {
    const { felice, plan, actual } = setup();
    plan(felice, 11, 1);
    actual(felice, 11, 1, [section("LOCAL DJ's", 'resident', 26000)]);
    const r = felice.reports.variance(NOV, DEC, 'month');
    assert.deepEqual(r.rows.map((x) => x.label), ['Nov 2026', 'Dec 2026']);
    assert.equal(r.rows[1]!.actual, 0);
    assert.equal(r.totals.actual, r.rows.reduce((s, x) => s + x.actual, 0));
    assert.equal(r.totals.planned, r.rows.reduce((s, x) => s + x.planned, 0));
  });

  test('a lump-sum Resident DJs line is ignored once individual DJs exist, so the plan is not double counted', () => {
    const { felice, plan, actual } = setup();
    const w = plan(felice, 11, 1); // includes a 25,000 lump "DJs" line
    felice.repo.addResidentDj(w.id, { name: 'DJ One', rateCents: c(1000), notes: '' });
    felice.repo.addResidentDj(w.id, { name: 'DJ Two', rateCents: c(1500), notes: '' });
    actual(felice, 11, 1, [section("LOCAL DJ's", 'resident', 2500)]);
    const nov = felice.reports.variance(NOV, NOV, 'month').rows[0]!;
    assert.deepEqual(nov.byGroup.resident, { planned: 2500, actual: 2500 });
  });

  test('importing the same week again replaces it, and adjusted figures are flagged', () => {
    const { felice, actual } = setup();
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 1000)], 'first');
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 1500), section('Miscellenious', 'marketing', 5000, 0, 7500)], 'second');
    const weeks = felice.repo.actualSummaries(202611, 202611);
    assert.equal(weeks.length, 1, 'still one week');
    assert.equal(weeks[0]!.label, 'second');
    assert.equal(weeks[0]!.total, 6500);
    assert.equal(weeks[0]!.adjusted, true, 'the Miscellaneous total was changed from the sheet');
    const detail = felice.repo.getActualWeek(weeks[0]!.id);
    assert.deepEqual(detail.sections.map((s) => [s.heading, s.amount, s.sheetAmount]), [['HOSTS', 1500, 1500], ['Miscellenious', 5000, 7500]]);
  });

  test('paid is tracked beside the amount due', () => {
    const { felice, actual } = setup();
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 1000, 400), section('RIDERS', 'rider', 2000, 2000)]);
    const w = felice.repo.actualSummaries(202611, 202611)[0]!;
    assert.equal(w.total, 3000);
    assert.equal(w.paid, 2400);
    assert.equal(felice.reports.variance(NOV, NOV, 'month').totals.paid, 2400);
  });

  test('deleting an imported week removes it from the comparison but not the plan', () => {
    const { felice, plan, actual } = setup();
    plan(felice, 11, 1);
    const id = actual(felice, 11, 1, [section('HOSTS', 'hosts', 1000)]);
    felice.repo.deleteActualWeek(id);
    const nov = felice.reports.variance(NOV, NOV, 'month').rows[0]!;
    assert.equal(nov.weeksCompared, 0);
    assert.equal(nov.plannedAll, 57000);
    assert.equal(felice.repo.actualSummaries(200001, 210012).length, 0);
  });
});

describe('planned vs actual across organisations', () => {
  test('each organisation compares only its own plan and actuals', () => {
    const { felice, alur, plan, actual } = setup();
    plan(felice, 11, 1);
    plan(alur, 11, 1);
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 3000)]);
    actual(alur, 11, 1, [section('HOSTS', 'hosts', 1000)]);
    assert.equal(felice.reports.variance(NOV, NOV, 'month').totals.actual, 3000);
    assert.equal(alur.reports.variance(NOV, NOV, 'month').totals.actual, 1000);
  });

  test('the combined view adds both together and shows each organisation’s plan and actual', () => {
    const { stores, felice, alur, plan, actual } = setup();
    plan(felice, 11, 1);
    plan(alur, 11, 1);
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 3000)]);
    actual(alur, 11, 1, [section('HOSTS', 'hosts', 1000)]);
    const t = stores.all().reports.variance(NOV, NOV, 'month').totals;
    assert.equal(t.actual, 4000);
    assert.equal(t.planned, 114000);
    assert.deepEqual(t.byOrg.felice, { planned: 57000, actual: 3000 });
    assert.deepEqual(t.byOrg.alur, { planned: 57000, actual: 1000 });
    assert.equal(t.weeksCompared, 2);
  });

  test('in the combined view only the organisations with actuals are compared', () => {
    const { stores, felice, alur, plan, actual } = setup();
    plan(felice, 11, 1);
    plan(alur, 11, 1); // Alur has not imported its actuals yet
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 3000)]);
    const t = stores.all().reports.variance(NOV, NOV, 'month').totals;
    assert.equal(t.planned, 57000, "Alur's plan is not compared against nothing");
    assert.equal(t.plannedAll, 114000);
    assert.deepEqual(t.byOrg.alur, { planned: 0, actual: 0 });
  });

  test('by week, the same week of both organisations is one combined row', () => {
    const { stores, felice, alur, plan, actual } = setup();
    plan(felice, 11, 1);
    plan(alur, 11, 1);
    actual(felice, 11, 1, [section('HOSTS', 'hosts', 3000)]);
    actual(alur, 11, 1, [section('HOSTS', 'hosts', 1000)]);
    const rows = stores.all().reports.variance(NOV, NOV, 'week').rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.actual, 4000);
    assert.equal(rows[0]!.weeksCompared, 2);
  });

  test('one organisation cannot reach, replace or delete another’s actuals; the combined view cannot write', () => {
    const { stores, felice, alur, actual } = setup();
    const id = actual(felice, 11, 1, [section('HOSTS', 'hosts', 3000)]);
    assert.throws(() => alur.repo.getActualWeek(id), (e) => e instanceof HttpError && e.status === 404);
    assert.throws(() => alur.repo.deleteActualWeek(id), (e) => e instanceof HttpError && e.status === 404);
    const master = stores.all().repo;
    assert.throws(() => master.importActualWeek({ year: 2026, month: 11, weekNo: 1, label: 'x', sections: [] }), (e) => e instanceof HttpError && e.status === 400);
    assert.throws(() => master.deleteActualWeek(id), (e) => e instanceof HttpError && e.status === 400);
    assert.equal(felice.repo.getActualWeek(id).total, 3000, 'nothing changed');
  });
});
