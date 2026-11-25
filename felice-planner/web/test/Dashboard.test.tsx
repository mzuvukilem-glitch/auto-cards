import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SummaryReport, TopEntry } from '../../shared/types.ts';
import { DashboardPage, TopTable } from '../src/pages/Dashboard.tsx';
import { MasterDashboardPage } from '../src/pages/MasterDashboard.tsx';
import { cats, orgTotals, summaryReport, summaryRow, planActual, varianceReport, varianceRow, varianceTotals } from './fixtures.ts';
import { cells, deferred, parts, fail, freezeToday, mockApi, renderOrgPage, renderPage, txt, zar, zar0, felice, alur } from './helpers.tsx';

const series = (testId: string) => JSON.parse(screen.getByTestId(testId).getAttribute('data-chart')!) as Record<string, unknown>[];

/** Three months: April busy, May quiet, June with nothing planned. */
function monthsReport(): SummaryReport {
  return summaryReport({
    rows: [
      summaryRow({ key: '2026-04', label: 'Apr 2026', month: 4, weeks: 2, total: 6000, byCategory: cats({ headline: 4000, standard: 2000 }), byOrg: { felice: 4000, alur: 2000 } }),
      summaryRow({ key: '2026-05', label: 'May 2026', month: 5, weeks: 1, total: 2000, byCategory: cats({ headline: 500, standard: 1500 }), byOrg: { felice: 2000 } }),
      summaryRow({ key: '2026-06', label: 'Jun 2026', month: 6, weeks: 0, total: 0 }),
    ],
    totals: {
      byCategory: cats({ headline: 4500, standard: 3500 }),
      total: 8000,
      weeks: 3,
      byOrg: { felice: orgTotals({ byCategory: cats({ headline: 4500, standard: 1500 }), total: 6000, weeks: 3 }), alur: orgTotals({ byCategory: cats({ standard: 2000 }), total: 2000, weeks: 2 }) },
    },
  });
}
const weeksReport = (): SummaryReport =>
  summaryReport({
    groupBy: 'week',
    rows: [
      summaryRow({ key: 'w1', label: 'Apr 2026 W1', weeks: 1, total: 3000, byOrg: { felice: 2000, alur: 1000 } }),
      summaryRow({ key: 'w2', label: 'Apr 2026 W2', weeks: 1, total: 3000, byOrg: { felice: 2000, alur: 1000 } }),
      summaryRow({ key: 'w3', label: 'May 2026 W1', weeks: 1, total: 2000, byOrg: { felice: 2000 } }),
    ],
  });
const acts: TopEntry[] = [{ name: 'DJ Max', total: 3000, riderTotal: 500, count: 2 }];
const noActuals = varianceReport({ totals: varianceTotals({ weeksCompared: 0 }) });
const someActuals = varianceReport({
  rows: [varianceRow({ key: '2026-04', label: 'Apr 2026', weeksCompared: 1, planned: 6000, actual: 6600 })],
  totals: varianceTotals({ weeksCompared: 1, planned: 6000, actual: 6600, byOrg: { felice: planActual(4000, 4300) } }),
});

