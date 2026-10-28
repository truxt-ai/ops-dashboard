'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const { probeUpstream, UPSTREAM_URL, TIMEOUT_MS } = require('../src/lib/status-probe');

async function listen(t, handler) {
  const server = http.createServer(handler);
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(err => err ? reject(err) : resolve());
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function clientFor(port, path) {
  const client = axios.create({ proxy: false });
  client.interceptors.request.use(config => ({ ...config, url: `http://127.0.0.1:${port}${path}` }));
  return client;
}

// Literals, not the imported constants: every other assertion in this file
// compares against TIMEOUT_MS, so without this a change to it would move the
// expectations along with the behaviour and nothing would fail. The README
// documents both values as the upstream-probe contract.
test('status-probe pins its documented upstream target and timeout', () => {
  assert.equal(UPSTREAM_URL, 'https://example.com');
  assert.equal(TIMEOUT_MS, 2000);
});

test('probeUpstream resolves the real status with the configured timeout', async t => {
  const port = await listen(t, (req, res) => { res.writeHead(204); res.end(); });
  const response = await probeUpstream(clientFor(port, '/'));
  assert.equal(response.status, 204);
  assert.equal(response.config.timeout, 2000);
  assert.equal(response.config.method, 'get');
});

test('probeUpstream rejects a 500 with the real Axios response error', async t => {
  const port = await listen(t, (req, res) => { res.writeHead(500); res.end(); });
  await assert.rejects(probeUpstream(clientFor(port, '/')), err => {
    assert.equal(err.message, 'Request failed with status code 500');
    assert.equal(err.code, 'ERR_BAD_RESPONSE');
    assert.equal(err.response.status, 500);
    return true;
  });
});

test('probeUpstream enforces the timeout against a server that never responds', { timeout: 7000 }, async t => {
  const port = await listen(t, () => {});
  const started = Date.now();
  await assert.rejects(probeUpstream(clientFor(port, '/')), {
    message: 'timeout of 2000ms exceeded',
    code: 'ECONNABORTED',
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 1900 && elapsed < 6000, `aborted after ${elapsed}ms, expected about 2000ms`);
});

test('probeUpstream rejects with ECONNREFUSED when nothing is listening', async () => {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  await assert.rejects(probeUpstream(clientFor(port, '/')), err => {
    assert.equal(err.code, 'ECONNREFUSED');
    assert.equal(err.message, `connect ECONNREFUSED 127.0.0.1:${port}`);
    assert.equal(err.response, undefined);
    return true;
  });
});

test('probeUpstream follows GET redirects through follow-redirects to the final status', async t => {
  const hits = [];
  const port = await listen(t, (req, res) => {
    hits.push(`${req.method} ${req.url}`);
    if (req.url === '/first') res.writeHead(301, { Location: '/second' });
    else if (req.url === '/second') res.writeHead(301, { Location: '/final' });
    else res.writeHead(203);
    res.end();
  });
  const response = await probeUpstream(clientFor(port, '/first'));
  assert.equal(response.status, 203);
  assert.deepEqual(hits, ['GET /first', 'GET /second', 'GET /final']);
});
