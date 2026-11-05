'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const template = path.join(__dirname, '..', 'views', 'dashboard.ejs');
const freshness = { stale: false, isoTimestamp: '2026-10-22T08:20:00.000Z', label: 'Last updated 08:20 UTC' };

test('dashboard renders the totals pills with locale grouping', async () => {
  const metrics = { services: [], totalRequests: 32232, totalErrors: 1100, errorRate: 3.413 };
  const html = await ejs.renderFile(template, { metrics, freshness });
  assert.match(html, /Total requests: 32,232/);
  assert.match(html, /Total errors: 1100/);
  assert.match(html, /Error rate: 3.413%/);
});

test('dashboard renders an empty services table without rows', async () => {
  const metrics = { services: [], totalRequests: 0, totalErrors: 0, errorRate: 0 };
  const html = await ejs.renderFile(template, { metrics, freshness });
  assert.match(html, /<tbody>\s*<\/tbody>/);
});

test('AXM-905 TC-01/02: each service renders an adjacent Error rate cell without trailing zeros', async () => {
  const { presentServices } = require('../src/lib/service-health');
  const fixtures = [
    ['third', 3, 1, '33.333%'], ['eighth', 8, 1, '12.5%'],
    ['no-errors', 100, 0, '0%'], ['tiny', 1000000, 1, '0%'],
    ['idle', 0, 0, '0%'], ['idle-errors', 0, 5, '0%'],
  ];
  const services = presentServices(fixtures.map(([name, requests, errors]) => ({ name, requests, errors })));
  const metrics = { services, totalRequests: 0, totalErrors: 0, errorRate: 0 };
  const html = await ejs.renderFile(template, { metrics, freshness });
  const headers = [...html.matchAll(/<th>(.*?)<\/th>/g)].map(([, header]) => header);
  assert.deepEqual(headers, ['Service', 'Status', 'Error rate', 'Requests', 'Errors']);
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.replace(/<[^>]*>/g, '').trim()));
  assert.equal(rows.length, fixtures.length);
  for (const [name, , , expected] of fixtures) {
    const row = rows.find(cells => cells[0] === name);
    assert.equal(row.length, headers.length);
    assert.equal(row[2], expected);
  }
  assert.doesNotMatch(body, /NaN|Infinity/);
});
