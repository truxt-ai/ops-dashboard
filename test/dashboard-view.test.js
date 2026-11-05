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
  assert.doesNotMatch(html, /<tr data-service-row\b/);
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
  const headers = [...html.matchAll(/<th(?: [^>]*)?>(.*?)<\/th>/g)].map(([, header]) => header.replace(/<span[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]*>/g, '').trim());
  assert.deepEqual(headers, ['Service', 'Status', 'Requests', 'Errors', 'Error rate']);
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  const rows = [...body.matchAll(/<tr data-service-row[^>]*>([\s\S]*?)<\/tr>/g)].map(([, row]) =>
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
  const services = names.map(name => typeof name === 'object' ? name : ({ name, status: 'healthy', statusLabel: 'Healthy', requests: 10, errors: 0, errorRate: 0 }));
  const html = await ejs.renderFile(template, { metrics: { services, totalRequests: 0, totalErrors: 0, errorRate: 0 }, freshness });
  assert.match(html, /<label for="service-search">Search services<\/label>/);
  assert.match(html, /<input id="service-search" type="search"/);
  assert.ok(html.indexOf('id="service-search"') < html.indexOf('<div class="services-table">'));
  const rows = [...html.matchAll(/<tr data-service-row([^>]*)>([\s\S]*?)<\/tr>/g)].map(([, attrs, cells]) => ({
    hidden: false, cells,
    dataset: Object.fromEntries([...attrs.matchAll(/data-(status|requests|errors|error-rate)="([^"]*)"/g)].map(([, key, value]) => [key === 'error-rate' ? 'errorRate' : key, value])),
    querySelector(selector) {
      assert.equal(selector, 'td');
      return { textContent: cells.match(/<td>(.*?)<\/td>/)[1] };
    },
  }));
  assert.equal(rows.length, names.length);
  const message = { hidden: true };
  const order = [...rows, message];
  const tbody = { insertBefore(row, before) { order.splice(order.indexOf(row), 1); order.splice(order.indexOf(before), 0, row); } };
  message.parentNode = tbody;
  const buttons = [...html.matchAll(/<button[^>]*data-sort="([^"]+)"[^>]*>/g)].map(([, key]) => ({
    dataset: { sort: key }, indicator: { textContent: '' }, attributes: {},
    parentNode: { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; } },
    querySelector() { return this.indicator; },
    addEventListener(event, handler) { assert.equal(event, 'click'); this.click = handler; },
  }));
  let onChange;
  const status = { value: 'all', addEventListener(event, handler) { assert.equal(event, 'change'); onChange = handler; } };
  let onInput;
  const input = { value: '', addEventListener(event, handler) { assert.equal(event, 'input'); onInput = handler; } };
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  vm.runInNewContext(scripts[0][1], { document: {
    getElementById(id) {
      assert.ok(['service-search', 'service-status', 'no-matching-services'].includes(id));
      return id === 'service-search' ? input : id === 'service-status' ? status : message;
    },
    querySelectorAll(selector) { if (selector === '[data-sort]') return buttons; assert.equal(selector, '[data-service-row]'); return rows; },
  } });
  assert.equal(typeof onInput, 'function');
  return { html, input, status, select(value) { status.value = value; assert.equal(typeof onChange, 'function'); onChange(); }, rows, message, buttons, order() { return order.filter(row => row !== message).map(row => row.querySelector('td').textContent); }, click(key) { const button = buttons.find(button => button.dataset.sort === key); assert.ok(button, `Missing ${key} sort button`); button.click(); }, search(value) { input.value = value; onInput(); }, visible() { return order.filter(row => row !== message && !row.hidden); } };
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

const sortingServices = [
  { name: 'Auth-A', requests: 1200, errors: 0, errorRate: 0 },
  { name: 'billing', requests: 9, errors: 3, errorRate: 12.5 },
  { name: 'auth-B', requests: 100, errors: 20, errorRate: 0.125 },
  { name: 'idle', requests: 0, errors: 0, errorRate: 0 },
].map(service => ({ ...service, status: 'healthy', statusLabel: 'Healthy' }));

test('AXM-926: each metric sorts numerically in both directions with stable ties', async () => {
  for (const [key, descending, ascending] of [
    ['requests', ['Auth-A', 'auth-B', 'billing', 'idle'], ['idle', 'billing', 'auth-B', 'Auth-A']],
    ['errors', ['auth-B', 'billing', 'Auth-A', 'idle'], ['Auth-A', 'idle', 'billing', 'auth-B']],
    ['errorRate', ['billing', 'auth-B', 'Auth-A', 'idle'], ['Auth-A', 'idle', 'auth-B', 'billing']],
  ]) {
    const fixture = await searchFixture(sortingServices);
    assert.deepEqual(fixture.order(), sortingServices.map(service => service.name));
    fixture.click(key);
    assert.deepEqual(fixture.order(), descending);
    fixture.click(key);
    assert.deepEqual(fixture.order(), ascending);
  }
});

