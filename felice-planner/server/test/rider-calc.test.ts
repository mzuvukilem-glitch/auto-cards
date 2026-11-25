// The rider price list and the rider calculator: the total rider cost of a headline act or host.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import { openDb } from '../src/db.ts';
import { parseRiderPrices, ImportError } from '../src/excel.ts';
import { createStores } from '../src/stores.ts';
import { HttpError } from '../src/validate.ts';
const cents = (n: number) => Math.round(n * 100);

function setup() {
  const db = openDb(':memory:');
  const stores = createStores(db);
  const felice = stores.forOrg('felice')!;
  const alur = stores.forOrg('alur')!;
  const week = (s: typeof felice, weekNo = 1) => s.repo.createWeek({ year: 2026, month: 11, weekNo, notes: '' }, false);
  const act = (s: typeof felice, weekId: number, name = 'Headliner', rate = 40000) =>
    s.repo.addItem(weekId, { category: 'headline', name, amountCents: cents(rate), riderCents: 0, notes: '' });
  const host = (s: typeof felice, weekId: number, name = 'Host', rate = 8000) =>
    s.repo.addItem(weekId, { category: 'hosts', name, amountCents: cents(rate), riderCents: 0, notes: '' });
  const count = (sql: string, ...args: number[]) => Number((db.prepare(sql).get(...args) as { n: number }).n);
  return { db, stores, felice, alur, week, act, host, count };
}
const line = (name: string, unit: number, quantity: number) => ({ name, unitCents: cents(unit), quantity });
async function xlsx(sheets: Record<string, (string | number | null)[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r));
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

describe('the rider price list', () => {
  test('items are added, changed and removed, and an item is in the list once', () => {
    const { felice } = setup();
    const a = felice.repo.addRiderPrice({ name: 'Red bull', costCents: cents(16.83) });
    assert.equal(a.cost, 16.83);
    assert.throws(() => felice.repo.addRiderPrice({ name: '  red BULL ', costCents: 100 }), (e) => e instanceof HttpError && e.status === 409);
    felice.repo.addRiderPrice({ name: 'Hubbly', costCents: cents(25) });
    assert.deepEqual(felice.repo.riderPrices().map((p) => p.name), ['Hubbly', 'Red bull']);
    assert.equal(felice.repo.updateRiderPrice(a.id, { name: 'Red bull', costCents: cents(17.5) }).cost, 17.5);
    assert.throws(() => felice.repo.updateRiderPrice(a.id, { name: 'Hubbly', costCents: 1 }), (e) => e instanceof HttpError && e.status === 409);
    felice.repo.deleteRiderPrice(a.id);
    assert.deepEqual(felice.repo.riderPrices().map((p) => p.name), ['Hubbly']);
  });

  test('each organisation has its own list, and the combined view can read but not write', () => {
    const { stores, felice, alur } = setup();
    const price = felice.repo.addRiderPrice({ name: 'Tonic', costCents: cents(7.08) });
    assert.deepEqual(alur.repo.riderPrices(), []);
    assert.throws(() => alur.repo.updateRiderPrice(price.id, { name: 'Tonic', costCents: 1 }), (e) => e instanceof HttpError && e.status === 404);
    assert.throws(() => alur.repo.deleteRiderPrice(price.id), (e) => e instanceof HttpError && e.status === 404);
    alur.repo.addRiderPrice({ name: 'Tonic', costCents: cents(9) }); // the same name is fine in another company
    assert.equal(stores.all().repo.riderPrices().length, 2);
    assert.throws(() => stores.all().repo.addRiderPrice({ name: 'X', costCents: 1 }), (e) => e instanceof HttpError && e.status === 400);
  });
});

