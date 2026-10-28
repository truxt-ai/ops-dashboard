'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const qs = require('qs');
const { app } = require('../src/app');

// Test-only observer; the production app keeps its default trust policy.
app.get('/__axm746/proxy', (req, res) => res.json({ ip: req.ip, ips: req.ips }));

let server;
let origin;
let previousToken;
before(async () => {
  previousToken = process.env.DASHBOARD_TOKEN;
  process.env.DASHBOARD_TOKEN = 'synthetic-dashboard-fixture';
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  if (previousToken === undefined) delete process.env.DASHBOARD_TOKEN;
  else process.env.DASHBOARD_TOKEN = previousToken;
});

async function request(path, options = {}) {
  return fetch(origin + path, {
    ...options,
    headers: { authorization: `Bearer ${process.env.DASHBOARD_TOKEN}`, ...options.headers },
    signal: AbortSignal.timeout(2000),
  });
}

test('bounded query parser enforces arrayLimit for bracket notation (GHSA-6rw7-vpxm-498p)', async t => {
  // Dependency fixture only: the production app does not configure this smaller limit.
  const fixture = express();
  fixture.set('query parser', query => qs.parse(query, { arrayLimit: 5 }));
  fixture.get('/', (req, res) => res.json(req.query));
  const fixtureServer = fixture.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => fixtureServer.close(err => err ? reject(err) : resolve())));
  await once(fixtureServer, 'listening');
  const url = `http://127.0.0.1:${fixtureServer.address().port}/`;
  const small = await fetch(url + '?a[]=one&a[]=two', { signal: AbortSignal.timeout(2000) });
  assert.equal(small.status, 200);
  assert.deepEqual(await small.json(), { a: ['one', 'two'] });

  const values = Array.from({ length: 6 }, (_, i) => String(i));
  const query = values.map(value => `a[]=${value}`).join('&');
  const response = await fetch(url + '?' + query, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  const parsed = await response.json();
  assert.equal(Array.isArray(parsed.a), false, 'over-limit bracket arrays must become indexed objects');
  assert.deepEqual(parsed.a, Object.fromEntries(values.map((value, i) => [i, value])));
});

test('default proxy policy ignores attacker-supplied forwarding headers', async () => {
  assert.equal(app.get('trust proxy'), false);
  const response = await request('/__axm746/proxy', {
    headers: { 'X-Forwarded-For': '203.0.113.9', 'X-Forwarded-Proto': 'https' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ip: '127.0.0.1', ips: [] });
});

test('existing HTTP routes preserve GET, HEAD, query and method behavior', async () => {
  const live = await request('/health/live?constructor[prototype][polluted]=yes&a[]=1&a[]=2');
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  assert.equal(Object.prototype.polluted, undefined);

  const head = await request('/health/live', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  const promo = await request('/api/promo-codes?code[]=WELCOME10&code[]=PRO25');
  assert.equal(promo.status, 200);
  assert.deepEqual((await promo.json()).map(item => item.code).sort(), ['PRO25', 'WELCOME10']);

  const missing = await request('/health/live-extra');
  assert.equal(missing.status, 404);
  await missing.text();
  const post = await request('/health/live', { method: 'POST' });
  assert.equal(post.status, 404);
  await post.text();
});
