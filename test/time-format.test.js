'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatUptime } = require('../src/lib/time-format');

test('formatUptime clamps empty, zero, and negative input to 0m', () => {
  assert.strictEqual(formatUptime(), '0m');
  assert.strictEqual(formatUptime(''), '0m');
  assert.strictEqual(formatUptime(0), '0m');
  assert.strictEqual(formatUptime(-1), '0m');
});

test('formatUptime floors fractional seconds before formatting minutes', () => {
  assert.strictEqual(formatUptime(59.9), '0m');
  assert.strictEqual(formatUptime(60.9), '1m');
});

test('formatUptime formats minute and hour boundaries', () => {
  assert.strictEqual(formatUptime(60), '1m');
  assert.strictEqual(formatUptime(3599), '59m');
  assert.strictEqual(formatUptime(3600), '1h 0m');
  assert.strictEqual(formatUptime(86399), '23h 59m');
});

test('formatUptime formats day boundaries and retains zero minutes', () => {
  assert.strictEqual(formatUptime(86400), '1d 0m');
  assert.strictEqual(formatUptime(90000), '1d 1h 0m');
});

test('formatUptime combines days, hours, and minutes', () => {
  assert.strictEqual(formatUptime(274320), '3d 4h 12m');
});
