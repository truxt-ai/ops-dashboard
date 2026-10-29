'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const ejs = require('ejs');
const { app } = require('../src/app');
const { presentServices } = require('../src/lib/service-health');

const template = path.join(__dirname, '..', 'views', 'dashboard.ejs');

const shippedMetrics = {
  services: presentServices([
    { name: 'api-gateway', requests: 18420, errors: 1000 },
    { name: 'auth-service', requests: 9310, errors: 100 },
    { name: 'billing', requests: 4502, errors: 0 },
  ]),
  totalRequests: 32232,
  totalErrors: 1100,
  errorRate: 3.413,
};

async function renderSnapshot(timestamp, now) {
  const { presentHealthFreshness } = require('../src/lib/health-freshness');
  const metrics = { ...shippedMetrics, lastSuccessfulRefreshAt: new Date(timestamp).toISOString() };
  const freshness = presentHealthFreshness(metrics.lastSuccessfulRefreshAt, () => new Date(now));
  const html = await ejs.renderFile(template, { metrics, freshness });
  const time = html.match(/<time\b[^>]*>[^<]*<\/time>/)[0];
  assert.ok(html.indexOf(time) < html.indexOf('<table'), 'timestamp precedes services table');
  assert.ok(time.includes(`datetime="${new Date(timestamp).toISOString()}"`));
  return { freshness, time, html };
}

test('TC-01: a fresh snapshot renders its UTC time without the stale marker', async () => {
  const timestamp = '2026-10-22T08:20:00.000Z';
  const { time } = await renderSnapshot(timestamp, '2026-10-22T08:20:30.000Z');
  assert.match(time, />Last updated 08:20 UTC<\/time>/);
  assert.doesNotMatch(time, /stale/);
});

test('TC-02: stale rendering preserves the snapshot timestamp with text and styling', async () => {
  const { time, freshness } = await renderSnapshot('2026-10-22T08:05:00.000Z', '2026-10-22T08:10:00.001Z');
  assert.equal(freshness.stale, true);
  assert.match(time, /class="health-freshness health-freshness--stale"/);
  assert.match(time, />Stale: last updated 08:05 UTC<\/time>/);
});

for (const age of [299999, 300000, 300001]) {
  test(`TC-03: snapshot aged ${age} ms is ${age > 300000 ? 'stale' : 'fresh'}`, async () => {
    const timestamp = '2026-10-22T08:05:00.000Z';
    const now = new Date(Date.parse(timestamp) + age).toISOString();
    const { freshness, time } = await renderSnapshot(timestamp, now);
    assert.equal(freshness.stale, age > 300000);
    assert.equal(time.includes('health-freshness--stale'), age > 300000);
    assert.equal(time.includes('Stale: last updated'), age > 300000);
  });
}

test('TC-04: UTC date boundary uses zero-padded UTC hours and minutes', async () => {
  const { freshness, time } = await renderSnapshot('2026-10-21T19:03:00.000-05:00', '2026-10-22T00:03:30.000Z');
  assert.equal(freshness.isoTimestamp, '2026-10-22T00:03:00.000Z');
  assert.match(time, />Last updated 00:03 UTC<\/time>/);
});

test('TC-05: GET / wires the build timestamp into the actual dashboard', async (t) => {
  const previous = process.env.DASHBOARD_TOKEN;
  process.env.DASHBOARD_TOKEN = 'synthetic-dashboard-fixture';
  t.after(() => {
    if (previous === undefined) delete process.env.DASHBOARD_TOKEN;
    else process.env.DASHBOARD_TOKEN = previous;
  });
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-22T08:20:00.000Z') });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  await once(server, 'listening');
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
    headers: { authorization: `Bearer ${process.env.DASHBOARD_TOKEN}` },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<time[^>]*datetime="2026-10-22T08:20:00.000Z"[^>]*>Last updated 08:20 UTC<\/time>/);
  assert.match(html, /name="viewport"/);
  assert.doesNotMatch(html, /<script\b/);
});
