'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const { syncMetrics } = require('../src/jobs/upstream-sync');
const { probeUpstream, UPSTREAM_URL, TIMEOUT_MS } = require('../src/lib/status-probe');

async function listen(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('syncMetrics preserves JSON, redirects, credential boundaries and proxy routing', { timeout: 15000 }, async t => {
  const snapshot = { totalRequests: 12, totalErrors: 1 };
  const received = [];
  const target = await listen(t, async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ method: req.method, headers: req.headers, body });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end('{"synced":true}');
  });
  const origin = await listen(t, (req, res) => {
    res.writeHead(307, { Location: req.url === '/same' ? '/cross' : target });
    res.end();
  });
  const client = axios.create({ proxy: false, headers: { Authorization: 'Bearer fixture', Cookie: 'session=fixture' } });
  const direct = await syncMetrics(snapshot, { url: target, client });
  assert.equal(direct.status, 201);
  assert.deepEqual(direct.data, { synced: true });
  assert.equal(direct.config.timeout, 5000);
  assert.equal(received[0].headers.authorization, 'Bearer fixture');
  const redirected = await syncMetrics(snapshot, { url: `${origin}/same`, client });
  assert.equal(redirected.status, 201);
  assert.equal(received[1].headers.authorization, undefined);
  assert.equal(received[1].headers.cookie, undefined);
  for (const request of received) {
    assert.equal(request.method, 'POST');
    assert.match(request.headers['content-type'], /application\/json/);
    assert.deepEqual(JSON.parse(request.body), snapshot);
  }

  const proxyRequests = [];
  const proxy = await listen(t, (req, res) => {
    proxyRequests.push({ url: req.url, headers: req.headers });
    req.resume();
    res.end('proxied');
  });
  const proxyUrl = new URL(proxy);
  const proxied = axios.create({ proxy: { protocol: 'http', host: proxyUrl.hostname, port: Number(proxyUrl.port), auth: { username: 'fixture', password: 'local' } } });
  assert.equal((await syncMetrics(snapshot, { url: target, client: proxied })).data, 'proxied');
  assert.equal(proxyRequests[0].url, `${target}/`);
  assert.equal(proxyRequests[0].headers['proxy-authorization'], `Basic ${Buffer.from('fixture:local').toString('base64')}`);

  const proxyKeys = ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY'];
  const saved = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of proxyKeys) delete process.env[key];
    process.env.http_proxy = proxy;
    assert.equal((await syncMetrics(snapshot, { url: target })).data, 'proxied');
    process.env.no_proxy = '127.0.0.1';
    assert.equal((await syncMetrics(snapshot, { url: target })).status, 201);
    assert.equal(proxyRequests.length, 2, 'NO_PROXY bypasses the proxy');
    assert.equal(received.at(-1).headers['proxy-authorization'], undefined);
  } finally {
    for (const key of proxyKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('syncMetrics rejects HTTP failures even with inherited validateStatus (GHSA-w9j2-pvgh-6h63)', { timeout: 10000 }, async t => {
  const url = await listen(t, (req, res) => {
    req.resume();
    res.writeHead(503);
    res.end('unavailable');
  });
  const client = axios.create({ proxy: false });
  await assert.rejects(syncMetrics({}, { url, client }), err => err.response.status === 503);
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'validateStatus');
  try {
    Object.defineProperty(Object.prototype, 'validateStatus', { configurable: true, writable: true, value: () => true });
    await assert.rejects(syncMetrics({}, { url, client }), err => err.response.status === 503);
  } finally {
    if (descriptor) Object.defineProperty(Object.prototype, 'validateStatus', descriptor);
    else delete Object.prototype.validateStatus;
  }
});

test('probeUpstream and syncMetrics enforce their real HTTP timeouts and recover', { timeout: 15000 }, async t => {
  const seen = [];
  const url = await listen(t, (req, res) => {
    req.resume();
    if (req.url === '/ok') res.end('healthy');
  });
  const client = axios.create({ proxy: false });
  client.interceptors.request.use(config => {
    seen.push({ url: config.url, timeout: config.timeout });
    // Retarget the fixed upstream URL to the local fixture, keeping the real adapter.
    if (config.url === UPSTREAM_URL) config.url = `${url}/slow`;
    return config;
  });
  await assert.rejects(probeUpstream(client), err => err.code === 'ECONNABORTED' && err.message.includes(String(TIMEOUT_MS)));
  assert.deepEqual(seen[0], { url: UPSTREAM_URL, timeout: 2000 });
  await assert.rejects(syncMetrics({}, { url: `${url}/slow`, client }), err => err.code === 'ECONNABORTED' && err.message.includes('5000'));
  assert.equal(seen[1].timeout, 5000);
  assert.equal((await syncMetrics({}, { url: `${url}/ok`, client })).data, 'healthy');
});
