import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActualImportPreview, ActualSheetList, ActualWeekSummary, WeekSummary } from '../../shared/types.ts';
import { ActualsImport } from '../src/ActualImport.tsx';
import { groups, weekSummary } from './fixtures.ts';
import { deferred, fail, freezeToday, mockApi, renderOrgPage, txt, xlsx, zar, type MockApi } from './helpers.tsx';

const actualWeek = (partial: Partial<ActualWeekSummary> & { id: number }): ActualWeekSummary => ({
  orgId: 1,
  year: 2026,
  month: 5,
  weekNo: 1,
  label: '01-05',
  byGroup: groups(),
  total: 0,
  paid: 0,
  adjusted: false,
  ...partial,
});

const SHEETS: ActualSheetList = {
  sheets: [
    { name: '08-05', total: 12000, sections: 4 },
    { name: '15-05', total: 15000, sections: 5 },
    { name: 'READ ME', total: 0, sections: 0 },
  ],
  suggested: '15-05',
};

function preview(partial: Partial<ActualImportPreview> = {}): ActualImportPreview {
  return {
    applied: false,
    tab: '15-05',
    year: 2026,
    month: 5,
    weekNo: 3,
    total: 15000,
    paid: 0,
    byGroup: groups({ headline: 10000, resident: 5000 }),
    sections: [
      { heading: "LOCAL DJ's", group: 'resident', sheetAmount: 5000, amount: 5000 },
      { heading: 'HEADLINERS', group: 'headline', sheetAmount: 10000, amount: 10000 },
    ],
    planned: { total: 14000, byGroup: groups({ headline: 9000, resident: 5000 }) },
    replaces: false,
    adjusted: false,
    warnings: [],
    ...partial,
  };
}

interface Setup {
  actuals?: ActualWeekSummary[];
  weeks?: WeekSummary[];
  sheets?: ActualSheetList;
  import?: (call: { query: Record<string, string> }) => unknown;
}

function install(s: Setup = {}): MockApi {
  return mockApi({
    'GET /orgs/felice/actuals': s.actuals ?? [],
    'GET /orgs/felice/weeks': s.weeks ?? [],
    'POST /orgs/felice/actuals/sheets': s.sheets ?? SHEETS,
    'POST /orgs/felice/actuals/import': s.import ?? ((c) => preview({ applied: c.query.dryRun === '0' })),
  });
}

const importCard = () => screen.getByRole('region', { name: 'Import actual expenditure' });
const listCard = () => screen.getByRole('region', { name: 'Imported actuals' });
const chooseFile = async (user: ReturnType<typeof renderOrgPage>['user'], name = 'expenses.xlsx') => {
  await user.upload(screen.getByLabelText('Expense workbook (.xlsx)'), xlsx(name));
  await screen.findByLabelText('Tab (one week)');
};
const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const amountInput = (heading: string) => screen.getByLabelText(`Amount to import for ${heading}`) as HTMLInputElement;

