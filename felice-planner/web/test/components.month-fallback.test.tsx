// Firefox and some desktop Safari versions turn <input type="month"> into a plain text box.
// The support check runs once when components.tsx loads, so the probe is rigged before importing it.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const restore = vi.hoisted(() => {
  const real = document.createElement.bind(document);
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    const el = real(tag, options);
    // An input that does not accept "month" keeps reporting "text".
    if (tag === 'input') Object.defineProperty(el, 'type', { get: () => 'text', set: () => undefined });
    return el;
  }) as typeof document.createElement;
  return () => {
    document.createElement = real;
  };
});

import { MonthField, PeriodPicker } from '../src/components.tsx';

restore();

describe('MonthField without native month support', () => {
  it('shows a month list and a year list instead of a month input', () => {
    render(<MonthField id="m" label="From" value="2026-05" onChange={() => undefined} />);
    const month = screen.getByLabelText('From month') as HTMLSelectElement;
    const year = screen.getByLabelText('From year') as HTMLSelectElement;
    expect(month.id).toBe('m');
    expect(month.value).toBe('5');
    expect(year.value).toBe('2026');
    expect([...month.options].map((o) => o.text)).toEqual([
      'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    ]);
    expect(document.querySelector('input[type="month"]')).toBeNull();
  });

  it('reports a valid YYYY-MM when the month changes', () => {
    const onChange = vi.fn();
    render(<MonthField id="m" label="From" value="2026-05" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From month'), { target: { value: '11' } });
    expect(onChange).toHaveBeenCalledWith('2026-11');
  });

  it('reports a valid YYYY-MM when the year changes', () => {
    const onChange = vi.fn();
    render(<MonthField id="m" label="From" value="2026-05" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From year'), { target: { value: '2025' } });
    expect(onChange).toHaveBeenCalledWith('2025-05');
  });

  it('starts at January of this year when the value is not a month', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T10:00:00'));
    render(<MonthField id="m" label="From" value="" onChange={() => undefined} />);
    expect((screen.getByLabelText('From month') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText('From year') as HTMLSelectElement).value).toBe('2026');
    vi.useRealTimers();
  });

  it('lists ten years back and three ahead, and widens the list for a value outside it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T10:00:00'));
    const { rerender } = render(<MonthField id="m" label="From" value="2026-05" onChange={() => undefined} />);
    const years = () => [...(screen.getByLabelText('From year') as HTMLSelectElement).options].map((o) => Number(o.value));
    expect([years()[0], years().at(-1)]).toEqual([2016, 2029]);
    rerender(<MonthField id="m" label="From" value="2005-05" onChange={() => undefined} />);
    expect([years()[0], years().at(-1)]).toEqual([2005, 2029]);
    rerender(<MonthField id="m" label="From" value="2040-05" onChange={() => undefined} />);
    expect([years()[0], years().at(-1)]).toEqual([2016, 2040]);
    vi.useRealTimers();
  });

  it('works inside the period picker, keeping the period valid', () => {
    const onChange = vi.fn();
    render(<PeriodPicker value={{ from: '2026-02', to: '2026-05' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('From month'), { target: { value: '9' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-09', to: '2026-09' });
    fireEvent.change(screen.getByLabelText('To year'), { target: { value: '2025' } });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2025-05', to: '2025-05' });
  });
});
