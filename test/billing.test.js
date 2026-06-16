'use strict';

// Tests for promo code listing and discount application.
// These tests define the contract the implementation must satisfy (TDD).
// Tests FAIL for missing src/lib/billing.js or missing GET /billing/promos route.
//
// Project-contract refs: SD-4, FR-*, TC-1, TC-2, TC-4

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { getActivePromoCodes, applyPromoDiscount } = require('../src/lib/billing');
const { app } = require('../src/server');

// ── applyPromoDiscount ──────────────────────────────────────────────────────

test('applyPromoDiscount: WELCOME10 returns 90 on price 100', () => {
  assert.strictEqual(applyPromoDiscount(100, 'WELCOME10'), 90);
});

test('applyPromoDiscount: PRO25 returns 75 on price 100', () => {
  assert.strictEqual(applyPromoDiscount(100, 'PRO25'), 75);
});

test('applyPromoDiscount: LEGACY50 returns original price (inactive)', () => {
  assert.strictEqual(applyPromoDiscount(100, 'LEGACY50'), 100);
});

test('applyPromoDiscount: unknown code returns original price', () => {
  assert.strictEqual(applyPromoDiscount(100, 'DOESNOTEXIST'), 100);
});

test('applyPromoDiscount: misspelled code returns original price', () => {
  assert.strictEqual(applyPromoDiscount(100, 'WELCOME1O'), 100);
});

test('applyPromoDiscount: empty string code returns original price', () => {
  assert.strictEqual(applyPromoDiscount(100, ''), 100);
});

test('applyPromoDiscount: absent code (undefined) returns original price', () => {
  assert.strictEqual(applyPromoDiscount(100, undefined), 100);
});

// ── getActivePromoCodes ─────────────────────────────────────────────────────

test('getActivePromoCodes: includes WELCOME10 with 10% discount', () => {
  const codes = getActivePromoCodes();
  const entry = codes.find(c => c.code === 'WELCOME10');
  assert.ok(entry, 'WELCOME10 must be present in active codes');
  assert.strictEqual(entry.discountPercent, 10);
});

test('getActivePromoCodes: includes PRO25 with 25% discount', () => {
  const codes = getActivePromoCodes();
  const entry = codes.find(c => c.code === 'PRO25');
  assert.ok(entry, 'PRO25 must be present in active codes');
  assert.strictEqual(entry.discountPercent, 25);
});

test('getActivePromoCodes: excludes LEGACY50 (inactive code must not be returned)', () => {
  const codes = getActivePromoCodes();
  const entry = codes.find(c => c.code === 'LEGACY50');
  assert.strictEqual(entry, undefined, 'LEGACY50 must not appear in the active list');
});

test('getActivePromoCodes: each entry has code and discountPercent, no internal active flag', () => {
  const codes = getActivePromoCodes();
  assert.ok(Array.isArray(codes), 'return value must be an array');
  for (const c of codes) {
    assert.strictEqual(typeof c.code, 'string', 'code must be a string');
    assert.strictEqual(typeof c.discountPercent, 'number', 'discountPercent must be a number');
    assert.strictEqual(c.active, undefined, 'internal active field must not leak to callers');
  }
});

// ── GET /billing/promos ─────────────────────────────────────────────────────

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

test('GET /billing/promos: 200 with array containing WELCOME10 and PRO25', async () => {
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  try {
    const { status, data } = await getJson(port, '/billing/promos');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data), 'response body must be an array');
    const codes = data.map(c => c.code);
    assert.ok(codes.includes('WELCOME10'), 'WELCOME10 must appear in response');
    assert.ok(codes.includes('PRO25'), 'PRO25 must appear in response');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('GET /billing/promos: LEGACY50 not included in response', async () => {
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  try {
    const { data } = await getJson(port, '/billing/promos');
    const codes = data.map(c => c.code);
    assert.ok(!codes.includes('LEGACY50'), 'inactive LEGACY50 must not appear');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('GET /billing/promos: each entry has code and discountPercent fields', async () => {
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  try {
    const { data } = await getJson(port, '/billing/promos');
    for (const c of data) {
      assert.strictEqual(typeof c.code, 'string');
      assert.strictEqual(typeof c.discountPercent, 'number');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
