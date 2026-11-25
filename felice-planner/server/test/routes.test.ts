// Every API endpoint, called over HTTP against the real server (in memory): what it returns, what it refuses,
// and that one organisation cannot reach another's data.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import { TEMPLATES } from '../src/templates.ts';
import { start, workbook, type Reply, type Running } from './support.ts';

let app: Running;
before(async () => {
  app = await start();
  await app.login();
});
after(() => app.close());

const template = async (id: string) => TEMPLATES.find((t) => t.id === id)!.build();
const isXlsx = (r: Reply) => r.buffer[0] === 0x50 && r.buffer[1] === 0x4b;
const error = (r: Reply, status: number, pattern: RegExp) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  assert.match(r.body.error, pattern);
};

let weekCounter = 0;
/** A new planned week (own month and week number, so tests never collide). */
async function newWeek(org = 'felice', copyRecurring = false): Promise<{ id: number; year: number; month: number; weekNo: number }> {
  const n = weekCounter++;
  const r = await app.call('POST', `/orgs/${org}/weeks`, { year: 2030 + Math.floor(n / 60), month: 1 + (n % 12), weekNo: 1 + (Math.floor(n / 12) % 5), copyRecurring });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const addItem = (weekId: number, item: Record<string, unknown>, org = 'felice') => app.call('POST', `/orgs/${org}/weeks/${weekId}/items`, item);
const headliner = (weekId: number, rate = 40000, riderCost = 0, name = 'Headliner', org = 'felice') =>
  addItem(weekId, { category: 'headline', name, amount: rate, riderCost }, org);

describe('lists and templates', () => {
  test('the organisations, in order', async () => {
    const r = await app.call('GET', '/orgs');
    assert.deepEqual(r.body.map((o: { slug: string }) => o.slug), ['felice', 'alur']);
  });

  test('every import template is listed and downloads as a file; an unknown one is 404', async () => {
    const list = await app.call('GET', '/templates');
    assert.deepEqual(list.body.map((t: { id: string }) => t.id), TEMPLATES.map((t) => t.id));
    assert.deepEqual(Object.keys(list.body[0]).sort(), ['description', 'file', 'id', 'title']);
    for (const t of TEMPLATES) {
      const r = await app.call('GET', `/templates/${t.id}`);
      assert.equal(r.status, 200, t.id);
      assert.match(r.headers.get('content-disposition')!, new RegExp(`attachment; filename="?${t.file}"?`));
      assert.ok(r.buffer.length > 50);
    }
    assert.equal((await app.call('GET', '/templates/nope')).status, 404);
  });

  test('an unknown organisation is 404 on every organisation route', async () => {
    error(await app.call('GET', '/orgs/nobody/weeks'), 404, /Organisation not found/);
    error(await app.call('GET', '/orgs/nobody/rider-prices'), 404, /Organisation not found/);
  });
});

describe('weeks', () => {
  test('create, list, read, change the notes, delete', async () => {
    const created = await app.call('POST', '/orgs/felice/weeks', { year: 2031, month: 3, weekNo: 2 });
    assert.equal(created.status, 201);
    assert.deepEqual([created.body.year, created.body.month, created.body.weekNo, created.body.notes, created.body.items], [2031, 3, 2, '', []]);
    const id = created.body.id;

    const all = await app.call('GET', '/orgs/felice/weeks');
    assert.ok(all.body.some((w: { id: number }) => w.id === id));
    const ranged = await app.call('GET', '/orgs/felice/weeks?from=2031-03&to=2031-03');
    assert.deepEqual(ranged.body.map((w: { id: number }) => w.id), [id]);
    assert.deepEqual((await app.call('GET', '/orgs/felice/weeks?from=2031-04&to=2031-05')).body, []);

    assert.equal((await app.call('GET', `/orgs/felice/weeks/${id}`)).body.id, id);
    const patched = await app.call('PATCH', `/orgs/felice/weeks/${id}`, { notes: '  load-in at 4  ' });
    assert.equal(patched.body.notes, 'load-in at 4');

    assert.equal((await app.call('DELETE', `/orgs/felice/weeks/${id}`)).status, 204);
    error(await app.call('GET', `/orgs/felice/weeks/${id}`), 404, /Week not found/);
  });

  test('a week can start from the recurring costs', async () => {
    await app.call('POST', '/orgs/felice/recurring', { category: 'standard', name: 'MC', amount: 4000 });
    const week = await newWeek('felice', true);
    const detail = await app.call('GET', `/orgs/felice/weeks/${week.id}`);
    assert.ok(detail.body.items.some((i: { name: string }) => i.name === 'MC'));
    const bare = await newWeek('felice', false);
    assert.deepEqual((await app.call('GET', `/orgs/felice/weeks/${bare.id}`)).body.items, []);
  });

  test('bad input is refused with a message that names the field', async () => {
    error(await app.call('POST', '/orgs/felice/weeks', { year: 1999, month: 1, weekNo: 1 }), 400, /year must be a whole number between 2000 and 2100/);
    error(await app.call('POST', '/orgs/felice/weeks', { year: 2031, month: 13, weekNo: 1 }), 400, /month/);
    error(await app.call('POST', '/orgs/felice/weeks', { year: 2031, month: 1, weekNo: 6 }), 400, /weekNo/);
    error(await app.call('POST', '/orgs/felice/weeks', { year: 2031, month: 1, weekNo: 1, notes: 'x'.repeat(1001) }), 400, /notes must be 1000 characters or fewer/);
    error(await app.call('POST', '/orgs/felice/weeks', 'not an object'.length ? undefined : undefined), 400, /year/);
    error(await app.call('GET', '/orgs/felice/weeks?from=2031-01'), 400, /to must be a month/);
    error(await app.call('GET', '/orgs/felice/weeks/abc'), 400, /id must be a whole number/);
    error(await app.call('PATCH', '/orgs/felice/weeks/1', { notes: 5 }), 400, /notes must be text/);
  });

  test('a week exists once per organisation, but both organisations may have the same week', async () => {
    const first = await app.call('POST', '/orgs/felice/weeks', { year: 2032, month: 2, weekNo: 1 });
    assert.equal(first.status, 201);
    error(await app.call('POST', '/orgs/felice/weeks', { year: 2032, month: 2, weekNo: 1 }), 409, /already exists/);
    assert.equal((await app.call('POST', '/orgs/alur/weeks', { year: 2032, month: 2, weekNo: 1 })).status, 201);
  });

  test('another organisation cannot see, change or delete a week', async () => {
    const week = await newWeek('felice');
    error(await app.call('GET', `/orgs/alur/weeks/${week.id}`), 404, /Week not found/);
    error(await app.call('PATCH', `/orgs/alur/weeks/${week.id}`, { notes: 'x' }), 404, /Week not found/);
    error(await app.call('DELETE', `/orgs/alur/weeks/${week.id}`), 404, /Week not found/);
    assert.equal((await app.call('GET', `/orgs/felice/weeks/${week.id}`)).status, 200);
  });
});

describe('line items', () => {
  test('headline acts and hosts carry a rate and a rider cost; other lines carry an amount', async () => {
    const week = await newWeek();
    const act = await headliner(week.id, 40000, 4000, 'Maphorisa');
    assert.equal(act.status, 201);
    assert.deepEqual([act.body.amount, act.body.riderCost, act.body.category, act.body.isDj], [40000, 4000, 'headline', false]);
    const host = await addItem(week.id, { category: 'hosts', name: 'Xoli', amount: 8000, riderCost: 0, notes: ' n ' });
    assert.deepEqual([host.body.riderCost, host.body.notes], [0, 'n']);
    const mc = await addItem(week.id, { category: 'standard', name: 'MC', amount: 4000, riderCost: 999 });
    assert.equal(mc.body.riderCost, 0, 'a rider cost on another category is ignored');
  });

  test('a headline act without a rate, or without a rider cost (even blank), is refused', async () => {
    const week = await newWeek();
    error(await addItem(week.id, { category: 'headline', name: 'A', riderCost: 0 }), 400, /Headline Acts: the rate is required/);
    error(await addItem(week.id, { category: 'headline', name: 'A', amount: '  ', riderCost: 0 }), 400, /the rate is required/);
    error(await addItem(week.id, { category: 'hosts', name: 'A', amount: 100 }), 400, /Hosts & Promoters: the rider cost is required/);
    error(await addItem(week.id, { category: 'hosts', name: 'A', amount: 100, riderCost: null }), 400, /the rider cost is required/);
    error(await addItem(week.id, { category: 'hosts', name: 'A', amount: 100, riderCost: '' }), 400, /the rider cost is required/);
  });

  test('other bad input: an unknown category, no name, no or negative amount', async () => {
    const week = await newWeek();
    error(await addItem(week.id, { category: 'nope', name: 'A', amount: 1 }), 400, /category is not recognised/);
    error(await addItem(week.id, { category: 'other', amount: 1 }), 400, /name is required/);
    error(await addItem(week.id, { category: 'other', name: 'A' }), 400, /amount must be a number/);
    error(await addItem(week.id, { category: 'other', name: 'A', amount: -1 }), 400, /amount must be a number/);
    error(await addItem(9999999, { category: 'other', name: 'A', amount: 1 }), 404, /Week not found/);
  });

  test('change and remove a line, but never through another organisation', async () => {
    const week = await newWeek();
    const item = (await addItem(week.id, { category: 'other', name: 'Deposit', amount: 500 })).body;
    const put = await app.call('PUT', `/orgs/felice/items/${item.id}`, { category: 'other', name: 'Deposit 2', amount: 600, notes: 'paid' });
    assert.deepEqual([put.body.name, put.body.amount, put.body.notes], ['Deposit 2', 600, 'paid']);
    error(await app.call('PUT', `/orgs/alur/items/${item.id}`, { category: 'other', name: 'x', amount: 1 }), 404, /Line item not found/);
    error(await app.call('DELETE', `/orgs/alur/items/${item.id}`), 404, /Line item not found/);
    assert.equal((await app.call('DELETE', `/orgs/felice/items/${item.id}`)).status, 204);
    error(await app.call('DELETE', `/orgs/felice/items/${item.id}`), 404, /Line item not found/);
  });
});

describe('rider prices and the rider calculator', () => {
  test('the price list: add, list, change, remove, and one name once', async () => {
    const added = await app.call('POST', '/orgs/felice/rider-prices', { name: 'Hubbly', cost: 25 });
    assert.equal(added.status, 201);
    assert.deepEqual(added.body, { id: added.body.id, name: 'Hubbly', cost: 25 });
    error(await app.call('POST', '/orgs/felice/rider-prices', { name: 'hubbly', cost: 1 }), 409, /already in the price list/);
    error(await app.call('POST', '/orgs/felice/rider-prices', { name: 'X' }), 400, /the cost is required/);
    error(await app.call('POST', '/orgs/felice/rider-prices', { name: 'X', cost: '  ' }), 400, /the cost is required/);
    error(await app.call('POST', '/orgs/felice/rider-prices', { cost: 1 }), 400, /name is required/);
    const changed = await app.call('PUT', `/orgs/felice/rider-prices/${added.body.id}`, { name: 'Hubbly pipe', cost: 30 });
    assert.deepEqual([changed.body.name, changed.body.cost], ['Hubbly pipe', 30]);
    assert.ok((await app.call('GET', '/orgs/felice/rider-prices')).body.some((p: { name: string }) => p.name === 'Hubbly pipe'));
    assert.deepEqual((await app.call('GET', '/orgs/alur/rider-prices')).body, [], 'each organisation has its own list');
    error(await app.call('PUT', `/orgs/alur/rider-prices/${added.body.id}`, { name: 'x', cost: 1 }), 404, /Rider price not found/);
    assert.equal((await app.call('DELETE', `/orgs/felice/rider-prices/${added.body.id}`)).status, 204);
    error(await app.call('DELETE', `/orgs/felice/rider-prices/${added.body.id}`), 404, /Rider price not found/);
  });

  test('importing a price list: a preview changes nothing, the import adds and updates, bad files are refused', async () => {
    const file = await workbook({ Sheet1: [['Beverage', 'Cost'], ['Red bull', 16.83], ['Tonic', 7.08], ['Red bull', 1]] });
    const preview = await app.upload('/orgs/alur/rider-prices/import?dryRun=1', file);
    assert.deepEqual([preview.body.applied, preview.body.added, preview.body.updated], [false, 2, 0]);
    assert.equal(preview.body.warnings.length, 1, 'the repeated item is reported');
    assert.deepEqual((await app.call('GET', '/orgs/alur/rider-prices')).body, []);
    const done = await app.upload('/orgs/alur/rider-prices/import', file);
    assert.deepEqual([done.body.applied, done.body.added], [true, 2]);
    const again = await app.upload('/orgs/alur/rider-prices/import?dryRun=true', await workbook({ A: [['Item', 'Price'], ['Red bull', 20]] }));
    assert.deepEqual([again.body.updated, again.body.rows[0].currentCost], [1, 16.83]);
    error(await app.upload('/orgs/alur/rider-prices/import', Buffer.from('garbage')), 400, /No header row found/);
    error(await app.bare('POST', '/api/orgs/alur/rider-prices/import', { headers: { 'x-requested-with': 'felice', cookie: await cookieHeader() } }), 400, /Upload an Excel \(\.xlsx\) or CSV file/);
  });

  test('working out a rider sets the booking\'s rider cost, and the week total follows', async () => {
    const week = await newWeek();
    const act = (await headliner(week.id, 40000, 0)).body;
    const empty = await app.call('GET', `/orgs/felice/items/${act.id}/rider`);
    assert.deepEqual([empty.body.lines, empty.body.total], [[], 0]);

    const saved = await app.call('PUT', `/orgs/felice/items/${act.id}/rider`, {
      lines: [{ name: 'Red bull', unitCost: 16.83, quantity: 3 }, { name: ' Hubbly ', unitCost: '25', quantity: '2' }],
    });
    assert.equal(saved.status, 200);
    assert.deepEqual([saved.body.item.riderCost, saved.body.item.riderItems, saved.body.rider.total], [100.49, 2, 100.49]);
    assert.deepEqual(saved.body.rider.lines[1], { name: 'Hubbly', unitCost: 25, quantity: 2, total: 50 });
    assert.equal((await app.call('GET', `/orgs/felice/items/${act.id}/rider`)).body.total, 100.49);
    const summary = (await app.call('GET', '/orgs/felice/weeks')).body.find((w: { id: number }) => w.id === week.id);
    assert.equal(summary.total, 40100.49);

    error(await app.call('PUT', `/orgs/felice/items/${act.id}`, { category: 'headline', name: 'Headliner', amount: 40000, riderCost: 1 }), 400, /rider calculator/);
    const cleared = await app.call('PUT', `/orgs/felice/items/${act.id}/rider`, { lines: [] });
    assert.deepEqual([cleared.body.item.riderCost, cleared.body.item.riderItems], [0, 0]);
  });

  test('a rider is only for headline acts and hosts, and only inside the organisation', async () => {
    const week = await newWeek();
    const mc = (await addItem(week.id, { category: 'standard', name: 'MC', amount: 1 })).body;
    error(await app.call('GET', `/orgs/felice/items/${mc.id}/rider`), 400, /Only headline acts and hosts/);
    error(await app.call('PUT', `/orgs/felice/items/${mc.id}/rider`, { lines: [] }), 400, /Only headline acts and hosts/);
    const act = (await headliner(week.id)).body;
    error(await app.call('GET', `/orgs/alur/items/${act.id}/rider`), 404, /Line item not found/);
    error(await app.call('PUT', `/orgs/alur/items/${act.id}/rider`, { lines: [] }), 404, /Line item not found/);
  });

  test('copying a rider onto other headline acts and hosts replaces their riders', async () => {
    const week = await newWeek();
    const other = await newWeek();
    const source = (await headliner(week.id, 40000, 0, 'Source')).body;
    await app.call('PUT', `/orgs/felice/items/${source.id}/rider`, { lines: [{ name: 'Red bull', unitCost: 16.83, quantity: 3 }, { name: 'Hubbly', unitCost: 25, quantity: 2 }] });
    const host = (await addItem(week.id, { category: 'hosts', name: 'Host', amount: 8000, riderCost: 0 })).body;
    const act = (await headliner(week.id, 1000, 0, 'Has a rider')).body;
    await app.call('PUT', `/orgs/felice/items/${act.id}/rider`, { lines: [{ name: 'Water', unitCost: 5, quantity: 1 }] });
    const next = (await headliner(other.id, 500, 0, 'Next week')).body;

    const copied = await app.call('POST', `/orgs/felice/items/${source.id}/rider/copy`, { toItemIds: [host.id, act.id, next.id, host.id] });
    assert.equal(copied.status, 200, JSON.stringify(copied.body));
    assert.deepEqual(copied.body.map((i: { id: number }) => i.id), [host.id, act.id, next.id], 'each booking once, in the order given');
    assert.ok(copied.body.every((i: { riderCost: number; riderItems: number }) => i.riderCost === 100.49 && i.riderItems === 2));
    for (const id of [host.id, act.id, next.id]) {
      const rider = (await app.call('GET', `/orgs/felice/items/${id}/rider`)).body;
      assert.deepEqual(rider.lines.map((l: { name: string }) => l.name), ['Red bull', 'Hubbly'], 'the old items are replaced, not added to');
      assert.equal(rider.total, 100.49);
    }
    assert.equal((await app.call('GET', `/orgs/felice/items/${source.id}/rider`)).body.total, 100.49, 'the source is unchanged');

    const typed = (await headliner(week.id, 1, 250, 'Typed in')).body;
    const onto = (await headliner(week.id, 1, 0, 'Onto typed')).body;
    await app.call('PUT', `/orgs/felice/items/${onto.id}/rider`, { lines: [{ name: 'Water', unitCost: 5, quantity: 1 }] });
    const plain = await app.call('POST', `/orgs/felice/items/${typed.id}/rider/copy`, { toItemIds: [onto.id] });
    assert.deepEqual([plain.body[0].riderCost, plain.body[0].riderItems], [250, 0], 'a typed-in cost is copied as typed, and the old items go');
  });

  test('a rider can only be copied from and to headline acts and hosts, inside the organisation, and only if there is one', async () => {
    const week = await newWeek();
    const act = (await headliner(week.id, 1, 100, 'Act')).body;
    const empty = (await headliner(week.id, 1, 0, 'Empty')).body;
    const mc = (await addItem(week.id, { category: 'standard', name: 'MC', amount: 1 })).body;
    const copy = (from: number, body: unknown, org = 'felice') => app.call('POST', `/orgs/${org}/items/${from}/rider/copy`, body);
    error(await copy(mc.id, { toItemIds: [act.id] }), 400, /Only headline acts and hosts/);
    error(await copy(empty.id, { toItemIds: [act.id] }), 400, /Empty has no rider to copy/);
    error(await copy(act.id, { toItemIds: [mc.id] }), 400, /MC is not a headline act or host/);
    error(await copy(act.id, { toItemIds: [act.id] }), 400, /different booking/);
    error(await copy(act.id, { toItemIds: [] }), 400, /at least one booking/);
    error(await copy(act.id, { toItemIds: [99999] }), 404, /Line item not found/);
    error(await copy(act.id, { toItemIds: [empty.id] }, 'alur'), 404, /Line item not found/);
    error(await copy(act.id, {}), 400, /toItemIds must be a list/);
    error(await copy(act.id, { toItemIds: Array.from({ length: 101 }, () => empty.id) }), 400, /at most 100/);
    error(await copy(act.id, { toItemIds: ['x'] }), 400, /toItemIds must be a whole number/);
    assert.equal((await app.call('GET', `/orgs/felice/items/${empty.id}/rider`)).body.total, 0, 'a refused copy changes nothing');
  });

  test('a rider with bad items is refused, naming the item', async () => {
    const act = (await headliner((await newWeek()).id)).body;
    const put = (lines: unknown) => app.call('PUT', `/orgs/felice/items/${act.id}/rider`, { lines });
    error(await put('x'), 400, /lines must be a list/);
    error(await put(Array.from({ length: 101 }, () => ({ name: 'A', unitCost: 1, quantity: 1 }))), 400, /at most 100 items/);
    error(await put([null]), 400, /Rider item 1: the cost is required/);
    error(await put([{ name: 'A', quantity: 1 }]), 400, /Rider item 1: the cost is required/);
    error(await put([{ name: 'A', unitCost: null, quantity: 1 }]), 400, /the cost is required/);
    error(await put([{ name: 'A', unitCost: '  ', quantity: 1 }]), 400, /the cost is required/);
    error(await put([{ name: 'A', unitCost: -1, quantity: 1 }]), 400, /Rider item 1 cost must be a number/);
    error(await put([{ name: 'ok', unitCost: 1, quantity: 1 }, { name: 'A', unitCost: 1_000_001, quantity: 1 }]), 400, /Rider item 2 cost must be at most 1,000,000/);
    error(await put([{ unitCost: 1, quantity: 1 }]), 400, /Rider item 1 name is required/);
    error(await put([{ name: 'A', unitCost: 1, quantity: 0 }]), 400, /Rider item 1 quantity must be a whole number between 1 and 9999/);
    error(await put([{ name: 'A', unitCost: 1, quantity: 1.5 }]), 400, /quantity/);
    error(await put([{ name: 'A', unitCost: 1, quantity: 10000 }]), 400, /quantity/);
  });
});

describe('resident DJs, payment schedules and recurring costs', () => {
  test('adding a DJ to a week, and the one-per-week rule', async () => {
    const week = await newWeek();
    const dj = await app.call('POST', `/orgs/felice/weeks/${week.id}/resident-djs`, { name: 'DJ One', rate: 1500, notes: 'Fri' });
    assert.equal(dj.status, 201);
    assert.deepEqual([dj.body.isDj, dj.body.amount, dj.body.notes], [true, 1500, 'Fri']);
    error(await app.call('POST', `/orgs/felice/weeks/${week.id}/resident-djs`, { name: 'dj one', rate: 1 }), 409, /already booked/);
    error(await app.call('POST', `/orgs/felice/weeks/${week.id}/resident-djs`, { name: 'DJ Two' }), 400, /Resident DJs: the rate is required/);
    error(await app.call('POST', `/orgs/felice/weeks/${week.id}/resident-djs`, { name: 'DJ Two', rate: ' ' }), 400, /the rate is required/);
    error(await app.call('POST', `/orgs/felice/weeks/${week.id}/resident-djs`, { rate: 1 }), 400, /name is required/);
  });

  test('importing DJs onto a week: preview, import, replace rates, bad file', async () => {
    const week = await newWeek();
    const csv = 'Name,Rate\nDJ A,1000\nDJ B,"1,200.50"\nDJ A,5\n';
    const preview = await app.upload(`/orgs/felice/weeks/${week.id}/resident-djs/import?dryRun=1`, csv);
    assert.deepEqual([preview.body.applied, preview.body.added, preview.body.warnings.length], [false, 2, 1]);
    const done = await app.upload(`/orgs/felice/weeks/${week.id}/resident-djs/import`, csv);
    assert.deepEqual([done.body.applied, done.body.added, done.body.total], [true, 2, 2200.5]);
    const rerate = await app.upload(`/orgs/felice/weeks/${week.id}/resident-djs/import?dryRun=true`, 'Name,Rate\nDJ A,1100\n');
    assert.equal(rerate.body.updated, 1);
    error(await app.upload(`/orgs/felice/weeks/${week.id}/resident-djs/import`, 'nothing useful here'), 400, /No header row found/);
    error(await app.bare('POST', `/api/orgs/felice/weeks/${week.id}/resident-djs/import`, { headers: { 'x-requested-with': 'felice', cookie: await cookieHeader() } }), 400, /Upload an Excel/);
  });

  test('the payment schedule, as data and as a file; a week with no DJs has none to pay', async () => {
    const week = await newWeek();
    error(await app.call('GET', `/orgs/felice/weeks/${week.id}/payment-schedule.xlsx`), 400, /no resident DJs to pay/);
    assert.equal((await app.call('GET', `/orgs/felice/weeks/${week.id}/payment-schedule`)).body.count, 0);
    for (const [i, rate] of [1000, 900, 800, 700, 600, 500].entries()) {
      await app.call('POST', `/orgs/felice/weeks/${week.id}/resident-djs`, { name: `DJ ${i}`, rate });
    }
    const data = await app.call('GET', `/orgs/felice/weeks/${week.id}/payment-schedule`);
    assert.deepEqual([data.body.count, data.body.total, data.body.batches.length], [6, 4500, 2]);
    const file = await app.call('GET', `/orgs/felice/weeks/${week.id}/payment-schedule.xlsx`);
    assert.ok(isXlsx(file));
    assert.match(file.headers.get('content-disposition')!, /felice_resident-dj-payments_\d{4}-\d{2}-W\d\.xlsx/);
    error(await app.call('GET', `/orgs/alur/weeks/${week.id}/payment-schedule`), 404, /Week not found/);
  });

  test('recurring costs: add, list, change, remove, and the categories that cannot recur', async () => {
    const added = await app.call('POST', '/orgs/alur/recurring', { category: 'social', name: 'Instagram', amount: 2000 });
    assert.equal(added.status, 201);
    assert.ok((await app.call('GET', '/orgs/alur/recurring')).body.some((r: { name: string }) => r.name === 'Instagram'));
    assert.deepEqual((await app.call('GET', '/orgs/felice/recurring')).body.filter((r: { name: string }) => r.name === 'Instagram'), []);
    const put = await app.call('PUT', `/orgs/alur/recurring/${added.body.id}`, { category: 'social', name: 'Instagram ads', amount: 2500 });
    assert.deepEqual([put.body.name, put.body.amount], ['Instagram ads', 2500]);
    error(await app.call('POST', '/orgs/alur/recurring', { category: 'headline', name: 'X', amount: 1, riderCost: 0 }), 400, /cannot be a recurring cost/);
    error(await app.call('PUT', `/orgs/felice/recurring/${added.body.id}`, { category: 'social', name: 'x', amount: 1 }), 404, /Recurring cost not found/);
    assert.equal((await app.call('DELETE', `/orgs/alur/recurring/${added.body.id}`)).status, 204);
    error(await app.call('DELETE', `/orgs/alur/recurring/${added.body.id}`), 404, /Recurring cost not found/);
  });

  test('standing DJs: add one, import a list (preview then import), and a repeat is refused', async () => {
    const dj = await app.call('POST', '/orgs/alur/recurring/resident-djs', { name: 'Standing DJ', rate: 900 });
    assert.equal(dj.status, 201);
    error(await app.call('POST', '/orgs/alur/recurring/resident-djs', { name: 'standing dj', rate: 1 }), 409, /already in the recurring list/);
    const csv = 'Name,Rate\nStanding DJ,1000\nAnother DJ,800\n';
    const preview = await app.upload('/orgs/alur/recurring/resident-djs/import?dryRun=1', csv);
    assert.deepEqual([preview.body.applied, preview.body.added, preview.body.updated], [false, 1, 1]);
    const done = await app.upload('/orgs/alur/recurring/resident-djs/import', csv);
    assert.deepEqual([done.body.applied, done.body.added, done.body.updated], [true, 1, 1]);
    error(await app.upload('/orgs/alur/recurring/resident-djs/import', 'junk'), 400, /No header row found/);
  });
});

describe('reports for one organisation', () => {
  let weekId: number;
  before(async () => {
    const w = await app.call('POST', '/orgs/felice/weeks', { year: 2033, month: 5, weekNo: 1 });
    weekId = w.body.id;
    await headliner(weekId, 30000, 3000, 'Reported Act');
    await addItem(weekId, { category: 'standard', name: 'MC', amount: 4000 });
    const w2 = await app.call('POST', '/orgs/felice/weeks', { year: 2033, month: 6, weekNo: 1 });
    await headliner(w2.body.id, 20000, 0, 'Reported Act');
  });

  test('summary by month and by week', async () => {
    const month = await app.call('GET', '/orgs/felice/reports/summary?from=2033-05&to=2033-06');
    assert.equal(month.body.groupBy, 'month');
    assert.deepEqual([month.body.rows.length, month.body.totals.total], [2, 57000]);
    const week = await app.call('GET', '/orgs/felice/reports/summary?from=2033-05&to=2033-06&groupBy=week');
    assert.equal(week.body.groupBy, 'week');
    assert.equal(week.body.rows[0].weekId, weekId);
    const named = await app.call('GET', '/orgs/felice/reports/summary?from=2033-05&to=2033-05&groupBy=month');
    assert.equal(named.body.rows.length, 1);
  });

  test('summary refuses a bad period or grouping', async () => {
    error(await app.call('GET', '/orgs/felice/reports/summary'), 400, /from must be a month/);
    error(await app.call('GET', '/orgs/felice/reports/summary?from=2033-06&to=2033-05'), 400, /from must be on or before to/);
    error(await app.call('GET', '/orgs/felice/reports/summary?from=2033-05&to=2033-06&groupBy=year'), 400, /groupBy must be "month" or "week"/);
  });

  test('top spend by name: default and chosen limit, and what it refuses', async () => {
    const top = await app.call('GET', '/orgs/felice/reports/top?from=2033-05&to=2033-06&category=headline');
    assert.deepEqual([top.body[0].name, top.body[0].total, top.body[0].riderTotal, top.body[0].count], ['Reported Act', 50000, 3000, 2]);
    assert.equal((await app.call('GET', '/orgs/felice/reports/top?from=2033-05&to=2033-06&category=headline&limit=1')).body.length, 1);
    error(await app.call('GET', '/orgs/felice/reports/top?from=2033-05&to=2033-06&category=headline&limit=0'), 400, /limit/);
    error(await app.call('GET', '/orgs/felice/reports/top?from=2033-05&to=2033-06&limit=101&category=headline'), 400, /limit/);
    error(await app.call('GET', '/orgs/felice/reports/top?from=2033-05&to=2033-06&category=nope'), 400, /category is not recognised/);
  });

  test('resident bookings per month', async () => {
    const r = await app.call('GET', '/orgs/felice/reports/resident-bookings?from=2033-05&to=2033-06');
    assert.deepEqual(r.body.months.map((m: { key: string }) => m.key), ['2033-05', '2033-06']);
    error(await app.call('GET', '/orgs/felice/reports/resident-bookings'), 400, /from must be a month/);
  });

  test('compare month against month (the default) and week against week', async () => {
    const months = await app.call('GET', '/orgs/felice/reports/compare?a=2033-05&b=2033-06');
    assert.equal(months.body.mode, 'month');
    assert.equal((await app.call('GET', '/orgs/felice/reports/compare?mode=month&a=2033-05&b=2033-06')).status, 200);
    const w2 = (await app.call('GET', '/orgs/felice/weeks?from=2033-06&to=2033-06')).body[0].id;
    const weeks = await app.call('GET', `/orgs/felice/reports/compare?mode=week&a=${weekId}&b=${w2}`);
    assert.equal(weeks.body.mode, 'week');
    error(await app.call('GET', '/orgs/felice/reports/compare?mode=year&a=1&b=2'), 400, /mode must be "month" or "week"/);
    error(await app.call('GET', '/orgs/felice/reports/compare?mode=week&a=x&b=2'), 400, /a must be a whole number/);
    error(await app.call('GET', '/orgs/felice/reports/compare?a=2033-05'), 400, /b must be a month/);
  });

  test('export to Excel', async () => {
    const r = await app.call('GET', '/orgs/felice/reports/export.xlsx?from=2033-05&to=2033-06&groupBy=week');
    assert.ok(isXlsx(r));
    assert.match(r.headers.get('content-disposition')!, /felice_2033-05_to_2033-06\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.buffer as unknown as ExcelJS.Buffer);
    assert.ok(wb.getWorksheet('Line Items'));
    error(await app.call('GET', '/orgs/felice/reports/export.xlsx'), 400, /from must be a month/);
  });
});

describe('importing planned weeks', () => {
  test('a file in the app\'s own format: preview, then import; the same week is then reported as existing', async () => {
    const file = await template('planned-weeks');
    const preview = await app.upload('/orgs/alur/import?dryRun=1', file);
    assert.equal(preview.status, 200);
    assert.deepEqual([preview.body.format, preview.body.applied, preview.body.weeks.length], ['flat', false, 3]);
    assert.deepEqual(preview.body.weeks[0].exists, false);
    assert.equal(preview.body.weeks[0].label, 'Nov 2026 W1');
    assert.equal((await app.call('GET', '/orgs/alur/weeks?from=2026-11&to=2026-12')).body.length, 0, 'the preview wrote nothing');
    const done = await app.upload('/orgs/alur/import?dryRun=true', file); // "true" also means preview
    assert.equal(done.body.applied, false);
    const imported = await app.upload('/orgs/alur/import', file);
    assert.equal(imported.body.applied, true);
    assert.equal((await app.upload('/orgs/alur/import?dryRun=1', file)).body.weeks[0].exists, true);
  });

  test('the original planner layout needs a year; without one it assumes the current year', async () => {
    const file = await template('planner-layout');
    const given = await app.upload('/orgs/felice/import?year=2027&dryRun=1', file);
    assert.deepEqual([given.body.format, given.body.weeks[0].label], ['planner', 'Nov 2027 W1']);
    const assumed = await app.upload('/orgs/felice/import?dryRun=1', file);
    assert.match(assumed.body.weeks[0].label, new RegExp(`Nov ${new Date().getFullYear()} W1`));
    error(await app.upload('/orgs/felice/import?year=1900', file), 400, /year must be a whole number between 2000 and 2100/);
  });

  test('files that cannot be imported are refused with a reason', async () => {
    error(await app.upload('/orgs/felice/import', 'plain text'), 400, /Upload an Excel \.xlsx file/);
    error(await app.upload('/orgs/felice/import', Buffer.from('PK\x03\x04 but not a real workbook')), 400, /could not be read as an Excel/);
    error(await app.upload('/orgs/felice/import', await workbook({ Notes: [['hello']] })), 400, /No importable sheet found/);
    const noRows = await workbook({ 'Line Items': [['Year', 'Month', 'Week', 'Category', 'Name', 'Amount']] });
    error(await app.upload('/orgs/felice/import', noRows), 400, /No weeks were found in the file/);
  });

  test('a combined export imports into one organisation, skipping the other\'s rows', async () => {
    const rows = [
      ['Organisation', 'Year', 'Month', 'Week', 'Category', 'Name', 'Amount'],
      ['Felice', 2034, 1, 1, 'Other', 'F cost', 100],
      ['Alur', 2034, 1, 1, 'Other', 'A cost', 200],
    ];
    const result = await app.upload('/orgs/alur/import?dryRun=1', await workbook({ 'Line Items': rows }));
    assert.equal(result.body.weeks[0].itemCount, 1);
    assert.match(result.body.warnings[0], /1 rows belonging to other organisations were skipped/);
  });
});

describe('actual expenditure', () => {
  const IMPORT = '/orgs/felice/actuals/import?sheet=03-09&year=2035&month=8&weekNo=1';
  let expenses: Buffer;
  before(async () => {
    expenses = await template('actual-expenditure');
  });

  test('the tabs of a workbook are listed, with the last weekly tab suggested', async () => {
    const r = await app.upload('/orgs/felice/actuals/sheets', expenses);
    assert.deepEqual(r.body.sheets.map((s: { name: string }) => s.name), ['03-09', '10-16', 'READ ME']);
    assert.equal(r.body.suggested, '10-16');
    error(await app.upload('/orgs/felice/actuals/sheets', 'plain text'), 400, /Upload an Excel \.xlsx file/);
    error(await app.upload('/orgs/felice/actuals/sheets', Buffer.from('PK\x03\x04 broken')), 400, /could not be read as an Excel/);
  });

  test('a preview compares with the plan and saves nothing; the import saves, and importing again replaces', async () => {
    const preview = await app.upload(`${IMPORT}&dryRun=1`, expenses);
    assert.deepEqual([preview.body.applied, preview.body.total, preview.body.paid, preview.body.planned, preview.body.replaces, preview.body.adjusted], [false, 119100, 62400, null, false, false]);
    assert.match(preview.body.warnings.join(' '), /August 2035 W1 has no plan/);
    assert.deepEqual((await app.call('GET', '/orgs/felice/actuals')).body, []);

    const planned = await app.call('POST', '/orgs/felice/weeks', { year: 2035, month: 8, weekNo: 1 });
    await headliner(planned.body.id, 65000, 0);
    const done = await app.upload(IMPORT, expenses);
    assert.deepEqual([done.body.applied, done.body.planned.total, done.body.replaces], [true, 65000, false]);
    assert.equal(done.body.warnings.length, 0);
    assert.equal((await app.upload(IMPORT, expenses)).body.replaces, true);
    const list = await app.call('GET', '/orgs/felice/actuals');
    assert.equal(list.body.length, 1);
    assert.deepEqual([list.body[0].label, list.body[0].total, list.body[0].paid], ['03-09', 119100, 62400]);
  });

  test('actuals can be listed for a period, read one at a time, and removed', async () => {
    await app.upload('/orgs/felice/actuals/import?sheet=10-16&year=2035&month=9&weekNo=2', expenses);
    const inSep = await app.call('GET', '/orgs/felice/actuals?from=2035-09&to=2035-09');
    assert.equal(inSep.body.length, 1);
    error(await app.call('GET', '/orgs/felice/actuals?from=2035-09'), 400, /to must be a month/);
    const one = await app.call('GET', `/orgs/felice/actuals/${inSep.body[0].id}`);
    assert.equal(one.body.sections.length, 7);
    error(await app.call('GET', `/orgs/alur/actuals/${inSep.body[0].id}`), 404, /not found/i);
    error(await app.call('DELETE', `/orgs/alur/actuals/${inSep.body[0].id}`), 404, /not found/i);
    assert.equal((await app.call('DELETE', `/orgs/felice/actuals/${inSep.body[0].id}`)).status, 204);
    assert.deepEqual((await app.call('GET', '/orgs/felice/actuals?from=2035-09&to=2035-09')).body, []);
  });

  test('a section total can be adjusted, and the week is then marked adjusted', async () => {
    const adjust = encodeURIComponent(JSON.stringify({ Miscellenious: 5000 }));
    const r = await app.upload(`/orgs/felice/actuals/import?sheet=03-09&year=2036&month=2&weekNo=3&dryRun=1&adjust=${adjust}`, expenses);
    assert.deepEqual([r.body.adjusted, r.body.total, r.body.byGroup.marketing], [true, 116600, 5000]);
    assert.equal((await app.upload('/orgs/felice/actuals/import?sheet=03-09&year=2036&month=2&weekNo=3&dryRun=1&adjust=', expenses)).body.adjusted, false, 'an empty adjust means no adjustment');
  });

  test('bad import requests say what is wrong', async () => {
    const at = (query: string) => app.upload(`/orgs/felice/actuals/import?${query}`, expenses);
    error(await at('year=2035&month=8&weekNo=1'), 400, /sheet is required/);
    error(await at('sheet=Nope&year=2035&month=8&weekNo=1'), 400, /no tab called "Nope"/);
    error(await at('sheet=03-09&year=1&month=8&weekNo=1'), 400, /year must be/);
    error(await at('sheet=03-09&year=2035&month=13&weekNo=1'), 400, /month must be/);
    error(await at('sheet=03-09&year=2035&month=8&weekNo=9'), 400, /weekNo must be/);
    error(await at('sheet=READ%20ME&year=2035&month=8&weekNo=1'), 400, /has no expense totals/);
    error(await app.upload('/orgs/felice/actuals/import?sheet=a', 'text'), 400, /Upload an Excel \.xlsx file/);
    const base = 'sheet=03-09&year=2035&month=8&weekNo=1';
    error(await at(`${base}&adjust=not-json`), 400, /adjust must be JSON/);
    error(await at(`${base}&adjust=${encodeURIComponent('[1]')}`), 400, /adjust must be an object/);
    error(await at(`${base}&adjust=null`), 400, /adjust must be an object/);
    error(await at(`${base}&adjust=${encodeURIComponent('5')}`), 400, /adjust must be an object/);
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`S${i}`, 1]));
    error(await at(`${base}&adjust=${encodeURIComponent(JSON.stringify(many))}`), 400, /Too many adjusted sections/);
    for (const bad of ['"x"', '-1', '1000000001']) {
      error(await at(`${base}&adjust=${encodeURIComponent(`{"Miscellenious":${bad}}`)}`), 400, /adjusted amount for "Miscellenious" must be a number/);
    }
  });

  test('the planned-against-actual report', async () => {
    const r = await app.call('GET', '/orgs/felice/reports/variance?from=2035-08&to=2035-08');
    assert.deepEqual([r.body.rows[0].planned, r.body.rows[0].actual, r.body.totals.weeksCompared], [65000, 119100, 1]);
    assert.equal((await app.call('GET', '/orgs/felice/reports/variance?from=2035-08&to=2035-08&groupBy=week')).body.groupBy, 'week');
    error(await app.call('GET', '/orgs/felice/reports/variance'), 400, /from must be a month/);
    error(await app.call('GET', '/orgs/felice/reports/variance?from=2035-08&to=2035-08&groupBy=x'), 400, /groupBy/);
  });
});

