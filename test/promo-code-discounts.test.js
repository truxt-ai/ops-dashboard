'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

function loadPromoCodes() {
  try {
    return require('../src/lib/promo-codes');
  } catch (err) {
    assert.fail(
      `Expected dashboard-local promo-code logic at src/lib/promo-codes.js exporting applyPromoCodeDiscount: ${err.message}`,
    );
  }
}

test('applyPromoCodeDiscount applies active promo codes to integer-cent prices', () => {
  const { applyPromoCodeDiscount } = loadPromoCodes();
  assert.equal(typeof applyPromoCodeDiscount, 'function');

  assert.equal(applyPromoCodeDiscount({ priceCents: 10000, code: 'WELCOME10' }), 9000);
  assert.equal(applyPromoCodeDiscount({ priceCents: 10000, code: 'PRO25' }), 7500);

  const oneCentDiscounted = applyPromoCodeDiscount({ priceCents: 1, code: 'PRO25' });
  assert.equal(Number.isInteger(oneCentDiscounted), true);
  assert.equal(oneCentDiscounted >= 0, true);
});

test('applyPromoCodeDiscount treats inactive, blank, missing, and unknown codes as no discount', () => {
  const { applyPromoCodeDiscount } = loadPromoCodes();
  assert.equal(typeof applyPromoCodeDiscount, 'function');

  for (const code of ['LEGACY50', 'UNKNOWN', 'WLECOME10', '', '   ', null, undefined]) {
    assert.equal(
      applyPromoCodeDiscount({ priceCents: 10000, code }),
      10000,
      `${String(code)} should leave the price unchanged`,
    );
  }
});

test('applyPromoCodeDiscount trims code input and matches case-insensitively', () => {
  const { applyPromoCodeDiscount } = loadPromoCodes();
  assert.equal(typeof applyPromoCodeDiscount, 'function');

  assert.equal(applyPromoCodeDiscount({ priceCents: 10000, code: ' welcome10 ' }), 9000);
  assert.equal(applyPromoCodeDiscount({ priceCents: 10000, code: 'pro25' }), 7500);
});
