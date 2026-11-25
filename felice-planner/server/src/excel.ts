import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import {
  CATEGORIES,
  CATEGORY_KEYS,
  categoryLabel,
  isCategory,
  MONTH_NAMES,
  weekLabel,
  type CategoryKey,
} from '../../shared/categories.ts';
import type { Organisation, PaymentSchedule, SummaryReport } from '../../shared/types.ts';
import type { NewDj, NewItem, NewPrice, WeekInput } from './repo.ts';
import { HttpError } from './validate.ts';

const MONEY_FORMAT = '"R" #,##0.00';
const MAX_WARNINGS = 60;
const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const fmt = (cents: number) => zar.format(cents / 100);

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

/** Collects warnings, keeping the first MAX_WARNINGS and saying so once when there are more. */
function warningCollector() {
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(msg);
    else if (warnings.length === MAX_WARNINGS) warnings.push('More warnings were found and not shown.');
  };
  return { warnings, warn };
}

export function isFormula(v: ExcelJS.CellValue): boolean {
  return typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v);
}

export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
  if ('text' in v && typeof v.text === 'string') return v.text.trim();
  if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
  return '';
}

/** Numeric value of a cell, using the cached result for formulas. */
export function cellNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[R\s,]/g, '');
    if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    return Number(cleaned);
  }
  if (typeof v === 'object' && v !== null && 'result' in v) return cellNumber(v.result as ExcelJS.CellValue);
  return null;
}

export const toCents = (n: number) => Math.round(n * 100);

function monthFromText(s: string): number {
  // Accepts "May", "Sept", "June 2026"; needs at least three letters.
  const t = s.trim().toLowerCase().split(/\s+/)[0]!.replace(/[^a-z]/g, '');
  if (t.length < 3) return 0;
  return MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(t)) + 1;
}

