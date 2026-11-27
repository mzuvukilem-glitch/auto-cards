import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BackupOrgSummary, RestoreResult } from '../../shared/types.ts';
import { BackupPage } from '../src/pages/Backup.tsx';
import { cells, deferred, fail, mockApi, renderPage, txt, type MockApi } from './helpers.tsx';

const org = (slug: string, name: string, partial: Partial<BackupOrgSummary> = {}): BackupOrgSummary => ({
  slug,
  name,
  weeks: 0,
  lines: 0,
  recurring: 0,
  riderPrices: 0,
  actualWeeks: 0,
  latestWeek: null,
  ...partial,
});

const CHECK: RestoreResult = {
  applied: false,
  safetyCopy: null,
  current: { orgs: [org('felice', 'Felice', { weeks: 9, lines: 80, latestWeek: 'July 2026 W1' }), org('alur', 'Alur', { weeks: 2, lines: 10 })] },
  backup: {
    orgs: [
      org('felice', 'Felice', { weeks: 7, lines: 60, recurring: 3, riderPrices: 12, actualWeeks: 4, latestWeek: 'May 2026 W2' }),
      org('alur', 'Alur', { weeks: 1, lines: 5, latestWeek: 'June 2026 W1' }),
    ],
  },
};

function install(routes: Record<string, unknown> = {}): MockApi {
  return mockApi({
    'POST /backup/restore': (c: { query: Record<string, string> }) => (c.query.dryRun === '1' ? CHECK : { ...CHECK, applied: true, safetyCopy: 'before-restore-2026-11-27T10-00-00-000Z.db' }),
    ...routes,
  });
}

const file = (name = 'planner-backup.db') => new File(['SQLite format 3'], name, { type: 'application/octet-stream' });
const restoreCard = () => screen.getByRole('region', { name: 'Restore from a backup' });
const choose = async (user: ReturnType<typeof renderPage>['user'], f = file()) => {
  await user.upload(screen.getByLabelText('Backup file (.db)'), f);
};

function open() {
  return renderPage(<BackupPage />, { url: '/backup' });
}

describe('backing up', () => {
  it('offers a download of the whole database', () => {
    install();
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Backup & restore' })).toBeTruthy();
    const link = within(screen.getByRole('region', { name: 'Back up' })).getByRole('link', { name: 'Download backup' });
    expect(link.getAttribute('href')).toBe('/api/backup');
    expect(link.hasAttribute('download')).toBe(true);
  });
});

describe('checking a backup file', () => {
  it('sends the file to be checked without restoring it, and shows it next to the current data', async () => {
    const mock = install();
    const { user } = open();
    expect(screen.queryByRole('button', { name: 'Restore this backup' })).toBeNull();
    const f = file();
    await choose(user, f);
    await screen.findByRole('heading', { name: 'What is in this backup' });
    const calls = mock.of('POST', '/backup/restore');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.query).toEqual({ dryRun: '1' });
    expect(calls[0]!.body).toBe(f);

    const rows = within(restoreCard()).getAllByRole('row').map((r) => cells(r));
    expect(rows[0]).toEqual(['Company', 'Data', 'Weeks', 'Cost lines', 'Recurring costs', 'Rider prices', 'Actual weeks', 'Latest week']);
    expect(rows.slice(1)).toEqual([
      ['Felice', 'Now', '9', '80', '0', '0', '0', 'July 2026 W1'],
      ['Felice', 'In the backup', '7', '60', '3', '12', '4', 'May 2026 W2'],
      ['Alur', 'Now', '2', '10', '0', '0', '0', '–'],
      ['Alur', 'In the backup', '1', '5', '0', '0', '0', 'June 2026 W1'],
    ]);
    expect(txt(restoreCard())).toContain('saved to a file first');
  });

  it('says it is working while the file is being checked', async () => {
    const pending = deferred<RestoreResult>();
    install({ 'POST /backup/restore': () => pending.promise.then((r) => r) });
    const { user } = open();
    await choose(user);
    expect(screen.getByRole('status').textContent).toBe('Working…');
    pending.resolve(CHECK);
    await screen.findByRole('heading', { name: 'What is in this backup' });
    expect(screen.queryByText('Working…')).toBeNull();
  });

  it('shows why a file was refused, and nothing to restore', async () => {
    install({ 'POST /backup/restore': fail(400, 'That file is not a planner backup.') });
    const { user } = open();
    await choose(user);
    expect((await within(restoreCard()).findByRole('alert')).textContent).toBe('That file is not a planner backup.');
    expect(screen.queryByRole('button', { name: 'Restore this backup' })).toBeNull();
  });

  it('goes back to nothing when the file is cleared', async () => {
    install();
    const { user } = open();
    await choose(user);
    await screen.findByRole('heading', { name: 'What is in this backup' });
    fireEvent.change(screen.getByLabelText('Backup file (.db)'), { target: { files: [] } });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'What is in this backup' })).toBeNull());
  });
});

describe('restoring', () => {
  it('asks first, then restores, then says where the old data was saved', async () => {
    const mock = install();
    const { user } = open();
    const f = file();
    await choose(user, f);
    await user.click(await screen.findByRole('button', { name: 'Restore this backup' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Felice and Alur'));
    await screen.findByText('Restored.');
    const restore = mock.of('POST', '/backup/restore').filter((c) => c.query.dryRun === undefined);
    expect(restore).toHaveLength(1);
    expect(restore[0]!.body).toBe(f);
    expect(txt(screen.getByRole('status'))).toContain('before-restore-2026-11-27T10-00-00-000Z.db');
    expect(screen.queryByRole('button', { name: 'Restore this backup' })).toBeNull();
    expect((screen.getByLabelText('Backup file (.db)') as HTMLInputElement).value).toBe('');
  });

  it('does nothing when the prompt is declined', async () => {
    const mock = install();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = open();
    await choose(user);
    await user.click(await screen.findByRole('button', { name: 'Restore this backup' }));
    expect(mock.of('POST', '/backup/restore')).toHaveLength(1);
    expect(screen.queryByText('Restored.')).toBeNull();
  });

  it('shows the error and keeps the file ready when the restore fails', async () => {
    install({
      'POST /backup/restore': (c: { query: Record<string, string> }) => (c.query.dryRun === '1' ? CHECK : fail(400, 'That backup could not be loaded. Nothing was changed.')),
    });
    const { user } = open();
    await choose(user);
    await user.click(await screen.findByRole('button', { name: 'Restore this backup' }));
    expect((await within(restoreCard()).findByRole('alert')).textContent).toBe('That backup could not be loaded. Nothing was changed.');
    expect(screen.getByRole('button', { name: 'Restore this backup' })).toBeTruthy();
    expect(screen.queryByText('Restored.')).toBeNull();
  });
});
