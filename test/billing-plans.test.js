'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const EXPECTED_PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    features: ['1 workspace', 'community support'],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceUsd: 29,
    features: ['5 workspaces', 'email support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 99,
    features: ['20 workspaces', 'priority support'],
  },
  {
    id: 'business',
    name: 'Business',
    priceUsd: 299,
    features: ['unlimited workspaces', 'SLA support'],
  },
];

function loadBillingPlans() {
  try {
    return require('../src/lib/billing-plans');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('billing-plans')) {
      return {
        listBillingPlans: () => [],
        getBillingPlan: () => undefined,
        hasPaidFeatureAccess: () => false,
      };
    }

    throw err;
  }
}

const {
  listBillingPlans,
  getBillingPlan,
  hasPaidFeatureAccess,
} = loadBillingPlans();

test('listBillingPlans returns exactly the four public plans in catalog order', () => {
  assert.deepStrictEqual(listBillingPlans(), EXPECTED_PLANS);
});

test('listBillingPlans keeps the free plan price as numeric zero', () => {
  const [freePlan] = listBillingPlans();

  assert.strictEqual(freePlan.id, 'free');
  assert.strictEqual(freePlan.priceUsd, 0);
  assert.strictEqual(typeof freePlan.priceUsd, 'number');
});

test('getBillingPlan resolves known plans and returns undefined for unknown ids', async (t) => {
  for (const expectedPlan of EXPECTED_PLANS) {
    await t.test(`returns the ${expectedPlan.id} plan`, () => {
      assert.deepStrictEqual(getBillingPlan(expectedPlan.id), expectedPlan);
    });
  }

  await t.test('returns undefined for an unknown plan id', () => {
    assert.strictEqual(getBillingPlan('enterprise'), undefined);
  });
});

test('hasPaidFeatureAccess grants only paid plans', async (t) => {
  const cases = [
    { planId: 'free', want: false },
    { planId: 'starter', want: true },
    { planId: 'pro', want: true },
    { planId: 'business', want: true },
    { planId: 'enterprise', want: false },
  ];

  for (const tc of cases) {
    await t.test(`${tc.planId} -> ${tc.want}`, () => {
      assert.strictEqual(hasPaidFeatureAccess(tc.planId), tc.want);
    });
  }
});

test('GET /api/billing/plans returns a 200 JSON catalog response', async () => {
  const { app } = require('../src/server');
  const response = await requestApp(app, 'GET', '/api/billing/plans');

  assert.strictEqual(response.statusCode, 200);
  assert.match(response.headers['content-type'] || '', /^application\/json\b/);
  assert.deepStrictEqual(JSON.parse(response.body), { plans: EXPECTED_PLANS });
});

function requestApp(app, method, url) {
  return new Promise((resolve, reject) => {
    const headers = {};
    const chunks = [];
    let resolved = false;

    const req = {
      method,
      url,
      headers: {
        accept: 'application/json',
        host: '127.0.0.1',
      },
      connection: {},
      socket: {},
      on() {
        return this;
      },
      resume() {},
    };

    const res = {
      statusCode: 200,
      headersSent: false,
      locals: {},
      getHeader(name) {
        return headers[name.toLowerCase()];
      },
      setHeader(name, value) {
        headers[name.toLowerCase()] = value;
      },
      removeHeader(name) {
        delete headers[name.toLowerCase()];
      },
      writeHead(statusCode, reasonOrHeaders, maybeHeaders) {
        this.statusCode = statusCode;
        const extraHeaders = typeof reasonOrHeaders === 'object'
          ? reasonOrHeaders
          : maybeHeaders;

        if (extraHeaders) {
          for (const [name, value] of Object.entries(extraHeaders)) {
            this.setHeader(name, value);
          }
        }
      },
      write(chunk, encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        if (callback) callback();
      },
      end(chunk, encoding) {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }

        this.headersSent = true;
        if (!resolved) {
          resolved = true;
          resolve({
            statusCode: this.statusCode,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        }
      },
      on() {
        return this;
      },
      once() {
        return this;
      },
      emit() {
        return false;
      },
    };

    app.handle(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }

      if (!resolved) {
        resolved = true;
        resolve({
          statusCode: res.statusCode === 200 ? 404 : res.statusCode,
          headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      }
    });
  });
}
