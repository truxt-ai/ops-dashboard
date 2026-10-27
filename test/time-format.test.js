'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatUptime } = require('../src/lib/time-format');

test('formatUptime shows days, hours and minutes', () => {
  assert.equal(formatUptime(3 * 86400 + 4 * 3600 + 12 * 60), '3d 4h 12m');
});

test('formatUptime omits zero days and hours but always shows minutes', () => {
  assert.equal(formatUptime(90 * 60), '1h 30m');
  assert.equal(formatUptime(0), '0m');
});

test('formatUptime treats negative and missing input as zero', () => {
  assert.equal(formatUptime(-5), '0m');
  assert.equal(formatUptime(undefined), '0m');
});

test('formatUptime floors fractional seconds', () => {
  assert.equal(formatUptime(119.9), '1m');
});
