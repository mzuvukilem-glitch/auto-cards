import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResidentBookingsReport, SummaryReport, TopEntry } from '../../shared/types.ts';
import { ReportsPage } from '../src/pages/Reports.tsx';
import { MasterReportsPage } from '../src/pages/MasterReports.tsx';
import { cats, orgTotals, summaryReport, summaryRow } from './fixtures.ts';
import { cells, fail, freezeToday, mockApi, renderOrgPage, renderPage, txt, zar, zar0 } from './helpers.tsx';

const monthReport = (): SummaryReport =>
  summaryReport({
    rows: [
      summaryRow({ key: '2026-04', label: 'Apr 2026', weeks: 2, total: 3000, byCategory: cats({ headline: 2000, standard: 1000 }), byOrg: { felice: 2000, alur: 1000 } }),
      summaryRow({ key: '2026-05', label: 'May 2026', weeks: 0, total: 0, byCategory: cats(), byOrg: {} }),
    ],
    totals: {
      byCategory: cats({ headline: 2000, standard: 1000 }),
      total: 3000,
      weeks: 2,
      byOrg: { felice: orgTotals({ byCategory: cats({ headline: 2000 }), total: 2000, weeks: 2 }), alur: orgTotals({ byCategory: cats({ standard: 1000 }), total: 1000, weeks: 1 }) },
    },
  });
const weekReport = (): SummaryReport =>
  summaryReport({
    groupBy: 'week',
    rows: [
      summaryRow({ key: 'w1', label: 'Apr 2026 W1', weekNo: 1, weekId: 41, weeks: 1, total: 1500, byCategory: cats({ headline: 1500 }) }),
      summaryRow({ key: 'w2', label: 'Apr 2026 W2', weekNo: 2, weekId: null, weeks: 1, total: 1500, byCategory: cats({ standard: 1500 }) }),
    ],
    totals: { byCategory: cats({ headline: 1500, standard: 1500 }), total: 3000, weeks: 2, byOrg: {} },
  });
const emptyReport = summaryReport({ rows: [], totals: { byCategory: cats(), total: 0, weeks: 0, byOrg: {} } });

const top: TopEntry[] = [
  { name: 'DJ Max', total: 3000, riderTotal: 600, count: 3 },
  { name: 'Zee', total: 1000, riderTotal: 0, count: 1 },
];
const bookings = (): ResidentBookingsReport => ({
  from: '2026-04',
  to: '2026-05',
  months: [
    { key: '2026-04', label: 'Apr 2026' },
    { key: '2026-05', label: 'May 2026' },
  ],
  rows: [
    { name: 'DJ Neo', bookings: 2, paid: 1300, byMonth: { '2026-04': { bookings: 2, paid: 1300 } } },
    { name: 'DJ Zed', bookings: 1, paid: 900, byMonth: { '2026-05': { bookings: 1, paid: 900 } } },
  ],
  totals: { bookings: 3, paid: 2200, byMonth: { '2026-04': { bookings: 2, paid: 1300 } } },
});

const orgRoutes = (extra: Record<string, unknown> = {}) => ({
  'GET /orgs/felice/reports/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weekReport() : monthReport()),
  'GET /orgs/felice/reports/top': top,
  'GET /orgs/felice/reports/resident-bookings': bookings(),
  ...extra,
});
const masterRoutes = (extra: Record<string, unknown> = {}) => ({
  'GET /master/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weekReport() : monthReport()),
  'GET /master/top': top,
  'GET /master/resident-bookings': bookings(),
  ...extra,
});

