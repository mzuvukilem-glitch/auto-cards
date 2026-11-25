import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryKey } from '../../shared/categories.ts';
import type { LineItem } from '../../shared/types.ts';
import type { ItemInput } from '../src/api.ts';
import { CategorySection, type LineActions } from '../src/ItemEditor.tsx';
import type { RiderTools } from '../src/RiderCalculator.tsx';
import { lineItem, riderCalc } from './fixtures.ts';
import { txt, zar } from './helpers.tsx';

function makeActions(overrides: Partial<LineActions> = {}) {
  const actions = {
    add: vi.fn(async (item: ItemInput) => lineItem({ id: 99, category: item.category, name: item.name, amount: item.amount, riderCost: item.riderCost ?? 0, notes: item.notes })),
    update: vi.fn(async (id: number, item: ItemInput) => lineItem({ id, category: item.category, name: item.name, amount: item.amount, riderCost: item.riderCost ?? 0, notes: item.notes })),
    remove: vi.fn(async (_id: number) => undefined),
    ...overrides,
  };
  return actions satisfies LineActions;
}

function Harness({
  initial,
  actions,
  category = 'standard',
  label = 'Standard Costs',
  onChange,
  ...rest
}: {
  initial: LineItem[];
  actions: LineActions;
  category?: CategoryKey;
  label?: string;
  onChange?: (items: LineItem[]) => void;
  hint?: string;
  amountLabel?: string;
  rider?: RiderTools;
}) {
  const [items, setItems] = useState(initial);
  return (
    <CategorySection
      actions={actions}
      category={category}
      label={label}
      color="#047857"
      items={items}
      onItemsChange={(next) => {
        onChange?.(next);
        setItems(next);
      }}
      {...rest}
    />
  );
}

const mc = lineItem({ id: 1, category: 'standard', name: 'MC', amount: 1000, notes: 'Host' });
const graphics = lineItem({ id: 2, category: 'standard', name: 'Graphics', amount: 250.5 });

