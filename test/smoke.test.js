'use strict';

const http = require('node:http');
const { test } = require('node:test');
const assert = require('node:assert');
const { app, buildMetrics } = require('../src/server');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function get(server, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.get({ hostname: '127.0.0.1', port, path }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ body, statusCode: res.statusCode });
      });
    });
    req.on('error', reject);
  });
}

test('buildMetrics totals add up across services', () => {
  const m = buildMetrics();
  assert.strictEqual(m.totalRequests, 18420 + 9310 + 4502);
  assert.strictEqual(m.totalErrors, 12 + 3 + 0);
  assert.ok(m.errorRate >= 0, 'error rate is non-negative');
  assert.strictEqual(m.services.length, 3);
});

test('GET / renders dashboard metrics and status legend markers', async t => {
  const server = await startServer();
  t.after(() => stopServer(server));

  const response = await get(server, '/');
  const metrics = buildMetrics();

  assert.strictEqual(response.statusCode, 200);
  assert.ok(
    response.body.includes(`Total requests: ${metrics.totalRequests.toLocaleString()}`),
    'dashboard still renders total requests'
  );
  assert.ok(
    response.body.includes(`Total errors: ${metrics.totalErrors}`),
    'dashboard still renders total errors'
  );
  assert.ok(
    response.body.includes(`Error rate: ${metrics.errorRate}%`),
    'dashboard still renders error rate'
  );
  for (const service of metrics.services) {
    assert.ok(response.body.includes(service.name), `dashboard still renders ${service.name}`);
  }

  const missingLegendParts = [
    { label: 'Healthy', marker: 'healthy' },
    { label: 'Degraded', marker: 'degraded' },
    { label: 'Unhealthy', marker: 'unhealthy' },
  ].flatMap(({ label, marker }) => {
    const misses = [];
    if (!response.body.includes(label)) {
      misses.push(`${label} label`);
    }
    if (!response.body.includes(`data-status-marker="${marker}"`)) {
      misses.push(`${marker} marker hook`);
    }
    return misses;
  });

  assert.deepStrictEqual(missingLegendParts, [], 'status legend labels and marker hooks render');
});