describe('ReportsPage', () => {
  it('asks for the last twelve months by month and loads top spend and DJ bookings', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(orgRoutes());
    renderOrgPage(<ReportsPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Reports/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    await screen.findByRole('region', { name: 'Breakdown' });
    expect(mock.of('GET', '/orgs/felice/reports/summary')[0]!.query).toEqual({ from: '2025-07', to: '2026-06', groupBy: 'month' });
    await screen.findByRole('row', { name: /DJ Max/ });
    expect(mock.of('GET', '/orgs/felice/reports/top')[0]!.query).toEqual({ from: '2025-07', to: '2026-06', category: 'headline', limit: '20' });
    expect(mock.of('GET', '/orgs/felice/reports/resident-bookings')[0]!.query).toEqual({ from: '2025-07', to: '2026-06' });
    expect(screen.getByRole('link', { name: 'Export to Excel' }).getAttribute('href')).toBe('/api/orgs/felice/reports/export.xlsx?from=2025-07&to=2026-06&groupBy=month');
  });

  it('shows the monthly breakdown with totals and each category share', async () => {
    mockApi(orgRoutes());
    renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Breakdown' });
    expect(within(card).getByRole('columnheader', { name: 'Month' })).toBeTruthy();
    expect(within(card).getByRole('columnheader', { name: 'Weeks' })).toBeTruthy();
    expect(cells(within(card).getByRole('row', { name: /^Apr 2026/ }))).toEqual(['Apr 2026', '2', zar(2000), '–', '–', zar(1000), '–', '–', '–', '–', zar(3000)]);
    const quiet = within(card).getByRole('row', { name: /^May 2026/ });
    expect(quiet.className).toBe('empty-row');
    expect(cells(within(card).getByRole('row', { name: /^Total/ }))).toEqual(['Total', '2', zar(2000), zar(0), zar(0), zar(1000), zar(0), zar(0), zar(0), zar(0), zar(3000)]);
    expect(cells(within(card).getByRole('row', { name: /^Share/ }))).toEqual(['Share', '', '66.7%', '0.0%', '0.0%', '33.3%', '0.0%', '0.0%', '0.0%', '0.0%', '100%']);
  });

  it('charts spend per month by category', async () => {
    mockApi(orgRoutes());
    renderOrgPage(<ReportsPage />);
    await screen.findByRole('region', { name: 'Breakdown' });
    const data = JSON.parse(screen.getAllByTestId('bar-chart')[0]!.getAttribute('data-chart')!);
    expect(data[0]).toMatchObject({ label: 'Apr 2026', headline: 2000, standard: 1000 });
    expect(screen.getByRole('region', { name: 'Spend per month' })).toBeTruthy();
    expect(screen.getAllByTestId('series').filter((s) => s.getAttribute('data-stack') === 's')).toHaveLength(8);
    expect(txt(screen.getAllByTestId('tooltip-sample')[0])).toBe(zar0(1234.4));
  });

  it('switches to weeks, with links to each week that exists and no Weeks column', async () => {
    const mock = mockApi(orgRoutes());
    const { user } = renderOrgPage(<ReportsPage />);
    await screen.findByRole('region', { name: 'Breakdown' });
    await user.click(screen.getByRole('button', { name: 'By week' }));
    const card = await screen.findByRole('row', { name: /Apr 2026 W1/ }).then(() => screen.getByRole('region', { name: 'Breakdown' }));
    expect(mock.of('GET', '/orgs/felice/reports/summary').at(-1)!.query.groupBy).toBe('week');
    expect(screen.getByRole('region', { name: 'Spend per week' })).toBeTruthy();
    expect(within(card).getByRole('columnheader', { name: 'Week' })).toBeTruthy();
    expect(within(card).queryByRole('columnheader', { name: 'Weeks' })).toBeNull();
    expect(within(card).getByRole('link', { name: 'Apr 2026 W1' }).getAttribute('href')).toBe('/o/felice/planner/41');
    expect(within(card).queryByRole('link', { name: 'Apr 2026 W2' })).toBeNull();
    expect(cells(within(card).getByRole('row', { name: /^Share/ }))[0]).toBe('Share');
    expect(cells(within(card).getByRole('row', { name: /^Share/ }))).toHaveLength(10);
    expect(cells(within(card).getByRole('row', { name: /^Total/ }))).toHaveLength(10);
  });

  it('says nothing is planned and shows a dash for shares when there is no spend', async () => {
    mockApi(orgRoutes({ 'GET /orgs/felice/reports/summary': emptyReport }));
    renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Breakdown' });
    expect(within(card).getByText('Nothing planned in this period.')).toBeTruthy();
    expect(cells(within(card).getByRole('row', { name: /^Share/ })).slice(2, 4)).toEqual(['–', '–']);
  });

  it('shows the error from the server', async () => {
    mockApi(orgRoutes({ 'GET /orgs/felice/reports/summary': fail(500, 'Summary failed') }));
    renderOrgPage(<ReportsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Summary failed');
    expect(screen.queryByRole('region', { name: 'Breakdown' })).toBeNull();
  });

  it('reloads for another period', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(orgRoutes());
    const { user } = renderOrgPage(<ReportsPage />);
    await screen.findByRole('region', { name: 'Breakdown' });
    await user.click(screen.getByRole('button', { name: '3 months' }));
    await screen.findByRole('region', { name: 'Breakdown' });
    expect(mock.of('GET', '/orgs/felice/reports/summary').at(-1)!.query).toMatchObject({ from: '2026-04', to: '2026-06' });
  });
});