describe('the master (combined) view', () => {
  before(async () => {
    const f = await app.call('POST', '/orgs/felice/weeks', { year: 2036, month: 9, weekNo: 1 });
    await headliner(f.body.id, 10000, 0, 'Master Act');
    const a = await app.call('POST', '/orgs/alur/weeks', { year: 2036, month: 9, weekNo: 1 });
    assert.equal((await headliner(a.body.id, 5000, 0, 'Master Act', 'alur')).status, 201);
    await app.call('POST', '/orgs/alur/weeks', { year: 2036, month: 10, weekNo: 1 });
  });
  const P = 'from=2036-09&to=2036-10';

  test('summary, top, variance and resident bookings add both organisations together', async () => {
    const summary = await app.call('GET', `/master/summary?${P}`);
    assert.equal(summary.body.totals.total, 15000);
    assert.deepEqual(Object.keys(summary.body.totals.byOrg).sort(), ['alur', 'felice']);
    assert.equal((await app.call('GET', `/master/summary?${P}&groupBy=week`)).body.groupBy, 'week');
    const top = await app.call('GET', `/master/top?${P}&category=headline`);
    assert.deepEqual([top.body[0].name, top.body[0].total, top.body[0].count], ['Master Act', 15000, 2]);
    assert.equal((await app.call('GET', `/master/top?${P}&category=headline&limit=1`)).body.length, 1);
    assert.equal((await app.call('GET', `/master/variance?${P}`)).status, 200);
    assert.equal((await app.call('GET', `/master/resident-bookings?${P}`)).status, 200);
    error(await app.call('GET', '/master/summary'), 400, /from must be a month/);
    error(await app.call('GET', `/master/top?${P}&limit=0&category=headline`), 400, /limit/);
    error(await app.call('GET', `/master/variance?${P}&groupBy=x`), 400, /groupBy/);
    error(await app.call('GET', '/master/variance'), 400, /from must be a month/);
    error(await app.call('GET', '/master/resident-bookings'), 400, /from must be a month/);
  });

  test('the master view has no write routes', async () => {
    assert.equal((await app.call('POST', '/master/summary', {})).status, 404);
    assert.equal((await app.call('POST', '/master/weeks', {})).status, 404);
  });

  test('compare organisation with organisation, or one combined month with another', async () => {
    const orgs = await app.call('GET', `/master/compare?mode=org&a=felice&b=alur&${P}`);
    assert.deepEqual([orgs.body.mode, orgs.body.a.label, orgs.body.b.label], ['org', 'Felice', 'Alur']);
    const months = await app.call('GET', '/master/compare?a=2036-09&b=2036-10');
    assert.equal(months.body.mode, 'month');
    assert.equal((await app.call('GET', '/master/compare?mode=month&a=2036-09&b=2036-10')).status, 200);
    error(await app.call('GET', `/master/compare?mode=org&a=felice&b=nobody&${P}`), 404, /Organisation not found/);
    error(await app.call('GET', '/master/compare?mode=org&a=felice&b=alur'), 400, /from must be a month/);
    error(await app.call('GET', '/master/compare?mode=week&a=1&b=2'), 400, /mode must be "org" or "month"/);
    error(await app.call('GET', '/master/compare?a=2036-09'), 400, /b must be a month/);
  });

  test('combined export to Excel', async () => {
    const r = await app.call('GET', `/master/export.xlsx?${P}`);
    assert.ok(isXlsx(r));
    assert.match(r.headers.get('content-disposition')!, /combined_2036-09_to_2036-10\.xlsx/);
    error(await app.call('GET', '/master/export.xlsx'), 400, /from must be a month/);
  });
});

/** The session cookie header, for the few calls that must be made with exact headers. */
async function cookieHeader(): Promise<string> {
  const res = await app.bare('POST', '/api/auth/login', {
    headers: { 'content-type': 'application/json', 'x-requested-with': 'felice' },
    body: JSON.stringify({ password: (await import('./support.ts')).PASSWORD }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}
