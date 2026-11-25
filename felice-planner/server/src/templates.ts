// Downloadable import templates. Each one holds example rows that the matching importer reads without
// warnings, so a person can open it, replace the examples with their own data and import it. The tests
// run every template through the real importer, so a template can never drift away from what is accepted.
import ExcelJS from 'exceljs';
import { CATEGORIES, MONTH_NAMES } from '../../shared/categories.ts';

export interface Template {
  /** The id used in the URL: /api/templates/:id */
  id: string;
  /** The file name offered for download. */
  file: string;
  title: string;
  description: string;
  /** Content type of the download. */
  type: string;
  build: () => Promise<Buffer>;
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY = '#,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
const EXAMPLE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

async function toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Alur & Felice Planner';
  wb.created = new Date();
  return wb;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = { bottom: { style: 'thin' } };
  });
}

/** A "READ ME" sheet: a title, a few lines of guidance, then a two-column table. */
function addReadMe(wb: ExcelJS.Workbook, title: string, intro: string[], table: [string, string][], tableHeading: [string, string]) {
  const ws = wb.addWorksheet('READ ME');
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 100;
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([]);
  for (const line of intro) {
    const r = ws.addRow([line]);
    r.getCell(1).alignment = { wrapText: false };
  }
  ws.addRow([]);
  styleHeader(ws.addRow(tableHeading));
  for (const [a, b] of table) {
    const r = ws.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.getCell(1).alignment = { vertical: 'top' };
  }
}

// ---------------------------------------------------------------------------
// 1. Planned weeks, in the app's own format (what Export produces)
// ---------------------------------------------------------------------------

type FlatRow = [year: number, month: number | string, week: number, category: string, name: string, amount: number, rider: number, notes: string, dj: string];

const categoryLabels = CATEGORIES.map((c) => c.label);

const PLANNED_EXAMPLES: FlatRow[] = [
  [2026, 'November', 1, 'Headline Acts', 'Example Headliner A', 40000, 8500, 'Rate and rider cost are both needed', ''],
  [2026, 'November', 1, 'Headline Acts', 'Example Headliner B', 25000, 4000, '', ''],
  [2026, 'November', 1, 'Hosts & Promoters', 'Example Host', 8000, 1500, 'Hosts also carry a rider cost', ''],
  [2026, 'November', 1, 'Resident DJs', 'Example DJ One', 1500, 0, 'One line per DJ: put Yes in the Resident DJ column', 'Yes'],
  [2026, 'November', 1, 'Resident DJs', 'Example DJ Two', 1200, 0, '', 'Yes'],
  [2026, 'November', 1, 'Rider Costs', 'Resident DJ rider', 2500, 0, '', ''],
  [2026, 'November', 1, 'Standard Costs', 'MC', 4000, 0, '', ''],
  [2026, 'November', 1, 'Standard Costs', 'Graphics', 3000, 0, '', ''],
  [2026, 'November', 1, 'Physical Marketing', 'Corex Boards', 3500, 0, '', ''],
  [2026, 'November', 1, 'Social Media', 'Instagram', 2000, 0, '', ''],
  [2026, 'November', 1, 'Other', 'Venue deposit', 5000, 0, '', ''],
  [2026, 'November', 2, 'Headline Acts', 'Example Headliner C', 30000, 5000, '', ''],
  [2026, 'November', 2, 'Standard Costs', 'MC', 4000, 0, '', ''],
  [2026, 'November', 2, 'Social Media', 'Instagram', 2000, 0, '', ''],
  [2026, 12, 1, 'Headline Acts', 'Example Headliner D', 35000, 6000, 'The month can also be a number (12 is December)', ''],
  [2026, 12, 1, 'Standard Costs', 'Photographer', 2500, 0, '', ''],
];

