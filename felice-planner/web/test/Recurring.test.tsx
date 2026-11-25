import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecurringPage } from '../src/pages/Recurring.tsx';
import { lineItem } from './fixtures.ts';
import { deferred, fail, mockApi, renderOrgPage, txt, xlsx, zar } from './helpers.tsx';
import type { LineItem } from '../../shared/types.ts';

const items: LineItem[] = [
  lineItem({ id: 1, category: 'standard', name: 'MC', amount: 1000 }),
  lineItem({ id: 2, category: 'social', name: 'Instagram', amount: 500 }),
  lineItem({ id: 3, category: 'hosts', name: 'Host Hannah', amount: 800, riderCost: 200 }),
  lineItem({ id: 4, category: 'resident', name: 'DJ Neo', amount: 650, isDj: true }),
  lineItem({ id: 5, category: 'resident', name: 'Old lump', amount: 9999 }),
];
const totalLine = () => txt(document.querySelector('.week-total-line'));

describe('RecurringPage', () => {
  it('explains what recurring costs do and shows what is added to each new week', async () => {
    mockApi({ 'GET /orgs/felice/recurring': items });
    renderOrgPage(<RecurringPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Recurring costs/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Felice logo' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Standard Costs' })).toBeTruthy();
    // 1000 + 500 + (800 + 200) + 650; the lump-sum line is ignored because an individual DJ exists.
    expect(totalLine()).toBe(`Added to each new week: ${zar(3150)}`);
    expect(screen.getByText(/new weeks only/)).toBeTruthy();
  });

  it('counts a lump-sum Resident DJs line while there are no individual DJs', async () => {
    mockApi({ 'GET /orgs/felice/recurring': [items[0]!, items[4]!] });
    renderOrgPage(<RecurringPage />);
    await screen.findByRole('region', { name: 'Standard Costs' });
    expect(totalLine()).toBe(`Added to each new week: ${zar(10999)}`);
  });

  it('offers the categories that can recur, but not headline acts', async () => {
    mockApi({ 'GET /orgs/felice/recurring': [] });
    renderOrgPage(<RecurringPage />);
    await screen.findByRole('region', { name: 'Standard Costs' });
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(['How this works', 'Resident DJs', 'Import resident DJs from a file', 'Rider Costs', 'Standard Costs', 'Physical Marketing', 'Social Media', 'Hosts & Promoters']);
  });

  it('shows "Loading…" first', async () => {
    const pending = deferred<LineItem[]>();
    mockApi({ 'GET /orgs/felice/recurring': () => pending.promise.then((i) => i) });
    renderOrgPage(<RecurringPage />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(screen.queryByRole('region', { name: 'Standard Costs' })).toBeNull();
    pending.resolve([]);
    await screen.findByRole('region', { name: 'Standard Costs' });
  });

  it('shows the error when the list cannot be loaded', async () => {
    mockApi({ 'GET /orgs/felice/recurring': fail(500, 'Cannot load recurring') });
    renderOrgPage(<RecurringPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot load recurring');
    expect(screen.queryByRole('region', { name: 'Standard Costs' })).toBeNull();
    expect(totalLine()).toBe(`Added to each new week: ${zar(0)}`);
  });

  it('adds a recurring cost and raises the total', async () => {
    const mock = mockApi({
      'GET /orgs/felice/recurring': [items[0]!],
      'POST /orgs/felice/recurring': (c) => ({ id: 20, ...(c.body as object), isDj: false, riderCost: 0 }),
    });
    const { user } = renderOrgPage(<RecurringPage />);
    await screen.findByRole('region', { name: 'Standard Costs' });
    await user.type(screen.getByLabelText('New Standard Costs name'), 'Photographer');
    await user.type(screen.getByLabelText('New Standard Costs amount'), '750');
    await user.click(within(screen.getByRole('form', { name: 'Add a line to Standard Costs' })).getByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('Amount for Photographer')).toBeTruthy();
    expect(mock.of('POST', '/orgs/felice/recurring')[0]!.body).toEqual({ category: 'standard', name: 'Photographer', amount: 750, notes: '' });
    expect(totalLine()).toBe(`Added to each new week: ${zar(1750)}`);
  });

  it('changes and removes a recurring cost', async () => {
    const mock = mockApi({
      'GET /orgs/felice/recurring': [items[0]!],
      'PUT /orgs/felice/recurring/1': (c) => ({ id: 1, isDj: false, riderCost: 0, ...(c.body as object) }),
      'DELETE /orgs/felice/recurring/1': undefined,
    });
    const { user } = renderOrgPage(<RecurringPage />);
    const amount = await screen.findByLabelText('Amount for MC');
    await user.clear(amount);
    await user.type(amount, '1500');
    await user.tab();
    await waitFor(() => expect(totalLine()).toBe(`Added to each new week: ${zar(1500)}`));
    expect(mock.of('PUT', '/orgs/felice/recurring/1')[0]!.body).toMatchObject({ category: 'standard', name: 'MC', amount: 1500 });
    await user.click(screen.getByRole('button', { name: 'Remove MC' }));
    await waitFor(() => expect(totalLine()).toBe(`Added to each new week: ${zar(0)}`));
    expect(mock.of('DELETE', '/orgs/felice/recurring/1')).toHaveLength(1);
  });

  it('adds a resident DJ through the DJ endpoint', async () => {
    const mock = mockApi({
      'GET /orgs/felice/recurring': [items[0]!],
      'POST /orgs/felice/recurring/resident-djs': (c) => ({ id: 30, category: 'resident', isDj: true, riderCost: 0, amount: (c.body as { rate: number }).rate, name: (c.body as { name: string }).name, notes: '' }),
    });
    const { user } = renderOrgPage(<RecurringPage />);
    await user.type(await screen.findByLabelText('New Resident DJs name'), 'DJ Neo');
    await user.type(screen.getByLabelText('New Resident DJs rate'), '650');
    await user.click(within(screen.getByRole('form', { name: 'Add a line to Resident DJs' })).getByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('Rate for DJ Neo')).toBeTruthy();
    expect(mock.of('POST', '/orgs/felice/recurring/resident-djs')[0]!.body).toEqual({ name: 'DJ Neo', rate: 650, notes: '' });
    // The other recurring costs stay as they were.
    expect(screen.getByLabelText('Amount for MC')).toBeTruthy();
    expect(totalLine()).toBe(`Added to each new week: ${zar(1650)}`);
  });

  it('imports resident DJs from a file and then loads the list again', async () => {
    const result = { applied: false, rows: [{ name: 'Neo', rate: 650, notes: '', status: 'new', currentRate: null }], added: 1, updated: 0, unchanged: 0, total: 650, warnings: [] };
    const mock = mockApi({
      'GET /orgs/felice/recurring': [],
      'POST /orgs/felice/recurring/resident-djs/import': (c) => ({ ...result, applied: c.query.dryRun === '0' }),
    });
    const { user } = renderOrgPage(<RecurringPage />);
    await screen.findByRole('region', { name: 'Standard Costs' });
    const card = screen.getByRole('region', { name: 'Import resident DJs from a file' });
    await user.upload(within(card).getByLabelText('File'), xlsx('djs.xlsx'));
    await user.click(within(card).getByRole('button', { name: 'Preview' }));
    mock.set({ 'GET /orgs/felice/recurring': [items[3]!] });
    await user.click(await within(card).findByRole('button', { name: 'Import 1 DJ' }));
    expect(await screen.findByLabelText('Rate for DJ Neo')).toBeTruthy();
    expect(mock.of('GET', '/orgs/felice/recurring')).toHaveLength(2);
    expect(mock.of('POST', '/orgs/felice/recurring/resident-djs/import').map((c) => c.query.dryRun)).toEqual(['1', '0']);
  });
});
