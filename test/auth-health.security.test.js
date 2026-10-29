'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const axios = require('axios');

// Synthetic fixture, never a deployed credential.
const token = 'synthetic-dashboard-fixture';
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

async function request(path, authorization, method = 'GET') {
  const response = await fetch(origin + path, {
    method,
    headers: authorization === undefined ? {} : { authorization },
    signal: AbortSignal.timeout(2000),
  });
  return { status: response.status, body: await response.text() };
}

test('TH-004: dashboard and all API routes fail closed and accept only the bearer token', async () => {
  for (const path of ['/', '/api/promo-codes', '/api/missing', '/API/promo-codes/']) {
    for (const header of [undefined, 'Basic invalid', 'Bearer wrong', `Bearer ${token}x`, 'Bearer é']) {
      assert.equal((await request(path, header)).status, 401, `${path} must reject invalid auth`);
    }
    assert.equal((await request(path, undefined, 'HEAD')).status, 401);
    assert.equal((await request(path, undefined, 'POST')).status, 401);
  }
  assert.equal((await request('/', `Bearer ${token}`)).status, 200);
  assert.equal((await request('/api/promo-codes', `Bearer ${token}`)).status, 200);
  assert.equal((await request('/api/missing', `Bearer ${token}`)).status, 404);

  for (const configured of [undefined, '']) {
    if (configured === undefined) delete process.env.DASHBOARD_TOKEN;
    else process.env.DASHBOARD_TOKEN = configured;
    for (const path of ['/', '/api/promo-codes', '/health/upstream']) {
      const response = await request(path, `Bearer ${token}`);
      assert.equal(response.status, 503);
      assert.deepEqual(JSON.parse(response.body), { error: 'auth not configured' });
    }
  }
});

test('TH-013: upstream auth prevents anonymous probes and results are shared for 15 seconds', async t => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const probe = t.mock.method(axios, 'get', async () => ({ status: 204 }));
  const first = await request('/health/upstream', `Bearer ${token}`);
  assert.equal(first.status, 200);
  assert.deepEqual(JSON.parse(first.body), { upstream: 'ok', status: 204 });
  now += 14999;
  assert.deepEqual(await request('/health/upstream', `Bearer ${token}`), first);
  assert.equal(probe.mock.callCount(), 1, 'requests within 15 seconds must reuse the probe');
  now++;
  assert.equal((await request('/health/upstream', `Bearer ${token}`)).status, 200);
  assert.equal(probe.mock.callCount(), 2, 'the cache must expire after 15 seconds');
  for (const path of ['/health/upstream', '/HEALTH/upstream/']) {
    for (const header of [undefined, 'Bearer invalid']) {
      assert.equal((await request(path, header)).status, 401);
    }
  }
  assert.equal(probe.mock.callCount(), 2, 'unauthorized requests must never probe upstream');
});

test('TH-014: open readiness and liveness stay local even during upstream failure', async t => {
  const probe = t.mock.method(axios, 'get', async () => { throw new Error('synthetic outage'); });
  delete process.env.DASHBOARD_TOKEN;
  for (const path of ['/health/ready', '/health/live']) {
    for (let repeat = 0; repeat < 3; repeat++) {
      const response = await request(path);
      assert.equal(response.status, 200, `${path} must not depend on upstream availability`);
      assert.deepEqual(JSON.parse(response.body), { status: 'ok' });
    }
  }
  assert.equal(probe.mock.callCount(), 0);
});

test('TH-015: upstream errors are generic, logged server-side and cached', async t => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const error = new Error('synthetic private upstream detail');
  const probe = t.mock.method(axios, 'get', async () => { throw error; });
  const log = t.mock.method(console, 'error', () => {});
  const response = await request('/health/upstream', `Bearer ${token}`);
  assert.equal(response.status, 502);
  assert.deepEqual(JSON.parse(response.body), { upstream: 'unreachable', error: 'upstream unavailable' });
  assert.equal(response.body.includes(error.message), false);
  assert.equal(log.mock.callCount(), 1);
  assert.ok(log.mock.calls[0].arguments.includes(error), 'retain the real error only in server logs');
  assert.deepEqual(await request('/health/upstream', `Bearer ${token}`), response);
  assert.equal(probe.mock.callCount(), 1, 'failures must also be cached');
  assert.equal(log.mock.callCount(), 1);
  now += 15000;
  probe.mock.mockImplementation(async () => ({ status: 200 }));
  assert.equal((await request('/health/upstream', `Bearer ${token}`)).status, 200);
});
