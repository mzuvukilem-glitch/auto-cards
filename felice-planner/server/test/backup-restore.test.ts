// Backup and restore of the whole database: the download, the check, the restore, and everything it refuses.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { start, type Reply, type Running } from './support.ts';

const dir = mkdtempSync(join(tmpdir(), 'fp-backup-test-'));
after(() => rmSync(dir, { recursive: true, force: true }));

let app: Running;
let safetyDir: string;
let n = 0;
before(async () => {
  safetyDir = join(dir, 'safety');
  app = await start({ backupDir: safetyDir });
  await app.login();
});
after(() => app.close());

const error = (r: Reply, status: number, pattern: RegExp) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  assert.match(r.body.error, pattern);
};
const restore = (data: Buffer | string, dryRun = false) => app.upload(`/backup/restore${dryRun ? '?dryRun=1' : ''}`, data);
const download = async () => {
  const r = await app.call('GET', '/backup');
  assert.equal(r.status, 200);
  return r;
};
/** A file on disk that is changed with `sql` and read back as bytes. */
const fileWith = (sql: string, from?: Buffer) => {
  const path = join(dir, `file-${n++}.db`);
  if (from) writeFileSync(path, from);
  const db = new DatabaseSync(path);
  db.exec(sql);
  db.close();
  return readFileSync(path);
};
const count = (sql: string) => Number((app.db.prepare(sql).get() as { n: number }).n);
const lines = () => count('SELECT COUNT(*) AS n FROM items');

/** Two weeks for Felice with a rider and one for Alur, starting from nothing. */
async function seed() {
  app.db.exec('DELETE FROM rider_lines; DELETE FROM items; DELETE FROM actual_sections; DELETE FROM actual_weeks; DELETE FROM weeks; DELETE FROM recurring_items; DELETE FROM rider_prices;');
  const w1 = (await app.call('POST', '/orgs/felice/weeks', { year: 2026, month: 5, weekNo: 1 })).body;
  const w2 = (await app.call('POST', '/orgs/felice/weeks', { year: 2026, month: 5, weekNo: 2 })).body;
  const alur = (await app.call('POST', '/orgs/alur/weeks', { year: 2026, month: 6, weekNo: 1 })).body;
  const act = (await app.call('POST', `/orgs/felice/weeks/${w1.id}/items`, { category: 'headline', name: 'Maphorisa', amount: 40000, riderCost: 0 })).body;
  await app.call('PUT', `/orgs/felice/items/${act.id}/rider`, { lines: [{ name: 'Hubbly', unitCost: 25, quantity: 2 }, { name: 'Water', unitCost: 10, quantity: 3 }] });
  await app.call('POST', `/orgs/felice/weeks/${w2.id}/items`, { category: 'standard', name: 'MC', amount: 1000 });
  await app.call('POST', `/orgs/alur/weeks/${alur.id}/items`, { category: 'standard', name: 'Camera', amount: 500 });
  await app.call('POST', '/orgs/felice/rider-prices', { name: 'Hubbly', cost: 25 });
  await app.call('POST', '/orgs/felice/recurring', { category: 'standard', name: 'Graphics', amount: 250 });
  return { w1, w2, alur, act };
}

describe('downloading a backup', () => {
  test('is one consistent database file with everything in it', async () => {
    await seed();
    const r = await download();
    assert.match(r.headers.get('content-disposition') ?? '', /^attachment; filename=planner-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.buffer.subarray(0, 15).toString(), 'SQLite format 3');
    const path = join(dir, `dl-${n++}.db`);
    writeFileSync(path, r.buffer);
    const db = new DatabaseSync(path, { readOnly: true });
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n), 3);
    assert.equal(Number((db.prepare('SELECT COUNT(*) AS n FROM rider_lines').get() as { n: number }).n), 2);
    db.close();
  });

  test('needs a signed-in session', async () => {
    assert.equal((await app.bare('GET', '/api/backup')).status, 401);
    assert.equal((await app.bare('POST', '/api/backup/restore', { headers: { 'x-requested-with': 'felice' }, body: Buffer.from('x') })).status, 401);
  });
});

