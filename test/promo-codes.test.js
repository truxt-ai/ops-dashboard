'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { listActivePromoCodes, applyPromoCode } = require('../src/lib/promo-codes');

// Criterion 1: listActivePromoCodes returns exactly WELCOME10 and PRO25; LEGACY50 absent.
test('listActivePromoCodes returns exactly the two active codes', () => {
  const codes = listActivePromoCodes();
  assert.ok(Array.isArray(codes), 'result is an array');
  assert.strictEqual(codes.length, 2, 'exactly two active codes');
  const codeMap = Object.fromEntries(codes.map(c => [c.code, c.discountPercent]));
  assert.strictEqual(codeMap['WELCOME10'], 10, 'WELCOME10 has 10% discount');
  assert.strictEqual(codeMap['PRO25'], 25, 'PRO25 has 25% discount');
  assert.ok(!('LEGACY50' in codeMap), 'LEGACY50 is absent (inactive)');
});

// Criterion 2: applyPromoCode('WELCOME10', 100) === 90.
test('applyPromoCode WELCOME10 reduces price by 10%', () => {
  assert.strictEqual(applyPromoCode('WELCOME10', 100), 90);
});

// Criterion 3: applyPromoCode('PRO25', 100) === 75.
test('applyPromoCode PRO25 reduces price by 25%', () => {
  assert.strictEqual(applyPromoCode('PRO25', 100), 75);
});

// Criterion 4: applyPromoCode('LEGACY50', 100) === 100 (inactive code not honored).
test('applyPromoCode LEGACY50 does not apply discount (inactive)', () => {
  assert.strictEqual(applyPromoCode('LEGACY50', 100), 100);
});

// Criterion 5: unknown code and close misspelling both leave price unchanged.
test('applyPromoCode unknown code leaves price unchanged', () => {
  assert.strictEqual(applyPromoCode('FOO', 100), 100, 'unknown code');
  assert.strictEqual(applyPromoCode('WELCOME1', 100), 100, 'near-miss misspelling');
});

// Criterion 6: code matching is case-sensitive.
test('applyPromoCode is case-sensitive', () => {
  assert.strictEqual(applyPromoCode('welcome10', 100), 100, 'lowercase rejected');
  assert.strictEqual(applyPromoCode('Welcome10', 100), 100, 'mixed-case rejected');
});
