'use strict';

// Integration tests for GET /api/promo-codes (ATL-179)
// Contract clauses: SD-1, SD-4, SD-5, NFR-2, TC-2, TC-4
// These tests must be RED until the route and promo-codes implementation exist.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/server');

let server;
let port;

before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    port = server.address().port;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  server.close(resolve);
}));

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

test('GET /api/promo-codes — 200 status and JSON content-type', async () => {
  const { statusCode, headers } = await getJson('/api/promo-codes');
  assert.strictEqual(statusCode, 200);
  assert.ok(
    (headers['content-type'] || '').includes('application/json'),
    'content-type must include application/json'
  );
});

test('GET /api/promo-codes — body includes WELCOME10 with percentOff 10', async () => {
  const { body } = await getJson('/api/promo-codes');
  const parsed = JSON.parse(body);
  const entry = (parsed.codes || []).find((c) => c.code === 'WELCOME10');
  assert.ok(entry, 'WELCOME10 must be present in response codes');
  assert.strictEqual(entry.percentOff, 10);
});

test('GET /api/promo-codes — body includes PRO25 with percentOff 25', async () => {
  const { body } = await getJson('/api/promo-codes');
  const parsed = JSON.parse(body);
  const entry = (parsed.codes || []).find((c) => c.code === 'PRO25');
  assert.ok(entry, 'PRO25 must be present in response codes');
  assert.strictEqual(entry.percentOff, 25);
});

test('GET /api/promo-codes — body excludes LEGACY50 (inactive)', async () => {
  const { body } = await getJson('/api/promo-codes');
  const parsed = JSON.parse(body);
  const legacy = (parsed.codes || []).find((c) => c.code === 'LEGACY50');
  assert.strictEqual(legacy, undefined, 'LEGACY50 must NOT appear in the active codes list');
});

test('GET /api/promo-codes — each entry exposes code and percentOff fields', async () => {
  const { body } = await getJson('/api/promo-codes');
  const parsed = JSON.parse(body);
  const codes = parsed.codes || [];
  assert.ok(codes.length > 0, 'codes array must be non-empty');
  for (const entry of codes) {
    assert.ok('code' in entry, `entry ${JSON.stringify(entry)} must have a code field`);
    assert.ok('percentOff' in entry, `entry ${JSON.stringify(entry)} must have a percentOff field`);
  }
});