describe('checking a backup before restoring it', () => {
  test('reports what is in the file and in the live data, and changes nothing', async () => {
    await seed();
    const backup = (await download()).buffer;
    await app.call('POST', '/orgs/felice/weeks', { year: 2026, month: 7, weekNo: 1 });
    const r = await restore(backup, true);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.applied, false);
    assert.equal(r.body.safetyCopy, null);
    assert.deepEqual(r.body.backup.orgs.map((o: { slug: string; weeks: number; lines: number; latestWeek: string | null }) => [o.slug, o.weeks, o.lines, o.latestWeek]), [
      ['felice', 2, 2, 'May 2026 W2'],
      ['alur', 1, 1, 'June 2026 W1'],
    ]);
    assert.deepEqual(r.body.backup.orgs[0], { slug: 'felice', name: 'Felice', weeks: 2, lines: 2, recurring: 1, riderPrices: 1, actualWeeks: 0, latestWeek: 'May 2026 W2' });
    assert.equal(r.body.current.orgs[0].weeks, 3, 'the live data has the extra week');
    assert.equal(r.body.current.orgs[0].latestWeek, 'July 2026 W1');
    assert.equal(count('SELECT COUNT(*) AS n FROM weeks'), 4, 'nothing was restored');
    assert.equal(existsSync(safetyDir), false, 'and no safety copy was made');
  });

  test('says "no weeks" for a company with none', async () => {
    app.db.exec('DELETE FROM rider_lines; DELETE FROM items; DELETE FROM weeks;');
    const r = await restore((await download()).buffer, true);
    assert.equal(r.body.backup.orgs[0].latestWeek, null);
  });
});

