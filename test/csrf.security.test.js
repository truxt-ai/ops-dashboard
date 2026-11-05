'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const axios = require('axios');

const token = 'synthetic-csrf-fixture';
const protectedPaths = ['/', '/api/promo-codes', '/health/upstream'];
const publicPaths = ['/health/live', '/health/ready'];
let server;
let origin;

beforeEach(async t => {
  const previous = process.env.DASHBOARD_TOKEN;
  process.env.DASHBOARD_TOKEN = token;
  t.after(() => {
    if (previous === undefined) delete process.env.DASHBOARD_TOKEN;
    else process.env.DASHBOARD_TOKEN = previous;
  });
  delete require.cache[require.resolve('../src/app')];
  const { app } = require('../src/app');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));

async function request(path, options = {}) {
  const response = await fetch(origin + path, {
    ...options,
    headers: { origin: 'https://attacker.example', ...options.headers },
    signal: AbortSignal.timeout(2000),
  });
  return { status: response.status, headers: response.headers, body: await response.text() };
}

test('AXM-916: cross-site cookies, queries and forms cannot authenticate protected routes', async t => {
  const probe = t.mock.method(axios, 'get', async () => ({ status: 200 }));
  for (const path of protectedPaths) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const response = await request(`${path}?token=${token}&access_token=${token}`, {
        method,
        headers: {
          cookie: `DASHBOARD_TOKEN=${token}; token=${token}; session=${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        ...(method === 'POST' ? { body: `token=${token}&authorization=Bearer+${token}` } : {}),
      });
      assert.equal(response.status, 401, `${method} ${path} requires an explicit bearer header`);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    const basic = await request(path, {
      headers: { authorization: `Basic ${Buffer.from(`user:${token}`).toString('base64')}` },
    });
    assert.equal(basic.status, 401, 'browser-managed Basic credentials cannot authenticate');
  }
  for (const path of publicPaths) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(probe.mock.callCount(), 0, 'forged requests and public probes must not call upstream');
});

test('AXM-916: explicit bearer requests work without issuing cookies or enabling cross-origin headers', async t => {
  const probe = t.mock.method(axios, 'get', async () => ({ status: 204 }));
  for (const path of protectedPaths) {
    const response = await request(path, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const preflight = await request(path, {
      method: 'OPTIONS',
      headers: {
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  }
  assert.equal(probe.mock.callCount(), 1);
});

test('AXM-916: every current endpoint rejects state-changing methods even with valid bearer auth', async t => {
  const probe = t.mock.method(axios, 'get', async () => ({ status: 200 }));
  for (const path of [...protectedPaths, ...publicPaths]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await request(path, { method, headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 404, `${method} ${path} must not execute a handler`);
    }
  }
  assert.equal(probe.mock.callCount(), 0);
});
