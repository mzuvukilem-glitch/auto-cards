// Individual Resident DJs: captured per week (or in the recurring list), bulk imported, paid in batches of 5,
// and counted per month. The Resident DJs cost is derived from the DJs, and is never counted twice.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { openDb } from '../src/db.ts';
import { buildExport, buildPaymentSchedule, ImportError, parseResidentDjs, parseWorkbook } from '../src/excel.ts';
import { createStores } from '../src/stores.ts';
import { HttpError } from '../src/validate.ts';

const cents = (n: number) => Math.round(n * 100);
const M = (key: string) => ({ key, ym: Number(key.replace('-', '')), year: Number(key.slice(0, 4)), month: Number(key.slice(5)) });
const NOV = M('2026-11');
const DEC = M('2026-12');
const JAN = M('2027-01');
const dj = (name: string, rate: number, notes = '') => ({ name, rateCents: cents(rate), notes });

function setup() {
  const stores = createStores(openDb(':memory:'));
  const felice = stores.forOrg('felice')!;
  const alur = stores.forOrg('alur')!;
  const week = (s: typeof felice, month: number, weekNo: number) => s.repo.createWeek({ year: 2026, month, weekNo, notes: '' }, false);
  const residentCost = (s: typeof felice, month = 11) => s.repo.weekSummaries(2026 * 100 + month, 2026 * 100 + month).reduce((t, w) => t + w.byCategory.resident, 0);
  return { stores, felice, alur, week, residentCost };
}

async function sheet(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DJs');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe('adding resident DJs to a week', () => {
  test('the Resident DJs cost is the sum of the DJs, and the week total follows', () => {
    const { felice, week, residentCost } = setup();
    const w = week(felice, 11, 1);
    felice.repo.addResidentDj(w.id, dj('DJ A', 3000));
    felice.repo.addResidentDj(w.id, dj('DJ B', 4500.5, 'headliner support'));
    assert.equal(residentCost(felice), 7500.5);
    const [summary] = felice.repo.weekSummaries(202611, 202611);
    assert.equal(summary!.total, 7500.5);
    const items = felice.repo.getWeek(w.id).items;
    assert.ok(items.every((i) => i.isDj && i.category === 'resident'));
    assert.equal(items.find((i) => i.name === 'DJ B')!.notes, 'headliner support');
  });

  test('a lump-sum Resident DJs line stops counting once DJs exist, and counts again if they are removed', () => {
    const { felice, week, residentCost } = setup();
    const w = week(felice, 11, 1);
    felice.repo.addItem(w.id, { category: 'resident', name: 'Resident DJs', amountCents: cents(25000), notes: '' });
    assert.equal(residentCost(felice), 25000);

    const a = felice.repo.addResidentDj(w.id, dj('DJ A', 3000));
    const b = felice.repo.addResidentDj(w.id, dj('DJ B', 4000));
    assert.equal(residentCost(felice), 7000, 'derived from the DJs only');
    assert.equal(felice.repo.getWeek(w.id).items.length, 3, 'the lump-sum line is kept, not deleted');

    felice.repo.deleteItem(a.id);
    felice.repo.deleteItem(b.id);
    assert.equal(residentCost(felice), 25000);
  });

  test('reports, the top list and the Excel export all agree with the derived cost', async () => {
    const { felice, week } = setup();
    const w = week(felice, 11, 1);
    felice.repo.addItem(w.id, { category: 'resident', name: 'Resident DJs', amountCents: cents(25000), notes: '' });
    felice.repo.addResidentDj(w.id, dj('DJ A', 3000));
    felice.repo.addResidentDj(w.id, dj('DJ B', 4000));

    assert.deepEqual(felice.reports.top(NOV, NOV, 'resident', 10).map((t) => [t.name, t.total]), [['DJ B', 4000], ['DJ A', 3000]]);
    const lines = felice.reports.lineItems(NOV, NOV);
    assert.deepEqual(lines.map((l) => l.name).sort(), ['DJ A', 'DJ B']);

    // Importing that export into a fresh database gives the same totals and keeps the DJs as DJs.
    const report = felice.reports.summary(NOV, NOV, 'month');
    const file = await buildExport(report, lines, 'Felice report', felice.orgs);
    const fresh = createStores(openDb(':memory:')).forOrg('felice')!;
    fresh.repo.importWeeks((await parseWorkbook(file, 2026)).weeks);
    const back = fresh.repo.weekSummaries(202611, 202611)[0]!;
    assert.equal(back.byCategory.resident, 7000);
    assert.ok(fresh.repo.getWeek(back.id).items.every((i) => i.isDj));
  });

  test('a DJ can be in a week once, whatever the capitalisation, and stays a Resident DJ', () => {
    const { felice, week } = setup();
    const w = week(felice, 11, 1);
    const a = felice.repo.addResidentDj(w.id, dj('DJ A', 3000));
    const b = felice.repo.addResidentDj(w.id, dj('DJ B', 4000));
    const clash = (e: unknown) => e instanceof HttpError && e.status === 409;
    assert.throws(() => felice.repo.addResidentDj(w.id, dj('  dj a ', 100)), clash);
    assert.throws(() => felice.repo.updateItem(b.id, { category: 'resident', name: 'dj a', amountCents: 1, notes: '' }), clash);
    assert.throws(
      () => felice.repo.updateItem(a.id, { category: 'standard', name: 'DJ A', amountCents: 1, notes: '' }),
      (e) => e instanceof HttpError && e.status === 400,
    );
    // Changing the rate, notes or the capitalisation of your own name is fine, and the DJ stays a DJ.
    const saved = felice.repo.updateItem(a.id, { category: 'resident', name: 'DJ a', amountCents: cents(3500), notes: 'new rate' });
    assert.equal(saved.amount, 3500);
    assert.ok(saved.isDj);
    // The same DJ can be in another week.
    felice.repo.addResidentDj(week(felice, 11, 2).id, dj('DJ A', 3000));
  });

  test('the other company cannot reach the week, and the combined view cannot change anything', () => {
    const { stores, felice, alur, week } = setup();
    const w = week(felice, 11, 1);
    assert.throws(() => alur.repo.addResidentDj(w.id, dj('DJ A', 1)), (e) => e instanceof HttpError && e.status === 404);
    assert.throws(() => alur.repo.paymentSchedule(w.id), (e) => e instanceof HttpError && e.status === 404);
    assert.throws(() => stores.all().repo.addResidentDj(w.id, dj('DJ A', 1)), (e) => e instanceof HttpError && e.status === 400);
    assert.throws(() => stores.all().repo.importRecurringDjs([dj('DJ A', 1)]), (e) => e instanceof HttpError && e.status === 400);
    assert.equal(felice.repo.getWeek(w.id).items.length, 0);
  });
});