describe('the imported actuals list', () => {
  it('shows "Loading…" and then says nothing is imported yet', async () => {
    const pending = deferred<ActualWeekSummary[]>();
    mockApi({ 'GET /orgs/felice/actuals': () => pending.promise.then((a) => a), 'GET /orgs/felice/weeks': [] });
    renderOrgPage(<ActualsImport />);
    expect(within(listCard()).getByRole('status').textContent).toBe('Loading…');
    pending.resolve([]);
    expect(await within(listCard()).findByText('Nothing imported yet.')).toBeTruthy();
    expect(within(listCard()).queryByRole('table')).toBeNull();
  });

  it('shows the error when the lists cannot be loaded', async () => {
    mockApi({ 'GET /orgs/felice/actuals': fail(500, 'Actuals unavailable'), 'GET /orgs/felice/weeks': [] });
    renderOrgPage(<ActualsImport />);
    expect((await within(listCard()).findByRole('alert')).textContent).toBe('Actuals unavailable');
    expect(within(listCard()).queryByText('Nothing imported yet.')).toBeNull();
  });

  it('lists imported weeks newest first with plan, actual, variance and paid', async () => {
    install({
      actuals: [
        actualWeek({ id: 1, weekNo: 1, label: '01-05', total: 9000, paid: 4000 }),
        actualWeek({ id: 2, weekNo: 2, label: '08-05', total: 12000, paid: 12000, adjusted: true }),
        actualWeek({ id: 3, month: 6, weekNo: 1, label: '05-06', total: 3000, paid: 0 }),
      ],
      weeks: [weekSummary({ id: 11, weekNo: 1, total: 10000 }), weekSummary({ id: 12, weekNo: 2, total: 12000 })],
    });
    renderOrgPage(<ActualsImport />);
    await within(listCard()).findByRole('table');
    const rows = within(listCard()).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent!.trim())).toEqual(['June 2026 W1', 'May 2026 W2 adjusted', 'May 2026 W1']);
    // Newest first: June has no plan.
    expect(txt(rows[0]!)).toContain('not planned');
    expect(within(rows[0]!).getAllByRole('cell')[3]!.textContent).toBe('–');
    expect(txt(rows[1]!)).toContain('on plan');
    expect(txt(rows[1]!)).toContain(zar(12000));
    expect(txt(rows[2]!)).toContain(zar(10000));
    expect(txt(rows[2]!)).toContain('10.0% under plan');
    expect(txt(rows[2]!)).toContain(zar(4000));
  });

  it('removes the actuals of a week after confirming and reloads the list', async () => {
    const mock = install({ actuals: [actualWeek({ id: 7, weekNo: 1, total: 100 })] });
    mock.set({
      'DELETE /orgs/felice/actuals/7': () => {
        mock.set({ 'GET /orgs/felice/actuals': [] });
        return undefined;
      },
    });
    const { user } = renderOrgPage(<ActualsImport />);
    await user.click(await screen.findByRole('button', { name: 'Remove actuals for May 2026 W1' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove the actuals imported for May 2026 W1? The plan is not affected.');
    expect(await within(listCard()).findByText('Nothing imported yet.')).toBeTruthy();
    expect(mock.of('DELETE', '/orgs/felice/actuals/7')).toHaveLength(1);
  });

  it('keeps the week when the prompt is declined', async () => {
    const mock = install({ actuals: [actualWeek({ id: 7, weekNo: 1, total: 100 })] });
    const { user } = renderOrgPage(<ActualsImport />);
    vi.mocked(window.confirm).mockReturnValue(false);
    await user.click(await screen.findByRole('button', { name: 'Remove actuals for May 2026 W1' }));
    expect(mock.of('DELETE', '/orgs/felice/actuals/7')).toHaveLength(0);
    expect(within(listCard()).getByRole('table')).toBeTruthy();
  });

  it('shows the error when removing fails', async () => {
    const mock = install({ actuals: [actualWeek({ id: 7, weekNo: 1, total: 100 })] });
    mock.set({ 'DELETE /orgs/felice/actuals/7': fail(409, 'Week is locked') });
    const { user } = renderOrgPage(<ActualsImport />);
    await user.click(await screen.findByRole('button', { name: 'Remove actuals for May 2026 W1' }));
    expect((await within(listCard()).findByRole('alert')).textContent).toBe('Week is locked');
    expect(within(listCard()).getByRole('table')).toBeTruthy();
  });
});

describe('choosing the workbook', () => {
  it('offers the tabs, marks empty ones and selects the suggested tab', async () => {
    install();
    const { user } = renderOrgPage(<ActualsImport />);
    expect(screen.queryByLabelText('Tab (one week)')).toBeNull();
    expect(within(importCard()).getByRole('link', { name: 'expense workbook template' }).getAttribute('href')).toBe('/api/templates/actual-expenditure');
    await chooseFile(user);
    const tab = select('Tab (one week)');
    expect(tab.value).toBe('15-05');
    const options = [...tab.options];
    expect(options.map((o) => txt(o))).toEqual([`08-05 (${zar(12000)})`, `15-05 (${zar(15000)})`, 'READ ME (nothing to import)']);
    expect(options.map((o) => o.disabled)).toEqual([false, false, true]);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks the server for the sheets of the chosen file', async () => {
    const mock = install();
    const { user } = renderOrgPage(<ActualsImport />);
    const file = xlsx('expenses.xlsx');
    await user.upload(screen.getByLabelText('Expense workbook (.xlsx)'), file);
    await screen.findByLabelText('Tab (one week)');
    expect(mock.of('POST', '/orgs/felice/actuals/sheets')[0]!.body).toBe(file);
  });

  it('cannot preview until a tab is chosen when the workbook has no suggestion', async () => {
    const mock = install({ sheets: { sheets: [{ name: 'READ ME', total: 0, sections: 0 }], suggested: null } });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(importCard().querySelector('form')!);
    expect(mock.of('POST', '/orgs/felice/actuals/import')).toHaveLength(0);
  });

  it('does nothing when the form is submitted without a file', () => {
    const mock = install();
    renderOrgPage(<ActualsImport />);
    fireEvent.submit(importCard().querySelector('form')!);
    expect(mock.of('POST', '/orgs/felice/actuals/import')).toHaveLength(0);
  });

  it('shows the error when the workbook cannot be read', async () => {
    const mock = install();
    mock.set({ 'POST /orgs/felice/actuals/sheets': fail(400, 'Not an Excel workbook') });
    const { user } = renderOrgPage(<ActualsImport />);
    await user.upload(screen.getByLabelText('Expense workbook (.xlsx)'), xlsx());
    expect((await within(importCard()).findByRole('alert')).textContent).toBe('Not an Excel workbook');
    expect(screen.queryByLabelText('Tab (one week)')).toBeNull();
  });

  it('goes back to the empty form when the file is cleared', async () => {
    install();
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    fireEvent.change(screen.getByLabelText('Expense workbook (.xlsx)'), { target: { files: [] } });
    await waitFor(() => expect(screen.queryByLabelText('Tab (one week)')).toBeNull());
  });
});

describe('which month and year are suggested', () => {
  async function suggested(setup: Setup) {
    install(setup);
    const view = renderOrgPage(<ActualsImport />);
    // Wait for the planned weeks and actuals to be known before choosing the file.
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    await chooseFile(view.user);
    return { year: Number(select('Year').value), month: Number(select('Month').value) };
  }
  const w = (id: number, month: number, weekNo: number) => weekSummary({ id, month, weekNo });
  const a = (id: number, month: number, weekNo: number) => actualWeek({ id, month, weekNo });

  it('are this month when nothing is planned', async () => {
    freezeToday('2026-09-14T10:00:00');
    expect(await suggested({})).toEqual({ year: 2026, month: 9 });
  });

  it('are those of the first planned week when nothing has actuals yet', async () => {
    expect(await suggested({ weeks: [w(1, 5, 2), w(2, 5, 3)] })).toEqual({ year: 2026, month: 5 });
  });

  it('are those of the first planned week after the latest imported one', async () => {
    expect(await suggested({ weeks: [w(1, 5, 4), w(2, 6, 1)], actuals: [a(1, 5, 4)] })).toEqual({ year: 2026, month: 6 });
  });

  it('go back to the earliest planned week still without actuals when none is later', async () => {
    expect(await suggested({ weeks: [w(1, 4, 1), w(2, 5, 2), w(3, 5, 3)], actuals: [a(2, 5, 2), a(3, 5, 3)] })).toEqual({ year: 2026, month: 4 });
  });

  it('are those of the last planned week when every planned week already has actuals', async () => {
    expect(await suggested({ weeks: [w(1, 5, 1), w(2, 5, 2)], actuals: [a(1, 5, 1), a(2, 5, 2)] })).toEqual({ year: 2026, month: 5 });
  });
});

describe('which week a sheet is imported against', () => {
  const sheet = (name: string, sections = 3) => ({ name, total: sections * 1000, sections });
  const week = () => Number(select('Week').value);

  it('is its position among the weekly sheets: the first is week 1, the second week 2', async () => {
    install({ sheets: { sheets: [sheet('01-05'), sheet('08-05'), sheet('15-05'), sheet('22-05'), sheet('29-05')], suggested: '29-05' } });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    expect(week()).toBe(5);
    for (const [name, expected] of [['01-05', 1], ['08-05', 2], ['15-05', 3], ['22-05', 4], ['29-05', 5]] as const) {
      await user.selectOptions(select('Tab (one week)'), name);
      expect(week()).toBe(expected);
    }
  });

  it('does not count a sheet with nothing to import, so a leading READ ME does not push the weeks along', async () => {
    install({ sheets: { sheets: [sheet('READ ME', 0), sheet('01-05'), sheet('SUMMARY', 0), sheet('08-05')], suggested: '08-05' } });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    expect(week()).toBe(2);
    await user.selectOptions(select('Tab (one week)'), '01-05');
    expect(week()).toBe(1);
  });

  it('is sent with the preview and the import, and can still be changed by hand', async () => {
    const mock = install();
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.selectOptions(select('Tab (one week)'), '08-05');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    expect(mock.of('POST', '/orgs/felice/actuals/import')[0]!.query).toMatchObject({ sheet: '08-05', weekNo: '1' });
    await user.selectOptions(select('Week'), '4');
    expect(week()).toBe(4);
  });

  it('is left as it was for a sixth sheet, which no month has a week for', async () => {
    install({ sheets: { sheets: ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => sheet(n)), suggested: 'f' } });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    expect(week()).toBe(1);
    await user.selectOptions(select('Tab (one week)'), 'e');
    expect(week()).toBe(5);
    await user.selectOptions(select('Week'), '3');
    await user.selectOptions(select('Tab (one week)'), 'f');
    expect(week()).toBe(3);
  });
});

