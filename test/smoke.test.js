'use strict';

const http = require('node:http');
const { test } = require('node:test');
const assert = require('node:assert');
const { app, buildMetrics } = require('../src/server');

function getDashboardHtml() {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const req = http.get({ hostname: '127.0.0.1', port, path: '/' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          server.close((closeErr) => {
            if (closeErr) {
              reject(closeErr);
              return;
            }
            resolve({ statusCode: res.statusCode, body });
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

test('buildMetrics exposes deterministic payment health summary', () => {
  const m = buildMetrics();
  assert.ok(m.payments, 'payments summary should be present');

  assert.deepStrictEqual(m.payments.statusCounts, {
    succeeded: 122,
    failed: 3,
    pending: 1,
  });

  const totalTransactions = Object.values(m.payments.statusCounts).reduce(
    (sum, count) => sum + count,
    0
  );
  const successRate = Math.round((m.payments.statusCounts.succeeded / totalTransactions) * 1000) / 10;

  assert.strictEqual(m.payments.totalTransactions, totalTransactions);
  assert.strictEqual(m.payments.successRate, successRate);
  assert.strictEqual(m.payments.successRate, 96.8);
  assert.strictEqual(m.payments.healthState, 'healthy');
  assert.deepStrictEqual(m.payments.gatewayAvailability, [
    { name: 'Stripe', availability: 'available' },
    { name: 'PayPal', availability: 'available' },
  ]);
});

test('GET / renders payment health summary with stable hooks', async () => {
  const { statusCode, body } = await getDashboardHtml();

  assert.strictEqual(statusCode, 200);

  const paymentSectionIndex = body.indexOf('data-testid="payment-health"');
  assert.notStrictEqual(paymentSectionIndex, -1, 'payment health region should be rendered');
  assert.ok(
    paymentSectionIndex < body.indexOf('api-gateway'),
    'payment health region should appear before the existing service-health table'
  );

  assert.match(body, /data-payment-health-state="healthy"/);
  assert.match(body, /Payment health/);
  assert.match(body, /Healthy/);
  assert.match(body, /data-testid="payment-success-rate"[^>]*>\s*96\.8%/);
  assert.match(body, /data-testid="payment-status-succeeded"[^>]*>\s*122/);
  assert.match(body, /data-testid="payment-status-failed"[^>]*>\s*3/);
  assert.match(body, /data-testid="payment-status-pending"[^>]*>\s*1/);
  assert.match(body, /Gateway availability/);
  assert.match(body, /data-testid="payment-gateway-stripe"[^>]*data-availability="available"[^>]*>\s*Stripe/);
  assert.match(body, /data-testid="payment-gateway-paypal"[^>]*data-availability="available"[^>]*>\s*PayPal/);
});
