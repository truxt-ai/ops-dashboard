'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app } = require('../src/server');

// Criterion 7: GET /api/billing/promo-codes responds 200 with active-codes JSON.
test('GET /api/billing/promo-codes returns 200 and the active codes list', async () => {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;

  try {
    const body = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/billing/promo-codes`, (res) => {
        assert.strictEqual(res.statusCode, 200, 'status must be 200');
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => resolve(JSON.parse(raw)));
      }).on('error', reject);
    });

    assert.ok(Array.isArray(body), 'response body is an array');
    assert.strictEqual(body.length, 2, 'exactly two active codes returned');
    const codeMap = Object.fromEntries(body.map(c => [c.code, c.discountPercent]));
    assert.strictEqual(codeMap['WELCOME10'], 10, 'WELCOME10 in response');
    assert.strictEqual(codeMap['PRO25'], 25, 'PRO25 in response');
    assert.ok(!('LEGACY50' in codeMap), 'LEGACY50 absent from response');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
