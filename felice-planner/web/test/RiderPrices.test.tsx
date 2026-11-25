import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RiderPrice, RiderPriceImportResult, RiderPriceImportRow } from '../../shared/types.ts';
import { RiderPricesPage } from '../src/pages/RiderPrices.tsx';
import { deferred, fail, mockApi, renderOrgPage, txt, xlsx, zar } from './helpers.tsx';

const PRICES: RiderPrice[] = [
  { id: 1, name: 'water', cost: 12.5 },
  { id: 2, name: 'Red Bull', cost: 35 },
];
const names = () => screen.getAllByLabelText('Item').map((i) => (i as HTMLInputElement).value);
const priceCard = () => screen.getByRole('region', { name: /^Price list/ });

describe('the price list', () => {
  it('explains how rider prices are used', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': PRICES });
    renderOrgPage(<RiderPricesPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Rider prices/ })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'How this works' })).toBeTruthy();
    await screen.findByRole('region', { name: 'Price list (2 items)' });
  });

  it('shows "Loading…" and then the items with their costs', async () => {
    const pending = deferred<RiderPrice[]>();
    mockApi({ 'GET /orgs/felice/rider-prices': () => pending.promise.then((p) => p) });
    renderOrgPage(<RiderPricesPage />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    pending.resolve(PRICES);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    expect(names()).toEqual(['water', 'Red Bull']);
    expect((screen.getByLabelText('Cost of water') as HTMLInputElement).value).toBe('12.5');
  });

  it('uses the singular for one item', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': [PRICES[0]!] });
    renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (1 item)' });
  });

  it('says the list is empty', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': [] });
    renderOrgPage(<RiderPricesPage />);
    const card = await screen.findByRole('region', { name: 'Price list (0 items)' });
    expect(within(card).getByText('The list is empty. Add items below, or import them from a file.')).toBeTruthy();
    expect(within(card).queryByRole('table')).toBeNull();
  });

  it('shows the error from the server', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': fail(500, 'Prices unavailable') });
    renderOrgPage(<RiderPricesPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Prices unavailable');
  });
});