function categoryFromText(s: string): CategoryKey | null {
  const t = s.trim().toLowerCase();
  if (isCategory(t)) return t;
  const byLabel = CATEGORIES.find((c) => c.label.toLowerCase() === t || c.label.toLowerCase().replace('&', 'and') === t);
  return byLabel?.key ?? null;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

interface ExportLine {
  org: string;
  year: number;
  month: number;
  weekNo: number;
  category: CategoryKey;
  name: string;
  amount: number;
  riderCost: number;
  notes: string;
  isDj: boolean;
}

/** Workbook with a period summary plus a flat "Line Items" sheet that can be imported again. */
export async function buildExport(report: SummaryReport, lines: ExportLine[], title: string, orgs: Organisation[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Alur & Felice Planner';
  wb.created = new Date();
  const combined = orgs.length > 1;

  const summary = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3 }] });
  summary.addRow([`${title}: ${report.from} to ${report.to} (by ${report.groupBy})`]).font = { bold: true, size: 14 };
  summary.addRow([]);
  // The combined report adds one total column per organisation after the categories.
  const orgColumns = combined ? orgs.map((o) => o.name) : [];
  const header = summary.addRow(['Period', 'Weeks', ...CATEGORIES.map((c) => c.label), 'Total', ...orgColumns]);
  header.font = { bold: true };
  for (const r of report.rows) {
    summary.addRow([r.label, r.weeks, ...CATEGORY_KEYS.map((k) => r.byCategory[k]), r.total, ...(combined ? orgs.map((o) => r.byOrg[o.slug] ?? 0) : [])]);
  }
  const totalRow = summary.addRow([
    'Total',
    report.totals.weeks,
    ...CATEGORY_KEYS.map((k) => report.totals.byCategory[k]),
    report.totals.total,
    ...(combined ? orgs.map((o) => report.totals.byOrg[o.slug]?.total ?? 0) : []),
  ]);
  totalRow.font = { bold: true };
  summary.getColumn(1).width = 18;
  summary.getColumn(2).width = 8;
  for (let c = 3; c <= CATEGORY_KEYS.length + 3 + orgColumns.length; c++) {
    summary.getColumn(c).width = 18;
    summary.getColumn(c).numFmt = MONEY_FORMAT;
  }

  const items = wb.addWorksheet('Line Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  items.columns = [
    ...(combined ? [{ header: 'Organisation', key: 'org', width: 16 }] : []),
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Week', key: 'week', width: 8 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Name', key: 'name', width: 40 },
    { header: 'Amount', key: 'amount', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Rider cost', key: 'riderCost', width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: 'Notes', key: 'notes', width: 40 },
    // "Yes" marks an individual Resident DJ, so importing the file again keeps them as DJs.
    { header: 'Resident DJ', key: 'dj', width: 14 },
  ];
  items.getRow(1).font = { bold: true };
  for (const l of lines) {
    items.addRow({
      org: l.org,
      year: l.year,
      month: MONTH_NAMES[l.month - 1],
      week: l.weekNo,
      category: categoryLabel(l.category),
      name: l.name,
      amount: l.amount,
      riderCost: l.riderCost,
      notes: l.notes,
      dj: l.isDj ? 'Yes' : '',
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/**
 * The bulk payment schedule for one week's resident DJs: one block per batch, with a subtotal for each
 * batch and a grand total. The Paid column is left empty to tick off as the payments go through.
 */
export async function buildPaymentSchedule(schedule: PaymentSchedule, orgName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Alur & Felice Planner';
  wb.created = new Date();
  const ws = wb.addWorksheet('Payment schedule', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { key: 'batch', width: 9 },
    { key: 'no', width: 6 },
    { key: 'name', width: 38 },
    { key: 'amount', width: 18, style: { numFmt: MONEY_FORMAT } },
    { key: 'notes', width: 34 },
    { key: 'paid', width: 10 },
  ];

  ws.addRow([`${orgName} resident DJ payments: ${schedule.label}`]).font = { bold: true, size: 14 };
  ws.addRow([`${schedule.count} DJs in ${schedule.batches.length} batches of up to ${schedule.batchSize}. Amounts are the DJ rates.`]);
  ws.addRow([]);
  const header = ws.addRow(['Batch', 'No.', 'DJ', 'Amount', 'Notes', 'Paid']);
  header.font = { bold: true };
  header.alignment = { horizontal: 'left' };
  ws.views = [{ state: 'frozen', ySplit: header.number }];

  for (const batch of schedule.batches) {
    for (const p of batch.payments) ws.addRow({ batch: batch.batchNo, no: p.no, name: p.name, amount: p.amount, notes: p.notes, paid: '' });
    const sub = ws.addRow({ name: `Batch ${batch.batchNo} total`, amount: batch.total });
    sub.font = { bold: true };
    sub.eachCell((c) => {
      c.border = { top: { style: 'thin' } };
    });
    ws.addRow([]);
  }
  const total = ws.addRow({ name: 'Total to pay', amount: schedule.total });
  total.font = { bold: true, size: 12 };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ParsedImport {
  format: 'planner' | 'flat';
  weeks: WeekInput[];
  warnings: string[];
}

/** A file that cannot be imported. It is an HttpError, so the API answers 400 with this message. */
export class ImportError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

/**
 * Reads either the app's own export ("Line Items" sheet) or the original planner layout
 * (months across the top, WEEK n columns, categories down column B). `plannerYear` is used for
 * the planner layout, which has no year in it.
 */
export async function parseWorkbook(data: Buffer, plannerYear: number, organisation?: Organisation): Promise<ParsedImport> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  } catch {
    throw new ImportError('The file could not be read as an Excel (.xlsx) workbook');
  }

  const { warnings, warn } = warningCollector();

  for (const ws of wb.worksheets) {
    const flat = parseFlat(ws, warn, organisation);
    if (flat) return { format: 'flat', weeks: flat, warnings };
  }
  for (const ws of wb.worksheets) {
    const planner = parsePlanner(ws, plannerYear, warn);
    if (planner) return { format: 'planner', weeks: planner, warnings };
  }
  throw new ImportError(
    'No importable sheet found. Use an Alur & Felice Planner export, or the planner layout with "WEEK 1", "WEEK 2"… column headers.',
  );
}

function weekBucket(map: Map<string, WeekInput>, year: number, month: number, weekNo: number): WeekInput {
  const key = `${year}-${month}-${weekNo}`;
  let w = map.get(key);
  if (!w) {
    w = { year, month, weekNo, items: [] };
    map.set(key, w);
  }
  return w;
}

function parseFlat(ws: ExcelJS.Worksheet, warn: (m: string) => void, organisation?: Organisation): WeekInput[] | null {
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => headers.set(cellText(cell.value).toLowerCase(), col));
  const need = ['year', 'month', 'week', 'category', 'name', 'amount'];
  if (!need.every((h) => headers.has(h))) return null;

  const col = (h: string) => headers.get(h)!;
  const weeks = new Map<string, WeekInput>();
  // A combined export has an Organisation column. Only this organisation's rows are imported.
  const orgHeader = headers.has('organisation') ? 'organisation' : null;
  let otherOrgRows = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (h: string) => row.getCell(col(h)).value;
    if (need.every((h) => cellText(get(h)) === '')) continue;
    if (orgHeader && organisation) {
      const rowOrg = cellText(get(orgHeader)).toLowerCase();
      if (rowOrg && rowOrg !== organisation.name.toLowerCase() && rowOrg !== organisation.slug) {
        otherOrgRows++;
        continue;
      }
    }

    const year = cellNumber(get('year'));
    const monthRaw = get('month');
    const month = cellNumber(monthRaw) ?? monthFromText(cellText(monthRaw));
    const weekNo = cellNumber(get('week'));
    const category = categoryFromText(cellText(get('category')));
    const name = cellText(get('name')).slice(0, 200);
    const amount = cellNumber(get('amount'));
    const notes = headers.has('notes') ? cellText(get('notes')).slice(0, 1000) : '';
    const riderHeader = headers.has('rider cost') ? 'rider cost' : headers.has('rider') ? 'rider' : null;
    const rider = riderHeader ? cellNumber(get(riderHeader)) : 0;
    // "Resident DJ" = Yes marks an individual DJ line. Only meaningful in the Resident DJs category.
    const djCell = headers.has('resident dj') ? cellText(get('resident dj')).toLowerCase() : '';
    const isDj = category === 'resident' && ['yes', 'true', '1', 'y'].includes(djCell);

    const problems: string[] = [];
    if (!year || !Number.isInteger(year) || year < 2000 || year > 2100) problems.push('year');
    if (!month || !Number.isInteger(month) || month < 1 || month > 12) problems.push('month');
    if (!weekNo || !Number.isInteger(weekNo) || weekNo < 1 || weekNo > 5) problems.push('week (1-5)');
    if (!category) problems.push('category');
    if (!name) problems.push('name');
    if (amount === null || amount < 0) problems.push('amount');
    if (rider === null && riderHeader && cellText(get(riderHeader)) !== '') problems.push('rider cost');
    if (rider !== null && rider < 0) problems.push('rider cost');
    if (problems.length) {
      warn(`${ws.name} row ${r} skipped: check ${problems.join(', ')}`);
      continue;
    }
    const bucket = weekBucket(weeks, year!, month, weekNo!);
    // A DJ can be in a week once, so a repeated name is skipped rather than failing the whole import.
    if (isDj && bucket.items.some((i) => i.dj && i.name.toLowerCase() === name.toLowerCase())) {
      warn(`${ws.name} row ${r} skipped: ${name} is already in ${weekLabel(year!, month, weekNo!, true)}`);
      continue;
    }
    bucket.items.push({
      category: category!,
      name,
      amountCents: toCents(amount!),
      riderCents: toCents(rider ?? 0),
      notes,
      dj: isDj,
    });
  }
  if (otherOrgRows > 0 && organisation) {
    warn(`${otherOrgRows} rows belonging to other organisations were skipped. Only ${organisation.name} rows were imported.`);
  }
  return [...weeks.values()];
}

