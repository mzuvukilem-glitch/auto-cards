import type { DatabaseSync } from 'node:sqlite';
import {
  emptyByCategory,
  emptyByGroup,
  hasRiderCost,
  isCategory,
  PAYMENT_BATCH_SIZE,
  RECURRING_CATEGORIES,
  weekLabel,
  type CategoryKey,
  type VarianceGroupKey,
} from '../../shared/categories.ts';
import type {
  ActualSection,
  ActualWeekDetail,
  ActualWeekSummary,
  DjImportResult,
  DjImportRow,
  Item,
  PaymentSchedule,
  RecurringItem,
  RiderCalc,
  RiderLine,
  RiderPrice,
  RiderPriceImportResult,
  RiderPriceImportRow,
  Week,
  WeekDetail,
  WeekSummary,
} from '../../shared/types.ts';
import { COUNTED_ITEM, transaction } from './db.ts';
import { HttpError } from './validate.ts';

type Row = Record<string, unknown>;

export interface NewItem {
  category: CategoryKey;
  name: string;
  /** Rate for headline acts and hosts; the cost for every other category. */
  amountCents: number;
  /** Rider cost of this booking. Only meaningful for headline acts and hosts; defaults to 0. */
  riderCents?: number;
  notes: string;
  /** True for an individual Resident DJ (category "resident"). */
  dj?: boolean;
}

/** One entry of the rider price list. */
export interface NewPrice {
  name: string;
  costCents: number;
}

/** One item asked for on a rider. */
export interface NewRiderLine {
  name: string;
  unitCents: number;
  quantity: number;
}

/** One resident DJ with their rate. */
export interface NewDj {
  name: string;
  rateCents: number;
  notes: string;
}

export interface WeekInput {
  year: number;
  month: number;
  weekNo: number;
  notes?: string;
  items: NewItem[];
}

const toWeek = (r: Row): Week => ({
  id: Number(r.id),
  orgId: Number(r.org_id),
  year: Number(r.year),
  month: Number(r.month),
  weekNo: Number(r.week_no),
  notes: String(r.notes),
});

const toItem = (r: Row): Item => ({
  id: Number(r.id),
  weekId: Number(r.week_id),
  category: r.category as CategoryKey,
  name: String(r.name),
  amount: Number(r.amount_cents) / 100,
  riderCost: Number(r.rider_cents) / 100,
  notes: String(r.notes),
  isDj: Number(r.dj) === 1,
  riderItems: Number(r.rider_n ?? 0),
});

const toRiderPrice = (r: Row): RiderPrice => ({ id: Number(r.id), name: String(r.name), cost: Number(r.cost_cents) / 100 });

const toRecurring = (r: Row): RecurringItem => ({
  id: Number(r.id),
  category: r.category as CategoryKey,
  name: String(r.name),
  amount: Number(r.amount_cents) / 100,
  riderCost: Number(r.rider_cents) / 100,
  notes: String(r.notes),
  isDj: Number(r.dj) === 1,
});

/** The total of one section of the weekly expense sheet, to store. */
export interface NewActualSection {
  heading: string;
  group: VarianceGroupKey;
  amountCents: number;
  /** The subtotal printed on the sheet, kept so a later change can be seen. */
  sheetCents: number;
  paidCents: number;
}

export interface ActualWeekInput {
  year: number;
  month: number;
  weekNo: number;
  label: string;
  sections: NewActualSection[];
}

const toActualSection = (r: Row): ActualSection => ({
  id: Number(r.id),
  heading: String(r.heading),
  group: r.grp as VarianceGroupKey,
  amount: Number(r.amount_cents) / 100,
  sheetAmount: Number(r.sheet_cents) / 100,
  paid: Number(r.paid_cents) / 100,
});

/** Where a bulk list of DJs goes: one week, or the organisation's recurring list. */
interface DjTarget {
  find(name: string): Row | undefined;
  insert(dj: NewDj): void;
  update(id: number, rateCents: number, notes: string): void;
}

export type Repo = ReturnType<typeof createRepo>;

/**
 * Data access for the organisations in `orgIds`.
 * With one organisation the repo can read and change its data. With several (the master view) it can
 * only read, so a combined screen can never write to the wrong company.
 */
