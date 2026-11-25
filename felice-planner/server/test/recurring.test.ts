// The Recurring costs list is added to every new week, and editing it never rewrites weeks that already exist.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openDb } from '../src/db.ts';
import type { Repo } from '../src/repo.ts';
import { createStores } from '../src/stores.ts';
import { HttpError } from '../src/validate.ts';

const cents = (n: number) => Math.round(n * 100);

function setup() {
  const repo = createStores(openDb(':memory:')).forOrg('felice')!.repo;
  repo.addRecurring({ category: 'resident', name: 'Resident DJs', amountCents: cents(25000), notes: '' });
  repo.addRecurring({ category: 'standard', name: 'MC', amountCents: cents(4000), notes: '' });
  repo.addRecurring({ category: 'rider', name: 'Resident DJ rider', amountCents: cents(6250), notes: '' });
  return repo;
}
const weekTotal = (repo: Repo, id: number) =>
  repo.getWeek(id).items.reduce((s, i) => s + cents(i.amount) + cents(i.riderCost), 0);

describe('recurring costs', () => {
  test('a new week starts with every recurring cost, and the total adds up', () => {
    const repo = setup();
    const week = repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    assert.equal(week.items.length, 3);
    assert.equal(weekTotal(repo, week.id), cents(25000 + 4000 + 6250));
  });

  test('a week can be created without them', () => {
    const repo = setup();
    assert.equal(repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, false).items.length, 0);
  });

  test('editing the list changes later weeks only', () => {
    const repo = setup();
    const first = repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    const mc = repo.recurringItems().find((r) => r.name === 'MC')!;
    repo.updateRecurring(mc.id, { category: 'standard', name: 'MC', amountCents: cents(4500), notes: '' });
    const second = repo.createWeek({ year: 2026, month: 11, weekNo: 2, notes: '' }, true);
    assert.equal(first.items.find((i) => i.name === 'MC')!.amount, 4000);
    assert.equal(repo.getWeek(second.id).items.find((i) => i.name === 'MC')!.amount, 4500);
  });

  test("editing a week's copy does not change the list", () => {
    const repo = setup();
    const week = repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    const mc = week.items.find((i) => i.name === 'MC')!;
    repo.updateItem(mc.id, { category: 'standard', name: 'MC', amountCents: cents(9999), notes: '' });
    assert.equal(repo.recurringItems().find((r) => r.name === 'MC')!.amount, 4000);
  });

  test('deleting a recurring cost stops it appearing in new weeks', () => {
    const repo = setup();
    const mc = repo.recurringItems().find((r) => r.name === 'MC')!;
    repo.deleteRecurring(mc.id);
    const week = repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    assert.deepEqual(week.items.map((i) => i.name).sort(), ['Resident DJ rider', 'Resident DJs']);
  });

  test('headline acts and "other" cannot be recurring', () => {
    const repo = setup();
    for (const category of ['headline', 'other'] as const) {
      assert.throws(
        () => repo.addRecurring({ category, name: 'x', amountCents: 100, riderCents: 0, notes: '' }),
        (e) => e instanceof HttpError && e.status === 400,
      );
    }
  });
});
