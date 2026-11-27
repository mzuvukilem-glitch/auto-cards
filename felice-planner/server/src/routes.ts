import express, { Router, type Request, type Response } from 'express';
import { categoryLabel, groupTotals, hasRiderCost, weekLabel } from '../../shared/categories.ts';
import type { ActualImportPreview, CompareReport, GroupBy, ImportResult } from '../../shared/types.ts';
import { applyAdjustments, listSheets, loadWorkbook, readSheet, summarise, toPreviewSections } from './actuals.ts';
import { TEMPLATES, templateById } from './templates.ts';
import { buildExport, buildPaymentSchedule, parseResidentDjs, parseRiderPrices, parseWorkbook } from './excel.ts';
import type { NewDj, NewItem, NewPrice, NewRiderLine } from './repo.ts';
import type { Backups } from './snapshot.ts';
import type { Scope, Stores } from './stores.ts';
import * as v from './validate.ts';

type Body = Record<string, unknown>;

const body = (req: Request): Body => (req.body && typeof req.body === 'object' ? (req.body as Body) : {});

/** The organisation (or combined scope) the request is for, set by the :org route guard. */
const scopeOf = (res: Response): Scope => res.locals.scope as Scope;

function itemFrom(b: Body): NewItem {
  const category = v.category(b.category);
  const isBlank = (x: unknown) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '');
  const needsRider = hasRiderCost(category);

  // Headline acts and hosts must be captured with both a Rate and a Rider Cost (0 is allowed if there is no rider).
  if (needsRider && isBlank(b.amount)) throw new v.HttpError(400, `${categoryLabel(category)}: the rate is required`);
  if (needsRider && isBlank(b.riderCost)) throw new v.HttpError(400, `${categoryLabel(category)}: the rider cost is required (enter 0 if there is none)`);

  return {
    category,
    name: v.text(b.name, 'name', 200, true),
    amountCents: v.money(b.amount, needsRider ? 'rate' : 'amount'),
    riderCents: needsRider ? v.money(b.riderCost, 'rider cost') : 0,
    notes: v.text(b.notes, 'notes', 1000),
  };
}

/** One entry of the rider price list. */
function priceFrom(b: Body): NewPrice {
  if (b.cost === undefined || b.cost === null || (typeof b.cost === 'string' && b.cost.trim() === '')) {
    throw new v.HttpError(400, 'Rider price: the cost is required');
  }
  return { name: v.text(b.name, 'name', 200, true), costCents: v.money(b.cost, 'cost') };
}

/** The items asked for on one rider: a name, the price of one, and how many. */
function riderLinesFrom(b: Body): NewRiderLine[] {
  if (!Array.isArray(b.lines)) throw new v.HttpError(400, 'lines must be a list');
  if (b.lines.length > 100) throw new v.HttpError(400, 'A rider can have at most 100 items');
  return b.lines.map((raw, i) => {
    const line = raw && typeof raw === 'object' ? (raw as Body) : {};
    const n = `item ${i + 1}`;
    if (line.unitCost === undefined || line.unitCost === null || (typeof line.unitCost === 'string' && line.unitCost.trim() === '')) {
      throw new v.HttpError(400, `Rider ${n}: the cost is required`);
    }
    const unitCents = v.money(line.unitCost, `Rider ${n} cost`);
    if (unitCents > 1_000_000_00) throw new v.HttpError(400, `Rider ${n} cost must be at most 1,000,000`);
    return { name: v.text(line.name, `Rider ${n} name`, 200, true), unitCents, quantity: v.int(line.quantity, `Rider ${n} quantity`, 1, 9999) };
  });
}

/** One resident DJ: a name and a rate (0 is allowed, for example an unpaid guest slot). */
function djFrom(b: Body): NewDj {
  if (b.rate === undefined || b.rate === null || (typeof b.rate === 'string' && b.rate.trim() === '')) {
    throw new v.HttpError(400, 'Resident DJs: the rate is required');
  }
  return {
    name: v.text(b.name, 'name', 200, true),
    rateCents: v.money(b.rate, 'rate'),
    notes: v.text(b.notes, 'notes', 1000),
  };
}

/** Reads an uploaded .xlsx or .csv list of resident DJs. */
async function djListFrom(req: Request) {
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) throw new v.HttpError(400, 'Upload an Excel (.xlsx) or CSV file');
  return parseResidentDjs(data);
}

