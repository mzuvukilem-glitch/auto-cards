// Reading one tab of the weekly expense workbook. Only each section's SUBTOTAL is used; the lines are not.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import { applyAdjustments, groupForHeading, listSheets, loadWorkbook, readSheet, summarise } from '../src/actuals.ts';
import { ImportError } from '../src/excel.ts';

const cents = (n: number) => Math.round(n * 100);

type Section = { heading: string; lines?: [string, number][]; subtotal?: number | null; paid?: number };

/** Lays a tab out like the real sheet: heading row, lines, SUBTOTAL row. */
function addTab(wb: ExcelJS.Workbook, name: string, sections: Section[], topTotal?: number) {
  const ws = wb.addWorksheet(name);
  ws.getCell('C1').value = 'LOCAL DEEJAYS WEEKLY EXPENSES';
  ws.getCell('C3').value = 'TOTAL AMOUNT DUE:';
  if (topTotal !== undefined) ws.getCell('D3').value = topTotal;
  let r = 6;
  for (const s of sections) {
    ws.getCell(r, 1).value = '#';
    ws.getCell(r, 2).value = s.heading;
    ws.getCell(r, 3).value = 'AMOUNT DUE';
    r++;
    (s.lines ?? []).forEach(([n, amt], i) => {
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = n;
      ws.getCell(r, 3).value = amt;
      r++;
    });
    if (s.subtotal !== null) {
      ws.getCell(r, 1).value = 'SUBTOTAL';
      ws.getCell(r, 2).value = 'SUBTOTAL';
      ws.getCell(r, 3).value = s.subtotal ?? (s.lines ?? []).reduce((t, l) => t + l[1], 0);
      if (s.paid !== undefined) ws.getCell(r, 4).value = s.paid;
      r++;
    }
  }
  return ws;
}

const STANDARD_WEEK: Section[] = [
  { heading: 'RESIDENTS', lines: [['Camera', 4000], ['MC', 4000]] },
  { heading: "LOCAL DJ's", lines: [['A', 1000], ['B', 1500]] },
  { heading: 'HOSTS', lines: [['H1', 2500]] },
  { heading: 'RIDERS', lines: [['Monday', 351.32], ['Tuesday', 1643.51]] },
  { heading: 'BOTTLE GIRLS', lines: [['G1', 1200], ['G2', 1800]] },
  { heading: 'HEADLINERS', lines: [['Act', 17000]] },
  { heading: 'Miscellenious', lines: [['Felice - Boosting', 5000], ['Alur - Boosting', 2500]] },
];