describe('importing a price list', () => {
  test('finds the price list on whichever tab has it, trims names, ignores the "0" placeholder and repeats', async () => {
    const file = await xlsx({
      Planner: [['#', 'ARTISTS', 'RIDER', 'COST incl VAT'], [1, 'Someone', 'Red bull', 16.83]], // looks similar, but has no item column
      Sheet1: [['Beverage', 'Cost'], ['Hennessey VSOP', 897], ['Jagermeister ', 301.87], ['0', 0], ['Red bull', 'R16,83'], ['red bull', 20], [null, null]],
    });
    const parsed = await parseRiderPrices(file);
    assert.deepEqual(parsed.prices, [
      { name: 'Hennessey VSOP', costCents: cents(897) },
      { name: 'Jagermeister', costCents: cents(301.87) },
      { name: 'Red bull', costCents: cents(16.83) },
    ]);
    assert.equal(parsed.warnings.length, 1);
    assert.match(parsed.warnings[0]!, /Row 6 skipped: red bull is already in the list/);
  });

  test('"Item" and "Price", and a CSV file, are understood too', async () => {
    const parsed = await parseRiderPrices(Buffer.from('Item;Cost incl VAT\r\nTonic;7,08\r\nWater;5.75\r\n', 'utf8'));
    assert.deepEqual(parsed.prices.map((p) => [p.name, p.costCents]), [['Tonic', 708], ['Water', 575]]);
    const byPrice = await parseRiderPrices(await xlsx({ A: [['Product', 'Price'], ['Ice', 65.69]] }));
    assert.equal(byPrice.prices[0]!.costCents, 6569);
  });

  test('a bad cost is reported and skipped, and a file with no price list says so', async () => {
    const parsed = await parseRiderPrices(await xlsx({ A: [['Item', 'Cost'], ['Fine', 10], ['Broken', 'ten'], ['Negative', -5]] }));
    assert.equal(parsed.prices.length, 1);
    assert.equal(parsed.warnings.length, 2);
    await assert.rejects(parseRiderPrices(await xlsx({ A: [['Colour', 'Size'], ['red', 'big']] })), (e) => e instanceof ImportError && /No header row/.test(e.message));
    await assert.rejects(parseRiderPrices(await xlsx({ A: [['Item', 'Cost']] })), (e) => e instanceof ImportError && /No items/.test(e.message));
  });

  test('a preview changes nothing; importing adds new items and updates changed costs; a second import is a no-op', () => {
    const { felice } = setup();
    felice.repo.addRiderPrice({ name: 'Red bull', costCents: cents(16.83) });
    felice.repo.addRiderPrice({ name: 'Keep me', costCents: cents(1) });
    const file = [
      { name: 'red bull', costCents: cents(18) },
      { name: 'Hubbly', costCents: cents(25) },
    ];
    const preview = felice.repo.previewRiderPrices(file);
    assert.deepEqual([preview.added, preview.updated, preview.unchanged, preview.applied], [1, 1, 0, false]);
    assert.equal(preview.rows[0]!.currentCost, 16.83);
    assert.equal(felice.repo.riderPrices().length, 2, 'the preview wrote nothing');
    const done = felice.repo.importRiderPrices(file);
    assert.deepEqual([done.added, done.updated, done.applied], [1, 1, true]);
    const names = felice.repo.riderPrices().map((p) => [p.name, p.cost]);
    assert.deepEqual(names, [['Hubbly', 25], ['Keep me', 1], ['Red bull', 18]], 'the existing spelling is kept, and nobody is removed');
    const again = felice.repo.importRiderPrices(file);
    assert.deepEqual([again.added, again.updated, again.unchanged], [0, 0, 2]);
  });
});

