'use strict';

// Acceptance criteria: registry is the single source of truth for promo codes.
// Contract clauses: SD-4, TC-1.
// Fallback to {} so tests compile-and-fail at assertion level before impl lands.
let registry;
try { registry = require('../src/lib/promo/registry'); } catch { registry = {}; }

const { test } = require('node:test');
const assert = require('node:assert');

test('WELCOME10 is active with 10% discount', () => {
  const entry = registry.WELCOME10;
  assert.ok(entry, 'WELCOME10 must exist in registry');
  assert.strictEqual(entry.discountPercent, 10);
  assert.strictEqual(entry.status, 'active');
});

test('PRO25 is active with 25% discount', () => {
  const entry = registry.PRO25;
  assert.ok(entry, 'PRO25 must exist in registry');
  assert.strictEqual(entry.discountPercent, 25);
  assert.strictEqual(entry.status, 'active');
});

test('LEGACY50 is retired with 50% discount', () => {
  const entry = registry.LEGACY50;
  assert.ok(entry, 'LEGACY50 must exist in registry');
  assert.strictEqual(entry.discountPercent, 50);
  assert.strictEqual(entry.status, 'retired');
});

test('registry contains exactly WELCOME10, PRO25, LEGACY50', () => {
  const keys = Object.keys(registry).sort();
  assert.deepStrictEqual(keys, ['LEGACY50', 'PRO25', 'WELCOME10']);
});