/** Reads an uploaded .xlsx or .csv rider price list. */
async function priceListFrom(req: Request) {
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) throw new v.HttpError(400, 'Upload an Excel (.xlsx) or CSV file');
  return parseRiderPrices(data);
}
/** Reads an uploaded expense workbook (.xlsx). */
async function expenseWorkbookFrom(req: Request) {
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new v.HttpError(400, 'Upload an Excel .xlsx file');
  }
  return loadWorkbook(data);
}

/** Section totals the person changed in the preview: { "MISCELLENIOUS": 9500 }. */
function adjustmentsFrom(value: unknown): Record<string, number> {
  if (value === undefined || value === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new v.HttpError(400, 'adjust must be JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new v.HttpError(400, 'adjust must be an object');
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 20) throw new v.HttpError(400, 'Too many adjusted sections');
  const out: Record<string, number> = {};
  for (const [heading, amount] of entries) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) {
      throw new v.HttpError(400, `The adjusted amount for "${heading}" must be a number from 0 to 1,000,000,000`);
    }
    out[heading] = amount;
  }
  return out;
}

const isDryRun = (req: Request) => req.query.dryRun === '1' || req.query.dryRun === 'true';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function groupBy(value: unknown): GroupBy {
  if (value === undefined || value === 'month') return 'month';
  if (value === 'week') return 'week';
  throw new v.HttpError(400, 'groupBy must be "month" or "week"');
}