describe('previewing a week', () => {
  async function previewed(opts: Setup = {}) {
    const mock = install(opts);
    const view = renderOrgPage(<ActualsImport />);
    await chooseFile(view.user);
    await view.user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    return { mock, ...view };
  }

  it('checks the chosen tab and week without saving, and shows the sections and comparison', async () => {
    const { mock } = await previewed({ weeks: [weekSummary({ id: 1, month: 5, weekNo: 2 })] });
    const call = mock.of('POST', '/orgs/felice/actuals/import')[0]!;
    expect(call.query).toEqual({ sheet: '15-05', year: '2026', month: '5', weekNo: '2', dryRun: '1' });
    expect(screen.getByRole('heading', { name: /May 2026 W3\s+from tab 15-05/ })).toBeTruthy();
    expect(amountInput("LOCAL DJ's").value).toBe('5000');
    expect(amountInput('HEADLINERS').value).toBe('10000');
    expect(txt(screen.getByRole('row', { name: /Actual for the week/ }))).toContain(zar(15000));
    expect(screen.getByRole('button', { name: 'Import May 2026 W3' })).toBeTruthy();
    expect(screen.queryByText(/were imported before/)).toBeNull();
    expect(screen.queryByText(/to check/)).toBeNull();
    expect(screen.queryByText(/changed from the sheet/)).toBeNull();
    expect(screen.queryByText(/Miscellaneous/)).toBeNull();
    const comparison = screen.getAllByRole('table')[1]!;
    expect(txt(within(comparison).getByRole('row', { name: /Headline Acts/ }))).toContain('11.1% over plan');
    expect(txt(within(comparison).getByRole('row', { name: /Resident DJs/ }))).toContain('on plan');
    expect(within(comparison).getByRole('row', { name: /Hosts & Promoters/ }).textContent).toContain('–');
    expect(txt(within(comparison).getByRole('row', { name: /^Total/ }))).toContain('7.1% over plan');
  });

  it('says the week has no plan when there is nothing to compare with', async () => {
    mockApi({
      'GET /orgs/felice/actuals': [],
      'GET /orgs/felice/weeks': [],
      'POST /orgs/felice/actuals/sheets': SHEETS,
      'POST /orgs/felice/actuals/import': preview({ planned: null }),
    });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText(/has no plan yet, so there is nothing to compare it with/)).toBeTruthy();
    expect(screen.queryByText('Planned against actual for this week')).not.toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('warns that a week imported before will be replaced', async () => {
    mockApi({
      'GET /orgs/felice/actuals': [],
      'GET /orgs/felice/weeks': [],
      'POST /orgs/felice/actuals/sheets': SHEETS,
      'POST /orgs/felice/actuals/import': preview({ replaces: true, warnings: ['Tab has a hidden row', 'Totals look low'] }),
    });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect((await screen.findByText(/were imported before. Importing will replace them./)).className).toBe('error');
    expect(screen.getByRole('button', { name: 'Replace May 2026 W3' })).toBeTruthy();
    expect(screen.getByText('2 things to check')).toBeTruthy();
    expect(screen.getByText('Totals look low')).toBeTruthy();
  });

  it('uses the singular for one warning', async () => {
    mockApi({
      'GET /orgs/felice/actuals': [],
      'GET /orgs/felice/weeks': [],
      'POST /orgs/felice/actuals/sheets': SHEETS,
      'POST /orgs/felice/actuals/import': preview({ warnings: ['One thing'] }),
    });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('1 thing to check')).toBeTruthy();
  });

  it('explains the Miscellaneous total, and marks a section changed from the sheet', async () => {
    mockApi({
      'GET /orgs/felice/actuals': [],
      'GET /orgs/felice/weeks': [],
      'POST /orgs/felice/actuals/sheets': SHEETS,
      'POST /orgs/felice/actuals/import': preview({
        sections: [{ heading: 'MISCELLANEOUS', group: 'marketing', sheetAmount: 3000, amount: 2000 }],
        total: 2000,
        planned: { total: 0, byGroup: groups() },
      }),
    });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText(/Miscellaneous total can include costs that belong to the other company/)).toBeTruthy();
    expect(screen.getByText('changed from the sheet')).toBeTruthy();
    expect(txt(screen.getByRole('row', { name: /MISCELLANEOUS/ }))).toContain(zar(3000));
    expect(txt(screen.getByRole('row', { name: /MISCELLANEOUS/ }))).toContain('Marketing & other');
  });

  it('forgets the preview when the tab, month, year or week changes', async () => {
    const { user } = await previewed();
    await user.selectOptions(select('Tab (one week)'), '08-05');
    expect(screen.queryByRole('heading', { name: /from tab/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    await user.selectOptions(select('Month'), '6');
    expect(screen.queryByRole('heading', { name: /from tab/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    fireEvent.change(select('Year'), { target: { value: '2027' } });
    expect(screen.queryByRole('heading', { name: /from tab/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    await user.selectOptions(select('Week'), '5');
    expect(screen.queryByRole('heading', { name: /from tab/ })).toBeNull();
  });

  it('sends the chosen month, year and week', async () => {
    const mock = install();
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.selectOptions(select('Month'), '11');
    fireEvent.change(select('Year'), { target: { value: '2025' } });
    await user.selectOptions(select('Tab (one week)'), '08-05');
    await user.selectOptions(select('Week'), '4');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    expect(mock.of('POST', '/orgs/felice/actuals/import')[0]!.query).toEqual({ sheet: '08-05', year: '2025', month: '11', weekNo: '4', dryRun: '1' });
  });

  it('shows the server error when the preview fails', async () => {
    const mock = install();
    mock.set({ 'POST /orgs/felice/actuals/import': fail(422, 'Tab has no section totals') });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect((await within(importCard()).findByRole('alert')).textContent).toBe('Tab has no section totals');
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables Preview while the server is working', async () => {
    const pending = deferred<ActualImportPreview>();
    const mock = install();
    mock.set({ 'POST /orgs/felice/actuals/import': () => pending.promise.then((p) => p) });
    const { user } = renderOrgPage(<ActualsImport />);
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(true);
    pending.resolve(preview());
    await screen.findByRole('heading', { name: /from tab/ });
  });
});

describe('adjusting a section total', () => {
  async function previewed(handler?: Setup['import']) {
    const mock = install({ import: handler });
    const view = renderOrgPage(<ActualsImport />);
    await chooseFile(view.user);
    await view.user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    return { mock, ...view };
  }
  const importCalls = (mock: MockApi) => mock.of('POST', '/orgs/felice/actuals/import');

  /** What the server does with an adjustment: the section amount follows it, the total is re-added. */
  const adjusting = (c: { query: Record<string, string> }) => {
    const adjust = c.query.adjust ? (JSON.parse(c.query.adjust) as Record<string, number>) : {};
    const dj = adjust["LOCAL DJ's"] ?? 5000;
    return preview({
      applied: c.query.dryRun === '0',
      sections: [
        { heading: "LOCAL DJ's", group: 'resident', sheetAmount: 5000, amount: dj },
        { heading: 'HEADLINERS', group: 'headline', sheetAmount: 10000, amount: 10000 },
      ],
      total: dj + 10000,
      adjusted: dj !== 5000,
    });
  };

  it('checks the preview again with the changed total when the field loses focus', async () => {
    const { user, mock } = await previewed(adjusting);
    await user.clear(amountInput("LOCAL DJ's"));
    await user.type(amountInput("LOCAL DJ's"), '4000.5');
    await user.tab();
    await waitFor(() => expect(importCalls(mock)).toHaveLength(2));
    const second = importCalls(mock)[1]!;
    expect(second.query.dryRun).toBe('1');
    expect(JSON.parse(second.query.adjust!)).toEqual({ "LOCAL DJ's": 4000.5 });
    expect(await screen.findByText('changed from the sheet')).toBeTruthy();
    expect(txt(screen.getByRole('row', { name: /Actual for the week/ }))).toContain(zar(14000.5));
  });

  it('does not ask the server again when a field is tabbed through unchanged', async () => {
    const { user, mock } = await previewed(adjusting);
    await user.click(amountInput("LOCAL DJ's"));
    await user.tab();
    expect(importCalls(mock)).toHaveLength(1);
  });

  it.each([['', 'empty'], ['-5', 'negative']])('refuses a %s amount and does not ask the server', async (value) => {
    const { user, mock } = await previewed(adjusting);
    await user.clear(amountInput("LOCAL DJ's"));
    if (value) await user.type(amountInput("LOCAL DJ's"), value);
    await user.tab();
    expect((await within(importCard()).findByRole('alert')).textContent).toBe("Enter an amount of 0 or more for LOCAL DJ's.");
    expect(importCalls(mock)).toHaveLength(1);
  });

  it('sets a section back to the sheet figure, leaving no adjustment', async () => {
    const { user, mock } = await previewed(adjusting);
    await user.clear(amountInput("LOCAL DJ's"));
    await user.type(amountInput("LOCAL DJ's"), '4000');
    await user.tab();
    await waitFor(() => expect(importCalls(mock)).toHaveLength(2));
    await user.clear(amountInput("LOCAL DJ's"));
    await user.type(amountInput("LOCAL DJ's"), '5000');
    await user.tab();
    await waitFor(() => expect(importCalls(mock)).toHaveLength(3));
    expect(importCalls(mock)[2]!.query).not.toHaveProperty('adjust');
  });

  it('keeps an earlier adjustment when a different section is changed', async () => {
    const { user, mock } = await previewed(adjusting);
    await user.clear(amountInput("LOCAL DJ's"));
    await user.type(amountInput("LOCAL DJ's"), '4000');
    await user.tab();
    await waitFor(() => expect(importCalls(mock)).toHaveLength(2));
    await screen.findByText('changed from the sheet');
    await user.clear(amountInput('HEADLINERS'));
    await user.type(amountInput('HEADLINERS'), '9000');
    await user.tab();
    await waitFor(() => expect(importCalls(mock)).toHaveLength(3));
    expect(JSON.parse(importCalls(mock)[2]!.query.adjust!)).toEqual({ "LOCAL DJ's": 4000, HEADLINERS: 9000 });
  });

  it('saves with the adjustment, reports it and refreshes the list of imported weeks', async () => {
    const { user, mock } = await previewed(adjusting);
    mock.set({
      'GET /orgs/felice/actuals': [actualWeek({ id: 5, weekNo: 3, label: '15-05', total: 14000, adjusted: true })],
    });
    await user.clear(amountInput("LOCAL DJ's"));
    await user.type(amountInput("LOCAL DJ's"), '4000');
    await user.tab();
    await waitFor(() => expect(importCalls(mock)).toHaveLength(2));
    await user.click(await screen.findByRole('button', { name: 'Import May 2026 W3' }));
    await waitFor(() => expect(importCalls(mock)).toHaveLength(3));
    const apply = importCalls(mock)[2]!;
    expect(apply.query.dryRun).toBe('0');
    expect(JSON.parse(apply.query.adjust!)).toEqual({ "LOCAL DJ's": 4000 });
    const done = await within(importCard()).findByRole('status');
    expect(txt(done)).toBe(`Imported May 2026 W3 from tab 15-05: actual ${zar(14000)}. It now appears in Plan vs actual.`);
    expect(within(importCard()).queryByRole('heading', { name: /from tab/ })).toBeNull();
    expect(await within(listCard()).findByRole('table')).toBeTruthy();
    expect(txt(listCard())).toContain('adjusted');
  });

  it('ignores an invalid entry when importing, sending only the valid adjustments', async () => {
    const { user, mock } = await previewed(adjusting);
    await user.clear(amountInput("LOCAL DJ's"));
    await user.type(amountInput("LOCAL DJ's"), 'x');
    fireEvent.change(amountInput("LOCAL DJ's"), { target: { value: '-3' } });
    await user.click(screen.getByRole('button', { name: 'Import May 2026 W3' }));
    await waitFor(() => expect(importCalls(mock).some((c) => c.query.dryRun === '0')).toBe(true));
    expect(importCalls(mock).at(-1)!.query).not.toHaveProperty('adjust');
  });

  it('shows the error when saving fails and keeps the preview', async () => {
    const { user, mock } = await previewed();
    mock.set({ 'POST /orgs/felice/actuals/import': (c) => (c.query.dryRun === '0' ? fail(500, 'Could not save') : preview()) });
    await user.click(screen.getByRole('button', { name: 'Import May 2026 W3' }));
    expect((await within(importCard()).findByRole('alert')).textContent).toBe('Could not save');
    expect(screen.getByRole('heading', { name: /from tab/ })).toBeTruthy();
  });

  it('shows the new preview if the server answers a save with an unapplied result', async () => {
    const { user, mock } = await previewed();
    mock.set({ 'POST /orgs/felice/actuals/import': () => preview({ warnings: ['Still checking'] }) });
    await user.click(screen.getByRole('button', { name: 'Import May 2026 W3' }));
    expect(await screen.findByText('Still checking')).toBeTruthy();
  });

  it('starts a fresh preview, clearing earlier edits and the success message', async () => {
    const { user } = await previewed();
    fireEvent.change(amountInput('HEADLINERS'), { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: 'Import May 2026 W3' }));
    await within(importCard()).findByRole('status');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByRole('heading', { name: /from tab/ });
    expect(within(importCard()).queryByRole('status')).toBeNull();
    expect(amountInput('HEADLINERS').value).toBe('10000');
  });
});
