import { useCallback, useEffect, useState } from 'react';
import { addMonths, monthKey } from '../../shared/categories.ts';

const zar0 = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const zar2 = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 });
const compactNum = new Intl.NumberFormat('en-ZA', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (n: number) => zar2.format(n);
export const money0 = (n: number) => zar0.format(n);
export const moneyCompact = (n: number) => `R${compactNum.format(n)}`;
export const percent = (n: number) => `${(n * 100).toFixed(1)}%`;

export interface Period {
  from: string;
  to: string;
}

export function currentMonthKey(): string {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/** The last `n` months up to and including the current month. */
export function lastMonths(n: number): Period {
  const to = currentMonthKey();
  return { from: addMonths(to, -(n - 1)), to };
}

export function yearToDate(): Period {
  const to = currentMonthKey();
  return { from: `${to.slice(0, 4)}-01`, to };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

/** Loads data when `deps` change; ignores responses that arrive after a newer request. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((d) => active && setData(d))
      .catch((e: unknown) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
