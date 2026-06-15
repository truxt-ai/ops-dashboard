'use strict';

const PROMO_CODES = Object.freeze([
  Object.freeze({ code: 'WELCOME10', percentOff: 10, active: true }),
  Object.freeze({ code: 'PRO25', percentOff: 25, active: true }),
  Object.freeze({ code: 'LEGACY50', percentOff: 50, active: false }),
]);

function getAvailablePromoCodes() {
  return PROMO_CODES
    .filter((promoCode) => promoCode.active)
    .map(({ code, percentOff }) => ({ code, percentOff }));
}

function findPromoCode(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return null;
  }

  return PROMO_CODES.find((promoCode) => promoCode.code === code) || null;
}

function applyPromoCode(priceCents, code) {
  const promoCode = findPromoCode(code);

  if (
    !promoCode ||
    !promoCode.active ||
    typeof priceCents !== 'number' ||
    !Number.isFinite(priceCents)
  ) {
    return priceCents;
  }

  return Math.round((priceCents * (100 - promoCode.percentOff)) / 100);
}

module.exports = {
  PROMO_CODES,
  applyPromoCode,
  applyPromoCodeCents: applyPromoCode,
  getAvailablePromoCodes,
  listAvailablePromoCodes: getAvailablePromoCodes,
};