async function buildPlannedWeeks(): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Line Items', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Week', key: 'week', width: 8 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: MONEY } },
    { header: 'Rider cost', key: 'rider', width: 14, style: { numFmt: MONEY } },
    { header: 'Notes', key: 'notes', width: 48 },
    { header: 'Resident DJ', key: 'dj', width: 14 },
  ];
  styleHeader(ws.getRow(1));
  for (const r of PLANNED_EXAMPLES) {
    const row = ws.addRow(r.map((v) => (v === '' ? null : v)));
    row.eachCell({ includeEmpty: false }, (c) => (c.fill = EXAMPLE_FILL));
  }
  // Drop-down lists so a wrong category, week or Resident DJ value cannot be typed by accident.
  for (let r = 2; r <= 500; r++) {
    ws.getCell(r, 2).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${MONTH_NAMES.join(',')}"`] };
    ws.getCell(r, 3).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [1, 5],
      showErrorMessage: true,
      errorTitle: 'Week',
      error: 'The week must be a whole number from 1 to 5.',
    };
    ws.getCell(r, 4).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${categoryLabels.join(',')}"`] };
    ws.getCell(r, 9).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] };
  }

  addReadMe(
    wb,
    'Planned weeks: import template',
    [
      'The Line Items sheet holds example rows (shaded). Replace them with your own, then use Import & export > Import from Excel > Preview.',
      'Delete the shaded example rows you do not need: every week that appears in the file REPLACES that week in the app.',
      'This is the same format the app produces when you export, so an exported file can be edited and imported again.',
    ],
    [
      ['Year', 'Four digits, for example 2026.'],
      ['Month', 'The month name (November, Nov) or number (11).'],
      ['Week', 'The week of the month, 1 to 5.'],
      ['Category', `One of: ${categoryLabels.join(', ')}.`],
      ['Name', 'The act, person or cost, up to 200 characters.'],
      ['Amount', 'In rand, with a full stop for cents (1500.50). For acts, hosts and DJs this is the rate (fee).'],
      ['Rider cost', 'Headline Acts and Hosts & Promoters: the rider cost of that booking (0 if none). Leave empty for other categories.'],
      ['Notes', 'Optional, up to 1000 characters.'],
      ['Resident DJ', 'Optional. Yes marks an individual resident DJ (Resident DJs category only). A DJ can be in a week once.'],
      ['Organisation', 'Optional extra column, as in a combined export. When present, only rows for the organisation you are importing into are used.'],
    ],
    ['Column', 'What to enter'],
  );
  return toBuffer(wb);
}

// ---------------------------------------------------------------------------
// 2. Planned weeks, in the layout of the original planner spreadsheet
// ---------------------------------------------------------------------------

interface PlannerWeek {
  month: string;
  week: number;
  headliners: [string, number][];
  headRider: number;
  residentLump: number;
  residentRider: number;
  standard: [string, number][];
  physical: [string, number][];
  social: [string, number][];
  hosts: [string, number][];
  hostsRider: number;
  other: [string, number][];
}

const PLANNER_WEEKS: PlannerWeek[] = [
  {
    month: 'November', week: 1,
    headliners: [['Example Headliner A', 40000], ['Example Headliner B', 25000]], headRider: 12500,
    residentLump: 26000, residentRider: 2500,
    standard: [['MC', 4000], ['Graphics', 3000]], physical: [['Corex Boards', 3500]], social: [['Instagram', 2000]],
    hosts: [['Example Host', 8000]], hostsRider: 1500, other: [['Venue deposit', 5000]],
  },
  {
    month: 'November', week: 2,
    headliners: [['Example Headliner C', 30000]], headRider: 5000,
    residentLump: 26000, residentRider: 2500,
    standard: [['MC', 4000]], physical: [], social: [['Instagram', 2000]],
    hosts: [['Example Host', 8000]], hostsRider: 1500, other: [],
  },
  {
    month: 'November', week: 3,
    headliners: [['Example Headliner D', 28000]], headRider: 4500,
    residentLump: 26000, residentRider: 2500,
    standard: [['MC', 4000], ['Photographer', 2500]], physical: [], social: [['Instagram', 2000]],
    hosts: [['Example Host', 8000]], hostsRider: 1500, other: [],
  },
  {
    month: 'December', week: 1,
    headliners: [['Example Headliner E', 45000], ['Example Headliner F', 20000]], headRider: 9000,
    residentLump: 27000, residentRider: 3000,
    standard: [['MC', 4000]], physical: [['Billboards', 6000]], social: [['Instagram', 2500]],
    hosts: [['Example Host', 9000]], hostsRider: 2000, other: [],
  },
  {
    month: 'December', week: 2,
    headliners: [['Example Headliner G', 38000]], headRider: 7000,
    residentLump: 27000, residentRider: 3000,
    standard: [['MC', 4000]], physical: [], social: [['Instagram', 2500]],
    hosts: [['Example Host', 9000]], hostsRider: 2000, other: [['Decor', 3500]],
  },
];

