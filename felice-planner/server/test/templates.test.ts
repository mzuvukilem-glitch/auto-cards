// The import templates must be accepted by the real importers, with no warnings, and say what they promise.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import { applyAdjustments, listSheets, loadWorkbook, readSheet, summarise } from '../src/actuals.ts';
import { openDb } from '../src/db.ts';
import { parseResidentDjs, parseRiderPrices, parseWorkbook } from '../src/excel.ts';
import { createStores } from '../src/stores.ts';
import { EXPENSE_TEMPLATE_TABS, PLANNER_TEMPLATE_WEEKS, TEMPLATES, templateById } from '../src/templates.ts';
const build = async (id: string) => templateById(id)!.build();
const cents = (n: number) => Math.round(n * 100);

describe('import templates', () => {
  test('there is a template for every import, and each one builds a real file', async () => {
    assert.deepEqual(
      TEMPLATES.map((t) => t.id),
      ['planned-weeks', 'planner-layout', 'resident-djs', 'resident-djs-csv', 'rider-prices', 'actual-expenditure'],
    );
    for (const t of TEMPLATES) {
      const file = await t.build();
      assert.ok(file.length > 100, `${t.id} is empty`);
      assert.match(t.file, /-template\.(xlsx|csv)$/);
      if (t.file.endsWith('.xlsx')) assert.deepEqual([...file.subarray(0, 2)], [0x50, 0x4b], `${t.id} is not a zip (.xlsx) file`);
    }
  });

  test('planned weeks: imports with no warnings, and the examples cover every category', async () => {
    const parsed = await parseWorkbook(await build('planned-weeks'), 2026);
    assert.equal(parsed.format, 'flat');
    assert.deepEqual(parsed.warnings, []);
    assert.deepEqual(
      parsed.weeks.map((w) => `${w.year}-${w.month}-${w.weekNo}`),
      ['2026-11-1', '2026-11-2', '2026-12-1'],
    );
    const all = parsed.weeks.flatMap((w) => w.items);
    assert.deepEqual(
      [...new Set(all.map((i) => i.category))].sort(),
      ['headline', 'hosts', 'other', 'physical', 'resident', 'rider', 'social', 'standard'],
    );
    assert.equal(all.filter((i) => i.dj).length, 2, 'two individual resident DJs');
    const headliner = all.find((i) => i.name === 'Example Headliner A')!;
    assert.equal(headliner.amountCents, cents(40000));
    assert.equal(headliner.riderCents, cents(8500));
  });

  test('planned weeks: the rows go into the database and the week total adds up', async () => {
    const stores = createStores(openDb(':memory:'));
    const felice = stores.forOrg('felice')!;
    const parsed = await parseWorkbook(await build('planned-weeks'), 2026);
    felice.repo.importWeeks(parsed.weeks);
    const nov = felice.repo.weekSummaries(202611, 202611);
    assert.equal(nov.length, 2);
    // Nov W1: A 40000+8500, B 25000+4000, host 8000+1500, DJs 2700 (rate only), rider 2500, MC 4000, graphics 3000, corex 3500, Instagram 2000, deposit 5000
    const w1 = nov.find((w) => w.weekNo === 1)!;
    assert.equal(w1.total, 40000 + 8500 + 25000 + 4000 + 8000 + 1500 + 1500 + 1200 + 2500 + 4000 + 3000 + 3500 + 2000 + 5000);
  });

  test('planned weeks: the template is also what an export produces, so it can be imported again', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await build('planned-weeks')) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Line Items')!;
    const headers: string[] = [];
    ws.getRow(1).eachCell((c) => headers.push(String(c.value)));
    assert.deepEqual(headers, ['Year', 'Month', 'Week', 'Category', 'Name', 'Amount', 'Rider cost', 'Notes', 'Resident DJ']);
    assert.ok(wb.getWorksheet('READ ME'), 'has a READ ME sheet');
  });

  test('original planner layout: imports with no warnings and every week total matches the TOTALS row', async () => {
    const parsed = await parseWorkbook(await build('planner-layout'), 2026);
    assert.equal(parsed.format, 'planner');
    assert.deepEqual(parsed.warnings, [], 'no TOTALS or section disagreements');
    assert.equal(parsed.weeks.length, PLANNER_TEMPLATE_WEEKS.length);
    parsed.weeks.forEach((w, i) => {
      const expected = PLANNER_TEMPLATE_WEEKS[i]!;
      assert.equal(w.weekNo, expected.week);
      assert.equal(
        w.items.reduce((s, it) => s + it.amountCents + (it.riderCents ?? 0), 0),
        cents(expected.total),
        `week ${i + 1} total`,
      );
    });
    const categories = new Set(parsed.weeks.flatMap((w) => w.items.map((i) => i.category)));
    for (const c of ['headline', 'resident', 'rider', 'standard', 'physical', 'social', 'hosts', 'other']) assert.ok(categories.has(c as never), `${c} is covered`);
    assert.deepEqual(
      [...new Set(parsed.weeks.map((w) => w.month))],
      [11, 12],
    );
  });

  test('resident DJs (Excel and CSV): the same six DJs, with no warnings', async () => {
    const xlsx = await parseResidentDjs(await build('resident-djs'));
    const csv = await parseResidentDjs(await build('resident-djs-csv'));
    assert.deepEqual(xlsx.warnings, []);
    assert.deepEqual(csv.warnings, []);
    assert.equal(xlsx.djs.length, 6);
    assert.deepEqual(csv.djs, xlsx.djs);
    assert.equal(xlsx.djs[0]!.name, 'Example DJ One');
    assert.equal(xlsx.djs[0]!.rateCents, cents(1500));
    assert.equal(xlsx.djs[0]!.notes, 'Friday and Saturday');
  });

  test('resident DJs: the list goes onto a week and into the recurring list', async () => {
    const stores = createStores(openDb(':memory:'));
    const felice = stores.forOrg('felice')!;
    const week = felice.repo.createWeek({ year: 2026, month: 11, weekNo: 1, notes: '' }, false);
    const { djs } = await parseResidentDjs(await build('resident-djs'));
    const done = felice.repo.importResidentDjs(week.id, djs);
    assert.equal(done.added, 6);
    assert.equal(felice.repo.weekSummaries(202611, 202611)[0]!.byCategory.resident, 1500 + 1200 + 1000 + 1000 + 800 + 800);
    assert.equal(felice.repo.importRecurringDjs(djs).added, 6);
  });

  test('rider prices: the examples import with no warnings, and go into the price list', async () => {
    const parsed = await parseRiderPrices(await build('rider-prices'));
    assert.deepEqual(parsed.warnings, []);
    assert.equal(parsed.prices.length, 10);
    assert.deepEqual(parsed.prices[1], { name: 'Example Cognac VSOP 750ml', costCents: cents(897) });
    const felice = createStores(openDb(':memory:')).forOrg('felice')!;
    assert.equal(felice.repo.importRiderPrices(parsed.prices).added, 10);
    assert.equal(felice.repo.riderPrices().length, 10);
  });

  test('actual expenditure: weekly tabs are listed, the READ ME tab is skipped, and the subtotals are read', async () => {
    const wb = await loadWorkbook(await build('actual-expenditure'));
    const list = listSheets(wb);
    assert.deepEqual(
      list.sheets.map((s) => [s.name, s.sections > 0]),
      [['03-09', true], ['10-16', true], ['READ ME', false]],
    );
    assert.equal(list.suggested, '10-16');
    for (const expected of EXPENSE_TEMPLATE_TABS) {
      const read = readSheet(wb.getWorksheet(expected.tab)!);
      assert.deepEqual(read.warnings, [], `${expected.tab}: no warnings (the D3 total matches the subtotals)`);
      assert.deepEqual(
        read.sections.map((s) => [s.heading, s.sheetCents, s.paidCents]),
        expected.sections.map((s) => [s.heading, cents(s.due), cents(s.paid)]),
      );
      // Every section of the real workbook is recognised, so nothing falls into "not recognised".
      assert.equal(read.sections.length, 7);
    }
  });

  test('actual expenditure: the example week compares in the six cost groups, and Miscellaneous can be adjusted', async () => {
    const wb = await loadWorkbook(await build('actual-expenditure'));
    const read = readSheet(wb.getWorksheet('03-09')!);
    const sum = summarise(applyAdjustments(read.sections, {}).sections);
    assert.equal(sum.byGroup.headline, 65000);
    assert.equal(sum.byGroup.resident, 3700);
    assert.equal(sum.byGroup.standard, 11000 + 2400); // RESIDENTS + BOTTLE GIRLS
    assert.equal(sum.byGroup.marketing, 7500);
    assert.equal(sum.paid, 4000 + 4000 + 1500 + 1200 + 8000 + 2500 + 1200 + 40000);
    const adjusted = applyAdjustments(read.sections, { Miscellenious: 5000 });
    assert.equal(adjusted.adjusted, true);
    assert.equal(summarise(adjusted.sections).byGroup.marketing, 5000);
  });

  test('actual expenditure: the example tabs import into the database and replace on a second import', async () => {
    const stores = createStores(openDb(':memory:'));
    const felice = stores.forOrg('felice')!;
    const wb = await loadWorkbook(await build('actual-expenditure'));
    const read = readSheet(wb.getWorksheet('03-09')!);
    const input = {
      year: 2026,
      month: 8,
      weekNo: 1,
      label: read.tab,
      sections: read.sections.map((s) => ({ heading: s.heading, group: s.group, amountCents: s.sheetCents, sheetCents: s.sheetCents, paidCents: s.paidCents })),
    };
    felice.repo.importActualWeek(input);
    felice.repo.importActualWeek(input);
    const weeks = felice.repo.actualSummaries(202608, 202608);
    assert.equal(weeks.length, 1);
    assert.equal(weeks[0]!.total, EXPENSE_TEMPLATE_TABS[0]!.sections.reduce((s, x) => s + x.due, 0));
  });
});