describe('CategorySection layout', () => {
  it('lists each line with its amount and notes, and a subtotal in the heading', () => {
    render(<Harness initial={[mc, graphics]} actions={makeActions()} />);
    const section = screen.getByRole('region', { name: 'Standard Costs' });
    expect(txt(within(section).getByRole('heading', { name: 'Standard Costs' }).parentElement)).toContain(zar(1250.5));
    expect((screen.getByLabelText('Amount for MC') as HTMLInputElement).value).toBe('1000');
    expect((screen.getByLabelText('Notes for MC') as HTMLInputElement).value).toBe('Host');
    expect((screen.getByLabelText('Amount for Graphics') as HTMLInputElement).value).toBe('250.5');
    expect(screen.getByRole('columnheader', { name: 'Amount (R)' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /Rider cost/ })).toBeNull();
    expect(screen.queryByText(/Rate .* \+ Rider/)).toBeNull();
  });

  it('offers the suggested names for categories that have them', () => {
    const { container } = render(<Harness initial={[mc]} actions={makeActions()} />);
    const options = [...container.querySelectorAll('datalist#suggest-standard option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['MC', 'Graphics', 'Photographer', 'Bottle Girls']);
    expect(screen.getByLabelText('Name').getAttribute('list')).toBe('suggest-standard');
    expect(screen.getByLabelText('New Standard Costs name').getAttribute('list')).toBe('suggest-standard');
  });

  it('has no suggestion list for a category without suggestions', () => {
    const { container } = render(<Harness initial={[lineItem({ id: 5, category: 'other', name: 'Misc', amount: 10 })]} category="other" label="Other" actions={makeActions()} />);
    expect(container.querySelector('datalist')).toBeNull();
    expect(screen.getByLabelText('Name').getAttribute('list')).toBeNull();
    expect(screen.getByLabelText('New Other name').getAttribute('list')).toBeNull();
  });

  it('shows a hint and a custom name for the money column', () => {
    render(<Harness initial={[]} actions={makeActions()} hint="Add each DJ." amountLabel="Rate" category="resident" label="Resident DJs" />);
    expect(screen.getByText('Add each DJ.')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Rate (R)' })).toBeTruthy();
    expect(screen.getByLabelText('New Resident DJs rate')).toBeTruthy();
  });

  it('shows rate, rider and total columns for headline acts', () => {
    const act = lineItem({ id: 7, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 800 });
    render(<Harness initial={[act]} category="headline" label="Headline Acts" actions={makeActions()} />);
    expect(screen.getByRole('columnheader', { name: 'Rate (R)' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Rider cost (R)' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Total' })).toBeTruthy();
    const header = screen.getByRole('heading', { name: 'Headline Acts' }).parentElement!;
    expect(txt(header)).toContain(`Rate ${zar(5000)} + Rider ${zar(800)} = ${zar(5800)}`);
    expect(txt(screen.getByLabelText('Rate for DJ Max').closest('tr'))).toContain(zar(5800));
  });
});

describe('editing a line', () => {
  it('saves a changed name when the field loses focus and merges the result into the list', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const onChange = vi.fn();
    render(<Harness initial={[mc, graphics]} actions={actions} onChange={onChange} />);
    const name = screen.getAllByLabelText('Name')[0]!;
    await user.clear(name);
    await user.type(name, 'Master of Ceremonies');
    await user.tab();
    await waitFor(() => expect(actions.update).toHaveBeenCalledTimes(1));
    expect(actions.update).toHaveBeenCalledWith(1, { category: 'standard', name: 'Master of Ceremonies', amount: 1000, riderCost: undefined, notes: 'Host' });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall![0].map((i: LineItem) => i.name)).toEqual(['Master of Ceremonies', 'Graphics']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('saves a changed amount and notes', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    const amount = screen.getByLabelText('Amount for MC');
    await user.clear(amount);
    await user.type(amount, '1200.5');
    await user.tab();
    await waitFor(() => expect(actions.update).toHaveBeenCalledWith(1, { category: 'standard', name: 'MC', amount: 1200.5, riderCost: undefined, notes: 'Host' }));
    const notes = screen.getByLabelText('Notes for MC');
    await user.clear(notes);
    await user.type(notes, 'Two sets');
    await user.tab();
    await waitFor(() => expect(actions.update).toHaveBeenLastCalledWith(1, expect.objectContaining({ amount: 1200.5, notes: 'Two sets' })));
  });

  it('does not call the server when nothing changed', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    await user.click(screen.getByLabelText('Amount for MC'));
    await user.tab();
    await user.click(screen.getByLabelText('Name'));
    await user.tab();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('does not call the server when only surrounding spaces were added to the notes', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    await user.type(screen.getByLabelText('Notes for MC'), '  ');
    await user.tab();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('refuses an empty name', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    await user.clear(screen.getByLabelText('Name'));
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter a name and an amount of 0 or more');
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('refuses a missing or negative amount', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    const amount = screen.getByLabelText('Amount for MC');
    await user.clear(amount);
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter a name and an amount of 0 or more');
    await user.type(amount, '-5');
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter a name and an amount of 0 or more');
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('shows the server error when saving fails, then clears it after a good save', async () => {
    const user = userEvent.setup();
    const update = vi.fn().mockRejectedValueOnce(new Error('Name already used')).mockImplementation(async (id: number, i: ItemInput) => lineItem({ id, category: 'standard', name: i.name, amount: i.amount }));
    render(<Harness initial={[mc]} actions={makeActions({ update })} />);
    const amount = screen.getByLabelText('Amount for MC');
    await user.clear(amount);
    await user.type(amount, '900');
    await user.tab();
    expect((await screen.findByRole('alert')).textContent).toBe('Name already used');
    await user.click(amount);
    await user.tab();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('follows values that change from outside the row', () => {
    const actions = makeActions();
    const { rerender } = render(<CategorySection actions={actions} category="standard" label="Standard Costs" color="#000" items={[mc]} onItemsChange={() => undefined} />);
    rerender(
      <CategorySection
        actions={actions}
        category="standard"
        label="Standard Costs"
        color="#000"
        items={[{ ...mc, name: 'Emcee', amount: 1500, notes: 'Updated' }]}
        onItemsChange={() => undefined}
      />,
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Emcee');
    expect((screen.getByLabelText('Amount for Emcee') as HTMLInputElement).value).toBe('1500');
    expect((screen.getByLabelText('Notes for Emcee') as HTMLInputElement).value).toBe('Updated');
  });
});

describe('removing a line', () => {
  it('asks first, then removes it', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc, graphics]} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Remove MC' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove "MC"?');
    await waitFor(() => expect(screen.queryByLabelText('Amount for MC')).toBeNull());
    expect(actions.remove).toHaveBeenCalledWith(1);
    expect(screen.getByLabelText('Amount for Graphics')).toBeTruthy();
  });

  it('keeps the line when the prompt is declined', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Remove MC' }));
    expect(actions.remove).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Amount for MC')).toBeTruthy();
  });

  it('keeps the line and shows the error when the server refuses', async () => {
    const user = userEvent.setup();
    const remove = vi.fn().mockRejectedValue(new Error('Cannot remove'));
    render(<Harness initial={[mc]} actions={makeActions({ remove })} />);
    await user.click(screen.getByRole('button', { name: 'Remove MC' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot remove');
    expect(screen.getByLabelText('Amount for MC')).toBeTruthy();
  });
});

describe('adding a line', () => {
  it('adds a line, empties the form and keeps the new line in the list', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[mc]} actions={actions} />);
    await user.type(screen.getByLabelText('New Standard Costs name'), 'Photographer');
    await user.type(screen.getByLabelText('New Standard Costs amount'), '750');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(actions.add).toHaveBeenCalledWith({ category: 'standard', name: 'Photographer', amount: 750, riderCost: undefined, notes: '' }));
    expect(await screen.findByLabelText('Amount for Photographer')).toBeTruthy();
    expect((screen.getByLabelText('New Standard Costs name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New Standard Costs amount') as HTMLInputElement).value).toBe('');
  });

  it('refuses a blank name', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[]} actions={actions} />);
    await user.type(screen.getByLabelText('New Standard Costs name'), '   ');
    await user.type(screen.getByLabelText('New Standard Costs amount'), '10');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a name and an amount of 0 or more');
    expect(actions.add).not.toHaveBeenCalled();
  });

  it('refuses a missing or negative amount', () => {
    const actions = makeActions();
    render(<Harness initial={[]} actions={actions} />);
    const form = screen.getByRole('form', { name: 'Add a line to Standard Costs' });
    fireEvent.change(screen.getByLabelText('New Standard Costs name'), { target: { value: 'Banner' } });
    fireEvent.submit(form);
    expect(screen.getByRole('alert').textContent).toBe('Enter a name and an amount of 0 or more');
    fireEvent.change(screen.getByLabelText('New Standard Costs amount'), { target: { value: '-3' } });
    fireEvent.submit(form);
    expect(screen.getByRole('alert').textContent).toBe('Enter a name and an amount of 0 or more');
    expect(actions.add).not.toHaveBeenCalled();
  });

  it('shows the server error and keeps what was typed', async () => {
    const user = userEvent.setup();
    const add = vi.fn().mockRejectedValue(new Error('Duplicate line'));
    render(<Harness initial={[]} actions={makeActions({ add })} />);
    await user.type(screen.getByLabelText('New Standard Costs name'), 'MC');
    await user.type(screen.getByLabelText('New Standard Costs amount'), '10');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Duplicate line');
    expect((screen.getByLabelText('New Standard Costs name') as HTMLInputElement).value).toBe('MC');
  });

  it('clears an earlier error after a successful add', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[]} actions={actions} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Add a line to Standard Costs' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.type(screen.getByLabelText('New Standard Costs name'), 'MC');
    await user.type(screen.getByLabelText('New Standard Costs amount'), '10');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('headline acts and hosts (rate plus rider cost)', () => {
  const act = lineItem({ id: 7, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 800 });
  const props = { category: 'headline' as const, label: 'Headline Acts' };

  it('adds an act with a rate and a rider cost of zero', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[]} actions={actions} {...props} />);
    await user.type(screen.getByLabelText('New Headline Acts name'), 'Black Coffee');
    await user.type(screen.getByLabelText('New Headline Acts rate'), '90000');
    await user.type(screen.getByLabelText('New Headline Acts rider cost'), '0');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(actions.add).toHaveBeenCalledWith({ category: 'headline', name: 'Black Coffee', amount: 90000, riderCost: 0, notes: '' }));
  });

  it('refuses an act without a rider cost', () => {
    const actions = makeActions();
    render(<Harness initial={[]} actions={actions} {...props} />);
    fireEvent.change(screen.getByLabelText('New Headline Acts name'), { target: { value: 'Black Coffee' } });
    fireEvent.change(screen.getByLabelText('New Headline Acts rate'), { target: { value: '100' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add a line to Headline Acts' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a name, a rate and a rider cost (enter 0 if there is no rider)');
    expect(actions.add).not.toHaveBeenCalled();
  });

  it('keeps the rate plus rider as the row total while typing', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[act]} actions={makeActions()} {...props} />);
    const row = screen.getByLabelText('Rate for DJ Max').closest('tr')!;
    expect(txt(row)).toContain(zar(5800));
    await user.clear(screen.getByLabelText('Rider cost for DJ Max'));
    await user.type(screen.getByLabelText('Rider cost for DJ Max'), '1000');
    expect(txt(row)).toContain(zar(6000));
    await user.clear(screen.getByLabelText('Rate for DJ Max'));
    expect(txt(row)).toContain(zar(1000));
    await user.clear(screen.getByLabelText('Rider cost for DJ Max'));
    expect(txt(row)).toContain(zar(0));
  });

  it('saves a changed rider cost together with the rate', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[act]} actions={actions} {...props} />);
    const rider = screen.getByLabelText('Rider cost for DJ Max');
    await user.clear(rider);
    await user.type(rider, '950');
    await user.tab();
    await waitFor(() => expect(actions.update).toHaveBeenCalledWith(7, { category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 950, notes: '' }));
  });

  it('refuses a missing rider cost with a message that names the rate and rider', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Harness initial={[act]} actions={actions} {...props} />);
    await user.clear(screen.getByLabelText('Rider cost for DJ Max'));
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter a name, a rate and a rider cost (0 or more)');
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('has no rider calculator unless rider tools are given', () => {
    render(<Harness initial={[act]} actions={makeActions()} {...props} />);
    expect(screen.queryByRole('button', { name: /Rider calculator/ })).toBeNull();
  });
});

