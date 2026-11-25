// Reading and writing Excel files: the cell helpers, the three importers (planned weeks, resident DJs, rider
// prices) with every kind of bad row, and the two exports.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import { buildExport, buildPaymentSchedule, cellNumber, cellText, ImportError, isFormula, parseResidentDjs, parseRiderPrices, parseWorkbook, toCents } from '../src/excel.ts';
import type { Organisation, PaymentSchedule, SummaryReport } from '../../shared/types.ts';
import { emptyByCategory } from '../../shared/categories.ts';
import { workbook } from './support.ts';

const cents = (n: number) => Math.round(n * 100);
const felice: Organisation = { id: 1, slug: 'felice', name: 'Felice', color: '#000' };
const alur: Organisation = { id: 2, slug: 'alur', name: 'Alur', color: '#111' };
const load = async (buf: Buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return wb;
};
const rejectsImport = (p: Promise<unknown>, pattern: RegExp) => assert.rejects(p, (e) => e instanceof ImportError && e.status === 400 && pattern.test(e.message));

describe('cell helpers', () => {
  test('cellText reads every kind of cell value', () => {
    assert.equal(cellText(null), '');
    assert.equal(cellText(undefined as never), '');
    assert.equal(cellText('  hi  '), 'hi');
    assert.equal(cellText(12.5), '12.5');
    assert.equal(cellText(true), 'true');
    assert.equal(cellText(new Date('2026-11-24T00:00:00Z')), '2026-11-24T00:00:00.000Z');
    assert.equal(cellText({ richText: [{ text: ' Rich ' }, { text: 'text ' }] }), 'Rich text');
    assert.equal(cellText({ text: ' link ', hyperlink: 'http://x' }), 'link');
    assert.equal(cellText({ formula: 'A1', result: ' 7 ' } as ExcelJS.CellValue), '7');
    assert.equal(cellText({ error: '#N/A' } as ExcelJS.CellValue), '');
  });

  test('cellNumber reads numbers, numeric text and formula results; everything else is null', () => {
    assert.equal(cellNumber(5), 5);
    assert.equal(cellNumber(NaN), null);
    assert.equal(cellNumber(Infinity), null);
    assert.equal(cellNumber(' R 1,500.50 '), 1500.5);
    assert.equal(cellNumber('-3'), -3);
    for (const bad of ['', '  ', 'abc', '1.2.3', 'R']) assert.equal(cellNumber(bad), null, bad);
    assert.equal(cellNumber({ formula: 'x', result: 42 } as ExcelJS.CellValue), 42);
    assert.equal(cellNumber({ formula: 'x', result: 'R10' } as ExcelJS.CellValue), 10);
    assert.equal(cellNumber({ formula: 'x' } as ExcelJS.CellValue), null);
    assert.equal(cellNumber(null), null);
    assert.equal(cellNumber(true), null);
    assert.equal(cellNumber(new Date()), null);
  });

  test('isFormula and toCents', () => {
    assert.equal(isFormula({ formula: 'A1+1', result: 2 } as ExcelJS.CellValue), true);
    assert.equal(isFormula({ sharedFormula: 'A1', result: 2 } as ExcelJS.CellValue), true);
    assert.equal(isFormula(5), false);
    assert.equal(isFormula(null), false);
    assert.equal(isFormula({ text: 'x' } as ExcelJS.CellValue), false);
    assert.equal(toCents(1.5), 150);
    assert.equal(toCents(0.1 + 0.2), 30);
  });
});