const sum = (lines: [string, number][]) => lines.reduce((s, [, n]) => s + n, 0);
const weekTotal = (w: PlannerWeek) =>
  sum(w.headliners) + w.headRider + w.residentLump + w.residentRider + sum(w.standard) + sum(w.physical) + sum(w.social) + sum(w.hosts) + w.hostsRider + sum(w.other);

/** Exposed for the tests: what the importer should read from the planner-layout template. */
export const PLANNER_TEMPLATE_WEEKS = PLANNER_WEEKS.map((w) => ({ month: w.month, week: w.week, total: weekTotal(w) }));

async function buildPlannerLayout(): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Event Marketing Timeline');
  const FIRST = 4; // the first week column (D). Column B is the category, column C the notes.
  const col = (i: number) => FIRST + i;
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 14;
  PLANNER_WEEKS.forEach((_, i) => (ws.getColumn(col(i)).width = 14));

  ws.getCell('B1').value = 'WEEKLY PLANNER (original layout)';
  ws.getCell('B1').font = { bold: true, size: 14 };

  // Row 2: the month over its weeks (merged). Row 3: the WEEK n headers.
  let start = 0;
  PLANNER_WEEKS.forEach((w, i) => {
    const last = i === PLANNER_WEEKS.length - 1 || PLANNER_WEEKS[i + 1]!.month !== w.month;
    if (last) {
      ws.getCell(2, col(start)).value = w.month;
      if (i > start) ws.mergeCells(2, col(start), 2, col(i));
      ws.getCell(2, col(start)).font = { bold: true };
      ws.getCell(2, col(start)).alignment = { horizontal: 'center' };
      start = i + 1;
    }
  });
  ws.getCell('B3').value = 'CATEGORY';
  ws.getCell('C3').value = 'Notes';
  PLANNER_WEEKS.forEach((w, i) => (ws.getCell(3, col(i)).value = `WEEK ${w.week}`));
  styleHeader(ws.getRow(3));

  let r = 4;
  const label = (text: string, bold = false) => {
    const c = ws.getCell(r, 2);
    c.value = text;
    if (bold) c.font = { bold: true };
  };
  const money = (c: number, v: number) => {
    const cell = ws.getCell(r, c);
    cell.value = v;
    cell.numFmt = MONEY;
  };

  label('TOTALS', true);
  PLANNER_WEEKS.forEach((w, i) => money(col(i), weekTotal(w)));
  ws.getRow(r).font = { bold: true };
  r++;

  // Headline acts: the act names in column B, the rate in the week's column, and the week's rider cost
  // in the Notes column on the row under that week's acts.
  label('Headline Acts', true);
  ws.getCell(r, 3).value = 'Rider';
  r++;
  PLANNER_WEEKS.forEach((w, i) => {
    for (const [name, amount] of w.headliners) {
      label(name);
      money(col(i), amount);
      r++;
    }
    money(3, w.headRider);
    r++;
  });

  // Sections with a total in the header row, followed by the lines that make it up.
  const section = (title: string, pick: (w: PlannerWeek) => [string, number][]) => {
    label(title, true);
    PLANNER_WEEKS.forEach((w, i) => {
      const total = sum(pick(w));
      if (total > 0) money(col(i), total);
    });
    r++;
    const names = [...new Set(PLANNER_WEEKS.flatMap((w) => pick(w).map(([n]) => n)))];
    for (const name of names) {
      label(name);
      PLANNER_WEEKS.forEach((w, i) => {
        const line = pick(w).find(([n]) => n === name);
        if (line) money(col(i), line[1]);
      });
      r++;
    }
  };

  label('Resident DJs', true);
  PLANNER_WEEKS.forEach((w, i) => money(col(i), w.residentLump));
  r++;
  label('Rider');
  PLANNER_WEEKS.forEach((w, i) => money(col(i), w.residentRider));
  r++;

  section('Standard Costs', (w) => w.standard);
  section('Physical Marketing', (w) => w.physical);
  section('Social Media', (w) => w.social);
  section('Hosts & Promoters', (w) => w.hosts);
  ws.getCell(r, 3).value = 'Rider'; // the hosts' rider: no category name, "Rider" in the Notes column
  PLANNER_WEEKS.forEach((w, i) => money(col(i), w.hostsRider));
  r++;
  section('Other', (w) => w.other);

  addReadMe(
    wb,
    'Planned weeks in the original planner layout: import template',
    [
      'This reproduces the layout of the original Weekly Planner spreadsheet, for loading old planner files. For new data,',
      'the "Planned weeks" template is simpler. Use Import & export > Import from Excel, and set Year (this layout has no year).',
      'Replace the examples with your own, or paste your own planner over them. Every week in the file REPLACES that week in the app.',
    ],
    [
      ['Months and weeks', 'Row 2 has the month over its weeks; row 3 has WEEK 1, WEEK 2 ... above each week column. Weeks are 1 to 5.'],
      ['Headline Acts', 'One row per act, with the rate in that week\'s column. The rider cost for that week goes in the Notes column on the row under its acts.'],
      ['Resident DJs', 'The total for the week in the header row, and a Rider row under it.'],
      ['Standard, Physical, Social, Hosts, Other', 'The section total in the header row, then one row per named line. If the total is higher than the lines, the difference is kept as an "(unallocated)" line.'],
      ['Hosts rider', 'A row with nothing in the category column and the word Rider in the Notes column.'],
      ['TOTALS', 'Optional. If it disagrees with the lines, the preview says so.'],
    ],
    ['Part', 'What to enter'],
  );
  return toBuffer(wb);
}

