import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Item, PaymentSchedule, WeekDetail } from '../../shared/types.ts';
import { PlannerPage } from '../src/pages/Planner.tsx';
import { line, riderCalc, weekDetail, weekSummary } from './fixtures.ts';
import { deferred, empty, fail, freezeToday, mockApi, parts, renderOrgPage, txt, zar, type MockApi, type Route, type Routes_ } from './helpers.tsx';

const WEEKS = [
  weekSummary({ id: 4, year: 2025, month: 12, weekNo: 4, total: 900 }),
  weekSummary({ id: 5, year: 2026, month: 5, weekNo: 1, total: 4000 }),
  weekSummary({ id: 6, year: 2026, month: 5, weekNo: 2, total: 1500 }),
  weekSummary({ id: 7, year: 2026, month: 6, weekNo: 1, total: 0 }),
];

const PATTERNS = ['planner', 'planner/:weekId'];
const empty_schedule = (weekId: number): PaymentSchedule => ({ weekId, label: 'x', batchSize: 5, batches: [], count: 0, total: 0 });

const act = (over: Partial<Item> = {}) => line({ id: 10, weekId: 5, category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 800, ...over });
const standard = (over: Partial<Item> = {}) => line({ id: 11, weekId: 5, category: 'standard', name: 'MC', amount: 1000, ...over });
const resident = (over: Partial<Item> = {}) => line({ id: 12, weekId: 5, category: 'resident', name: 'DJ Neo', amount: 650, isDj: true, ...over });
const lump = (over: Partial<Item> = {}) => line({ id: 13, weekId: 5, category: 'resident', name: 'Old lump', amount: 9000, ...over });

function detail(items: Item[] = [], over: Partial<WeekDetail> = {}) {
  return weekDetail({ id: 5, year: 2026, month: 5, weekNo: 1, items, ...over });
}

function install(week: Route = detail([standard(), act(), resident()]), extra: Routes_ = {}): MockApi {
  return mockApi({
    'GET /orgs/felice/weeks': WEEKS,
    'GET /orgs/felice/weeks/5': week,
    'GET /orgs/felice/rider-prices': [{ id: 1, name: 'Water', cost: 10 }],
    'GET /orgs/felice/weeks/5/payment-schedule': empty_schedule(5),
    ...extra,
  });
}

const open = (id = 5) => renderOrgPage(<PlannerPage />, { url: `/o/felice/planner/${id}`, patterns: PATTERNS });
const weekList = () => screen.getByRole('complementary', { name: 'Weeks' });
const location = () => screen.getByTestId('location').textContent;

