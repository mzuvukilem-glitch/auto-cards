import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App.tsx';
import { summaryReport, varianceReport, compareReport, side } from './fixtures.ts';
import { ORGS, deferred, fail, freezeToday, mockApi, type MockApi } from './helpers.tsx';

/** Every read a page makes when it first opens, answered with "nothing yet". */
const quiet = {
  'GET /auth/me': { authenticated: true },
  'GET /orgs': ORGS,
  'POST /auth/logout': { ok: true },
  'GET /master/summary': summaryReport(),
  'GET /master/top': [],
  'GET /master/variance': varianceReport(),
  'GET /master/resident-bookings': { from: '', to: '', months: [], rows: [], totals: { bookings: 0, paid: 0, byMonth: {} } },
  'GET /master/compare': compareReport({ a: side({ key: 'a', label: 'A' }), b: side({ key: 'b', label: 'B' }) }),
  'GET /orgs/felice/reports/summary': summaryReport(),
  'GET /orgs/felice/reports/top': [],
  'GET /orgs/felice/reports/variance': varianceReport(),
  'GET /orgs/felice/reports/resident-bookings': { from: '', to: '', months: [], rows: [], totals: { bookings: 0, paid: 0, byMonth: {} } },
  'GET /orgs/felice/weeks': [],
  'GET /orgs/felice/weeks/5': { id: 5, orgId: 1, year: 2026, month: 5, weekNo: 1, notes: '', items: [] },
  'GET /orgs/felice/weeks/5/payment-schedule': { weekId: 5, label: '', batchSize: 5, batches: [], count: 0, total: 0 },
  'GET /orgs/felice/rider-prices': [],
  'GET /orgs/felice/recurring': [],
  'GET /orgs/felice/actuals': [],
};

function mount(url = '/', routes: Record<string, unknown> = {}): MockApi & { user: ReturnType<typeof userEvent.setup>; container: HTMLElement } {
  const mock = mockApi({ ...quiet, ...routes });
  const user = userEvent.setup();
  const { container } = render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  );
  return { ...mock, user, container };
}

