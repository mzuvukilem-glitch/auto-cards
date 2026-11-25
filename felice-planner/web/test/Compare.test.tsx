import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompareReport } from '../../shared/types.ts';
import { ComparePage, CompareView } from '../src/pages/Compare.tsx';
import { MasterComparePage } from '../src/pages/MasterCompare.tsx';
import { cats, compareReport, side, weekSummary } from './fixtures.ts';
import { cells, deferred, empty, fail, felice, freezeToday, mockApi, renderOrgPage, renderPage, zar } from './helpers.tsx';

const report = (mode: CompareReport['mode'] = 'month'): CompareReport =>
  compareReport({
    mode,
    a: side({
      key: '2026-04',
      label: 'April 2026',
      weeks: 2,
      total: 3000,
      byCategory: cats({ headline: 2000, standard: 1000 }),
      headliners: [{ name: 'DJ Max', amount: 1800, riderCost: 200, week: 'Apr 2026 W2' }],
    }),
    b: side({
      key: '2026-05',
      label: 'May 2026',
      weeks: 3,
      total: 4500,
      byCategory: cats({ headline: 2500, standard: 750, social: 1250 }),
      headliners: [],
    }),
  });

const WEEKS = [
  weekSummary({ id: 1, month: 3, weekNo: 1 }),
  weekSummary({ id: 2, month: 4, weekNo: 1 }),
  weekSummary({ id: 3, month: 5, weekNo: 1 }),
  weekSummary({ id: 4, month: 5, weekNo: 2 }),
];

describe('CompareView', () => {
  it('compares each category with the difference and the change', () => {
    renderPage(<CompareView data={report('month')} />);
    const headline = screen.getByRole('row', { name: /^Headline Acts/ });
    expect(cells(headline)).toEqual(['Headline Acts', zar(2000), zar(2500), zar(500), '▲ 25.0%']);
    expect(cells(screen.getByRole('row', { name: /^Standard Costs/ })).slice(3)).toEqual([zar(-250), '▼ 25.0%']);
    expect(cells(screen.getByRole('row', { name: /^Social Media/ })).at(-1)).toBe('▲ new');
    expect(cells(screen.getByRole('row', { name: /^Resident DJs/ })).at(-1)).toBe('no change');
    expect(cells(screen.getByRole('row', { name: /^Total/ }))).toEqual(['Total', zar(3000), zar(4500), zar(1500), '▲ 50.0%']);
    expect(screen.getByRole('region', { name: 'April 2026 vs May 2026' })).toBeTruthy();
  });

  it('shows weeks and the average per week for a month comparison', () => {
    renderPage(<CompareView data={report('month')} />);
    expect(cells(screen.getByRole('row', { name: /^Weeks/ }))).toEqual(['Weeks', '2', '3', '1', '']);
    expect(cells(screen.getByRole('row', { name: /^Average per week/ }))).toEqual(['Average per week', zar(1500), zar(1500), zar(0), 'no change']);
  });

  it('shows the average per week as zero for a side with no weeks', () => {
    const data = report('org');
    data.a.weeks = 0;
    renderPage(<CompareView data={data} />);
    expect(cells(screen.getByRole('row', { name: /^Average per week/ })).slice(1, 3)).toEqual([zar(0), zar(1500)]);
  });

  it('leaves out the weeks rows when comparing two single weeks', () => {
    renderPage(<CompareView data={report('week')} />);
    expect(screen.queryByRole('row', { name: /^Weeks/ })).toBeNull();
    expect(screen.queryByRole('row', { name: /^Average per week/ })).toBeNull();
  });

  it('charts every category against both sides', () => {
    renderPage(<CompareView data={report('month')} />);
    const data = JSON.parse(screen.getByTestId('bar-chart').getAttribute('data-chart')!);
    expect(data).toHaveLength(8);
    expect(data[0]).toEqual({ label: 'Headline Acts', 'April 2026': 2000, 'May 2026': 2500 });
    expect(screen.getAllByTestId('series').map((s) => s.getAttribute('data-key'))).toEqual(['April 2026', 'May 2026']);
  });

  it('lists headline acts with the week as "W2" inside a month', () => {
    renderPage(<CompareView data={report('month')} />);
    const acts = screen.getByRole('region', { name: 'Headline acts: April 2026' });
    expect(within(acts).getByRole('columnheader', { name: 'Week' })).toBeTruthy();
    expect(cells(within(acts).getByRole('row', { name: /DJ Max/ }))).toEqual(['W2', 'DJ Max', zar(1800), zar(200)]);
    expect(within(screen.getByRole('region', { name: 'Headline acts: May 2026' })).getByText('No headline acts.')).toBeTruthy();
  });

  it('lists headline acts with the full week over a period', () => {
    renderPage(<CompareView data={report('org')} />);
    expect(cells(screen.getByRole('row', { name: /DJ Max/ }))).toEqual(['Apr 2026 W2', 'DJ Max', zar(1800), zar(200)]);
  });

  it('lists headline acts without a week column for a single week', () => {
    renderPage(<CompareView data={report('week')} />);
    const acts = screen.getByRole('region', { name: 'Headline acts: April 2026' });
    expect(within(acts).queryByRole('columnheader', { name: 'Week' })).toBeNull();
    expect(cells(within(acts).getByRole('row', { name: /DJ Max/ }))).toEqual(['DJ Max', zar(1800), zar(200)]);
  });
});