// ---------------------------------------------------------------------------
// 3. Resident DJs (a week's list, or the recurring list)
// ---------------------------------------------------------------------------

const DJ_EXAMPLES: [string, number | string, string][] = [
  ['Example DJ One', 1500, 'Friday and Saturday'],
  ['Example DJ Two', 1200, ''],
  ['Example DJ Three', 1000, 'The rate can also be typed as R1 000,00'],
  ['Example DJ Four', 1000, ''],
  ['Example DJ Five', 800, ''],
  ['Example DJ Six', 800, ''],
];

async function buildResidentDjs(): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('DJs', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Rate', key: 'rate', width: 14, style: { numFmt: MONEY } },
    { header: 'Notes', key: 'notes', width: 48 },
  ];
  styleHeader(ws.getRow(1));
  for (const [name, rate, notes] of DJ_EXAMPLES) {
    const row = ws.addRow([name, rate, notes === '' ? null : notes]);
    row.eachCell({ includeEmpty: false }, (c) => (c.fill = EXAMPLE_FILL));
  }
  addReadMe(
    wb,
    'Resident DJs: import template',
    [
      'Use this on a week (Weekly planner > the week > Import resident DJs from a file) or on Recurring costs.',
      'DJs already in the week or list get the new rate, new DJs are added, and nobody is removed. Use Preview first.',
    ],
    [
      ['Name', 'The DJ. A heading of "DJ" also works. A DJ appears once: repeats in the file are skipped.'],
      ['Rate', 'In rand. 1500, R1 500,00 and 1,500.50 are all read correctly. A heading of Fee or Amount also works.'],
      ['Notes', 'Optional. A heading of Reference or Comments also works.'],
      ['Limits', 'Up to 200 DJs per file. The heading row must be within the first 10 rows.'],
      ['CSV', 'A .csv file with the same columns also works (comma, semicolon or tab separated).'],
    ],
    ['Column', 'What to enter'],
  );
  return toBuffer(wb);
}

