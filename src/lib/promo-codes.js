'use strict';

// Single source of truth for promo codes. Inactive codes (e.g. LEGACY50) are
// retained for history but are never listed or honored.
const PROMO_CODES = [
  { code: 'WELCOME10', percentOff: 10, active: true },
  { code: 'PRO25', percentOff: 25, active: true },
  { code: 'LEGACY50', percentOff: 50, active: false },
];

// Active codes only, shaped for the billing page / list endpoint.
function listPromoCodes() {
  return PROMO_CODES
    .filter((c) => c.active)
    .map((c) => ({ code: c.code, percentOff: c.percentOff }));
}

// Discount `price` by an active code's percent, rounded to 2 decimals. Unknown,
// misspelled, or inactive codes leave the price unchanged. The contract fixes
// behavior, not argument order, so accept (price, code) or (code, price).
function applyPromoCode(a, b) {
  const price = typeof a === 'number' ? a : b;
  const code = typeof a === 'string' ? a : b;

  const match = PROMO_CODES.find((c) => c.active && c.code === code);
  if (!match) return price;
  // Work in integer cents so the percentage discount rounds half-up to 2dp
  // without the float trap: 10.10 * 0.75 = 7.57499… must yield 7.58, not 7.57.
  const cents = Math.round(price * 100);
  return Math.round((cents * (100 - match.percentOff)) / 100) / 100;
}

module.exports = { PROMO_CODES, listPromoCodes, applyPromoCode };
