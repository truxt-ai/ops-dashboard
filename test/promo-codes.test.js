'use strict';

// Unit tests for the promo-code module (src/lib/promo-codes.js).
// These tests are intentionally RED before implementation exists.
// See acceptance criteria in ATL-161.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listActivePromoCodes, applyPromoCode } = require('../src/lib/promo-codes');

// ── applyPromoCode ────────────────────────────────────────────────────────────

test('applyPromoCode: WELCOME10 (10% active) reduces 100 to 90', () => {
  assert.strictEqual(applyPromoCode(100, 'WELCOME10'), 90);
});

test('applyPromoCode: PRO25 (25% active) reduces 100 to 75', () => {
  assert.strictEqual(applyPromoCode(100, 'PRO25'), 75);
});

test('applyPromoCode: LEGACY50 (inactive) leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode(100, 'LEGACY50'), 100);
});

test('applyPromoCode: unknown code leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode(100, 'NOPE'), 100);
});

test('applyPromoCode: code matching is case-insensitive (welcome10 -> 90)', () => {
  assert.strictEqual(applyPromoCode(100, 'welcome10'), 90);
});

test('applyPromoCode: code matching trims whitespace (" WELCOME10 " -> 90)', () => {
  assert.strictEqual(applyPromoCode(100, ' WELCOME10 '), 90);
});

test('applyPromoCode: result is rounded to 2 decimal places (99.99 * 90% = 89.99)', () => {
  assert.strictEqual(applyPromoCode(99.99, 'WELCOME10'), 89.99);
});

test('applyPromoCode: PRO25 on non-round price rounds to 2 decimals (99.99 * 75% = 74.99)', () => {
  assert.strictEqual(applyPromoCode(99.99, 'PRO25'), 75.00 - 0.01); // 74.99
});

// ── listActivePromoCodes ──────────────────────────────────────────────────────

test('listActivePromoCodes: returns exactly two active codes', () => {
  const codes = listActivePromoCodes();
  assert.strictEqual(codes.length, 2);
});

test('listActivePromoCodes: result includes WELCOME10', () => {
  const codes = listActivePromoCodes();
  const found = codes.find((c) => c.code === 'WELCOME10');
  assert.ok(found, 'WELCOME10 should be present');
  assert.strictEqual(found.percentOff, 10);
  assert.ok(typeof found.description === 'string' && found.description.length > 0);
});

test('listActivePromoCodes: result includes PRO25', () => {
  const codes = listActivePromoCodes();
  const found = codes.find((c) => c.code === 'PRO25');
  assert.ok(found, 'PRO25 should be present');
  assert.strictEqual(found.percentOff, 25);
  assert.ok(typeof found.description === 'string' && found.description.length > 0);
});

test('listActivePromoCodes: does NOT include LEGACY50 (inactive)', () => {
  const codes = listActivePromoCodes();
  const found = codes.find((c) => c.code === 'LEGACY50');
  assert.strictEqual(found, undefined, 'LEGACY50 must be excluded');
});

test('listActivePromoCodes: each entry has code, description, percentOff', () => {
  const codes = listActivePromoCodes();
  for (const entry of codes) {
    assert.ok(typeof entry.code === 'string', 'code must be string');
    assert.ok(typeof entry.description === 'string', 'description must be string');
    assert.ok(typeof entry.percentOff === 'number', 'percentOff must be number');
    assert.ok(entry.percentOff > 0 && entry.percentOff < 100, 'percentOff must be 0<x<100');
  }
});
