'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function loadHealthAggregate() {
  return require('../src/lib/health-aggregate');
}

async function requestJson(t, app, path) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { accept: 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('summarizeChecks counts statuses and marks healthy only when every check is up', () => {
  const { summarizeChecks } = loadHealthAggregate();

  assert.deepEqual(
    summarizeChecks([
      { name: 'api-gateway', status: 'up' },
      { name: 'auth-service', status: 'down' },
      { name: 'billing', status: 'degraded' },
      { name: 'worker', status: 'up' },
    ]),
    { total: 4, up: 2, down: 1, degraded: 1, healthy: false },
  );

  assert.deepEqual(
    summarizeChecks([{ name: 'cache', status: 'up' }]),
    { total: 1, up: 1, down: 0, degraded: 0, healthy: true },
  );

  assert.deepEqual(
    summarizeChecks([{ name: 'search', status: 'degraded' }]),
    { total: 1, up: 0, down: 0, degraded: 1, healthy: false },
  );
});

test('worstStatus returns down before degraded and treats an empty list as up', () => {
  const { worstStatus } = loadHealthAggregate();

  assert.equal(worstStatus([]), 'up');
  assert.equal(
    worstStatus([
      { name: 'api-gateway', status: 'up' },
      { name: 'billing', status: 'degraded' },
    ]),
    'degraded',
  );
  assert.equal(
    worstStatus([
      { name: 'auth-service', status: 'down' },
      { name: 'billing', status: 'degraded' },
      { name: 'worker', status: 'up' },
    ]),
    'down',
  );
});

test('GET /api/health/summary returns JSON summary and worst status', async (t) => {
  const { app } = require('../src/server');

  const response = await requestJson(t, app, '/api/health/summary');
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] || '', /^application\/json\b/);

  const payload = JSON.parse(response.body);
  assert.deepEqual(Object.keys(payload).sort(), ['summary', 'worst']);
  assert.equal(['up', 'degraded', 'down'].includes(payload.worst), true);

  const summary = payload.summary;
  assert.deepEqual(Object.keys(summary).sort(), [
    'degraded',
    'down',
    'healthy',
    'total',
    'up',
  ]);
  assert.equal(typeof summary.total, 'number');
  assert.equal(typeof summary.up, 'number');
  assert.equal(typeof summary.down, 'number');
  assert.equal(typeof summary.degraded, 'number');
  assert.equal(typeof summary.healthy, 'boolean');
  assert.equal(summary.total, summary.up + summary.down + summary.degraded);
  assert.equal(summary.healthy, summary.down === 0 && summary.degraded === 0);
  assert.equal(
    payload.worst,
    summary.down > 0 ? 'down' : summary.degraded > 0 ? 'degraded' : 'up',
  );
});