describe('the rider calculator', () => {
  test('the rider cost of a headline act is the total of its items, to the cent', () => {
    const { felice, week, act } = setup();
    const w = week(felice);
    const a = act(felice, w.id, 'Sam Deep');
    const { item, rider } = felice.repo.setItemRider(a.id, [
      line('Hennessey VSOP', 897, 1),
      line('Don Julio', 1015.34, 1),
      line('Fitch n Leeds tonic', 7.08, 3),
      line('Red bull', 16.83, 3),
      line('Hubbly', 25, 2),
    ]);
    assert.equal(rider.total, 2034.07); // the figure the Rider Calc workbook gives for the same rider
    assert.equal(item.riderCost, 2034.07);
    assert.equal(item.riderItems, 5);
    assert.deepEqual(rider.lines[2], { name: 'Fitch n Leeds tonic', unitCost: 7.08, quantity: 3, total: 21.24 });
    assert.equal(felice.repo.itemRider(a.id).total, 2034.07);
  });

  test('hosts have a rider too, and the week total and the Rider Costs report follow the calculation', () => {
    const { felice, week, act, host } = setup();
    const w = week(felice);
    const a = act(felice, w.id, 'Headliner', 40000);
    const h = host(felice, w.id, 'Host', 8000);
    felice.repo.setItemRider(a.id, [line('Cognac', 897, 2)]);
    felice.repo.setItemRider(h.id, [line('Water', 5.75, 4), line('Food', 500, 1)]);
    const [summary] = felice.repo.weekSummaries(202611, 202611);
    assert.equal(summary!.byCategory.headline, 40000);
    assert.equal(summary!.byCategory.hosts, 8000);
    assert.equal(summary!.byCategory.rider, 1794 + 523, 'riders are reported under Rider Costs');
    assert.equal(summary!.total, 40000 + 8000 + 1794 + 523);
    const items = felice.repo.getWeek(w.id).items;
    assert.deepEqual(items.map((i) => [i.name, i.riderCost, i.riderItems]), [['Headliner', 1794, 1], ['Host', 523, 2]]);
  });

  test('the rider is replaced as a whole, and clearing it sets the cost to 0', () => {
    const { felice, week, act } = setup();
    const a = act(felice, week(felice).id);
    felice.repo.setItemRider(a.id, [line('A', 100, 1), line('B', 50, 2)]);
    felice.repo.setItemRider(a.id, [line('C', 10, 1)]);
    assert.deepEqual(felice.repo.itemRider(a.id).lines.map((l) => l.name), ['C']);
    const cleared = felice.repo.setItemRider(a.id, []);
    assert.equal(cleared.item.riderCost, 0);
    assert.equal(cleared.item.riderItems, 0);
  });

  test('prices are kept as they were calculated: changing the price list never rewrites a week', () => {
    const { felice, week, act } = setup();
    const price = felice.repo.addRiderPrice({ name: 'Red bull', costCents: cents(16.83) });
    const a = act(felice, week(felice).id);
    felice.repo.setItemRider(a.id, [line('Red bull', 16.83, 10)]);
    felice.repo.updateRiderPrice(price.id, { name: 'Red bull', costCents: cents(30) });
    assert.equal(felice.repo.itemRider(a.id).total, 168.3);
    assert.equal(felice.repo.getWeek(a.weekId).items[0]!.riderCost, 168.3);
  });

  test('only headline acts and hosts have a rider', () => {
    const { felice, week } = setup();
    const w = week(felice);
    const mc = felice.repo.addItem(w.id, { category: 'standard', name: 'MC', amountCents: cents(4000), notes: '' });
    for (const call of [() => felice.repo.setItemRider(mc.id, [line('A', 1, 1)]), () => felice.repo.itemRider(mc.id)]) {
      assert.throws(call, (e) => e instanceof HttpError && e.status === 400 && /headline acts and hosts/.test(e.message));
    }
  });

  test('once a rider is calculated its cost cannot be typed over, and leaving headline acts and hosts ends it', () => {
    const { felice, week, act, count } = setup();
    const a = act(felice, week(felice).id, 'Headliner', 1000);
    const input = (riderCents: number, category: 'headline' | 'standard' = 'headline') => ({ category, name: 'Headliner', amountCents: cents(1000), riderCents, notes: 'n' });
    felice.repo.updateItem(a.id, input(777)); // typed by hand: fine while there is no calculation
    felice.repo.setItemRider(a.id, [line('A', 100, 2)]);
    assert.throws(() => felice.repo.updateItem(a.id, input(999)), (e) => e instanceof HttpError && e.status === 400 && /rider calculator/.test(e.message));
    assert.equal(felice.repo.updateItem(a.id, input(20000)).notes, 'n', 'saving the same cost (a rename, a new rate) still works');
    assert.equal(count('SELECT COUNT(*) AS n FROM rider_lines WHERE item_id = ?', a.id), 1);
    felice.repo.updateItem(a.id, input(0, 'standard'));
    assert.equal(count('SELECT COUNT(*) AS n FROM rider_lines WHERE item_id = ?', a.id), 0, 'the calculation ended');
  });

  test('removing a line or a week removes its rider; another company cannot read or change it', () => {
    const { stores, felice, alur, week, act, count } = setup();
    const w = week(felice);
    const a = act(felice, w.id, 'A');
    const b = act(felice, w.id, 'B');
    felice.repo.setItemRider(a.id, [line('X', 1, 1)]);
    felice.repo.setItemRider(b.id, [line('Y', 2, 2), line('Z', 3, 3)]);
    assert.throws(() => alur.repo.itemRider(a.id), (e) => e instanceof HttpError && e.status === 404);
    assert.throws(() => alur.repo.setItemRider(a.id, []), (e) => e instanceof HttpError && e.status === 404);
    assert.throws(() => stores.all().repo.setItemRider(a.id, []), (e) => e instanceof HttpError && e.status === 400);
    felice.repo.deleteItem(a.id);
    assert.equal(count('SELECT COUNT(*) AS n FROM rider_lines'), 2);
    felice.repo.deleteWeek(w.id);
    assert.equal(count('SELECT COUNT(*) AS n FROM rider_lines'), 0);
  });
});