describe('rider calculator on a line', () => {
  const tools: RiderTools = {
    prices: [{ id: 1, name: 'Water', cost: 10 }],
    load: vi.fn(async (id: number) => riderCalc(id, 'x', [{ name: 'Water', unitCost: 10, quantity: 3, total: 30 }])),
    save: vi.fn(async (id: number, lines) => ({
      item: { ...lineItem({ id, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 40, riderItems: lines.length }), weekId: 1 },
      rider: riderCalc(id, 'DJ Max'),
    })),
  };
  const props = { category: 'headline' as const, label: 'Headline Acts', rider: tools };

  it('offers "Calculate" for a typed-in rider and opens and closes the calculator', async () => {
    const user = userEvent.setup();
    const act = lineItem({ id: 7, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 800 });
    render(<Harness initial={[act]} actions={makeActions()} {...props} />);
    const button = screen.getByRole('button', { name: 'Rider calculator for DJ Max' });
    expect(button.textContent).toBe('Calculate');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect((screen.getByLabelText('Rider cost for DJ Max') as HTMLInputElement).readOnly).toBe(false);
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByRole('group', { name: 'Rider calculator for DJ Max' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('group', { name: 'Rider calculator for DJ Max' })).toBeNull();
    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole('group', { name: 'Rider calculator for DJ Max' })).toBeNull();
  });

  it('shows how many items a calculated rider has and locks the rider cost', () => {
    const one = lineItem({ id: 7, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 30, riderItems: 1 });
    const many = lineItem({ id: 8, category: 'headline', name: 'Zee', amount: 100, riderCost: 60, riderItems: 3 });
    render(<Harness initial={[one, many]} actions={makeActions()} {...props} />);
    expect(screen.getByRole('button', { name: 'Rider calculator for DJ Max' }).textContent).toBe('Rider: 1 item');
    expect(screen.getByRole('button', { name: 'Rider calculator for Zee' }).textContent).toBe('Rider: 3 items');
    const rider = screen.getByLabelText('Rider cost for DJ Max') as HTMLInputElement;
    expect(rider.readOnly).toBe(true);
    expect(rider.title).toBe('Worked out in the rider calculator');
  });

  it('puts the saved rider cost on the line', async () => {
    const user = userEvent.setup();
    const act = lineItem({ id: 7, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 800 });
    const onChange = vi.fn();
    render(<Harness initial={[act]} actions={makeActions()} onChange={onChange} {...props} />);
    await user.click(screen.getByRole('button', { name: 'Rider calculator for DJ Max' }));
    await screen.findByRole('group', { name: 'Rider calculator for DJ Max' });
    await user.type(screen.getByLabelText('Item'), 'Water');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall![0][0]).toMatchObject({ id: 7, riderCost: 40, riderItems: 1, amount: 5000 });
    expect(screen.queryByRole('group', { name: 'Rider calculator for DJ Max' })).toBeNull();
  });
});

