'use strict';

// Canonical promo-code registry and discount logic for the billing page.
// Single source of truth for promo data; the list endpoint (story 2) reads from
// here. Pure and in-app: no external services, no expiry/stacking rules beyond
// the `active` flag.

const PROMO_CODES = [
  { code: 'WELCOME10', percentOff: 10, active: true },
  { code: 'PRO25', percentOff: 25, active: true },
  { code: 'LEGACY50', percentOff: 50, active: false },
];

// Apply a promo code to a price. The code is normalized (trimmed + uppercased)
// before lookup. An active match returns the discounted price rounded to 2
// decimals; an unknown, misspelled, or inactive code returns the price unchanged.
function applyPromoCode(price, code) {
  if (typeof code !== 'string') return price;
  const normalized = code.trim().toUpperCase();
  const entry = PROMO_CODES.find((p) => p.code === normalized && p.active === true);
  if (!entry) return price;
  return Math.round(price * (1 - entry.percentOff / 100) * 100) / 100;
}

// Return only active codes, shaped { code, percentOff }. Inactive codes are
// never exposed.
function listActivePromoCodes() {
  return PROMO_CODES
    .filter((p) => p.active === true)
    .map((p) => ({ code: p.code, percentOff: p.percentOff }));
}

module.exports = { PROMO_CODES, applyPromoCode, listActivePromoCodes };
