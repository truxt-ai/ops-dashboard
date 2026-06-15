'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { createFakeStripe } = require('./helpers/fake-stripe');
const { request } = require('./helpers/request');

function loadFreshServer() {
  delete require.cache[require.resolve('../src/server')];
  return require('../src/server');
}

function installFakeStripe(app, fakeStripe) {
  app.locals.stripe = fakeStripe;
  app.locals.billingStripe = fakeStripe;
  app.locals.billing = Object.assign({}, app.locals.billing, { stripe: fakeStripe });
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

test('makeBillingService creates a Stripe subscription checkout session with plan metadata', async () => {
  const { makeBillingService } = require('../src/lib/billing/billing-service');
  const fakeStripe = createFakeStripe();
  const service = makeBillingService({ stripe: fakeStripe });

  const result = await service.startCheckout({ planId: 'pro', workspaceId: 'ws_123' });

  assert.deepStrictEqual(result, {
    sessionId: 'cs_test_pro',
    url: 'https://checkout.stripe.test/pro',
  });
  assert.strictEqual(fakeStripe.createCheckoutSessionCalls.length, 1);

  const params = fakeStripe.createCheckoutSessionCalls[0];
  assert.strictEqual(params.mode, 'subscription');
  assert.strictEqual(params.line_items[0].price, 'price_pro');
  assert.strictEqual(params.metadata.planId, 'pro');
  assert.strictEqual(params.client_reference_id, 'ws_123');
});

test('POST /api/billing/checkout/session returns JSON errors in the required evaluation order', async () => {
  const { app } = loadFreshServer();
  const fakeStripe = createFakeStripe();
  installFakeStripe(app, fakeStripe);

  const cases = [
    {
      name: 'missing workspace id',
      headers: { 'x-workspace-role': 'admin' },
      body: { planId: 'pro' },
      statusCode: 401,
      json: { error: 'unauthenticated' },
    },
    {
      name: 'non-admin role',
      headers: { 'x-workspace-id': 'ws_123', 'x-workspace-role': 'member' },
      body: { planId: 'pro' },
      statusCode: 403,
      json: { error: 'forbidden' },
    },
    {
      name: 'missing plan id',
      headers: { 'x-workspace-id': 'ws_123', 'x-workspace-role': 'admin' },
      body: {},
      statusCode: 400,
      json: { error: 'invalid_plan' },
    },
    {
      name: 'empty plan id',
      headers: { 'x-workspace-id': 'ws_123', 'x-workspace-role': 'admin' },
      body: { planId: '' },
      statusCode: 400,
      json: { error: 'invalid_plan' },
    },
    {
      name: 'free plan',
      headers: { 'x-workspace-id': 'ws_123', 'x-workspace-role': 'admin' },
      body: { planId: 'free' },
      statusCode: 400,
      json: { error: 'not_a_paid_plan' },
    },
    {
      name: 'unknown plan',
      headers: { 'x-workspace-id': 'ws_123', 'x-workspace-role': 'admin' },
      body: { planId: 'enterprise' },
      statusCode: 404,
      json: { error: 'unknown_plan' },
    },
  ];

  await withBlockedAxios(async () => {
    for (const testCase of cases) {
      const response = await request(app, {
        method: 'POST',
        path: '/api/billing/checkout/session',
        headers: testCase.headers,
        body: testCase.body,
      });

      assert.strictEqual(response.statusCode, testCase.statusCode, testCase.name);
      assert.match(response.headers['content-type'], /^application\/json\b/, testCase.name);
      assert.deepStrictEqual(response.json, testCase.json, testCase.name);
    }
  });
  assert.strictEqual(fakeStripe.createCheckoutSessionCalls.length, 0);
});

test('POST /api/billing/checkout/session starts checkout for a paid plan', async () => {
  const { app } = loadFreshServer();
  const fakeStripe = createFakeStripe();
  installFakeStripe(app, fakeStripe);

  const response = await withBlockedAxios(() => request(app, {
    method: 'POST',
    path: '/api/billing/checkout/session',
    headers: {
      'x-workspace-id': 'ws_123',
      'x-workspace-role': 'admin',
    },
    body: { planId: 'pro' },
  }));

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^application\/json\b/);
  assert.deepStrictEqual(response.json, {
    sessionId: 'cs_test_pro',
    url: 'https://checkout.stripe.test/pro',
  });
  assert.strictEqual(fakeStripe.createCheckoutSessionCalls.length, 1);

  const params = fakeStripe.createCheckoutSessionCalls[0];
  assert.strictEqual(params.mode, 'subscription');
  assert.strictEqual(params.line_items[0].price, 'price_pro');
  assert.strictEqual(params.metadata.planId, 'pro');
  assert.strictEqual(params.client_reference_id, 'ws_123');
});
