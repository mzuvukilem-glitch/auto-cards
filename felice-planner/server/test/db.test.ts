// The database layer: transactions, and the upgrades of databases made by earlier versions of the app.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { listOrganisations, openDb, transaction } from '../src/db.ts';

const dir = mkdtempSync(join(tmpdir(), 'fp-db-'));
after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
const columns = (db: DatabaseSync, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe('transaction', () => {
  test('keeps the changes when the work succeeds, and returns its result', () => {
    const db = openDb(':memory:');
    const result = transaction(db, () => {
      db.exec("INSERT INTO rider_prices (org_id, name, cost_cents) VALUES (1, 'A', 100)");
      return 'done';
    });
    assert.equal(result, 'done');
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM rider_prices').get() as { n: number }).n), 1);
  });

  test('undoes everything and passes the error on when the work fails', () => {
    const db = openDb(':memory:');
    assert.throws(
      () =>
        transaction(db, () => {
          db.exec("INSERT INTO rider_prices (org_id, name, cost_cents) VALUES (1, 'A', 100)");
          throw new Error('boom');
        }),
      /boom/,
    );
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM rider_prices').get() as { n: number }).n), 0);
    // the connection is usable afterwards (no transaction left open)
    assert.doesNotThrow(() => transaction(db, () => 1));
  });
});

describe('opening a database', () => {
  test('creates the folder and the file, seeds Felice and Alur once, and can be opened again', () => {
    const path = join(dir, 'nested', 'deeper', 'new.db');
    const first = openDb(path);
    assert.deepEqual(listOrganisations(first).map((o) => o.slug), ['felice', 'alur']);
    first.close();
    const second = openDb(path);
    assert.equal(listOrganisations(second).length, 2);
    assert.equal(existsSync(path), true);
    second.close();
  });
});

describe('upgrading older databases', () => {
  test('a database from before rider costs and resident DJs gets both columns, and its totals stay the same', () => {
    const path = join(dir, 'old-items.db');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE items (id INTEGER PRIMARY KEY, week_id INTEGER NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0), notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO items (week_id, category, name, amount_cents) VALUES (1, 'headline', 'Act', 4000000);
    `);
    old.close();
    const db = openDb(path);
    assert.ok(columns(db, 'items').includes('rider_cents'));
    assert.ok(columns(db, 'items').includes('dj'));
    assert.deepEqual({ ...(db.prepare('SELECT amount_cents, rider_cents, dj FROM items').get() as object) }, { amount_cents: 4000000, rider_cents: 0, dj: 0 });
    db.close();
  });

  test('a database that still has loose lines (no week) is not changed, and the failed upgrade is undone', () => {
    const path = join(dir, 'broken.db');
    const old = new DatabaseSync(path);
    old.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE weeks (id INTEGER PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, week_no INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (year, month, week_no));
      CREATE TABLE items (id INTEGER PRIMARY KEY, week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
        category TEXT NOT NULL, name TEXT NOT NULL, amount_cents INTEGER NOT NULL, rider_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO weeks (id, year, month, week_no) VALUES (1, 2026, 11, 1);
      INSERT INTO items (week_id, category, name, amount_cents) VALUES (1, 'other', 'fine', 100), (77, 'other', 'orphan', 200);
    `);
    old.close();
    assert.throws(() => openDb(path), /Organisation upgrade left 1 broken references/);
    assert.ok(readdirSync(dir).some((f) => f.startsWith('broken.db.before-organisations-')), 'the backup was written before anything changed');
    const check = new DatabaseSync(path);
    assert.ok(!columns(check, 'weeks').includes('org_id'), 'the weeks table was left as it was');
    assert.equal(Number((check.prepare('SELECT COUNT(*) AS n FROM weeks').get() as { n: number }).n), 1);
    assert.equal(Number((check.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n), 2);
    check.close();
  });

  test('a database whose weeks already belong to organisations but whose recurring costs do not is finished off', () => {
    const path = join(dir, 'half.db');
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE organisations (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE weeks (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL, week_no INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (org_id, year, month, week_no));
      CREATE TABLE recurring_items (id INTEGER PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, amount_cents INTEGER NOT NULL,
        rider_cents INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO recurring_items (category, name, amount_cents) VALUES ('standard', 'MC', 400000);
    `);
    old.close();
    const db = openDb(path);
    assert.deepEqual({ ...(db.prepare('SELECT org_id FROM recurring_items').get() as object) }, { org_id: listOrganisations(db).find((o) => o.slug === 'felice')!.id });
    db.close();
  });
});