test('AXM-926: direction, column switching and search compose without losing rows', async () => {
  const fixture = await searchFixture(sortingServices);
  fixture.click('requests');
  fixture.click('requests');
  fixture.search('AUTH');
  fixture.click('errorRate');
  assert.deepEqual(fixture.order(), ['billing', 'auth-B', 'Auth-A', 'idle']);
  assert.deepEqual(fixture.visible().map(row => row.querySelector('td').textContent), ['auth-B', 'Auth-A']);
  for (const button of fixture.buttons) {
    assert.equal(button.parentNode.attributes['aria-sort'], button.dataset.sort === 'errorRate' ? 'descending' : undefined);
    assert.equal(button.indicator.textContent, button.dataset.sort === 'errorRate' ? ' ↓' : '');
  }
  fixture.search('');
  assert.equal(fixture.visible().length, 4);
  fixture.search('missing');
  fixture.click('errors');
  assert.equal(fixture.visible().length, 0);
  assert.equal(fixture.message.hidden, false);
  fixture.search('');
  assert.deepEqual(fixture.order(), ['auth-B', 'billing', 'Auth-A', 'idle']);
  const empty = await searchFixture([]);
  empty.click('errorRate');
  empty.click('errorRate');
  assert.deepEqual(empty.order(), []);
});


test('AXM-928 TC-01/02/03: labeled statuses compose with literal name search and empty states', async () => {
  const services = ['healthy', 'degraded', 'failing'].flatMap(status =>
    ['Auth.[1]', 'billing'].map(name => ({ name: `${name}-${status}`, status, statusLabel: status, requests: 10, errors: 0, errorRate: 0 })));
  const fixture = await searchFixture(services);
  assert.match(fixture.html, /<label for="service-status">Status<\/label>/);
  const select = fixture.html.match(/<select id="service-status">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(([, value, label]) => [value, label]),
    [['all', 'All'], ['healthy', 'Healthy'], ['degraded', 'Degraded'], ['failing', 'Failing']]);
  assert.ok(fixture.html.indexOf('id="service-status"') < fixture.html.indexOf('<table>'));
  assert.equal(fixture.visible().length, 6);
  for (const status of ['healthy', 'degraded', 'failing']) {
    fixture.select(status);
    assert.equal(fixture.visible().length, 2);
    assert.ok(fixture.visible().every(row => row.dataset.status === status));
    fixture.search('AUTH.[1]');
    assert.equal(fixture.visible().length, 1);
    fixture.select('all');
    assert.equal(fixture.input.value, 'AUTH.[1]');
    assert.equal(fixture.visible().length, 3);
    fixture.select(status);
    fixture.search('');
    assert.equal(fixture.status.value, status);
    assert.equal(fixture.visible().length, 2);
    fixture.search('missing');
    assert.equal(fixture.message.hidden, false);
    fixture.search('');
  }
  fixture.select('all');
  assert.equal(fixture.visible().length, 6);
  for (const names of [[], ['healthy-only']]) {
    const empty = await searchFixture(names);
    empty.select('failing');
    assert.equal(empty.visible().length, 0);
    assert.equal(empty.message.hidden, false);
    empty.select('all');
    assert.equal(empty.visible().length, names.length);
    assert.equal(empty.message.hidden, true);
  }
});

test('AXM-928 TC-04: both filters preserve every numeric sort direction and stable ties', async () => {
  for (const key of ['requests', 'errors', 'errorRate']) {
    const fixture = await searchFixture(sortingServices);
    fixture.select('healthy');
    fixture.search('auth');
    for (const direction of ['descending', 'ascending']) {
      fixture.click(key);
      const expected = sortingServices.map((service, index) => ({ service, index }))
        .sort((a, b) => (direction === 'descending' ? -1 : 1) * (a.service[key] - b.service[key]) || a.index - b.index)
        .map(({ service }) => service.name);
      assert.deepEqual(fixture.order(), expected);
      fixture.select('failing');
      assert.equal(fixture.message.hidden, false);
      assert.equal(fixture.visible().length, 0);
      fixture.select('healthy');
      assert.equal(fixture.visible().length, 2);
      fixture.search('missing');
      fixture.select('all');
      assert.equal(fixture.message.hidden, false);
      fixture.search('');
      assert.deepEqual(fixture.order(), expected);
      for (const button of fixture.buttons) {
        assert.equal(button.parentNode.attributes['aria-sort'], button.dataset.sort === key ? direction : undefined);
        assert.equal(button.indicator.textContent, button.dataset.sort === key ? (direction === 'descending' ? ' ↓' : ' ↑') : '');
      }
      fixture.search('auth');
      fixture.select('healthy');
    }
  }
});