describe('TopItems (inside the reports)', () => {
  it('ranks names by total spend with averages', async () => {
    mockApi(orgRoutes());
    renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Top spend by name' });
    const row = await within(card).findByRole('row', { name: /DJ Max/ });
    expect(cells(row)).toEqual(['1', 'DJ Max', '3', zar(3000), zar(600), zar(3600), zar(1200)]);
    expect(cells(within(card).getByRole('row', { name: /Zee/ }))).toEqual(['2', 'Zee', '1', zar(1000), zar(0), zar(1000), zar(1000)]);
  });

  it('loads another category when it is chosen', async () => {
    const mock = mockApi(orgRoutes());
    const { user } = renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Top spend by name' });
    await user.selectOptions(within(card).getByLabelText('Category'), 'hosts');
    await within(card).findByRole('row', { name: /DJ Max/ });
    expect(mock.of('GET', '/orgs/felice/reports/top').at(-1)!.query.category).toBe('hosts');
  });

  it('says so when the category has nothing', async () => {
    mockApi(orgRoutes({ 'GET /orgs/felice/reports/top': [] }));
    renderOrgPage(<ReportsPage />);
    expect(await screen.findByText('Nothing in this category for the period.')).toBeTruthy();
  });

  it('shows its own error', async () => {
    mockApi(orgRoutes({ 'GET /orgs/felice/reports/top': fail(500, 'Top failed') }));
    renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Top spend by name' });
    expect((await within(card).findByRole('alert')).textContent).toBe('Top failed');
  });
});

describe('ResidentBookings (inside the reports)', () => {
  it('counts bookings per DJ per month, with a dash for months without one', async () => {
    mockApi(orgRoutes());
    renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Resident DJ bookings per month' });
    await within(card).findByRole('row', { name: /DJ Neo/ });
    expect(cells(within(card).getByRole('row', { name: /DJ Neo/ }))).toEqual(['DJ Neo', '2', '–', '2', zar(1300)]);
    expect(cells(within(card).getByRole('row', { name: /DJ Zed/ }))).toEqual(['DJ Zed', '–', '1', '1', zar(900)]);
    expect(cells(within(card).getByRole('row', { name: /^Total/ }))).toEqual(['Total', '2', '–', '3', zar(2200)]);
  });

  it('says so when no DJ was booked', async () => {
    mockApi(orgRoutes({ 'GET /orgs/felice/reports/resident-bookings': { ...bookings(), rows: [] } }));
    renderOrgPage(<ReportsPage />);
    expect(await screen.findByText('No resident DJs were booked in this period.')).toBeTruthy();
  });

  it('shows its own error', async () => {
    mockApi(orgRoutes({ 'GET /orgs/felice/reports/resident-bookings': fail(500, 'Bookings failed') }));
    renderOrgPage(<ReportsPage />);
    const card = await screen.findByRole('region', { name: 'Resident DJ bookings per month' });
    expect((await within(card).findByRole('alert')).textContent).toBe('Bookings failed');
  });
});

