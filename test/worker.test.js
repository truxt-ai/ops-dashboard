'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const worker = path.join(__dirname, '..', 'src', 'worker.js');

async function listen(t, handler) {
  const server = http.createServer(handler);
  t.after(() => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(err => err ? reject(err) : resolve());
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

async function runWorker(syncUrl) {
  const env = { ...process.env, UPSTREAM_SYNC_URL: syncUrl };
  if (syncUrl === undefined) delete env.UPSTREAM_SYNC_URL;
  const child = spawn(process.execPath, [worker], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}

test('worker syncs metrics to a live sink and exits 0', { timeout: 15000 }, async t => {
  const requests = [];
  const sink = await listen(t, (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, body });
      res.writeHead(204);
      res.end();
    });
  });
  const result = await runWorker(`http://127.0.0.1:${sink.address().port}/sync`);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /metrics synced: 204/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/sync');
  const posted = JSON.parse(requests[0].body);
  assert.equal(posted.totalRequests, 32232);
  assert.equal(posted.totalErrors, 1100);
});

test('worker reports a dead sink and exits 1', { timeout: 15000 }, async () => {
  const sink = http.createServer();
  sink.listen(0, '127.0.0.1');
  await once(sink, 'listening');
  const { port } = sink.address();
  sink.close();
  await once(sink, 'close');
  const result = await runWorker(`http://127.0.0.1:${port}/sync`);
  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`metrics sync failed: connect ECONNREFUSED 127\\.0\\.0\\.1:${port}`));
});

test('worker exits 1 naming UPSTREAM_SYNC_URL when it is unset', { timeout: 15000 }, async () => {
  const result = await runWorker(undefined);
  // syncMetrics throws synchronously, so the error surfaces as an uncaught
  // exception and the .catch in src/worker.js is never attached.
  assert.equal(result.code, 1);
  assert.match(result.stderr, /UPSTREAM_SYNC_URL is not set/);
  assert.doesNotMatch(result.stderr, /metrics sync failed/);
});