// ---------------------------------------------------------------------------
// Resident DJ list import
// ---------------------------------------------------------------------------

const MAX_DJS_PER_FILE = 200;

/**
 * A rate as typed by a person. Handles "R1 500,00", "1,500.50", "1500", and a decimal comma as used by
 * South African Excel. Anything else is not a rate (null), so a bad cell is reported, never guessed at.
 */
function parseRate(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'object' && v !== null && 'result' in v) return parseRate(v.result as ExcelJS.CellValue);
  if (typeof v !== 'string') return null;
  const s = v.replace(/[R\s\u00a0]/gi, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, '')); // 1,500.50
  if (/^\d+,\d{1,2}$/.test(s)) return Number(s.replace(',', '.')); // 1500,50
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** Reads a sheet from an .xlsx upload, or from a .csv upload (comma, semicolon or tab separated). */
async function readSheets(data: Buffer): Promise<ExcelJS.Worksheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    if (data[0] === 0x50 && data[1] === 0x4b) {
      await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
      return wb.worksheets;
    }
    // CSV. Drop a byte-order mark, and use whichever separator the first line uses most.
    const text = (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? data.subarray(3) : data).toString('utf8');
    const firstLine = text.split(/\r?\n/, 1)[0]!;
    const count = (ch: string) => firstLine.split(ch).length - 1;
    const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
    // Values stay text here: parseRate reads them, so "1500,50" is never mistaken for 150050.
    const ws = await wb.csv.read(Readable.from(Buffer.from(text, 'utf8')), {
      parserOptions: { delimiter },
      map: (value: string) => value,
    });
    return [ws];
  } catch {
    throw new ImportError('The file could not be read. Upload an Excel (.xlsx) or CSV file.');
  }
}