describe('MasterReportsPage', () => {
  it('asks for the combined summary and links the combined export', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(masterRoutes());
    renderPage(<MasterReportsPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Combined reports/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    await screen.findByRole('region', { name: 'Breakdown' });
    expect(mock.of('GET', '/master/summary')[0]!.query).toEqual({ from: '2025-07', to: '2026-06', groupBy: 'month' });
    expect(screen.getByRole('link', { name: 'Export combined report to Excel' }).getAttribute('href')).toBe('/api/master/export.xlsx?from=2025-07&to=2026-06&groupBy=month');
    await screen.findByRole('row', { name: /DJ Max/ });
    expect(mock.of('GET', '/master/top')[0]!.query).toMatchObject({ category: 'headline', limit: '20' });
    expect(mock.of('GET', '/master/resident-bookings')).toHaveLength(1);
  });

  it('charts spend by organisation', async () => {
    mockApi(masterRoutes());
    renderPage(<MasterReportsPage />);
    await screen.findByRole('region', { name: 'Breakdown' });
    expect(screen.getByRole('region', { name: 'Spend per month, by organisation' })).toBeTruthy();
    const data = JSON.parse(screen.getAllByTestId('bar-chart')[0]!.getAttribute('data-chart')!);
    expect(data[0]).toEqual({ label: 'Apr 2026', felice: 2000, alur: 1000 });
    expect(screen.getAllByTestId('series').map((s) => s.getAttribute('data-name'))).toEqual(['Felice', 'Alur']);
  });

  it('shows each category by organisation with the combined share', async () => {
    mockApi(masterRoutes());
    renderPage(<MasterReportsPage />);
    const card = await screen.findByRole('region', { name: 'Category by organisation' });
    expect(cells(within(card).getByRole('row', { name: /^Headline Acts/ }))).toEqual(['Headline Acts', zar(2000), '–', zar(2000), '66.7%']);
    expect(cells(within(card).getByRole('row', { name: /^Standard Costs/ }))).toEqual(['Standard Costs', '–', zar(1000), zar(1000), '33.3%']);
    expect(cells(within(card).getByRole('row', { name: /^Total/ }))).toEqual(['Total', zar(2000), zar(1000), zar(3000), '100%']);
  });

  it('shows the breakdown per period with a column for each organisation and category', async () => {
    mockApi(masterRoutes());
    renderPage(<MasterReportsPage />);
    const card = await screen.findByRole('region', { name: 'Breakdown' });
    expect(cells(within(card).getByRole('row', { name: /^Apr 2026/ }))).toEqual(['Apr 2026', '2', zar(2000), zar(1000), zar(2000), '–', '–', zar(1000), '–', '–', '–', '–', zar(3000)]);
    const quiet = within(card).getByRole('row', { name: /^May 2026/ });
    expect(quiet.className).toBe('empty-row');
    expect(cells(quiet).slice(2, 4)).toEqual(['–', '–']);
    expect(cells(within(card).getByRole('row', { name: /^Total/ }))[0]).toBe('Total');
    expect(within(card).getByRole('columnheader', { name: 'Felice' })).toBeTruthy();
  });

  it('handles organisations and shares when nothing is planned', async () => {
    mockApi(masterRoutes({ 'GET /master/summary': emptyReport }));
    renderPage(<MasterReportsPage />);
    const byOrg = await screen.findByRole('region', { name: 'Category by organisation' });
    expect(cells(within(byOrg).getByRole('row', { name: /^Headline Acts/ }))).toEqual(['Headline Acts', '–', '–', zar(0), '–']);
    expect(cells(within(byOrg).getByRole('row', { name: /^Total/ }))).toEqual(['Total', zar(0), zar(0), zar(0), '100%']);
    const card = screen.getByRole('region', { name: 'Breakdown' });
    expect(within(card).getByText('Nothing planned in this period.')).toBeTruthy();
    expect(cells(within(card).getByRole('row', { name: /^Total/ })).slice(0, 4)).toEqual(['Total', '0', zar(0), zar(0)]);
  });

  it('switches to weeks', async () => {
    const mock = mockApi(masterRoutes());
    const { user } = renderPage(<MasterReportsPage />);
    await screen.findByRole('region', { name: 'Breakdown' });
    await user.click(screen.getByRole('button', { name: 'By week' }));
    expect(await screen.findByRole('region', { name: 'Spend per week, by organisation' })).toBeTruthy();
    expect(mock.of('GET', '/master/summary').at(-1)!.query.groupBy).toBe('week');
    expect(within(screen.getByRole('region', { name: 'Breakdown' })).getByRole('columnheader', { name: 'Week' })).toBeTruthy();
  });

  it('shows the error from the server', async () => {
    mockApi(masterRoutes({ 'GET /master/summary': fail(500, 'Combined failed') }));
    renderPage(<MasterReportsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Combined failed');
  });
});
