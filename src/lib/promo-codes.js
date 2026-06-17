'use strict';

const _ = require('lodash');

// Self-contained promo-code catalog for the billing page. Kept as a static,
// in-code list so there are no external service calls. LEGACY50 is retired:
// it stays in the catalog for reference but is never honored or listed because
// `active` is false.
const PROMO_CODES = [
  { code: 'WELCOME10', description: 'Welcome discount: 10% off your order', discountPercent: 10, active: true },
  { code: 'PRO25', description: 'Pro plan discount: 25% off', discountPercent: 25, active: true },
  { code: 'LEGACY50', description: 'Legacy promotion: 50% off (retired)', discountPercent: 50, active: false },
];

// Apply a promo code to a price. Normalizes the input (trim + uppercase), looks
// it up, and only honors active codes. Any unknown, inactive, empty, or non-string
// code leaves the price untouched. Never throws.
function applyPromoCode(price, code) {
  if (typeof code !== 'string') {
    return price;
  }
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return price;
  }
  const promo = PROMO_CODES.find((c) => c.code === normalized && c.active);
  if (!promo) {
    return price;
  }
  return _.round(price * (1 - promo.discountPercent / 100), 2);
}

// List the promo codes the billing page may surface to users: active codes only,
// with the inactive LEGACY50 excluded. Returns plain projections (no `active`
// flag) over copies so callers cannot mutate the catalog.
function getActivePromoCodes() {
  return PROMO_CODES
    .filter((c) => c.active)
    .map((c) => ({ code: c.code, description: c.description, discountPercent: c.discountPercent }));
}

module.exports = { PROMO_CODES, applyPromoCode, getActivePromoCodes };