async function buildResidentDjsCsv(): Promise<Buffer> {
  const q = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['Name,Rate,Notes', ...DJ_EXAMPLES.map(([n, r, notes]) => [q(n), String(r), q(notes)].join(','))];
  // A byte-order mark so Excel opens the file as UTF-8; the importer ignores it.
  return Buffer.from('\ufeff' + lines.join('\r\n') + '\r\n', 'utf8');
}

// ---------------------------------------------------------------------------
// 4. Rider price list
// ---------------------------------------------------------------------------

const PRICE_EXAMPLES: [string, number][] = [
  ['Example Cognac VS 750ml', 561.2],
  ['Example Cognac VSOP 750ml', 897],
  ['Example Tequila 750ml', 1015.34],
  ['Example Sparkling wine', 807.3],
  ['Example Tonic 200ml', 7.08],
  ['Example Energy drink', 16.83],
  ['Example Still water 500ml', 5.75],
  ['Example Orange juice 1l', 33],
  ['Example Hubbly', 25],
  ['Example Food platter', 500],
];

async function buildRiderPrices(): Promise<Buffer> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Rider prices', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Item', key: 'item', width: 36 },
    { header: 'Cost incl VAT', key: 'cost', width: 18, style: { numFmt: MONEY } },
  ];
  styleHeader(ws.getRow(1));
  for (const [item, cost] of PRICE_EXAMPLES) {
    const row = ws.addRow([item, cost]);
    row.eachCell({ includeEmpty: false }, (c) => (c.fill = EXAMPLE_FILL));
  }
  addReadMe(
    wb,
    'Rider price list: import template',
    [
      'Use this on Rider prices > Import price list. It is the list the rider calculator picks from when you work out a rider.',
      'Items already in the list get the new cost, new items are added, and nothing is removed. Use Preview first.',
      'The "Sheet1" tab of the Rider Calc workbook (Beverage and Cost) can be imported as it is.',
    ],
    [
      ['Item', 'The drink or item, up to 200 characters. A heading of Beverage, Product or Name also works. An item appears once: repeats are skipped.'],
      ['Cost incl VAT', 'What one costs, including VAT, in rand. 897, R897,00 and 1,897.50 are all read correctly. A heading of Cost or Price also works.'],
      ['CSV', 'A .csv file with the same two columns also works.'],
    ],
    ['Column', 'What to enter'],
  );
  return toBuffer(wb);
}

// ---------------------------------------------------------------------------
// 5. Actual expenditure: the weekly expense workbook
// ---------------------------------------------------------------------------

interface ExpenseSection {
  heading: string;
  lines: [string, number, number?][]; // name, amount due, amount paid
}

const EXPENSE_WEEKS: { tab: string; sections: ExpenseSection[] }[] = [
  {
    tab: '03-09',
    sections: [
      { heading: 'RESIDENTS', lines: [['Camera', 4000, 4000], ['MC - Crowd Controller', 4000, 4000], ['Graphics', 3000]] },
      { heading: "LOCAL DJ's", lines: [['Example DJ One', 1500, 1500], ['Example DJ Two', 1200, 1200], ['Example DJ Three', 1000]] },
      { heading: 'HOSTS', lines: [['Example Host A', 8000, 8000], ['Example Host B', 6500]] },
      { heading: 'RIDERS', lines: [['Headliner rider', 12500], ['Resident DJ rider', 2500, 2500]] },
      { heading: 'BOTTLE GIRLS', lines: [['Example Bottle Girl A', 1200, 1200], ['Example Bottle Girl B', 1200]] },
      { heading: 'HEADLINERS', lines: [['Example Headliner A', 40000, 40000], ['Example Headliner B', 25000]] },
      { heading: 'Miscellenious', lines: [['Felice - Boosting', 5000], ['Alur - Workstream', 2500]] },
    ],
  },
  {
    tab: '10-16',
    sections: [
      { heading: 'RESIDENTS', lines: [['Camera', 4000], ['MC - Crowd Controller', 4000]] },
      { heading: "LOCAL DJ's", lines: [['Example DJ One', 1500], ['Example DJ Two', 1200]] },
      { heading: 'HOSTS', lines: [['Example Host A', 8000]] },
      { heading: 'RIDERS', lines: [['Headliner rider', 9000]] },
      { heading: 'BOTTLE GIRLS', lines: [['Example Bottle Girl A', 1200]] },
      { heading: 'HEADLINERS', lines: [['Example Headliner C', 30000]] },
      { heading: 'Miscellenious', lines: [['Felice - Boosting', 5000]] },
    ],
  },
];

