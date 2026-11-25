import { useId, type ReactNode } from 'react';
import { MONTH_NAMES, parseMonthKey, monthKey } from '../../shared/categories.ts';
import { lastMonths, yearToDate, type Period } from './lib.ts';

/**
 * True when the browser has a real month picker. Chrome, Edge and iOS Safari do. Firefox and some
 * desktop Safari versions silently turn the field into a plain text box, where people can type
 * anything, so there we show a month list and a year list instead.
 */
const HAS_NATIVE_MONTH_INPUT = (() => {
  try {
    const probe = document.createElement('input');
    probe.type = 'month';
    return probe.type === 'month';
  } catch {
    return false;
  }
})();

/** A month ("YYYY-MM") picker that behaves the same in every browser. Only valid months are ever reported. */
export function MonthField({
  id,
  value,
  onChange,
  label,
  min,
  max,
}: {
  id: string;
  value: string;
  onChange: (month: string) => void;
  /** Names the field for screen readers, e.g. "From". */
  label: string;
  min?: string;
  max?: string;
}) {
  if (HAS_NATIVE_MONTH_INPUT) {
    return <input id={id} type="month" value={value} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} />;
  }

  const parsed = parseMonthKey(value) ?? { year: new Date().getFullYear(), month: 1 };
  const thisYear = new Date().getFullYear();
  const first = Math.min(parsed.year, thisYear - 10);
  const last = Math.max(parsed.year, thisYear + 3);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <span className="month-field">
      <select id={id} aria-label={`${label} month`} value={parsed.month} onChange={(e) => onChange(monthKey(parsed.year, Number(e.target.value)))}>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label={`${label} year`} value={parsed.year} onChange={(e) => onChange(monthKey(Number(e.target.value), parsed.month))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  );
}

const PRESETS: { label: string; get: () => Period }[] = [
  { label: '3 months', get: () => lastMonths(3) },
  { label: '6 months', get: () => lastMonths(6) },
  { label: '12 months', get: () => lastMonths(12) },
  { label: 'Year to date', get: yearToDate },
];

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const id = useId();
  return (
    <fieldset className="period">
      <legend>Period</legend>
      <div className="period-presets" role="group" aria-label="Quick periods">
        {PRESETS.map((p) => {
          const preset = p.get();
          const active = preset.from === value.from && preset.to === value.to;
          return (
            <button key={p.label} type="button" className={active ? 'chip active' : 'chip'} aria-pressed={active} onClick={() => onChange(preset)}>
              {p.label}
            </button>
          );
        })}
      </div>
      <label htmlFor={`${id}-from`}>From</label>
      {/* The other end moves along if you pass it, so the period can never end before it starts. */}
      <MonthField
        id={`${id}-from`}
        label="From"
        value={value.from}
        max={value.to}
        onChange={(from) => onChange({ from, to: from > value.to ? from : value.to })}
      />
      <label htmlFor={`${id}-to`}>To</label>
      <MonthField
        id={`${id}-to`}
        label="To"
        value={value.to}
        min={value.from}
        onChange={(to) => onChange({ from: to < value.from ? to : value.from, to })}
      />
    </fieldset>
  );
}

export function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="toggle" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'chip active' : 'chip'} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'over' | 'under' }) {
  return (
    <div className={tone ? `kpi ${tone}` : 'kpi'}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

/** A download link for an import template: an example file for one of the imports. */
export function TemplateLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a href={`/api/templates/${id}`} download>
      {children}
    </a>
  );
}

export function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      <header className="card-header">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

export function Loading() {
  return (
    <p className="muted" role="status">
      Loading…
    </p>
  );
}

/** Text arrow plus sign, so change direction doesn't rely on colour alone. */
export function Change({ a, b }: { a: number; b: number }) {
  const diff = b - a;
  if (Math.abs(diff) < 0.005) return <span className="muted">no change</span>;
  const pct = a === 0 ? null : diff / a;
  return (
    <span className={diff > 0 ? 'up' : 'down'}>
      {diff > 0 ? '▲' : '▼'} {pct === null ? 'new' : `${(Math.abs(pct) * 100).toFixed(1)}%`}
    </span>
  );
}
