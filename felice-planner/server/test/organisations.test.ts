// Felice and Alur each have their own planner and recurring costs. The master view combines them.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { CATEGORY_KEYS } from '../../shared/categories.ts';
import { openDb } from '../src/db.ts';
import { buildExport, parseWorkbook } from '../src/excel.ts';
import { createStores } from '../src/stores.ts';
import { HttpError } from '../src/validate.ts';

const cents = (n: number) => Math.round(n * 100);
const M = (key: string) => ({ key, ym: Number(key.replace('-', '')), year: Number(key.slice(0, 4)), month: Number(key.slice(5)) });
const NOV = M('2026-11');
const DEC = M('2026-12');

/** Felice: R10,000 act + R25,000 DJs in Nov W1. Alur: R7,000 act + R12,000 DJs in Nov W1 (same week number). */
function setup() {
  const stores = createStores(openDb(':memory:'));
  const felice = stores.forOrg('felice')!;
  const alur = stores.forOrg('alur')!;
  const week = (s: typeof felice, act: number, rider: number, djs: number, monthNo = 11, weekNo = 1) => {
    const w = s.repo.createWeek({ year: 2026, month: monthNo, weekNo, notes: '' }, false);
    s.repo.addItem(w.id, { category: 'headline', name: 'Act', amountCents: cents(act), riderCents: cents(rider), notes: '' });
    s.repo.addItem(w.id, { category: 'resident', name: 'DJs', amountCents: cents(djs), notes: '' });
    return w;
  };
  return { stores, felice, alur, week };
}

describe('organisations are kept apart', () => {
  test('both companies exist', () => {
    const { stores } = setup();
    assert.deepEqual(stores.organisations.map((o) => o.slug), ['felice', 'alur']);
  });

  test('the same week can exist in both, and each sees only its own', () => {
    const { felice, alur, week } = setup();
    week(felice, 10000, 1000, 25000);
    week(alur, 7000, 500, 12000);
    assert.equal(felice.repo.weekSummaries(202611, 202611).length, 1);
    assert.equal(felice.repo.weekSummaries(202611, 202611)[0]!.total, 36000);
    assert.equal(alur.repo.weekSummaries(202611, 202611)[0]!.total, 19500);
  });

  test('a week or line from one company cannot be reached through the other', () => {
    const { felice, alur, week } = setup();
    const w = week(felice, 10000, 0, 25000);
    const itemId = w.items.length ? w.items[0]!.id : felice.repo.getWeek(w.id).items[0]!.id;
    for (const attempt of [
      () => alur.repo.getWeek(w.id),
      () => alur.repo.deleteWeek(w.id),
      () => alur.repo.updateItem(itemId, { category: 'resident', name: 'x', amountCents: 1, notes: '' }),
      () => alur.repo.deleteItem(itemId),
    ]) {
      assert.throws(attempt, (e) => e instanceof HttpError && e.status === 404);
    }
    assert.equal(felice.repo.getWeek(w.id).items.length, 2, 'nothing was changed');
  });

  test('each company has its own recurring costs, used for its own new weeks', () => {
    const { felice, alur } = setup();
    felice.repo.addRecurring({ category: 'resident', name: 'Felice DJs', amountCents: cents(25000), notes: '' });
    alur.repo.addRecurring({ category: 'resident', name: 'Alur DJs', amountCents: cents(12000), notes: '' });
    assert.deepEqual(felice.repo.recurringItems().map((r) => r.name), ['Felice DJs']);
    assert.deepEqual(alur.repo.recurringItems().map((r) => r.name), ['Alur DJs']);
    const w = alur.repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    assert.deepEqual(w.items.map((i) => i.name), ['Alur DJs']);
    assert.equal(w.items[0]!.amount, 12000);
  });
});

