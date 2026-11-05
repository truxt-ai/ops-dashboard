'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const vm = require('node:vm');

const template = path.join(__dirname, '..', 'views', 'dashboard.ejs');
const freshness = { stale: false, isoTimestamp: '2026-10-22T08:20:00.000Z', label: 'Last updated 08:20 UTC' };

test('dashboard renders the totals pills with locale grouping', async () => {
  const metrics = { services: [], totalRequests: 32232, totalErrors: 1100, errorRate: 3.413 };
  const html = await ejs.renderFile(template, { metrics, freshness });
  assert.match(html, /Total requests: 32,232/);
  assert.match(html, /Total errors: 1100/);
  assert.match(html, /Error rate: 3.413%/);
});

test('dashboard renders an empty services table without service rows', async () => {
  const metrics = { services: [], totalRequests: 0, totalErrors: 0, errorRate: 0 };
  const html = await ejs.renderFile(template, { metrics, freshness });
  assert.doesNotMatch(html, /<tr data-service-row>/);
  assert.match(html, /<tr id="no-matching-services" hidden>\s*<td colspan="5">No matching services<\/td>\s*<\/tr>/);
});

test('AXM-905 TC-01/02: each service renders an adjacent Error rate cell without trailing zeros', async () => {
  const { presentServices } = require('../src/lib/service-health');
  const fixtures = [
    ['gateway', 18420, 1000, '5.429%'], ['auth', 9310, 100, '1.074%'],
    ['billing', 4502, 0, '0%'],
    ['third', 3, 1, '33.333%'], ['eighth', 8, 1, '12.5%'],
    ['no-errors', 100, 0, '0%'], ['tiny', 1000000, 1, '0%'],
    ['idle', 0, 0, '0%'], ['idle-errors', 0, 5, '0%'],
  ];
  const services = presentServices(fixtures.map(([name, requests, errors]) => ({ name, requests, errors })));
  const metrics = { services, totalRequests: 0, totalErrors: 0, errorRate: 0 };
  const html = await ejs.renderFile(template, { metrics, freshness });
  const headers = [...html.matchAll(/<th>(.*?)<\/th>/g)].map(([, header]) => header);
  assert.deepEqual(headers, ['Service', 'Status', 'Requests', 'Errors', 'Error rate']);
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...body.matchAll(/<tr data-service-row>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell.replace(/<[^>]*>/g, '').trim()));
  assert.equal(rows.length, fixtures.length);
  for (const [name, , , expected] of fixtures) {
    const row = rows.find(cells => cells[0] === name);
    assert.equal(row.length, headers.length);
    assert.equal(row[4], expected);
  }
  assert.doesNotMatch(body, /NaN|Infinity/);
});

async function searchFixture(names) {
  const services = names.map(name => ({ name, status: 'healthy', statusLabel: 'Healthy', requests: 10, errors: 0, errorRate: 0 }));
  const html = await ejs.renderFile(template, { metrics: { services, totalRequests: 0, totalErrors: 0, errorRate: 0 }, freshness });
  assert.match(html, /<label for="service-search">Search services<\/label>/);
  assert.match(html, /<input id="service-search" type="search"/);
  assert.ok(html.indexOf('id="service-search"') < html.indexOf('<div class="services-table">'));
  const rows = [...html.matchAll(/<tr data-service-row>([\s\S]*?)<\/tr>/g)].map(([, cells]) => ({
    hidden: false, cells,
    querySelector(selector) {
      assert.equal(selector, 'td');
      return { textContent: cells.match(/<td>(.*?)<\/td>/)[1] };
    },
  }));
  assert.equal(rows.length, names.length);
  const message = { hidden: true };
  let onInput;
  const input = { value: '', addEventListener(event, handler) { assert.equal(event, 'input'); onInput = handler; } };
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  vm.runInNewContext(scripts[0][1], { document: {
    getElementById(id) {
      assert.ok(['service-search', 'no-matching-services'].includes(id));
      return id === 'service-search' ? input : message;
    },
    querySelectorAll(selector) { assert.equal(selector, '[data-service-row]'); return rows; },
  } });
  assert.equal(typeof onInput, 'function');
  return { rows, message, search(value) { input.value = value; onInput(); }, visible() { return rows.filter(row => !row.hidden); } };
}

test('AXM-911: input events match only literal service-name substrings, ignoring case', async () => {
  const fixture = await searchFixture(['Auth-Service', 'billing', 'auth.backup[1]']);
  const original = fixture.rows.map(row => row.cells);
  assert.equal(fixture.visible().length, 3);
  for (const query of ['AUTH', 'uTh-']) {
    fixture.search(query);
    assert.equal(fixture.visible().length, query === 'AUTH' ? 2 : 1);
    assert.equal(fixture.message.hidden, true);
  }
  for (const query of ['Healthy', 'missing', '.*']) {
    fixture.search(query);
    assert.equal(fixture.visible().length, 0);
    assert.equal(fixture.message.hidden, false);
  }
  fixture.search('[1]');
  assert.deepEqual(fixture.visible(), [fixture.rows[2]]);
  assert.equal(fixture.message.hidden, true);
  fixture.search('');
  assert.deepEqual(fixture.visible(), fixture.rows);
  assert.deepEqual(fixture.rows.map(row => row.cells), original);
  assert.equal(fixture.message.hidden, true);
});

test('AXM-911: empty service data shows a message only for a nonempty query', async () => {
  const fixture = await searchFixture([]);
  for (const query of ['', '[', '']) {
    fixture.search(query);
    assert.equal(fixture.visible().length, 0);
    assert.equal(fixture.message.hidden, query === '');
  }
});
