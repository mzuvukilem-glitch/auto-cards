// Loads the original weekly planner workbook into the database.
// Usage: npm run seed -- --file "<path to .xlsx>" --year 2026 --org felice
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { weekLabel } from '../../shared/categories.ts';
import { dbPath } from './config.ts';
import { openDb } from './db.ts';
import { parseWorkbook } from './excel.ts';
import { createStores } from './stores.ts';

const { values } = parseArgs({
  options: {
    file: { type: 'string', default: '../../calc/Weekly Planner - April - Dec.xlsx' },
    year: { type: 'string', default: String(new Date().getFullYear()) },
    org: { type: 'string', default: 'felice' },
  },
});

const file = resolve(values.file);
const year = Number(values.year);
if (!Number.isInteger(year) || year < 2000 || year > 2100) {
  console.error('--year must be a 4-digit year');
  process.exit(1);
}

const db = openDb(dbPath());
const scope = createStores(db).forOrg(values.org);
if (!scope) {
  console.error(`Unknown organisation "${values.org}"`);
  process.exit(1);
}
const parsed = await parseWorkbook(readFileSync(file), year, scope.orgs[0]);
scope.repo.importWeeks(parsed.weeks);
db.close();

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
console.log(`Imported ${parsed.weeks.length} weeks (${parsed.format} layout) into ${scope.orgs[0]!.name} from ${file}\n`);
for (const w of parsed.weeks) {
  const total = w.items.reduce((s, i) => s + i.amountCents, 0) / 100;
  console.log(`  ${weekLabel(w.year, w.month, w.weekNo, true).padEnd(14)} ${String(w.items.length).padStart(3)} lines  ${zar.format(total)}`);
}
if (parsed.warnings.length) {
  console.log('\nWarnings:');
  for (const msg of parsed.warnings) console.log(`  - ${msg}`);
}