describe('combined (master) view', () => {
  test('totals are the two companies added together, with a breakdown per company', () => {
    const { stores, felice, alur, week } = setup();
    week(felice, 10000, 1000, 25000);
    week(alur, 7000, 500, 12000);
    const report = stores.all().reports.summary(NOV, NOV, 'month');
    assert.equal(report.totals.total, 36000 + 19500);
    assert.deepEqual(report.totals.byOrg.felice!.total, 36000);
    assert.deepEqual(report.totals.byOrg.alur!.total, 19500);
    assert.equal(report.rows[0]!.byOrg.felice, 36000);
    assert.equal(report.rows[0]!.byOrg.alur, 19500);
    // Categories add up across companies too.
    assert.equal(report.totals.byCategory.headline, 17000);
    assert.equal(report.totals.byCategory.rider, 1500);
    assert.equal(report.totals.byCategory.resident, 37000);
    assert.equal(
      CATEGORY_KEYS.reduce((s, k) => s + cents(report.totals.byCategory[k]), 0),
      cents(report.totals.total),
    );
  });

  test('by-week view merges the same week of both companies into one row', () => {
    const { stores, felice, alur, week } = setup();
    week(felice, 10000, 0, 25000);
    week(alur, 7000, 0, 12000);
    week(alur, 3000, 0, 12000, 11, 2);
    const rows = stores.all().reports.summary(NOV, NOV, 'week').rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.total, 35000 + 19000);
    assert.equal(rows[0]!.weeks, 2);
    assert.equal(rows[1]!.byOrg.felice, 0);
    assert.equal(rows[1]!.byOrg.alur, 15000);
  });

  test('a month with nothing in either company is shown as empty, not missing', () => {
    const { stores, felice, week } = setup();
    week(felice, 1000, 0, 1000);
    const rows = stores.all().reports.summary(NOV, DEC, 'month').rows;
    assert.deepEqual(rows.map((r) => r.total), [2000, 0]);
  });

  test('the combined view can read but never change anything', () => {
    const { stores, felice, week } = setup();
    const w = week(felice, 10000, 0, 25000);
    const itemId = felice.repo.getWeek(w.id).items[0]!.id;
    const master = stores.all().repo;
    for (const attempt of [
      () => master.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, false),
      () => master.updateWeekNotes(w.id, 'x'),
      () => master.deleteWeek(w.id),
      () => master.addItem(w.id, { category: 'resident', name: 'x', amountCents: 1, notes: '' }),
      () => master.updateItem(itemId, { category: 'resident', name: 'x', amountCents: 1, notes: '' }),
      () => master.deleteItem(itemId),
      () => master.addRecurring({ category: 'resident', name: 'x', amountCents: 1, notes: '' }),
      () => master.updateRecurring(1, { category: 'resident', name: 'x', amountCents: 1, notes: '' }),
      () => master.deleteRecurring(1),
      () => master.importWeeks([]),
    ]) {
      assert.throws(attempt, (e) => e instanceof HttpError && e.status === 400);
    }
    assert.equal(felice.repo.getWeek(w.id).items.length, 2, 'nothing was changed');
  });

  test('top list and compare work across companies', () => {
    const { stores, felice, alur, week } = setup();
    week(felice, 10000, 1000, 0);
    week(alur, 7000, 500, 0);
    assert.deepEqual(stores.all().reports.top(NOV, NOV, 'headline', 5).map((t) => [t.name, t.total, t.riderTotal, t.count]), [['Act', 17000, 1500, 2]]);
    const f = felice.reports.periodSide(NOV, NOV, 'Felice', 'felice');
    const a = alur.reports.periodSide(NOV, NOV, 'Alur', 'alur');
    assert.equal(f.total, 11000);
    assert.equal(a.total, 7500);
    assert.equal(stores.all().reports.compareMonths(NOV, NOV).a.total, 18500);
  });
});

