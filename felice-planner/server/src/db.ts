import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Organisation } from '../../shared/types.ts';

// Amounts are stored as integer cents to avoid floating-point drift in totals.
// `amount_cents` is the rate for headline acts and hosts. `rider_cents` is that booking's rider cost.

/** The companies the planner manages. Add a row here (and restart) to add another organisation. */
const ORGANISATIONS: { slug: string; name: string; color: string }[] = [
  { slug: 'felice', name: 'Felice', color: '#4338ca' },
  { slug: 'alur', name: 'Alur', color: '#0f766e' },
];

const ORGANISATIONS_DDL = `
CREATE TABLE IF NOT EXISTS organisations (
  id    INTEGER PRIMARY KEY,
  slug  TEXT    NOT NULL UNIQUE,
  name  TEXT    NOT NULL,
  color TEXT    NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);`;

const weeksDdl = (name: string) => `
CREATE TABLE ${name} (
  id         INTEGER PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES organisations(id),
  year       INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  week_no    INTEGER NOT NULL CHECK (week_no BETWEEN 1 AND 5),
  notes      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, year, month, week_no)
);`;

const SCHEMA = `
${weeksDdl('IF NOT EXISTS weeks')}

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY,
  week_id      INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  rider_cents  INTEGER NOT NULL DEFAULT 0 CHECK (rider_cents >= 0),
  notes        TEXT    NOT NULL DEFAULT '',
  sort         INTEGER NOT NULL DEFAULT 0,
  dj           INTEGER NOT NULL DEFAULT 0 CHECK (dj IN (0, 1))
);

-- Standing costs added to every new week of an organisation. Edited on its Recurring costs page.
CREATE TABLE IF NOT EXISTS recurring_items (
  id           INTEGER PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organisations(id),
  category     TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  rider_cents  INTEGER NOT NULL DEFAULT 0 CHECK (rider_cents >= 0),
  notes        TEXT    NOT NULL DEFAULT '',
  sort         INTEGER NOT NULL DEFAULT 0,
  dj           INTEGER NOT NULL DEFAULT 0 CHECK (dj IN (0, 1))
);

-- The rider price list of an organisation: what each drink or item costs (including VAT).
CREATE TABLE IF NOT EXISTS rider_prices (
  id         INTEGER PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES organisations(id),
  name       TEXT    NOT NULL,
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS rider_prices_name ON rider_prices (org_id, lower(trim(name)));
-- The rider calculation for one headline act or host: the items asked for, with the price each had when it was
-- calculated, so a later price change never rewrites a past week. The line's rider cost is the total of these.
CREATE TABLE IF NOT EXISTS rider_lines (
  id         INTEGER PRIMARY KEY,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  quantity   INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rider_lines_item ON rider_lines (item_id);
-- Actual expenditure, imported one week at a time from the weekly expense workbook. It is kept apart from
-- the plan so nothing about planned totals can change. A week is identified the same way as a planned week.
CREATE TABLE IF NOT EXISTS actual_weeks (
  id         INTEGER PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES organisations(id),
  year       INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  week_no    INTEGER NOT NULL CHECK (week_no BETWEEN 1 AND 5),
  label      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, year, month, week_no)
);

-- One row per section total of an imported week (Residents, Local DJ's, Hosts, Riders ...).
-- Only totals are stored, never the individual lines of the expense sheet.
CREATE TABLE IF NOT EXISTS actual_sections (
  id             INTEGER PRIMARY KEY,
  actual_week_id INTEGER NOT NULL REFERENCES actual_weeks(id) ON DELETE CASCADE,
  heading        TEXT    NOT NULL,
  grp            TEXT    NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents >= 0),
  sheet_cents    INTEGER NOT NULL CHECK (sheet_cents >= 0),
  paid_cents     INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  sort           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS weeks_org ON weeks (org_id);
CREATE INDEX IF NOT EXISTS actual_weeks_org ON actual_weeks (org_id);
CREATE INDEX IF NOT EXISTS actual_sections_week ON actual_sections (actual_week_id);
CREATE INDEX IF NOT EXISTS items_week ON items (week_id);
CREATE INDEX IF NOT EXISTS items_category ON items (category);
CREATE INDEX IF NOT EXISTS recurring_org ON recurring_items (org_id);
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  db.exec(ORGANISATIONS_DDL);
  seedOrganisations(db);
  migrateToOrganisations(db, path); // must run before SCHEMA: it rebuilds an old weeks table
  db.exec(SCHEMA);
  migrateRiderCost(db);
  migrateResidentDjs(db);
  return db;
}

/**
 * SQL condition (for an items row aliased `i`) that is true when the line counts towards the totals.
 * A lump-sum Resident DJs line stops counting in a week that has individual Resident DJs, so the
 * Resident DJs cost is derived from the DJs and is never counted twice. Nothing is deleted: remove the
 * DJs and the lump-sum line counts again.
 */
export const COUNTED_ITEM = `NOT (i.category = 'resident' AND i.dj = 0 AND EXISTS (SELECT 1 FROM items d WHERE d.week_id = i.week_id AND d.dj = 1))`;

function seedOrganisations(db: DatabaseSync) {
  const insert = db.prepare('INSERT OR IGNORE INTO organisations (slug, name, color, sort) VALUES (?, ?, ?, ?)');
  ORGANISATIONS.forEach((o, i) => insert.run(o.slug, o.name, o.color, i + 1));
}

export function listOrganisations(db: DatabaseSync): Organisation[] {
  return (db.prepare('SELECT id, slug, name, color FROM organisations ORDER BY sort, id').all() as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    color: String(r.color),
  }));
}

const columnsOf = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

/**
 * Databases from before organisations existed: every week and recurring cost belongs to Felice.
 * The weeks table has to be rebuilt because its uniqueness rule changes from (year, month, week)
 * to (organisation, year, month, week). The file is backed up first.
 */
function migrateToOrganisations(db: DatabaseSync, path: string) {
  const weekColumns = columnsOf(db, 'weeks');
  const recurringColumns = columnsOf(db, 'recurring_items');
  const needsWeeks = weekColumns.length > 0 && !weekColumns.includes('org_id');
  const needsRecurring = recurringColumns.length > 0 && !recurringColumns.includes('org_id');
  if (!needsWeeks && !needsRecurring) return;

  const felice = listOrganisations(db).find((o) => o.slug === 'felice')!.id;

  if (path !== ':memory:') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}.before-organisations-${stamp}.bak'`);
  }

  if (needsWeeks) {
    // SQLite's documented way to change a table's constraints. Foreign keys must be off, otherwise
    // dropping the old weeks table would cascade-delete every line item.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(weeksDdl('weeks_new'));
      db.exec(
        `INSERT INTO weeks_new (id, org_id, year, month, week_no, notes, created_at)
         SELECT id, ${felice}, year, month, week_no, notes, created_at FROM weeks`,
      );
      db.exec('DROP TABLE weeks');
      db.exec('ALTER TABLE weeks_new RENAME TO weeks');
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length > 0) throw new Error(`Organisation upgrade left ${broken.length} broken references`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  if (needsRecurring) {
    db.exec('ALTER TABLE recurring_items ADD COLUMN org_id INTEGER REFERENCES organisations(id)');
    db.exec(`UPDATE recurring_items SET org_id = ${felice} WHERE org_id IS NULL`);
  }
}

