// If probing for month support throws, the field must still work, using the month and year lists.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const restore = vi.hoisted(() => {
  const real = document.createElement.bind(document);
  document.createElement = (() => {
    throw new Error('no DOM');
  }) as typeof document.createElement;
  return () => {
    document.createElement = real;
  };
});

import { MonthField } from '../src/components.tsx';

restore();

describe('MonthField when the support probe throws', () => {
  it('falls back to the month and year lists', () => {
    render(<MonthField id="m" label="To" value="2026-05" onChange={() => undefined} />);
    expect((screen.getByLabelText('To month') as HTMLSelectElement).value).toBe('5');
    expect((screen.getByLabelText('To year') as HTMLSelectElement).value).toBe('2026');
  });
});