describe('planned weeks: the app\'s own format', () => {
  const header = ['Year', 'Month', 'Week', 'Category', 'Name', 'Amount', 'Rider cost', 'Notes', 'Resident DJ'];
  const parse = async (rows: (string | number | null)[][], org?: Organisation) => parseWorkbook(await workbook({ 'Line Items': [header, ...rows] }), 2026, org);

  test('month and category can be written in any of the usual ways', async () => {
    const r = await parse([
      [2026, 'November', 1, 'headline', 'A', 100, 10, '', ''],
      [2026, 'Nov', 1, 'Headline Acts', 'B', 100, 0, '', ''],
      [2026, 'Sept', 2, 'Hosts & Promoters', 'C', 100, 0, '', ''],
      [2026, 'Sept 2026', 2, 'hosts and promoters', 'D', 100, 0, '', ''],
      [2026, 9, 3, 'OTHER', 'E', 100, null, '', ''],
    ]);
    assert.equal(r.format, 'flat');
    assert.deepEqual(r.warnings, []);
    assert.deepEqual(r.weeks.map((w) => [w.month, w.weekNo, w.items.length]), [[11, 1, 2], [9, 2, 2], [9, 3, 1]]);
    assert.deepEqual(r.weeks[0]!.items.map((i) => i.category), ['headline', 'headline']);
    assert.equal(r.weeks[0]!.items[0]!.riderCents, 1000);
    assert.equal(r.weeks[2]!.items[0]!.riderCents, 0);
  });

  test('"Rider" works as the rider column heading, and the Resident DJ column marks individual DJs (once per week)', async () => {
    const file = await workbook({
      'Line Items': [
        ['Year', 'Month', 'Week', 'Category', 'Name', 'Amount', 'Rider', 'Notes', 'Resident DJ'],
        [2026, 11, 1, 'Headline Acts', 'A', 100, 5, 'n', ''],
        [2026, 11, 1, 'Resident DJs', 'DJ One', 100, 0, '', 'yes'],
        [2026, 11, 1, 'Resident DJs', 'dj one', 100, 0, '', 'TRUE'],
        [2026, 11, 1, 'Resident DJs', 'DJ Two', 100, 0, '', '1'],
        [2026, 11, 1, 'Resident DJs', 'DJ Three', 100, 0, '', 'Y'],
        [2026, 11, 1, 'Resident DJs', 'Lump', 100, 0, '', 'no'],
        [2026, 11, 1, 'Standard Costs', 'MC', 100, 0, '', 'Yes'], // only means something under Resident DJs
      ],
    });
    const r = await parseWorkbook(file, 2026);
    const items = r.weeks[0]!.items;
    assert.deepEqual(items.map((i) => [i.name, i.dj, i.riderCents]), [['A', false, 500], ['DJ One', true, 0], ['DJ Two', true, 0], ['DJ Three', true, 0], ['Lump', false, 0], ['MC', false, 0]]);
    assert.equal(items[0]!.notes, 'n');
    assert.deepEqual(r.warnings, ['Line Items row 4 skipped: dj one is already in Nov 2026 W1']);
  });

  test('a row with a problem is skipped and the problem is named; blank rows are ignored', async () => {
    const r = await parse([
      [1999, 11, 1, 'Other', 'bad year', 1, 0, '', ''],
      [2026, 13, 1, 'Other', 'bad month', 1, 0, '', ''],
      [2026, 'zz', 1, 'Other', 'month text', 1, 0, '', ''],
      [2026, 'ab', 1, 'Other', 'short month text', 1, 0, '', ''],
      [2026, 11, 6, 'Other', 'bad week', 1, 0, '', ''],
      [2026, 11, 1, 'Nonsense', 'bad category', 1, 0, '', ''],
      [2026, 11, 1, 'Other', '', 1, 0, '', ''],
      [2026, 11, 1, 'Other', 'bad amount', 'x', 0, '', ''],
      [2026, 11, 1, 'Other', 'negative amount', -1, 0, '', ''],
      [2026, 11, 1, 'Headline Acts', 'bad rider', 1, 'x', '', ''],
      [2026, 11, 1, 'Headline Acts', 'negative rider', 1, -5, '', ''],
      [null, null, null, null, null, null, null, null, null],
      [2026, 11, 1, 'Other', 'good', 1, 0, '', ''],
    ]);
    assert.deepEqual(r.weeks.map((w) => w.items.map((i) => i.name)), [['good']]);
    assert.equal(r.warnings.length, 11);
    assert.match(r.warnings[0]!, /row 2 skipped: check year$/);
    assert.match(r.warnings[1]!, /row 3 skipped: check month$/);
    assert.match(r.warnings[4]!, /row 6 skipped: check week \(1-5\)$/);
    assert.match(r.warnings[5]!, /row 7 skipped: check category$/);
    assert.match(r.warnings[6]!, /row 8 skipped: check name$/);
    assert.match(r.warnings[7]!, /row 9 skipped: check amount$/);
    assert.match(r.warnings[9]!, /row 11 skipped: check rider cost$/);
    assert.match(r.warnings[10]!, /row 12 skipped: check rider cost$/);
  });

  test('only the first 60 problems are listed, then one line says there are more', async () => {
    const rows = Array.from({ length: 75 }, (_, i) => [2026, 11, 1, 'Other', `bad ${i}`, 'x', 0, '', ''] as (string | number)[]);
    const r = await parse([...rows, [2026, 11, 1, 'Other', 'ok', 1, 0, '', '']]);
    assert.equal(r.warnings.length, 61);
    assert.equal(r.warnings[60], 'More warnings were found and not shown.');
  });

  test('a combined export keeps only the organisation being imported into', async () => {
    const file = await workbook({
      'Line Items': [
        ['Organisation', 'Year', 'Month', 'Week', 'Category', 'Name', 'Amount'],
        ['Felice', 2026, 11, 1, 'Other', 'by name', 1],
        ['alur', 2026, 11, 1, 'Other', 'by slug', 2],
        ['', 2026, 11, 1, 'Other', 'no organisation', 3],
        ['Alur', 2026, 11, 1, 'Other', 'other 1', 4],
        ['Nobody', 2026, 11, 1, 'Other', 'other 2', 5],
      ],
    });
    const forAlur = await parseWorkbook(file, 2026, alur);
    assert.deepEqual(forAlur.weeks[0]!.items.map((i) => i.name), ['by slug', 'no organisation', 'other 1']);
    assert.deepEqual(forAlur.warnings, ['2 rows belonging to other organisations were skipped. Only Alur rows were imported.']);
    const noOrg = await parseWorkbook(file, 2026); // no organisation given: nothing is filtered
    assert.equal(noOrg.weeks[0]!.items.length, 5);
    assert.deepEqual(noOrg.warnings, []);
  });

  test('files that cannot be read, or have nothing to import, are refused', async () => {
    await rejectsImport(parseWorkbook(Buffer.from('not a workbook'), 2026), /could not be read as an Excel/);
    await rejectsImport(parseWorkbook(await workbook({ Sheet1: [['hello']] }), 2026), /No importable sheet found/);
    // a sheet with only some of the needed headings is not the app's format
    await rejectsImport(parseWorkbook(await workbook({ Sheet1: [['Year', 'Month', 'Week']] }), 2026), /No importable sheet found/);
  });
});

