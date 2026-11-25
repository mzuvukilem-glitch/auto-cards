// Reconciles the app against the original weekly planner workbook.
//
// The expected figures are read straight from the workbook's own subtotal rows and cells (not from the
// importer), so a mismatch means the import or the report maths is wrong.
//
//   npm test -w server
//   FP_LIVE_DB=./data/planner.db npm test -w server   (also checks the live database)
//   add FP_EXCLUDE=headline,hosts,headline-rider,hosts-rider for data that was removed on purpose
//   (headline-rider / hosts-rider are the lump rider lines the sheet kept for those acts)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import { CATEGORY_KEYS, emptyByCategory, type CategoryKey } from '../../shared/categories.ts';
import type { WeekSummary } from '../../shared/types.ts';
import { openDb } from '../src/db.ts';
import { parseWorkbook } from '../src/excel.ts';
import type { Reports } from '../src/reports.ts';
import { createStores } from '../src/stores.ts';

const WORKBOOK = resolve(import.meta.dirname, process.env.FP_WORKBOOK ?? '../../../calc/Weekly Planner - April - Dec.xlsx');
const YEAR = 2026;
/** The original workbook is not part of the project, so on a fresh machine this suite is skipped, not failed. */
const WORKBOOK_FOUND = existsSync(WORKBOOK);
const cents = (n: number) => Math.round(n * 100);

/** Week columns in the sheet: column letter -> [month, week]. June has no week 3 in the sheet. */
const WEEK_COLUMNS: Record<string, [number, number]> = {
  D: [4, 1], E: [4, 2], F: [4, 3], G: [4, 4],
  H: [5, 1], I: [5, 2], J: [5, 3], K: [5, 4], L: [5, 5],
  M: [6, 1], N: [6, 2], O: [6, 4],
  P: [7, 1], Q: [7, 2], R: [7, 3], S: [7, 4], T: [7, 5],
};

/**
 * Each block of headline acts is followed by a cell in column C holding that week's headline-act rider.
 * Weeks with no figure (April W1, and June W4) have none. The sheet's own formulas for June W4 reach for
 * C98, which belongs to July W1; the app attributes it to July W1 only.
 */
const HEADLINE_RIDER_CELL: Record<string, number> = {
  E: 20, F: 26, G: 33, H: 40, I: 47, J: 56, K: 63, L: 70, M: 77, N: 85, P: 98, Q: 105, R: 112, S: 119, T: 126,
};

/** Weeks where the sheet's own TOTALS row is wrong; the app total should differ by exactly this much (rand). */
const KNOWN_SHEET_TOTAL_ERRORS: Record<string, { sheetMinusApp: number; why: string }> = {
  D: { sheetMinusApp: -6250, why: 'sheet total leaves out the R6,250 resident-DJ rider' },
  L: { sheetMinusApp: -21198.57, why: 'sheet total is typed in and leaves out R6,250 resident rider + R14,948.57 headline rider' },
  O: { sheetMinusApp: 14127.39, why: "sheet's June W4 rider points at July W1's rider cell (C98)" },
};

interface Expected {
  col: string;
  month: number;
  weekNo: number;
  byCategory: Record<CategoryKey, number>;
  /** The three parts of the Rider Costs category, so any of them can be left out of a check. */
  riderParts: { resident: number; hosts: number; headline: number };
  sheetTotal: number;
  total: number;
}

let sheet: ExcelJS.Worksheet;
let expected: Expected[];

function value(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'result' in v && typeof v.result === 'number') return v.result;
  return null;
}
const cell = (ref: string) => value(sheet.getCell(ref).value) ?? 0;
const isFormula = (ref: string) => {
  const v = sheet.getCell(ref).value;
  return typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v);
};
const sumRows = (col: string, from: number, to: number, skipFormulas = true) => {
  let sum = 0;
  for (let r = from; r <= to; r++) {
    const ref = `${col}${r}`;
    if (skipFormulas && isFormula(ref)) continue;
    sum += cell(ref);
  }
  return sum;
};

