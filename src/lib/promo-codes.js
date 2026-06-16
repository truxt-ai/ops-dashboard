'use strict';

const _ = require('lodash');

const PROMO_CODES = {
  WELCOME10: { discount: 10, active: true },
  PRO25:     { discount: 25, active: true },
  LEGACY50:  { discount: 50, active: false },
};

function apply(code, price) {
  const entry = code && PROMO_CODES[code];
  if (!entry || !entry.active) return price;
  return _.round(price * (1 - entry.discount / 100), 2);
}

function listActive() {
  return Object.entries(PROMO_CODES)
    .filter(([, e]) => e.active)
    .map(([code, e]) => ({ code, discount: e.discount }));
}

module.exports = { apply, listActive };