describe('planned weeks: the original planner layout', () => {
  /** Rows start at column A. Row 3 is the heading row; the months are on row 2. */
  async function planner(months: (string | null)[], weekHeadings: string[], body: unknown[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plan');
    ws.addRow(['Title']);
    ws.addRow(['', '', '', ...months]);
    ws.addRow(['', 'CATEGORY', 'Notes', ...weekHeadings]);
    for (const r of body) ws.addRow(r as ExcelJS.CellValue[]);
    return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }
  const f = (result: number) => ({ formula: 'SUM(D1:D2)', result });

  test('every kind of row: acts and riders, section totals and lines, formulas, and the problems it reports', async () => {
    const file = await planner(
      ['November', null],
      ['WEEK 1', 'WEEK 2'],
      [
        ['', 'TOTALS', '', 12345, null],
        ['', 'Floating line before any section', '', 10, null],
        ['', 'Headline Acts', 'Rider', null, null],
        ['', '', 99, null, null], // a rider with no act above it
        ['', 'Act A', '', 1000, null],
        ['', '', '', 321, null], // an amount with no act name
        ['', 'Act B', '', null, -5],
        ['', 'Act C', '', f(1000), null],
        ['', '', 250, null, null], // the rider of the week of the last act
        ['', '', f(2), null, null], // a formula in the rider column is not a rider
        ['', 'Standard Costs', '', 5000, 1000],
        ['', 'MC', '', 2000, null],
        ['', 'Negative', '', -1, null],
        ['', '', '', 700, null], // an amount with no name
        ['', 'Formula', '', f(9), null],
        ['', 'Zero', '', 0, null],
        ['', 'Physical Marketing', '', 100, null],
        ['', 'Billboard', '', 500, null], // more than the section total says
        ['', 'Resident DJs', '', 3000, 0],
        ['', 'Rider', '', 200, null],
        ['', 'Hosts & Promoters', '', 800, null],
        ['', 'Xoli', '', 800, null],
        ['', '', 'Rider', 150, null],
        ['', 'Other', '', 50, null],
        ['', 'Misc line', '', 50, null],
      ],
    );
    const r = await parseWorkbook(file, 2026);
    assert.equal(r.format, 'planner');
    const w1 = r.weeks.find((w) => w.weekNo === 1)!;
    const names = w1.items.map((i) => `${i.category}:${i.name}:${i.amountCents / 100}`);
    assert.deepEqual(names, [
      'headline:Act A:1000',
      'headline:Unnamed act:321',
      'rider:Headline acts rider:250',
      'standard:MC:2000',
      'physical:Billboard:500',
      'resident:Resident DJs:3000',
      'rider:Resident DJ rider:200',
      'hosts:Xoli:800',
      'rider:Hosts rider:150',
      'other:Misc line:50',
      'standard:Standard Costs (unallocated):3000',
    ]);
    const w2 = r.weeks.find((w) => w.weekNo === 2)!;
    assert.deepEqual(w2.items.map((i) => `${i.category}:${i.name}:${i.amountCents / 100}`), ['standard:Standard Costs (unallocated):1000']);
    const text = r.warnings.join('\n');
    assert.match(text, /Row 7: rider amount R\s99,00 has no week above it and was skipped/);
    assert.match(text, /Row 10, Nov 2026 W2: negative amount skipped/);
    assert.match(text, /Row 16, Nov 2026 W1: negative amount skipped/);
    assert.match(text, /Row 17, Nov 2026 W1: R\s700,00 has no name and was skipped/);
    assert.match(text, /Nov 2026 W1 Physical Marketing: lines add up to R\s500,00 but the planner total says R\s100,00\. Lines kept\./);
    assert.match(text, /Nov 2026 W1: planner TOTALS says R\s12\s345,00, the lines add up to/);
    assert.doesNotMatch(text, /W2: planner TOTALS/, 'a week with no TOTALS figure is not compared');
  });

  test('a repeated or impossible week column is skipped with a warning', async () => {
    const file = await planner(['November', null, null], ['WEEK 1', 'WEEK 1', 'WEEK 7'], [['', 'Other', '', 5, 6, 7], ['', 'Line', '', 5, 6, 7]]);
    const r = await parseWorkbook(file, 2026);
    assert.deepEqual(r.weeks.map((w) => w.weekNo), [1]);
    assert.equal(r.warnings.filter((w) => /duplicate or invalid week/.test(w)).length, 2);
    assert.match(r.warnings[0]!, /Column 5 \(November WEEK 1\) skipped/);
  });

  test('week columns that have no month above them are not a planner', async () => {
    await rejectsImport(parseWorkbook(await planner([null, null], ['WEEK 1', 'WEEK 2'], [['', 'Other', '', 1, 2]]), 2026), /No importable sheet found/);
  });

  test('a heading row needs at least two WEEK columns and a row above it', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plan');
    ws.addRow(['', 'CATEGORY', 'Notes', 'WEEK 1']); // only one WEEK heading, and on row 1
    await rejectsImport(parseWorkbook(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), 2026), /No importable sheet found/);
    const first = new ExcelJS.Workbook();
    first.addWorksheet('Plan').addRow(['', 'CATEGORY', 'Notes', 'WEEK 1', 'WEEK 2']); // two, but nothing above them
    await rejectsImport(parseWorkbook(Buffer.from((await first.xlsx.writeBuffer()) as ArrayBuffer), 2026), /No importable sheet found/);
  });

  test('the CATEGORY heading may be in another column', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plan');
    ws.addRow(['Title']);
    ws.addRow(['', '', '', '', 'May']);
    ws.addRow(['', '', 'CATEGORY', 'Notes', 'WEEK 1', 'WEEK 2']);
    ws.addRow(['', '', 'Other', '', 5, 6]);
    ws.addRow(['', '', 'Thing', '', 5, 6]);
    const r = await parseWorkbook(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer), 2026);
    assert.deepEqual(r.weeks.map((w) => [w.month, w.weekNo, w.items[0]!.name]), [[5, 1, 'Thing'], [5, 2, 'Thing']]);
  });
});

