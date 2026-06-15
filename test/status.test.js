'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const packageJson = require('../package.json');

function loadStatusModule() {
  return require('../src/lib/status');
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function request(server, pathname, options = {}) {
  const { port } = server.address();
  const method = options.method || 'GET';

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: options.headers,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            text,
          });
        });
      }
    );

    req.once('error', reject);
    req.end();
  });
}

test('buildStatusPayload returns deterministic injected status data', () => {
  const { buildStatusPayload } = loadStatusModule();

  const payload = buildStatusPayload({
    uptimeSeconds: 42.25,
    version: '9.8.7-test',
  });

  assert.deepEqual(payload, {
    status: 'ok',
    uptimeSeconds: 42.25,
    version: '9.8.7-test',
  });
  assert.doesNotThrow(() => JSON.stringify(payload));
});

test('buildStatusPayload defaults to package version and non-negative uptime', () => {
  const { buildStatusPayload } = loadStatusModule();

  const payload = buildStatusPayload();

  assert.deepEqual(Object.keys(payload).sort(), [
    'status',
    'uptimeSeconds',
    'version',
  ]);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.version, packageJson.version);
  assert.equal(typeof payload.uptimeSeconds, 'number');
  assert.ok(Number.isFinite(payload.uptimeSeconds));
  assert.ok(payload.uptimeSeconds >= 0);
});

test('GET /status returns unauthenticated JSON and preserves existing routes', async (t) => {
  const { app } = require('../src/server');
  const server = await listen(app);
  t.after(() => close(server));

  const statusResponse = await request(server, '/status');
  assert.equal(statusResponse.statusCode, 200);
  assert.match(statusResponse.headers['content-type'] || '', /^application\/json/);

  const body = JSON.parse(statusResponse.text);
  assert.deepEqual(Object.keys(body).sort(), [
    'status',
    'uptimeSeconds',
    'version',
  ]);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.ok(Number.isFinite(body.uptimeSeconds));
  assert.ok(body.uptimeSeconds >= 0);
  assert.equal(body.version, packageJson.version);

  const dashboardResponse = await request(server, '/');
  assert.equal(dashboardResponse.statusCode, 200);
  assert.match(dashboardResponse.text, /api-gateway/);

  const hasUpstreamHealthRoute = app._router.stack.some((layer) => {
    return layer.route?.path === '/health/upstream' && layer.route.methods.get;
  });
  assert.equal(hasUpstreamHealthRoute, true);

  const postStatusResponse = await request(server, '/status', { method: 'POST' });
  assert.notEqual(postStatusResponse.statusCode, 200);
});

test('README documents the status route contract', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  assert.match(readme, /\/status/);
  assert.match(readme, /uptimeSeconds/);
  assert.match(readme, /version/);
});