/** Exposed for the tests: the section subtotals the importer should read, per tab. */
export const EXPENSE_TEMPLATE_TABS = EXPENSE_WEEKS.map((w) => ({
  tab: w.tab,
  sections: w.sections.map((s) => ({ heading: s.heading, due: s.lines.reduce((t, [, n]) => t + n, 0), paid: s.lines.reduce((t, [, , p]) => t + (p ?? 0), 0) })),
}));

async function buildExpenseWorkbook(): Promise<Buffer> {
  const wb = newWorkbook();
  for (const week of EXPENSE_WEEKS) {
    const ws = wb.addWorksheet(week.tab);
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 34;
    ws.getColumn(3).width = 24;
    ws.getColumn(4).width = 18;
    ws.getCell('C1').value = 'WEEKLY EXPENSES';
    ws.getCell('C1').font = { bold: true, size: 14 };
    ws.getCell('C2').value = 'DATE';

    const due = week.sections.reduce((t, s) => t + s.lines.reduce((u, [, n]) => u + n, 0), 0);
    const paid = week.sections.reduce((t, s) => t + s.lines.reduce((u, [, , p]) => u + (p ?? 0), 0), 0);
    // D3 is the tab's total amount due. The importer cross-checks it against the section subtotals.
    ws.getCell('C3').value = 'TOTAL AMOUNT DUE:';
    ws.getCell('C4').value = 'TOTAL AMOUNT PAID:';
    ws.getCell('C5').value = 'TOTAL OUTSTANDING:';
    ws.getCell('D3').value = due;
    ws.getCell('D4').value = paid;
    ws.getCell('D5').value = due - paid;
    for (const a of ['D3', 'D4', 'D5']) ws.getCell(a).numFmt = MONEY;
    for (const a of ['C3', 'C4', 'C5']) ws.getCell(a).font = { bold: true };

    let r = 6;
    for (const section of week.sections) {
      // Heading row: "#" in column A and the section name in column B. The importer starts a section here.
      ws.getCell(r, 1).value = '#';
      ws.getCell(r, 2).value = section.heading;
      ws.getCell(r, 3).value = 'AMOUNT DUE';
      ws.getCell(r, 4).value = 'AMOUNT PAID';
      styleHeader(ws.getRow(r));
      r++;
      const first = r;
      section.lines.forEach(([name, amount, amountPaid], i) => {
        ws.getCell(r, 1).value = i + 1;
        ws.getCell(r, 2).value = name;
        ws.getCell(r, 3).value = amount;
        if (amountPaid) ws.getCell(r, 4).value = amountPaid;
        ws.getCell(r, 3).numFmt = MONEY;
        ws.getCell(r, 4).numFmt = MONEY;
        for (let c = 1; c <= 4; c++) ws.getCell(r, c).fill = EXAMPLE_FILL;
        r++;
      });
      // SUBTOTAL row: the only row the importer reads for this section (amount due in C, paid in D).
      const dueTotal = section.lines.reduce((t, [, n]) => t + n, 0);
      const paidTotal = section.lines.reduce((t, [, , p]) => t + (p ?? 0), 0);
      ws.getCell(r, 1).value = 'SUBTOTAL';
      ws.getCell(r, 2).value = 'SUBTOTAL';
      ws.getCell(r, 3).value = { formula: `SUM(C${first}:C${r - 1})`, result: dueTotal };
      ws.getCell(r, 4).value = { formula: `SUM(D${first}:D${r - 1})`, result: paidTotal };
      ws.getCell(r, 3).numFmt = MONEY;
      ws.getCell(r, 4).numFmt = MONEY;
      ws.getRow(r).font = { bold: true };
      r += 2;
    }
  }

  addReadMe(
    wb,
    'Actual expenditure: import template',
    [
      'One tab is one week. At the end of each week, use Import & export > Import actual expenditure, choose the tab, and say which planned week it is.',
      'Only each section\'s SUBTOTAL row is read (amount due in column C, amount paid in column D). The individual lines are not compared.',
      'The tabs "03-09" and "10-16" are examples. Replace them with your own weeks; any tab with no sections (like this one) is skipped.',
    ],
    [
      ['Tab', 'One week. Name it as you like (for example 03-09 for 3 to 9 August).'],
      ['Section heading', 'A row with # in column A and the section name in column B. Sections: RESIDENTS, LOCAL DJ\'s, HOSTS, RIDERS, BOTTLE GIRLS, HEADLINERS, Miscellenious. An unknown heading is counted as Marketing & other, with a warning.'],
      ['Lines', 'Numbered rows under the heading: name in B, amount due in C, amount paid in D (optional).'],
      ['SUBTOTAL row', 'The word SUBTOTAL in column A or B, the amount due in C and the amount paid in D. Without it the lines are added up and a warning is shown.'],
      ['Total amount due', 'Cell D3. If it differs from the section subtotals added up, the preview warns.'],
      ['Miscellaneous', 'May include the other company\'s costs. In the preview, type the amount that belongs to this company; the week is then marked adjusted.'],
      ['How sections are compared', 'RESIDENTS and BOTTLE GIRLS: Standard Costs. LOCAL DJ\'s: Resident DJs. HOSTS: Hosts & Promoters. RIDERS: Rider Costs. HEADLINERS: Headline Acts. Miscellenious: Marketing & other.'],
    ],
    ['Item', 'What to enter'],
  );
  return toBuffer(wb);
}

