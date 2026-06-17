'use strict';

// Route integration tests for GET /api/promo-codes
// Tests are RED until the implementer adds the route to src/server.js.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Import the express app without starting it; server.js must export { app }.
const { app } = require('../src/server');

let server;
let baseUrl;

before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  server.close(resolve);
}));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(body) });
      });
    }).on('error', reject);
  });
}

test('GET /api/promo-codes returns 200', async () => {
  const { status } = await getJSON(`${baseUrl}/api/promo-codes`);
  assert.strictEqual(status, 200);
});

test('GET /api/promo-codes returns an array', async () => {
  const { body } = await getJSON(`${baseUrl}/api/promo-codes`);
  assert.ok(Array.isArray(body), 'response body must be an array');
});

test('GET /api/promo-codes includes WELCOME10 and PRO25', async () => {
  const { body } = await getJSON(`${baseUrl}/api/promo-codes`);
  const names = body.map((c) => c.code);
  assert.ok(names.includes('WELCOME10'), 'WELCOME10 must be present');
  assert.ok(names.includes('PRO25'), 'PRO25 must be present');
});

test('GET /api/promo-codes omits LEGACY50', async () => {
  const { body } = await getJSON(`${baseUrl}/api/promo-codes`);
  const names = body.map((c) => c.code);
  assert.ok(!names.includes('LEGACY50'), 'LEGACY50 must be absent');
});

test('GET /api/promo-codes returns exactly 2 codes', async () => {
  const { body } = await getJSON(`${baseUrl}/api/promo-codes`);
  assert.strictEqual(body.length, 2);
});

test('GET /api/promo-codes entries have code and percentOff fields', async () => {
  const { body } = await getJSON(`${baseUrl}/api/promo-codes`);
  for (const entry of body) {
    assert.ok(typeof entry.code === 'string', 'code must be a string');
    assert.ok(typeof entry.percentOff === 'number', 'percentOff must be a number');
  }
});
