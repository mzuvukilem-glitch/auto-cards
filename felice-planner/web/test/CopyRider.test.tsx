import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Item, LineItem } from '../../shared/types.ts';
import { CopyRiderPanel } from '../src/CopyRider.tsx';
import { CategorySection, type LineActions } from '../src/ItemEditor.tsx';
import type { RiderTools } from '../src/RiderCalculator.tsx';
import { line } from './fixtures.ts';
import { deferred } from './helpers.tsx';

const max = line({ id: 1, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 120, riderItems: 2 });
const zee = line({ id: 2, category: 'headline', name: 'Zee', amount: 100 });
const typed = line({ id: 3, category: 'hosts', name: 'Xoli', amount: 800, riderCost: 250 });
const calculatedAtZero = line({ id: 4, category: 'hosts', name: 'Free items', amount: 1, riderCost: 0, riderItems: 1 });

function panel(over: Partial<Parameters<typeof CopyRiderPanel>[0]> = {}) {
  const copy = vi.fn<(fromId: number, toIds: number[]) => Promise<void>>(async () => undefined);
  const onClose = vi.fn();
  render(<CopyRiderPanel item={max} targets={[max, zee, typed, calculatedAtZero]} copy={copy} onClose={onClose} {...over} />);
  return { copy, onClose, user: userEvent.setup() };
}

describe('CopyRiderPanel', () => {
  it('lists the other bookings, and says which already have a rider that will be replaced', () => {
    panel();
    const group = screen.getByRole('group', { name: 'Copy the rider of DJ Max' });
    expect(within(group).queryByRole('checkbox', { name: /DJ Max/ })).toBeNull();
    expect(within(group).getByRole('checkbox', { name: /^Zee \(Headline Acts\)$/ })).toBeTruthy();
    expect(within(group).getByRole('checkbox', { name: /^Xoli \(Hosts & Promoters\) has a rider of .*250.*, which will be replaced$/ })).toBeTruthy();
    expect(within(group).getByRole('checkbox', { name: /Free items .* has a rider of/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy rider' }).hasAttribute('disabled')).toBe(true);
  });

  it('copies to the ticked bookings only, then closes', async () => {
    const { copy, onClose, user } = panel();
    await user.click(screen.getByRole('checkbox', { name: /^Zee/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Xoli/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Zee/ }));
    await user.click(screen.getByRole('button', { name: 'Copy rider' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(copy).toHaveBeenCalledWith(1, [3]);
  });

  it('cannot be pressed twice while copying', async () => {
    const pending = deferred<void>();
    const { onClose, user } = panel({ copy: vi.fn(() => pending.promise) });
    await user.click(screen.getByRole('checkbox', { name: /^Zee/ }));
    await user.click(screen.getByRole('button', { name: 'Copy rider' }));
    expect(screen.getByRole('button', { name: 'Copy rider' }).hasAttribute('disabled')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    pending.resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows the error and stays open when the copy fails, so it can be tried again', async () => {
    const { onClose, user } = panel({ copy: vi.fn().mockRejectedValueOnce(new Error('Line item not found')).mockResolvedValueOnce(undefined) });
    await user.click(screen.getByRole('checkbox', { name: /^Zee/ }));
    await user.click(screen.getByRole('button', { name: 'Copy rider' }));
    expect(await screen.findByText('Line item not found')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Copy rider' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says so when there is nowhere to copy it to, and closes', async () => {
    const { onClose, user } = panel({ targets: [max] });
    expect(screen.getByText(/no other headline act or host/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy rider' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Copy rider on a line', () => {
  const actions: LineActions = { add: vi.fn(), update: vi.fn(), remove: vi.fn() };
  const base: RiderTools = { prices: [], load: vi.fn(), save: vi.fn() };

  function Harness({ initial, rider }: { initial: LineItem[]; rider?: RiderTools }) {
    const [items, setItems] = useState(initial);
    return <CategorySection actions={actions} category="headline" label="Headline Acts" color="#047857" items={items} onItemsChange={setItems} rider={rider} />;
  }
  const withCopy = (targets: Item[] = [max, zee]): RiderTools => ({ ...base, copyTo: { targets, copy: vi.fn(async () => undefined) } });

  it('is offered on a booking that has a rider, and opens and closes the panel', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[max]} rider={withCopy()} />);
    const button = screen.getByRole('button', { name: 'Copy rider of DJ Max' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Copy the rider of DJ Max' })).toBeTruthy();
    await user.click(button);
    expect(screen.queryByRole('group', { name: 'Copy the rider of DJ Max' })).toBeNull();
  });

  it('is offered for a typed-in rider too, but not when there is no rider or no way to copy', () => {
    const { unmount } = render(<Harness initial={[line({ id: 5, category: 'headline', name: 'Typed', riderCost: 90 })]} rider={withCopy()} />);
    expect(screen.getByRole('button', { name: 'Copy rider of Typed' })).toBeTruthy();
    unmount();
    const noRider = render(<Harness initial={[zee]} rider={withCopy()} />);
    expect(screen.queryByRole('button', { name: /Copy rider of/ })).toBeNull();
    noRider.unmount();
    render(<Harness initial={[max]} rider={base} />);
    expect(screen.queryByRole('button', { name: /Copy rider of/ })).toBeNull();
  });
});
