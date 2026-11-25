import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActualsPage } from '../src/pages/Actuals.tsx';
import { MasterActualsPage } from '../src/pages/MasterActuals.tsx';
import { planActual, varianceByGroup, varianceReport, varianceRow, varianceTotals } from './fixtures.ts';
import { deferred, fail, freezeToday, mockApi, renderOrgPage, renderPage, txt, zar0 } from './helpers.tsx';
import type { VarianceReport } from '../../shared/types.ts';

const withActuals = (extra: Partial<VarianceReport> = {}) =>
  varianceReport({
    rows: [varianceRow({ key: '2026-05', label: 'May 2026', weeksCompared: 2, planned: 10000, actual: 11000, plannedAll: 12000 })],
    totals: varianceTotals({
      weeksCompared: 2,
      planned: 10000,
      plannedAll: 12000,
      actual: 11000,
      paid: 6000,
      byGroup: varianceByGroup({ headline: planActual(10000, 11000) }),
      byOrg: { felice: planActual(6000, 7000), alur: planActual(4000, 4000) },
    }),
    ...extra,
  });
const empty = (plannedAll = 0) => varianceReport({ totals: varianceTotals({ weeksCompared: 0, plannedAll }) });

describe('ActualsPage (one organisation)', () => {
  it('asks for the last twelve months by month, and shows the figures', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi({ 'GET /orgs/felice/reports/variance': withActuals() });
    renderOrgPage(<ActualsPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Plan vs actual/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(await screen.findByText('Variance (actual minus planned)')).toBeTruthy();
    expect(mock.calls[0]!.query).toEqual({ from: '2025-07', to: '2026-06', groupBy: 'month' });
    expect(screen.getByText(zar0(11000))).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Planned and actual per month' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'By cost group' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Planned and actual spend by month' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Planned and actual spend by cost group' })).toBeTruthy();
    expect(screen.getByRole('link', { name: "Import this week's actuals" }).getAttribute('href')).toBe('/o/felice/data');
  });

  it('switches to weeks and reloads', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi({ 'GET /orgs/felice/reports/variance': withActuals() });
    const { user } = renderOrgPage(<ActualsPage />);
    await screen.findByText('Variance (actual minus planned)');
    await user.click(screen.getByRole('button', { name: 'By week' }));
    expect(await screen.findByRole('region', { name: 'Planned and actual per week' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Planned and actual spend by week' })).toBeTruthy();
    expect(mock.calls.at(-1)!.query.groupBy).toBe('week');
  });

  it('reloads for another period', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi({ 'GET /orgs/felice/reports/variance': withActuals() });
    const { user } = renderOrgPage(<ActualsPage />);
    await screen.findByText('Variance (actual minus planned)');
    await user.click(screen.getByRole('button', { name: '3 months' }));
    await screen.findByText('Variance (actual minus planned)');
    expect(mock.calls.at(-1)!.query).toEqual({ from: '2026-04', to: '2026-06', groupBy: 'month' });
  });

  it('says nothing was imported, mentioning the plan when there is one', async () => {
    mockApi({ 'GET /orgs/felice/reports/variance': empty(5000) });
    renderOrgPage(<ActualsPage />);
    const card = await screen.findByRole('region', { name: 'No actual expenditure in this period' });
    expect(txt(card)).toContain('No actual expenditure has been imported for these months, although there is a plan.');
    expect(within(card).getByRole('link', { name: 'Import & export' }).getAttribute('href')).toBe('/o/felice/data');
    expect(screen.queryByText('Variance (actual minus planned)')).toBeNull();
  });

  it('says nothing was imported, without mentioning a plan when there is none', async () => {
    mockApi({ 'GET /orgs/felice/reports/variance': empty(0) });
    renderOrgPage(<ActualsPage />);
    const card = await screen.findByRole('region', { name: 'No actual expenditure in this period' });
    expect(txt(card)).toContain('No actual expenditure has been imported for these months. At the end of each week');
    expect(txt(card)).not.toContain('although');
  });

  it('shows the error from the server', async () => {
    mockApi({ 'GET /orgs/felice/reports/variance': fail(500, 'Variance failed') });
    renderOrgPage(<ActualsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Variance failed');
    expect(screen.queryByRole('region', { name: 'No actual expenditure in this period' })).toBeNull();
  });

  it('keeps showing the earlier figures instead of "Loading…" while a new period loads', async () => {
    freezeToday('2026-06-15T10:00:00');
    const slow = deferred<VarianceReport>();
    let calls = 0;
    mockApi({ 'GET /orgs/felice/reports/variance': () => (++calls === 1 ? withActuals() : slow.promise.then((r) => r)) });
    const { user } = renderOrgPage(<ActualsPage />);
    await screen.findByText('Variance (actual minus planned)');
    await user.click(screen.getByRole('button', { name: '6 months' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Variance (actual minus planned)')).toBeTruthy();
    slow.resolve(withActuals());
  });
});

describe('MasterActualsPage (all organisations)', () => {
  it('shows combined figures with a per-organisation breakdown', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi({ 'GET /master/variance': withActuals() });
    renderPage(<MasterActualsPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Plan vs actual/ })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /logo$/ }).map((i) => i.getAttribute('aria-label'))).toEqual(['Felice logo', 'Alur logo']);
    expect(await screen.findByRole('region', { name: 'By organisation' })).toBeTruthy();
    expect(mock.calls[0]!.query).toEqual({ from: '2025-07', to: '2026-06', groupBy: 'month' });
    expect(screen.getByRole('region', { name: 'Planned and actual per month (combined)' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'By cost group (combined)' })).toBeTruthy();
    expect(txt(screen.getByRole('row', { name: /Felice/ }))).toContain('16.7% over plan');
  });

  it('switches to weeks', async () => {
    const mock = mockApi({ 'GET /master/variance': withActuals() });
    const { user } = renderPage(<MasterActualsPage />);
    await screen.findByRole('region', { name: 'By organisation' });
    await user.click(screen.getByRole('button', { name: 'By week' }));
    expect(await screen.findByRole('region', { name: 'Planned and actual per week (combined)' })).toBeTruthy();
    expect(mock.calls.at(-1)!.query.groupBy).toBe('week');
  });

  it('points to each organisation import page when nothing was imported', async () => {
    mockApi({ 'GET /master/variance': empty() });
    renderPage(<MasterActualsPage />);
    const card = await screen.findByRole('region', { name: 'No actual expenditure in this period' });
    expect(txt(card)).toContain('in any organisation');
    expect(within(card).getByRole('link', { name: 'Felice' }).getAttribute('href')).toBe('/o/felice/data');
    expect(within(card).getByRole('link', { name: 'Alur' }).getAttribute('href')).toBe('/o/alur/data');
    expect(txt(card)).toContain('Felice, Alur');
  });

  it('shows the error from the server', async () => {
    mockApi({ 'GET /master/variance': fail(500, 'Master variance failed') });
    renderPage(<MasterActualsPage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Master variance failed');
  });
});