export interface ParsedDjList {
  djs: NewDj[];
  warnings: string[];
}

/**
 * Reads a list of resident DJs. The first rows must hold a header with a Name column (or "DJ") and a
 * Rate column (or "Fee" or "Amount"); Notes is optional. One DJ appears once: repeats are skipped and reported.
 */
export async function parseResidentDjs(data: Buffer): Promise<ParsedDjList> {
  const sheets = await readSheets(data);
  const { warnings, warn } = warningCollector();

  for (const ws of sheets) {
    let headerRow = 0;
    let nameCol = 0;
    let rateCol = 0;
    let notesCol = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
      let n = 0;
      let rate = 0;
      let notes = 0;
      ws.getRow(r).eachCell((cell, col) => {
        const t = cellText(cell.value).toLowerCase();
        if (/^(resident\s+)?dj(\s+name)?$|^name$/.test(t)) n ||= col;
        else if (/^(rate|fee|amount|cost|payment)$/.test(t)) rate ||= col;
        else if (/^(notes?|reference|comments?)$/.test(t)) notes ||= col;
      });
      if (n && rate) [headerRow, nameCol, rateCol, notesCol] = [r, n, rate, notes];
    }
    if (!headerRow) continue;

    const djs: NewDj[] = [];
    const seen = new Set<string>();
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nameText = cellText(row.getCell(nameCol).value);
      const rateValue = row.getCell(rateCol).value;
      if (nameText === '' && cellText(rateValue) === '') continue; // blank row

      const rate = parseRate(rateValue);
      const problems: string[] = [];
      if (!nameText) problems.push('name');
      else if (nameText.length > 200) problems.push('name (200 characters at most)');
      if (rate === null || rate < 0 || rate > 1_000_000_000) problems.push('rate');
      if (problems.length) {
        warn(`Row ${r} skipped: check the ${problems.join(' and ')}`);
        continue;
      }
      const key = nameText.toLowerCase();
      if (seen.has(key)) {
        warn(`Row ${r} skipped: ${nameText} is already in the list`);
        continue;
      }
      seen.add(key);
      djs.push({
        name: nameText,
        rateCents: toCents(rate!),
        notes: notesCol ? cellText(row.getCell(notesCol).value).slice(0, 1000) : '',
      });
    }
    if (djs.length > MAX_DJS_PER_FILE) throw new ImportError(`A file can have at most ${MAX_DJS_PER_FILE} DJs`);
    if (djs.length === 0) throw new ImportError('No DJs were found below the header row');
    return { djs, warnings };
  }
  throw new ImportError('No header row found. The first rows need columns called "Name" (or "DJ") and "Rate".');
}

// ---------------------------------------------------------------------------
// Rider price list import
// ---------------------------------------------------------------------------

const MAX_PRICES_PER_FILE = 500;

export interface ParsedPriceList {
  prices: NewPrice[];
  warnings: string[];
}

/**
 * Reads a rider price list: an item column (Beverage, Item, Product or Name) and a cost column (Cost or Price,
 * optionally "incl VAT"). Every sheet is looked at until one has both, so the price list is found whether it is
 * the only sheet or a tab of the Rider Calc workbook. An item appears once: repeats are skipped and reported.
 * A row whose item is just "0" is the workbook's blank-rider placeholder and is ignored.
 */
