'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { app, buildMetrics } = require('../src/server');

function getDashboard() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.get({ hostname: '127.0.0.1', port, path: '/' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          server.close((err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve({ body, headers: res.headers, statusCode: res.statusCode });
          });
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });
    });

    server.on('error', reject);
  });
}

test('buildMetrics totals add up across services', () => {
  const m = buildMetrics();
  assert.strictEqual(m.totalRequests, 18420 + 9310 + 4502);
  assert.strictEqual(m.totalErrors, 12 + 3 + 0);
  assert.ok(m.errorRate >= 0, 'error rate is non-negative');
  assert.strictEqual(m.services.length, 3);
});

test('GET / renders accessible service health dashboard regions', async () => {
  const { body, headers, statusCode } = await getDashboard();

  assert.strictEqual(statusCode, 200);
  assert.match(headers['content-type'], /^text\/html/);
  assert.match(body, /<main\b[^>]*data-testid="dashboard-shell"/);
  assert.match(body, /<h1\b[^>]*>\s*Service health\s*<\/h1>/);
  assert.match(body, /<section\b(?=[^>]*data-testid="metric-summary")(?=[^>]*aria-labelledby="metric-summary-heading")[^>]*>/);
  assert.match(body, /<h2\b[^>]*id="metric-summary-heading"[^>]*>\s*Summary\s*<\/h2>/);
  assert.match(body, /<section\b(?=[^>]*data-testid="service-health")(?=[^>]*aria-labelledby="service-health-heading")[^>]*>/);
  assert.match(body, /<h2\b[^>]*id="service-health-heading"[^>]*>\s*Services\s*<\/h2>/);
});

test('GET / renders deterministic dashboard metrics and service table', async () => {
  const { body } = await getDashboard();

  assert.match(body, /data-testid="metric-total-requests"[^>]*>\s*32,232\s*</);
  assert.match(body, /data-testid="metric-total-errors"[^>]*>\s*15\s*</);
  assert.match(body, /data-testid="metric-error-rate"[^>]*>\s*0\.047%\s*</);
  assert.match(body, /<table\b[^>]*data-testid="service-table"/);
  assert.match(body, /<th\b[^>]*scope="col"[^>]*>\s*Service\s*<\/th>/);
  assert.match(body, /api-gateway/);
  assert.match(body, /auth-service/);
  assert.match(body, /billing/);
});
