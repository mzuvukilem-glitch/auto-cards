// Input checks used by every endpoint.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as v from '../src/validate.ts';

const rejects = (fn: () => unknown, pattern: RegExp) =>
  assert.throws(fn, (e) => e instanceof v.HttpError && e.status === 400 && pattern.test(e.message));

describe('HttpError', () => {
  test('carries the status and the message', () => {
    const e = new v.HttpError(404, 'Not here');
    assert.equal(e.status, 404);
    assert.equal(e.message, 'Not here');
    assert.ok(e instanceof Error);
  });
});

describe('int and id', () => {
  test('whole numbers, or numeric text, inside the range', () => {
    assert.equal(v.int(5, 'n', 1, 10), 5);
    assert.equal(v.int('7', 'n', 1, 10), 7);
    assert.equal(v.int(1, 'n', 1, 10), 1);
    assert.equal(v.int(10, 'n', 1, 10), 10);
  });

  test('anything else is refused, naming the field and the range', () => {
    for (const bad of [0, 11, 1.5, 'x', '', '  ', null, undefined, true, NaN, '1.5']) {
      rejects(() => v.int(bad, 'weekNo', 1, 10), /weekNo must be a whole number between 1 and 10/);
    }
  });

  test('id is a positive whole number, and its field is called "id" unless named', () => {
    assert.equal(v.id('12'), 12);
    rejects(() => v.id('0'), /id must be/);
    rejects(() => v.id('abc', 'a'), /a must be/);
  });
});

describe('text', () => {
  test('is trimmed, and optional text defaults to empty', () => {
    assert.equal(v.text('  hi  ', 'name', 10), 'hi');
    assert.equal(v.text(undefined, 'name', 10), '');
    assert.equal(v.text(null, 'name', 10), '');
    assert.equal(v.text('   ', 'name', 10), '');
  });

  test('required text must be there and not blank', () => {
    rejects(() => v.text(undefined, 'name', 10, true), /name is required/);
    rejects(() => v.text(null, 'name', 10, true), /name is required/);
    rejects(() => v.text('   ', 'name', 10, true), /name is required/);
    assert.equal(v.text('x', 'name', 10, true), 'x');
  });

  test('only text, and no longer than the limit', () => {
    rejects(() => v.text(5, 'name', 10), /name must be text/);
    rejects(() => v.text('x'.repeat(11), 'name', 10), /name must be 10 characters or fewer/);
    assert.equal(v.text('x'.repeat(10), 'name', 10), 'x'.repeat(10));
  });
});

describe('money', () => {
  test('rand in, whole cents out', () => {
    assert.equal(v.money(1500.5), 150050);
    assert.equal(v.money('12.34'), 1234);
    assert.equal(v.money(0), 0);
    assert.equal(v.money(0.1 + 0.2), 30);
    assert.equal(v.money(1_000_000_000), 100_000_000_000);
  });

  test('numbers from 0 to 1,000,000,000 only', () => {
    for (const bad of [-0.01, 1_000_000_001, NaN, Infinity, 'abc', '', null, undefined, {}]) {
      rejects(() => v.money(bad, 'rate'), /rate must be a number between 0 and 1,000,000,000/);
    }
    rejects(() => v.money('x'), /amount must be a number/);
  });
});

describe('category and month', () => {
  test('a known category, or a refusal', () => {
    assert.equal(v.category('hosts'), 'hosts');
    rejects(() => v.category('nope'), /category is not recognised/);
    rejects(() => v.category(undefined), /category is not recognised/);
  });

  test('YYYY-MM with a year from 2000 to 2100', () => {
    assert.deepEqual(v.month('2026-11', 'from'), { key: '2026-11', ym: 202611, year: 2026, month: 11 });
    rejects(() => v.month('2026-13', 'from'), /from must be a month in the form YYYY-MM/);
    rejects(() => v.month('1999-12', 'from'), /from must be a month/);
    rejects(() => v.month('2101-01', 'to'), /to must be a month/);
    rejects(() => v.month(202611, 'to'), /to must be a month/);
    rejects(() => v.month(undefined, 'to'), /to must be a month/);
  });
});

describe('period', () => {
  test('from and to, in order, up to 60 months', () => {
    const p = v.period('2026-01', '2026-12');
    assert.deepEqual([p.from.ym, p.to.ym], [202601, 202612]);
    assert.doesNotThrow(() => v.period('2026-05', '2026-05'));
    assert.doesNotThrow(() => v.period('2021-01', '2025-12')); // exactly 60 months
  });

  test('from after to, or more than 60 months, is refused', () => {
    rejects(() => v.period('2026-06', '2026-05'), /from must be on or before to/);
    rejects(() => v.period('2021-01', '2026-01'), /at most 60 months/);
    rejects(() => v.period('bad', '2026-01'), /from must be a month/);
    rejects(() => v.period('2026-01', 'bad'), /to must be a month/);
  });
});