describe('changing a price', () => {
  const route = (c: { body: unknown }) => ({ id: 1, ...(c.body as object) });

  it('saves a changed cost and keeps the list in name order', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES, 'PUT /orgs/felice/rider-prices/1': route });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    const cost = screen.getByLabelText('Cost of water');
    await user.clear(cost);
    await user.type(cost, '14');
    await user.tab();
    await waitFor(() => expect(mock.of('PUT', '/orgs/felice/rider-prices/1')).toHaveLength(1));
    expect(mock.of('PUT', '/orgs/felice/rider-prices/1')[0]!.body).toEqual({ name: 'water', cost: 14 });
    // "Red Bull" sorts before "water", ignoring case.
    await waitFor(() => expect(names()).toEqual(['Red Bull', 'water']));
    expect((screen.getByLabelText('Cost of water') as HTMLInputElement).value).toBe('14');
  });

  it('saves a renamed item', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES, 'PUT /orgs/felice/rider-prices/2': (c) => ({ id: 2, ...(c.body as object) }) });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    const name = screen.getAllByLabelText('Item')[1]!;
    await user.clear(name);
    await user.type(name, 'Soda');
    await user.tab();
    await waitFor(() => expect(mock.of('PUT', '/orgs/felice/rider-prices/2')[0]!.body).toEqual({ name: 'Soda', cost: 35 }));
    await waitFor(() => expect(names()).toEqual(['Soda', 'water']));
  });

  it('does not call the server when nothing changed', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.click(screen.getByLabelText('Cost of water'));
    await user.tab();
    expect(mock.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('refuses an empty name or a bad cost', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.clear(screen.getAllByLabelText('Item')[0]!);
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter an item and a cost of 0 or more');
    await user.type(screen.getAllByLabelText('Item')[0]!, 'water');
    await user.clear(screen.getByLabelText('Cost of water'));
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter an item and a cost of 0 or more');
    await user.type(screen.getByLabelText('Cost of water'), '-1');
    await user.tab();
    expect(screen.getByRole('alert').textContent).toBe('Enter an item and a cost of 0 or more');
    expect(mock.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('shows the server error, then clears it after a good save', async () => {
    let attempts = 0;
    mockApi({
      'GET /orgs/felice/rider-prices': PRICES,
      'PUT /orgs/felice/rider-prices/1': (c) => (++attempts === 1 ? fail(409, 'Name already in the list') : route(c)),
    });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    const cost = screen.getByLabelText('Cost of water');
    await user.clear(cost);
    await user.type(cost, '20');
    await user.tab();
    expect((await screen.findByRole('alert')).textContent).toBe('Name already in the list');
    await user.click(cost);
    await user.tab();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('removing a price', () => {
  it('asks first and removes the item', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES, 'DELETE /orgs/felice/rider-prices/1': undefined });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.click(screen.getByRole('button', { name: 'Remove water' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove "water" from the price list? Riders already worked out are not changed.');
    await screen.findByRole('region', { name: 'Price list (1 item)' });
    expect(mock.of('DELETE', '/orgs/felice/rider-prices/1')).toHaveLength(1);
  });

  it('keeps it when the prompt is declined', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    vi.mocked(window.confirm).mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Remove water' }));
    expect(mock.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    expect(names()).toHaveLength(2);
  });

  it('shows the server error and keeps the item', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': PRICES, 'DELETE /orgs/felice/rider-prices/1': fail(500, 'Cannot delete') });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.click(screen.getByRole('button', { name: 'Remove water' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot delete');
    expect(names()).toHaveLength(2);
  });
});

describe('adding a price', () => {
  const form = () => screen.getByRole('form', { name: 'Add an item to the price list' });

  it('adds an item, empties the form and lists it in order', async () => {
    const mock = mockApi({
      'GET /orgs/felice/rider-prices': PRICES,
      'POST /orgs/felice/rider-prices': (c) => ({ id: 9, ...(c.body as object) }),
    });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.type(screen.getByLabelText('New item'), 'Ice');
    await user.type(screen.getByLabelText('New item cost incl VAT'), '8.75');
    await user.click(within(form()).getByRole('button', { name: 'Add' }));
    await screen.findByRole('region', { name: 'Price list (3 items)' });
    expect(mock.of('POST', '/orgs/felice/rider-prices')[0]!.body).toEqual({ name: 'Ice', cost: 8.75 });
    expect(names()).toEqual(['Ice', 'Red Bull', 'water']);
    expect((screen.getByLabelText('New item') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New item cost incl VAT') as HTMLInputElement).value).toBe('');
  });

  it('adds the first item to an empty list', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': [], 'POST /orgs/felice/rider-prices': (c) => ({ id: 9, ...(c.body as object) }) });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    await user.type(screen.getByLabelText('New item'), 'Ice');
    await user.type(screen.getByLabelText('New item cost incl VAT'), '0');
    await user.click(within(form()).getByRole('button', { name: 'Add' }));
    await screen.findByRole('region', { name: 'Price list (1 item)' });
  });

  it('refuses a blank name or a missing or negative cost', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': PRICES });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.type(screen.getByLabelText('New item'), '  ');
    await user.type(screen.getByLabelText('New item cost incl VAT'), '5');
    await user.click(within(form()).getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter an item and a cost of 0 or more');
    await user.clear(screen.getByLabelText('New item'));
    await user.type(screen.getByLabelText('New item'), 'Ice');
    fireEvent.change(screen.getByLabelText('New item cost incl VAT'), { target: { value: '-2' } });
    fireEvent.submit(form());
    expect(screen.getByRole('alert').textContent).toBe('Enter an item and a cost of 0 or more');
    fireEvent.change(screen.getByLabelText('New item cost incl VAT'), { target: { value: '' } });
    fireEvent.submit(form());
    expect(screen.getByRole('alert').textContent).toBe('Enter an item and a cost of 0 or more');
    expect(mock.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('shows the server error and keeps what was typed', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': PRICES, 'POST /orgs/felice/rider-prices': fail(409, 'Already in the list') });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    await user.type(screen.getByLabelText('New item'), 'water');
    await user.type(screen.getByLabelText('New item cost incl VAT'), '1');
    await user.click(within(form()).getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Already in the list');
    expect((screen.getByLabelText('New item') as HTMLInputElement).value).toBe('water');
  });
});

describe('importing a price list', () => {
  const card = () => screen.getByRole('region', { name: 'Import price list' });
  const fileInput = () => within(card()).getByLabelText('File') as HTMLInputElement;
  const previewButton = () => within(card()).getByRole('button', { name: 'Preview' }) as HTMLButtonElement;
  const row = (name: string, cost: number, status: RiderPriceImportRow['status'], currentCost: number | null = null): RiderPriceImportRow => ({ name, cost, status, currentCost });
  const result = (rows: RiderPriceImportRow[], extra: Partial<RiderPriceImportResult> = {}): RiderPriceImportResult => ({
    applied: false,
    rows,
    added: rows.filter((r) => r.status === 'new').length,
    updated: rows.filter((r) => r.status === 'update').length,
    unchanged: rows.filter((r) => r.status === 'unchanged').length,
    warnings: [],
    ...extra,
  });

  it('links to the template and keeps Preview disabled until a file is chosen', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': [] });
    renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    expect(within(card()).getByRole('link', { name: 'Excel' }).getAttribute('href')).toBe('/api/templates/rider-prices');
    expect(previewButton().disabled).toBe(true);
  });

  it('checks the file without saving and shows what would happen to each item', async () => {
    const mock = mockApi({
      'GET /orgs/felice/rider-prices': PRICES,
      'POST /orgs/felice/rider-prices/import': result([row('Water', 14, 'update', 12.5), row('Ice', 8, 'new'), row('Red Bull', 35, 'unchanged', 35)], { warnings: ['Row 9 skipped'] }),
    });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (2 items)' });
    const file = xlsx('prices.xlsx');
    await user.upload(fileInput(), file);
    await user.click(previewButton());
    expect(await within(card()).findByText(/Found/)).toBeTruthy();
    expect(txt(within(card()).getByText(/Found/).closest('p'))).toBe('Found 3 items: 1 new, 1 to update, 1 unchanged.');
    expect(mock.of('POST', '/orgs/felice/rider-prices/import')[0]!.query).toEqual({ dryRun: '1' });
    expect(mock.of('POST', '/orgs/felice/rider-prices/import')[0]!.body).toBe(file);
    expect(txt(within(card()).getByRole('row', { name: /Water/ }))).toContain(`Updated (now ${zar(12.5)})`);
    expect(txt(within(card()).getByRole('row', { name: /Ice/ }))).toContain('Added');
    expect(txt(within(card()).getByRole('row', { name: /Red Bull/ }))).toContain('No change');
    expect(within(card()).getByText('1 thing to check')).toBeTruthy();
    expect(within(card()).getByRole('button', { name: 'Import 2 items' })).toBeTruthy();
  });

  it('uses plural warnings, a singular button and a zero current cost when unknown', async () => {
    mockApi({
      'GET /orgs/felice/rider-prices': [],
      'POST /orgs/felice/rider-prices/import': result([row('Ice', 8, 'update', null)], { warnings: ['a', 'b'] }),
    });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect(await within(card()).findByText('2 things to check')).toBeTruthy();
    expect(within(card()).getByRole('button', { name: 'Import 1 item' })).toBeTruthy();
    expect(txt(within(card()).getByRole('row', { name: /Ice/ }))).toContain(`Updated (now ${zar(0)})`);
  });

  it('has nothing to import when nothing changes', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': [], 'POST /orgs/felice/rider-prices/import': result([row('Ice', 8, 'unchanged', 8)]) });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    const button = (await within(card()).findByRole('button', { name: 'Nothing to import' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(card()).queryByText(/to check/)).toBeNull();
  });

  it('imports for real, reports the result, resets the file and loads the list again', async () => {
    const mock = mockApi({
      'GET /orgs/felice/rider-prices': [],
      'POST /orgs/felice/rider-prices/import': (c) => result([row('Ice', 8, 'new'), row('Water', 14, 'update', 12.5)], { applied: c.query.dryRun === '0' }),
    });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    mock.set({ 'GET /orgs/felice/rider-prices': [{ id: 5, name: 'Ice', cost: 8 }] });
    await user.click(await within(card()).findByRole('button', { name: 'Import 2 items' }));
    await screen.findByRole('region', { name: 'Price list (1 item)' });
    expect(within(card()).getByRole('status').textContent).toBe('Imported. 1 added, 1 updated, 0 unchanged.');
    expect(mock.of('POST', '/orgs/felice/rider-prices/import').map((c) => c.query.dryRun)).toEqual(['1', '0']);
    expect(fileInput().files).toHaveLength(0);
    expect(previewButton().disabled).toBe(true);
  });

  it('shows the error when the file cannot be read', async () => {
    mockApi({ 'GET /orgs/felice/rider-prices': [], 'POST /orgs/felice/rider-prices/import': fail(400, 'No Cost column') });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect((await within(card()).findByRole('alert')).textContent).toBe('No Cost column');
    expect(previewButton().disabled).toBe(false);
  });

  it('forgets a preview and a result when another file is chosen', async () => {
    mockApi({
      'GET /orgs/felice/rider-prices': [],
      'POST /orgs/felice/rider-prices/import': (c) => result([row('Ice', 8, 'new')], { applied: c.query.dryRun === '0' }),
    });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    await user.upload(fileInput(), xlsx('one.xlsx'));
    await user.click(previewButton());
    await within(card()).findByRole('button', { name: 'Import 1 item' });
    await user.upload(fileInput(), xlsx('two.xlsx'));
    expect(within(card()).queryByRole('button', { name: 'Import 1 item' })).toBeNull();
    await user.click(previewButton());
    await user.click(await within(card()).findByRole('button', { name: 'Import 1 item' }));
    await within(card()).findByText(/Imported\./);
    await user.upload(fileInput(), xlsx('three.xlsx'));
    expect(within(card()).queryByText(/Imported\./)).toBeNull();
  });

  it('does nothing when submitted with no file, and treats clearing the chooser as no file', async () => {
    const mock = mockApi({ 'GET /orgs/felice/rider-prices': [] });
    const { user } = renderOrgPage(<RiderPricesPage />);
    await screen.findByRole('region', { name: 'Price list (0 items)' });
    fireEvent.submit(fileInput().closest('form')!);
    expect(mock.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await user.upload(fileInput(), xlsx());
    expect(previewButton().disabled).toBe(false);
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(previewButton().disabled).toBe(true);
  });
});
