'use strict';

// Self-contained promo-code catalog and discount logic for the billing page.
// Retired codes stay in the catalog for auditability but are never honored:
// only entries flagged `active` are listed or apply a discount. Shared logic
// lives here under src/lib/ per PROJECT_CONTRACT.md SD-4 (CommonJS exports).

const _ = require('lodash');

// Canonical catalog. LEGACY50 is intentionally retired (active: false) so the
// list path omits it and the apply path leaves the price unchanged.
const promoCatalog = [
  { code: 'WELCOME10', description: 'New customer: 10% off', percentOff: 10, active: true },
  { code: 'PRO25', description: 'Pro plan: 25% off', percentOff: 25, active: true },
  { code: 'LEGACY50', description: 'Retired launch promo: 50% off', percentOff: 50, active: false },
];

// Active promo codes a customer may currently use, projected to the public
// shape { code, description, percentOff }. Retired codes (LEGACY50) are excluded.
function listActivePromoCodes() {
  return promoCatalog
    .filter((promo) => promo.active)
    .map(({ code, description, percentOff }) => ({ code, description, percentOff }));
}

// Apply a promo code to a price. The code is normalized (trimmed + uppercased)
// before lookup, so matching is case-insensitive and whitespace-tolerant. An
// active match returns price * (1 - percentOff / 100) rounded to the nearest
// cent; unknown, misspelled, or inactive codes leave the price unchanged.
function applyPromoCode(price, code) {
  const normalized = String(code ?? '').trim().toUpperCase();
  const promo = promoCatalog.find((entry) => entry.active && entry.code === normalized);
  if (!promo) {
    return price;
  }
  return _.round(price * (1 - promo.percentOff / 100), 2);
}

module.exports = { promoCatalog, listActivePromoCodes, applyPromoCode };
