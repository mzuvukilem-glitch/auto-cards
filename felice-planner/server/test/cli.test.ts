// The command-line programs and the server start-up, run as real processes (npm run setup / backup / seed / start).
// Their coverage is merged into the report because the child processes inherit NODE_V8_COVERAGE.
import assert from 'node:assert/strict';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { loadServerConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';
import { TEMPLATES } from '../src/templates.ts';
import { PASSWORD, SECRET, workbook } from './support.ts';

const SERVER = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'fp-cli-'));
const made: string[] = []; // files this test file made, removed afterwards one by one
const file = (name: string) => {
  const p = join(work, name);
  made.push(p);
  return p;
};
after(() => {
  for (const p of made.reverse()) if (existsSync(p)) unlinkSync(p);
  // the folders the tests above made (empty by now), then the work folder itself
  for (const dir of [join(work, "it's a folder"), work]) {
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
});

/** Runs "node <script> <args>" in the server folder with the given settings, and waits for it. */
function run(script: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: SERVER, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
/** A database file with the app's tables, ready for the programs to use. */
function newDb(name: string): string {
  const p = file(name);
  openDb(p).close();
  made.push(`${p}-wal`, `${p}-shm`);
  return p;
}

describe('npm run setup', () => {
  test('creates a settings file the server accepts, prints the password once, and keeps it private', () => {
    const target = file('settings.env');
    const r = run('src/setup.ts', [target]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Created .*settings\.env/);
    const text = readFileSync(target, 'utf8');
    assert.ok(text.startsWith('# Alur & Felice Planner settings'), 'starts with a comment (no byte-order-mark trouble)');
    const values = Object.fromEntries(text.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    assert.ok(r.out.includes(`Sign-in password: ${values.APP_PASSWORD}`));
    assert.deepEqual([values.PORT, values.HOST, values.DB_PATH, values.COOKIE_SECURE], ['4000', '127.0.0.1', './data/planner.db', 'false']);
    if (process.platform !== 'win32') assert.equal(statSync(target).mode & 0o777, 0o600);

    // The generated password and secret are strong enough for the server to start with.
    const saved = { ...process.env };
    Object.assign(process.env, { APP_PASSWORD: values.APP_PASSWORD, SESSION_SECRET: values.SESSION_SECRET });
    try {
      assert.equal(loadServerConfig().password, values.APP_PASSWORD);
    } finally {
      process.env = saved;
    }
  });

  test('never overwrites an existing settings file', () => {
    const target = file('existing.env');
    writeFileSync(target, 'APP_PASSWORD=mine\n');
    const r = run('src/setup.ts', [target]);
    assert.equal(r.code, 0);
    assert.match(r.out, /already exists/);
    assert.equal(readFileSync(target, 'utf8'), 'APP_PASSWORD=mine\n');
  });

  test('with no argument it looks at server/.env (and leaves an existing one alone)', () => {
    const real = join(SERVER, '.env');
    const before = existsSync(real) ? readFileSync(real, 'utf8') : null;
    if (before === null) return; // nothing to protect: do not create the real file from a test
    const r = run('src/setup.ts', []);
    assert.match(r.out, /server\/\.env already exists/);
    assert.equal(readFileSync(real, 'utf8'), before);
  });
});

describe('npm run backup', () => {
  test('writes a consistent copy of the database to the file asked for, creating folders and handling quotes in the name', () => {
    const source = newDb('live.db');
    const live = new DatabaseSync(source);
    live.exec("INSERT INTO rider_prices (org_id, name, cost_cents) VALUES (1, 'Hubbly', 2500)");
    live.close();
    const dir = join(work, "it's a folder");
    const target = join(dir, "copy 'one'.db");
    made.push(target);
    const r = run('src/backup.ts', ['--out', target], { DB_PATH: source });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Backup written to/);
    const copy = new DatabaseSync(target, { readOnly: true });
    assert.deepEqual(copy.prepare('SELECT name, cost_cents FROM rider_prices').all().map((x) => ({ ...x })), [{ name: 'Hubbly', cost_cents: 2500 }]);
    copy.close();
  });

  test('refuses to overwrite a backup, and says so when there is no database', () => {
    const source = newDb('live2.db');
    const target = file('taken.db');
    writeFileSync(target, 'x');
    const taken = run('src/backup.ts', ['--out', target], { DB_PATH: source });
    assert.equal(taken.code, 1);
    assert.match(taken.err, /already exists/);
    assert.equal(readFileSync(target, 'utf8'), 'x');

    const missing = run('src/backup.ts', ['--out', file('never.db')], { DB_PATH: join(work, 'nothing-here.db') });
    assert.equal(missing.code, 1);
    assert.match(missing.err, /No database found at/);
  });

  test('with no --out it writes a time-stamped file in server/backups', () => {
    const source = newDb('live3.db');
    const folder = join(SERVER, 'backups');
    const hadFolder = existsSync(folder);
    const before = new Set(hadFolder ? readdirSync(folder) : []);
    const r = run('src/backup.ts', [], { DB_PATH: source });
    try {
      assert.equal(r.code, 0, r.err);
      const created = readdirSync(folder).filter((f) => !before.has(f));
      assert.equal(created.length, 1);
      assert.match(created[0]!, /^planner-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/);
      unlinkSync(join(folder, created[0]!));
    } finally {
      if (!hadFolder && existsSync(folder) && readdirSync(folder).length === 0) rmdirSync(folder);
    }
  });
});

describe('npm run seed', () => {
  test('loads a planner workbook into the chosen organisation and lists the weeks', async () => {
    const db = newDb('seeded.db');
    const book = file('planner.xlsx');
    writeFileSync(book, await TEMPLATES.find((t) => t.id === 'planner-layout')!.build());
    const r = run('src/seed.ts', ['--file', book, '--year', '2027', '--org', 'alur'], { DB_PATH: db });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Imported 5 weeks \(planner layout\) into Alur from /);
    assert.match(r.out, /Nov 2027 W1\s+\d+ lines\s+R/);
    assert.doesNotMatch(r.out, /Warnings/);
    const check = new DatabaseSync(db, { readOnly: true });
    assert.equal(Number((check.prepare('SELECT COUNT(*) AS n FROM weeks').get() as { n: number }).n), 5);
    assert.equal(Number((check.prepare("SELECT COUNT(*) AS n FROM weeks w JOIN organisations o ON o.id = w.org_id WHERE o.slug = 'alur'").get() as { n: number }).n), 5);
    check.close();
  });

  test('prints the things to check when the file has them, and defaults to Felice and this year', async () => {
    const db = newDb('seeded2.db');
    const book = file('flat.xlsx');
    writeFileSync(book, await workbook({ 'Line Items': [['Year', 'Month', 'Week', 'Category', 'Name', 'Amount'], [2028, 1, 1, 'Other', 'Deposit', 100], [2028, 1, 1, 'Other', 'Broken', 'abc']] }));
    const r = run('src/seed.ts', ['--file', book], { DB_PATH: db });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /into Felice from/);
    assert.match(r.out, /Warnings:\n  - .*row 3 skipped/);
  });

  test('a year that is not a year, or an organisation that does not exist, stops with a message', () => {
    const db = newDb('seeded3.db');
    assert.equal(run('src/seed.ts', ['--year', '1999'], { DB_PATH: db }).code, 1);
    assert.match(run('src/seed.ts', ['--year', 'abc'], { DB_PATH: db }).err, /--year must be a 4-digit year/);
    const unknown = run('src/seed.ts', ['--org', 'nobody', '--year', '2027'], { DB_PATH: db });
    assert.equal(unknown.code, 1);
    assert.match(unknown.err, /Unknown organisation "nobody"/);
  });
});

