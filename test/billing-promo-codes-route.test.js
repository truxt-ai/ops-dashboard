'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/server');

function listen(appInstance) {
  return new Promise((resolve, reject) => {
    const server = appInstance.listen(0, () => resolve(server));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('GET /api/billing/promo-codes returns only active promo codes with percentOff values', async (t) => {
  const server = await listen(app);
  t.after(() => close(server));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/billing/promo-codes`);
  const body = await response.text();

  assert.equal(response.status, 200, body);
  assert.match(response.headers.get('content-type') || '', /^application\/json\b/);

  const codes = JSON.parse(body).sort((a, b) => a.code.localeCompare(b.code));
  assert.deepEqual(codes, [
    { code: 'PRO25', percentOff: 25 },
    { code: 'WELCOME10', percentOff: 10 },
  ]);
  assert.equal(
    codes.some((promoCode) => promoCode.code === 'LEGACY50'),
    false,
    'inactive LEGACY50 must not be returned',
  );
});
