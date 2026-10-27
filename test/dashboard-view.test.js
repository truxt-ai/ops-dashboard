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