describe('recurring resident DJs', () => {
  test('are added to every new week as that week’s own DJs', () => {
    const { felice, residentCost } = setup();
    felice.repo.addRecurringDj(dj('DJ A', 3000));
    felice.repo.addRecurringDj(dj('DJ B', 4000));
    assert.throws(() => felice.repo.addRecurringDj(dj('dj a', 1)), (e) => e instanceof HttpError && e.status === 409);

    const first = felice.repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    assert.ok(first.items.every((i) => i.isDj));
    assert.equal(residentCost(felice), 7000);

    // Changing the standing list affects new weeks only; the first week keeps its own figures.
    const recurring = felice.repo.recurringItems().find((r) => r.name === 'DJ A')!;
    felice.repo.updateRecurring(recurring.id, { category: 'resident', name: 'DJ A', amountCents: cents(3600), notes: '' });
    const second = felice.repo.createWeek({ year: 2026, month: 11, weekNo: 2, notes: '' }, true);
    assert.equal(felice.repo.getWeek(first.id).items.find((i) => i.name === 'DJ A')!.amount, 3000);
    assert.equal(felice.repo.getWeek(second.id).items.find((i) => i.name === 'DJ A')!.amount, 3600);
  });

  test('a week can then drop one, add another, or change a rate without touching the list', () => {
    const { felice } = setup();
    felice.repo.addRecurringDj(dj('DJ A', 3000));
    const w = felice.repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, true);
    felice.repo.deleteItem(w.items[0]!.id);
    felice.repo.addResidentDj(w.id, dj('Guest DJ', 1500));
    assert.deepEqual(felice.repo.getWeek(w.id).items.map((i) => i.name), ['Guest DJ']);
    assert.deepEqual(felice.repo.recurringItems().map((r) => r.name), ['DJ A']);
  });
});