// The Rider Calc workbook is the source of the price list and of the calculation, so the app must agree with it.
const REAL = resolve(import.meta.dirname, process.env.FP_RIDER_CALC ?? '../../../calc/Rider Calc.xlsx');
describe('the real Rider Calc workbook', { skip: existsSync(REAL) ? false : `not found at ${REAL} (set FP_RIDER_CALC to run)` }, () => {
  test('its price list imports with no warnings (30 items; the "0" placeholder is not one)', async () => {
    const parsed = await parseRiderPrices(readFileSync(REAL));
    assert.deepEqual(parsed.warnings, []);
    assert.equal(parsed.prices.length, 30);
    assert.equal(parsed.prices.find((p) => p.name === 'Hennessey VSOP')?.costCents, 89700);
    assert.ok(parsed.prices.some((p) => p.name === 'Jagermeister'), 'trailing spaces are trimmed');
    assert.ok(!parsed.prices.some((p) => p.name === '0'));
  });

  test('every artist and host block with a total in the workbook gets the same total from the calculator, to the cent', async () => {
    const data = readFileSync(REAL);
    const { prices } = await parseRiderPrices(data);
    const { felice, week, act } = setup();
    felice.repo.importRiderPrices(prices);
    const list = new Map(felice.repo.riderPrices().map((p) => [p.name.toLowerCase(), p]));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Mon - Sun Planner')!;
    const value = (v: ExcelJS.CellValue): unknown => (v && typeof v === 'object' && 'result' in v ? v.result : v);
    const w = week(felice);
    let checked = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const total = ws.getRow(r).getCell(9).value;
      if (!(total && typeof total === 'object' && 'formula' in total && typeof total.result === 'number')) continue;
      const block = /^SUM\(H(\d+):H(\d+)\)$/.exec(String(total.formula));
      if (!block || Number(block[1]) !== r) continue;
      const lines = [];
      for (let k = Number(block[1]); k <= Number(block[2]); k++) {
        const name = String(value(ws.getRow(k).getCell(5).value) ?? '').trim();
        const quantity = Number(value(ws.getRow(k).getCell(7).value) ?? 0);
        const p = list.get(name.toLowerCase());
        if (p && quantity > 0) lines.push({ name: p.name, unitCents: cents(p.cost), quantity });
      }
      const booked = act(felice, w.id, `Block ${r}`);
      assert.equal(felice.repo.setItemRider(booked.id, lines).rider.total, Math.round(total.result * 100) / 100, `block at row ${r}`);
      checked++;
    }
    assert.ok(checked >= 20, `${checked} blocks checked`);
  });
});
