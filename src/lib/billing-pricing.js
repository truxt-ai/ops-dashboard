'use strict';

const promoCodes = [
  { code: 'WELCOME10', discountPercent: 10, active: true },
  { code: 'PRO25', discountPercent: 25, active: true },
  { code: 'LEGACY50', discountPercent: 50, active: false },
];

function normalizePromoCode(code) {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

function getActivePromoCodes() {
  return promoCodes
    .filter((promoCode) => promoCode.active)
    .map(({ code, discountPercent }) => ({ code, discountPercent }));
}

function findActivePromoCode(code) {
  const normalizedCode = normalizePromoCode(code);
  if (!normalizedCode) return null;

  return promoCodes.find(
    (promoCode) => promoCode.active && promoCode.code === normalizedCode,
  ) || null;
}

function applyPromoCodeDiscount(price, code) {
  const promoCode = findActivePromoCode(code);
  if (!promoCode) return price;

  return price * ((100 - promoCode.discountPercent) / 100);
}

module.exports = {
  applyPromoCodeDiscount,
  findActivePromoCode,
  getActivePromoCodes,
  normalizePromoCode,
  promoCodes,
};
