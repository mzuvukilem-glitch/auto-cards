import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Item, RiderCalc, RiderPrice } from '../../shared/types.ts';
import type { RiderLineInput } from '../src/api.ts';
import { RiderCalculator, type RiderTools } from '../src/RiderCalculator.tsx';
import { line, riderCalc } from './fixtures.ts';
import { deferred, txt, zar } from './helpers.tsx';

const PRICES: RiderPrice[] = [
  { id: 1, name: 'Water', cost: 12.5 },
  { id: 2, name: 'Red Bull', cost: 35 },
];

function setup({
  prices = PRICES,
  calc,
  item = { id: 7, name: 'DJ Max', riderCost: 0, riderItems: 0 },
  load,
  save,
}: {
  prices?: RiderPrice[];
  calc?: RiderCalc;
  item?: { id: number; name: string; riderCost: number; riderItems?: number };
  load?: RiderTools['load'];
  save?: RiderTools['save'];
} = {}) {
  const tools = {
    prices,
    load: vi.fn(load ?? (async () => calc ?? riderCalc(item.id, item.name))),
    save: vi.fn(
      save ??
        (async (id: number, lines: RiderLineInput[]) => ({
          item: line({ id, category: 'headline', name: item.name, riderCost: lines.reduce((s, l) => s + l.unitCost * l.quantity, 0), riderItems: lines.length }),
          rider: riderCalc(id, item.name),
        })),
    ),
  } satisfies RiderTools;
  const onSaved = vi.fn<(item: Item) => void>();
  const onClose = vi.fn();
  const user = userEvent.setup();
  const view = render(<RiderCalculator item={item} tools={tools} onSaved={onSaved} onClose={onClose} />);
  return { tools, onSaved, onClose, user, ...view };
}

const addForm = () => screen.getByRole('form', { name: 'Add an item to the rider for DJ Max' });
const itemInput = () => within(addForm()).getByLabelText('Item') as HTMLInputElement;
const costInput = () => within(addForm()).getByLabelText('Cost incl VAT (R)') as HTMLInputElement;
const qtyInput = () => within(addForm()).getByLabelText('How many') as HTMLInputElement;
const lines = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

async function addItem(user: ReturnType<typeof userEvent.setup>, name: string, cost: string, qty = '1') {
  await user.clear(itemInput());
  await user.type(itemInput(), name);
  await user.clear(costInput());
  if (cost) await user.type(costInput(), cost);
  await user.clear(qtyInput());
  if (qty) await user.type(qtyInput(), qty);
  await user.click(screen.getByRole('button', { name: 'Add item' }));
}

