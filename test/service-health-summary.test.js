'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const ejs = require('ejs');
const { app, buildMetrics } = require('../src/server');
const { presentServices } = require('../src/lib/service-health');

async function renderServices(services) {
  const metrics = { ...buildMetrics(), services: presentServices(services) };
  const freshness = { stale: false, isoTimestamp: '2026-10-22T08:20:00.000Z', label: 'Last updated 08:20 UTC' };
  return ejs.renderFile(path.join(__dirname, '..', 'views', 'dashboard.ejs'), { metrics, freshness });
}

function assertSummary(html, expected) {
  const summary = html.match(/<div class="service-health-summary"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(summary, 'service health summary is visible');
  assert.ok(html.indexOf('</time>') < summary.index, 'summary follows freshness');
  assert.ok(summary.index + summary[0].length < html.indexOf('<div class="services-table">'), 'summary is outside and above the table scroll wrapper');
  const items = [...summary[1].matchAll(/<span class="([^"]*)">(Healthy|Degraded|Failing):\s*(\d+)<\/span>/g)];
  assert.equal(items.length, 3, 'all three labeled counts remain visible');
  assert.deepEqual(Object.fromEntries(items.map(([, , label, count]) => [label, Number(count)])), expected);
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const statuses = [...body.matchAll(/class="service-status service-status--\w+">(\w+)<\/span>/g)].map(([, label]) => label);
  for (const [label, count] of Object.entries(expected)) {
    assert.equal(statuses.filter(status => status === label).length, count, `${label} count matches table`);
  }
  assert.equal(Object.values(expected).reduce((sum, count) => sum + count, 0), statuses.length);
  const failingClasses = items.find(([, , label]) => label === 'Failing')[1].split(/\s+/);
  assert.equal(failingClasses.includes('service-status--failing'), expected.Failing > 0);
  return failingClasses;
}

test('TD87-TC-01: unequal mixed counts match every table status above the table', async () => {
  const html = await renderServices([
    { name: 'healthy-a', requests: 100, errors: 0 },
    { name: 'failing-a', requests: 100, errors: 5 },
    { name: 'degraded', requests: 100, errors: 2 },
    { name: 'failing-b', requests: 100, errors: 10 },
    { name: 'healthy-b', requests: 1000, errors: 9 },
    { name: 'failing-c', requests: 100, errors: 50 },
  ]);
  assertSummary(html, { Healthy: 2, Degraded: 1, Failing: 3 });
});

test('TD87-TC-02: exact boundaries and zero requests use the existing classifier', async () => {
  const html = await renderServices([
    { name: 'below-one', requests: 10000, errors: 99 },
    { name: 'one', requests: 10000, errors: 100 },
    { name: 'below-five', requests: 10000, errors: 499 },
    { name: 'five', requests: 10000, errors: 500 },
    { name: 'idle', requests: 0, errors: 0 },
  ]);
  assertSummary(html, { Healthy: 2, Degraded: 2, Failing: 1 });
});

test('TD87-TC-03: nonempty zero-failing summary stays visible without failing emphasis', async () => {
  const html = await renderServices([
    { name: 'healthy', requests: 100, errors: 0 },
    { name: 'degraded', requests: 100, errors: 1 },
  ]);
  assertSummary(html, { Healthy: 1, Degraded: 1, Failing: 0 });
});

test('TD87-TC-04: empty services show all three zero counts without failing emphasis', async () => {
  assertSummary(await renderServices([]), { Healthy: 0, Degraded: 0, Failing: 0 });
});

test('TD87-TC-05: positive failing reuses the red, bold status emphasis', async () => {
  const html = await renderServices([{ name: 'failing', requests: 100, errors: 5 }]);
  const classes = assertSummary(html, { Healthy: 0, Degraded: 0, Failing: 1 });
  assert.ok(classes.includes('service-status'));
  assert.match(html, /\.service-status--failing\s*\{[^}]*background: #fee2e2;[^}]*color: #991b1b;[^}]*font-weight: 700;/);
});

test('TD87-TC-06: GET / shows shipped counts and preserves rows, aggregates and freshness', async t => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assertSummary(html, { Healthy: 1, Degraded: 1, Failing: 1 });
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.replace(/<[^>]*>/g, '').trim()));
  assert.deepEqual(rows, [
    ['api-gateway', 'Failing', '18,420', '1000'],
    ['auth-service', 'Degraded', '9,310', '100'],
    ['billing', 'Healthy', '4,502', '0'],
  ]);
  assert.match(html, /Total requests: 32,232/);
  assert.match(html, /Total errors: 1100/);
  assert.match(html, /Error rate: 3.413%/);
  assert.match(html, /<time class="health-freshness"[^>]*>Last updated \d{2}:\d{2} UTC<\/time>/);
});
