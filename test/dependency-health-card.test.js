'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { promisify } = require('node:util');
const ejs = require('ejs');

const renderFile = promisify(ejs.renderFile);
const dashboardTemplate = path.join(__dirname, '..', 'views', 'dashboard.ejs');

function dashboardMetrics(dependencyHealth) {
  return {
    services: [
      { name: 'api-gateway', requests: 18420, errors: 12 },
      { name: 'auth-service', requests: 9310, errors: 3 },
      { name: 'billing', requests: 4502, errors: 0 },
    ],
    totalRequests: 32232,
    totalErrors: 15,
    errorRate: 0.047,
    dependencyHealth,
  };
}

async function renderDashboard(dependencyHealth) {
  return renderFile(dashboardTemplate, {
    metrics: dashboardMetrics(dependencyHealth),
  });
}

function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertSeverityOrder(text, severities) {
  const lowerText = text.toLowerCase();
  let previousIndex = -1;

  for (const severity of severities) {
    const currentIndex = lowerText.indexOf(severity);
    assert.ok(currentIndex >= 0, `expected ${severity} severity count to be visible`);
    assert.ok(
      currentIndex > previousIndex,
      `expected ${severity} to render after the previous severity`
    );
    previousIndex = currentIndex;
  }
}

test('dashboard renders a clean dependency health card from normalized summary data', async () => {
  const html = await renderDashboard({
    summary: {
      status: 'clean',
      totalVulnerabilities: 0,
      severityCounts: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
      },
    },
    dependencies: [],
  });
  const text = visibleText(html);

  assert.match(html, /data-testid=["']dependency-health-card["']/);
  assert.match(html, /data-testid=["']dependency-health-status["']/);
  assert.match(text, /No known dependency vulnerabilities\./);
  assert.match(text, /\b0\b/);
});

test('dashboard renders risky dependency severity counts in priority order with non-color-only emphasis', async () => {
  const html = await renderDashboard({
    summary: {
      status: 'risk',
      totalVulnerabilities: 15,
      severityCounts: {
        critical: 1,
        high: 2,
        moderate: 3,
        low: 4,
        info: 5,
      },
    },
    dependencies: [],
  });
  const text = visibleText(html);

  assert.match(html, /data-testid=["']dependency-health-card["']/);
  assert.match(html, /data-testid=["']dependency-health-status["']/);
  assert.match(text, /risk/i);
  assert.match(text, /\b15\b/);
  assertSeverityOrder(text, ['critical', 'high', 'moderate', 'low', 'info']);
  assert.match(html, /data-testid=["']dependency-severity-count-critical["'][\s\S]{0,400}critical[\s\S]{0,400}\b1\b/i);
  assert.match(html, /data-testid=["']dependency-severity-count-high["'][\s\S]{0,400}high[\s\S]{0,400}\b2\b/i);
});