describe('reading one tab of the expense workbook', () => {
  test('each section becomes one total, mapped to the group planned and actual are compared on', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addTab(wb, '29-05', STANDARD_WEEK, 8000 + 2500 + 2500 + 1994.83 + 3000 + 17000 + 7500);
    const read = readSheet(ws);
    const byHeading = Object.fromEntries(read.sections.map((s) => [s.heading, [s.group, s.sheetCents]]));
    assert.deepEqual(byHeading, {
      RESIDENTS: ['standard', cents(8000)],
      "LOCAL DJ's": ['resident', cents(2500)],
      HOSTS: ['hosts', cents(2500)],
      RIDERS: ['rider', cents(1994.83)],
      'BOTTLE GIRLS': ['standard', cents(3000)],
      HEADLINERS: ['headline', cents(17000)],
      Miscellenious: ['marketing', cents(7500)],
    });
    assert.deepEqual(read.warnings, [], 'a sheet whose figures agree has nothing to warn about');
    const sum = summarise(applyAdjustments(read.sections, {}).sections);
    assert.equal(sum.total, 8000 + 2500 + 2500 + 1994.83 + 3000 + 17000 + 7500);
    assert.equal(sum.byGroup.standard, 11000, 'Residents and Bottle Girls are both Standard Costs');
  });

  test('line names and amounts are never read: only the SUBTOTAL counts', () => {
    const wb = new ExcelJS.Workbook();
    // Lines add up to 3,000 but the sheet's subtotal says 5,000. The subtotal is the figure used.
    const ws = addTab(wb, 'w', [{ heading: 'HOSTS', lines: [['x', 1000], ['y', 2000]], subtotal: 5000 }]);
    const read = readSheet(ws);
    assert.equal(read.sections[0]!.sheetCents, cents(5000));
  });

  test('a section with no SUBTOTAL row falls back to adding its amounts, and says so', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addTab(wb, 'w', [
      { heading: 'HOSTS', lines: [['x', 1000], ['y', 2000]] },
      { heading: 'Miscellenious', lines: [['Boosting', 5000]], subtotal: null },
    ]);
    const read = readSheet(ws);
    assert.equal(read.sections.find((s) => s.heading === 'Miscellenious')!.sheetCents, cents(5000));
    assert.ok(read.warnings.some((w) => w.includes('Miscellenious') && w.includes('no subtotal')));
  });

  test("warns when the sheet's own TOTAL AMOUNT DUE disagrees with its section subtotals", () => {
    const wb = new ExcelJS.Workbook();
    const ws = addTab(wb, 'w', [{ heading: 'HOSTS', lines: [['x', 1000]] }], 9999);
    assert.ok(readSheet(ws).warnings.some((w) => w.includes('TOTAL AMOUNT DUE')));
  });

  test('an unrecognised section is kept under Marketing & other, with a warning', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addTab(wb, 'w', [{ heading: 'Security guards', lines: [['x', 800]] }]);
    const read = readSheet(ws);
    assert.equal(read.sections[0]!.group, 'marketing');
    assert.ok(read.warnings.some((w) => w.includes('not recognised')));
  });

  test('amount paid is read from the subtotal row, and never exceeds the amount due', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addTab(wb, 'w', [
      { heading: 'HOSTS', lines: [['x', 1000]], paid: 400 },
      { heading: 'RIDERS', lines: [['Monday', 500]], paid: 9999 },
    ]);
    const read = readSheet(ws);
    assert.deepEqual(read.sections.map((s) => s.paidCents), [cents(400), cents(500)]);
  });

  test('empty sections are left out, and a tab with nothing to import is refused', () => {
    const wb = new ExcelJS.Workbook();
    const ws = addTab(wb, 'w', [{ heading: 'HOSTS', lines: [] }, { heading: 'RIDERS', lines: [['Monday', 500]] }]);
    assert.deepEqual(readSheet(ws).sections.map((s) => s.heading), ['RIDERS']);
    const blank = addTab(wb, 'blank', [{ heading: 'HOSTS', lines: [] }]);
    assert.throws(() => readSheet(blank), ImportError);
  });

  test('listing the tabs suggests the last one with data, and skips tabs like SUMMARY', () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('SUMMARY').getCell('B2').value = 'MONTHLY SUMMARY';
    addTab(wb, '29-05', [{ heading: 'HOSTS', lines: [['x', 1000]] }]);
    addTab(wb, '06-12', [{ heading: 'HOSTS', lines: [['x', 2000]] }]);
    addTab(wb, '13-19', [{ heading: 'HOSTS', lines: [] }]); // not filled in yet
    const list = listSheets(wb);
    assert.deepEqual(list.sheets.map((s) => [s.name, s.total]), [['SUMMARY', 0], ['29-05', 1000], ['06-12', 2000], ['13-19', 0]]);
    assert.equal(list.suggested, '06-12');
  });

  test('a changed section total replaces the sheet figure; an unknown section name is refused', () => {
    const wb = new ExcelJS.Workbook();
    const read = readSheet(addTab(wb, 'w', STANDARD_WEEK));
    const out = applyAdjustments(read.sections, { Miscellenious: 5000 });
    assert.equal(out.adjusted, true);
    assert.equal(out.sections.find((s) => s.heading === 'Miscellenious')!.cents, cents(5000));
    assert.equal(out.sections.find((s) => s.heading === 'Miscellenious')!.sheetCents, cents(7500), 'the sheet figure is still remembered');
    assert.equal(applyAdjustments(read.sections, {}).adjusted, false);
    assert.equal(applyAdjustments(read.sections, { Miscellenious: 7500 }).adjusted, false, 'typing the same figure is not a change');
    assert.throws(() => applyAdjustments(read.sections, { Nonsense: 1 }), ImportError);
  });

  test('section headings are recognised however the sheet spells them', () => {
    const cases: [string, string][] = [
      ['RESIDENTS', 'standard'], ["LOCAL DJ's", 'resident'], ['LOCAL DJs', 'resident'], ['HOSTS', 'hosts'], ['RIDERS', 'rider'],
      ['BOTTLE GIRLS', 'standard'], ['HEADLINERS', 'headline'], ['Miscellenious', 'marketing'], ['Miscellaneous', 'marketing'],
    ];
    for (const [heading, group] of cases) assert.equal(groupForHeading(heading).group, group, heading);
  });
});

// The real workbook is not part of the project, so this runs only where the file is.
const REAL = resolve(import.meta.dirname, process.env.FP_EXPENSES ?? '../../../calc/Juy 26.xlsx');
describe('the real expense workbook', { skip: existsSync(REAL) ? false : `not found at ${REAL} (set FP_EXPENSES to run)` }, () => {
  test('every weekly tab reads cleanly and agrees with the sheet’s own totals', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(REAL);
    const expectedTotals: Record<string, number> = {
      '29-05': 217962.96, '06-12': 201272.54, '13-19': 200757.73, '20-26': 209704.6, '27-02': 206918.16,
    };
    const list = listSheets(wb);
    assert.equal(list.suggested, '27-02');
    for (const [tab, expected] of Object.entries(expectedTotals)) {
      const read = readSheet(wb.getWorksheet(tab)!);
      assert.deepEqual(read.warnings, [], `${tab}: no warnings`);
      assert.equal(read.sections.length, 7, `${tab}: seven sections`);
      const total = read.sections.reduce((s, x) => s + x.sheetCents, 0);
      assert.equal(total, cents(expected), `${tab}: total`);
    }
  });

  test('the first week breaks down by group exactly as the sheet shows', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(REAL);
    const sum = summarise(applyAdjustments(readSheet(wb.getWorksheet('29-05')!).sections, {}).sections);
    assert.deepEqual(sum.byGroup, { headline: 86000, resident: 25000, hosts: 22400, rider: 44262.96, standard: 23600, marketing: 16700 });
    assert.equal(sum.total, 217962.96);
  });

  test('loading the workbook from raw bytes (as the upload does) gives the same tabs', async () => {
    const { readFileSync } = await import('node:fs');
    const wb = await loadWorkbook(readFileSync(REAL));
    assert.deepEqual(listSheets(wb).sheets.map((s) => s.name), ['SUMMARY', '29-05', '06-12', '13-19', '20-26', '27-02']);
  });
});
