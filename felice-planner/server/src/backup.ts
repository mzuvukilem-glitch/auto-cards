// Writes a safe, single-file copy of the database. Works the same on Windows, macOS and Linux.
// Usage: npm run backup                 (writes server/backups/planner-<date>.db)
//        npm run backup -- --out "<file>"
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { dbPath } from './config.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });

const source = dbPath();
if (!existsSync(source)) {
  console.error(`No database found at ${source}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = values.out ? resolve(values.out) : resolve(import.meta.dirname, '../backups', `planner-${stamp}.db`);
if (existsSync(target)) {
  console.error(`${target} already exists. Choose a different name.`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });

// VACUUM INTO is SQLite's own consistent copy. It is safe while the app is running.
const db = new DatabaseSync(source);
try {
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}
console.log(`Backup written to ${target}`);