describe('restoring a backup', () => {
  test('puts back every table, keeps the numbers, and saves the data it replaced first', async () => {
    const { w1, act } = await seed();
    const backup = (await download()).buffer;
    const before = (await app.call('GET', `/orgs/felice/items/${act.id}/rider`)).body;

    // Change things after the backup: delete a week, edit a rider, add a week and a price.
    await app.call('DELETE', `/orgs/felice/weeks/${w1.id}`);
    await app.call('POST', '/orgs/alur/weeks', { year: 2027, month: 1, weekNo: 1 });
    await app.call('POST', '/orgs/felice/rider-prices', { name: 'Extra', cost: 1 });
    assert.equal(lines(), 2);

    const r = await restore(backup);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.applied, true);
    assert.deepEqual([r.body.backup.orgs[0].weeks, r.body.current.orgs[0].weeks, r.body.current.orgs[1].weeks], [2, 1, 2]);

    assert.equal(lines(), 3);
    assert.deepEqual((await app.call('GET', `/orgs/felice/items/${act.id}/rider`)).body, before, 'the rider and its items are back, with the same ids');
    assert.equal((await app.call('GET', '/orgs/alur/weeks')).body.length, 1);
    assert.deepEqual((await app.call('GET', '/orgs/felice/rider-prices')).body.map((p: { name: string }) => p.name), ['Hubbly']);
    assert.equal((await app.call('GET', '/orgs/felice/recurring')).body.length, 1);
    assert.equal((await app.call('GET', `/orgs/felice/weeks/${w1.id}`)).body.items.length, 1);

    // The data it replaced was saved first, so the restore can be undone.
    const saved = readdirSync(safetyDir).filter((f) => /^before-restore-.*\.db$/.test(f));
    assert.deepEqual(saved, [r.body.safetyCopy]);
    const old = new DatabaseSync(join(safetyDir, r.body.safetyCopy), { readOnly: true });
    assert.equal(Number((old.prepare('SELECT COUNT(*) AS n FROM weeks').get() as { n: number }).n), 3);
    old.close();

    // The running server keeps working on the restored data.
    const added = await app.call('POST', '/orgs/felice/weeks', { year: 2026, month: 8, weekNo: 1 });
    assert.equal(added.status, 201);
  });

  test('can be undone with the copy it saved', async () => {
    await seed();
    const first = (await download()).buffer;
    await app.call('POST', '/orgs/felice/weeks', { year: 2026, month: 9, weekNo: 1 });
    const r = await restore(first);
    assert.equal((await app.call('GET', '/orgs/felice/weeks')).body.length, 2);
    const undo = readFileSync(join(safetyDir, r.body.safetyCopy));
    await restore(undo);
    assert.equal((await app.call('GET', '/orgs/felice/weeks')).body.length, 3);
  });

  test('restores imported actual expenditure too', async () => {
    await seed();
    app.db.exec(`INSERT INTO actual_weeks (org_id, year, month, week_no, label) VALUES (1, 2026, 5, 1, '01-05');
                 INSERT INTO actual_sections (actual_week_id, heading, grp, amount_cents, sheet_cents) VALUES (1, 'HEADLINERS', 'headline', 5000, 5000);`);
    const backup = (await download()).buffer;
    app.db.exec('DELETE FROM actual_weeks');
    assert.equal(count('SELECT COUNT(*) AS n FROM actual_sections'), 0);
    await restore(backup);
    assert.equal(count('SELECT COUNT(*) AS n FROM actual_sections'), 1);
    assert.equal(count('SELECT amount_cents AS n FROM actual_sections'), 5000);
  });

  test('accepts a backup from an older version, whose columns are in another order', async () => {
    await seed();
    const old = fileWith(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE weeks (id INTEGER PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, week_no INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (year, month, week_no));
      CREATE TABLE items (id INTEGER PRIMARY KEY, week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE, category TEXT NOT NULL,
        name TEXT NOT NULL, amount_cents INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO weeks (id, year, month, week_no) VALUES (1, 2025, 3, 1);
      INSERT INTO items (week_id, category, name, amount_cents) VALUES (1, 'headline', 'Old act', 700000);
    `);
    const check = await restore(old, true);
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.deepEqual(check.body.backup.orgs.map((o: { weeks: number; lines: number }) => [o.weeks, o.lines]), [[1, 1], [0, 0]], 'its weeks became Felice\'s');
    const r = await restore(old);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const week = (await app.call('GET', '/orgs/felice/weeks')).body;
    assert.deepEqual(week.map((w: { year: number; total: number }) => [w.year, w.total]), [[2025, 7000]]);
    assert.equal((await app.call('GET', '/orgs/alur/weeks')).body.length, 0);
  });
});

describe('what a restore refuses', () => {
  test('a request without a file, or without a session or the request header', async () => {
    error(await app.upload('/backup/restore', Buffer.alloc(0)), 400, /Upload a backup/);
    assert.equal((await app.bare('POST', '/api/backup/restore', { body: Buffer.from('x') })).status, 403, 'a cross-site request has no request header');
  });

  test('a file that is not a database, or is too short to be one', async () => {
    error(await restore(Buffer.from('this is not a database at all, just some words'.repeat(5))), 400, /not a planner backup/);
    error(await restore('short'), 400, /not a planner backup/);
    error(await restore(Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(200, 7)])), 400, /not a planner backup/);
  });

  test('a database that is not the planner\'s', async () => {
    const other = fileWith('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES (\'hello\');');
    error(await restore(other), 400, /not a planner backup/);
  });

  test('a backup that fails its own integrity check', async () => {
    await seed();
    // Change a name in the table but not in the index that copies it: the file no longer agrees with itself.
    const backup = (await download()).buffer;
    const bad = Buffer.from(backup.toString('latin1').replaceAll('Hubbly', 'Hubblz'), 'latin1');
    error(await restore(bad), 400, /damaged/);
    error(await restore(bad, true), 400, /damaged/);
  });

  test('a backup with a value the database does not allow is refused whole, and nothing changes', async () => {
    await seed();
    const bad = fileWith(`PRAGMA ignore_check_constraints = ON; UPDATE items SET amount_cents = -5 WHERE id = (SELECT MIN(id) FROM items);`, (await download()).buffer);
    const before = lines();
    error(await restore(bad), 400, /could not be loaded.*CHECK constraint failed.*Nothing was changed/);
    assert.equal(lines(), before);
    assert.equal(count('SELECT COUNT(*) AS n FROM weeks'), 3);
  });

  test('a backup whose lines no longer belong to a week', async () => {
    await seed();
    const orphan = fileWith(`PRAGMA foreign_keys = OFF; INSERT INTO items (week_id, category, name, amount_cents) VALUES (9999, 'other', 'orphan', 100);`, (await download()).buffer);
    error(await restore(orphan), 400, /damaged/);
  });

  test('a backup made for other companies', async () => {
    await seed();
    const other = fileWith(`UPDATE organisations SET slug = 'other' WHERE id = 2;`, (await download()).buffer);
    error(await restore(other), 400, /different companies/);
  });

  test('an old backup that cannot be brought up to date', async () => {
    const broken = fileWith(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE weeks (id INTEGER PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, week_no INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (year, month, week_no));
      CREATE TABLE items (id INTEGER PRIMARY KEY, week_id INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
        category TEXT NOT NULL, name TEXT NOT NULL, amount_cents INTEGER NOT NULL, notes TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0);
      INSERT INTO weeks (id, year, month, week_no) VALUES (1, 2026, 11, 1);
      INSERT INTO items (week_id, category, name, amount_cents) VALUES (77, 'other', 'orphan', 200);
    `);
    error(await restore(broken), 400, /older version/);
  });

  test('and leaves the current data untouched, with no leftover files', async () => {
    await seed();
    const before = lines();
    error(await restore(Buffer.from('nope'.repeat(50))), 400, /not a planner backup/);
    assert.equal(lines(), before);
    assert.equal(readdirSync(tmpdir()).filter((f) => f.startsWith('fp-restore-')).length, 0);
  });
});