export async function parseRiderPrices(data: Buffer): Promise<ParsedPriceList> {
  const sheets = await readSheets(data);
  const { warnings, warn } = warningCollector();

  for (const ws of sheets) {
    let headerRow = 0;
    let nameCol = 0;
    let costCol = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
      let n = 0;
      let c = 0;
      ws.getRow(r).eachCell((cell, col) => {
        const t = cellText(cell.value).toLowerCase().replace(/\s+/g, ' ');
        if (/^(beverage|item|product|name)s?$/.test(t)) n ||= col;
        else if (/^(unit )?(cost|price)( incl\.? vat| \(incl\.? vat\))?$/.test(t)) c ||= col;
      });
      if (n && c) [headerRow, nameCol, costCol] = [r, n, c];
    }
    if (!headerRow) continue;

    const prices: NewPrice[] = [];
    const seen = new Set<string>();
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = cellText(row.getCell(nameCol).value).replace(/\s+/g, ' ').trim();
      const costValue = row.getCell(costCol).value;
      if (name === '' && cellText(costValue) === '') continue; // blank row
      if (name === '0') continue; // the placeholder that gives an empty rider row a cost of 0

      const cost = parseRate(costValue);
      const problems: string[] = [];
      if (!name) problems.push('item');
      else if (name.length > 200) problems.push('item (200 characters at most)');
      if (cost === null || cost < 0 || cost > 1_000_000) problems.push('cost');
      if (problems.length) {
        warn(`Row ${r} skipped: check the ${problems.join(' and ')}`);
        continue;
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        warn(`Row ${r} skipped: ${name} is already in the list`);
        continue;
      }
      seen.add(key);
      prices.push({ name, costCents: toCents(cost!) });
    }
    if (prices.length > MAX_PRICES_PER_FILE) throw new ImportError(`A file can have at most ${MAX_PRICES_PER_FILE} items`);
    if (prices.length === 0) throw new ImportError('No items were found below the header row');
    return { prices, warnings };
  }
  throw new ImportError('No header row found. The first rows need a column called "Item" (or "Beverage") and one called "Cost" (or "Price").');
}

const SECTION_HEADERS: [RegExp, CategoryKey][] = [
  [/^headline/i, 'headline'],
  [/^resident/i, 'resident'],
  [/^standard/i, 'standard'],
  [/^physical/i, 'physical'],
  [/^social/i, 'social'],
  [/^hosts?\b/i, 'hosts'],
  [/^other$/i, 'other'],
];

/** Sections whose header row holds a total that its named lines should add up to. */
const RECONCILED: CategoryKey[] = ['standard', 'physical', 'social', 'hosts', 'other'];

