'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatUptime } = require('../src/lib/time-format');

test('formatUptime clamps empty, zero, and negative durations to zero minutes', () => {
  assert.strictEqual(formatUptime(), '0m');
  assert.strictEqual(formatUptime(0), '0m');
  assert.strictEqual(formatUptime(-1), '0m');
});

test('formatUptime floors fractional seconds before formatting', () => {
  assert.strictEqual(formatUptime(59.9), '0m');
  assert.strictEqual(formatUptime(60.9), '1m');
});

test('formatUptime formats minute, hour, and day boundaries', () => {
  const cases = [
    [59, '0m'],
    [60, '1m'],
    [3599, '59m'],
    [3600, '1h 0m'],
    [86399, '23h 59m'],
    [86400, '1d 0m'],
  ];

  for (const [seconds, expected] of cases) {
    assert.strictEqual(formatUptime(seconds), expected);
  }
});

test('formatUptime omits zero day and hour parts but retains zero minutes', () => {
  assert.strictEqual(formatUptime(60), '1m');
  assert.strictEqual(formatUptime(3600), '1h 0m');
  assert.strictEqual(formatUptime(86400), '1d 0m');
  assert.strictEqual(formatUptime(90000), '1d 1h 0m');
});

test('formatUptime combines day, hour, and minute parts', () => {
  assert.strictEqual(formatUptime(3 * 86400 + 4 * 3600 + 12 * 60), '3d 4h 12m');
});
