import { describe, expect, it, vi } from 'vitest';
import { ApiError, api, onUnauthorized, type ItemInput } from '../src/api.ts';
import { empty, fail, json, mockApi } from './helpers.tsx';

const org = api.org('felice');
const file = new File(['bytes'], 'data.xlsx');
const itemInput: ItemInput = { category: 'headline', name: 'DJ Max', amount: 5000, riderCost: 800, notes: '' };

describe('request plumbing', () => {
  it('sends the CSRF header, same-origin credentials and no body on a GET', async () => {
    const mock = mockApi({ 'GET /auth/me': { authenticated: true } });
    await expect(api.me()).resolves.toEqual({ authenticated: true });
    const [call] = mock.calls;
    expect(call).toMatchObject({ method: 'GET', path: '/auth/me', body: undefined, credentials: 'same-origin' });
    expect(call!.headers).toEqual({ 'X-Requested-With': 'felice' });
    expect(mock.fetch.mock.calls[0]![0]).toBe('/api/auth/me');
  });

  it('sends a JSON body with a JSON content type', async () => {
    const mock = mockApi({ 'POST /auth/login': { ok: true } });
    await api.login('s3cret');
    expect(mock.calls[0]!.body).toEqual({ password: 's3cret' });
    expect(mock.calls[0]!.headers).toEqual({ 'X-Requested-With': 'felice', 'Content-Type': 'application/json' });
  });

  it('sends a file as an octet-stream', async () => {
    const mock = mockApi({ 'POST /orgs/felice/actuals/sheets': { sheets: [], suggested: null } });
    await org.actualSheets(file);
    expect(mock.calls[0]!.body).toBe(file);
    expect(mock.calls[0]!.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('returns undefined for an empty response', async () => {
    mockApi({ 'DELETE /orgs/felice/weeks/4': empty() });
    await expect(org.deleteWeek(4)).resolves.toBeUndefined();
  });

  it('turns a failed response into an ApiError carrying the server message and status', async () => {
    mockApi({ 'POST /auth/login': fail(400, 'Wrong password') });
    const err = await api.login('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Wrong password', status: 400 });
  });

  it('uses a generic message when the error body is not JSON', async () => {
    mockApi({ 'GET /orgs': () => new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }) });
    await expect(api.organisations()).rejects.toMatchObject({ message: 'Request failed (502)', status: 502 });
  });

  it('uses a generic message when the JSON error has no message', async () => {
    mockApi({ 'GET /orgs': json({}, 500) });
    await expect(api.organisations()).rejects.toMatchObject({ message: 'Request failed (500)', status: 500 });
  });
});

