import { isCategory, parseMonthKey, type CategoryKey } from '../../shared/categories.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const bad = (message: string) => new HttpError(400, message);

export function int(value: unknown, name: string, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${name} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

export function id(value: unknown, name = 'id'): number {
  return int(value, name, 1, Number.MAX_SAFE_INTEGER);
}

export function text(value: unknown, name: string, max: number, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw bad(`${name} is required`);
    return '';
  }
  if (typeof value !== 'string') throw bad(`${name} must be text`);
  const trimmed = value.trim();
  if (required && trimmed === '') throw bad(`${name} is required`);
  if (trimmed.length > max) throw bad(`${name} must be ${max} characters or fewer`);
  return trimmed;
}

/** Rand amount in, integer cents out. */
export function money(value: unknown, name = 'amount'): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
    throw bad(`${name} must be a number between 0 and 1,000,000,000`);
  }
  return Math.round(n * 100);
}

export function category(value: unknown): CategoryKey {
  if (!isCategory(value)) throw bad('category is not recognised');
  return value;
}

/** Validates a "YYYY-MM" value and returns it with a sortable number (YYYYMM). */
export function month(value: unknown, name: string): { key: string; ym: number; year: number; month: number } {
  const p = typeof value === 'string' ? parseMonthKey(value) : null;
  if (!p || p.year < 2000 || p.year > 2100) throw bad(`${name} must be a month in the form YYYY-MM`);
  return { key: value as string, ym: p.year * 100 + p.month, ...p };
}

export function period(fromValue: unknown, toValue: unknown) {
  const from = month(fromValue, 'from');
  const to = month(toValue, 'to');
  if (from.ym > to.ym) throw bad('from must be on or before to');
  const span = (to.year - from.year) * 12 + (to.month - from.month) + 1;
  if (span > 60) throw bad('period can be at most 60 months');
  return { from, to };
}
