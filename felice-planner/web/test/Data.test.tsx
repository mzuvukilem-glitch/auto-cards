import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ImportResult, ImportWeekPreview } from '../../shared/types.ts';
import { DataPage } from '../src/pages/Data.tsx';
import { cells, deferred, fail, freezeToday, mockApi, renderOrgPage, txt, xlsx, zar } from './helpers.tsx';

const week = (weekNo: number, exists: boolean, total = 1000): ImportWeekPreview => ({
  year: 2026,
  month: 5,
  weekNo,
  label: `May 2026 W${weekNo}`,
  itemCount: 4 + weekNo,
  total,
  exists,
});
const result = (weeks: ImportWeekPreview[], extra: Partial<ImportResult> = {}): ImportResult => ({ format: 'planner', applied: false, weeks, warnings: [], ...extra });

const base = (extra: Record<string, unknown> = {}) => ({
  'GET /orgs/felice/actuals': [],
  'GET /orgs/felice/weeks': [],
  'POST /orgs/felice/import': result([week(1, false), week(2, true, 2500)]),
  ...extra,
});
const card = () => screen.getByRole('region', { name: 'Import from Excel' });
const fileInput = () => within(card()).getByLabelText('Excel file (.xlsx)') as HTMLInputElement;
const previewButton = () => within(card()).getByRole('button', { name: 'Preview' }) as HTMLButtonElement;

describe('DataPage', () => {
  it('has the planner import, the actuals import and the export in one page', async () => {
    mockApi(base());
    renderOrgPage(<DataPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Import & export/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Felice logo' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Import from Excel' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Import actual expenditure' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Export to Excel' })).toBeTruthy();
    await screen.findByText('Nothing imported yet.');
  });
});

