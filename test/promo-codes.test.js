'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { applyPromoCode, getActivePromoCodes } = require('../src/lib/promo-codes');

// Criterion 1: WELCOME10 gives 10% off
test('applyPromoCode: WELCOME10 on 100 returns 90', () => {
  assert.strictEqual(applyPromoCode(100, 'WELCOME10'), 90);
});

// Criterion 2: PRO25 gives 25% off
test('applyPromoCode: PRO25 on 100 returns 75', () => {
  assert.strictEqual(applyPromoCode(100, 'PRO25'), 75);
});

// Criterion 3: LEGACY50 is inactive — price unchanged
test('applyPromoCode: LEGACY50 (inactive) on 100 returns 100', () => {
  assert.strictEqual(applyPromoCode(100, 'LEGACY50'), 100);
});

// Criterion 4a: unknown code leaves price unchanged
test('applyPromoCode: unknown code NOPE returns original price', () => {
  assert.strictEqual(applyPromoCode(100, 'NOPE'), 100);
});

// Criterion 4b: misspelled code leaves price unchanged
test('applyPromoCode: misspelled code WELCOM10 returns original price', () => {
  assert.strictEqual(applyPromoCode(100, 'WELCOM10'), 100);
});

// Criterion 5: case-insensitive matching
test('applyPromoCode: lowercase welcome10 treated same as WELCOME10', () => {
  assert.strictEqual(applyPromoCode(100, 'welcome10'), 90);
});

// Criterion 6: result rounded to 2 decimal places
test('applyPromoCode: PRO25 on 99.99 rounds to 74.99', () => {
  assert.strictEqual(applyPromoCode(99.99, 'PRO25'), 74.99);
});

// Criterion 7a: empty string code leaves price unchanged
test('applyPromoCode: empty string code leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode(100, ''), 100);
});

// Criterion 7b: whitespace-only code leaves price unchanged
test('applyPromoCode: whitespace-only code leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode(100, '   '), 100);
});

// Criterion 7c: null-ish (null) code leaves price unchanged
test('applyPromoCode: null code leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode(100, null), 100);
});

// Criterion 7d: undefined code leaves price unchanged
test('applyPromoCode: undefined code leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode(100, undefined), 100);
});

// Criterion 8a: active list contains exactly WELCOME10 and PRO25
test('getActivePromoCodes: returns exactly WELCOME10 and PRO25', () => {
  const codes = getActivePromoCodes();
  const codenames = codes.map(c => c.code);
  assert.ok(codenames.includes('WELCOME10'), 'WELCOME10 must be in active list');
  assert.ok(codenames.includes('PRO25'), 'PRO25 must be in active list');
  assert.strictEqual(codes.length, 2, 'exactly 2 active codes expected');
});

// Criterion 8b: LEGACY50 is absent from the active list; list must be non-empty
test('getActivePromoCodes: LEGACY50 not in active list', () => {
  const codes = getActivePromoCodes();
  assert.ok(codes.length > 0, 'active list must be non-empty');
  const codenames = codes.map(c => c.code);
  assert.ok(!codenames.includes('LEGACY50'), 'LEGACY50 must not appear in active list');
});

// Criterion 8c: each entry exposes code, description, discountPercent; list must be non-empty
test('getActivePromoCodes: each entry has code, description, discountPercent', () => {
  const codes = getActivePromoCodes();
  assert.ok(codes.length > 0, 'active list must be non-empty');
  for (const entry of codes) {
    assert.ok(typeof entry.code === 'string', 'entry.code must be a string');
    assert.ok(typeof entry.description === 'string', 'entry.description must be a string');
    assert.ok(typeof entry.discountPercent === 'number', 'entry.discountPercent must be a number');
  }
});

// Criterion 8d: WELCOME10 has discountPercent 10, PRO25 has 25
test('getActivePromoCodes: WELCOME10 discountPercent is 10, PRO25 is 25', () => {
  const codes = getActivePromoCodes();
  const welcome = codes.find(c => c.code === 'WELCOME10');
  const pro = codes.find(c => c.code === 'PRO25');
  assert.strictEqual(welcome.discountPercent, 10);
  assert.strictEqual(pro.discountPercent, 25);
});