describe('choosing rider items while adding a headline act or host', () => {
  const makeTools = (save?: RiderTools['save']): RiderTools => ({
    prices: [
      { id: 1, name: 'Water', cost: 10 },
      { id: 2, name: 'Red Bull', cost: 35.5 },
    ],
    load: vi.fn(async (id: number) => riderCalc(id, 'x')),
    save: vi.fn(
      save ??
        (async (id: number, lines) => ({
          item: { ...lineItem({ id, category: 'headline', name: 'Black Coffee', amount: 90000, riderCost: 0, riderItems: lines.length }), riderCost: 111, weekId: 1 },
          rider: riderCalc(id, 'Black Coffee'),
        })),
    ),
  });
  const props = { category: 'headline' as const, label: 'Headline Acts' };
  const toggle = () => screen.getByRole('button', { name: 'Rider items for new Headline Acts' });
  const riderField = () => screen.getByLabelText('New Headline Acts rider cost') as HTMLInputElement;

  async function pickItems(user: ReturnType<typeof userEvent.setup>) {
    await user.click(toggle());
    await screen.findByRole('group');
    const form = screen.getByRole('form', { name: /Add an item to the rider/ });
    const item = within(form).getByLabelText('Item');
    await user.type(item, 'Water');
    await user.clear(within(form).getByLabelText('How many'));
    await user.type(within(form).getByLabelText('How many'), '3');
    await user.click(within(form).getByRole('button', { name: 'Add item' }));
    await user.type(item, 'Red Bull');
    await user.click(within(form).getByRole('button', { name: 'Add item' }));
  }

  it('offers no rider items button without rider tools, or for other categories', () => {
    const { unmount } = render(<Harness initial={[]} actions={makeActions()} {...props} />);
    expect(screen.queryByRole('button', { name: /Rider items for new/ })).toBeNull();
    unmount();
    render(<Harness initial={[]} actions={makeActions()} category="standard" label="Standard Costs" rider={makeTools()} />);
    expect(screen.queryByRole('button', { name: /Rider items for new/ })).toBeNull();
  });

  it('opens and closes the picker, offering the price list', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={[]} actions={makeActions()} rider={makeTools()} {...props} />);
    expect(toggle().textContent).toBe('Choose rider items');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle());
    expect(await screen.findByRole('group', { name: 'Rider calculator for new Headline Acts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use these items' })).toBeTruthy();
    expect([...container.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toContain('Red Bull');
    await user.click(toggle());
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('names the picker after the booking being typed', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} actions={makeActions()} rider={makeTools()} {...props} />);
    await user.type(screen.getByLabelText('New Headline Acts name'), '  Black Coffee ');
    await user.click(toggle());
    expect(await screen.findByRole('group', { name: 'Rider calculator for Black Coffee' })).toBeTruthy();
  });

  it('fills in the rider cost from the chosen items and keeps them when reopened', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} actions={makeActions()} rider={makeTools()} {...props} />);
    await pickItems(user);
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(riderField().value).toBe('65.5');
    expect(riderField().readOnly).toBe(true);
    expect(riderField().title).toBe('Worked out from the rider items');
    expect(toggle().textContent).toBe('Rider: 2 items');
    await user.click(toggle());
    expect((await screen.findByLabelText('How many Water') as HTMLInputElement).value).toBe('3');
  });

  it('drops the chosen items again when they are cleared', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} actions={makeActions()} rider={makeTools()} {...props} />);
    await pickItems(user);
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    await user.click(toggle());
    await user.click(await screen.findByRole('button', { name: 'Clear items' }));
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    expect(toggle().textContent).toBe('Choose rider items');
    expect(riderField().readOnly).toBe(false);
  });

  it('says "1 item" for a single chosen item', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} actions={makeActions()} rider={makeTools()} {...props} />);
    await user.click(toggle());
    await screen.findByRole('group');
    await user.type(screen.getByLabelText('Item'), 'Water');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    expect(toggle().textContent).toBe('Rider: 1 item');
    expect(riderField().value).toBe('10');
  });

  it('adds the booking, then saves its rider items and shows the rider cost', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const tools = makeTools();
    const onChange = vi.fn();
    render(<Harness initial={[]} actions={actions} rider={tools} onChange={onChange} {...props} />);
    await user.type(screen.getByLabelText('New Headline Acts name'), 'Black Coffee');
    await user.type(screen.getByLabelText('New Headline Acts rate'), '90000');
    await pickItems(user);
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(tools.save).toHaveBeenCalledTimes(1));
    expect(actions.add).toHaveBeenCalledWith({ category: 'headline', name: 'Black Coffee', amount: 90000, riderCost: 65.5, notes: '' });
    expect(tools.save).toHaveBeenCalledWith(99, [
      { name: 'Water', unitCost: 10, quantity: 3 },
      { name: 'Red Bull', unitCost: 35.5, quantity: 1 },
    ]);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall![0][0]).toMatchObject({ id: 99, amount: 90000, riderCost: 111, riderItems: 2 });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('New Headline Acts name') as HTMLInputElement).value).toBe('');
    expect(riderField().value).toBe('');
    expect(riderField().readOnly).toBe(false);
    expect(toggle().textContent).toBe('Choose rider items');
  });

  it('adds a booking with no chosen items as before, without saving a rider', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const tools = makeTools();
    render(<Harness initial={[]} actions={actions} rider={tools} {...props} />);
    await user.type(screen.getByLabelText('New Headline Acts name'), 'Black Coffee');
    await user.type(screen.getByLabelText('New Headline Acts rate'), '90000');
    await user.type(riderField(), '250');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(actions.add).toHaveBeenCalledWith({ category: 'headline', name: 'Black Coffee', amount: 90000, riderCost: 250, notes: '' }));
    expect(tools.save).not.toHaveBeenCalled();
  });

  it('keeps the booking and says so when the rider items cannot be saved', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const tools = makeTools(async () => Promise.reject(new Error('Server said no')));
    const onChange = vi.fn();
    render(<Harness initial={[]} actions={actions} rider={tools} onChange={onChange} {...props} />);
    await user.type(screen.getByLabelText('New Headline Acts name'), 'Black Coffee');
    await user.type(screen.getByLabelText('New Headline Acts rate'), '90000');
    await pickItems(user);
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Black Coffee was added, but its rider items could not be saved (Server said no). Press Calculate on its line to try again.',
    );
    expect(onChange.mock.lastCall![0]).toHaveLength(1);
    expect(onChange.mock.lastCall![0][0]).toMatchObject({ id: 99, riderCost: 65.5 });
    expect((screen.getByLabelText('New Headline Acts name') as HTMLInputElement).value).toBe('');
    expect(toggle().textContent).toBe('Choose rider items');
  });

  it('keeps the chosen items when the booking itself cannot be added', async () => {
    const user = userEvent.setup();
    const actions = makeActions({ add: vi.fn().mockRejectedValue(new Error('Week is closed')) });
    const tools = makeTools();
    render(<Harness initial={[]} actions={actions} rider={tools} {...props} />);
    await user.type(screen.getByLabelText('New Headline Acts name'), 'Black Coffee');
    await user.type(screen.getByLabelText('New Headline Acts rate'), '90000');
    await pickItems(user);
    await user.click(screen.getByRole('button', { name: 'Use these items' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Week is closed');
    expect(tools.save).not.toHaveBeenCalled();
    expect(toggle().textContent).toBe('Rider: 2 items');
  });
});
