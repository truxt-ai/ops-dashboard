'use strict';

// Self-contained promo-code catalog and discount logic for the billing page.
// Retired codes stay in the catalog (for auditability) but are never honored:
// only entries flagged `active` apply a discount. See PROJECT_CONTRACT.md SD-4.

const _ = require('lodash');

// Canonical catalog. LEGACY50 is intentionally retired (active: false) so the
// apply path proves inactive codes leave the price unchanged.
const promoCatalog = [
  { code: 'WELCOME10', percent: 10, active: true },
  { code: 'PRO25', percent: 25, active: true },
  { code: 'LEGACY50', percent: 50, active: false },
];

// The promo codes a customer may currently use: active entries only.
function getActivePromoCodes() {
  return promoCatalog.filter((promo) => promo.active);
}

// Apply a promo code to a price, returning the discounted amount rounded to the
// nearest cent. Unknown, misspelled, empty, or inactive codes leave the price
// unchanged. The result is never negative.
function applyPromoCode(code, price) {
  const promo = promoCatalog.find((entry) => entry.code === code);
  if (!promo || !promo.active) {
    return price;
  }
  const discounted = price * (1 - promo.percent / 100);
  return Math.max(0, _.round(discounted, 2));
}

module.exports = { promoCatalog, getActivePromoCodes, applyPromoCode };
