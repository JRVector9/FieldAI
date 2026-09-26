import assert from 'node:assert/strict';
import { test } from 'node:test';

import { periodAt } from '../src/billing-period.js';

test('Field monthly billing keeps its original Korea day and clock across February and leap years', () => {
  const anchor = new Date('2026-01-31T01:30:00+09:00');
  assert.equal(periodAt(anchor, 0).endsAt.toISOString(), '2026-02-27T16:30:00.000Z');
  assert.equal(periodAt(anchor, 1).startsAt.toISOString(), '2026-02-27T16:30:00.000Z');
  assert.equal(periodAt(anchor, 1).endsAt.toISOString(), '2026-03-30T16:30:00.000Z');
  assert.equal(periodAt(new Date('2024-01-31T23:45:00+09:00'), 0).endsAt.toISOString(), '2024-02-29T14:45:00.000Z');
  assert.equal(periodAt(new Date('2024-02-29T00:00:00+09:00'), 12).startsAt.toISOString(), '2025-02-27T15:00:00.000Z');
  assert.throws(() => periodAt(anchor, -1), RangeError);
  assert.throws(() => periodAt(new Date('invalid'), 0), RangeError);
});