describe('starting the server (npm start)', () => {
  const freePort = () =>
    new Promise<number>((ok) => {
      const s = createServer().listen(0, '127.0.0.1', () => {
        const port = (s.address() as { port: number }).port;
        s.close(() => ok(port));
      });
    });
  const settings = (port: number, db: string) => ({ PORT: String(port), HOST: '127.0.0.1', APP_PASSWORD: PASSWORD, SESSION_SECRET: SECRET, DB_PATH: db, COOKIE_SECURE: 'false' });

  function boot(env: Record<string, string>): { child: ChildProcess; ready: Promise<void>; exited: Promise<number | null>; output: () => string } {
    const child = spawn(process.execPath, ['src/index.ts'], { cwd: SERVER, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    const ready = new Promise<void>((ok, bad) => {
      child.stdout!.on('data', (d: Buffer) => {
        text += d;
        if (/listening on http/.test(text)) ok();
      });
      child.stderr!.on('data', (d: Buffer) => (text += d));
      child.once('exit', (code) => bad(new Error(`exited with ${code} before it was ready:\n${text}`)));
    });
    const exited = new Promise<number | null>((ok) => child.once('exit', (code) => ok(code)));
    return { child, ready, exited, output: () => text };
  }

  test('listens, answers requests, and shuts down cleanly on SIGTERM and on SIGINT', async () => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      const port = await freePort();
      const db = file(`start-${signal}.db`);
      made.push(`${db}-wal`, `${db}-shm`);
      const { child, ready, exited, output } = boot(settings(port, db));
      try {
        await ready;
        assert.match(output(), new RegExp(`listening on http://127.0.0.1:${port}`));
        const me = await (await fetch(`http://127.0.0.1:${port}/api/auth/me`)).json();
        assert.deepEqual(me, { authenticated: false });
        const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-requested-with': 'felice' },
          body: JSON.stringify({ password: PASSWORD }),
        });
        assert.equal(login.status, 200);
        child.kill(signal);
        assert.equal(await exited, 0, `${signal} should end the server with exit code 0`);
      } finally {
        child.kill('SIGKILL');
      }
    }
  });

  test('refuses to start with weak settings, and explains why', () => {
    const r = run('src/index.ts', [], { APP_PASSWORD: 'short', SESSION_SECRET: 'short', PORT: '4000', DB_PATH: ':memory:' });
    assert.equal(r.code, 1);
    assert.match(r.err, /Invalid configuration/);
    assert.match(r.err, /APP_PASSWORD must be set and at least 12 characters/);
    assert.match(r.err, /SESSION_SECRET must be set/);
  });
});
