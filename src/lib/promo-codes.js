'use strict';

// Promo codes for the billing page. Self-contained static source — no DB, no
// external service. Inactive codes are retired and must never be honored.
const PROMO_CODES = [
  { code: 'WELCOME10', discountPercent: 10, active: true },
  { code: 'PRO25', discountPercent: 25, active: true },
  { code: 'LEGACY50', discountPercent: 50, active: false },
];

// Active codes only, shaped as { code, discountPercent }. LEGACY50 is excluded.
function listActivePromoCodes() {
  return PROMO_CODES.filter((promo) => promo.active).map((promo) => ({
    code: promo.code,
    discountPercent: promo.discountPercent,
  }));
}

// Apply an active code to a price. Matching is exact and case-sensitive: an
// unknown, misspelled, or inactive code leaves the price unchanged.
function applyPromoCode(code, price) {
  const match = PROMO_CODES.find((promo) => promo.active && promo.code === code);
  return match ? price * (1 - match.discountPercent / 100) : price;
}

module.exports = { listActivePromoCodes, applyPromoCode };
