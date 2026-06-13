'use strict';

const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');

const dashboardTemplate = path.join(__dirname, '..', 'views', 'dashboard.ejs');

function metricsWithServices(services) {
  const totalRequests = services.reduce((sum, service) => sum + service.requests, 0);
  const totalErrors = services.reduce((sum, service) => sum + service.errors, 0);
  const errorRate = Number(((totalErrors / totalRequests) * 100).toFixed(3));
  return { services, totalRequests, totalErrors, errorRate };
}

async function renderDashboard(metrics) {
  return new Promise((resolve, reject) => {
    ejs.renderFile(dashboardTemplate, { metrics }, (err, html) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(html);
    });
  });
}

function testIdPattern(testId) {
  return new RegExp(`data-testid=["']${testId}["']`);
}

function textForTestId(html, testId) {
  const element = new RegExp(
    `<[^>]*data-testid=["']${testId}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
  ).exec(html);
  assert.ok(element, `expected ${testId} to be rendered`);
  return element[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function openingTagForTestId(html, testId) {
  const element = new RegExp(
    `<[^>]*data-testid=["']${testId}["'][^>]*>`,
  ).exec(html);
  assert.ok(element, `expected ${testId} to be rendered`);
  return element[0];
}

function assertCountHook(html, testId, expectedCount) {
  const text = textForTestId(html, testId);
  assert.match(
    text,
    new RegExp(`(^|\\D)${expectedCount}(\\D|$)`),
    `expected ${testId} to expose count ${expectedCount}, got "${text}"`,
  );
}

function assertNoProblemStyling(html, testId) {
  const openingTag = openingTagForTestId(html, testId);
  const stylingAttributes = ['class', 'style']
    .map((attribute) => new RegExp(`\\b${attribute}=["']([^"']*)["']`, 'i').exec(openingTag)?.[1] ?? '')
    .join(' ');

  assert.doesNotMatch(
    stylingAttributes,
    /\b(degraded|offline|warning|error|danger|problem|alert|incident)\b/i,
    `expected ${testId} to avoid problem-state styling in all-clear mode`,
  );
}

async function get(server, pathname) {
  const { port } = server.address();

  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
  });
}

test('summarizeServiceHealth aggregates healthy, degraded, and offline services', () => {
  const { summarizeServiceHealth } = require('../src/lib/service-health-summary');

  assert.deepEqual(
    summarizeServiceHealth([
      { name: 'api-gateway', status: 'healthy' },
      { name: 'auth-service', status: 'degraded' },
      { name: 'billing', status: 'offline' },
      { name: 'reporting', status: 'healthy' },
    ]),
    {
      healthy: 2,
      degraded: 1,
      offline: 1,
      total: 4,
      hasProblems: true,
    },
  );
});

test('dashboard view renders mixed service health counts with stable hooks', async () => {
  const html = await renderDashboard(metricsWithServices([
    { name: 'api-gateway', requests: 18420, errors: 12, status: 'healthy' },
    { name: 'auth-service', requests: 9310, errors: 3, status: 'degraded' },
    { name: 'billing', requests: 4502, errors: 0, status: 'offline' },
    { name: 'reporting', requests: 7730, errors: 0, status: 'healthy' },
  ]));

  assert.match(html, testIdPattern('service-health-summary'));
  assertCountHook(html, 'service-health-count-healthy', 2);
  assertCountHook(html, 'service-health-count-degraded', 1);
  assertCountHook(html, 'service-health-count-offline', 1);
});

test('dashboard view renders all-healthy state without an active problem alert', async () => {
  const html = await renderDashboard(metricsWithServices([
    { name: 'api-gateway', requests: 18420, errors: 0, status: 'healthy' },
    { name: 'auth-service', requests: 9310, errors: 0, status: 'healthy' },
    { name: 'billing', requests: 4502, errors: 0, status: 'healthy' },
  ]));

  assert.match(html, testIdPattern('service-health-summary'));
  assert.match(html, testIdPattern('service-health-all-clear'));
  assertCountHook(html, 'service-health-count-healthy', 3);
  assertCountHook(html, 'service-health-count-degraded', 0);
  assertCountHook(html, 'service-health-count-offline', 0);
  assertNoProblemStyling(html, 'service-health-count-degraded');
  assertNoProblemStyling(html, 'service-health-count-offline');
  assert.doesNotMatch(html, /role=["']alert["']/);
});

test('GET / renders the service health summary in the dashboard response', async (t) => {
  const { app } = require('../src/server');
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await get(server, '/');

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.body, testIdPattern('service-health-summary'));
  assert.match(response.body, testIdPattern('service-health-count-healthy'));
  assert.match(response.body, testIdPattern('service-health-count-degraded'));
  assert.match(response.body, testIdPattern('service-health-count-offline'));
});