function parsePlanner(ws: ExcelJS.Worksheet, year: number, warn: (m: string) => void): WeekInput[] | null {
  // Header row: the first row with two or more "WEEK n" cells.
  let headerRow = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 30) && !headerRow; r++) {
    let count = 0;
    ws.getRow(r).eachCell((c) => {
      if (/^week\s*\d/i.test(cellText(c.value))) count++;
    });
    if (count >= 2) headerRow = r;
  }
  if (headerRow < 2) return null;

  let labelCol = 2;
  ws.getRow(headerRow).eachCell((c, col) => {
    if (/^category$/i.test(cellText(c.value))) labelCol = col;
  });
  const notesCol = labelCol + 1;

  // Week columns, with the month carried forward from the merged month header above.
  const columns: { col: number; month: number; weekNo: number; label: string }[] = [];
  const seen = new Set<string>();
  let month = 0;
  for (let col = notesCol + 1; col <= ws.columnCount; col++) {
    const m = monthFromText(cellText(ws.getCell(headerRow - 1, col).value));
    if (m) month = m;
    const wk = /^week\s*(\d)/i.exec(cellText(ws.getCell(headerRow, col).value));
    if (!wk || !month) continue;
    const weekNo = Number(wk[1]);
    const key = `${month}-${weekNo}`;
    if (weekNo < 1 || weekNo > 5 || seen.has(key)) {
      warn(`Column ${col} (${MONTH_NAMES[month - 1]} WEEK ${weekNo}) skipped: duplicate or invalid week`);
      continue;
    }
    seen.add(key);
    columns.push({ col, month, weekNo, label: weekLabel(year, month, weekNo, true) });
  }
  if (columns.length === 0) return null;

  const items = new Map<number, NewItem[]>(columns.map((c) => [c.col, []]));
  const sectionTotals = new Map<string, number>(); // "category:col" -> cents
  const sheetTotals = new Map<number, number>(); // col -> cents
  const push = (col: number, item: NewItem) => items.get(col)!.push(item);

  let section: CategoryKey | null = null;
  let lastHeadlineCol: number | null = null;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const label = cellText(row.getCell(labelCol).value);
    const noteCell = row.getCell(notesCol).value;
    const values = columns.map((c) => ({ ...c, raw: row.getCell(c.col).value }));

    if (/^totals?$/i.test(label)) {
      for (const v of values) {
        const n = cellNumber(v.raw);
        if (n !== null) sheetTotals.set(v.col, toCents(n));
      }
      continue;
    }

    const header = SECTION_HEADERS.find(([re]) => re.test(label));
    if (header) {
      section = header[1];
      for (const v of values) {
        const n = cellNumber(v.raw);
        if (n === null || n <= 0) continue;
        if (section === 'resident') push(v.col, { category: 'resident', name: 'Resident DJs', amountCents: toCents(n), notes: '' });
        else if (RECONCILED.includes(section)) sectionTotals.set(`${section}:${v.col}`, toCents(n));
      }
      continue;
    }

    if (section === 'resident' && /^rider/i.test(label)) {
      for (const v of values) {
        const n = cellNumber(v.raw);
        if (n && n > 0) push(v.col, { category: 'rider', name: 'Resident DJ rider', amountCents: toCents(n), notes: '' });
      }
      continue;
    }

    if (section === 'hosts' && !label && /^rider/i.test(cellText(noteCell))) {
      for (const v of values) {
        const n = cellNumber(v.raw);
        if (n && n > 0) push(v.col, { category: 'rider', name: 'Hosts rider', amountCents: toCents(n), notes: '' });
      }
      continue;
    }

    if (section === 'headline') {
      for (const v of values) {
        if (isFormula(v.raw)) continue; // the sheet's own subtotal rows
        const n = cellNumber(v.raw);
        if (n === null || n === 0) continue;
        if (n < 0) {
          warn(`Row ${r}, ${v.label}: negative amount skipped`);
          continue;
        }
        push(v.col, { category: 'headline', name: label || 'Unnamed act', amountCents: toCents(n), notes: '' });
        lastHeadlineCol = v.col;
      }
      // A number in the notes column under a block of acts is that week's headline rider.
      const rider = isFormula(noteCell) ? null : cellNumber(noteCell);
      if (rider && rider > 0) {
        if (lastHeadlineCol !== null) {
          push(lastHeadlineCol, { category: 'rider', name: 'Headline acts rider', amountCents: toCents(rider), notes: '' });
        } else {
          warn(`Row ${r}: rider amount ${fmt(toCents(rider))} has no week above it and was skipped`);
        }
      }
      continue;
    }

    if (section && RECONCILED.includes(section)) {
      for (const v of values) {
        if (isFormula(v.raw)) continue;
        const n = cellNumber(v.raw);
        if (n === null || n === 0) continue;
        if (n < 0) {
          warn(`Row ${r}, ${v.label}: negative amount skipped`);
          continue;
        }
        if (!label) {
          warn(`Row ${r}, ${v.label}: ${fmt(toCents(n))} has no name and was skipped`);
          continue;
        }
        push(v.col, { category: section, name: label.slice(0, 200), amountCents: toCents(n), notes: '' });
      }
    }
  }

  // Section totals that are higher than their named lines keep the difference as an "unallocated" line.
  for (const [key, totalCents] of sectionTotals) {
    const [cat, colText] = key.split(':') as [CategoryKey, string];
    const col = Number(colText);
    const lines = items.get(col)!;
    const sum = lines.filter((i) => i.category === cat).reduce((s, i) => s + i.amountCents, 0);
    const label = columns.find((c) => c.col === col)!.label;
    if (totalCents > sum) {
      lines.push({
        category: cat,
        name: `${categoryLabel(cat)} (unallocated)`,
        amountCents: totalCents - sum,
        notes: 'Imported: the planner total was higher than its named lines',
      });
    } else if (totalCents < sum) {
      warn(`${label} ${categoryLabel(cat)}: lines add up to ${fmt(sum)} but the planner total says ${fmt(totalCents)}. Lines kept.`);
    }
  }

  // Flag weeks where the spreadsheet's own TOTALS row disagrees with the sum of the lines.
  for (const c of columns) {
    const sheet = sheetTotals.get(c.col);
    if (sheet === undefined) continue;
    const imported = items.get(c.col)!.reduce((s, i) => s + i.amountCents, 0);
    if (Math.abs(sheet - imported) >= 1) {
      warn(`${c.label}: planner TOTALS says ${fmt(sheet)}, the lines add up to ${fmt(imported)} (difference ${fmt(imported - sheet)})`);
    }
  }

  return columns.map((c) => ({ year, month: c.month, weekNo: c.weekNo, items: items.get(c.col)! }));
}
