'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const templatePath = path.join(__dirname, '..', 'views', 'dashboard.ejs');
const dashboardTemplate = fs.readFileSync(templatePath, 'utf8');

const METRICS = {
  totalRequests: 32232,
  totalErrors: 15,
  errorRate: 0.047,
  services: [],
};

const DEPENDENCY_AUDIT_COUNTS = Object.freeze({
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  info: 5,
  unknown: 6,
});

function renderDashboard({ counts = DEPENDENCY_AUDIT_COUNTS } = {}) {
  const calls = [];
  const html = ejs.render(
    dashboardTemplate,
    {
      metrics: METRICS,
      dependencyAuditCounts: counts,
      renderDependencyRiskSummary(receivedCounts) {
        calls.push(receivedCounts);
        return `<span data-risk-summary-call="${calls.length}">risk summary ${calls.length}</span>`;
      },
    },
    { filename: templatePath },
  );

  return { calls, html };
}

function hasSummaryMarkerWithinPlacement(html, placement, marker) {
  const placementIndex = html.indexOf(`data-risk-summary-placement="${placement}"`);
  if (placementIndex === -1) {
    return false;
  }

  const markerIndex = html.indexOf(marker, placementIndex);
  if (markerIndex === -1) {
    return false;
  }

  const nextPlacementIndex = html.indexOf(
    'data-risk-summary-placement=',
    placementIndex + 1,
  );
  return nextPlacementIndex === -1 || markerIndex < nextPlacementIndex;
}

test('overview header wires the reusable dependency risk summary to audit counts', () => {
  const { calls, html } = renderDashboard();

  assert.strictEqual(
    calls.length,
    2,
    'dashboard should render the reusable risk summary in both required placements',
  );
  assert.deepStrictEqual(
    calls[0],
    DEPENDENCY_AUDIT_COUNTS,
    'overview header risk summary receives dependency audit counts',
  );
  assert.ok(
    hasSummaryMarkerWithinPlacement(
      html,
      'overview-header',
      'data-risk-summary-call="1"',
    ),
    'overview header contains the first reusable risk summary render',
  );
});

test('dependency audit area wires the reusable dependency risk summary to matching audit counts', () => {
  const { calls, html } = renderDashboard();

  assert.strictEqual(
    calls.length,
    2,
    'dashboard should render exactly one reusable risk summary per required placement',
  );
  assert.deepStrictEqual(
    calls[1],
    DEPENDENCY_AUDIT_COUNTS,
    'dependency audit area risk summary receives the same dependency audit counts',
  );
  assert.ok(
    hasSummaryMarkerWithinPlacement(
      html,
      'dependency-audit',
      'data-risk-summary-call="2"',
    ),
    'dependency audit area contains the second reusable risk summary render',
  );
});

test('both dashboard placements receive all-clear dependency audit count data', () => {
  const allClearCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 7,
    unknown: 9,
  };
  const { calls, html } = renderDashboard({ counts: allClearCounts });

  assert.deepStrictEqual(
    calls,
    [allClearCounts, allClearCounts],
    'both placements should still receive dependency audit count data for the all-clear state',
  );
  assert.ok(
    hasSummaryMarkerWithinPlacement(
      html,
      'overview-header',
      'data-risk-summary-call="1"',
    ),
    'overview header keeps the reusable summary mounted for all-clear counts',
  );
  assert.ok(
    hasSummaryMarkerWithinPlacement(
      html,
      'dependency-audit',
      'data-risk-summary-call="2"',
    ),
    'dependency audit area keeps the reusable summary mounted for all-clear counts',
  );
});
