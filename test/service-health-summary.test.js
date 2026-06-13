'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');
const ejs = require('ejs');
const { app } = require('../src/server');

const renderFile = promisify(ejs.renderFile);
const dashboardTemplate = path.join(__dirname, '..', 'views', 'dashboard.ejs');

function service({ id, name = id, status, requests = 1000, errors = 0 }) {
  return { id, name, status, requests, errors };
}

function dashboardMetrics(services, overrides = {}) {
  const totalRequests = services.reduce((sum, item) => sum + item.requests, 0);
  const totalErrors = services.reduce((sum, item) => sum + item.errors, 0);
  const errorRate = totalRequests === 0 ? 0 : Number(((totalErrors / totalRequests) * 100).toFixed(3));

  return {
    services,
    totalRequests,
    totalErrors,
    errorRate,
    ...overrides,
  };
}

async function renderDashboard(metrics) {
  return renderFile(dashboardTemplate, { metrics });
}

function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertHealthSummary(html) {
  assert.match(
    html,
    /data-testid=["']service-health-summary["']/,
    'dashboard exposes the service health summary region'
  );
}

function assertHealthCategory(html, { testId, label, count }) {
  const testIdPattern = new RegExp(`data-testid=["']${testId}["']`, 'i');
  const testIdMatch = testIdPattern.exec(html);
  assert.ok(testIdMatch, `${label} count exposes stable test hook ${testId}`);

  const snippetStart = Math.max(0, testIdMatch.index - 240);
  const snippet = html.slice(snippetStart, testIdMatch.index + 640);
  assert.match(snippet, new RegExp(label, 'i'), `${label} category is discoverable by accessible text`);
  assert.match(visibleText(snippet), new RegExp(`\\b${count}\\b`), `${label} count is ${count}`);
}

function assertHealthCounts(html, counts) {
  assertHealthCategory(html, {
    testId: 'service-health-healthy-count',
    label: 'healthy',
    count: counts.healthy,
  });
  assertHealthCategory(html, {
    testId: 'service-health-degraded-count',
    label: 'degraded',
    count: counts.degraded,
  });
  assertHealthCategory(html, {
    testId: 'service-health-offline-count',
    label: 'offline',
    count: counts.offline,
  });
}

async function requestDashboard() {
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });

  try {
    const { port } = server.address();
    return await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
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

test('GET / renders the service health summary in the dashboard response', async () => {
  const response = await requestDashboard();

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assertHealthSummary(response.body);
  assert.match(visibleText(response.body), /healthy/i);
  assert.match(visibleText(response.body), /degraded/i);
  assert.match(visibleText(response.body), /offline/i);
});

test('dashboard renders accurate healthy, degraded, and offline counts for mixed service states', async () => {
  const html = await renderDashboard(
    dashboardMetrics([
      service({ id: 'api-gateway', status: 'healthy', requests: 18420, errors: 12 }),
      service({ id: 'auth-service', status: 'degraded', requests: 9310, errors: 3 }),
      service({ id: 'billing', status: 'offline', requests: 4502, errors: 0 }),
    ])
  );

  assertHealthSummary(html);
  assertHealthCounts(html, { healthy: 1, degraded: 1, offline: 1 });
});

test('dashboard shows a clean all-healthy state without problem emphasis', async () => {
  const html = await renderDashboard(
    dashboardMetrics([
      service({ id: 'api-gateway', status: 'healthy' }),
      service({ id: 'billing', status: 'healthy' }),
    ])
  );
  const text = visibleText(html);

  assertHealthSummary(html);
  assertHealthCounts(html, { healthy: 2, degraded: 0, offline: 0 });
  assert.match(text, /all services (are )?healthy/i);
  assert.doesNotMatch(text, /attention required|incident|outage|degraded services detected|offline services detected/i);
});

test('dashboard empty or loading service data does not report false degraded or offline counts', async () => {
  const html = await renderDashboard(
    dashboardMetrics([], {
      serviceHealthLoading: true,
    })
  );
  const text = visibleText(html);

  assertHealthSummary(html);
  assertHealthCounts(html, { healthy: 0, degraded: 0, offline: 0 });
  assert.match(text, /loading service health|no service health data|no services to display/i);
  assert.doesNotMatch(text, /degraded services detected|offline services detected|outage/i);
});

test('dashboard service health counts are derived from unique services only', async () => {
  const html = await renderDashboard(
    dashboardMetrics([
      service({ id: 'api-gateway', name: 'api-gateway', status: 'healthy' }),
      service({ id: 'api-gateway', name: 'api-gateway duplicate render', status: 'healthy' }),
      service({ id: 'auth-service', name: 'auth-service', status: 'degraded' }),
      service({ id: 'billing', name: 'billing', status: 'offline' }),
      service({ id: 'billing', name: 'billing duplicate render', status: 'offline' }),
    ])
  );

  assertHealthSummary(html);
  assertHealthCounts(html, { healthy: 1, degraded: 1, offline: 1 });
});