describe('ComparePage (one organisation)', () => {
  it('shows "Loading…" and then offers the two latest months', async () => {
    const pending = deferred<typeof WEEKS>();
    const mock = mockApi({ 'GET /orgs/felice/weeks': () => pending.promise.then((w) => w), 'GET /orgs/felice/reports/compare': report('month') });
    renderOrgPage(<ComparePage />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    pending.resolve(WEEKS);
    expect(await screen.findByRole('region', { name: 'April 2026 vs May 2026' })).toBeTruthy();
    expect((screen.getByLabelText('Compare') as HTMLInputElement).value).toBe('2026-04');
    expect((screen.getByLabelText('With') as HTMLInputElement).value).toBe('2026-05');
    expect(mock.of('GET', '/orgs/felice/reports/compare')[0]!.query).toEqual({ mode: 'month', a: '2026-04', b: '2026-05' });
  });

  it('compares the only month with itself when there is just one', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks': [WEEKS[2]!], 'GET /orgs/felice/reports/compare': report('month') });
    renderOrgPage(<ComparePage />);
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.of('GET', '/orgs/felice/reports/compare')[0]!.query).toMatchObject({ a: '2026-05', b: '2026-05' });
  });

  it('says there is nothing to compare when no weeks exist', async () => {
    mockApi({ 'GET /orgs/felice/weeks': [] });
    renderOrgPage(<ComparePage />);
    expect(await screen.findByText("There's no data to compare yet.")).toBeTruthy();
    expect(screen.queryByLabelText('Compare')).toBeNull();
  });

  it('shows the error when the weeks cannot be loaded', async () => {
    mockApi({ 'GET /orgs/felice/weeks': fail(500, 'Weeks failed') });
    renderOrgPage(<ComparePage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Weeks failed');
  });

  it('compares again when a month is changed', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks': WEEKS, 'GET /orgs/felice/reports/compare': report('month') });
    renderOrgPage(<ComparePage />);
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    fireEvent.change(screen.getByLabelText('Compare'), { target: { value: '2026-03' } });
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.of('GET', '/orgs/felice/reports/compare').at(-1)!.query).toEqual({ mode: 'month', a: '2026-03', b: '2026-05' });
  });

  it('switches to week against week, newest first, defaulting to the two latest weeks', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks': WEEKS, 'GET /orgs/felice/reports/compare': report('week') });
    const { user } = renderOrgPage(<ComparePage />);
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    await user.click(screen.getByRole('button', { name: 'Week vs week' }));
    const compare = screen.getByLabelText('Compare') as HTMLSelectElement;
    expect([...compare.options].map((o) => o.text)).toEqual(['May 2026 W2', 'May 2026 W1', 'April 2026 W1', 'March 2026 W1']);
    expect(compare.value).toBe('3');
    expect((screen.getByLabelText('With') as HTMLSelectElement).value).toBe('4');
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.of('GET', '/orgs/felice/reports/compare').at(-1)!.query).toEqual({ mode: 'week', a: '3', b: '4' });
    await user.selectOptions(compare, '1');
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.of('GET', '/orgs/felice/reports/compare').at(-1)!.query.a).toBe('1');
  });

  it('compares the only week with itself in week mode', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks': [WEEKS[3]!], 'GET /orgs/felice/reports/compare': report('week') });
    const { user } = renderOrgPage(<ComparePage />);
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    await user.click(screen.getByRole('button', { name: 'Week vs week' }));
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.of('GET', '/orgs/felice/reports/compare').at(-1)!.query).toEqual({ mode: 'week', a: '4', b: '4' });
  });

  it('has nothing to compare in week mode either when no weeks exist', async () => {
    freezeToday('2026-06-15T10:00:00');
    mockApi({ 'GET /orgs/felice/weeks': [] });
    const { user } = renderOrgPage(<ComparePage />);
    await screen.findByText("There's no data to compare yet.");
    await user.click(screen.getByRole('button', { name: 'Week vs week' }));
    expect(screen.getByText("There's no data to compare yet.")).toBeTruthy();
  });

  it('shows the error when the comparison fails', async () => {
    mockApi({ 'GET /orgs/felice/weeks': WEEKS, 'GET /orgs/felice/reports/compare': fail(500, 'Compare failed') });
    renderOrgPage(<ComparePage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Compare failed');
  });

  it('shows "Loading…" while the comparison loads', async () => {
    const pending = deferred<CompareReport>();
    mockApi({ 'GET /orgs/felice/weeks': WEEKS, 'GET /orgs/felice/reports/compare': () => pending.promise.then((r) => r) });
    renderOrgPage(<ComparePage />);
    await screen.findByLabelText('Compare');
    expect((await screen.findByRole('status')).textContent).toBe('Loading…'); // the comparison starts loading just after the form appears
    pending.resolve(report('month'));
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
  });

  it('shows nothing when the server answers with no content', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks': WEEKS, 'GET /orgs/felice/reports/compare': empty() });
    renderOrgPage(<ComparePage />);
    await waitFor(() => expect(mock.of('GET', '/orgs/felice/reports/compare')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('region', { name: /vs/ })).toBeNull();
  });
});

