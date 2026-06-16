'use strict';

const { getActivePromoCodes } = require('./promo-registry');

// Round to 2 decimals using "half away from zero" (standard commercial
// rounding), NOT banker's rounding, so a half-cent always rounds up in
// magnitude regardless of sign.
function roundCents(value) {
  return (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100;
}

// Pure: apply an active promo code's discount to price and return the new
// price. The Story 1 promo registry is the single source of truth; only active
// codes are honored (getActivePromoCodes filters out retired entries). Unknown,
// misspelled, retired, empty, or null/undefined codes leave price unchanged.
// Matching is exact against the registry (codes are stored uppercase).
function applyPromo(price, code) {
  const promo = getActivePromoCodes().find((p) => p.code === code);
  if (!promo) return price;
  return roundCents(price * (1 - promo.discountPercent / 100));
}

module.exports = applyPromo;
module.exports.applyPromo = applyPromo;
