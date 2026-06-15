'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('../src/server');

const expectedActiveCodes = [
  { code: 'WELCOME10', percentOff: 10 },
  { code: 'PRO25', percentOff: 25 },
];

function loadPromoCodesModule() {
  try {
    return require('../src/lib/promo-codes');
  } catch (err) {
    assert.fail(`expected src/lib/promo-codes.js to export promo-code helpers: ${err.message}`);
  }
}

function normalizeCodes(codes) {
  return codes.map(({ code, percentOff }) => ({ code, percentOff }));
}

function listen(serverApp) {
  return new Promise((resolve) => {
    const server = serverApp.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getJson(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(body);
        } catch (err) {
          reject(new Error(`expected JSON response, got ${res.statusCode}: ${body}`));
          return;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
  });
}

test('listActivePromoCodes returns only WELCOME10 and PRO25 with percent discounts', () => {
  const { listActivePromoCodes } = loadPromoCodesModule();

  const codes = listActivePromoCodes();

  assert.deepStrictEqual(normalizeCodes(codes), expectedActiveCodes);
  assert.strictEqual(codes.some((promoCode) => promoCode.code === 'LEGACY50'), false);
});

test('GET /api/billing/promo-codes returns the active promo-code list without inactive codes', async () => {
  const server = await listen(app);
  try {
    const response = await getJson(server, '/api/billing/promo-codes');

    assert.strictEqual(response.statusCode, 200);
    assert.match(response.headers['content-type'] || '', /^application\/json\b/);
    assert.deepStrictEqual(response.body, expectedActiveCodes);
    assert.strictEqual(response.body.some((promoCode) => promoCode.code === 'LEGACY50'), false);
  } finally {
    await close(server);
  }
});

test('applyPromoCodeDiscount applies WELCOME10 and PRO25 to integer cent prices', () => {
  const { applyPromoCodeDiscount } = loadPromoCodesModule();

  assert.strictEqual(applyPromoCodeDiscount(10000, 'WELCOME10'), 9000);
  assert.strictEqual(applyPromoCodeDiscount(10000, 'PRO25'), 7500);
});

test('applyPromoCodeDiscount leaves inactive, unknown, misspelled, blank, and nullish codes unchanged', () => {
  const { applyPromoCodeDiscount } = loadPromoCodesModule();

  assert.strictEqual(applyPromoCodeDiscount(10000, 'LEGACY50'), 10000);
  assert.strictEqual(applyPromoCodeDiscount(10000, 'SUMMER10'), 10000);
  assert.strictEqual(applyPromoCodeDiscount(10000, 'WELCOME100'), 10000);
  assert.strictEqual(applyPromoCodeDiscount(10000, ''), 10000);
  assert.strictEqual(applyPromoCodeDiscount(10000, '   '), 10000);
  assert.strictEqual(applyPromoCodeDiscount(10000, null), 10000);
  assert.strictEqual(applyPromoCodeDiscount(10000, undefined), 10000);
});

test('applyPromoCodeDiscount normalizes lowercase and whitespace-padded valid codes', () => {
  const { applyPromoCodeDiscount } = loadPromoCodesModule();

  assert.strictEqual(applyPromoCodeDiscount(10000, 'welcome10'), 9000);
  assert.strictEqual(applyPromoCodeDiscount(10000, '  PRO25  '), 7500);
});