describe('combined Excel report', () => {
  test('has an Organisation column and importing it into one company skips the other', async () => {
    const { stores, felice, alur, week } = setup();
    week(felice, 10000, 1000, 25000);
    week(alur, 7000, 500, 12000);
    const all = stores.all();
    const report = all.reports.summary(NOV, NOV, 'month');
    const file = await buildExport(report, all.reports.lineItems(NOV, NOV), 'Combined report', all.orgs);

    // Import into a fresh database as Alur: only Alur's rows come in.
    const fresh = createStores(openDb(':memory:'));
    const target = fresh.forOrg('alur')!;
    const parsed = await parseWorkbook(file, 2026, target.orgs[0]);
    target.repo.importWeeks(parsed.weeks);
    assert.equal(target.repo.weekSummaries(202611, 202611)[0]!.total, 19500);
    assert.equal(fresh.forOrg('felice')!.repo.weekSummaries(202611, 202611).length, 0);
    assert.ok(parsed.warnings.some((w) => w.includes('other organisations')));
  });
});

describe('upgrading a database from before organisations existed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fp-legacy-'));
  after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  function makeLegacy(path: string) {
    const db = new DatabaseSync(path);
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE weeks (id INTEGER PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, week_no INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (year, month, week_no));
      CREATE TABLE items (id INTEGER PRIMARY KEY, week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
        category TEXT NOT NULL, name TEXT NOT NULL, amount_cents INTEGER NOT NULL, rider_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE recurring_items (id INTEGER PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, amount_cents INTEGER NOT NULL,
        rider_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO weeks (id, year, month, week_no, notes) VALUES (5, 2026, 11, 1, 'first'), (6, 2026, 11, 2, '');
      INSERT INTO items (week_id, category, name, amount_cents, rider_cents) VALUES (5, 'resident', 'DJs', 2500000, 0), (5, 'headline', 'Act', 1000000, 100000), (6, 'standard', 'MC', 400000, 0);
      INSERT INTO recurring_items (category, name, amount_cents) VALUES ('resident', 'DJs', 2500000);
    `);
    db.close();
  }

  test('everything moves to Felice, nothing is lost, and a backup is written first', () => {
    const path = join(dir, 'legacy.db');
    makeLegacy(path);

    const db = openDb(path);
    const stores = createStores(db);
    const felice = stores.forOrg('felice')!;

    const weeks = felice.repo.weekSummaries(200001, 210012);
    assert.deepEqual(weeks.map((w) => [w.id, w.weekNo, w.total]), [[5, 1, 25000 + 10000 + 1000], [6, 2, 4000]]);
    assert.equal(felice.repo.getWeek(5).notes, 'first');
    assert.equal(felice.repo.getWeek(5).items.length, 2, 'line items survived the rebuild');
    assert.deepEqual(felice.repo.recurringItems().map((r) => r.name), ['DJs']);
    assert.equal(stores.forOrg('alur')!.repo.weekSummaries(200001, 210012).length, 0);
    assert.equal(stores.forOrg('alur')!.repo.recurringItems().length, 0);

    // Alur can now use the same week numbers, and deleting a Felice week still cascades to its lines.
    stores.forOrg('alur')!.repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, false);
    felice.repo.deleteWeek(6);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM items WHERE week_id = 6').get() as { n: number }).n, 0);

    assert.ok(readdirSync(dir).some((f) => f.startsWith('legacy.db.before-organisations-') && f.endsWith('.bak')), 'backup file written');
    db.close();
  });

  test('opening an already-upgraded database again changes nothing and writes no second backup', () => {
    const path = join(dir, 'twice.db');
    makeLegacy(path);
    openDb(path).close();
    const backups = () => readdirSync(dir).filter((f) => f.startsWith('twice.db.before-organisations-')).length;
    assert.equal(backups(), 1);
    const db = openDb(path);
    assert.equal(createStores(db).forOrg('felice')!.repo.weekSummaries(200001, 210012).length, 2);
    assert.equal(backups(), 1);
    db.close();
    assert.ok(existsSync(path));
  });
});