export const TEMPLATES: Template[] = [
  {
    id: 'planned-weeks',
    file: 'planned-weeks-template.xlsx',
    title: 'Planned weeks (Excel)',
    description: 'One row per cost line, in the same format the app exports. Used by Import from Excel.',
    type: XLSX,
    build: buildPlannedWeeks,
  },
  {
    id: 'planner-layout',
    file: 'planner-layout-template.xlsx',
    title: 'Planned weeks in the original planner layout (Excel)',
    description: 'Months and WEEK columns across the top, as in the original Weekly Planner. Used by Import from Excel.',
    type: XLSX,
    build: buildPlannerLayout,
  },
  {
    id: 'resident-djs',
    file: 'resident-djs-template.xlsx',
    title: 'Resident DJs (Excel)',
    description: 'Name, Rate and Notes for each DJ. Used by Import resident DJs, on a week or on Recurring costs.',
    type: XLSX,
    build: buildResidentDjs,
  },
  {
    id: 'resident-djs-csv',
    file: 'resident-djs-template.csv',
    title: 'Resident DJs (CSV)',
    description: 'The same list as a CSV file.',
    type: 'text/csv; charset=utf-8',
    build: buildResidentDjsCsv,
  },
  {
    id: 'rider-prices',
    file: 'rider-prices-template.xlsx',
    title: 'Rider price list (Excel)',
    description: 'Item and cost incl VAT for each drink or item on a rider. Used by Import price list on the Rider prices page.',
    type: XLSX,
    build: buildRiderPrices,
  },
  {
    id: 'actual-expenditure',
    file: 'actual-expenditure-template.xlsx',
    title: 'Actual expenditure (Excel)',
    description: 'The weekly expense workbook: one tab per week, sections with a SUBTOTAL row. Used by Import actual expenditure.',
    type: XLSX,
    build: buildExpenseWorkbook,
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