describe('opening the calculator', () => {
  it('starts empty for a rider that was typed in, without asking the server', async () => {
    const { tools } = setup({ item: { id: 7, name: 'DJ Max', riderCost: 800, riderItems: 0 } });
    expect(await screen.findByRole('group', { name: 'Rider calculator for DJ Max' })).toBeTruthy();
    expect(tools.load).not.toHaveBeenCalled();
    expect(screen.queryByRole('table')).toBeNull();
    expect(txt(screen.getByRole('group'))).toContain(`The rider cost is ${zar(800)}, typed in. Saving a rider here replaces it`);
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(0)}`);
    expect(screen.queryByText(/Saving with no items/)).toBeNull();
  });

  it('does not mention a typed-in cost when there is none', async () => {
    setup();
    await screen.findByRole('group');
    expect(screen.queryByText(/typed in/)).toBeNull();
  });

  it('shows "Loading…" and then the saved items of a calculated rider', async () => {
    const pending = deferred<RiderCalc>();
    const { tools } = setup({
      item: { id: 7, name: 'DJ Max', riderCost: 60, riderItems: 2 },
      load: () => pending.promise,
    });
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(tools.load).toHaveBeenCalledWith(7);
    pending.resolve(
      riderCalc(7, 'DJ Max', [
        { name: 'Water', unitCost: 10, quantity: 2, total: 20 },
        { name: 'Red Bull', unitCost: 40, quantity: 1, total: 40 },
      ]),
    );
    expect(await screen.findByRole('group')).toBeTruthy();
    expect(lines()).toHaveLength(2);
    expect((screen.getByLabelText('How many Water') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Cost of Red Bull') as HTMLInputElement).value).toBe('40');
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(60)}`);
    expect(screen.queryByText(/typed in/)).toBeNull();
  });

  it('shows the error when the saved rider cannot be read', async () => {
    setup({ item: { id: 7, name: 'DJ Max', riderCost: 60, riderItems: 2 }, load: async () => Promise.reject(new Error('Rider not found')) });
    expect((await screen.findByRole('alert')).textContent).toBe('Rider not found');
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('ignores a late answer after it has been closed', async () => {
    const pending = deferred<RiderCalc>();
    const { unmount } = setup({ item: { id: 7, name: 'DJ Max', riderCost: 60, riderItems: 2 }, load: () => pending.promise });
    unmount();
    await act(async () => pending.resolve(riderCalc(7, 'DJ Max')));
  });

  it('ignores a late failure after it has been closed', async () => {
    const pending = deferred<RiderCalc>();
    const { unmount } = setup({ item: { id: 7, name: 'DJ Max', riderCost: 60, riderItems: 2 }, load: () => pending.promise });
    unmount();
    await act(async () => pending.reject(new Error('late')));
  });

  it('reads the rider again when it is opened for another booking', async () => {
    const { tools, rerender } = setup({ item: { id: 7, name: 'DJ Max', riderCost: 60, riderItems: 1 }, calc: riderCalc(7, 'DJ Max', [{ name: 'Water', unitCost: 10, quantity: 1, total: 10 }]) });
    await screen.findByRole('group');
    rerender(<RiderCalculator item={{ id: 8, name: 'Zee', riderCost: 5, riderItems: 1 }} tools={tools} onSaved={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(tools.load).toHaveBeenCalledWith(8));
  });

  it('points to the Rider prices page when the price list is empty', async () => {
    setup({ prices: [] });
    await screen.findByRole('group');
    expect(screen.getByText(/The price list is empty/)).toBeTruthy();
    expect(itemInput().placeholder).toBe('Type an item');
  });

  it('invites you to choose from the price list when it has items', async () => {
    const { container } = setup();
    await screen.findByRole('group');
    expect(itemInput().placeholder).toBe('Choose or type an item');
    expect(screen.queryByText(/The price list is empty/)).toBeNull();
    expect([...container.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['Water', 'Red Bull']);
  });
});

describe('adding items', () => {
  it('lists every price list item to pick from, whatever has been typed, and turns off saved-entry suggestions', async () => {
    const { user } = setup({ item: { id: 7, name: 'DJ Max', riderCost: 800, riderItems: 0 } });
    await screen.findByRole('group');
    const picker = within(addForm()).getByLabelText('Choose from the price list') as HTMLSelectElement;
    expect([...picker.options].map((o) => txt(o))).toEqual(['Choose from the price list', `Water (${zar(12.5)})`, `Red Bull (${zar(35)})`]);
    expect(picker.options[0]!.disabled).toBe(true);
    expect(itemInput().getAttribute('autocomplete')).toBe('off');
    await user.type(itemInput(), 'zzz');
    expect(picker.options).toHaveLength(3);
  });

  it('fills in the item and its cost when one is picked from the list, and goes back to the prompt', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    const picker = within(addForm()).getByLabelText('Choose from the price list') as HTMLSelectElement;
    await user.selectOptions(picker, 'Red Bull');
    expect(itemInput().value).toBe('Red Bull');
    expect(costInput().value).toBe('35');
    expect(picker.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(lines()).toHaveLength(1);
  });

  it('has no list to pick from when the price list is empty', async () => {
    setup({ prices: [] });
    await screen.findByRole('group');
    expect(screen.queryByLabelText('Choose from the price list')).toBeNull();
  });

  it('fills in the listed cost when a price list item is chosen, whatever its case', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await user.type(itemInput(), '  water ');
    expect(costInput().value).toBe('12.5');
    await user.clear(itemInput());
    await user.type(itemInput(), 'Something else');
    expect(costInput().value).toBe('12.5');
  });

  it('adds a listed item under its price list name', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await addItem(user, 'red bull', '35', '4');
    const [row] = lines();
    expect((within(row!).getByLabelText('Item') as HTMLInputElement).value).toBe('Red Bull');
    expect(txt(row!)).toContain(zar(140));
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(140)}`);
    expect(itemInput().value).toBe('');
    expect(costInput().value).toBe('');
    expect(qtyInput().value).toBe('1');
  });

  it('adds an item that is not on the price list, using the typed name', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await addItem(user, '  Towels ', '20', '3');
    expect((within(lines()[0]!).getByLabelText('Item') as HTMLInputElement).value).toBe('Towels');
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(60)}`);
  });

  it('adds up the quantity when the same item at the same cost is added again', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await addItem(user, 'Water', '12.5', '2');
    await addItem(user, 'WATER', '12.5', '3');
    expect(lines()).toHaveLength(1);
    expect((screen.getByLabelText('How many Water') as HTMLInputElement).value).toBe('5');
  });

  it('adds to the matching line and leaves the other lines alone', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await addItem(user, 'Water', '12.5', '2');
    await addItem(user, 'Red Bull', '35', '1');
    await addItem(user, 'Water', '12.5', '1');
    expect(lines()).toHaveLength(2);
    expect((screen.getByLabelText('How many Water') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('How many Red Bull') as HTMLInputElement).value).toBe('1');
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(72.5)}`);
  });

  it('keeps a separate line for the same item at a different cost', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await addItem(user, 'Water', '12.5', '2');
    await addItem(user, 'Water', '15', '1');
    expect(lines()).toHaveLength(2);
  });

  it('counts a line whose quantity was blanked as zero when merging', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await addItem(user, 'Water', '12.5', '2');
    await user.clear(screen.getByLabelText('How many Water'));
    await addItem(user, 'Water', '12.5', '4');
    expect((screen.getByLabelText('How many Water') as HTMLInputElement).value).toBe('4');
  });

  it('asks for an item when the name is blank', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert').textContent).toBe('Choose or type an item');
    await user.type(itemInput(), '   ');
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert').textContent).toBe('Choose or type an item');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('asks for a cost when an unlisted item has none', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await user.type(itemInput(), 'Towels');
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert').textContent).toBe('Towels is not in the price list, so enter its cost');
  });

  it('asks for a valid cost when a listed item has a cost that is cleared or negative', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    await user.type(itemInput(), 'Water');
    await user.clear(costInput());
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert').textContent).toBe('Enter a cost of 0 or more');
    fireEvent.change(costInput(), { target: { value: '-4' } });
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert').textContent).toBe('Enter a cost of 0 or more');
  });

  it.each(['0', '1.5', '10000', ''])('asks for a whole number of 1 or more when how many is "%s"', async (qty) => {
    const { user } = setup();
    await screen.findByRole('group');
    await user.type(itemInput(), 'Water');
    fireEvent.change(qtyInput(), { target: { value: qty } });
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert').textContent).toBe('Enter a whole number of 1 or more for how many');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('clears an earlier problem after a good add', async () => {
    const { user } = setup();
    await screen.findByRole('group');
    fireEvent.submit(addForm());
    expect(screen.getByRole('alert')).toBeTruthy();
    await addItem(user, 'Water', '12.5');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('editing the items', () => {
  const calc = riderCalc(7, 'DJ Max', [{ name: 'Water', unitCost: 10, quantity: 2, total: 20 }]);
  const item = { id: 7, name: 'DJ Max', riderCost: 20, riderItems: 1 };

  it('recalculates the line total and rider total as the cost and quantity change', async () => {
    const { user } = setup({ calc, item });
    await screen.findByRole('group');
    const cost = screen.getByLabelText('Cost of Water');
    await user.clear(cost);
    await user.type(cost, '10.55');
    const qty = screen.getByLabelText('How many Water');
    await user.clear(qty);
    await user.type(qty, '3');
    expect(txt(lines()[0]!)).toContain(zar(31.65));
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(31.65)}`);
  });

  it('shows a dash and leaves the line out of the total while a cost or quantity is invalid', async () => {
    const { user } = setup({ calc, item });
    await screen.findByRole('group');
    await user.clear(screen.getByLabelText('Cost of Water'));
    expect(within(lines()[0]!).getAllByRole('cell')[3]!.textContent).toBe('–');
    expect(txt(screen.getByRole('group'))).toContain(`Rider cost for DJ Max: ${zar(0)}`);
    await user.type(screen.getByLabelText('Cost of Water'), '10');
    await user.clear(screen.getByLabelText('How many Water'));
    expect(within(lines()[0]!).getAllByRole('cell')[3]!.textContent).toBe('–');
  });

  it('renames an item', async () => {
    const { user } = setup({ calc, item });
    await screen.findByRole('group');
    const name = within(lines()[0]!).getByLabelText('Item');
    await user.clear(name);
    await user.type(name, 'Still water');
    expect((screen.getByLabelText('Cost of Still water') as HTMLInputElement).value).toBe('10');
  });

  it('removes an item', async () => {
    const { user } = setup({ calc, item });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Remove Water' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Saving with no items sets the rider cost to R0,00.')).toBeTruthy();
  });

  it('clears every item at once', async () => {
    const { user } = setup({ calc, item });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Clear items' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear items' })).toBeNull();
  });
});

