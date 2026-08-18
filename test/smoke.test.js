'use strict';

const http = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const assert = require('node:assert');
const { app, buildMetrics } = require('../src/server');

async function requestDashboard() {
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const { port } = server.address();
    return await new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      });

      req.on('error', reject);
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

function visibleText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('buildMetrics totals add up across services', () => {
  const m = buildMetrics();
  assert.strictEqual(m.totalRequests, 18420 + 9310 + 4502);
  assert.strictEqual(m.totalErrors, 12 + 3 + 0);
  assert.ok(m.errorRate >= 0, 'error rate is non-negative');
  assert.strictEqual(m.services.length, 3);
});

test('buildMetrics exposes deterministic service health summary', () => {
  const m = buildMetrics();

  assert.deepStrictEqual(m.services.map(({ name, status }) => ({ name, status })), [
    { name: 'api-gateway', status: 'degraded' },
    { name: 'auth-service', status: 'watch' },
    { name: 'billing', status: 'healthy' },
  ]);
  assert.deepStrictEqual(m.statusCounts, {
    healthy: 1,
    watch: 1,
    degraded: 1,
  });
  assert.strictEqual(m.overallHealth, 'degraded');
  assert.deepStrictEqual(m.highestPriorityArea, {
    name: 'api-gateway',
    requests: 18420,
    errors: 12,
    status: 'degraded',
  });
});

test('dashboard render exposes at-a-glance system health summary', async () => {
  const response = await requestDashboard();
  const text = visibleText(response.body);

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /data-testid="overall-health"/);
  assert.match(response.body, /data-testid="status-count-healthy"/);
  assert.match(response.body, /data-testid="status-count-watch"/);
  assert.match(response.body, /data-testid="status-count-degraded"/);
  assert.match(response.body, /data-testid="highest-priority-area"/);
  assert.match(text, /Overall health:\s*Degraded/i);
  assert.match(text, /Healthy:\s*1/i);
  assert.match(text, /Watch:\s*1/i);
  assert.match(text, /Degraded:\s*1/i);
  assert.match(text, /Highest priority affected area:\s*api-gateway/i);
  assert.match(text, /Total requests:\s*32,232/i);
  assert.match(text, /Total errors:\s*15/i);
  assert.match(text, /Error rate:\s*0\.047%/i);
  assert.match(text, /api-gateway\s*18,420\s*12\s*Degraded/i);
  assert.match(text, /auth-service\s*9,310\s*3\s*Watch/i);
  assert.match(text, /billing\s*4,502\s*0\s*Healthy/i);
});