describe('resident DJ lists', () => {
  test('the heading may use other words, sit below a title, and the notes column is optional', async () => {
    const r = await parseResidentDjs(await workbook({ L: [['My list'], [], ['Resident DJ name', 'Fee', 'Reference'], ['A', '1,500.50', 'n1'], ['B', 'R900,00', ''], ['C', 800, null]] }));
    assert.deepEqual(r.djs, [
      { name: 'A', rateCents: 150050, notes: 'n1' },
      { name: 'B', rateCents: 90000, notes: '' },
      { name: 'C', rateCents: 80000, notes: '' },
    ]);
    for (const [name, rate, notes] of [['DJ', 'Amount', 'Notes'], ['Name', 'Cost', 'Comment'], ['dj name', 'Payment', 'Comments']]) {
      const got = await parseResidentDjs(await workbook({ L: [[name!, rate!, notes!], ['X', 5, 'n']] }));
      assert.deepEqual(got.djs, [{ name: 'X', rateCents: 500, notes: 'n' }], `${name}/${rate}/${notes}`);
    }
    const bare = await parseResidentDjs(await workbook({ L: [['Name', 'Rate'], ['X', 5]] }));
    assert.equal(bare.djs[0]!.notes, '');
  });

  test('rows that cannot be used are skipped and named, and repeats are reported', async () => {
    const r = await parseResidentDjs(
      await workbook({
        L: [
          ['Name', 'Rate'],
          ['', 100], // no name
          ['x'.repeat(201), 100],
          ['No rate', 'abc'],
          ['Negative', -5],
          ['Huge', 2_000_000_000],
          ['Both bad', ''],
          [null, null], // blank row
          ['Good', 100],
          ['good', 200],
        ],
      }),
    );
    assert.deepEqual(r.djs.map((d) => d.name), ['Good']);
    assert.deepEqual(r.warnings, [
      'Row 2 skipped: check the name',
      'Row 3 skipped: check the name (200 characters at most)',
      'Row 4 skipped: check the rate',
      'Row 5 skipped: check the rate',
      'Row 6 skipped: check the rate',
      'Row 7 skipped: check the rate',
      'Row 10 skipped: good is already in the list',
    ]);
  });

  test('CSV files: comma, semicolon or tab separated, with or without a byte-order mark, decimal commas kept', async () => {
    const semi = await parseResidentDjs(Buffer.from('Name;Rate\nA;1500,50\n'));
    assert.equal(semi.djs[0]!.rateCents, 150050);
    const tab = await parseResidentDjs(Buffer.from('Name\tRate\nA\t900\n'));
    assert.equal(tab.djs[0]!.rateCents, 90000);
    const bom = await parseResidentDjs(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Name,Rate\r\nA,"1,200.00"\r\n')]));
    assert.deepEqual(bom.djs[0], { name: 'A', rateCents: 120000, notes: '' });
  });

  test('rates written as formulas use their result; text that is not money is not a rate', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('L');
    ws.addRow(['Name', 'Rate']);
    ws.addRow(['Formula', { formula: '500+500', result: 1000 }]);
    ws.addRow(['Text formula', { formula: 'x', result: 'R750,50' }]);
    ws.addRow(['Boolean', true]);
    ws.addRow(['Not a number', 'about 500']);
    ws.addRow(['Infinite', Infinity]);
    const r = await parseResidentDjs(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    assert.deepEqual(r.djs.map((d) => [d.name, d.rateCents]), [['Formula', 100000], ['Text formula', 75050]]);
    assert.equal(r.warnings.length, 3);
  });

  test('a file with no heading, no DJs, too many DJs, or that cannot be read is refused', async () => {
    await rejectsImport(parseResidentDjs(await workbook({ L: [['Colour', 'Size'], ['red', 1]] })), /No header row found/);
    await rejectsImport(parseResidentDjs(await workbook({ L: [['Name', 'Rate']] })), /No DJs were found below the header row/);
    const many = Array.from({ length: 201 }, (_, i) => [`DJ ${i}`, 100]);
    await rejectsImport(parseResidentDjs(await workbook({ L: [['Name', 'Rate'], ...many] })), /at most 200 DJs/);
    await rejectsImport(parseResidentDjs(Buffer.from('PK\x03\x04 broken')), /could not be read\. Upload an Excel/);
  });

  test('a heading that is in a later sheet is found, and so are headings beyond row 10 not', async () => {
    const later = await parseResidentDjs(await workbook({ Cover: [['hello']], Data: [['Name', 'Rate'], ['A', 1]] }));
    assert.equal(later.djs.length, 1);
    const low = Array.from({ length: 11 }, () => ['filler']);
    await rejectsImport(parseResidentDjs(await workbook({ L: [...low, ['Name', 'Rate'], ['A', 1]] })), /No header row found/);
  });
});

describe('rider price lists', () => {
  test('headings may be Item, Beverage, Product or Name with Cost or Price; sizes and blanks are tidied', async () => {
    for (const [a, b] of [['Item', 'Cost'], ['Beverage', 'Price'], ['Product', 'Unit cost'], ['Name', 'Cost incl VAT'], ['Items', 'cost (incl. vat)'], ['Item', 'Unit price']]) {
      const r = await parseRiderPrices(await workbook({ S: [[a!, b!], ['  Red   bull ', 16.83]] }));
      assert.deepEqual(r.prices, [{ name: 'Red bull', costCents: 1683 }], `${a}/${b}`);
    }
  });

  test('bad rows are skipped and named; the "0" placeholder and blank rows are silently ignored', async () => {
    const r = await parseRiderPrices(
      await workbook({
        S: [
          ['Item', 'Cost'],
          [null, 5],
          ['x'.repeat(201), 5],
          ['Bad', 'abc'],
          ['Neg', -1],
          ['Huge', 2_000_000],
          ['0', 0],
          [null, null],
          ['Ok', 10],
          ['OK', 20],
        ],
      }),
    );
    assert.deepEqual(r.prices, [{ name: 'Ok', costCents: 1000 }]);
    assert.deepEqual(r.warnings, [
      'Row 2 skipped: check the item',
      'Row 3 skipped: check the item (200 characters at most)',
      'Row 4 skipped: check the cost',
      'Row 5 skipped: check the cost',
      'Row 6 skipped: check the cost',
      'Row 10 skipped: OK is already in the list',
    ]);
  });

  test('more than 60 problems are summarised, and a long list is refused', async () => {
    const bad = Array.from({ length: 70 }, (_, i) => [`B${i}`, 'x']);
    const r = await parseRiderPrices(await workbook({ S: [['Item', 'Cost'], ...bad, ['Ok', 1]] }));
    assert.equal(r.warnings.length, 61);
    const many = Array.from({ length: 501 }, (_, i) => [`I${i}`, 1]);
    await rejectsImport(parseRiderPrices(await workbook({ S: [['Item', 'Cost'], ...many] })), /at most 500 items/);
  });

  test('a file with no heading, no items, or that cannot be read is refused; a CSV works', async () => {
    await rejectsImport(parseRiderPrices(await workbook({ S: [['A', 'B'], [1, 2]] })), /No header row found/);
    await rejectsImport(parseRiderPrices(await workbook({ S: [['Item', 'Cost']] })), /No items were found/);
    await rejectsImport(parseRiderPrices(Buffer.from('PK\x03\x04 broken')), /could not be read/);
    assert.equal((await parseRiderPrices(Buffer.from('Item,Cost\nTonic,7.08\n'))).prices[0]!.costCents, 708);
  });
});

describe('exports', () => {
  const report = (byOrg: SummaryReport['totals']['byOrg'], rowByOrg: Record<string, number>): SummaryReport => ({
    from: '2026-11',
    to: '2026-11',
    groupBy: 'month',
    rows: [{ key: '2026-11', label: 'Nov 2026', year: 2026, month: 11, weekNo: null, weekId: null, weeks: 1, byCategory: { ...emptyByCategory(), headline: 100 }, total: 100, byOrg: rowByOrg }],
    totals: { byCategory: { ...emptyByCategory(), headline: 100 }, total: 100, weeks: 1, byOrg },
  });
  const line = (org: string, name: string, isDj = false) => ({ org, year: 2026, month: 11, weekNo: 1, category: 'resident' as const, name, amount: 5, riderCost: 0, notes: 'n', isDj });

  test('one organisation: a Summary sheet and an importable Line Items sheet', async () => {
    const wb = await load(await buildExport(report({}, {}), [line('Felice', 'A', true), line('Felice', 'B')], 'Felice report', [felice]));
    const items = wb.getWorksheet('Line Items')!;
    assert.deepEqual((items.getRow(1).values as string[]).slice(1), ['Year', 'Month', 'Week', 'Category', 'Name', 'Amount', 'Rider cost', 'Notes', 'Resident DJ']);
    assert.deepEqual([items.getRow(2).getCell(9).value, items.getRow(3).getCell(9).value], ['Yes', '']);
    const summary = wb.getWorksheet('Summary')!;
    assert.match(String(summary.getRow(1).getCell(1).value), /Felice report: 2026-11 to 2026-11 \(by month\)/);
    // and it imports again
    const back = await parseWorkbook(await buildExport(report({}, {}), [line('Felice', 'A', true)], 't', [felice]), 2026);
    assert.equal(back.weeks[0]!.items[0]!.dj, true);
  });

  test('both organisations: a total column for each and an Organisation column, with zero for an organisation with no figures', async () => {
    const full = report({ felice: { total: 60, byCategory: emptyByCategory() }, alur: { total: 40, byCategory: emptyByCategory() } } as unknown as SummaryReport['totals']['byOrg'], { felice: 60, alur: 40 });
    const wb = await load(await buildExport(full, [line('Felice', 'A'), line('Alur', 'B')], 'Combined', [felice, alur]));
    const header = (wb.getWorksheet('Summary')!.getRow(3).values as string[]).slice(1);
    assert.deepEqual(header.slice(-3), ['Total', 'Felice', 'Alur']);
    assert.equal(wb.getWorksheet('Line Items')!.getRow(1).getCell(1).value, 'Organisation');
    assert.deepEqual([4, 5].map((r) => wb.getWorksheet('Summary')!.getRow(r).getCell(header.length).value), [40, 40]);

    const sparse = await load(await buildExport(report({}, {}), [], 'Combined', [felice, alur]));
    const row = sparse.getWorksheet('Summary')!.getRow(4);
    assert.deepEqual([row.getCell(header.length - 1).value, row.getCell(header.length).value], [0, 0], 'missing organisation figures are 0');
    assert.deepEqual([sparse.getWorksheet('Summary')!.getRow(5).getCell(header.length).value], [0]);
  });

  test('the payment schedule lists each batch, its subtotal and the grand total', async () => {
    const schedule: PaymentSchedule = {
      weekId: 1,
      label: 'Nov 2026 W1',
      batchSize: 5,
      count: 2,
      total: 3,
      batches: [{ batchNo: 1, total: 3, payments: [{ no: 1, name: 'A', amount: 1, notes: '' }, { no: 2, name: 'B', amount: 2, notes: 'x' }] }],
    };
    const wb = await load(await buildPaymentSchedule(schedule, 'Felice'));
    const ws = wb.getWorksheet('Payment schedule')!;
    assert.match(String(ws.getRow(1).getCell(1).value), /Felice resident DJ payments: Nov 2026 W1/);
    const names = [] as unknown[];
    ws.eachRow((r) => names.push(r.getCell(3).value));
    assert.ok(names.includes('Batch 1 total') && names.includes('Total to pay'));
    assert.equal(cents(3), 300);
  });
});
