import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentMonthKey, errorMessage, lastMonths, money, money0, moneyCompact, percent, useAsync, yearToDate } from '../src/lib.ts';
import { deferred, freezeToday } from './helpers.tsx';

// Intl output uses non-breaking spaces (and, in newer ICU, one after the R); compare without any whitespace.
const plain = (s: string) => s.replace(/\s/g, '');

describe('money formatting', () => {
  it('formats rand with two decimals and a comma', () => {
    expect(plain(money(1234.5))).toBe('R1234,50');
  });
  it('formats rand without decimals', () => {
    expect(plain(money0(1234.56))).toBe('R1235');
  });
  it('formats compact amounts for chart axes', () => {
    expect(moneyCompact(1500000)).toMatch(/^R1[.,]5\s?M/i);
    expect(moneyCompact(0)).toBe('R0');
  });
  it('formats a ratio as a percentage with one decimal', () => {
    expect(percent(0.1234)).toBe('12.3%');
    expect(percent(1)).toBe('100.0%');
  });
});

describe('period helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('currentMonthKey pads the month', () => {
    freezeToday('2026-03-09T12:00:00');
    expect(currentMonthKey()).toBe('2026-03');
  });
  it('lastMonths ends this month and spans n months', () => {
    freezeToday('2026-02-10T12:00:00');
    expect(lastMonths(12)).toEqual({ from: '2025-03', to: '2026-02' });
    expect(lastMonths(1)).toEqual({ from: '2026-02', to: '2026-02' });
  });
  it('yearToDate starts in January of this year', () => {
    freezeToday('2026-08-10T12:00:00');
    expect(yearToDate()).toEqual({ from: '2026-01', to: '2026-08' });
  });
});

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
  });
  it('falls back for anything else', () => {
    expect(errorMessage('nope')).toBe('Something went wrong');
    expect(errorMessage(undefined)).toBe('Something went wrong');
  });
});

describe('useAsync', () => {
  it('starts loading, then delivers the data', async () => {
    const { result } = renderHook(() => useAsync(async () => 'hello', []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe('hello');
    expect(result.current.error).toBeNull();
  });

  it('reports the error message when loading fails', async () => {
    const { result } = renderHook(() => useAsync(async () => Promise.reject(new Error('Server down')), []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Server down');
    expect(result.current.data).toBeUndefined();
  });

  it('loads again when a dependency changes and clears the earlier error', async () => {
    const load = vi.fn(async (n: number) => {
      if (n === 1) throw new Error('first failed');
      return `value ${n}`;
    });
    const { result, rerender } = renderHook(({ n }) => useAsync(() => load(n), [n]), { initialProps: { n: 1 } });
    await waitFor(() => expect(result.current.error).toBe('first failed'));
    rerender({ n: 2 });
    await waitFor(() => expect(result.current.data).toBe('value 2'));
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reload runs the loader again', async () => {
    let calls = 0;
    const { result } = renderHook(() => useAsync(async () => ++calls, []));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
  });

  it('setData replaces the data locally', async () => {
    const { result } = renderHook(() => useAsync(async () => 'server', []));
    await waitFor(() => expect(result.current.data).toBe('server'));
    act(() => result.current.setData('local'));
    expect(result.current.data).toBe('local');
  });

  it('ignores a slow response that arrives after a newer request', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ n }) => useAsync(() => (n === 1 ? first.promise : second.promise), [n]), { initialProps: { n: 1 } });
    rerender({ n: 2 });
    second.resolve('new');
    await waitFor(() => expect(result.current.data).toBe('new'));
    await act(async () => first.resolve('old'));
    expect(result.current.data).toBe('new');
  });

  it('ignores a failure that arrives after a newer request', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ n }) => useAsync(() => (n === 1 ? first.promise : second.promise), [n]), { initialProps: { n: 1 } });
    rerender({ n: 2 });
    second.resolve('new');
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => first.reject(new Error('stale failure')));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('new');
  });
});
