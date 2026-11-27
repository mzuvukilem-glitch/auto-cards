// Shared helpers for the tests that drive the real server (app.ts) over HTTP, in this process.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.ts';
import type { ServerConfig } from '../src/config.ts';
import { openDb } from '../src/db.ts';

export const PASSWORD = 'correct-horse-battery';
export const SECRET = 's'.repeat(40);
export const config = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  port: 0,
  host: '127.0.0.1',
  password: PASSWORD,
  sessionSecret: SECRET,
  cookieSecure: false,
  ...over,
});

// Temporary folders made by these helpers are removed when the test process ends.
const tempDirs: string[] = [];
process.on('exit', () => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** A temporary folder that stands in for web/dist. */
export function fakeWebDist(withIndex: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'fp-dist-'));
  tempDirs.push(dir);
  if (withIndex) writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Planner</title>');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  return dir;
}

export interface Reply<T = any> {
  status: number;
  body: T;
  headers: Headers;
  buffer: Buffer;
}

export interface Running {
  base: string;
  db: DatabaseSync;
  /** Signs in (once) and remembers the session cookie for the calls below. */
  login: () => Promise<void>;
  /** A JSON request that carries the session cookie and the CSRF header. */
  call: (method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>) => Promise<Reply>;
  /** An upload of raw bytes, as the import endpoints expect. */
  upload: (path: string, data: Buffer | string, method?: string) => Promise<Reply>;
  /** A request with exactly the headers given (no cookie, no CSRF header unless you add them). */
  bare: (method: string, path: string, init?: { headers?: Record<string, string>; body?: string | Buffer }) => Promise<Reply>;
  close: () => Promise<void>;
}

export async function start(opts: { cfg?: Partial<ServerConfig>; webDist?: string; db?: DatabaseSync; backupDir?: string } = {}): Promise<Running> {
  const db = opts.db ?? openDb(':memory:');
  const backupDir = opts.backupDir ?? join(fakeWebDist(false), 'backups'); // never the real server/backups folder
  const server: Server = createApp(config(opts.cfg), db, opts.webDist ?? fakeWebDist(true), backupDir).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = '';

  const toReply = async (res: Response): Promise<Reply> => {
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = buffer.toString('utf8');
    let body: unknown = text;
    if (res.headers.get('content-type')?.includes('application/json')) body = JSON.parse(text);
    return { status: res.status, body, headers: res.headers, buffer };
  };
  const bare: Running['bare'] = async (method, path, init = {}) =>
    toReply(await fetch(base + path, { method, headers: init.headers, body: init.body as never }));

  return {
    base,
    db,
    bare,
    async login() {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'felice' },
        body: JSON.stringify({ password: PASSWORD }),
      });
      if (res.status !== 200) throw new Error(`sign-in failed (${res.status})`);
      cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    },
    async call(method, path, body, extraHeaders = {}) {
      const headers: Record<string, string> = { 'x-requested-with': 'felice', cookie, ...extraHeaders };
      if (body !== undefined) headers['content-type'] = 'application/json';
      return bare(method, `/api${path}`, { headers, body: body === undefined ? undefined : JSON.stringify(body) });
    },
    async upload(path, data, method = 'POST') {
      return bare(method, `/api${path}`, {
        headers: { 'x-requested-with': 'felice', cookie, 'content-type': 'application/octet-stream' },
        body: typeof data === 'string' ? Buffer.from(data) : data,
      });
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Builds an .xlsx file from rows, one sheet per entry. */
export async function workbook(sheets: Record<string, (string | number | null)[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r));
  }
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
