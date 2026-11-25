// Headline acts and hosts carry a Rate and a Rider Cost. The rider cost is reported under Rider Costs,
// and every total must still add up.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { CATEGORY_KEYS } from '../../shared/categories.ts';
import { openDb } from '../src/db.ts';
import type { Reports } from '../src/reports.ts';
import type { Repo } from '../src/repo.ts';
import { createStores } from '../src/stores.ts';

const cents = (n: number) => Math.round(n * 100);
const M5 = { key: '2026-05', ym: 202605, year: 2026, month: 5 };

describe('rate and rider cost on headline acts and hosts', () => {
  let repo: Repo;
  let reports: Reports;
  let weekId: number;

  before(() => {
    const felice = createStores(openDb(':memory:')).forOrg('felice')!;
    repo = felice.repo;
    reports = felice.reports;
    weekId = repo.createWeek({ year: 2026, month: 5, weekNo: 1, notes: '' }, false).id;

    repo.addItem(weekId, { category: 'headline', name: 'Act A', amountCents: cents(20000), riderCents: cents(3500.5), notes: '' });
    repo.addItem(weekId, { category: 'headline', name: 'Act B', amountCents: cents(15000), riderCents: cents(0), notes: '' });
    repo.addItem(weekId, { category: 'hosts', name: 'Host X', amountCents: cents(1500), riderCents: cents(300.25), notes: '' });
    repo.addItem(weekId, { category: 'rider', name: 'Resident DJ rider', amountCents: cents(6250), notes: '' });
    repo.addItem(weekId, { category: 'standard', name: 'MC', amountCents: cents(4000), notes: '' });
  });

  test('item stores the rate and the rider cost separately', () => {
    const items = repo.getWeek(weekId).items;
    const a = items.find((i) => i.name === 'Act A')!;
    assert.equal(a.amount, 20000);
    assert.equal(a.riderCost, 3500.5);
    assert.equal(items.find((i) => i.name === 'MC')!.riderCost, 0);
  });

  test('rider costs from acts and hosts are reported under Rider Costs, rates under their own category', () => {
    const [w] = repo.weekSummaries(202605, 202605);
    assert.equal(w!.byCategory.headline, 35000);
    assert.equal(w!.byCategory.hosts, 1500);
    // 6,250 resident + 3,500.50 Act A + 0 Act B + 300.25 Host X
    assert.equal(cents(w!.byCategory.rider), cents(6250 + 3500.5 + 300.25));
    assert.equal(w!.byCategory.standard, 4000);
  });

  test('week total = every rate + every rider cost, and equals the sum of its categories', () => {
    const [w] = repo.weekSummaries(202605, 202605);
    const expected = cents(20000 + 15000 + 1500 + 6250 + 4000 + 3500.5 + 300.25);
    assert.equal(cents(w!.total), expected);
    assert.equal(CATEGORY_KEYS.reduce((s, k) => s + cents(w!.byCategory[k]), 0), expected);
  });

  test('month and period reports agree with the week', () => {
    const month = reports.summary(M5, M5, 'month');
    const week = reports.summary(M5, M5, 'week');
    assert.equal(month.totals.total, week.totals.total);
    assert.equal(cents(month.totals.total), cents(20000 + 15000 + 1500 + 6250 + 4000 + 3500.5 + 300.25));
  });

  test('top list and compare expose the rider cost', () => {
    const top = reports.top(M5, M5, 'headline', 10);
    assert.deepEqual(top.map((t) => [t.name, t.total, t.riderTotal]), [['Act A', 20000, 3500.5], ['Act B', 15000, 0]]);
    const cmp = reports.compareMonths(M5, M5);
    assert.deepEqual(cmp.a.headliners.map((h) => [h.name, h.amount, h.riderCost]), [['Act A', 20000, 3500.5], ['Act B', 15000, 0]]);
    assert.equal(cmp.a.total, cmp.b.total);
  });

  test('updating an act changes the totals by exactly the difference', () => {
    const act = repo.getWeek(weekId).items.find((i) => i.name === 'Act B')!;
    repo.updateItem(act.id, { category: 'headline', name: 'Act B', amountCents: cents(15000), riderCents: cents(1000), notes: '' });
    const [w] = repo.weekSummaries(202605, 202605);
    assert.equal(cents(w!.total), cents(20000 + 15000 + 1500 + 6250 + 4000 + 3500.5 + 300.25 + 1000));
  });

  test('a recurring host keeps its rider cost when added to a new week', () => {
    repo.addRecurring({ category: 'hosts', name: 'Host Y', amountCents: cents(2000), riderCents: cents(150), notes: '' });
    const next = repo.createWeek({ year: 2026, month: 5, weekNo: 2, notes: '' }, true);
    const host = next.items.find((i) => i.name === 'Host Y')!;
    assert.equal(host.amount, 2000);
    assert.equal(host.riderCost, 150);
  });
});