export function createRepo(db: DatabaseSync, orgIds: readonly number[]) {
  if (orgIds.length === 0) throw new Error('A repo needs at least one organisation');
  const ids = [...orgIds];
  const inOrgs = `(${ids.map(() => '?').join(',')})`;

  /** The organisation that changes are made to. */
  const writeOrg = (): number => {
    if (ids.length !== 1) throw new HttpError(400, 'Choose one organisation to make changes');
    return ids[0]!;
  };

  const q = {
    weeksInRange: db.prepare(
      `SELECT * FROM weeks WHERE org_id IN ${inOrgs} AND (year * 100 + month) BETWEEN ? AND ? ORDER BY year, month, week_no, org_id`,
    ),
    totalsInRange: db.prepare(`
      SELECT i.week_id, i.category, SUM(i.amount_cents) AS cents, SUM(i.rider_cents) AS rider_cents, COUNT(*) AS n
      FROM items i JOIN weeks w ON w.id = i.week_id
      WHERE w.org_id IN ${inOrgs} AND (w.year * 100 + w.month) BETWEEN ? AND ? AND ${COUNTED_ITEM}
      GROUP BY i.week_id, i.category`),
    weekById: db.prepare(`SELECT * FROM weeks WHERE id = ? AND org_id IN ${inOrgs}`),
    weekByKey: db.prepare('SELECT * FROM weeks WHERE org_id = ? AND year = ? AND month = ? AND week_no = ?'),
    insertWeek: db.prepare('INSERT INTO weeks (org_id, year, month, week_no, notes) VALUES (?, ?, ?, ?, ?)'),
    updateWeekNotes: db.prepare('UPDATE weeks SET notes = ? WHERE id = ?'),
    deleteWeek: db.prepare('DELETE FROM weeks WHERE id = ?'),
    itemsByWeek: db.prepare(
      'SELECT i.*, (SELECT COUNT(*) FROM rider_lines l WHERE l.item_id = i.id) AS rider_n FROM items i WHERE i.week_id = ? ORDER BY i.category, i.sort, i.id',
    ),
    itemById: db.prepare(
      `SELECT i.*, (SELECT COUNT(*) FROM rider_lines l WHERE l.item_id = i.id) AS rider_n
       FROM items i JOIN weeks w ON w.id = i.week_id WHERE i.id = ? AND w.org_id IN ${inOrgs}`,
    ),
    riderPrices: db.prepare(`SELECT * FROM rider_prices WHERE org_id IN ${inOrgs} ORDER BY lower(name), id`),
    riderPriceById: db.prepare(`SELECT * FROM rider_prices WHERE id = ? AND org_id IN ${inOrgs}`),
    riderPriceByName: db.prepare('SELECT * FROM rider_prices WHERE org_id = ? AND lower(trim(name)) = lower(trim(?))'),
    insertRiderPrice: db.prepare('INSERT INTO rider_prices (org_id, name, cost_cents) VALUES (?, ?, ?)'),
    updateRiderPrice: db.prepare('UPDATE rider_prices SET name = ?, cost_cents = ? WHERE id = ?'),
    deleteRiderPrice: db.prepare('DELETE FROM rider_prices WHERE id = ?'),
    riderLinesByItem: db.prepare('SELECT * FROM rider_lines WHERE item_id = ? ORDER BY sort, id'),
    insertRiderLine: db.prepare('INSERT INTO rider_lines (item_id, name, unit_cents, quantity, sort) VALUES (?, ?, ?, ?, ?)'),
    deleteRiderLines: db.prepare('DELETE FROM rider_lines WHERE item_id = ?'),
    setItemRider: db.prepare('UPDATE items SET rider_cents = ? WHERE id = ?'),
    nextSort: db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM items WHERE week_id = ? AND category = ?'),
    insertItem: db.prepare(
      'INSERT INTO items (week_id, category, name, amount_cents, rider_cents, notes, sort, dj) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    updateItem: db.prepare('UPDATE items SET category = ?, name = ?, amount_cents = ?, rider_cents = ?, notes = ? WHERE id = ?'),
    djInWeek: db.prepare('SELECT * FROM items WHERE week_id = ? AND dj = 1 AND lower(trim(name)) = lower(trim(?))'),
    djsInWeek: db.prepare('SELECT * FROM items WHERE week_id = ? AND dj = 1 ORDER BY lower(trim(name)), id'),
    updateDj: db.prepare('UPDATE items SET amount_cents = ?, notes = ? WHERE id = ?'),
    djInRecurring: db.prepare('SELECT * FROM recurring_items WHERE org_id = ? AND dj = 1 AND lower(trim(name)) = lower(trim(?))'),
    updateRecurringDj: db.prepare('UPDATE recurring_items SET amount_cents = ?, notes = ? WHERE id = ?'),
    deleteItem: db.prepare('DELETE FROM items WHERE id = ?'),
    deleteItemsForWeek: db.prepare('DELETE FROM items WHERE week_id = ?'),
    allRecurring: db.prepare(`SELECT * FROM recurring_items WHERE org_id IN ${inOrgs} ORDER BY category, sort, id`),
    recurringById: db.prepare(`SELECT * FROM recurring_items WHERE id = ? AND org_id IN ${inOrgs}`),
    nextRecurringSort: db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM recurring_items WHERE org_id = ? AND category = ?'),
    insertRecurring: db.prepare(
      'INSERT INTO recurring_items (org_id, category, name, amount_cents, rider_cents, notes, sort, dj) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ),
    updateRecurring: db.prepare(
      'UPDATE recurring_items SET category = ?, name = ?, amount_cents = ?, rider_cents = ?, notes = ? WHERE id = ?',
    ),
    deleteRecurring: db.prepare('DELETE FROM recurring_items WHERE id = ?'),
    actualWeeksInRange: db.prepare(
      `SELECT * FROM actual_weeks WHERE org_id IN ${inOrgs} AND (year * 100 + month) BETWEEN ? AND ? ORDER BY year, month, week_no, org_id`,
    ),
    actualTotalsInRange: db.prepare(`
      SELECT s.actual_week_id, s.grp, SUM(s.amount_cents) AS cents, SUM(s.paid_cents) AS paid_cents,
             MAX(CASE WHEN s.amount_cents <> s.sheet_cents THEN 1 ELSE 0 END) AS changed
      FROM actual_sections s JOIN actual_weeks w ON w.id = s.actual_week_id
      WHERE w.org_id IN ${inOrgs} AND (w.year * 100 + w.month) BETWEEN ? AND ?
      GROUP BY s.actual_week_id, s.grp`),
    actualWeekById: db.prepare(`SELECT * FROM actual_weeks WHERE id = ? AND org_id IN ${inOrgs}`),
    actualWeekByKey: db.prepare('SELECT * FROM actual_weeks WHERE org_id = ? AND year = ? AND month = ? AND week_no = ?'),
    insertActualWeek: db.prepare('INSERT INTO actual_weeks (org_id, year, month, week_no, label) VALUES (?, ?, ?, ?, ?)'),
    updateActualLabel: db.prepare('UPDATE actual_weeks SET label = ? WHERE id = ?'),
    deleteActualWeek: db.prepare('DELETE FROM actual_weeks WHERE id = ?'),
    actualSectionsByWeek: db.prepare('SELECT * FROM actual_sections WHERE actual_week_id = ? ORDER BY sort, id'),
    deleteActualSections: db.prepare('DELETE FROM actual_sections WHERE actual_week_id = ?'),
    insertActualSection: db.prepare(
      'INSERT INTO actual_sections (actual_week_id, heading, grp, amount_cents, sheet_cents, paid_cents, sort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
  };

  function requireActualWeek(id: number): Row {
    const row = q.actualWeekById.get(id, ...ids) as Row | undefined;
    if (!row) throw new HttpError(404, 'Actual expenditure not found');
    return row;
  }

  const emptyActualSummary = (r: Row): ActualWeekSummary => ({
    id: Number(r.id),
    orgId: Number(r.org_id),
    year: Number(r.year),
    month: Number(r.month),
    weekNo: Number(r.week_no),
    label: String(r.label),
    byGroup: emptyByGroup(),
    total: 0,
    paid: 0,
    adjusted: false,
  });

  function requireWeek(id: number): Week {
    const row = q.weekById.get(id, ...ids) as Row | undefined;
    if (!row) throw new HttpError(404, 'Week not found');
    return toWeek(row);
  }

  function requireItem(id: number): Item {
    const row = q.itemById.get(id, ...ids) as Row | undefined;
    if (!row) throw new HttpError(404, 'Line item not found');
    return toItem(row);
  }

  function requireRiderPrice(id: number): RiderPrice {
    const row = q.riderPriceById.get(id, ...ids) as Row | undefined;
    if (!row) throw new HttpError(404, 'Rider price not found');
    return toRiderPrice(row);
  }

  function toRiderCalc(item: Item): RiderCalc {
    const lines: RiderLine[] = (q.riderLinesByItem.all(item.id) as Row[]).map((r) => {
      const unit = Number(r.unit_cents);
      const quantity = Number(r.quantity);
      return { name: String(r.name), unitCost: unit / 100, quantity, total: (unit * quantity) / 100 };
    });
    // The rider cost of the booking is the total when there are lines, and what was typed when there are none.
    return { itemId: item.id, name: item.name, lines, total: lines.length ? lines.reduce((s, l) => s + Math.round(l.total * 100), 0) / 100 : item.riderCost };
  }

  function planPrices(orgId: number, prices: NewPrice[]): RiderPriceImportRow[] {
    return prices.map((p) => {
      const existing = q.riderPriceByName.get(orgId, p.name) as Row | undefined;
      if (!existing) return { name: p.name, cost: p.costCents / 100, status: 'new', currentCost: null };
      const current = Number(existing.cost_cents);
      return { name: p.name, cost: p.costCents / 100, status: current === p.costCents ? 'unchanged' : 'update', currentCost: current / 100 };
    });
  }

  function summarisePrices(rows: RiderPriceImportRow[], applied: boolean): RiderPriceImportResult {
    return {
      applied,
      rows,
      added: rows.filter((r) => r.status === 'new').length,
      updated: rows.filter((r) => r.status === 'update').length,
      unchanged: rows.filter((r) => r.status === 'unchanged').length,
      warnings: [],
    };
  }

  function requireRecurring(id: number): RecurringItem {
    const row = q.recurringById.get(id, ...ids) as Row | undefined;
    if (!row) throw new HttpError(404, 'Recurring cost not found');
    return toRecurring(row);
  }

  function requireRecurringCategory(category: CategoryKey) {
    if (!RECURRING_CATEGORIES.includes(category)) {
      throw new HttpError(400, 'That category cannot be a recurring cost');
    }
  }

  function insertItem(weekId: number, item: NewItem): Item {
    const sort = Number((q.nextSort.get(weekId, item.category) as Row).s);
    const { lastInsertRowid } = q.insertItem.run(
      weekId,
      item.category,
      item.name,
      item.amountCents,
      item.riderCents ?? 0,
      item.notes,
      sort,
      item.dj ? 1 : 0,
    );
    return requireItem(Number(lastInsertRowid));
  }

  const alreadyBooked = (name: string, where: string) => new HttpError(409, `${name} is already ${where}`);

  /** A Resident DJ can be in a week once. Another DJ with the same name (any capitalisation) is a clash. */
  function requireDjNameFree(weekId: number, name: string, exceptId?: number) {
    const clash = q.djInWeek.get(weekId, name) as Row | undefined;
    if (clash && Number(clash.id) !== exceptId) throw alreadyBooked(String(clash.name), 'booked in this week');
  }

  const weekDjTarget = (weekId: number): DjTarget => ({
    find: (name) => q.djInWeek.get(weekId, name) as Row | undefined,
    insert: (dj) =>
      void insertItem(weekId, { category: 'resident', name: dj.name, amountCents: dj.rateCents, notes: dj.notes, dj: true }),
    update: (id, rateCents, notes) => void q.updateDj.run(rateCents, notes, id),
  });

  const recurringDjTarget = (orgId: number): DjTarget => ({
    find: (name) => q.djInRecurring.get(orgId, name) as Row | undefined,
    insert: (dj) => {
      const sort = Number((q.nextRecurringSort.get(orgId, 'resident') as Row).s);
      q.insertRecurring.run(orgId, 'resident', dj.name, dj.rateCents, 0, dj.notes, sort, 1);
    },
    update: (id, rateCents, notes) => void q.updateRecurringDj.run(rateCents, notes, id),
  });

  /** What importing `djs` would do: add the new ones, update the rate of the ones already there. */
  function planDjs(target: DjTarget, djs: NewDj[]): DjImportRow[] {
    return djs.map((dj) => {
      const existing = target.find(dj.name);
      const currentCents = existing ? Number(existing.amount_cents) : null;
      const sameNotes = dj.notes === '' || (existing !== undefined && dj.notes === String(existing.notes ?? ''));
      const status = !existing ? 'new' : currentCents === dj.rateCents && sameNotes ? 'unchanged' : 'update';
      return {
        name: dj.name,
        rate: dj.rateCents / 100,
        notes: dj.notes,
        status,
        currentRate: currentCents === null ? null : currentCents / 100,
      };
    });
  }

  function applyDjs(target: DjTarget, djs: NewDj[]): DjImportResult {
    const rows = transaction(db, () => {
      const plan = planDjs(target, djs);
      djs.forEach((dj, i) => {
        const row = plan[i]!;
        const existing = target.find(dj.name);
        if (row.status === 'new') target.insert(dj);
        else if (row.status === 'update' && existing) {
          target.update(Number(existing.id), dj.rateCents, dj.notes === '' ? String(existing.notes ?? '') : dj.notes);
        }
      });
      return plan;
    });
    return summariseDjs(rows, djs, true);
  }

  function summariseDjs(rows: DjImportRow[], djs: NewDj[], applied: boolean): DjImportResult {
    return {
      applied,
      rows,
      added: rows.filter((r) => r.status === 'new').length,
      updated: rows.filter((r) => r.status === 'update').length,
      unchanged: rows.filter((r) => r.status === 'unchanged').length,
      total: djs.reduce((s, d) => s + d.rateCents, 0) / 100,
      warnings: [],
    };
  }

  function findWeek(year: number, month: number, weekNo: number): Week | null {
    const row = q.weekByKey.get(writeOrg(), year, month, weekNo) as Row | undefined;
    return row ? toWeek(row) : null;
  }

  function getWeek(id: number): WeekDetail {
    const week = requireWeek(id);
    return { ...week, items: (q.itemsByWeek.all(id) as Row[]).map(toItem) };
  }

  return {
    findWeek,
    getWeek,

    /** Weeks with per-category totals, for months fromYm..toYm (YYYYMM, inclusive). */
    weekSummaries(fromYm: number, toYm: number): WeekSummary[] {
      const weeks = new Map<number, WeekSummary>();
      for (const r of q.weeksInRange.all(...ids, fromYm, toYm) as Row[]) {
        const w = toWeek(r);
        weeks.set(w.id, { ...w, byCategory: emptyByCategory(), total: 0, itemCount: 0 });
      }
      for (const r of q.totalsInRange.all(...ids, fromYm, toYm) as Row[]) {
        const w = weeks.get(Number(r.week_id));
        if (!w || !isCategory(r.category)) continue;
        const cents = Number(r.cents);
        const riderCents = Number(r.rider_cents);
        w.byCategory[r.category] += cents;
        // Rider costs captured on headline acts and hosts are reported under Rider Costs.
        w.byCategory.rider += riderCents;
        w.total += cents + riderCents;
        w.itemCount += Number(r.n);
      }
      // Sum in cents, convert once at the end.
      for (const w of weeks.values()) {
        for (const k of Object.keys(w.byCategory) as CategoryKey[]) w.byCategory[k] /= 100;
        w.total /= 100;
      }
      return [...weeks.values()];
    },

    createWeek(input: { year: number; month: number; weekNo: number; notes: string }, copyRecurring: boolean): WeekDetail {
      const orgId = writeOrg();
      if (findWeek(input.year, input.month, input.weekNo)) throw new HttpError(409, 'That week already exists');
      const id = transaction(db, () => {
        const { lastInsertRowid } = q.insertWeek.run(orgId, input.year, input.month, input.weekNo, input.notes);
        const weekId = Number(lastInsertRowid);
        if (copyRecurring) {
          // New weeks start from this organisation's Recurring costs list.
          for (const r of q.allRecurring.all(orgId) as Row[]) {
            const item = toRecurring(r);
            insertItem(weekId, {
              category: item.category,
              name: item.name,
              amountCents: Math.round(item.amount * 100),
              riderCents: Math.round(item.riderCost * 100),
              notes: item.notes,
              dj: item.isDj,
            });
          }
        }
        return weekId;
      });
      return getWeek(id);
    },

    updateWeekNotes(id: number, notes: string): WeekDetail {
      writeOrg();
      requireWeek(id);
      q.updateWeekNotes.run(notes, id);
      return getWeek(id);
    },

    deleteWeek(id: number): void {
      writeOrg();
      requireWeek(id);
      q.deleteWeek.run(id);
    },

    addItem(weekId: number, item: NewItem): Item {
      writeOrg();
      requireWeek(weekId);
      return insertItem(weekId, item);
    },

    updateItem(id: number, item: NewItem): Item {
      writeOrg();
      const current = requireItem(id);
      if (current.isDj) {
        // An individual Resident DJ stays a Resident DJ, and can only be in the week once.
        if (item.category !== 'resident') throw new HttpError(400, 'A Resident DJ must stay under Resident DJs');
        requireDjNameFree(current.weekId, item.name, id);
      }
      if (current.riderItems) {
        // The rider cost is the total of the rider calculator, so it can only change there. Moving the line
        // out of headline acts and hosts ends the calculation.
        if (!hasRiderCost(item.category)) q.deleteRiderLines.run(id);
        else if (Math.round(current.riderCost * 100) !== (item.riderCents ?? 0)) {
          throw new HttpError(400, 'This rider cost is worked out in the rider calculator. Change it there.');
        }
      }
      q.updateItem.run(item.category, item.name, item.amountCents, item.riderCents ?? 0, item.notes, id);
      return requireItem(id);
    },

    deleteItem(id: number): void {
      writeOrg();
      requireItem(id);
      q.deleteItem.run(id);
    },

    // --- Rider prices and the rider calculator -------------------------------------------------

    riderPrices(): RiderPrice[] {
      return (q.riderPrices.all(...ids) as Row[]).map(toRiderPrice);
    },

    addRiderPrice(price: NewPrice): RiderPrice {
      const orgId = writeOrg();
      if (q.riderPriceByName.get(orgId, price.name)) throw new HttpError(409, `${price.name} is already in the price list`);
      const { lastInsertRowid } = q.insertRiderPrice.run(orgId, price.name, price.costCents);
      return toRiderPrice(q.riderPriceById.get(Number(lastInsertRowid), ...ids) as Row);
    },

    updateRiderPrice(id: number, price: NewPrice): RiderPrice {
      const orgId = writeOrg();
      requireRiderPrice(id);
      const clash = q.riderPriceByName.get(orgId, price.name) as Row | undefined;
      if (clash && Number(clash.id) !== id) throw new HttpError(409, `${price.name} is already in the price list`);
      q.updateRiderPrice.run(price.name, price.costCents, id);
      return requireRiderPrice(id);
    },

    deleteRiderPrice(id: number): void {
      writeOrg();
      requireRiderPrice(id);
      q.deleteRiderPrice.run(id);
    },

    /** Adds new items and updates the cost of items already listed. Nothing is removed. */
    previewRiderPrices(prices: NewPrice[]): RiderPriceImportResult {
      return summarisePrices(planPrices(writeOrg(), prices), false);
    },

    importRiderPrices(prices: NewPrice[]): RiderPriceImportResult {
      const orgId = writeOrg();
      const rows = transaction(db, () => {
        const plan = planPrices(orgId, prices);
        prices.forEach((p, i) => {
          const status = plan[i]!.status;
          if (status === 'new') q.insertRiderPrice.run(orgId, p.name, p.costCents);
          else if (status === 'update') {
            const existing = q.riderPriceByName.get(orgId, p.name) as Row;
            q.updateRiderPrice.run(String(existing.name), p.costCents, Number(existing.id));
          }
        });
        return plan;
      });
      return summarisePrices(rows, true);
    },

    /** The rider of one headline act or host: the items asked for, and their total. */
    itemRider(itemId: number): RiderCalc {
      const item = requireItem(itemId);
      if (!hasRiderCost(item.category)) throw new HttpError(400, 'Only headline acts and hosts have a rider');
      return toRiderCalc(item);
    },

    /**
     * Replaces the rider of a headline act or host, and sets that booking's rider cost to its total. The prices
     * are kept as given, so a later change to the price list never rewrites this week. No lines clears the rider
     * and sets the cost to 0.
     */
    setItemRider(itemId: number, lines: NewRiderLine[]): { item: Item; rider: RiderCalc } {
      writeOrg();
      const item = requireItem(itemId);
      if (!hasRiderCost(item.category)) throw new HttpError(400, 'Only headline acts and hosts have a rider');
      const totalCents = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
      if (totalCents > 1_000_000_000_00) throw new HttpError(400, 'The rider total is too large');
      transaction(db, () => {
        q.deleteRiderLines.run(itemId);
        lines.forEach((l, i) => q.insertRiderLine.run(itemId, l.name, l.unitCents, l.quantity, i));
        q.setItemRider.run(totalCents, itemId);
      });
      return { item: requireItem(itemId), rider: toRiderCalc(requireItem(itemId)) };
    },

    recurringItems(): RecurringItem[] {
      return (q.allRecurring.all(...ids) as Row[]).map(toRecurring);
    },

    addRecurring(item: NewItem): RecurringItem {
      const orgId = writeOrg();
      requireRecurringCategory(item.category);
      const sort = Number((q.nextRecurringSort.get(orgId, item.category) as Row).s);
      const { lastInsertRowid } = q.insertRecurring.run(
        orgId,
        item.category,
        item.name,
        item.amountCents,
        item.riderCents ?? 0,
        item.notes,
        sort,
        0, // standing Resident DJs are added with addRecurringDj
      );
      return requireRecurring(Number(lastInsertRowid));
    },

    updateRecurring(id: number, item: NewItem): RecurringItem {
      const orgId = writeOrg();
      const current = requireRecurring(id);
      requireRecurringCategory(item.category);
      if (current.isDj) {
        if (item.category !== 'resident') throw new HttpError(400, 'A Resident DJ must stay under Resident DJs');
        const clash = q.djInRecurring.get(orgId, item.name) as Row | undefined;
        if (clash && Number(clash.id) !== id) throw alreadyBooked(String(clash.name), 'in the recurring list');
      }
      q.updateRecurring.run(item.category, item.name, item.amountCents, item.riderCents ?? 0, item.notes, id);
      return requireRecurring(id);
    },

    deleteRecurring(id: number): void {
      writeOrg();
      requireRecurring(id);
      q.deleteRecurring.run(id);
    },

    // --- Resident DJs: individual DJs with a rate, linked to a week -----------------------------

    /** Adds one resident DJ to a week. The week's Resident DJs cost is then the sum of its DJs. */
    addResidentDj(weekId: number, dj: NewDj): Item {
      writeOrg();
      requireWeek(weekId);
      requireDjNameFree(weekId, dj.name);
      return insertItem(weekId, { category: 'resident', name: dj.name, amountCents: dj.rateCents, notes: dj.notes, dj: true });
    },

    /** What a bulk import into this week would do. Changes nothing. */
    previewResidentDjs(weekId: number, djs: NewDj[]): DjImportResult {
      writeOrg();
      requireWeek(weekId);
      return summariseDjs(planDjs(weekDjTarget(weekId), djs), djs, false);
    },

    /** Adds the DJs that are new and updates the rate of the ones already in the week. All or nothing. */
    importResidentDjs(weekId: number, djs: NewDj[]): DjImportResult {
      writeOrg();
      requireWeek(weekId);
      return applyDjs(weekDjTarget(weekId), djs);
    },

    /** Adds a resident DJ to the standing list, so every new week starts with them. */
    addRecurringDj(dj: NewDj): RecurringItem {
      const orgId = writeOrg();
      const clash = q.djInRecurring.get(orgId, dj.name) as Row | undefined;
      if (clash) throw alreadyBooked(String(clash.name), 'in the recurring list');
      recurringDjTarget(orgId).insert(dj);
      return toRecurring(q.djInRecurring.get(orgId, dj.name) as Row);
    },

    previewRecurringDjs(djs: NewDj[]): DjImportResult {
      return summariseDjs(planDjs(recurringDjTarget(writeOrg()), djs), djs, false);
    },

    importRecurringDjs(djs: NewDj[]): DjImportResult {
      return applyDjs(recurringDjTarget(writeOrg()), djs);
    },

    /**
     * The week's resident DJs, in name order, grouped into batches for a bulk payment.
     * Only the DJ rates are paid here: rider costs are separate lines and are not part of it.
     */
    paymentSchedule(weekId: number): PaymentSchedule {
      const week = requireWeek(weekId);
      const djs = (q.djsInWeek.all(weekId) as Row[]).map(toItem);
      const batches: PaymentSchedule['batches'] = [];
      for (let start = 0; start < djs.length; start += PAYMENT_BATCH_SIZE) {
        const payments = djs.slice(start, start + PAYMENT_BATCH_SIZE).map((d, i) => ({
          no: start + i + 1,
          name: d.name,
          amount: d.amount,
          notes: d.notes,
        }));
        const cents = payments.reduce((s, p) => s + Math.round(p.amount * 100), 0);
        batches.push({ batchNo: batches.length + 1, payments, total: cents / 100 });
      }
      const totalCents = djs.reduce((s, d) => s + Math.round(d.amount * 100), 0);
      return {
        weekId,
        label: weekLabel(week.year, week.month, week.weekNo),
        batchSize: PAYMENT_BATCH_SIZE,
        batches,
        count: djs.length,
        total: totalCents / 100,
      };
    },

    /** Imported actual expenditure (section totals only), for months fromYm..toYm (YYYYMM, inclusive). */
    actualSummaries(fromYm: number, toYm: number): ActualWeekSummary[] {
      const weeks = new Map<number, ActualWeekSummary>();
      for (const r of q.actualWeeksInRange.all(...ids, fromYm, toYm) as Row[]) weeks.set(Number(r.id), emptyActualSummary(r));
      for (const r of q.actualTotalsInRange.all(...ids, fromYm, toYm) as Row[]) {
        const w = weeks.get(Number(r.actual_week_id))!; // the totals query covers the same months as the weeks query
        const cents = Number(r.cents);
        w.byGroup[r.grp as VarianceGroupKey] += cents;
        w.total += cents;
        w.paid += Number(r.paid_cents);
        if (Number(r.changed) === 1) w.adjusted = true;
      }
      // Sum in cents, convert once at the end.
      for (const w of weeks.values()) {
        for (const k of Object.keys(w.byGroup) as VarianceGroupKey[]) w.byGroup[k] /= 100;
        w.total /= 100;
        w.paid /= 100;
      }
      return [...weeks.values()];
    },

    getActualWeek(id: number): ActualWeekDetail {
      const row = requireActualWeek(id);
      const ym = Number(row.year) * 100 + Number(row.month);
      const summary = this.actualSummaries(ym, ym).find((w) => w.id === id)!;
      return { ...summary, sections: (q.actualSectionsByWeek.all(id) as Row[]).map(toActualSection) };
    },

    /** Stores one week of actual totals, replacing any earlier import of the same week. */
    importActualWeek(input: ActualWeekInput): number {
      const orgId = writeOrg();
      return transaction(db, () => {
        const existing = q.actualWeekByKey.get(orgId, input.year, input.month, input.weekNo) as Row | undefined;
        let id: number;
        if (existing) {
          id = Number(existing.id);
          q.updateActualLabel.run(input.label, id);
          q.deleteActualSections.run(id);
        } else {
          id = Number(q.insertActualWeek.run(orgId, input.year, input.month, input.weekNo, input.label).lastInsertRowid);
        }
        input.sections.forEach((s, i) =>
          q.insertActualSection.run(id, s.heading, s.group, s.amountCents, s.sheetCents, s.paidCents, i + 1),
        );
        return id;
      });
    },

    hasActualWeek(year: number, month: number, weekNo: number): boolean {
      return q.actualWeekByKey.get(writeOrg(), year, month, weekNo) !== undefined;
    },

    deleteActualWeek(id: number): void {
      writeOrg();
      requireActualWeek(id);
      q.deleteActualWeek.run(id);
    },

    /** Creates or updates each week and replaces its line items. All-or-nothing. */
    importWeeks(weeks: WeekInput[]): void {
      const orgId = writeOrg();
      transaction(db, () => {
        for (const w of weeks) {
          let existing = findWeek(w.year, w.month, w.weekNo);
          if (!existing) {
            q.insertWeek.run(orgId, w.year, w.month, w.weekNo, w.notes ?? '');
            existing = findWeek(w.year, w.month, w.weekNo)!;
          } else if (w.notes) {
            q.updateWeekNotes.run(w.notes, existing.id);
          }
          q.deleteItemsForWeek.run(existing.id);
          for (const item of w.items) insertItem(existing.id, item);
        }
      });
    },
  };
}
