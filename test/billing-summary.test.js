'use strict';

// Tests for ATL-113: GET /api/billing/summary endpoint
// Covers: empty list, single invoice, multiple invoices (acceptance criteria)
// Contract refs: SD-4, FR-2, TC-1, TC-2, NFR-2

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// --- Unit tests for the pure billing helper (SD-4, TC-1) ---

const { summarizeBilling } = require('../src/lib/billing');

test('summarizeBilling: empty list yields count 0 and total 0', () => {
  const result = summarizeBilling([]);
  assert.deepStrictEqual(result, { count: 0, total: 0 });
});

test('summarizeBilling: single invoice yields count 1 and correct total', () => {
  const result = summarizeBilling([{ amount: 42.5 }]);
  assert.deepStrictEqual(result, { count: 1, total: 42.5 });
});

test('summarizeBilling: multiple invoices sums amounts and returns correct count', () => {
  const invoices = [{ amount: 10 }, { amount: 20 }, { amount: 5.5 }];
  const result = summarizeBilling(invoices);
  assert.deepStrictEqual(result, { count: 3, total: 35.5 });
});

test('summarizeBilling: invoices with zero amount are counted', () => {
  const result = summarizeBilling([{ amount: 0 }, { amount: 0 }]);
  assert.deepStrictEqual(result, { count: 2, total: 0 });
});

// --- Route tests for GET /api/billing/summary (TC-2, SD-3 analog) ---

function makeRequest(server, urlPath) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
  });
}

test('GET /api/billing/summary: responds 200 with JSON body', async () => {
  const { app } = require('../src/server');
  const server = app.listen(0);
  try {
    const { status, body } = await makeRequest(server, '/api/billing/summary');
    assert.strictEqual(status, 200);
    assert.ok(body !== null && typeof body === 'object', 'body must be an object');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/billing/summary: response has numeric count and total fields', async () => {
  const { app } = require('../src/server');
  const server = app.listen(0);
  try {
    const { status, body } = await makeRequest(server, '/api/billing/summary');
    assert.strictEqual(status, 200);
    assert.strictEqual(typeof body.count, 'number', 'count must be a number');
    assert.strictEqual(typeof body.total, 'number', 'total must be a number');
    assert.ok(body.count >= 0, 'count must be non-negative');
    assert.ok(body.total >= 0, 'total must be non-negative');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
