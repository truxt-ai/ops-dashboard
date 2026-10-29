'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { presentHealthFreshness } = require('../src/lib/health-freshness');

const at = '2026-10-22T08:05:00.000Z';

test('a snapshot exactly five minutes old is still fresh', () => {
  const result = presentHealthFreshness(at, () => new Date('2026-10-22T08:10:00.000Z'));
  assert.deepEqual(result, { isoTimestamp: at, label: 'Last updated 08:05 UTC', stale: false });
});

test('a snapshot older than five minutes is labelled stale', () => {
  const result = presentHealthFreshness(at, () => new Date('2026-10-22T08:10:00.001Z'));
  assert.equal(result.stale, true);
  assert.equal(result.label, 'Stale: last updated 08:05 UTC');
});

test('an invalid timestamp is rejected', () => {
  assert.throws(() => presentHealthFreshness('not a date'), RangeError);
});
