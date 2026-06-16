'use strict';

const promoCodes = [
  { code: 'WELCOME10', discountPercent: 10, status: 'active' },
  { code: 'PRO25', discountPercent: 25, status: 'active' },
  { code: 'LEGACY50', discountPercent: 50, status: 'retired' },
];

function getActivePromoCodes() {
  return promoCodes
    .filter((p) => p.status === 'active')
    .map(({ code, discountPercent }) => ({ code, discountPercent }));
}

module.exports = { promoCodes, getActivePromoCodes };
