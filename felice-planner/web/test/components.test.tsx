import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card, Change, ErrorBanner, Kpi, Loading, MonthField, PeriodPicker, TemplateLink, Toggle } from '../src/components.tsx';
import type { Period } from '../src/lib.ts';
import { freezeToday } from './helpers.tsx';

afterEach(() => vi.useRealTimers());

describe('MonthField (browser with a month input)', () => {
  it('renders a month input with its bounds and reports valid months', () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="m">Start</label>
        <MonthField id="m" label="Start" value="2026-05" min="2026-01" max="2026-12" onChange={onChange} />
      </>,
    );
    const input = screen.getByLabelText('Start') as HTMLInputElement;
    expect(input.type).toBe('month');
    expect(input.value).toBe('2026-05');
    expect(input.min).toBe('2026-01');
    expect(input.max).toBe('2026-12');
    fireEvent.change(input, { target: { value: '2026-07' } });
    expect(onChange).toHaveBeenCalledWith('2026-07');
  });

  it('ignores a cleared field, so only valid months are ever reported', () => {
    const onChange = vi.fn();
    render(<MonthField id="m" label="Start" value="2026-05" onChange={onChange} />);
    fireEvent.change(document.getElementById('m')!, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PeriodPicker', () => {
  function Harness({ initial, spy }: { initial: Period; spy?: (p: Period) => void }) {
    const [period, setPeriod] = useState(initial);
    return (
      <PeriodPicker
        value={period}
        onChange={(p) => {
          spy?.(p);
          setPeriod(p);
        }}
      />
    );
  }

  it('offers quick periods and marks the one that matches', async () => {
    freezeToday('2026-06-15T10:00:00');
    const spy = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={{ from: '2025-07', to: '2026-06' }} spy={spy} />);
    const group = screen.getByRole('group', { name: 'Quick periods' });
    expect(within(group).getByRole('button', { name: '12 months' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: '3 months' }).getAttribute('aria-pressed')).toBe('false');

    await user.click(within(group).getByRole('button', { name: '3 months' }));
    expect(spy).toHaveBeenLastCalledWith({ from: '2026-04', to: '2026-06' });
    expect(within(group).getByRole('button', { name: '3 months' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(within(group).getByRole('button', { name: '6 months' }));
    expect(spy).toHaveBeenLastCalledWith({ from: '2026-01', to: '2026-06' });
    await user.click(within(group).getByRole('button', { name: 'Year to date' }));
    expect(spy).toHaveBeenLastCalledWith({ from: '2026-01', to: '2026-06' });
  });

  it('shows the current period in the From and To fields with bounds that keep it valid', () => {
    render(<Harness initial={{ from: '2026-02', to: '2026-05' }} />);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to = screen.getByLabelText('To') as HTMLInputElement;
    expect([from.value, from.max]).toEqual(['2026-02', '2026-05']);
    expect([to.value, to.min]).toEqual(['2026-05', '2026-02']);
  });

  it('moves the end along when From is set after it', () => {
    const spy = vi.fn();
    render(<Harness initial={{ from: '2026-02', to: '2026-05' }} spy={spy} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09' } });
    expect(spy).toHaveBeenLastCalledWith({ from: '2026-09', to: '2026-09' });
  });

  it('keeps the end when From is set before it', () => {
    const spy = vi.fn();
    render(<Harness initial={{ from: '2026-02', to: '2026-05' }} spy={spy} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03' } });
    expect(spy).toHaveBeenLastCalledWith({ from: '2026-03', to: '2026-05' });
  });

  it('moves the start along when To is set before it', () => {
    const spy = vi.fn();
    render(<Harness initial={{ from: '2026-02', to: '2026-05' }} spy={spy} />);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-11' } });
    expect(spy).toHaveBeenLastCalledWith({ from: '2025-11', to: '2025-11' });
  });

  it('keeps the start when To is set after it', () => {
    const spy = vi.fn();
    render(<Harness initial={{ from: '2026-02', to: '2026-05' }} spy={spy} />);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08' } });
    expect(spy).toHaveBeenLastCalledWith({ from: '2026-02', to: '2026-08' });
  });
});

describe('Toggle', () => {
  const options = [
    { value: 'month' as const, label: 'By month' },
    { value: 'week' as const, label: 'By week' },
  ];
  it('marks the selected option and reports a new choice', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle label="Group rows" value="month" options={options} onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Group rows' });
    expect(within(group).getByRole('button', { name: 'By month' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'By week' }).getAttribute('aria-pressed')).toBe('false');
    await user.click(within(group).getByRole('button', { name: 'By week' }));
    expect(onChange).toHaveBeenCalledWith('week');
  });
});

describe('Kpi', () => {
  it('shows label and value only', () => {
    const { container } = render(<Kpi label="Total spend" value="R1" />);
    expect(screen.getByText('Total spend')).toBeTruthy();
    expect(screen.getByText('R1')).toBeTruthy();
    expect(container.querySelector('.kpi-hint')).toBeNull();
    expect((container.firstChild as HTMLElement).className).toBe('kpi');
  });
  it('shows a hint and a tone', () => {
    const { container } = render(<Kpi label="Variance" value="+R5" hint="over plan" tone="over" />);
    expect(screen.getByText('over plan')).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toBe('kpi over');
  });
});

describe('Card, ErrorBanner, Loading, TemplateLink', () => {
  it('Card is a labelled region with a heading and optional actions', () => {
    render(
      <Card title="Totals" actions={<button type="button">Go</button>}>
        <p>Body</p>
      </Card>,
    );
    const region = screen.getByRole('region', { name: 'Totals' });
    expect(within(region).getByRole('heading', { name: 'Totals' })).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Go' })).toBeTruthy();
    expect(within(region).getByText('Body')).toBeTruthy();
  });
  it('Card works without actions', () => {
    render(<Card title="Plain">x</Card>);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('ErrorBanner announces a message and renders nothing for null', () => {
    const { rerender } = render(<ErrorBanner message="Bad thing" />);
    expect(screen.getByRole('alert').textContent).toBe('Bad thing');
    rerender(<ErrorBanner message={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('Loading announces itself as a status', () => {
    render(<Loading />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });
  it('TemplateLink points at the template download', () => {
    render(<TemplateLink id="resident-djs">Excel</TemplateLink>);
    const link = screen.getByRole('link', { name: 'Excel' });
    expect(link.getAttribute('href')).toBe('/api/templates/resident-djs');
    expect(link.hasAttribute('download')).toBe(true);
  });
});

describe('Change', () => {
  it('says "no change" for a difference under half a cent', () => {
    render(<Change a={100} b={100.004} />);
    expect(screen.getByText('no change')).toBeTruthy();
  });
  it('shows an up arrow and the percentage for an increase', () => {
    render(<Change a={100} b={150} />);
    const el = screen.getByText('▲ 50.0%');
    expect(el.className).toBe('up');
  });
  it('shows a down arrow and the percentage for a decrease', () => {
    render(<Change a={200} b={150} />);
    const el = screen.getByText('▼ 25.0%');
    expect(el.className).toBe('down');
  });
  it('says "new" when growing from nothing', () => {
    render(<Change a={0} b={50} />);
    expect(screen.getByText('▲ new')).toBeTruthy();
  });
  it('says "new" with a down arrow when dropping below nothing', () => {
    render(<Change a={0} b={-50} />);
    expect(screen.getByText('▼ new')).toBeTruthy();
  });
});