describe('signing in and out', () => {
  it('shows nothing while it checks whether you are signed in', async () => {
    const pending = deferred<{ authenticated: boolean }>();
    const { container } = mount('/', { 'GET /auth/me': () => pending.promise.then((r) => r) });
    expect(container.textContent).toBe('');
    expect(screen.queryByLabelText('Password')).toBeNull();
    pending.resolve({ authenticated: false });
    expect(await screen.findByLabelText('Password')).toBeTruthy();
  });

  it('shows the sign-in page when there is no session', async () => {
    mount('/', { 'GET /auth/me': { authenticated: false } });
    expect(await screen.findByLabelText('Password')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows the sign-in page when the session check fails', async () => {
    mount('/', { 'GET /auth/me': fail(500, 'Server down') });
    expect(await screen.findByLabelText('Password')).toBeTruthy();
  });

  it('signs in and then shows the app', async () => {
    const { user, calls } = mount('/', { 'GET /auth/me': { authenticated: false }, 'POST /auth/login': { ok: true } });
    await user.type(await screen.findByLabelText('Password'), 's3cret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: /Master dashboard/ })).toBeTruthy();
    expect(calls.find((c) => c.path === '/auth/login')!.body).toEqual({ password: 's3cret' });
  });

  it('signs out, telling the server, and returns to the sign-in page', async () => {
    const { user, of } = mount('/');
    await screen.findByRole('heading', { name: /Master dashboard/ });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Password')).toBeTruthy();
    expect(of('POST', '/auth/logout')).toHaveLength(1);
  });

  it('signs out even when the server cannot be reached', async () => {
    const { user } = mount('/', { 'POST /auth/logout': fail(500, 'Nope') });
    await screen.findByRole('heading', { name: /Master dashboard/ });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Password')).toBeTruthy();
  });

  it('goes back to the sign-in page when the session expires mid-use', async () => {
    const mock = mount('/o/felice/planner');
    await screen.findByRole('heading', { name: /Weekly planner/ });
    mock.set({ 'GET /orgs/felice/weeks': fail(401, 'Session expired') });
    await mock.user.click(screen.getByRole('link', { name: 'Compare' }));
    expect(await screen.findByLabelText('Password')).toBeTruthy();
  });
});

describe('loading the organisations', () => {
  it('shows nothing until they arrive', async () => {
    const pending = deferred<typeof ORGS>();
    const { container } = mount('/', { 'GET /orgs': () => pending.promise.then((o) => o) });
    await waitFor(() => expect(screen.queryByLabelText('Password')).toBeNull());
    expect(container.textContent).toBe('');
    pending.resolve(ORGS);
    expect(await screen.findByRole('navigation', { name: 'Organisation' })).toBeTruthy();
  });

  it('shows the error if they cannot be loaded', async () => {
    mount('/', { 'GET /orgs': fail(500, 'Cannot list organisations') });
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot list organisations');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('the sidebar', () => {
  it('shows the brand, a skip link and the organisation switcher', async () => {
    mount('/');
    const switcher = await screen.findByRole('navigation', { name: 'Organisation' });
    expect(screen.getByText('Planner').closest('.brand')!.textContent).toBe('Alur & FelicePlanner');
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
    expect(screen.getByRole('main').id).toBe('main');
    expect(within(switcher).getByRole('link', { name: 'All organisations' }).getAttribute('href')).toBe('/master');
    expect(within(switcher).getByRole('link', { name: 'Felice' }).getAttribute('href')).toBe('/o/felice');
    expect(within(switcher).getByRole('link', { name: 'Alur' }).getAttribute('href')).toBe('/o/alur');
  });

  it('shows the master pages outside an organisation', async () => {
    mount('/master');
    const nav = await screen.findByRole('navigation', { name: 'Master pages' });
    expect(within(nav).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Master dashboard', '/master'],
      ['Combined reports', '/master/reports'],
      ['Plan vs actual', '/master/actuals'],
      ['Compare', '/master/compare'],
    ]);
    expect(within(nav).getByRole('link', { name: 'Master dashboard' }).getAttribute('aria-current')).toBe('page');
  });

  it('shows the pages of the organisation you are in', async () => {
    mount('/o/felice/reports');
    const nav = await screen.findByRole('navigation', { name: 'Felice pages' });
    expect(within(nav).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Dashboard', '/o/felice'],
      ['Weekly planner', '/o/felice/planner'],
      ['Recurring costs', '/o/felice/recurring'],
      ['Rider prices', '/o/felice/rider-prices'],
      ['Reports', '/o/felice/reports'],
      ['Plan vs actual', '/o/felice/actuals'],
      ['Compare', '/o/felice/compare'],
      ['Import & export', '/o/felice/data'],
    ]);
    expect(within(nav).getByRole('link', { name: 'Reports' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
  });

  it('offers Backup & restore on every page, and opens it', async () => {
    const { user } = mount('/o/felice/reports');
    const safety = await screen.findByRole('navigation', { name: 'Data safety' });
    expect(within(safety).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([['Backup & restore', '/backup']]);
    await user.click(within(safety).getByRole('link', { name: 'Backup & restore' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Backup & restore' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Master pages' })).toBeTruthy();
  });
  it('moves between master and organisation pages', async () => {
    const { user } = mount('/master');
    await screen.findByRole('heading', { name: /Master dashboard/ });
    await user.click(within(screen.getByRole('navigation', { name: 'Organisation' })).getByRole('link', { name: 'Felice' }));
    expect(await screen.findByRole('navigation', { name: 'Felice pages' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: /Dashboard/ })).toBeTruthy();
    await user.click(within(screen.getByRole('navigation', { name: 'Organisation' })).getByRole('link', { name: 'All organisations' }));
    expect(await screen.findByRole('navigation', { name: 'Master pages' })).toBeTruthy();
  });
});

describe('routes', () => {
  const cases: [string, RegExp][] = [
    ['/master', /Master dashboard/],
    ['/master/reports', /Combined reports/],
    ['/master/actuals', /Plan vs actual/],
    ['/master/compare', /^Compare$/],
    ['/o/felice', /Dashboard/],
    ['/o/felice/planner', /Weekly planner/],
    ['/o/felice/planner/5', /Weekly planner/],
    ['/o/felice/recurring', /Recurring costs/],
    ['/o/felice/rider-prices', /Rider prices/],
    ['/o/felice/reports', /Reports/],
    ['/o/felice/actuals', /Plan vs actual/],
    ['/o/felice/compare', /Compare/],
    ['/o/felice/data', /Import & export/],
  ];
  it.each(cases)('%s shows its page', async (url, heading) => {
    mount(url);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });

  it('opens the week in the planner for /o/felice/planner/5', async () => {
    mount('/o/felice/planner/5');
    expect(await screen.findByRole('heading', { name: 'May 2026 W1' })).toBeTruthy();
  });

  it('sends an unknown address to the master dashboard', async () => {
    mount('/somewhere/else');
    expect(await screen.findByRole('heading', { name: /Master dashboard/ })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Master pages' })).toBeTruthy();
  });

  it('sends an unknown organisation to the master dashboard', async () => {
    mount('/o/nope/planner');
    expect(await screen.findByRole('heading', { name: /Master dashboard/ })).toBeTruthy();
  });

  it('shows plan data for the freeze date without crashing', async () => {
    freezeToday('2026-06-15T10:00:00');
    mount('/master/reports');
    expect(await screen.findByRole('heading', { level: 1, name: /Combined reports/ })).toBeTruthy();
  });
});
