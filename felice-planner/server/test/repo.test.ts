// Data access and reports: the guards and edge cases that the feature tests do not reach.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openDb } from '../src/db.ts';
import { createReports } from '../src/reports.ts';
import { createRepo } from '../src/repo.ts';
import { createStores } from '../src/stores.ts';
import { HttpError } from '../src/validate.ts';
import { workbook } from './support.ts';
import { listSheets, loadWorkbook, readSheet } from '../src/actuals.ts';

const cents = (n: number) => Math.round(n * 100);
const status = (code: number, pattern: RegExp) => (e: unknown) => e instanceof HttpError && e.status === code && pattern.test(e.message);
function setup() {
  const db = openDb(':memory:');
  const stores = createStores(db);
  const felice = stores.forOrg('felice')!;
  const week = (weekNo = 1, month = 11) => felice.repo.createWeek({ year: 2026, month, weekNo, notes: '' }, false);
  return { db, stores, felice, week };
}

describe('scopes', () => {
  test('a repo or a set of reports with no organisation is refused', () => {
    const { db, felice } = setup();
    assert.throws(() => createRepo(db, []), /needs at least one organisation/);
    assert.throws(() => createReports(db, felice.repo, []), /at least one organisation/);
  });
});

describe('totals', () => {
  test('a line in a category that has since been removed is not counted (the data is kept)', () => {
    const { db, felice, week } = setup();
    const w = week();
    felice.repo.addItem(w.id, { category: 'other', name: 'Counted', amountCents: cents(100), notes: '' });
    db.prepare("INSERT INTO items (week_id, category, name, amount_cents) VALUES (?, 'retired', 'Old', 99900)").run(w.id);
    const [summary] = felice.repo.weekSummaries(202611, 202611);
    assert.equal(summary!.total, 100);
    assert.equal(felice.repo.getWeek(w.id).items.length, 2, 'the old line is still there');
  });
});

describe('resident DJs on a week', () => {
  test('a DJ stays under Resident DJs, and cannot be renamed to another DJ\'s name', () => {
    const { felice, week } = setup();
    const w = week();
    const a = felice.repo.addResidentDj(w.id, { name: 'A', rateCents: 100, notes: '' });
    felice.repo.addResidentDj(w.id, { name: 'B', rateCents: 100, notes: '' });
    const input = (category: 'resident' | 'standard', name: string) => ({ category, name, amountCents: 100, notes: '' });
    assert.throws(() => felice.repo.updateItem(a.id, input('standard', 'A')), status(400, /must stay under Resident DJs/));
    assert.throws(() => felice.repo.updateItem(a.id, input('resident', 'b')), status(409, /already booked/));
    assert.equal(felice.repo.updateItem(a.id, input('resident', 'A2')).name, 'A2');
    assert.equal(felice.repo.updateItem(a.id, input('resident', 'a2')).name, 'a2', 'changing only the capitals is the same DJ');
  });
});

describe('standing resident DJs', () => {
  test('one stays under Resident DJs and cannot take another standing DJ\'s name', () => {
    const { felice } = setup();
    const a = felice.repo.addRecurringDj({ name: 'A', rateCents: 100, notes: '' });
    felice.repo.addRecurringDj({ name: 'B', rateCents: 100, notes: '' });
    const input = (category: 'resident' | 'standard', name: string) => ({ category, name, amountCents: 200, notes: 'n' });
    assert.throws(() => felice.repo.updateRecurring(a.id, input('standard', 'A')), status(400, /must stay under Resident DJs/));
    assert.throws(() => felice.repo.updateRecurring(a.id, input('resident', ' b ')), status(409, /already in the recurring list/));
    const renamed = felice.repo.updateRecurring(a.id, input('resident', 'A2'));
    assert.deepEqual([renamed.name, renamed.amount, renamed.isDj], ['A2', 2, true]);
    assert.equal(felice.repo.updateRecurring(a.id, input('resident', 'A2')).name, 'A2', 'saving it unchanged is fine');
  });

  test('an ordinary recurring cost is never a DJ, and a new week gets the standing DJs as its own', () => {
    const { felice } = setup();
    const mc = felice.repo.addRecurring({ category: 'standard', name: 'MC', amountCents: 400, notes: '', dj: true });
    assert.equal(mc.isDj, false, 'a recurring cost added this way cannot be marked as a DJ');
    felice.repo.addRecurringDj({ name: 'Standing DJ', rateCents: 900, notes: '' });
    const week = felice.repo.createWeek({ year: 2026, month: 12, weekNo: 1, notes: '' }, true);
    assert.deepEqual(week.items.map((i) => [i.name, i.isDj]).sort(), [['MC', false], ['Standing DJ', true]]);
  });
});