describe('saving', () => {
  const calc = riderCalc(7, 'DJ Max', [
    { name: 'Water', unitCost: 10, quantity: 2, total: 20 },
    { name: 'Red Bull', unitCost: 35, quantity: 1, total: 35 },
  ]);
  const item = { id: 7, name: 'DJ Max', riderCost: 55, riderItems: 2 };

  it('sends the items, then hands the updated booking back and closes', async () => {
    const { user, tools, onSaved, onClose } = setup({ calc, item });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(tools.save).toHaveBeenCalledWith(7, [
      { name: 'Water', unitCost: 10, quantity: 2 },
      { name: 'Red Bull', unitCost: 35, quantity: 1 },
    ]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 7, riderCost: 55, riderItems: 2 }));
  });

  it('trims item names before sending', async () => {
    const { user, tools } = setup({ calc: riderCalc(7, 'DJ Max', [{ name: 'Water', unitCost: 10, quantity: 1, total: 10 }]), item: { ...item, riderItems: 1 } });
    await screen.findByRole('group');
    const name = within(lines()[0]!).getByLabelText('Item');
    await user.clear(name);
    await user.type(name, '  Ice  ');
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    await waitFor(() => expect(tools.save).toHaveBeenCalled());
    expect(tools.save.mock.calls[0]![1]).toEqual([{ name: 'Ice', unitCost: 10, quantity: 1 }]);
  });

  it('saves an empty rider (rider cost back to zero)', async () => {
    const { user, tools, onClose } = setup({ calc, item });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Clear items' }));
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(tools.save).toHaveBeenCalledWith(7, []);
  });

  it('will not save an item without a name', async () => {
    const { user, tools } = setup({ calc, item });
    await screen.findByRole('group');
    await user.clear(within(lines()[0]!).getByLabelText('Item'));
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    expect(screen.getByRole('alert').textContent).toBe('Every item needs a name');
    expect(tools.save).not.toHaveBeenCalled();
  });

  it('will not save an item without a cost', async () => {
    const { user, tools } = setup({ calc, item });
    await screen.findByRole('group');
    await user.clear(screen.getByLabelText('Cost of Water'));
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a cost of 0 or more for Water');
    expect(tools.save).not.toHaveBeenCalled();
  });

  it('will not save an item with a bad quantity', async () => {
    const { user, tools } = setup({ calc, item });
    await screen.findByRole('group');
    await user.clear(screen.getByLabelText('How many Red Bull'));
    await user.type(screen.getByLabelText('How many Red Bull'), '0');
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a whole number of 1 or more for how many Red Bull');
    expect(tools.save).not.toHaveBeenCalled();
  });

  it('shows the server error, stays open and lets you try again', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Server said no')).mockResolvedValue({ item: line({ id: 7, category: 'headline', name: 'DJ Max' }), rider: riderCalc(7, 'DJ Max') });
    const { user, onClose } = setup({ calc, item, save });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Server said no');
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Save rider cost' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables saving while the request is in flight', async () => {
    const pending = deferred<{ item: Item; rider: RiderCalc }>();
    const { user } = setup({ calc, item, save: () => pending.promise });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Save rider cost' }));
    expect((screen.getByRole('button', { name: 'Save rider cost' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ item: line({ id: 7, category: 'headline', name: 'DJ Max' }), rider: riderCalc(7, 'DJ Max') }));
  });

  it('closes without saving', async () => {
    const { user, tools, onClose } = setup({ calc, item });
    await screen.findByRole('group');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tools.save).not.toHaveBeenCalled();
  });
});