describe('the week list', () => {
  it('asks for the pick-a-week message when no week is open, and shows the latest year', async () => {
    freezeToday('2026-06-15T10:00:00');
    install();
    renderOrgPage(<PlannerPage />, { url: '/o/felice/planner', patterns: PATTERNS });
    expect(screen.getByRole('heading', { level: 1, name: /Weekly planner/ })).toBeTruthy();
    expect(screen.getByText('Choose a week on the left, or add a new one.')).toBeTruthy();
    expect(within(weekList()).getByRole('status').textContent).toBe('Loading…');
    const june = await within(weekList()).findByRole('heading', { name: 'June' });
    expect(june).toBeTruthy();
    expect((screen.getByLabelText('Year') as HTMLSelectElement).value).toBe('2026');
  });

  it('groups the weeks of the year by month and links each to its editor', async () => {
    install();
    open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    expect(within(weekList()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['May', 'June', 'Add a week to 2026']);
    const link = within(weekList()).getByRole('link', { name: /Week 2/ });
    expect(link.getAttribute('href')).toBe('/o/felice/planner/6');
    expect(parts(link)).toEqual(['Week 2', zar(1500)]);
  });

  it('offers this year plus every year that has weeks, newest first', async () => {
    freezeToday('2026-06-15T10:00:00');
    install();
    open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    const year = screen.getByLabelText('Year') as HTMLSelectElement;
    expect([...year.options].map((o) => o.value)).toEqual(['2026', '2025']);
  });

  it('shows the year of the open week and lets you look at another year', async () => {
    freezeToday('2026-06-15T10:00:00');
    install(detail([], { id: 4, year: 2025, month: 12, weekNo: 4 }), { 'GET /orgs/felice/weeks/4': detail([], { id: 4, year: 2025, month: 12, weekNo: 4 }), 'GET /orgs/felice/weeks/4/payment-schedule': empty_schedule(4) });
    const { user } = open(4);
    await within(weekList()).findByRole('heading', { name: 'December' });
    expect((screen.getByLabelText('Year') as HTMLSelectElement).value).toBe('2025');
    await user.selectOptions(screen.getByLabelText('Year'), '2026');
    expect(await within(weekList()).findByRole('heading', { name: 'May' })).toBeTruthy();
    expect(within(weekList()).getByRole('heading', { name: 'Add a week to 2026' })).toBeTruthy();
  });

  it('says a year has no weeks yet', async () => {
    freezeToday('2027-02-01T10:00:00');
    install();
    const { user } = open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    await user.selectOptions(screen.getByLabelText('Year'), '2027');
    expect(within(weekList()).getByText('No weeks in this year yet.')).toBeTruthy();
    expect(within(weekList()).getByRole('heading', { name: 'Add a week to 2027' })).toBeTruthy();
  });

  it('uses this year when no weeks exist at all', async () => {
    freezeToday('2026-06-15T10:00:00');
    install(undefined, { 'GET /orgs/felice/weeks': [] });
    open();
    await within(weekList()).findByText('No weeks in this year yet.');
    expect((screen.getByLabelText('Year') as HTMLSelectElement).value).toBe('2026');
  });

  it('shows the error when the weeks cannot be loaded', async () => {
    install(undefined, { 'GET /orgs/felice/weeks': fail(500, 'Weeks failed') });
    open();
    expect((await screen.findByRole('alert')).textContent).toBe('Weeks failed');
  });
});

describe('adding a week', () => {
  const form = () => within(weekList()).getByRole('heading', { name: /Add a week to/ }).closest('form')!;

  it('defaults to this month and week 1, ready to copy the recurring costs', async () => {
    freezeToday('2026-07-15T10:00:00');
    install();
    open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    expect((within(form()).getByLabelText('Month') as HTMLSelectElement).value).toBe('7');
    expect((within(form()).getByLabelText('Week') as HTMLSelectElement).value).toBe('1');
    expect((within(form()).getByLabelText('Add the recurring costs') as HTMLInputElement).checked).toBe(true);
    expect(within(form()).queryByText(/already exists/)).toBeNull();
  });

  it('creates the week, reloads the list and opens it', async () => {
    freezeToday('2026-07-15T10:00:00');
    const mock = install(undefined, {
      'POST /orgs/felice/weeks': (c: { body: unknown }) => ({ ...detail([], { id: 99, month: 7, weekNo: 3 }), ...(c.body as object), id: 99 }),
      'GET /orgs/felice/weeks/99': detail([], { id: 99, month: 7, weekNo: 3 }),
      'GET /orgs/felice/weeks/99/payment-schedule': empty_schedule(99),
    });
    const { user } = open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    await user.selectOptions(within(form()).getByLabelText('Week'), '3');
    await user.click(within(form()).getByLabelText('Add the recurring costs'));
    await user.click(within(form()).getByRole('button', { name: 'Add week' }));
    await waitFor(() => expect(location()).toBe('/o/felice/planner/99'));
    expect(mock.of('POST', '/orgs/felice/weeks')[0]!.body).toEqual({ year: 2026, month: 7, weekNo: 3, copyRecurring: false });
    await waitFor(() => expect(mock.of('GET', '/orgs/felice/weeks').length).toBeGreaterThanOrEqual(2));
    await screen.findByRole('heading', { name: 'July 2026 W3' });
  });

  it('sends the month that was chosen', async () => {
    freezeToday('2026-07-15T10:00:00');
    const mock = install(undefined, {
      'POST /orgs/felice/weeks': detail([], { id: 99 }),
      'GET /orgs/felice/weeks/99': detail([], { id: 99 }),
      'GET /orgs/felice/weeks/99/payment-schedule': empty_schedule(99),
    });
    const { user } = open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    await user.selectOptions(within(form()).getByLabelText('Month'), '9');
    await user.click(within(form()).getByRole('button', { name: 'Add week' }));
    await waitFor(() => expect(mock.of('POST', '/orgs/felice/weeks')).toHaveLength(1));
    expect(mock.of('POST', '/orgs/felice/weeks')[0]!.body).toMatchObject({ month: 9, weekNo: 1, copyRecurring: true });
  });

  it('will not add a week that already exists', async () => {
    freezeToday('2026-05-15T10:00:00');
    install();
    open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    expect(within(form()).getByText('May 2026 W1 already exists.')).toBeTruthy();
    expect((within(form()).getByRole('button', { name: 'Add week' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server error and stays on the same page', async () => {
    freezeToday('2026-07-15T10:00:00');
    install(undefined, { 'POST /orgs/felice/weeks': fail(409, 'Week already exists') });
    const { user } = open();
    await within(weekList()).findByRole('heading', { name: 'May' });
    await user.click(within(form()).getByRole('button', { name: 'Add week' }));
    expect((await within(form()).findByRole('alert')).textContent).toBe('Week already exists');
    expect(location()).toBe('/o/felice/planner/5');
    expect((within(form()).getByRole('button', { name: 'Add week' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the week editor', () => {
  it('shows the week heading, month and total, leaving out a lump-sum line that no longer counts', async () => {
    install(detail([standard(), act(), resident(), lump()]));
    open();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Loading…')).toBe(true);
    expect(await screen.findByRole('heading', { name: 'May 2026 W1' })).toBeTruthy();
    const header = screen.getByRole('heading', { name: 'May 2026 W1' }).closest('.week-header')!;
    expect(txt(header.querySelector('p'))).toBe('May 2026');
    // 1000 + (5000 + 800) + 650; the 9000 lump-sum line is ignored.
    expect(parts(header.querySelector('.week-total'))).toEqual(['Week total', zar(7450)]);
  });

  it('shows every category, with the rider hint on Rider Costs and the DJ list for Resident DJs', async () => {
    install();
    open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    expect(screen.getByRole('region', { name: 'Headline Acts' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Resident DJs' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Rider Costs' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Hosts & Promoters' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Payment schedule' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Import resident DJs from a file' })).toBeTruthy();
    expect(screen.getByText(/Rider costs captured on headline acts and hosts are included/)).toBeTruthy();
    expect(screen.getAllByText(/Rider costs captured on headline acts/)).toHaveLength(1);
  });

  it('shows "Loading…" and then the week', async () => {
    const pending = deferred<WeekDetail>();
    install(undefined, { 'GET /orgs/felice/weeks/5': () => pending.promise.then((w) => w) });
    open();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Loading…')).toBe(true);
    pending.resolve(detail([]));
    await screen.findByRole('heading', { name: 'May 2026 W1' });
  });

  it('shows the error when the week cannot be loaded', async () => {
    install(undefined, { 'GET /orgs/felice/weeks/5': fail(404, 'Week not found on the server') });
    open();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual(['Week not found on the server']);
  });

  it('says the week was not found when the server sends nothing', async () => {
    install(undefined, { 'GET /orgs/felice/weeks/5': empty() });
    open();
    expect((await screen.findByRole('alert')).textContent).toBe('Week not found');
  });

  it('adds a line to the week and refreshes the list totals', async () => {
    const mock = install(detail([standard()]), {
      'POST /orgs/felice/weeks/5/items': (c: { body: unknown }) => ({ id: 50, weekId: 5, isDj: false, riderCost: 0, ...(c.body as object) }),
    });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    const before = mock.of('GET', '/orgs/felice/weeks').length;
    await user.type(screen.getByLabelText('New Social Media name'), 'Instagram');
    await user.type(screen.getByLabelText('New Social Media amount'), '500');
    await user.click(within(screen.getByRole('form', { name: 'Add a line to Social Media' })).getByRole('button', { name: 'Add' }));
    expect(await screen.findByLabelText('Amount for Instagram')).toBeTruthy();
    expect(mock.of('POST', '/orgs/felice/weeks/5/items')[0]!.body).toEqual({ category: 'social', name: 'Instagram', amount: 500, notes: '' });
    await waitFor(() => expect(mock.of('GET', '/orgs/felice/weeks').length).toBe(before + 1));
    expect(txt(document.querySelector('.week-total'))).toContain(zar(1500));
  });

  it('saves a changed line and removes a line', async () => {
    const mock = install(detail([standard()]), {
      'PUT /orgs/felice/items/11': (c: { body: unknown }) => ({ id: 11, weekId: 5, isDj: false, riderCost: 0, ...(c.body as object) }),
      'DELETE /orgs/felice/items/11': undefined,
    });
    const { user } = open();
    const amount = await screen.findByLabelText('Amount for MC');
    await user.clear(amount);
    await user.type(amount, '1200');
    await user.tab();
    await waitFor(() => expect(txt(document.querySelector('.week-total'))).toContain(zar(1200)));
    expect(mock.of('PUT', '/orgs/felice/items/11')[0]!.body).toMatchObject({ category: 'standard', name: 'MC', amount: 1200 });
    await user.click(screen.getByRole('button', { name: 'Remove MC' }));
    await waitFor(() => expect(txt(document.querySelector('.week-total'))).toContain(zar(0)));
    expect(mock.of('DELETE', '/orgs/felice/items/11')).toHaveLength(1);
  });

  it('adds a resident DJ and reads the payment schedule again', async () => {
    const schedule = (count: number): PaymentSchedule => ({
      weekId: 5,
      label: 'May 2026 W1',
      batchSize: 5,
      count,
      total: count * 650,
      batches: count ? [{ batchNo: 1, total: 650, payments: [{ no: 1, name: 'DJ Neo', amount: 650, notes: '' }] }] : [],
    });
    const mock = install(detail([standard()]), {
      'GET /orgs/felice/weeks/5/payment-schedule': () => schedule(mockDjs.length),
      'POST /orgs/felice/weeks/5/resident-djs': (c: { body: { name: string; rate: number } }) => {
        mockDjs.push(c.body.name);
        return { id: 60, weekId: 5, category: 'resident', isDj: true, riderCost: 0, notes: '', name: c.body.name, amount: c.body.rate };
      },
    });
    const mockDjs: string[] = [];
    const { user } = open();
    await screen.findByText('Add resident DJs to this week to generate a schedule.');
    await user.type(screen.getByLabelText('New Resident DJs name'), 'DJ Neo');
    await user.type(screen.getByLabelText('New Resident DJs rate'), '650');
    await user.click(within(screen.getByRole('form', { name: 'Add a line to Resident DJs' })).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Batch 1 of 1')).toBeTruthy();
    expect(mock.of('POST', '/orgs/felice/weeks/5/resident-djs')[0]!.body).toEqual({ name: 'DJ Neo', rate: 650, notes: '' });
    expect(mock.of('GET', '/orgs/felice/weeks/5/payment-schedule')).toHaveLength(2);
    // The other lines of the week stay as they were.
    expect(screen.getByLabelText('Amount for MC')).toBeTruthy();
    expect(txt(document.querySelector('.week-total'))).toContain(zar(1650));
  });

  it('imports resident DJs from a file and then loads the week and list again', async () => {
    const importResult = { applied: false, rows: [{ name: 'Neo', rate: 650, notes: '', status: 'new', currentRate: null }], added: 1, updated: 0, unchanged: 0, total: 650, warnings: [] };
    const mock = install(detail([], { notes: 'Before import' }), {
      'POST /orgs/felice/weeks/5/resident-djs/import': (c: { query: Record<string, string> }) => ({ ...importResult, applied: c.query.dryRun === '0' }),
    });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    const card = screen.getByRole('region', { name: 'Import resident DJs from a file' });
    await user.upload(within(card).getByLabelText('File'), new File(['x'], 'djs.csv', { type: 'text/csv' }));
    await user.click(within(card).getByRole('button', { name: 'Preview' }));
    const weeksBefore = mock.of('GET', '/orgs/felice/weeks').length;
    const weekBefore = mock.of('GET', '/orgs/felice/weeks/5').length;
    mock.set({ 'GET /orgs/felice/weeks/5': detail([resident()], { notes: 'After import' }) });
    await user.click(await within(card).findByRole('button', { name: 'Import 1 DJ' }));
    await waitFor(() => expect(mock.of('GET', '/orgs/felice/weeks/5').length).toBe(weekBefore + 1));
    // The notes box and the DJ list follow the reloaded week.
    await waitFor(() => expect((screen.getByLabelText('Week notes') as HTMLTextAreaElement).value).toBe('After import'));
    expect(await screen.findByLabelText('Rate for DJ Neo')).toBeTruthy();
    expect(mock.of('GET', '/orgs/felice/weeks').length).toBe(weeksBefore + 1);
  });

  it('works with a rider calculator on headline acts and hosts only', async () => {
    const mock = install(detail([act({ riderCost: 120, riderItems: 2 }), standard()]), {
      'GET /orgs/felice/items/10/rider': riderCalc(10, 'DJ Max', [
        { name: 'Water', unitCost: 10, quantity: 12, total: 120 },
      ]),
      'PUT /orgs/felice/items/10/rider': (c: { body: { lines: { name: string; unitCost: number; quantity: number }[] } }) => ({
        item: act({ riderCost: c.body.lines.reduce((s, l) => s + l.unitCost * l.quantity, 0), riderItems: c.body.lines.length }),
        rider: riderCalc(10, 'DJ Max'),
      }),
    });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    expect(screen.queryByRole('button', { name: 'Rider calculator for MC' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Rider calculator for DJ Max' }));
    const calc = await screen.findByRole('group', { name: 'Rider calculator for DJ Max' });
    expect((within(calc).getByLabelText('How many Water') as HTMLInputElement).value).toBe('12');
    expect(mock.of('GET', '/orgs/felice/items/10/rider')).toHaveLength(1);
    const qty = within(calc).getByLabelText('How many Water');
    await user.clear(qty);
    await user.type(qty, '20');
    await user.click(within(calc).getByRole('button', { name: 'Save rider cost' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Rider calculator for DJ Max' })).toBeNull());
    expect(mock.of('PUT', '/orgs/felice/items/10/rider')[0]!.body).toEqual({ lines: [{ name: 'Water', unitCost: 10, quantity: 20 }] });
    expect(txt(document.querySelector('.week-total'))).toContain(zar(5000 + 200 + 1000));
  });

  it('copies a rider onto other headline acts and hosts, and the week total follows', async () => {
    const host = line({ id: 14, weekId: 5, category: 'hosts', name: 'Xoli', amount: 800, riderCost: 0 });
    const mock = install(detail([act({ riderCost: 120, riderItems: 2 }), host, standard()]), {
      'POST /orgs/felice/items/10/rider/copy': [{ ...host, riderCost: 120, riderItems: 2 }],
    });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    expect(screen.queryByRole('button', { name: 'Copy rider of Xoli' })).toBeNull();
    expect(txt(document.querySelector('.week-total'))).toContain(zar(5000 + 120 + 800 + 1000));
    await user.click(screen.getByRole('button', { name: 'Copy rider of DJ Max' }));
    const panel = screen.getByRole('group', { name: 'Copy the rider of DJ Max' });
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(1);
    await user.click(within(panel).getByRole('checkbox', { name: /^Xoli/ }));
    await user.click(within(panel).getByRole('button', { name: 'Copy rider' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Copy the rider of DJ Max' })).toBeNull());
    expect(mock.of('POST', '/orgs/felice/items/10/rider/copy')[0]!.body).toEqual({ toItemIds: [14] });
    expect((screen.getByLabelText('Rider cost for Xoli') as HTMLInputElement).value).toBe('120');
    expect(screen.getByRole('button', { name: 'Rider calculator for Xoli' }).textContent).toBe('Rider: 2 items');
    expect(screen.getByRole('button', { name: 'Copy rider of Xoli' })).toBeTruthy();
    expect(txt(document.querySelector('.week-total'))).toContain(zar(5000 + 120 + 800 + 120 + 1000));
  });

  it('works without prices when the price list cannot be loaded', async () => {
    install(detail([act()]), { 'GET /orgs/felice/rider-prices': fail(500, 'No prices') });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    await user.click(screen.getByRole('button', { name: 'Rider calculator for DJ Max' }));
    expect(await screen.findByText(/The price list is empty/)).toBeTruthy();
  });
});

describe('deleting a week', () => {
  it('asks first, deletes the week, reloads the list and goes back to the planner', async () => {
    const mock = install(undefined, { 'DELETE /orgs/felice/weeks/5': undefined });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    const before = mock.of('GET', '/orgs/felice/weeks').length;
    await user.click(screen.getByRole('button', { name: 'Delete week' }));
    expect(window.confirm).toHaveBeenCalledWith("Delete May 2026 W1 and all its lines? This can't be undone.");
    await waitFor(() => expect(location()).toBe('/o/felice/planner'));
    expect(mock.of('DELETE', '/orgs/felice/weeks/5')).toHaveLength(1);
    expect(mock.of('GET', '/orgs/felice/weeks').length).toBe(before + 1);
    expect(screen.getByText('Choose a week on the left, or add a new one.')).toBeTruthy();
  });

  it('keeps the week when the prompt is declined', async () => {
    const mock = install();
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    vi.mocked(window.confirm).mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Delete week' }));
    expect(mock.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    expect(location()).toBe('/o/felice/planner/5');
  });

  it('shows the server error and stays', async () => {
    install(undefined, { 'DELETE /orgs/felice/weeks/5': fail(500, 'Cannot delete week') });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    await user.click(screen.getByRole('button', { name: 'Delete week' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot delete week');
    expect(location()).toBe('/o/felice/planner/5');
  });
});

describe('week notes', () => {
  it('shows the saved notes', async () => {
    install(detail([], { notes: 'Bring extra ice' }));
    open();
    expect(((await screen.findByLabelText('Week notes')) as HTMLTextAreaElement).value).toBe('Bring extra ice');
  });

  it('saves changed notes when the field loses focus', async () => {
    const mock = install(detail([], { notes: 'Old' }), { 'PATCH /orgs/felice/weeks/5': (c: { body: { notes: string } }) => detail([], { notes: c.body.notes }) });
    const { user } = open();
    const notes = await screen.findByLabelText('Week notes');
    await user.clear(notes);
    await user.type(notes, 'New plan');
    await user.tab();
    await waitFor(() => expect(mock.of('PATCH', '/orgs/felice/weeks/5')).toHaveLength(1));
    expect(mock.of('PATCH', '/orgs/felice/weeks/5')[0]!.body).toEqual({ notes: 'New plan' });
    await waitFor(() => expect(document.querySelector('.notes [role="status"]')!.textContent).toBe('Notes saved'));
  });

  it('does not save when the notes did not change', async () => {
    const mock = install(detail([], { notes: 'Same' }));
    const { user } = open();
    await user.click(await screen.findByLabelText('Week notes'));
    await user.tab();
    expect(mock.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('shows the server error beside the notes', async () => {
    install(detail([], { notes: '' }), { 'PATCH /orgs/felice/weeks/5': fail(500, 'Notes too long') });
    const { user } = open();
    await user.type(await screen.findByLabelText('Week notes'), 'x');
    await user.tab();
    await waitFor(() => expect(document.querySelector('.notes [role="status"]')!.textContent).toBe('Notes too long'));
  });
});

describe('moving between weeks', () => {
  it('opens another week from the list', async () => {
    install(undefined, {
      'GET /orgs/felice/weeks/6': detail([], { id: 6, weekNo: 2 }),
      'GET /orgs/felice/weeks/6/payment-schedule': empty_schedule(6),
    });
    const { user } = open();
    await screen.findByRole('heading', { name: 'May 2026 W1' });
    await user.click(within(weekList()).getByRole('link', { name: /Week 2/ }));
    expect(await screen.findByRole('heading', { name: 'May 2026 W2' })).toBeTruthy();
    expect(location()).toBe('/o/felice/planner/6');
  });
});