describe('MasterComparePage', () => {
  it('compares two organisations over the last three months by default', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi({ 'GET /master/compare': report('org') });
    renderPage(<MasterComparePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Compare' })).toBeTruthy();
    expect((screen.getByLabelText('Compare') as HTMLSelectElement).value).toBe('felice');
    expect((screen.getByLabelText('With') as HTMLSelectElement).value).toBe('alur');
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.calls[0]!.query).toEqual({ mode: 'org', a: 'felice', b: 'alur', from: '2026-04', to: '2026-06' });
    expect(screen.queryByText(/Pick two different organisations/)).toBeNull();
  });

  it('asks again when an organisation or the period changes', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi({ 'GET /master/compare': report('org') });
    const { user } = renderPage(<MasterComparePage />);
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    await user.selectOptions(screen.getByLabelText('With'), 'felice');
    expect(screen.getByText('Pick two different organisations to see a difference.')).toBeTruthy();
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.calls.at(-1)!.query).toMatchObject({ a: 'felice', b: 'felice' });
    await user.selectOptions(screen.getByLabelText('Compare'), 'alur');
    await user.click(screen.getByRole('button', { name: '12 months' }));
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.calls.at(-1)!.query).toEqual({ mode: 'org', a: 'alur', b: 'felice', from: '2025-07', to: '2026-06' });
  });

  it('shows the error when the comparison fails', async () => {
    mockApi({ 'GET /master/compare': fail(500, 'Org compare failed') });
    renderPage(<MasterComparePage />);
    expect((await screen.findByRole('alert')).textContent).toBe('Org compare failed');
  });

  it('needs at least two organisations to compare them', () => {
    renderPage(<MasterComparePage />, { orgs: [felice] });
    expect(screen.getByText('Comparing organisations needs at least two.')).toBeTruthy();
  });

  it('compares this month with last month, combined', async () => {
    freezeToday('2026-01-20T10:00:00');
    const mock = mockApi({ 'GET /master/compare': report('month') });
    const { user } = renderPage(<MasterComparePage />);
    await user.click(screen.getByRole('button', { name: 'Month vs month (combined)' }));
    expect((screen.getByLabelText('Compare') as HTMLInputElement).value).toBe('2025-12');
    expect((screen.getByLabelText('With') as HTMLInputElement).value).toBe('2026-01');
    expect(screen.getByRole('region', { name: 'About this comparison' })).toBeTruthy();
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.calls.find((c) => c.query.mode === 'month')!.query).toEqual({ mode: 'month', a: '2025-12', b: '2026-01' });
    fireEvent.change(screen.getByLabelText('Compare'), { target: { value: '2025-10' } });
    fireEvent.change(screen.getByLabelText('With'), { target: { value: '2025-11' } });
    await screen.findByRole('region', { name: 'April 2026 vs May 2026' });
    expect(mock.calls.at(-1)!.query).toEqual({ mode: 'month', a: '2025-10', b: '2025-11' });
  });

  it('shows the error when the month comparison fails', async () => {
    mockApi({ 'GET /master/compare': fail(500, 'Month compare failed') });
    const { user } = renderPage(<MasterComparePage />);
    await user.click(screen.getByRole('button', { name: 'Month vs month (combined)' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Month compare failed');
  });
});
