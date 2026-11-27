// Backup and restore of the whole database, for the Backup & restore page.
//
// A backup is a single, consistent SQLite file made with VACUUM INTO, the same kind of file "npm run backup"
// writes. Restoring replaces the data of every company with what is in the file. The file is first copied to a
// temporary place, opened and brought up to date (so a backup from an older version still works), checked, and
// only then copied into the live database in one transaction. The live connection is kept, so the server needs no
// restart. The current data is saved to a file first, so a restore can itself be undone.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { weekLabel } from '../../shared/categories.ts';
import type { BackupOrgSummary, BackupSummary, RestoreResult } from '../../shared/types.ts';
import { openDb, transaction } from './db.ts';
import { HttpError } from './validate.ts';

/** Every table that holds data, parents before children. Organisations are fixed and are not restored. */
const TABLES = ['rider_prices', 'recurring_items', 'weeks', 'items', 'actual_weeks', 'actual_sections', 'rider_lines'];

const SQLITE_HEADER = 'SQLite format 3\0';
const quote = (path: string) => `'${path.replace(/'/g, "''")}'`;
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

type Row = Record<string, unknown>;

function summarise(db: DatabaseSync): BackupSummary {
  const count = (sql: string, orgId: number) => Number((db.prepare(sql).get(orgId) as Row).n);
  const orgs = (db.prepare('SELECT id, slug, name FROM organisations ORDER BY sort, id').all() as Row[]).map((o): BackupOrgSummary => {
    const id = Number(o.id);
    const latest = db.prepare('SELECT year, month, week_no FROM weeks WHERE org_id = ? ORDER BY year DESC, month DESC, week_no DESC LIMIT 1').get(id) as Row | undefined;
    return {
      slug: String(o.slug),
      name: String(o.name),
      weeks: count('SELECT COUNT(*) AS n FROM weeks WHERE org_id = ?', id),
      lines: count('SELECT COUNT(*) AS n FROM items i JOIN weeks w ON w.id = i.week_id WHERE w.org_id = ?', id),
      recurring: count('SELECT COUNT(*) AS n FROM recurring_items WHERE org_id = ?', id),
      riderPrices: count('SELECT COUNT(*) AS n FROM rider_prices WHERE org_id = ?', id),
      actualWeeks: count('SELECT COUNT(*) AS n FROM actual_weeks WHERE org_id = ?', id),
      latestWeek: latest ? weekLabel(Number(latest.year), Number(latest.month), Number(latest.week_no)) : null,
    };
  });
  return { orgs };
}

const notABackup = () => new HttpError(400, 'That file is not a planner backup. Choose a .db file made by Download backup or "npm run backup".');

/**
 * Checks an uploaded file and brings a copy of it up to date. Returns the copy's path and what it holds.
 * `cleanup` removes the temporary files and must always be called.
 */
function prepare(data: Buffer, live: DatabaseSync): { path: string; summary: BackupSummary; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'fp-restore-'));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    if (data.length < 100 || data.subarray(0, 16).toString('latin1') !== SQLITE_HEADER) throw notABackup();
    const path = join(dir, 'backup.db');
    writeFileSync(path, data);

    // Look at the file without changing it: it must be an intact database that has the planner's tables.
    const probe = new DatabaseSync(path, { readOnly: true });
    try {
      const ok = (probe.prepare('PRAGMA integrity_check').all() as Row[]).every((r) => r.integrity_check === 'ok');
      if (!ok) throw new HttpError(400, 'That backup is damaged and cannot be restored.');
      const tables = new Set((probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Row[]).map((r) => String(r.name)));
      if (!tables.has('weeks') || !tables.has('items')) throw notABackup();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw notABackup();
    } finally {
      probe.close();
    }

    // Bring a backup from an older version up to date, exactly as starting the app on it would.
    let bk: DatabaseSync;
    try {
      bk = openDb(path);
    } catch {
      throw new HttpError(400, 'That backup is from an older version and could not be brought up to date, so it cannot be restored.');
    }
    try {
      // Every line must belong to a week, and so on. Otherwise the copy into the live database would fail halfway.
      if (bk.prepare('PRAGMA foreign_key_check').all().length > 0) throw new HttpError(400, 'That backup is damaged and cannot be restored.');
      const summary = summarise(bk);
      const ids = (db: DatabaseSync) => (db.prepare('SELECT id, slug FROM organisations ORDER BY id').all() as Row[]).map((o) => `${o.id}:${o.slug}`).join(',');
      if (ids(bk) !== ids(live)) throw new HttpError(400, 'That backup was made for different companies and cannot be restored here.');
      return { path, summary, cleanup };
    } finally {
      bk.close();
    }
  } catch (err) {
    cleanup();
    throw err;
  }
}

/** Copies the whole database to a new file. Safe while the app is running. */
function copyTo(db: DatabaseSync, target: string) {
  db.exec(`VACUUM INTO ${quote(target)}`);
}

/** Replaces the data in `db` with the data in the database at `path`, all or nothing. */
function replaceData(db: DatabaseSync, path: string) {
  db.exec(`ATTACH DATABASE ${quote(path)} AS bk`);
  try {
    transaction(db, () => {
      for (const table of [...TABLES].reverse()) db.exec(`DELETE FROM main.${table}`);
      for (const table of TABLES) {
        // By column name, because an older database can have its columns in another order.
        const columns = (db.prepare(`PRAGMA main.table_info(${table})`).all() as Row[]).map((c) => String(c.name)).join(', ');
        db.exec(`INSERT INTO main.${table} (${columns}) SELECT ${columns} FROM bk.${table}`);
      }
    });
  } finally {
    db.exec('DETACH DATABASE bk');
  }
}

export interface Backups {
  /** The whole database as one file, and a name to save it under. */
  download(): { data: Buffer; filename: string };
  /** What restoring this file would do. Changes nothing. */
  check(data: Buffer): RestoreResult;
  /** Saves the current data, then replaces it with the file's. */
  restore(data: Buffer): RestoreResult;
}

/** `dir` is where the copy of the current data is saved before a restore. */
export function createBackups(db: DatabaseSync, dir: string): Backups {
  return {
    download() {
      const tmp = mkdtempSync(join(tmpdir(), 'fp-backup-'));
      try {
        const file = join(tmp, 'backup.db');
        copyTo(db, file);
        return { data: readFileSync(file), filename: `planner-backup-${stamp().slice(0, 19)}.db` };
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },

    check(data) {
      const backup = prepare(data, db);
      backup.cleanup();
      return { applied: false, current: summarise(db), backup: backup.summary, safetyCopy: null };
    },

    restore(data) {
      const backup = prepare(data, db);
      try {
        const current = summarise(db);
        mkdirSync(dir, { recursive: true });
        const safety = join(dir, `before-restore-${stamp()}.db`);
        copyTo(db, safety);
        try {
          replaceData(db, backup.path);
        } catch (err) {
          // The copy is all or nothing, so the current data is as it was.
          throw new HttpError(400, `That backup could not be loaded (${(err as Error).message}). Nothing was changed.`);
        }
        return { applied: true, current, backup: backup.summary, safetyCopy: basename(safety) };
      } finally {
        backup.cleanup();
      }
    },
  };
}
