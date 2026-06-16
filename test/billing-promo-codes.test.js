'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const axios = require('axios');
const { app } = require('../src/server');

function requestJson(routePath) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.get({ hostname: '127.0.0.1', port, path: routePath }, (res) => {
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

function parseJsonResponse(response) {
  try {
    return JSON.parse(response.body);
  } catch (err) {
    assert.fail(`expected JSON response body, got: ${response.body}`);
  }
}

function loadPromoCodeModule() {
  try {
    return require('../src/lib/promo-codes');
  } catch (err) {
    if (
      err.code === 'MODULE_NOT_FOUND' &&
      err.message.includes(path.join('src', 'lib', 'promo-codes'))
    ) {
      assert.fail('expected reusable promo-code helper module at src/lib/promo-codes.js');
    }

    throw err;
  }
}

function withoutExternalPromoCodeBoundary(fn) {
  const calls = [];
  const originals = {
    axiosGet: axios.get,
    axiosPost: axios.post,
    fetch: global.fetch,
    httpGet: http.get,
    httpRequest: http.request,
    httpsGet: https.get,
    httpsRequest: https.request,
  };
  const blocked = (name) => {
    return () => {
      calls.push(name);
      throw new Error(`promo-code evaluation must not call ${name}`);
    };
  };

  axios.get = blocked('axios.get');
  axios.post = blocked('axios.post');
  global.fetch = blocked('fetch');
  http.get = blocked('http.get');
  http.request = blocked('http.request');
  https.get = blocked('https.get');
  https.request = blocked('https.request');

  try {
    const result = fn();
    assert.deepEqual(calls, [], 'promo-code evaluation must stay inside the dashboard process');
    return result;
  } finally {
    axios.get = originals.axiosGet;
    axios.post = originals.axiosPost;
    global.fetch = originals.fetch;
    http.get = originals.httpGet;
    http.request = originals.httpRequest;
    https.get = originals.httpsGet;
    https.request = originals.httpsRequest;
  }
}

test('GET /api/billing/promo-codes returns only active promo-code discounts', async () => {
  const response = await requestJson('/api/billing/promo-codes');

  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /application\/json/);

  const payload = parseJsonResponse(response);
  assert.ok(Array.isArray(payload.promoCodes), 'response exposes a promoCodes array');

  const promoCodesByCode = new Map(
    payload.promoCodes.map((promoCode) => [promoCode.code, promoCode]),
  );

  assert.deepEqual([...promoCodesByCode.keys()].sort(), ['PRO25', 'WELCOME10']);
  assert.equal(promoCodesByCode.get('WELCOME10').discountPercent, 10);
  assert.equal(promoCodesByCode.get('PRO25').discountPercent, 25);
  assert.equal(promoCodesByCode.has('LEGACY50'), false);
});

test('shared promo-code helper exposes the same active code contract used by billing routes', () => {
  const { listActivePromoCodes } = loadPromoCodeModule();

  assert.equal(typeof listActivePromoCodes, 'function');
  assert.deepEqual(listActivePromoCodes(), [
    { code: 'WELCOME10', discountPercent: 10 },
    { code: 'PRO25', discountPercent: 25 },
  ]);
});

test('applyPromoCodeDiscount applies active discounts and leaves inactive or invalid codes unchanged', () => {
  const { applyPromoCodeDiscount } = loadPromoCodeModule();

  assert.equal(typeof applyPromoCodeDiscount, 'function');
  assert.equal(applyPromoCodeDiscount({ code: 'WELCOME10', price: 100 }), 90);
  assert.equal(applyPromoCodeDiscount({ code: 'PRO25', price: 100 }), 75);
  assert.equal(applyPromoCodeDiscount({ code: 'LEGACY50', price: 100 }), 100);
  assert.equal(applyPromoCodeDiscount({ code: 'WELCOME15', price: 100 }), 100);
  assert.equal(applyPromoCodeDiscount({ code: 'NOT-A-CODE', price: 100 }), 100);
});

test('applyPromoCodeDiscount normalizes input locally without calling an external promo service', () => {
  const { applyPromoCodeDiscount } = loadPromoCodeModule();

  withoutExternalPromoCodeBoundary(() => {
    assert.equal(applyPromoCodeDiscount({ code: ' welcome10 ', price: 100 }), 90);
    assert.equal(applyPromoCodeDiscount({ code: 'pro25', price: 100 }), 75);
    assert.equal(applyPromoCodeDiscount({ code: '', price: 100 }), 100);
    assert.equal(applyPromoCodeDiscount({ code: '   ', price: 100 }), 100);
  });
});
