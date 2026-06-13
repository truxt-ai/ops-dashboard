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

test('dashboard dependency details list package risk, versions, and remediation fallback', async () => {
  const html = await renderDashboard({
    summary: {
      status: 'risk',
      totalVulnerabilities: 2,
      severityCounts: {
        critical: 1,
        high: 1,
        moderate: 0,
        low: 0,
        info: 0,
      },
    },
    dependencies: [
      {
        package: 'lodash',
        severity: 'critical',
        title: 'Prototype pollution in lodash',
        currentVersion: '4.17.4',
        fixedVersion: '4.17.21',
      },
      {
        package: 'minimist',
        severity: 'high',
        advisory: 'Prototype pollution in minimist',
        currentVersion: '1.2.0',
        remediation: 'Upgrade minimist to 1.2.8 or later',
      },
    ],
  });
  const text = visibleText(html);

  assert.match(html, /data-testid=["']dependency-health-details["']/);
  assert.match(text, /lodash/);
  assert.match(text, /critical/i);
  assert.match(text, /Prototype pollution in lodash/);
  assert.match(text, /4\.17\.4/);
  assert.match(text, /4\.17\.21/);
  assert.match(text, /minimist/);
  assert.match(text, /high/i);
  assert.match(text, /Prototype pollution in minimist/);
  assert.match(text, /1\.2\.0/);
  assert.match(text, /Upgrade minimist to 1\.2\.8 or later/);
});

test('dashboard hides raw audit output when the dependency list is empty', async () => {
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

  assert.match(html, /data-testid=["']dependency-health-details["']/);
  assert.match(text, /No known dependency vulnerabilities\./);
  assert.doesNotMatch(html, /auditReportVersion|npm audit|raw audit|\{"|"\s*severityCounts\s*"|"\s*dependencies\s*"/i);
});