function readExpected(): Expected[] {
  return Object.entries(WEEK_COLUMNS).map(([col, [month, weekNo]]) => {
    const headlineRiderRow = HEADLINE_RIDER_CELL[col];
    const byCategory = emptyByCategory();
    byCategory.headline = cell(`${col}5`);
    byCategory.resident = cell(`${col}128`);
    const riderParts = {
      resident: cell(`${col}129`),
      hosts: cell(`${col}152`),
      headline: headlineRiderRow ? cell(`C${headlineRiderRow}`) : 0,
    };
    byCategory.rider = riderParts.resident + riderParts.hosts + riderParts.headline;
    byCategory.standard = cell(`${col}132`);
    byCategory.physical = cell(`${col}138`);
    byCategory.social = cell(`${col}143`);
    byCategory.hosts = cell(`${col}151`);
    byCategory.other = cell(`${col}196`);
    const total = CATEGORY_KEYS.reduce((s, k) => s + byCategory[k], 0);
    return { col, month, weekNo, byCategory, riderParts, sheetTotal: cell(`${col}4`), total };
  });
}

/** The DB-facing checks, shared by the in-memory import test and the optional live-database check. */
function checkAgainstSheet(weeks: WeekSummary[], exclude: readonly string[] = []) {
  /** What the sheet says for a category once the parts removed on purpose are taken out. */
  const wanted = (exp: Expected, key: CategoryKey) => {
    if (exclude.includes(key)) return 0;
    if (key !== 'rider') return exp.byCategory[key];
    const p = exp.riderParts;
    return p.resident + (exclude.includes('hosts-rider') ? 0 : p.hosts) + (exclude.includes('headline-rider') ? 0 : p.headline);
  };
  assert.equal(weeks.length, expected.length, 'number of weeks');
  for (const exp of expected) {
    const label = `${YEAR}-${String(exp.month).padStart(2, '0')} W${exp.weekNo} (column ${exp.col})`;
    const week = weeks.find((w) => w.year === YEAR && w.month === exp.month && w.weekNo === exp.weekNo);
    assert.ok(week, `${label}: week is missing`);
    for (const key of CATEGORY_KEYS) {
      // Parts removed on purpose must be gone; everything else must match the sheet.
      const want = wanted(exp, key);
      assert.equal(cents(week.byCategory[key]), cents(want), `${label}: ${key} expected ${want}, got ${week.byCategory[key]}`);
    }
    const wantTotal = CATEGORY_KEYS.reduce((s, k) => s + cents(wanted(exp, k)), 0);
    assert.equal(cents(week.total), wantTotal, `${label}: total`);
  }
}

