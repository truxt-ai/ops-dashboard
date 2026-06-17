'use strict';

// Tests for src/lib/promo-codes.js — listPromoCodes() and applyPromoCode()
// These are RED until the implementation lands on hod/atl-139-impl.

const { test } = require('node:test');
const assert = require('node:assert');

// Will throw MODULE_NOT_FOUND until the implementer creates src/lib/promo-codes.js
const { listPromoCodes, applyPromoCode } = require('../src/lib/promo-codes');

// --- listPromoCodes ---

test('listPromoCodes returns only active codes', () => {
  const codes = listPromoCodes();
  const names = codes.map((c) => c.code);
  assert.ok(names.includes('WELCOME10'), 'WELCOME10 must be listed');
  assert.ok(names.includes('PRO25'), 'PRO25 must be listed');
});

test('listPromoCodes excludes inactive code LEGACY50', () => {
  const codes = listPromoCodes();
  const names = codes.map((c) => c.code);
  assert.ok(!names.includes('LEGACY50'), 'LEGACY50 must NOT appear in the list');
});

test('listPromoCodes returns exactly two entries', () => {
  const codes = listPromoCodes();
  assert.strictEqual(codes.length, 2);
});

test('listPromoCodes includes percentOff for each code', () => {
  const codes = listPromoCodes();
  const welcome = codes.find((c) => c.code === 'WELCOME10');
  const pro = codes.find((c) => c.code === 'PRO25');
  assert.strictEqual(welcome.percentOff, 10);
  assert.strictEqual(pro.percentOff, 25);
});

// --- applyPromoCode ---
// Rounding: implementer must round result to 2 decimal places.
// 10.10 * 0.75 = 7.575 -> 7.58; 9.99 * 0.90 = 8.991 -> 8.99

const applyTable = [
  // active codes — price is reduced (AC criteria exact examples)
  { name: 'WELCOME10 discounts 100 to 90',             price: 100,   code: 'WELCOME10', expected: 90 },
  { name: 'PRO25 discounts 100 to 75',                 price: 100,   code: 'PRO25',     expected: 75 },
  // inactive code — price unchanged
  { name: 'LEGACY50 inactive: price unchanged',        price: 100,   code: 'LEGACY50',  expected: 100 },
  // unknown / misspelled codes — price unchanged
  { name: 'unknown code: price unchanged',             price: 100,   code: 'UNKNOWN',   expected: 100 },
  { name: 'misspelled WELCOM10: price unchanged',      price: 100,   code: 'WELCOM10',  expected: 100 },
  { name: 'empty string: price unchanged',             price: 100,   code: '',          expected: 100 },
  // rounding to 2 decimal places
  { name: 'PRO25 on 10.10 rounds to 2dp (7.58)',       price: 10.10, code: 'PRO25',     expected: 7.58 },
  { name: 'WELCOME10 on 9.99 rounds to 2dp (8.99)',    price: 9.99,  code: 'WELCOME10', expected: 8.99 },
];

for (const { name, price, code, expected } of applyTable) {
  test(name, () => {
    const result = applyPromoCode(price, code);
    assert.strictEqual(
      result,
      expected,
      `applyPromoCode(${price}, '${code}') should be ${expected}, got ${result}`,
    );
  });
}
