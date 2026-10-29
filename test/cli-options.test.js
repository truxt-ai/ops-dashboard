'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePort } = require('../src/lib/cli-options');

test('resolvePort prefers the --port flag', () => {
  assert.equal(resolvePort(['--port', '4000'], { PORT: '5000' }), 4000);
});

test('resolvePort falls back to the PORT environment variable', () => {
  assert.equal(resolvePort([], { PORT: '5000' }), '5000');
});

test('resolvePort defaults to 3000', () => {
  assert.equal(resolvePort([], {}), 3000);
});
