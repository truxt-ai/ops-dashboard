'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const axios = require('axios');
const { syncMetrics } = require('../src/jobs/upstream-sync');

const snapshot = { totalRequests: 42, totalErrors: 1 };

async function listen(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      handler(req, res);
    });
  });
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(err => err ? reject(err) : resolve());
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { requests, base: `http://127.0.0.1:${server.address().port}` };
}

test('syncMetrics throws synchronously when no URL is configured', t => {
  const previous = process.env.UPSTREAM_SYNC_URL;
  delete process.env.UPSTREAM_SYNC_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.UPSTREAM_SYNC_URL;
    else process.env.UPSTREAM_SYNC_URL = previous;
  });
  assert.throws(() => syncMetrics(snapshot), { message: 'UPSTREAM_SYNC_URL is not set' });
});

test('syncMetrics defaults the URL to UPSTREAM_SYNC_URL and posts with the default Axios client', async t => {
  const previous = process.env.UPSTREAM_SYNC_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.UPSTREAM_SYNC_URL;
    else process.env.UPSTREAM_SYNC_URL = previous;
  });
  const { requests, base } = await listen(t, (req, res) => { res.writeHead(204); res.end(); });
  process.env.UPSTREAM_SYNC_URL = `${base}/sync`;
  const response = await syncMetrics(snapshot);
  assert.equal(response.status, 204);
  assert.deepEqual(requests.map(({ method, url }) => [method, url]), [['POST', '/sync']]);
  assert.deepEqual(JSON.parse(requests[0].body), snapshot);
});

test('syncMetrics rejects a 500 with the real Axios response error', async t => {
  const { base } = await listen(t, (req, res) => { res.writeHead(500); res.end(); });
  await assert.rejects(syncMetrics(snapshot, { url: `${base}/sync`, client: axios.create({ proxy: false }) }), err => {
    assert.equal(err.message, 'Request failed with status code 500');
    assert.equal(err.code, 'ERR_BAD_RESPONSE');
    assert.equal(err.response.status, 500);
    return true;
  });
});

test('syncMetrics through a 302 is re-sent as a bodiless GET by follow-redirects', async t => {
  const { requests, base } = await listen(t, (req, res) => {
    if (req.url === '/redirect') res.writeHead(302, { Location: '/sync' });
    else res.writeHead(204);
    res.end();
  });
  const response = await syncMetrics(snapshot, { url: `${base}/redirect`, client: axios.create({ proxy: false }) });
  assert.equal(response.status, 204);
  assert.deepEqual(requests, [
    { method: 'POST', url: '/redirect', body: JSON.stringify(snapshot) },
    { method: 'GET', url: '/sync', body: '' },
  ]);
});

test('syncMetrics rejects instead of looping when the server redirects to itself forever', { timeout: 10000 }, async t => {
  const { requests, base } = await listen(t, (req, res) => {
    res.writeHead(307, { Location: '/loop' });
    res.end();
  });
  await assert.rejects(syncMetrics(snapshot, { url: `${base}/loop`, client: axios.create({ proxy: false }) }), {
    message: 'Maximum number of redirects exceeded',
    code: 'ERR_FR_TOO_MANY_REDIRECTS',
  });
  assert.equal(requests.length, 22);
});
