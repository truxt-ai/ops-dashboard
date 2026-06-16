'use strict';

// Acceptance criteria: GET /api/promo-codes returns 200 with active codes only.
// Contract clauses: SD-4, TC-2.
// Tests will be RED until the route and registry are implemented.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('../src/server');

let server;
let port;

before(() => new Promise((resolve) => {
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    port = server.address().port;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  server.close(resolve);
}));

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let body;
        try { body = JSON.parse(raw); } catch { body = null; }
        resolve({ status: res.statusCode, body });
      });
    }).on('error', reject);
  });
}

test('GET /api/promo-codes returns 200', async () => {
  const { status } = await getJson('/api/promo-codes');
  assert.strictEqual(status, 200);
});

test('GET /api/promo-codes includes WELCOME10 with discountPercent 10', async () => {
  const { body } = await getJson('/api/promo-codes');
  const entry = body.find(c => c.code === 'WELCOME10');
  assert.ok(entry, 'WELCOME10 must appear in response');
  assert.strictEqual(entry.discountPercent, 10);
});

test('GET /api/promo-codes includes PRO25 with discountPercent 25', async () => {
  const { body } = await getJson('/api/promo-codes');
  const entry = body.find(c => c.code === 'PRO25');
  assert.ok(entry, 'PRO25 must appear in response');
  assert.strictEqual(entry.discountPercent, 25);
});

test('GET /api/promo-codes excludes LEGACY50', async () => {
  const { body } = await getJson('/api/promo-codes');
  const legacy = body.find(c => c.code === 'LEGACY50');
  assert.strictEqual(legacy, undefined, 'LEGACY50 must not appear — it is retired');
});

test('GET /api/promo-codes returns exactly [WELCOME10, PRO25] (order-independent)', async () => {
  const { body } = await getJson('/api/promo-codes');
  assert.strictEqual(body.length, 2, 'response must contain exactly 2 codes');
  const codes = body.map(c => c.code).sort();
  assert.deepStrictEqual(codes, ['PRO25', 'WELCOME10']);
});
