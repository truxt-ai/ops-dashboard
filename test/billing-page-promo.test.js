'use strict';

const http = require('node:http');
const { once } = require('node:events');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/server');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${pathname}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
  });
}

function findTestIdText(html, testId) {
  const match = html.match(
    new RegExp(`<[^>]+data-testid=["']${testId}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
  );
  assert.ok(match, `expected billing page to render data-testid="${testId}"`);

  return match[1]
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertVisiblePrice(html, expectedPrice) {
  const priceText = findTestIdText(html, 'billing-price');
  const expected = String(expectedPrice);
  assert.match(
    priceText,
    new RegExp(`(^|[^0-9])\\$?${expected}(\\.00)?([^0-9]|$)`),
    `expected billing-price to show ${expectedPrice}, got "${priceText}"`
  );
}

function billingPathFor(code) {
  return `/billing?promoCode=${encodeURIComponent(code)}`;
}

test('billing page renders dashboard-local active promo codes for a price of 100', async () => {
  const promoResponse = await get('/api/promo-codes');
  assert.strictEqual(promoResponse.status, 200);

  const availableCodes = JSON.parse(promoResponse.body).map((promo) => promo.code);
  assert.deepStrictEqual(availableCodes.sort(), ['PRO25', 'WELCOME10']);
  assert.ok(!availableCodes.includes('LEGACY50'), 'inactive LEGACY50 is not available');

  const billingResponse = await get('/billing');
  assert.strictEqual(billingResponse.status, 200);
  assert.match(billingResponse.headers['content-type'] || '', /html/);

  assert.match(billingResponse.body, /data-testid=["']promo-code-input["']/);
  assert.match(billingResponse.body, /data-testid=["']apply-promo-code["']/);
  assert.match(billingResponse.body, /WELCOME10/);
  assert.match(billingResponse.body, /PRO25/);
  assert.doesNotMatch(billingResponse.body, /LEGACY50/);
  assertVisiblePrice(billingResponse.body, 100);
});

[
  { code: 'WELCOME10', expectedPrice: 90 },
  { code: 'PRO25', expectedPrice: 75 },
].forEach(({ code, expectedPrice }) => {
  test(`billing page applies active promo code ${code} to a displayed price of 100`, async () => {
    const response = await get(billingPathFor(code));

    assert.strictEqual(response.status, 200);
    assertVisiblePrice(response.body, expectedPrice);
  });
});

[
  { name: 'inactive promo code LEGACY50', code: 'LEGACY50' },
  { name: 'unknown promo code', code: 'NOPE' },
  { name: 'misspelled promo code', code: 'WELCOM10' },
  { name: 'blank promo code', code: '' },
].forEach(({ name, code }) => {
  test(`billing page leaves the displayed price at 100 for ${name}`, async () => {
    const response = await get(billingPathFor(code));

    assert.strictEqual(response.status, 200);
    assertVisiblePrice(response.body, 100);
  });
});