describe('riders', () => {
  test('a rider whose total is absurdly large is refused', () => {
    const { felice, week } = setup();
    const act = felice.repo.addItem(week().id, { category: 'headline', name: 'A', amountCents: 100, riderCents: 0, notes: '' });
    assert.throws(() => felice.repo.setItemRider(act.id, [{ name: 'Gold', unitCents: 100_000_000, quantity: 9999 }]), status(400, /rider total is too large/));
    assert.equal(felice.repo.getWeek(act.weekId).items[0]!.riderCost, 0, 'nothing was saved');
  });
});

describe('importing weeks', () => {
  const line = (name: string) => ({ category: 'other' as const, name, amountCents: 100, notes: '' });

  test('a new week is created with its notes (or none), and an existing week\'s notes change only when the file has notes', () => {
    const { felice } = setup();
    felice.repo.importWeeks([
      { year: 2026, month: 11, weekNo: 1, items: [line('a')] },
      { year: 2026, month: 11, weekNo: 2, notes: 'second', items: [line('b')] },
    ]);
    const notes = () => felice.repo.weekSummaries(202611, 202611).map((w) => [w.weekNo, w.notes]);
    assert.deepEqual(notes(), [[1, ''], [2, 'second']]);
    felice.repo.importWeeks([
      { year: 2026, month: 11, weekNo: 1, notes: 'now has notes', items: [line('a2')] },
      { year: 2026, month: 11, weekNo: 2, items: [line('b2')] },
    ]);
    assert.deepEqual(notes(), [[1, 'now has notes'], [2, 'second']]);
    assert.deepEqual(felice.repo.getWeek(felice.repo.weekSummaries(202611, 202611)[0]!.id).items.map((i) => i.name), ['a2'], 'the lines were replaced');
  });
});

describe('resident bookings report', () => {
  test('DJs with the same number of bookings are listed by name', () => {
    const { felice, week } = setup();
    const w = week();
    for (const name of ['Zed', 'Amy', 'Moe']) felice.repo.addResidentDj(w.id, { name, rateCents: 100, notes: '' });
    felice.repo.addResidentDj(week(2).id, { name: 'Moe', rateCents: 100, notes: '' });
    const report = felice.reports.residentBookings({ key: '2026-11', ym: 202611, year: 2026, month: 11 }, { key: '2026-11', ym: 202611, year: 2026, month: 11 });
    assert.deepEqual(report.rows.map((r) => [r.name, r.bookings]), [['Moe', 2], ['Amy', 1], ['Zed', 1]]);
  });
});

describe('reading an expense workbook tab', () => {
  const tab = async (rows: (string | number | null)[][]) => (await loadWorkbook(await workbook({ T: rows }))).getWorksheet('T')!;

  test('a section with no name is called "(untitled section)"', async () => {
    const read = readSheet(await tab([['#', '', 'AMOUNT DUE'], [1, 'Something', 100], ['SUBTOTAL', 'SUBTOTAL', 100]]));
    assert.equal(read.sections[0]!.heading, '(untitled section)');
    assert.match(read.warnings.join(' '), /not recognised/);
  });

  test('a SUBTOTAL row with no usable amount falls back to adding the lines up, with a warning', async () => {
    const read = readSheet(await tab([['#', 'HOSTS', 'AMOUNT DUE'], [1, 'A', 100], [2, 'B', 50], ['SUBTOTAL', 'SUBTOTAL', 'n/a']]));
    assert.equal(read.sections[0]!.sheetCents, 15000);
    assert.match(read.warnings[0]!, /no subtotal for this section, so its amounts were added up/);
  });

  test('a workbook with no weekly tab suggests nothing', async () => {
    const wb = await loadWorkbook(await workbook({ Cover: [['hello']], Notes: [['x']] }));
    assert.deepEqual(listSheets(wb), { sheets: [{ name: 'Cover', total: 0, sections: 0 }, { name: 'Notes', total: 0, sections: 0 }], suggested: null });
  });
});
