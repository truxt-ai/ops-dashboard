'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');

const WORKER_PATH = path.join(__dirname, '..', 'src', 'worker.js');
const WORKER_TIMEOUT_MS = 5000;

function runWorker(env) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [WORKER_PATH],
      { env, timeout: WORKER_TIMEOUT_MS },
      (error, stdout, stderr) => {
        resolve({ code: error ? error.code : 0, stdout, stderr });
      },
    );
  });
}

function startStub(statusCode) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({ method: req.method, path: req.url, body: JSON.parse(body) });
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests }));
  });
}

test('worker syncs metrics successfully and exits 0', async (t) => {
  const { server, requests } = await startStub(200);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const { code, stdout } = await runWorker({
    ...process.env,
    UPSTREAM_SYNC_URL: `http://127.0.0.1:${port}/sync`,
  });

  assert.equal(code, 0);
  assert.match(stdout, /^metrics synced: 200$/m);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/sync');
  assert.ok(Array.isArray(requests[0].body.services));
  assert.equal(typeof requests[0].body.totalRequests, 'number');
  assert.equal(typeof requests[0].body.totalErrors, 'number');
  assert.equal(typeof requests[0].body.errorRate, 'number');
});

test('worker exits 1 and logs the failure when upstream returns an error', async (t) => {
  const { server } = await startStub(503);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const { code, stdout, stderr } = await runWorker({
    ...process.env,
    UPSTREAM_SYNC_URL: `http://127.0.0.1:${port}/sync`,
  });

  assert.equal(code, 1);
  assert.match(stderr, /^metrics sync failed: /m);
  assert.doesNotMatch(stdout, /metrics synced/);
});

test('worker exits 1 and logs the failure when UPSTREAM_SYNC_URL is not set', async () => {
  const env = { ...process.env };
  delete env.UPSTREAM_SYNC_URL;

  const { code, stderr } = await runWorker(env);

  assert.equal(code, 1);
  assert.match(stderr, /UPSTREAM_SYNC_URL is not set/);
});