export function apiRoutes(stores: Stores, backups: Backups): Router {
  const root = Router();

  root.get('/orgs', (_req, res) => {
    res.json(stores.organisations);
  });

  // --- Backup and restore (the whole database, both companies) -----------------------
  root.get('/backup', (_req, res) => {
    const { data, filename } = backups.download();
    res.set('Cache-Control', 'no-store').type('application/octet-stream').attachment(filename).send(data);
  });

  // Upload a backup file as the raw request body. ?dryRun=1 only checks it and reports what it holds.
  root.post('/backup/restore', express.raw({ type: () => true, limit: '200mb' }), (req, res) => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new v.HttpError(400, 'Upload a backup (.db) file');
    res.json(isDryRun(req) ? backups.check(data) : backups.restore(data));
  });

  // --- Import templates --------------------------------------------------------
  // Example files for every import, generated on request so they always match what the importers accept.
  root.get('/templates', (_req, res) => {
    res.json(TEMPLATES.map(({ id, file, title, description }) => ({ id, file, title, description })));
  });

  root.get('/templates/:id', async (req, res) => {
    const template = templateById(String(req.params.id));
    if (!template) throw new v.HttpError(404, 'Template not found');
    res.type(template.type).attachment(template.file).send(await template.build());
  });

  // ===========================================================================
  // One organisation: /api/orgs/:org/...
  // ===========================================================================
  const org = Router();

  // --- Weeks -----------------------------------------------------------------
  org.get('/weeks', (req, res) => {
    const { from, to } = req.query;
    const range = from || to ? v.period(from, to) : null;
    res.json(scopeOf(res).repo.weekSummaries(range?.from.ym ?? 200001, range?.to.ym ?? 210012));
  });

  org.post('/weeks', (req, res) => {
    const b = body(req);
    const week = scopeOf(res).repo.createWeek(
      {
        year: v.int(b.year, 'year', 2000, 2100),
        month: v.int(b.month, 'month', 1, 12),
        weekNo: v.int(b.weekNo, 'weekNo', 1, 5),
        notes: v.text(b.notes, 'notes', 1000),
      },
      b.copyRecurring === true,
    );
    res.status(201).json(week);
  });

  org.get('/weeks/:id', (req, res) => {
    res.json(scopeOf(res).repo.getWeek(v.id(req.params.id)));
  });

  org.patch('/weeks/:id', (req, res) => {
    res.json(scopeOf(res).repo.updateWeekNotes(v.id(req.params.id), v.text(body(req).notes, 'notes', 1000)));
  });

  org.delete('/weeks/:id', (req, res) => {
    scopeOf(res).repo.deleteWeek(v.id(req.params.id));
    res.status(204).end();
  });

  // --- Line items ------------------------------------------------------------
  org.post('/weeks/:id/items', (req, res) => {
    res.status(201).json(scopeOf(res).repo.addItem(v.id(req.params.id), itemFrom(body(req))));
  });

  org.put('/items/:id', (req, res) => {
    res.json(scopeOf(res).repo.updateItem(v.id(req.params.id), itemFrom(body(req))));
  });

  org.delete('/items/:id', (req, res) => {
    scopeOf(res).repo.deleteItem(v.id(req.params.id));
    res.status(204).end();
  });

  // --- Rider prices and the rider calculator ------------------------------------------------
  org.get('/rider-prices', (_req, res) => {
    res.json(scopeOf(res).repo.riderPrices());
  });
  org.post('/rider-prices', (req, res) => {
    res.status(201).json(scopeOf(res).repo.addRiderPrice(priceFrom(body(req))));
  });
  // Upload an .xlsx or .csv as the raw request body. ?dryRun=1 previews without saving.
  org.post('/rider-prices/import', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
    const { repo } = scopeOf(res);
    const parsed = await priceListFrom(req);
    const result = isDryRun(req) ? repo.previewRiderPrices(parsed.prices) : repo.importRiderPrices(parsed.prices);
    res.json({ ...result, warnings: parsed.warnings });
  });
  org.put('/rider-prices/:id', (req, res) => {
    res.json(scopeOf(res).repo.updateRiderPrice(v.id(req.params.id), priceFrom(body(req))));
  });
  org.delete('/rider-prices/:id', (req, res) => {
    scopeOf(res).repo.deleteRiderPrice(v.id(req.params.id));
    res.status(204).end();
  });
  // The rider of a headline act or host. Saving it sets that booking's rider cost to the total.
  org.get('/items/:id/rider', (req, res) => {
    res.json(scopeOf(res).repo.itemRider(v.id(req.params.id)));
  });
  org.put('/items/:id/rider', (req, res) => {
    res.json(scopeOf(res).repo.setItemRider(v.id(req.params.id), riderLinesFrom(body(req))));
  });
  // Copies this booking's rider onto other headline acts and hosts, replacing their riders.
  org.post('/items/:id/rider/copy', (req, res) => {
    const { toItemIds } = body(req);
    if (!Array.isArray(toItemIds)) throw new v.HttpError(400, 'toItemIds must be a list');
    if (toItemIds.length > 100) throw new v.HttpError(400, 'A rider can be copied to at most 100 bookings at once');
    res.json(scopeOf(res).repo.copyItemRider(v.id(req.params.id), toItemIds.map((x) => v.id(x, 'toItemIds'))));
  });

  // --- Resident DJs (individual DJs, each with a rate, linked to a week) -----
  org.post('/weeks/:id/resident-djs', (req, res) => {
    res.status(201).json(scopeOf(res).repo.addResidentDj(v.id(req.params.id), djFrom(body(req))));
  });

  // Upload an .xlsx or .csv as the raw request body. ?dryRun=1 previews without saving.
  org.post('/weeks/:id/resident-djs/import', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
    const { repo } = scopeOf(res);
    const weekId = v.id(req.params.id);
    const { djs, warnings } = await djListFrom(req);
    const result = isDryRun(req) ? repo.previewResidentDjs(weekId, djs) : repo.importResidentDjs(weekId, djs);
    res.json({ ...result, warnings });
  });

  org.get('/weeks/:id/payment-schedule', (req, res) => {
    res.json(scopeOf(res).repo.paymentSchedule(v.id(req.params.id)));
  });

  org.get('/weeks/:id/payment-schedule.xlsx', async (req, res) => {
    const { repo, orgs } = scopeOf(res);
    const week = repo.getWeek(v.id(req.params.id));
    const schedule = repo.paymentSchedule(week.id);
    if (schedule.count === 0) throw new v.HttpError(400, 'This week has no resident DJs to pay yet');
    const file = await buildPaymentSchedule(schedule, orgs[0]!.name);
    const stamp = `${week.year}-${String(week.month).padStart(2, '0')}-W${week.weekNo}`;
    res.type(XLSX).attachment(`${orgs[0]!.slug}_resident-dj-payments_${stamp}.xlsx`).send(file);
  });

  // --- Recurring costs (added to every new week) ----------------------------
  org.post('/recurring/resident-djs', (req, res) => {
    res.status(201).json(scopeOf(res).repo.addRecurringDj(djFrom(body(req))));
  });

  org.post('/recurring/resident-djs/import', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
    const { repo } = scopeOf(res);
    const { djs, warnings } = await djListFrom(req);
    const result = isDryRun(req) ? repo.previewRecurringDjs(djs) : repo.importRecurringDjs(djs);
    res.json({ ...result, warnings });
  });

  org.get('/recurring', (_req, res) => {
    res.json(scopeOf(res).repo.recurringItems());
  });

  org.post('/recurring', (req, res) => {
    res.status(201).json(scopeOf(res).repo.addRecurring(itemFrom(body(req))));
  });

  org.put('/recurring/:id', (req, res) => {
    res.json(scopeOf(res).repo.updateRecurring(v.id(req.params.id), itemFrom(body(req))));
  });

  org.delete('/recurring/:id', (req, res) => {
    scopeOf(res).repo.deleteRecurring(v.id(req.params.id));
    res.status(204).end();
  });

  // --- Reports ---------------------------------------------------------------
  org.get('/reports/summary', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    res.json(scopeOf(res).reports.summary(from, to, groupBy(req.query.groupBy)));
  });

  org.get('/reports/top', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    const limit = req.query.limit === undefined ? 10 : v.int(req.query.limit, 'limit', 1, 100);
    res.json(scopeOf(res).reports.top(from, to, v.category(req.query.category), limit));
  });

  org.get('/reports/resident-bookings', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    res.json(scopeOf(res).reports.residentBookings(from, to));
  });

  org.get('/reports/compare', (req, res) => {
    const { reports } = scopeOf(res);
    const { mode, a, b } = req.query;
    if (mode === 'week') {
      res.json(reports.compareWeeks(v.id(a, 'a'), v.id(b, 'b')));
    } else if (mode === 'month' || mode === undefined) {
      res.json(reports.compareMonths(v.month(a, 'a'), v.month(b, 'b')));
    } else {
      throw new v.HttpError(400, 'mode must be "month" or "week"');
    }
  });

  org.get('/reports/export.xlsx', async (req, res) => {
    const { reports, orgs } = scopeOf(res);
    const { from, to } = v.period(req.query.from, req.query.to);
    const report = reports.summary(from, to, groupBy(req.query.groupBy));
    const file = await buildExport(report, reports.lineItems(from, to), `${orgs[0]!.name} report`, orgs);
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment(`${orgs[0]!.slug}_${from.key}_to_${to.key}.xlsx`)
      .send(file);
  });

  // --- Actual expenditure ----------------------------------------------------
  // One tab of the weekly expense workbook is one week. Only the section totals are read and stored.
  org.get('/actuals', (req, res) => {
    const { from, to } = req.query;
    const range = from || to ? v.period(from, to) : null;
    res.json(scopeOf(res).repo.actualSummaries(range?.from.ym ?? 200001, range?.to.ym ?? 210012));
  });

  org.get('/actuals/:id', (req, res) => {
    res.json(scopeOf(res).repo.getActualWeek(v.id(req.params.id)));
  });

  org.delete('/actuals/:id', (req, res) => {
    scopeOf(res).repo.deleteActualWeek(v.id(req.params.id));
    res.status(204).end();
  });

  // Upload the workbook as the raw request body to list its tabs.
  org.post('/actuals/sheets', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    res.json(listSheets(await expenseWorkbookFrom(req)));
  });

  // Upload the workbook as the raw body, and say which tab and which week. ?dryRun=1 previews without saving.
  org.post('/actuals/import', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    const { repo } = scopeOf(res);
    const wb = await expenseWorkbookFrom(req);
    const sheet = v.text(req.query.sheet, 'sheet', 100, true);
    const ws = wb.getWorksheet(sheet);
    if (!ws) throw new v.HttpError(400, `The workbook has no tab called "${sheet}"`);
    const year = v.int(req.query.year, 'year', 2000, 2100);
    const month = v.int(req.query.month, 'month', 1, 12);
    const weekNo = v.int(req.query.weekNo, 'weekNo', 1, 5);

    const read = readSheet(ws);
    const chosen = applyAdjustments(read.sections, adjustmentsFrom(req.query.adjust));
    const sum = summarise(chosen.sections);
    const ym = year * 100 + month;
    const plan = repo.weekSummaries(ym, ym).find((w) => w.weekNo === weekNo);
    const warnings = [...read.warnings];
    if (!plan) warnings.push(`${weekLabel(year, month, weekNo)} has no plan, so its planned total is R0.00.`);

    const preview: ActualImportPreview = {
      applied: false,
      tab: read.tab,
      year,
      month,
      weekNo,
      total: sum.total,
      paid: sum.paid,
      byGroup: sum.byGroup,
      sections: toPreviewSections(chosen.sections),
      planned: plan ? { total: plan.total, byGroup: groupTotals(plan.byCategory) } : null,
      replaces: repo.hasActualWeek(year, month, weekNo),
      adjusted: chosen.adjusted,
      warnings,
    };

    if (!isDryRun(req)) {
      repo.importActualWeek({
        year,
        month,
        weekNo,
        label: read.tab,
        sections: chosen.sections.map((s) => ({
          heading: s.heading.slice(0, 200),
          group: s.group,
          amountCents: s.cents,
          sheetCents: s.sheetCents,
          paidCents: s.paidCents,
        })),
      });
      preview.applied = true;
    }
    res.json(preview);
  });

  org.get('/reports/variance', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    res.json(scopeOf(res).reports.variance(from, to, groupBy(req.query.groupBy)));
  });

  // --- Import ----------------------------------------------------------------
  // Upload the .xlsx as the raw request body. ?dryRun=1 previews without saving.
  org.post('/import', express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    const { repo, orgs } = scopeOf(res);
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
      throw new v.HttpError(400, 'Upload an Excel .xlsx file');
    }
    const year = req.query.year === undefined ? new Date().getFullYear() : v.int(req.query.year, 'year', 2000, 2100);
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

    const parsed = await parseWorkbook(data, year, orgs[0]);
    if (parsed.weeks.length === 0) throw new v.HttpError(400, 'No weeks were found in the file');

    const result: ImportResult = {
      format: parsed.format,
      applied: false,
      warnings: parsed.warnings,
      weeks: parsed.weeks.map((w) => ({
        year: w.year,
        month: w.month,
        weekNo: w.weekNo,
        label: weekLabel(w.year, w.month, w.weekNo, true),
        itemCount: w.items.length,
        total: w.items.reduce((s, i) => s + i.amountCents + (i.riderCents ?? 0), 0) / 100,
        exists: repo.findWeek(w.year, w.month, w.weekNo) !== null,
      })),
    };

    if (!dryRun) {
      repo.importWeeks(parsed.weeks);
      result.applied = true;
    }
    res.json(result);
  });

  root.use(
    '/orgs/:org',
    (req, res, next) => {
      const scope = stores.forOrg(String(req.params.org));
      if (!scope) {
        res.status(404).json({ error: 'Organisation not found' });
        return;
      }
      res.locals.scope = scope;
      next();
    },
    org,
  );

  // ===========================================================================
  // Master (all organisations combined, read-only): /api/master/...
  // ===========================================================================
  const master = Router();
  master.use((_req, res, next) => {
    res.locals.scope = stores.all();
    next();
  });

  master.get('/summary', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    res.json(scopeOf(res).reports.summary(from, to, groupBy(req.query.groupBy)));
  });

  master.get('/top', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    const limit = req.query.limit === undefined ? 10 : v.int(req.query.limit, 'limit', 1, 100);
    res.json(scopeOf(res).reports.top(from, to, v.category(req.query.category), limit));
  });

  master.get('/variance', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    res.json(scopeOf(res).reports.variance(from, to, groupBy(req.query.groupBy)));
  });

  master.get('/resident-bookings', (req, res) => {
    const { from, to } = v.period(req.query.from, req.query.to);
    res.json(scopeOf(res).reports.residentBookings(from, to));
  });

  // mode=org: one organisation against another over a period (a and b are organisation slugs).
  // mode=month: one combined month against another (a and b are YYYY-MM).
  master.get('/compare', (req, res) => {
    const { mode, a, b } = req.query;
    if (mode === 'org') {
      const { from, to } = v.period(req.query.from, req.query.to);
      const sideFor = (slug: unknown) => {
        const scope = stores.forOrg(String(slug));
        if (!scope) throw new v.HttpError(404, 'Organisation not found');
        const o = scope.orgs[0]!;
        return scope.reports.periodSide(from, to, o.name, o.slug);
      };
      const result: CompareReport = { mode: 'org', a: sideFor(a), b: sideFor(b) };
      res.json(result);
    } else if (mode === 'month' || mode === undefined) {
      res.json(scopeOf(res).reports.compareMonths(v.month(a, 'a'), v.month(b, 'b')));
    } else {
      throw new v.HttpError(400, 'mode must be "org" or "month"');
    }
  });

  master.get('/export.xlsx', async (req, res) => {
    const { reports, orgs } = scopeOf(res);
    const { from, to } = v.period(req.query.from, req.query.to);
    const report = reports.summary(from, to, groupBy(req.query.groupBy));
    const file = await buildExport(report, reports.lineItems(from, to), 'Combined report', orgs);
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment(`combined_${from.key}_to_${to.key}.xlsx`)
      .send(file);
  });

  root.use('/master', master);

  return root;
}
