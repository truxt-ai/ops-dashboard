'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROMO_CODES,
  applyPromoCode,
  listActivePromoCodes,
} = require('../src/promo/promoCodes');

describe('PROMO_CODES registry', () => {
  test('contains WELCOME10 with 10% off and active=true', () => {
    const entry = PROMO_CODES.find(p => p.code === 'WELCOME10');
    assert.ok(entry, 'WELCOME10 must be present in PROMO_CODES');
    assert.strictEqual(entry.percentOff, 10);
    assert.strictEqual(entry.active, true);
  });

  test('contains PRO25 with 25% off and active=true', () => {
    const entry = PROMO_CODES.find(p => p.code === 'PRO25');
    assert.ok(entry, 'PRO25 must be present in PROMO_CODES');
    assert.strictEqual(entry.percentOff, 25);
    assert.strictEqual(entry.active, true);
  });

  test('contains LEGACY50 with 50% off and active=false', () => {
    const entry = PROMO_CODES.find(p => p.code === 'LEGACY50');
    assert.ok(entry, 'LEGACY50 must be present in PROMO_CODES');
    assert.strictEqual(entry.percentOff, 50);
    assert.strictEqual(entry.active, false);
  });
});

describe('applyPromoCode — active code discounts', () => {
  test('WELCOME10 returns 90 for price 100', () => {
    assert.strictEqual(applyPromoCode(100, 'WELCOME10'), 90);
  });

  test('PRO25 returns 75 for price 100', () => {
    assert.strictEqual(applyPromoCode(100, 'PRO25'), 75);
  });
});

describe('applyPromoCode — inactive or unknown code leaves price unchanged', () => {
  test('LEGACY50 (inactive) returns original price unchanged', () => {
    assert.strictEqual(applyPromoCode(100, 'LEGACY50'), 100);
  });

  test('unknown code NOPE returns original price unchanged', () => {
    assert.strictEqual(applyPromoCode(100, 'NOPE'), 100);
  });

  test('misspelled code WELCOM10 returns original price unchanged', () => {
    assert.strictEqual(applyPromoCode(100, 'WELCOM10'), 100);
  });
});

describe('applyPromoCode — case-insensitive and whitespace-trimmed input', () => {
  test('lowercase + surrounding spaces still apply discount', () => {
    assert.strictEqual(applyPromoCode(100, '  welcome10 '), 90);
  });
});

describe('applyPromoCode — decimal rounding', () => {
  test('result is rounded to 2 decimal places for non-clean prices', () => {
    const result = applyPromoCode(99.99, 'PRO25');
    // 99.99 * 0.75 = 74.9925 -> rounded to 74.99
    assert.strictEqual(result, 74.99);
  });
});

describe('listActivePromoCodes', () => {
  test('includes WELCOME10', () => {
    const codes = listActivePromoCodes().map(p => p.code);
    assert.ok(codes.includes('WELCOME10'), 'WELCOME10 must appear in active list');
  });

  test('includes PRO25', () => {
    const codes = listActivePromoCodes().map(p => p.code);
    assert.ok(codes.includes('PRO25'), 'PRO25 must appear in active list');
  });

  test('excludes LEGACY50 (inactive) while returning at least one active entry', () => {
    const active = listActivePromoCodes();
    assert.ok(active.length > 0, 'active list must be non-empty');
    const codes = active.map(p => p.code);
    assert.ok(!codes.includes('LEGACY50'), 'LEGACY50 must NOT appear in active list');
  });

  test('each entry exposes code and percentOff but not active flag', () => {
    const active = listActivePromoCodes();
    assert.ok(active.length > 0, 'must return at least one active promo');
    for (const entry of active) {
      assert.ok('code' in entry, 'entry must have code');
      assert.ok('percentOff' in entry, 'entry must have percentOff');
      assert.ok(!('active' in entry), 'entry must not expose active flag');
    }
  });
});
