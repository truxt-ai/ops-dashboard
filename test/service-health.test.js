'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const ejs = require('ejs');
const { app, buildMetrics } = require('../src/server');

// AXM-684 / TD-86, UoW-1: independent fixtures for TC-01 through TC-04.
for (const [requests, errors, expected] of [
  [10000, 0, 'healthy'],
  [10000, 99, 'healthy'],
  [10000, 100, 'degraded'],
  [10000, 499, 'degraded'],
  [10000, 500, 'failing'],
  [10000, 501, 'failing'],
  [0, 0, 'healthy'],
  [0, 5, 'healthy'],
  [1000000, 9999, 'healthy'],
  [1000000, 49999, 'degraded'],
]) {
  test(`TC-01: ${errors}/${requests} is ${expected} without rounding`, () => {
    const { classifyServiceHealth } = require('../src/lib/service-health');
    assert.equal(classifyServiceHealth({ requests, errors }), expected);
  });
}

const fixtures = Object.freeze([
  { name: 'oak', requests: 10000, errors: 0 },
  { name: 'zeta', requests: 10000, errors: 200 },
  { name: 'Zebra', requests: 10000, errors: 800 },
  { name: 'alpha', requests: 10000, errors: 600 },
  { name: 'Cedar', requests: 10000, errors: 99 },
  { name: 'beta', requests: 10000, errors: 100 },
  { name: 'Alpha', requests: 10000, errors: 500 },
].map(Object.freeze));

const expectedRows = [
  ['Alpha', 'Failing'], ['alpha', 'Failing'], ['Zebra', 'Failing'],
  ['beta', 'Degraded'], ['zeta', 'Degraded'],
  ['Cedar', 'Healthy'], ['oak', 'Healthy'],
];

test('TC-02: severity and English name order are deterministic without mutating input', () => {
  const { presentServices } = require('../src/lib/service-health');
  const original = JSON.stringify(fixtures);
  const expected = expectedRows.map(([name]) => name);
  for (const input of [fixtures, [...fixtures].reverse(), [...fixtures.slice(3), ...fixtures.slice(0, 3)]]) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = presentServices(input);
      assert.deepEqual(rows.map(s => s.name), expected);
      assert.deepEqual(rows.map(s => s.statusLabel), expectedRows.map(([, status]) => status));
      assert.notEqual(rows, input);
    }
  }
  assert.equal(JSON.stringify(fixtures), original);
});

function serviceRows(html) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(([, cell]) =>
      cell.replace(/<[^>]*>/g, '').trim()));
}

test('TC-03: EJS renders independent mixed fixtures in health/name order with adjacent status', async () => {
  const { presentServices } = require('../src/lib/service-health');
  const metrics = { ...buildMetrics(), services: presentServices(fixtures) };
  const freshness = { stale: false, isoTimestamp: '2026-10-22T08:20:00.000Z', label: 'Last updated 08:20 UTC' };
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'dashboard.ejs'), { metrics, freshness });
  assert.deepEqual(serviceRows(html).map(row => row.slice(0, 2)), expectedRows);
  assert.match(html, /<th>Service<\/th>\s*<th>Status<\/th>/);
  assert.match(html, /class="service-status service-status--failing">Failing<\/span>/);
  assert.match(html, /\.service-status--failing\s*\{[^}]*background:[^}]*color:/);
  assert.doesNotMatch(html, /<script\b/);
});

test('TC-03: repeated GET / requests preserve service row and cell order', async t => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  await once(server, 'listening');
  let firstRows;
  for (let refresh = 0; refresh < 3; refresh++) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    const rows = serviceRows(html);
    assert.deepEqual(rows, [
      ['api-gateway', 'Failing', '18,420', '1000'],
      ['auth-service', 'Degraded', '9,310', '100'],
      ['billing', 'Healthy', '4,502', '0'],
    ]);
    if (firstRows) assert.deepEqual(rows, firstRows);
    firstRows = rows;
    assert.match(html, /class="service-status service-status--failing">Failing<\/span>/);
    assert.doesNotMatch(html, /<script\b/);
  }
});

test('TC-04: shipped metrics show all states and retain consistent aggregates', () => {
  const metrics = buildMetrics();
  assert.deepEqual(metrics.services.map(({ name, requests, errors, status }) => ({ name, requests, errors, status })), [
    { name: 'api-gateway', requests: 18420, errors: 1000, status: 'failing' },
    { name: 'auth-service', requests: 9310, errors: 100, status: 'degraded' },
    { name: 'billing', requests: 4502, errors: 0, status: 'healthy' },
  ]);
  assert.equal(metrics.totalRequests, 32232);
  assert.equal(metrics.totalErrors, 1100);
  assert.equal(metrics.totalRequests, metrics.services.reduce((sum, s) => sum + s.requests, 0));
  assert.equal(metrics.totalErrors, metrics.services.reduce((sum, s) => sum + s.errors, 0));
  assert.equal(metrics.errorRate, 3.413);
});
