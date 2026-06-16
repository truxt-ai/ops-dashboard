'use strict';

// Unit tests for applyPromo(price, code) — ATL-91
// Contract: ATL-90 story (pure function, no I/O, no endpoint)
// Project contract: TC-1, SD-4 (shared lib, no external deps)

const { test } = require('node:test');
const assert = require('node:assert/strict');

// Stub fallback keeps tests runnable (and RED) before the module is implemented.
let applyPromo;
try {
  ({ applyPromo } = require('../src/lib/applyPromo'));
} catch (_) {
  applyPromo = (_price, _code) => 0;
}

// ── Active discount codes ─────────────────────────────────────────────────────

// Criterion: applyPromo(100, "WELCOME10") == 90
// Data flow: SD-4 shared helper; price * (1 - 10/100) = 90
// Risk: active 10% code must reduce price, not be silently ignored
test('applyPromo WELCOME10 applies 10% discount on integer price', () => {
  assert.strictEqual(applyPromo(100, 'WELCOME10'), 90);
});

// Criterion: applyPromo(100, "PRO25") == 75
// Data flow: SD-4 shared helper; price * (1 - 25/100) = 75
// Risk: active 25% code must reduce price correctly
test('applyPromo PRO25 applies 25% discount on integer price', () => {
  assert.strictEqual(applyPromo(100, 'PRO25'), 75);
});

// Criterion: applyPromo(99.99, "PRO25") == 74.99
// Data flow: SD-4 shared helper; 99.99 * 0.75 = 74.9925 -> rounds to 74.99
// Risk: rounding must be standard (half away from zero), not banker's rounding;
//       float arithmetic must not produce 74.992 or similar
test('applyPromo PRO25 rounds to 2 decimals using standard rounding', () => {
  assert.strictEqual(applyPromo(99.99, 'PRO25'), 74.99);
});

// ── Retired codes ─────────────────────────────────────────────────────────────

// Criterion: applyPromo(100, "LEGACY50") == 100 (retired code, never honored)
// Data flow: registry lookup returns retired status; price unchanged
// Risk: retired codes must not silently apply discounts
test('applyPromo LEGACY50 is unchanged (retired code)', () => {
  assert.strictEqual(applyPromo(100, 'LEGACY50'), 100);
});

// ── Unknown codes ─────────────────────────────────────────────────────────────

// Criterion: applyPromo(100, "NOPE") == 100 (unknown code)
// Data flow: registry lookup misses; price unchanged
// Risk: misspelled/nonexistent codes must not alter price
test('applyPromo unknown code NOPE is unchanged', () => {
  assert.strictEqual(applyPromo(100, 'NOPE'), 100);
});

// ── Empty / null / undefined codes ───────────────────────────────────────────

// Criterion: applyPromo(100, "") == 100
// Data flow: empty string lookup misses; price unchanged
// Risk: omitted/empty promo input must not alter price
test('applyPromo empty string code is unchanged', () => {
  assert.strictEqual(applyPromo(100, ''), 100);
});

// Criterion: null code -> return price unchanged
// Data flow: null coercion must not accidentally match a registry entry
// Risk: callers may pass null when no promo is selected
test('applyPromo null code returns price unchanged', () => {
  assert.strictEqual(applyPromo(100, null), 100);
});

// Criterion: undefined code -> return price unchanged
// Data flow: undefined coercion must not accidentally match a registry entry
// Risk: callers may pass undefined when the code field is absent
test('applyPromo undefined code returns price unchanged', () => {
  assert.strictEqual(applyPromo(100, undefined), 100);
});
