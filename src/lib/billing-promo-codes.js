'use strict';

const PROMO_CODES = Object.freeze([
  Object.freeze({ code: 'WELCOME10', discountPercent: 10, active: true }),
  Object.freeze({ code: 'PRO25', discountPercent: 25, active: true }),
  Object.freeze({ code: 'LEGACY50', discountPercent: 50, active: false }),
]);

function normalizePromoCode(code) {
  if (typeof code !== 'string') {
    return '';
  }

  return code.trim().toUpperCase();
}

function getActivePromoCode(code) {
  const normalizedCode = normalizePromoCode(code);
  return PROMO_CODES.find((promoCode) => promoCode.active && promoCode.code === normalizedCode) || null;
}

function listActivePromoCodes() {
  return PROMO_CODES
    .filter((promoCode) => promoCode.active)
    .map(({ code, discountPercent }) => ({ code, discountPercent }));
}

function applyPromoCode(priceAmount, code) {
  const promoCode = getActivePromoCode(code);

  if (!promoCode || !Number.isFinite(priceAmount)) {
    return priceAmount;
  }

  const discountMultiplier = (100 - promoCode.discountPercent) / 100;
  return Math.round((priceAmount * discountMultiplier + Number.EPSILON) * 100) / 100;
}

module.exports = {
  applyPromoCode,
  applyPromoDiscount: applyPromoCode,
  applyPromoCodeDiscount: applyPromoCode,
  calculateDiscountedPrice: applyPromoCode,
  getActivePromoCode,
  getActivePromoCodes: listActivePromoCodes,
  listActivePromoCodes,
};
