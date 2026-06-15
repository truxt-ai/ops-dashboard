'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

function loadPromoCodes() {
  try {
    const promoCodes = require('../src/lib/promo-codes');
    assert.strictEqual(
      typeof promoCodes.applyPromoCode,
      'function',
      'src/lib/promo-codes must export applyPromoCode(priceCents, code)'
    );
    return promoCodes;
  } catch (err) {
    assert.fail(`Expected promo helper at src/lib/promo-codes.js: ${err.message}`);
  }
}

const activeDiscountCases = [
  { name: 'WELCOME10 discounts 10000 cents to 9000 cents', code: 'WELCOME10', want: 9000 },
  { name: 'PRO25 discounts 10000 cents to 7500 cents', code: 'PRO25', want: 7500 },
];

for (const tc of activeDiscountCases) {
  test(`applyPromoCode ${tc.name}`, () => {
    const { applyPromoCode } = loadPromoCodes();

    assert.strictEqual(applyPromoCode(10000, tc.code), tc.want);
  });
}

const unchangedPriceCases = [
  { name: 'inactive LEGACY50', code: 'LEGACY50' },
  { name: 'unknown code', code: 'SPRING99' },
  { name: 'misspelled active code', code: 'WELCOME01' },
  { name: 'empty code', code: '' },
  { name: 'missing code', code: undefined },
];

for (const tc of unchangedPriceCases) {
  test(`applyPromoCode leaves original price for ${tc.name}`, () => {
    const { applyPromoCode } = loadPromoCodes();

    assert.strictEqual(applyPromoCode(10000, tc.code), 10000);
  });
}