describe('DashboardPage', () => {
  function routes(overrides: Record<string, unknown> = {}) {
    return {
      'GET /orgs/felice/reports/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : monthsReport()),
      'GET /orgs/felice/reports/top': (c: { query: Record<string, string> }) => (c.query.category === 'headline' ? acts : []),
      'GET /orgs/felice/reports/variance': noActuals,
      ...overrides,
    };
  }

  it('asks for the last twelve months in five requests', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(routes());
    renderOrgPage(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Dashboard/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    await screen.findByText('Total spend');
    expect(mock.calls.map((c) => `${c.path} ${c.query.groupBy ?? c.query.category}`).sort()).toEqual([
      '/orgs/felice/reports/summary month',
      '/orgs/felice/reports/summary week',
      '/orgs/felice/reports/top headline',
      '/orgs/felice/reports/top hosts',
      '/orgs/felice/reports/variance month',
    ]);
    expect(mock.calls.every((c) => c.query.from === '2025-07' && c.query.to === '2026-06')).toBe(true);
    expect(mock.of('GET', '/orgs/felice/reports/top')[0]!.query.limit).toBe('10');
  });

  it('shows the headline figures', async () => {
    mockApi(routes());
    renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    const kpi = (label: string) => screen.getByText(label).parentElement!;
    expect(parts(kpi('Total spend'))).toEqual(['Total spend', zar0(8000), '3 weeks planned']);
    expect(parts(kpi('Average per week'))).toEqual(['Average per week', zar0(8000 / 3)]);
    expect(parts(kpi('Average per active month'))).toEqual(['Average per active month', zar0(4000), '2 months with events']);
    expect(parts(kpi('Busiest month'))).toEqual(['Busiest month', 'Apr 2026', zar0(6000)]);
    expect(parts(kpi('Largest cost'))).toEqual(['Largest cost', 'Headline Acts', '56.3% of spend']);
  });

  it('picks the busiest month and largest cost whichever order they come in', async () => {
    const months = monthsReport();
    months.rows = [months.rows[1]!, months.rows[0]!, months.rows[2]!];
    months.totals.byCategory = cats({ headline: 1000, social: 5000, standard: 2000 });
    mockApi(routes({ 'GET /orgs/felice/reports/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : months) }));
    renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    expect(txt(screen.getByText('Busiest month').parentElement)).toContain('Apr 2026');
    expect(txt(screen.getByText('Largest cost').parentElement)).toContain('Social Media');
  });

  it('builds the charts from the report', async () => {
    mockApi(routes());
    renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    const monthly = series('bar-chart');
    expect(monthly.map((m) => m.label)).toEqual(['Apr 2026', 'May 2026', 'Jun 2026']);
    expect(monthly[0]).toMatchObject({ headline: 4000, standard: 2000 });
    expect(screen.getAllByTestId('series').filter((s) => s.getAttribute('data-stack') === 'spend')).toHaveLength(8);
    expect(JSON.parse(screen.getByTestId('pie').getAttribute('data-pie')!)).toEqual([
      { name: 'Headline Acts', value: 4500, color: '#4338ca' },
      { name: 'Standard Costs', value: 3500, color: '#047857' },
    ]);
    expect(screen.getAllByTestId('cell').map((c) => c.getAttribute('data-fill'))).toEqual(['#4338ca', '#047857']);
    expect(series('line-chart')).toEqual([
      { label: 'Apr 2026 W1', total: 3000 },
      { label: 'Apr 2026 W2', total: 3000 },
      { label: 'May 2026 W1', total: 2000 },
    ]);
    expect(txt(screen.getAllByTestId('tooltip-sample')[0])).toBe(zar0(1234.4));
  });

  it('lists the top headline acts and says there are no hosts', async () => {
    mockApi(routes());
    renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    const topActs = screen.getByRole('region', { name: 'Top headline acts' });
    expect(cells(within(topActs).getByRole('row', { name: /DJ Max/ }))).toEqual(['DJ Max', '2', zar(3000), zar(500), zar(3500)]);
    expect(within(topActs).getByRole('columnheader', { name: 'Bookings' })).toBeTruthy();
    const topHosts = screen.getByRole('region', { name: 'Top hosts & promoters' });
    expect(within(topHosts).getByText('None in this period.')).toBeTruthy();
  });

  it('shows plan vs actual: how to start when nothing was imported', async () => {
    mockApi(routes());
    renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    const card = screen.getByRole('region', { name: 'Plan vs actual' });
    expect(within(card).getByRole('link', { name: 'Import & export' }).getAttribute('href')).toBe('/o/felice/data');
    expect(within(card).getByRole('link', { name: 'Full report' }).getAttribute('href')).toBe('/o/felice/actuals');
  });

  it('shows plan vs actual figures once actuals exist', async () => {
    mockApi(routes({ 'GET /orgs/felice/reports/variance': someActuals }));
    renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    const card = screen.getByRole('region', { name: 'Plan vs actual' });
    expect(within(card).getByText('Variance (actual minus planned)')).toBeTruthy();
  });

  it('says there is no data, with links to start, when nothing is planned', async () => {
    mockApi(routes({ 'GET /orgs/felice/reports/summary': summaryReport() }));
    renderOrgPage(<DashboardPage />);
    const card = await screen.findByRole('region', { name: 'No data in this period' });
    expect(within(card).getByRole('link', { name: 'weekly planner' }).getAttribute('href')).toBe('/o/felice/planner');
    expect(within(card).getByRole('link', { name: 'import a spreadsheet' }).getAttribute('href')).toBe('/o/felice/data');
    expect(screen.queryByText('Total spend')).toBeNull();
  });

  it('shows the error from the server', async () => {
    mockApi(routes({ 'GET /orgs/felice/reports/top': fail(500, 'Top failed') }));
    renderOrgPage(<DashboardPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Top failed');
  });

  it('loads again for a new period, keeping the old figures on screen meanwhile', async () => {
    freezeToday('2026-06-15T10:00:00');
    const slow = deferred<SummaryReport>();
    let monthCalls = 0;
    const mock = mockApi(
      routes({
        'GET /orgs/felice/reports/summary': (c: { query: Record<string, string> }) =>
          c.query.groupBy === 'week' ? weeksReport() : ++monthCalls === 1 ? monthsReport() : slow.promise.then((r) => r),
      }),
    );
    const { user } = renderOrgPage(<DashboardPage />);
    await screen.findByText('Total spend');
    await user.click(screen.getByRole('button', { name: '3 months' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Total spend')).toBeTruthy();
    expect(mock.calls.at(-1)!.query.from).toBe('2026-04');
    slow.resolve(monthsReport());
  });
});

describe('TopTable', () => {
  it('uses the label it is given for the count column', () => {
    renderPage(<TopTable title="Top hosts" entries={acts} countLabel="Weeks" />);
    expect(screen.getByRole('columnheader', { name: 'Weeks' })).toBeTruthy();
  });
});

describe('MasterDashboardPage', () => {
  function routes(overrides: Record<string, unknown> = {}) {
    return {
      'GET /master/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : monthsReport()),
      'GET /master/top': (c: { query: Record<string, string> }) => (c.query.category === 'hosts' ? acts : []),
      'GET /master/variance': noActuals,
      ...overrides,
    };
  }

  it('asks for the combined reports for the last twelve months', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(routes());
    renderPage(<MasterDashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Master dashboard/ })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /logo$/ })).toHaveLength(2);
    await screen.findByText('Combined spend');
    expect(mock.calls.map((c) => `${c.path} ${c.query.groupBy ?? c.query.category}`).sort()).toEqual([
      '/master/summary month',
      '/master/summary week',
      '/master/top headline',
      '/master/top hosts',
      '/master/variance month',
    ]);
    expect(mock.calls.every((c) => c.query.from === '2025-07' && c.query.to === '2026-06')).toBe(true);
  });

  it('shows combined and per-organisation figures', async () => {
    mockApi(routes());
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    const kpi = (label: string) => screen.getByText(label, { selector: '.kpi-label' }).parentElement!;
    expect(parts(kpi('Combined spend'))).toEqual(['Combined spend', zar0(8000), '3 weeks planned across 2 organisations']);
    expect(parts(kpi('Felice'))).toEqual(['Felice', zar0(6000), '75.0% of combined · 3 weeks']);
    expect(parts(kpi('Alur'))).toEqual(['Alur', zar0(2000), '25.0% of combined · 2 weeks']);
    expect(parts(kpi('Busiest month'))).toEqual(['Busiest month', 'Apr 2026', `${zar0(6000)} combined`]);
    expect(parts(kpi('Average per active month'))).toEqual(['Average per active month', zar0(4000), '2 months with events']);
  });

  it('shows a table per organisation with its largest cost and share', async () => {
    mockApi(routes());
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    const table = screen.getByRole('region', { name: 'By organisation' });
    expect(cells(within(table).getByRole('row', { name: /^Felice/ }))).toEqual(['Felice', '3', zar(6000), zar(2000), '75.0%', `Headline Acts (${zar0(4500)})`]);
    expect(cells(within(table).getByRole('row', { name: /^Alur/ }))).toEqual(['Alur', '2', zar(2000), zar(1000), '25.0%', `Standard Costs (${zar0(2000)})`]);
    expect(cells(within(table).getByRole('row', { name: /^Combined/ }))).toEqual(['Combined', '3', zar(8000), zar(8000 / 3), '100%', `Headline Acts (${zar0(4500)})`]);
    expect(within(table).getByRole('link', { name: 'Felice' }).getAttribute('href')).toBe('/o/felice');
  });

  it('copes with an organisation that has no figures yet', async () => {
    const months = monthsReport();
    delete months.totals.byOrg.alur;
    mockApi(routes({ 'GET /master/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : months) }));
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(parts(screen.getByText('Alur', { selector: '.kpi-label' }).parentElement)).toEqual(['Alur', zar0(0), '0.0% of combined · 0 weeks']);
    const row = screen.getByRole('row', { name: /^Alur/ });
    expect(cells(row)).toEqual(['Alur', '0', zar(0), '–', '0.0%', '–']);
  });

  it('copes with an organisation that has weeks but no spend', async () => {
    const months = monthsReport();
    months.totals.byOrg.alur = orgTotals({ weeks: 1, total: 0 });
    mockApi(routes({ 'GET /master/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : months) }));
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(cells(screen.getByRole('row', { name: /^Alur/ }))).toEqual(['Alur', '1', zar(0), zar(0), '0.0%', '–']);
  });

  it('copes with weeks that were planned at no cost', async () => {
    const months = summaryReport({
      rows: [summaryRow({ key: '2026-04', label: 'Apr 2026', weeks: 1, total: 0 })],
      totals: { byCategory: cats(), total: 0, weeks: 1, byOrg: { felice: orgTotals({ weeks: 1 }) } },
    });
    mockApi(routes({ 'GET /master/summary': months }));
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(txt(screen.getByText('Felice', { selector: '.kpi-label' }).parentElement)).toContain('0.0% of combined · 1 weeks');
    expect(cells(screen.getByRole('row', { name: /^Felice/ })).slice(3)).toEqual([zar(0), '–', '–']);
  });

  it('names the largest cost in the combined row even when it is not the first category', async () => {
    const months = monthsReport();
    months.totals.byCategory = cats({ headline: 1000, social: 5000, standard: 2000 });
    mockApi(routes({ 'GET /master/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : months) }));
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(cells(screen.getByRole('row', { name: /^Combined/ })).at(-1)).toBe(`Social Media (${zar0(5000)})`);
  });

  it('picks the busiest month whichever order the months come in', async () => {
    const months = monthsReport();
    months.rows = [months.rows[1]!, months.rows[0]!];
    mockApi(routes({ 'GET /master/summary': (c: { query: Record<string, string> }) => (c.query.groupBy === 'week' ? weeksReport() : months) }));
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(txt(screen.getByText('Busiest month').parentElement)).toContain('Apr 2026');
  });

  it('builds the charts from the report', async () => {
    mockApi(routes());
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    const [byOrg, byCategory] = screen.getAllByTestId('bar-chart').map((c) => JSON.parse(c.getAttribute('data-chart')!) as Record<string, unknown>[]);
    expect(byOrg![0]).toEqual({ label: 'Apr 2026', felice: 4000, alur: 2000 });
    expect(byCategory![0]).toMatchObject({ label: 'Apr 2026', headline: 4000, standard: 2000 });
    expect(series('line-chart')[0]).toEqual({ label: 'Apr 2026 W1', felice: 2000, alur: 1000, combined: 3000 });
    const keys = screen.getAllByTestId('series').map((s) => s.getAttribute('data-key'));
    expect(keys).toContain('felice');
    expect(keys).toContain('combined');
    expect(screen.getAllByTestId('series').find((s) => s.getAttribute('data-key') === 'felice')!.getAttribute('data-fill')).toBe(felice.color);
    expect(screen.getAllByTestId('series').find((s) => s.getAttribute('data-key') === 'alur')!.getAttribute('data-name')).toBe(alur.name);
  });

  it('lists the top hosts and says there are no headline acts', async () => {
    mockApi(routes());
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(within(screen.getByRole('region', { name: 'Top headline acts (combined)' })).getByText('None in this period.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Top hosts & promoters (combined)' })).getByRole('row', { name: /DJ Max/ })).toBeTruthy();
  });

  it('links plan vs actual to every organisation import page, and shows figures once there are some', async () => {
    mockApi(routes());
    const { unmount } = renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    const card = screen.getByRole('region', { name: 'Plan vs actual' });
    expect(within(card).getByRole('link', { name: 'Felice' }).getAttribute('href')).toBe('/o/felice/data');
    expect(within(card).getByRole('link', { name: 'Alur' }).getAttribute('href')).toBe('/o/alur/data');
    expect(within(card).getByRole('link', { name: 'Full report' }).getAttribute('href')).toBe('/master/actuals');
    unmount();
    mockApi(routes({ 'GET /master/variance': someActuals }));
    renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    expect(screen.getByRole('table', { name: 'Planned and actual spend by organisation' })).toBeTruthy();
  });

  it('says nothing is planned and links to each organisation planner', async () => {
    mockApi(routes({ 'GET /master/summary': summaryReport() }));
    renderPage(<MasterDashboardPage />);
    const card = await screen.findByRole('region', { name: 'No data in this period' });
    expect(txt(card)).toContain('Felice, Alur');
    expect(within(card).getByRole('link', { name: 'Felice' }).getAttribute('href')).toBe('/o/felice/planner');
    expect(within(card).getByRole('link', { name: 'Alur' }).getAttribute('href')).toBe('/o/alur/planner');
  });

  it('shows the error from the server', async () => {
    mockApi(routes({ 'GET /master/variance': fail(500, 'Variance failed') }));
    renderPage(<MasterDashboardPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Variance failed');
  });

  it('loads again when the period changes', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(routes());
    const { user } = renderPage(<MasterDashboardPage />);
    await screen.findByText('Combined spend');
    await user.click(screen.getByRole('button', { name: 'Year to date' }));
    await screen.findByText('Combined spend');
    expect(mock.calls.at(-1)!.query).toMatchObject({ from: '2026-01', to: '2026-06' });
  });
});