describe('401 handling', () => {
  it('calls the unauthorized handler when the session has expired', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    mockApi({ 'GET /orgs': fail(401, 'Sign in first') });
    await expect(api.organisations()).rejects.toMatchObject({ status: 401, message: 'Sign in first' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed sign-in (401 on /auth) as an expired session', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    mockApi({ 'POST /auth/login': fail(401, 'Wrong password') });
    await expect(api.login('nope')).rejects.toMatchObject({ message: 'Wrong password' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('still rejects with the error when no handler is registered', async () => {
    onUnauthorized(undefined as unknown as () => void);
    mockApi({ 'GET /orgs': fail(401, 'Sign in first') });
    await expect(api.organisations()).rejects.toMatchObject({ status: 401 });
  });
});

describe('auth and organisations', () => {
  it('builds me, login, logout and organisations requests', async () => {
    const mock = mockApi({ 'GET /auth/me': { authenticated: false }, 'POST /auth/logout': { ok: true }, 'GET /orgs': [] });
    await api.me();
    await api.logout();
    await api.organisations();
    expect(mock.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /auth/me', 'POST /auth/logout', 'GET /orgs']);
    expect(mock.calls[1]!.body).toBeUndefined();
  });
});

describe('organisation endpoints', () => {
  it('builds every endpoint with the right method, URL and body', async () => {
    const mock = mockApi();
    const routes: [string, string, () => Promise<unknown>, Record<string, string>?, unknown?][] = [
      ['GET', '/orgs/felice/weeks', () => org.weeks()],
      ['GET', '/orgs/felice/weeks/7', () => org.week(7)],
      ['POST', '/orgs/felice/weeks', () => org.createWeek({ year: 2026, month: 5, weekNo: 2, copyRecurring: true }), {}, { year: 2026, month: 5, weekNo: 2, copyRecurring: true }],
      ['PATCH', '/orgs/felice/weeks/7', () => org.updateWeekNotes(7, 'Hello'), {}, { notes: 'Hello' }],
      ['DELETE', '/orgs/felice/weeks/7', () => org.deleteWeek(7)],
      ['POST', '/orgs/felice/weeks/7/items', () => org.addItem(7, itemInput), {}, itemInput],
      ['PUT', '/orgs/felice/items/9', () => org.updateItem(9, itemInput), {}, itemInput],
      ['DELETE', '/orgs/felice/items/9', () => org.deleteItem(9)],
      ['GET', '/orgs/felice/items/9/rider', () => org.itemRider(9)],
      ['PUT', '/orgs/felice/items/9/rider', () => org.saveRider(9, [{ name: 'Water', unitCost: 10, quantity: 2 }]), {}, { lines: [{ name: 'Water', unitCost: 10, quantity: 2 }] }],
      ['GET', '/orgs/felice/rider-prices', () => org.riderPrices()],
      ['POST', '/orgs/felice/rider-prices', () => org.addRiderPrice({ name: 'Water', cost: 12 }), {}, { name: 'Water', cost: 12 }],
      ['PUT', '/orgs/felice/rider-prices/3', () => org.updateRiderPrice(3, { name: 'Water', cost: 14 }), {}, { name: 'Water', cost: 14 }],
      ['DELETE', '/orgs/felice/rider-prices/3', () => org.deleteRiderPrice(3)],
      ['POST', '/orgs/felice/rider-prices/import', () => org.importRiderPrices(file, true), { dryRun: '1' }, file],
      ['POST', '/orgs/felice/rider-prices/import', () => org.importRiderPrices(file, false), { dryRun: '0' }, file],
      ['POST', '/orgs/felice/weeks/7/resident-djs', () => org.addResidentDj(7, { name: 'Zed', rate: 900, notes: '' }), {}, { name: 'Zed', rate: 900, notes: '' }],
      ['POST', '/orgs/felice/weeks/7/resident-djs/import', () => org.importResidentDjs(7, file, true), { dryRun: '1' }, file],
      ['GET', '/orgs/felice/weeks/7/payment-schedule', () => org.paymentSchedule(7)],
      ['POST', '/orgs/felice/recurring/resident-djs', () => org.addRecurringDj({ name: 'Zed', rate: 900, notes: 'n' }), {}, { name: 'Zed', rate: 900, notes: 'n' }],
      ['POST', '/orgs/felice/recurring/resident-djs/import', () => org.importRecurringDjs(file, false), { dryRun: '0' }, file],
      ['GET', '/orgs/felice/reports/resident-bookings', () => org.residentBookings('2026-01', '2026-06'), { from: '2026-01', to: '2026-06' }],
      ['GET', '/orgs/felice/recurring', () => org.recurring()],
      ['POST', '/orgs/felice/recurring', () => org.addRecurring(itemInput), {}, itemInput],
      ['PUT', '/orgs/felice/recurring/5', () => org.updateRecurring(5, itemInput), {}, itemInput],
      ['DELETE', '/orgs/felice/recurring/5', () => org.deleteRecurring(5)],
      ['GET', '/orgs/felice/reports/summary', () => org.summary('2026-01', '2026-06', 'week'), { from: '2026-01', to: '2026-06', groupBy: 'week' }],
      ['GET', '/orgs/felice/reports/top', () => org.top('2026-01', '2026-06', 'hosts'), { from: '2026-01', to: '2026-06', category: 'hosts', limit: '10' }],
      ['GET', '/orgs/felice/reports/top', () => org.top('2026-01', '2026-06', 'headline', 3), { from: '2026-01', to: '2026-06', category: 'headline', limit: '3' }],
      ['GET', '/orgs/felice/reports/compare', () => org.compare('month', '2026-04', '2026-05'), { mode: 'month', a: '2026-04', b: '2026-05' }],
      ['POST', '/orgs/felice/import', () => org.importFile(file, 2026, true), { year: '2026', dryRun: '1' }, file],
      ['GET', '/orgs/felice/actuals', () => org.actuals()],
      ['GET', '/orgs/felice/actuals/11', () => org.actualWeek(11)],
      ['DELETE', '/orgs/felice/actuals/11', () => org.deleteActual(11)],
      ['GET', '/orgs/felice/reports/variance', () => org.variance('2026-01', '2026-06', 'month'), { from: '2026-01', to: '2026-06', groupBy: 'month' }],
    ];
    mock.set(Object.fromEntries(routes.map(([m, p]) => [`${m} ${p}`, empty()])));
    for (const [method, path, run, query, body] of routes) {
      const before = mock.calls.length;
      await run();
      const call = mock.calls[before]!;
      expect([call.method, call.path], `${method} ${path}`).toEqual([method, path]);
      if (query) expect(call.query).toEqual(query);
      if (body !== undefined) expect(call.body).toEqual(body);
      expect(call.headers['X-Requested-With']).toBe('felice');
    }
  });

  it('encodes the organisation slug in the path', async () => {
    const mock = mockApi({ 'GET /orgs/a%20b%2Fc/weeks': [] });
    await api.org('a b/c').weeks();
    expect(mock.fetch.mock.calls[0]![0]).toBe('/api/orgs/a%20b%2Fc/weeks');
  });

  it('imports an actual week with the sheet, week and no adjustments', async () => {
    const mock = mockApi({ 'POST /orgs/felice/actuals/import': empty() });
    await org.importActual(file, { sheet: '29-05', year: 2026, month: 5, weekNo: 4 }, true);
    expect(mock.calls[0]!.query).toEqual({ sheet: '29-05', year: '2026', month: '5', weekNo: '4', dryRun: '1' });
    expect(mock.calls[0]!.body).toBe(file);
  });

  it('leaves adjust out when it is empty', async () => {
    const mock = mockApi({ 'POST /orgs/felice/actuals/import': empty() });
    await org.importActual(file, { sheet: 'A', year: 2026, month: 5, weekNo: 4, adjust: {} }, false);
    expect(mock.calls[0]!.query).not.toHaveProperty('adjust');
    expect(mock.calls[0]!.query.dryRun).toBe('0');
  });

  it('sends adjustments as JSON in the query', async () => {
    const mock = mockApi({ 'POST /orgs/felice/actuals/import': empty() });
    await org.importActual(file, { sheet: 'A', year: 2026, month: 5, weekNo: 4, adjust: { 'LOCAL DJs': 1500.5 } }, false);
    expect(JSON.parse(mock.calls[0]!.query.adjust!)).toEqual({ 'LOCAL DJs': 1500.5 });
  });

  it('builds download URLs without calling the server', () => {
    const mock = mockApi();
    expect(org.paymentScheduleUrl(7)).toBe('/api/orgs/felice/weeks/7/payment-schedule.xlsx');
    expect(org.exportUrl('2026-01', '2026-06', 'week')).toBe('/api/orgs/felice/reports/export.xlsx?from=2026-01&to=2026-06&groupBy=week');
    expect(api.master.exportUrl('2026-01', '2026-06', 'month')).toBe('/api/master/export.xlsx?from=2026-01&to=2026-06&groupBy=month');
    expect(mock.calls).toHaveLength(0);
  });

  it('drops empty and undefined query values', async () => {
    const mock = mockApi({ 'GET /orgs/felice/reports/summary': empty() });
    await org.summary('', '2026-06', 'month');
    expect(mock.calls[0]!.query).toEqual({ to: '2026-06', groupBy: 'month' });
  });
});

describe('master endpoints', () => {
  it('builds every combined-report request', async () => {
    const mock = mockApi();
    const routes: [string, () => Promise<unknown>, Record<string, string>][] = [
      ['/master/summary', () => api.master.summary('2026-01', '2026-06', 'month'), { from: '2026-01', to: '2026-06', groupBy: 'month' }],
      ['/master/top', () => api.master.top('2026-01', '2026-06', 'headline'), { from: '2026-01', to: '2026-06', category: 'headline', limit: '10' }],
      ['/master/top', () => api.master.top('2026-01', '2026-06', 'hosts', 20), { from: '2026-01', to: '2026-06', category: 'hosts', limit: '20' }],
      ['/master/resident-bookings', () => api.master.residentBookings('2026-01', '2026-06'), { from: '2026-01', to: '2026-06' }],
      ['/master/variance', () => api.master.variance('2026-01', '2026-06', 'week'), { from: '2026-01', to: '2026-06', groupBy: 'week' }],
      ['/master/compare', () => api.master.compareOrgs('felice', 'alur', '2026-01', '2026-03'), { mode: 'org', a: 'felice', b: 'alur', from: '2026-01', to: '2026-03' }],
      ['/master/compare', () => api.master.compareMonths('2026-04', '2026-05'), { mode: 'month', a: '2026-04', b: '2026-05' }],
    ];
    mock.set({ 'GET /master/summary': empty(), 'GET /master/top': empty(), 'GET /master/resident-bookings': empty(), 'GET /master/variance': empty(), 'GET /master/compare': empty() });
    for (const [path, run, query] of routes) {
      const before = mock.calls.length;
      await run();
      expect(mock.calls[before]).toMatchObject({ method: 'GET', path, query });
    }
  });
});