describe('importing planned weeks', () => {
  it('links to the templates and waits for a file before it can preview', () => {
    mockApi(base());
    renderOrgPage(<DataPage />);
    expect(within(card()).getByRole('link', { name: 'planned weeks (Excel)' }).getAttribute('href')).toBe('/api/templates/planned-weeks');
    expect(within(card()).getByRole('link', { name: 'the original planner layout (Excel)' }).getAttribute('href')).toBe('/api/templates/planner-layout');
    expect(previewButton().disabled).toBe(true);
  });

  it('checks the file for the chosen year without saving, and shows each week', async () => {
    freezeToday('2026-06-15T10:00:00');
    const mock = mockApi(base());
    const { user } = renderOrgPage(<DataPage />);
    expect((within(card()).getByLabelText('Year (planner layout only)') as HTMLInputElement).value).toBe('2026');
    fireEvent.change(within(card()).getByLabelText('Year (planner layout only)'), { target: { value: '2025' } });
    const file = xlsx('planner.xlsx');
    await user.upload(fileInput(), file);
    await user.click(previewButton());
    expect(await within(card()).findByText('May 2026 W1')).toBeTruthy();
    const call = mock.of('POST', '/orgs/felice/import')[0]!;
    expect(call.query).toEqual({ year: '2025', dryRun: '1' });
    expect(call.body).toBe(file);
    expect(txt(within(card()).getByText(/Found/).closest('p'))).toBe('Found 2 weeks (planner layout). 1 already exist and will be replaced.');
    expect(cells(within(card()).getByRole('row', { name: /W1/ }))).toEqual(['May 2026 W1', '5', zar(1000), 'New']);
    expect(cells(within(card()).getByRole('row', { name: /W2/ }))).toEqual(['May 2026 W2', '6', zar(2500), 'Replaces existing']);
    expect(within(card()).getByRole('button', { name: 'Import 2 weeks' })).toBeTruthy();
    expect(within(card()).queryByText(/things to check/)).toBeNull();
  });

  it('describes an app export, and says nothing about replacing when nothing exists yet', async () => {
    mockApi(base({ 'POST /orgs/felice/import': result([week(1, false)], { format: 'flat' }) }));
    const { user } = renderOrgPage(<DataPage />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    const summary = await within(card()).findByText(/Found/);
    expect(txt(summary.closest('p'))).toBe('Found 1 weeks (app export).');
  });

  it('lists warnings to check', async () => {
    mockApi(base({ 'POST /orgs/felice/import': result([week(1, false)], { warnings: ['Row 7 skipped', 'Unknown column'] }) }));
    const { user } = renderOrgPage(<DataPage />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect(await within(card()).findByText('2 things to check')).toBeTruthy();
    expect(within(card()).getByText('Row 7 skipped')).toBeTruthy();
  });

  it('imports for real after the preview and reports it', async () => {
    const mock = mockApi(base({ 'POST /orgs/felice/import': (c: { query: Record<string, string> }) => result([week(1, false), week(2, true)], { applied: c.query.dryRun === '0' }) }));
    const { user } = renderOrgPage(<DataPage />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    await user.click(await within(card()).findByRole('button', { name: 'Import 2 weeks' }));
    expect(await within(card()).findByText('Imported 2 weeks.')).toBeTruthy();
    expect(mock.of('POST', '/orgs/felice/import').map((c) => c.query.dryRun)).toEqual(['1', '0']);
    expect(within(card()).queryByRole('button', { name: /Import \d+ weeks/ })).toBeNull();
    expect(cells(within(card()).getByRole('row', { name: /W1/ })).at(-1)).toBe('Imported');
    expect(cells(within(card()).getByRole('row', { name: /W2/ })).at(-1)).toBe('Imported');
  });

  it('shows the server error', async () => {
    mockApi(base({ 'POST /orgs/felice/import': fail(400, 'Not a planner file') }));
    const { user } = renderOrgPage(<DataPage />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect((await within(card()).findByRole('alert')).textContent).toBe('Not a planner file');
    expect(previewButton().disabled).toBe(false);
  });

  it('disables Preview while the server is working and the import button too', async () => {
    const pending = deferred<ImportResult>();
    mockApi(base({ 'POST /orgs/felice/import': () => pending.promise.then((r) => r) }));
    const { user } = renderOrgPage(<DataPage />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect(previewButton().disabled).toBe(true);
    pending.resolve(result([week(1, false)]));
    await within(card()).findByRole('button', { name: 'Import 1 weeks' });
    expect(previewButton().disabled).toBe(false);
  });

  it('forgets the preview when another file or year is chosen', async () => {
    mockApi(base());
    const { user } = renderOrgPage(<DataPage />);
    await user.upload(fileInput(), xlsx('a.xlsx'));
    await user.click(previewButton());
    await within(card()).findByRole('button', { name: 'Import 2 weeks' });
    await user.upload(fileInput(), xlsx('b.xlsx'));
    expect(within(card()).queryByRole('button', { name: 'Import 2 weeks' })).toBeNull();
    await user.click(previewButton());
    await within(card()).findByRole('button', { name: 'Import 2 weeks' });
    fireEvent.change(within(card()).getByLabelText('Year (planner layout only)'), { target: { value: '2024' } });
    expect(within(card()).queryByRole('button', { name: 'Import 2 weeks' })).toBeNull();
  });

  it('does nothing when submitted with no file, and treats clearing the chooser as no file', async () => {
    const mock = mockApi(base());
    const { user } = renderOrgPage(<DataPage />);
    fireEvent.submit(fileInput().closest('form')!);
    expect(mock.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await user.upload(fileInput(), xlsx());
    expect(previewButton().disabled).toBe(false);
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(previewButton().disabled).toBe(true);
  });
});

describe('exporting', () => {
  it('links to a download for the last twelve months by month', async () => {
    freezeToday('2026-06-15T10:00:00');
    mockApi(base());
    renderOrgPage(<DataPage />);
    const exportCard = screen.getByRole('region', { name: 'Export to Excel' });
    const link = within(exportCard).getByRole('link', { name: 'Download .xlsx' });
    expect(link.getAttribute('href')).toBe('/api/orgs/felice/reports/export.xlsx?from=2025-07&to=2026-06&groupBy=month');
    expect(link.hasAttribute('download')).toBe(true);
  });

  it('follows the period and grouping that are chosen', async () => {
    freezeToday('2026-06-15T10:00:00');
    mockApi(base());
    const { user } = renderOrgPage(<DataPage />);
    const exportCard = screen.getByRole('region', { name: 'Export to Excel' });
    await user.click(within(exportCard).getByRole('button', { name: '3 months' }));
    await user.click(within(exportCard).getByRole('button', { name: 'By week' }));
    await waitFor(() =>
      expect(within(exportCard).getByRole('link', { name: 'Download .xlsx' }).getAttribute('href')).toBe('/api/orgs/felice/reports/export.xlsx?from=2026-04&to=2026-06&groupBy=week'),
    );
  });
});
