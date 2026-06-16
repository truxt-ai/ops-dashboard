'use strict';

const PROMO_CODES = Object.freeze({
  WELCOME10: Object.freeze({ code: 'WELCOME10', discountPercent: 10, active: true }),
  PRO25: Object.freeze({ code: 'PRO25', discountPercent: 25, active: true }),
  LEGACY50: Object.freeze({ code: 'LEGACY50', discountPercent: 50, active: false }),
});

const { WELCOME10, PRO25, LEGACY50 } = PROMO_CODES;

function normalizePromoCode(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input.trim().toUpperCase();
}

function getPromoCode(input) {
  const code = normalizePromoCode(input);
  return PROMO_CODES[code] || null;
}

function listActivePromoCodes() {
  return Object.values(PROMO_CODES)
    .filter((promoCode) => promoCode.active)
    .map(({ code, discountPercent }) => ({ code, discountPercent }));
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readDiscountArgs(priceOrOptions, input) {
  if (priceOrOptions && typeof priceOrOptions === 'object') {
    return {
      price: priceOrOptions.price ?? priceOrOptions.originalPrice ?? priceOrOptions.amount,
      code: priceOrOptions.code ?? priceOrOptions.promoCode ?? priceOrOptions.promo_code,
    };
  }

  return {
    price: priceOrOptions,
    code: input,
  };
}

function applyPromoCodeDiscount(priceOrOptions, input) {
  const { price, code } = readDiscountArgs(priceOrOptions, input);
  const promoCode = getPromoCode(code);
  const amount = Number(price);

  if (!promoCode || !promoCode.active || !Number.isFinite(amount)) {
    return price;
  }

  return roundCurrency(amount * ((100 - promoCode.discountPercent) / 100));
}

function buildDiscountQuote(price, input) {
  const promoCode = getPromoCode(input);
  const amount = Number(price);
  const discountApplied = Boolean(promoCode && promoCode.active && Number.isFinite(amount));
  const finalPrice = discountApplied
    ? applyPromoCodeDiscount(amount, promoCode.code)
    : price;

  return {
    originalPrice: price,
    finalPrice,
    discountedPrice: finalPrice,
    promoCode: discountApplied ? promoCode.code : normalizePromoCode(input),
    discountPercent: discountApplied ? promoCode.discountPercent : 0,
    discountApplied,
  };
}

module.exports = {
  PROMO_CODES,
  WELCOME10,
  PRO25,
  LEGACY50,
  normalizePromoCode,
  getPromoCode,
  listActivePromoCodes,
  getActivePromoCodes: listActivePromoCodes,
  listAvailablePromoCodes: listActivePromoCodes,
  availablePromoCodes: listActivePromoCodes,
  applyPromoCodeDiscount,
  applyPromoCode: applyPromoCodeDiscount,
  applyPromoCodeToPrice: applyPromoCodeDiscount,
  applyDiscount: applyPromoCodeDiscount,
  calculateDiscountedPrice: applyPromoCodeDiscount,
  buildDiscountQuote,
};