describe(
  'weekly planner workbook reconciliation',
  { skip: WORKBOOK_FOUND ? false : `planner workbook not found at ${WORKBOOK} (set FP_WORKBOOK to its path to run these)` },
  () => {
  let weeks: WeekSummary[];
  let reports: Reports;
  let warnings: string[];

  before(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(WORKBOOK);
    sheet = wb.worksheets[0]!;
    expected = readExpected();

    const db = openDb(':memory:');
    const felice = createStores(db).forOrg('felice')!;
    const repo = felice.repo;
    const parsed = await parseWorkbook(readFileSync(WORKBOOK), YEAR, felice.orgs[0]);
    repo.importWeeks(parsed.weeks);
    warnings = parsed.warnings;
    reports = felice.reports;
    weeks = repo.weekSummaries(YEAR * 100 + 1, YEAR * 100 + 12);
  });

  test('imports all 17 weeks from the planner layout', () => {
    assert.equal(weeks.length, 17);
    assert.deepEqual(
      weeks.map((w) => `${w.month}-${w.weekNo}`),
      Object.values(WEEK_COLUMNS).map(([m, w]) => `${m}-${w}`),
    );
  });

  test("the sheet's own subtotal rows add up to their named lines (the source is internally consistent)", () => {
    for (const exp of expected) {
      const col = exp.col;
      assert.equal(cents(sumRows(col, 7, 127)), cents(cell(`${col}5`)), `${col}: headline fees vs row 5`);
      assert.equal(cents(sumRows(col, 133, 136)), cents(cell(`${col}132`)), `${col}: standard costs vs row 132`);
    }
  });

  test('every category, every week matches the sheet', () => {
    checkAgainstSheet(weeks);
  });

  test('weekly totals match the sheet TOTALS row, except the three known sheet errors', () => {
    const unexplained: string[] = [];
    for (const exp of expected) {
      const week = weeks.find((w) => w.month === exp.month && w.weekNo === exp.weekNo)!;
      const diff = exp.sheetTotal - week.total;
      const known = KNOWN_SHEET_TOTAL_ERRORS[exp.col];
      if (known) {
        assert.equal(cents(diff), cents(known.sheetMinusApp), `column ${exp.col} (${known.why}): sheet - app`);
      } else if (cents(diff) !== 0) {
        unexplained.push(`${exp.col}: sheet ${exp.sheetTotal}, app ${week.total}, diff ${diff}`);
      }
    }
    assert.deepEqual(unexplained, [], 'weeks that differ from the sheet without an explanation');
  });

  test('the importer warned about exactly the weeks where the sheet total is wrong', () => {
    const flagged = warnings.filter((w) => w.includes('planner TOTALS says')).map((w) => w.split(':')[0]);
    assert.deepEqual(flagged.sort(), ['Apr 2026 W1', 'Jun 2026 W4', 'May 2026 W5'].sort());
  });

  test('named host lines never exceed the sheet Hosts & Promoters total', () => {
    const hostWarnings = warnings.filter((w) => w.includes('Hosts & Promoters') && w.includes('lines add up to'));
    assert.deepEqual(hostWarnings, []);
  });

  test('month and period reports add up to the sum of their weeks', () => {
    const months = reports.summary({ key: '2026-01', ym: 202601, year: 2026, month: 1 }, { key: '2026-12', ym: 202612, year: 2026, month: 12 }, 'month');
    const weekRows = reports.summary({ key: '2026-01', ym: 202601, year: 2026, month: 1 }, { key: '2026-12', ym: 202612, year: 2026, month: 12 }, 'week');

    const expectedGrand = expected.reduce((s, e) => s + cents(e.total), 0);
    assert.equal(cents(months.totals.total), expectedGrand, 'grand total (by month)');
    assert.equal(cents(weekRows.totals.total), expectedGrand, 'grand total (by week)');
    assert.equal(months.totals.weeks, 17);

    for (const key of CATEGORY_KEYS) {
      const fromSheet = expected.reduce((s, e) => s + cents(e.byCategory[key]), 0);
      assert.equal(cents(months.totals.byCategory[key]), fromSheet, `category ${key} over the year`);
    }

    // Every month row equals the sum of its week rows, and the category columns add up to the row total.
    for (const m of months.rows) {
      const weeksInMonth = weekRows.rows.filter((w) => w.month === m.month && w.year === m.year);
      assert.equal(cents(m.total), weeksInMonth.reduce((s, w) => s + cents(w.total), 0), `${m.label} month total`);
      assert.equal(m.weeks, weeksInMonth.length, `${m.label} week count`);
      assert.equal(cents(m.total), CATEGORY_KEYS.reduce((s, k) => s + cents(m.byCategory[k]), 0), `${m.label} categories add up`);
    }
  });

  test('comparing two months reports the true difference', () => {
    const a = { key: '2026-05', ym: 202605, year: 2026, month: 5 };
    const b = { key: '2026-06', ym: 202606, year: 2026, month: 6 };
    const cmp = reports.compareMonths(a, b);
    const monthExpected = (month: number) => expected.filter((e) => e.month === month).reduce((s, e) => s + cents(e.total), 0);
    assert.equal(cents(cmp.a.total), monthExpected(5));
    assert.equal(cents(cmp.b.total), monthExpected(6));
  });

  test(
    'live database matches the sheet (set FP_LIVE_DB to run)',
    { skip: !process.env.FP_LIVE_DB },
    () => {
      // FP_EXCLUDE="headline,hosts" lists categories that were deliberately removed from the live data.
      const exclude = (process.env.FP_EXCLUDE ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      const live = openDb(process.env.FP_LIVE_DB!);
      checkAgainstSheet(createStores(live).forOrg('felice')!.repo.weekSummaries(YEAR * 100 + 1, YEAR * 100 + 12), exclude);
      live.close();
    },
  );
});
