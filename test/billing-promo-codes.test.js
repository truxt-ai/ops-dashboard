'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/server');

function requestJson(path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.get({ hostname: '127.0.0.1', port, path }, (res) => {
        let body = '';

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          server.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }

            resolve({
              statusCode: res.statusCode,
              contentType: res.headers['content-type'] || '',
              body,
            });
          });
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });
    });

    server.on('error', reject);
  });
}

function loadPromoCodeModule() {
  try {
    return require('../src/lib/promo-codes');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('../src/lib/promo-codes')) {
      assert.fail('Expected reusable promo-code helper module at src/lib/promo-codes.js');
    }

    throw err;
  }
}

test('GET /api/billing/promo-codes returns only active canonical promo codes', async () => {
  const response = await requestJson('/api/billing/promo-codes');

  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /application\/json/);

  const payload = JSON.parse(response.body);
  assert.ok(Array.isArray(payload.promoCodes), 'response exposes promoCodes array');

  const promoCodesByCode = new Map(
    payload.promoCodes.map((promoCode) => [promoCode.code, promoCode]),
  );

  assert.deepEqual([...promoCodesByCode.keys()].sort(), ['PRO25', 'WELCOME10']);
  assert.equal(promoCodesByCode.get('WELCOME10').discountPercent, 10);
  assert.equal(promoCodesByCode.get('PRO25').discountPercent, 25);
  assert.equal(promoCodesByCode.has('LEGACY50'), false);

  for (const promoCode of payload.promoCodes) {
    assert.equal(typeof promoCode.code, 'string');
    assert.equal(typeof promoCode.discountPercent, 'number');
  }
});

test('applyPromoCodeDiscount applies active discounts and ignores inactive or unknown codes', () => {
  const { applyPromoCodeDiscount } = loadPromoCodeModule();

  assert.equal(typeof applyPromoCodeDiscount, 'function');
  assert.equal(applyPromoCodeDiscount(100, 'WELCOME10'), 90);
  assert.equal(applyPromoCodeDiscount(100, 'PRO25'), 75);
  assert.equal(applyPromoCodeDiscount(100, 'LEGACY50'), 100);
  assert.equal(applyPromoCodeDiscount(100, 'WELCOME15'), 100);
  assert.equal(applyPromoCodeDiscount(100, 'NOT-A-CODE'), 100);
});

test('applyPromoCodeDiscount trims and case-normalizes submitted codes', () => {
  const { applyPromoCodeDiscount } = loadPromoCodeModule();

  assert.equal(applyPromoCodeDiscount(100, 'welcome10'), 90);
  assert.equal(applyPromoCodeDiscount(100, '  pro25  '), 75);
  assert.equal(applyPromoCodeDiscount(100, ''), 100);
  assert.equal(applyPromoCodeDiscount(100, '   '), 100);
  assert.equal(applyPromoCodeDiscount(100), 100);
});