/** Databases from before rider costs existed. */
function migrateRiderCost(db: DatabaseSync) {
  if (!columnsOf(db, 'items').includes('rider_cents')) {
    db.exec('ALTER TABLE items ADD COLUMN rider_cents INTEGER NOT NULL DEFAULT 0 CHECK (rider_cents >= 0)');
  }
}

/**
 * Databases from before individual Resident DJs existed. Existing lines keep dj = 0 (a lump sum), so all
 * existing totals stay exactly as they were. The unique indexes mean a DJ can only be in a week once
 * (and in an organisation's recurring list once), whatever the name's capitalisation.
 */
function migrateResidentDjs(db: DatabaseSync) {
  for (const table of ['items', 'recurring_items']) {
    if (!columnsOf(db, table).includes('dj')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN dj INTEGER NOT NULL DEFAULT 0 CHECK (dj IN (0, 1))`);
    }
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS items_dj_once ON items (week_id, lower(trim(name))) WHERE dj = 1;
    CREATE UNIQUE INDEX IF NOT EXISTS recurring_dj_once ON recurring_items (org_id, lower(trim(name))) WHERE dj = 1;
    CREATE INDEX IF NOT EXISTS items_dj ON items (dj) WHERE dj = 1;
  `);
}

/** Runs `fn` inside a transaction, rolling back on error. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