describe('bulk import of resident DJs', () => {
  test('reads an Excel list, previews it, then adds the new DJs and updates the rates of existing ones', async () => {
    const { felice, week, residentCost } = setup();
    const w = week(felice, 11, 1);
    felice.repo.addResidentDj(w.id, dj('DJ A', 3000));

    const file = await sheet([
      ['Resident DJ payments'], // a title above the header is fine
      ['Name', 'Rate', 'Notes'],
      ['DJ A', 3200, 'rate went up'],
      ['DJ B', 'R1 500,50', ''],
      ['dj a', 99, ''], // repeat of the first
      ['DJ C', 'abc', ''], // not a rate
      [null, 100, ''], // no name
      [null, null, null], // blank row
      ['DJ D', 0, 'unpaid guest'],
    ]);
    const parsed = await parseResidentDjs(file);
    assert.deepEqual(parsed.djs.map((d) => [d.name, d.rateCents]), [['DJ A', 320000], ['DJ B', 150050], ['DJ D', 0]]);
    assert.equal(parsed.warnings.length, 3, parsed.warnings.join(' | '));
    assert.ok(parsed.warnings.some((m) => m.includes('already in the list')));

    const preview = felice.repo.previewResidentDjs(w.id, parsed.djs);
    assert.deepEqual(preview.rows.map((r) => [r.name, r.status, r.currentRate]), [['DJ A', 'update', 3000], ['DJ B', 'new', null], ['DJ D', 'new', null]]);
    assert.equal(preview.applied, false);
    assert.equal(residentCost(felice), 3000, 'a preview changes nothing');

    const done = felice.repo.importResidentDjs(w.id, parsed.djs);
    assert.deepEqual([done.added, done.updated, done.unchanged, done.applied], [2, 1, 0, true]);
    assert.equal(residentCost(felice), 3200 + 1500.5 + 0);
    assert.equal(felice.repo.getWeek(w.id).items.find((i) => i.name === 'DJ A')!.notes, 'rate went up');

    // Importing the same file again changes nothing.
    const again = felice.repo.importResidentDjs(w.id, parsed.djs);
    assert.deepEqual([again.added, again.updated, again.unchanged], [0, 0, 3]);
    assert.equal(felice.repo.getWeek(w.id).items.length, 3);
  });

  test('reads a CSV saved by South African Excel (semicolons, decimal commas, byte-order mark)', async () => {
    const csv = '\uFEFFDJ;Fee;Reference\r\nDJ A;1500,50;ref 1\r\nDJ B;"2 000";\r\nDJ C;1,500.25;\r\n';
    const parsed = await parseResidentDjs(Buffer.from(csv, 'utf8'));
    assert.deepEqual(parsed.djs.map((d) => [d.name, d.rateCents, d.notes]), [
      ['DJ A', 150050, 'ref 1'],
      ['DJ B', 200000, ''],
      ['DJ C', 150025, ''],
    ]);
    assert.equal(parsed.warnings.length, 0);
    const comma = await parseResidentDjs(Buffer.from('Name,Rate\nDJ A,1500\nDJ B,"1,200"\n'));
    assert.deepEqual(comma.djs.map((d) => d.rateCents), [150000, 120000]);
  });

  test('a file without the right columns, or with no DJs, is refused with a clear message', async () => {
    await assert.rejects(parseResidentDjs(await sheet([['Artist', 'Price'], ['DJ A', 1]])), (e) => e instanceof ImportError && /Name/.test(e.message));
    await assert.rejects(parseResidentDjs(await sheet([['Name', 'Rate']])), (e) => e instanceof ImportError && /No DJs/.test(e.message));
    await assert.rejects(parseResidentDjs(Buffer.from([0x50, 0x4b, 0x00, 0x01])), (e) => e instanceof ImportError);
  });

  test('imports into the recurring list too', async () => {
    const { felice } = setup();
    const parsed = await parseResidentDjs(await sheet([['Name', 'Rate'], ['DJ A', 3000], ['DJ B', 4000]]));
    const preview = felice.repo.previewRecurringDjs(parsed.djs);
    assert.deepEqual(preview.rows.map((r) => r.status), ['new', 'new']);
    assert.equal(felice.repo.recurringItems().length, 0);
    felice.repo.importRecurringDjs(parsed.djs);
    assert.deepEqual(felice.repo.recurringItems().map((r) => [r.name, r.amount, r.isDj]), [['DJ A', 3000, true], ['DJ B', 4000, true]]);
  });
});

