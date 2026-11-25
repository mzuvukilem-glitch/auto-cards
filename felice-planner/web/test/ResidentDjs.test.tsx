import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DjImportResult, DjImportRow, LineItem, PaymentSchedule } from '../../shared/types.ts';
import { api, type ItemInput } from '../src/api.ts';
import type { LineActions } from '../src/ItemEditor.tsx';
import { PaymentSchedulePanel, ResidentDjSection, djActions } from '../src/ResidentDjs.tsx';
import { lineItem } from './fixtures.ts';
import { deferred, fail, mockApi, txt, xlsx, zar } from './helpers.tsx';

const dj = (id: number, name: string, amount: number) => lineItem({ id, category: 'resident', name, amount, isDj: true });
const lump = (id: number, name: string, amount: number) => lineItem({ id, category: 'resident', name, amount, isDj: false });

function importResult(rows: DjImportRow[], extra: Partial<DjImportResult> = {}): DjImportResult {
  return {
    applied: false,
    rows,
    added: rows.filter((r) => r.status === 'new').length,
    updated: rows.filter((r) => r.status === 'update').length,
    unchanged: rows.filter((r) => r.status === 'unchanged').length,
    total: rows.reduce((s, r) => s + r.rate, 0),
    warnings: [],
    ...extra,
  };
}
const row = (name: string, rate: number, status: DjImportRow['status'], currentRate: number | null = null): DjImportRow => ({ name, rate, notes: '', status, currentRate });

function makeActions(): LineActions & { add: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn(async (i: ItemInput) => dj(50, i.name, i.amount)),
    update: vi.fn(async (id: number, i: ItemInput) => dj(id, i.name, i.amount)),
    remove: vi.fn(async () => undefined),
  };
}

function Section({
  initial,
  actions = makeActions(),
  importList = vi.fn(async () => importResult([])),
  onImported = vi.fn(),
  onChange,
  extra,
}: {
  initial: LineItem[];
  actions?: LineActions;
  importList?: (file: File, dryRun: boolean) => Promise<DjImportResult>;
  onImported?: () => void;
  onChange?: (items: LineItem[]) => void;
  extra?: React.ReactNode;
}) {
  const [items, setItems] = useState(initial);
  return (
    <ResidentDjSection
      actions={actions}
      importList={importList}
      items={items}
      onImported={onImported}
      extra={extra}
      onItemsChange={(next) => {
        onChange?.(next);
        setItems(next);
      }}
    />
  );
}

