'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { request } = require('./helpers/request');

const requiredTestIds = [
  'billing-plan-card-free',
  'billing-plan-card-starter',
  'billing-plan-card-pro',
  'billing-plan-card-business',
  'start-checkout-starter',
  'start-checkout-pro',
  'start-checkout-business',
  'checkout-loading',
  'checkout-error',
];

function loadFreshServer() {
  delete require.cache[require.resolve('../src/server')];
  return require('../src/server');
}

function assertPlanSelectorHtml(html) {
  assert.match(html, /fetch\s*\(/);
  assert.match(html, /['"]\/api\/billing\/checkout\/session['"]/);

  for (const testId of requiredTestIds) {
    assert.match(html, new RegExp(`data-testid=(["'])${testId}\\1`), testId);
  }

  for (const price of ['$0', '$29', '$99', '$299']) {
    assert.ok(html.includes(price), `expected rendered price ${price}`);
  }
}

async function withBlockedAxios(fn) {
  const originalGet = axios.get;
  const originalPost = axios.post;
  const calls = [];

  axios.get = async (...args) => {
    calls.push(['get', ...args]);
    throw new Error('billing routes must not call axios.get');
  };
  axios.post = async (...args) => {
    calls.push(['post', ...args]);
    throw new Error('billing routes must not call axios.post');
  };

  try {
    const result = await fn(calls);
    assert.deepStrictEqual(calls, []);
    return result;
  } finally {
    axios.get = originalGet;
    axios.post = originalPost;
  }
}

test('renderPlanSelector renders all billing plan cards and client-side fetch checkout', () => {
  const { listBillingPlans } = require('../src/lib/billing/plans');
  const { renderPlanSelector } = require('../src/lib/billing/plan-selector-view');

  const html = renderPlanSelector(listBillingPlans());

  assertPlanSelectorHtml(html);
});

test('GET /billing renders the plan selector without calling axios', async () => {
  const { app } = loadFreshServer();

  const response = await withBlockedAxios(() => request(app, {
    method: 'GET',
    path: '/billing',
  }));

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^text\/html\b/);
  assertPlanSelectorHtml(response.text);
});