describe('bulk payment schedule', () => {
  test('DJs are listed by name and paid in batches of 5, and every total adds up', async () => {
    const { felice, week, residentCost } = setup();
    const w = week(felice, 11, 1);
    // Added out of order, with an odd amount, to check the ordering and that the cents add up.
    const names = ['DJ 09', 'dj 02', 'DJ 11', 'DJ 01', 'DJ 12', 'DJ 05', 'DJ 03', 'DJ 10', 'DJ 04', 'DJ 08', 'DJ 07', 'DJ 06'];
    names.forEach((n, i) => felice.repo.addResidentDj(w.id, dj(n, 1000 + i * 100 + 0.35)));

    const s = felice.repo.paymentSchedule(w.id);
    assert.equal(s.batchSize, 5);
    assert.deepEqual(s.batches.map((b) => b.payments.length), [5, 5, 2]);
    assert.deepEqual(
      s.batches.flatMap((b) => b.payments.map((p) => p.name.toLowerCase())),
      names.map((n) => n.toLowerCase()).sort(),
    );
    assert.deepEqual(s.batches.flatMap((b) => b.payments.map((p) => p.no)), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.equal(s.count, 12);
    assert.equal(s.total, residentCost(felice));
    assert.equal(cents(s.batches.reduce((t, b) => t + b.total, 0)), cents(s.total));
    for (const b of s.batches) assert.equal(cents(b.total), b.payments.reduce((t, p) => t + cents(p.amount), 0));

    // The Excel file carries the same batches and the same total.
    const file = await buildPaymentSchedule(s, 'Felice');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Payment schedule')!;
    const labels = new Map<string, number>();
    ws.eachRow((row) => {
      const label = String(row.getCell(3).value ?? '');
      if (/total/i.test(label)) labels.set(label, Number(row.getCell(4).value));
    });
    assert.equal(labels.get('Total to pay'), s.total);
    assert.equal(labels.get('Batch 3 total'), s.batches[2]!.total);
  });

  test('exactly 5 DJs is one batch, 6 is two, and a week with none has no batches', () => {
    const { felice, week } = setup();
    const w = week(felice, 11, 1);
    assert.deepEqual(felice.repo.paymentSchedule(w.id).batches, []);
    for (let i = 1; i <= 5; i++) felice.repo.addResidentDj(w.id, dj(`DJ ${i}`, 100));
    assert.deepEqual(felice.repo.paymentSchedule(w.id).batches.map((b) => b.payments.length), [5]);
    felice.repo.addResidentDj(w.id, dj('DJ 6', 100));
    assert.deepEqual(felice.repo.paymentSchedule(w.id).batches.map((b) => b.payments.length), [5, 1]);
  });

  test('only the DJs are paid: a lump-sum line and rider costs are not part of it', () => {
    const { felice, week } = setup();
    const w = week(felice, 11, 1);
    felice.repo.addItem(w.id, { category: 'resident', name: 'Resident DJs', amountCents: cents(25000), notes: '' });
    felice.repo.addItem(w.id, { category: 'rider', name: 'Resident DJ rider', amountCents: cents(6250), notes: '' });
    felice.repo.addResidentDj(w.id, dj('DJ A', 3000));
    const s = felice.repo.paymentSchedule(w.id);
    assert.equal(s.total, 3000);
    assert.equal(s.count, 1);
  });
});

describe('resident DJ bookings per month', () => {
  function bookings() {
    const ctx = setup();
    const { felice, alur, week } = ctx;
    // Felice: Zed on 3 weeks of November and 1 of December. Amy on 2 weeks of November (typed two ways).
    for (const n of [1, 2, 3]) felice.repo.addResidentDj(week(felice, 11, n).id, dj('Zed', 1000 + n));
    felice.repo.addResidentDj(week(felice, 12, 1).id, dj('Zed', 2000));
    felice.repo.addResidentDj(felice.repo.findWeek(2026, 11, 1)!.id, dj('Amy', 500));
    felice.repo.addResidentDj(felice.repo.findWeek(2026, 11, 2)!.id, dj('amy', 600));
    // A lump-sum line is not a booking.
    felice.repo.addItem(felice.repo.findWeek(2026, 11, 3)!.id, { category: 'resident', name: 'Resident DJs', amountCents: cents(25000), notes: '' });
    // Alur has Zed too, in the same November week as Felice.
    felice.repo.findWeek(2026, 11, 1);
    alur.repo.addResidentDj(week(alur, 11, 1).id, dj('Zed', 700));
    return ctx;
  }

  test('counts each DJ per month, most booked first, with what the rates came to', () => {
    const { felice } = bookings();
    const r = felice.reports.residentBookings(NOV, JAN);
    assert.deepEqual(r.months.map((m) => m.key), ['2026-11', '2026-12', '2027-01']);
    assert.deepEqual(r.rows.map((x) => [x.name, x.bookings]), [['Zed', 4], ['Amy', 2]]);
    const zed = r.rows[0]!;
    assert.deepEqual(zed.byMonth['2026-11'], { bookings: 3, paid: 1001 + 1002 + 1003 });
    assert.deepEqual(zed.byMonth['2026-12'], { bookings: 1, paid: 2000 });
    assert.equal(zed.byMonth['2027-01'], undefined);
    assert.equal(zed.paid, 1001 + 1002 + 1003 + 2000);
    assert.equal(r.rows[1]!.byMonth['2026-11']!.bookings, 2, 'Amy and amy are the same DJ');
  });

  test('totals add up by month and overall', () => {
    const { felice } = bookings();
    const r = felice.reports.residentBookings(NOV, DEC);
    assert.deepEqual(r.totals.byMonth['2026-11'], { bookings: 5, paid: 1001 + 1002 + 1003 + 500 + 600 });
    assert.deepEqual(r.totals.byMonth['2026-12'], { bookings: 1, paid: 2000 });
    assert.equal(r.totals.bookings, r.rows.reduce((t, x) => t + x.bookings, 0));
    assert.equal(cents(r.totals.paid), r.rows.reduce((t, x) => t + cents(x.paid), 0));
  });

  test('only the months asked for are counted, and an empty period is an empty report', () => {
    const { felice } = bookings();
    assert.equal(felice.reports.residentBookings(DEC, DEC).rows.length, 1);
    assert.deepEqual(felice.reports.residentBookings(JAN, JAN).rows, []);
  });

  test('the combined view counts a DJ booked by both companies twice', () => {
    const { stores, felice, alur } = bookings();
    const all = stores.all().reports.residentBookings(NOV, NOV);
    assert.equal(all.rows.find((x) => x.name === 'Zed')!.byMonth['2026-11']!.bookings, 4);
    assert.equal(felice.reports.residentBookings(NOV, NOV).rows.find((x) => x.name === 'Zed')!.bookings, 3);
    assert.equal(alur.reports.residentBookings(NOV, NOV).rows.length, 1);
  });
});

describe('upgrading a database from before individual resident DJs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fp-dj-'));
  after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  test('existing lump-sum lines keep their totals, and DJs can then be added', () => {
    const path = join(dir, 'before-djs.db');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE organisations (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO organisations (id, slug, name, color, sort) VALUES (1, 'felice', 'Felice', '#4338ca', 1), (2, 'alur', 'Alur', '#0f766e', 2);
      CREATE TABLE weeks (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organisations(id), year INTEGER NOT NULL, month INTEGER NOT NULL,
        week_no INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (org_id, year, month, week_no));
      CREATE TABLE items (id INTEGER PRIMARY KEY, week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE, category TEXT NOT NULL,
        name TEXT NOT NULL, amount_cents INTEGER NOT NULL, rider_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE recurring_items (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES organisations(id), category TEXT NOT NULL, name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL, rider_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO weeks (id, org_id, year, month, week_no) VALUES (5, 1, 2026, 11, 1);
      INSERT INTO items (week_id, category, name, amount_cents) VALUES (5, 'resident', 'Resident DJs', 2500000);
      INSERT INTO recurring_items (org_id, category, name, amount_cents) VALUES (1, 'resident', 'Resident DJs', 2500000);
    `);
    old.close();

    const db = openDb(path);
    const felice = createStores(db).forOrg('felice')!;
    assert.equal(felice.repo.weekSummaries(202611, 202611)[0]!.byCategory.resident, 25000, 'the lump sum still counts');
    assert.equal(felice.repo.getWeek(5).items[0]!.isDj, false);
    assert.equal(felice.repo.recurringItems()[0]!.isDj, false);

    felice.repo.addResidentDj(5, dj('DJ A', 3000));
    assert.equal(felice.repo.weekSummaries(202611, 202611)[0]!.byCategory.resident, 3000);
    db.close();
    openDb(path).close(); // opening again is harmless
  });
});