describe('ResidentDjSection', () => {
  it('lists the DJs by name, ignoring case, with their rates', () => {
    render(<Section initial={[dj(1, 'zed', 900), dj(2, 'Alpha', 700), dj(3, 'bravo', 800)]} />);
    const names = screen.getAllByLabelText('Name').map((i) => (i as HTMLInputElement).value);
    expect(names).toEqual(['Alpha', 'bravo', 'zed']);
    expect(screen.getByRole('columnheader', { name: 'Rate (R)' })).toBeTruthy();
    expect(screen.getByText(/Add each DJ with their rate/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Lump-sum Resident DJs line' })).toBeNull();
  });

  it('shows the extra content under the list', () => {
    render(<Section initial={[]} extra={<p>Payment schedule goes here</p>} />);
    expect(screen.getByText('Payment schedule goes here')).toBeTruthy();
  });

  it('adds a DJ through the actions', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    const onChange = vi.fn();
    render(<Section initial={[lump(9, 'Old lump', 5000)]} actions={actions} onChange={onChange} />);
    await user.type(screen.getByLabelText('New Resident DJs name'), 'DJ Neo');
    await user.type(screen.getByLabelText('New Resident DJs rate'), '650');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(actions.add).toHaveBeenCalledWith({ category: 'resident', name: 'DJ Neo', amount: 650, riderCost: undefined, notes: '' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall![0].map((i: LineItem) => i.name)).toEqual(['Old lump', 'DJ Neo']);
  });

  it('keeps the lump-sum lines when a DJ is removed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Section initial={[dj(1, 'Alpha', 700), lump(9, 'Old lump', 5000)]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.lastCall![0].map((i: LineItem) => i.name)).toEqual(['Old lump']);
  });
});

describe('lump-sum Resident DJs lines', () => {
  it('are counted, and say so, while there are no individual DJs', () => {
    render(<Section initial={[lump(9, 'Resident DJs (all)', 5000)]} />);
    const card = screen.getByRole('region', { name: 'Lump-sum Resident DJs line' });
    expect(within(card).getByRole('status').textContent).toContain('These lines are counted as they are.');
    const r = within(card).getByRole('row', { name: /Resident DJs \(all\)/ });
    expect(txt(r)).toContain(zar(5000));
    expect(txt(r)).toContain('Counted');
    expect(r.className).toBe('');
  });

  it('are marked as not counted once individual DJs exist', () => {
    render(<Section initial={[dj(1, 'Alpha', 700), lump(9, 'Resident DJs (all)', 5000)]} />);
    const card = screen.getByRole('region', { name: 'Lump-sum Resident DJs line' });
    expect(within(card).getByRole('status').textContent).toContain('These lines are no longer counted');
    const r = within(card).getByRole('row', { name: /Resident DJs \(all\)/ });
    expect(txt(r)).toContain('Not counted');
    expect(r.className).toBe('ignored');
  });

  it('are removed after confirming', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    render(<Section initial={[dj(1, 'Alpha', 700), lump(9, 'Resident DJs (all)', 5000)]} actions={actions} />);
    const card = screen.getByRole('region', { name: 'Lump-sum Resident DJs line' });
    await user.click(within(card).getByRole('button', { name: 'Remove Resident DJs (all)' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove "Resident DJs (all)"?');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Lump-sum Resident DJs line' })).toBeNull());
    expect(actions.remove).toHaveBeenCalledWith(9);
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('stay when the prompt is declined', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    const actions = makeActions();
    render(<Section initial={[lump(9, 'Resident DJs (all)', 5000)]} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Remove Resident DJs (all)' }));
    expect(actions.remove).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Lump-sum Resident DJs line' })).toBeTruthy();
  });

  it('stay and show the error when removing fails, then clear it on success', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    actions.remove.mockRejectedValueOnce(new Error('Locked week'));
    render(<Section initial={[lump(9, 'Resident DJs (all)', 5000), lump(10, 'Second lump', 100)]} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Remove Resident DJs (all)' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Locked week');
    await user.click(screen.getByRole('button', { name: 'Remove Second lump' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('clears a stale error when a later removal succeeds', async () => {
    const user = userEvent.setup();
    const actions = makeActions();
    actions.remove.mockRejectedValueOnce(new Error('Locked week'));
    render(<Section initial={[lump(9, 'A lump', 1), lump(10, 'B lump', 2), lump(11, 'C lump', 3)]} actions={actions} />);
    await user.click(screen.getByRole('button', { name: 'Remove A lump' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Remove B lump' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByRole('button', { name: 'Remove C lump' })).toBeTruthy();
  });
});

describe('importing DJs from a file', () => {
  const card = () => screen.getByRole('region', { name: 'Import resident DJs from a file' });
  const fileInput = () => within(card()).getByLabelText('File') as HTMLInputElement;
  const previewButton = () => within(card()).getByRole('button', { name: 'Preview' }) as HTMLButtonElement;

  it('links to the templates and keeps Preview disabled until a file is chosen', () => {
    render(<Section initial={[]} />);
    expect(within(card()).getByRole('link', { name: 'Excel' }).getAttribute('href')).toBe('/api/templates/resident-djs');
    expect(within(card()).getByRole('link', { name: 'CSV' }).getAttribute('href')).toBe('/api/templates/resident-djs-csv');
    expect(previewButton().disabled).toBe(true);
  });

  it('checks the file without saving and shows what would happen to each DJ', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async (_f: File, _d: boolean) =>
      importResult([row('Alpha', 800, 'update', 700), row('Neo', 650, 'new'), row('Zed', 900, 'unchanged', 900)], { warnings: ['Row 5 has no rate'] }),
    );
    render(<Section initial={[]} importList={importList} />);
    const file = xlsx('djs.xlsx');
    await user.upload(fileInput(), file);
    await user.click(previewButton());
    await waitFor(() => expect(importList).toHaveBeenCalledWith(file, true));
    const text = txt(card());
    expect(text).toContain(`Found 3 DJs with rates adding up to ${zar(2350)}: 1 new, 1 to update, 1 unchanged.`);
    expect(txt(within(card()).getByRole('row', { name: /Alpha/ }))).toContain(`Updated (now ${zar(700)})`);
    expect(txt(within(card()).getByRole('row', { name: /Neo/ }))).toContain('Added');
    expect(txt(within(card()).getByRole('row', { name: /Zed/ }))).toContain('No change');
    expect(within(card()).getByText('1 thing to check')).toBeTruthy();
    expect(within(card()).getByText('Row 5 has no rate')).toBeTruthy();
    expect(within(card()).getByRole('button', { name: 'Import 2 DJs' })).toBeTruthy();
    expect(importList).toHaveBeenCalledTimes(1);
  });

  it('shows a plural warning heading and a singular import button', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async () => importResult([row('Neo', 650, 'new')], { warnings: ['a', 'b'] }));
    render(<Section initial={[]} importList={importList} />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect(await within(card()).findByText('2 things to check')).toBeTruthy();
    expect(within(card()).getByRole('button', { name: 'Import 1 DJ' })).toBeTruthy();
  });

  it('shows an update with an unknown current rate as zero', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async () => importResult([row('Neo', 650, 'update', null)]));
    render(<Section initial={[]} importList={importList} />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect(txt(await within(card()).findByRole('row', { name: /Neo/ }))).toContain(`Updated (now ${zar(0)})`);
  });

  it('has nothing to import when every DJ is unchanged', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async () => importResult([row('Zed', 900, 'unchanged', 900)]));
    render(<Section initial={[]} importList={importList} />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    const button = (await within(card()).findByRole('button', { name: 'Nothing to import' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(card()).queryByText(/to check/)).toBeNull();
  });

  it('imports for real after the preview, reports the result and resets the file', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async (_f: File, dryRun: boolean) =>
      dryRun ? importResult([row('Neo', 650, 'new'), row('Alpha', 800, 'update', 700)]) : importResult([row('Neo', 650, 'new'), row('Alpha', 800, 'update', 700)], { applied: true }),
    );
    const onImported = vi.fn();
    render(<Section initial={[]} importList={importList} onImported={onImported} />);
    const file = xlsx();
    await user.upload(fileInput(), file);
    await user.click(previewButton());
    await user.click(await within(card()).findByRole('button', { name: 'Import 2 DJs' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(importList).toHaveBeenLastCalledWith(file, false);
    expect(within(card()).getByRole('status').textContent).toBe('Imported. 1 added, 1 updated, 0 unchanged.');
    expect(within(card()).queryByRole('button', { name: /Import \d/ })).toBeNull();
    expect(fileInput().files).toHaveLength(0);
    expect(previewButton().disabled).toBe(true);
  });

  it('shows the error when the file cannot be read', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async () => Promise.reject(new Error('Missing Rate column')));
    render(<Section initial={[]} importList={importList} />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect((await within(card()).findByRole('alert')).textContent).toBe('Missing Rate column');
    expect(previewButton().disabled).toBe(false);
  });

  it('forgets an earlier preview when another file is chosen', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async () => importResult([row('Neo', 650, 'new')]));
    render(<Section initial={[]} importList={importList} />);
    await user.upload(fileInput(), xlsx('one.xlsx'));
    await user.click(previewButton());
    await within(card()).findByRole('button', { name: 'Import 1 DJ' });
    await user.upload(fileInput(), xlsx('two.xlsx'));
    expect(within(card()).queryByRole('button', { name: 'Import 1 DJ' })).toBeNull();
  });

  it('forgets the result of the last import when another file is chosen', async () => {
    const user = userEvent.setup();
    const importList = vi.fn(async (_f: File, dryRun: boolean) => importResult([row('Neo', 650, 'new')], { applied: !dryRun }));
    render(<Section initial={[]} importList={importList} />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    await user.click(await within(card()).findByRole('button', { name: 'Import 1 DJ' }));
    await within(card()).findByText(/Imported\./);
    await user.upload(fileInput(), xlsx('next.xlsx'));
    expect(within(card()).queryByText(/Imported\./)).toBeNull();
  });

  it('does nothing when the form is submitted with no file', () => {
    const importList = vi.fn(async () => importResult([]));
    render(<Section initial={[]} importList={importList} />);
    fireEvent.submit(fileInput().closest('form')!);
    expect(importList).not.toHaveBeenCalled();
  });

  it('treats clearing the file chooser as no file', async () => {
    const user = userEvent.setup();
    render(<Section initial={[]} />);
    await user.upload(fileInput(), xlsx());
    expect(previewButton().disabled).toBe(false);
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(previewButton().disabled).toBe(true);
  });

  it('disables Preview while checking', async () => {
    const user = userEvent.setup();
    const pending = deferred<DjImportResult>();
    render(<Section initial={[]} importList={() => pending.promise} />);
    await user.upload(fileInput(), xlsx());
    await user.click(previewButton());
    expect(previewButton().disabled).toBe(true);
    pending.resolve(importResult([]));
    await waitFor(() => expect(previewButton().disabled).toBe(false));
  });
});

describe('PaymentSchedulePanel', () => {
  const orgApi = api.org('felice');
  const schedule = (count: number, batches: PaymentSchedule['batches']): PaymentSchedule => ({
    weekId: 4,
    label: 'May 2026 W1',
    batchSize: 5,
    batches,
    count,
    total: batches.reduce((s, b) => s + b.total, 0),
  });

  it('shows "Loading…" and then a message and no download when the week has no DJs', async () => {
    const pending = deferred<PaymentSchedule>();
    mockApi({ 'GET /orgs/felice/weeks/4/payment-schedule': () => pending.promise.then((d) => d) });
    render(<PaymentSchedulePanel api={orgApi} weekId={4} signature="" />);
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    pending.resolve(schedule(0, []));
    expect(await screen.findByText('Add resident DJs to this week to generate a schedule.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Download .xlsx' })).toBeNull();
    expect(screen.getByText(/in batches of 5/)).toBeTruthy();
  });

  it('shows each batch with its total and a download link', async () => {
    mockApi({
      'GET /orgs/felice/weeks/4/payment-schedule': schedule(6, [
        { batchNo: 1, total: 4000, payments: [1, 2, 3, 4, 5].map((n) => ({ no: n, name: `DJ ${n}`, amount: 800, notes: '' })) },
        { batchNo: 2, total: 900, payments: [{ no: 6, name: 'DJ 6', amount: 900, notes: '' }] },
      ]),
    });
    render(<PaymentSchedulePanel api={orgApi} weekId={4} signature="a" />);
    expect(await screen.findByText('Batch 1 of 2')).toBeTruthy();
    expect(screen.getByText('Batch 2 of 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download .xlsx' }).getAttribute('href')).toBe('/api/orgs/felice/weeks/4/payment-schedule.xlsx');
    expect(txt(screen.getByRole('row', { name: /Batch 1 total/ }))).toContain(zar(4000));
    expect(txt(screen.getByRole('row', { name: /DJ 6/ }))).toContain(zar(900));
    expect(txt(document.querySelector('.week-total-line'))).toBe(`6 DJs in 2 batches. Total to pay: ${zar(4900)}`);
  });

  it('uses singular wording for one DJ in one batch', async () => {
    mockApi({
      'GET /orgs/felice/weeks/4/payment-schedule': schedule(1, [{ batchNo: 1, total: 900, payments: [{ no: 1, name: 'DJ 1', amount: 900, notes: '' }] }]),
    });
    render(<PaymentSchedulePanel api={orgApi} weekId={4} signature="a" />);
    await screen.findByText('Batch 1 of 1');
    expect(txt(document.querySelector('.week-total-line'))).toBe(`1 DJ in 1 batch. Total to pay: ${zar(900)}`);
  });

  it('shows the error when the schedule cannot be loaded', async () => {
    mockApi({ 'GET /orgs/felice/weeks/4/payment-schedule': fail(500, 'Schedule failed') });
    render(<PaymentSchedulePanel api={orgApi} weekId={4} signature="" />);
    expect((await screen.findByRole('alert')).textContent).toBe('Schedule failed');
  });

  it('reads the schedule again when the signature changes', async () => {
    const mock = mockApi({ 'GET /orgs/felice/weeks/4/payment-schedule': schedule(0, []) });
    const { rerender } = render(<PaymentSchedulePanel api={orgApi} weekId={4} signature="1:A:100" />);
    await screen.findByText(/Add resident DJs/);
    rerender(<PaymentSchedulePanel api={orgApi} weekId={4} signature="1:A:200" />);
    await waitFor(() => expect(mock.of('GET', '/orgs/felice/weeks/4/payment-schedule')).toHaveLength(2));
  });
});

describe('djActions', () => {
  it('saves a new line through the DJ endpoint and leaves update and remove alone', async () => {
    const base = makeActions();
    const addDj = vi.fn(async (d: { name: string; rate: number; notes: string }) => dj(70, d.name, d.rate));
    const wrapped = djActions(base, addDj);
    const saved = await wrapped.add({ category: 'resident', name: 'Neo', amount: 650, notes: 'late set' });
    expect(addDj).toHaveBeenCalledWith({ name: 'Neo', rate: 650, notes: 'late set' });
    expect(saved).toMatchObject({ id: 70, name: 'Neo', amount: 650 });
    expect(base.add).not.toHaveBeenCalled();
    expect(wrapped.update).toBe(base.update);
    expect(wrapped.remove).toBe(base.remove);
  });
});
