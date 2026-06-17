'use strict';

// HTTP route tests for GET /api/promo-codes.
// These tests are intentionally RED before the route is implemented.
// See acceptance criteria in ATL-161.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/server');

// Helper: start server on a random port, run fn, close server.
function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await fn(port);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
    server.on('error', reject);
  });
}

// Helper: GET request returning { status, body }.
function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (_) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    }).on('error', reject);
  });
}

test('GET /api/promo-codes returns HTTP 200', async () => {
  await withServer(async (port) => {
    const { status } = await getJson(port, '/api/promo-codes');
    assert.strictEqual(status, 200);
  });
});

test('GET /api/promo-codes returns JSON array with 2 active codes', async () => {
  await withServer(async (port) => {
    const { body } = await getJson(port, '/api/promo-codes');
    assert.ok(Array.isArray(body), 'body should be an array');
    assert.strictEqual(body.length, 2);
  });
});

test('GET /api/promo-codes body includes WELCOME10', async () => {
  await withServer(async (port) => {
    const { body } = await getJson(port, '/api/promo-codes');
    assert.ok(Array.isArray(body));
    const found = body.find((c) => c.code === 'WELCOME10');
    assert.ok(found, 'WELCOME10 must be in the response');
    assert.strictEqual(found.percentOff, 10);
  });
});

test('GET /api/promo-codes body includes PRO25', async () => {
  await withServer(async (port) => {
    const { body } = await getJson(port, '/api/promo-codes');
    assert.ok(Array.isArray(body));
    const found = body.find((c) => c.code === 'PRO25');
    assert.ok(found, 'PRO25 must be in the response');
    assert.strictEqual(found.percentOff, 25);
  });
});

test('GET /api/promo-codes body does NOT include LEGACY50', async () => {
  await withServer(async (port) => {
    const { body } = await getJson(port, '/api/promo-codes');
    assert.ok(Array.isArray(body));
    const found = body.find((c) => c.code === 'LEGACY50');
    assert.strictEqual(found, undefined, 'LEGACY50 must not appear in the response');
  });
});
