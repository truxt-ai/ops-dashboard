'use strict';

const http = require('node:http');
const Module = require('node:module');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const SERVER_MODULE = '../src/server';

const BILLING_ENV = {
  APP_BASE_URL: 'https://ops.example.test',
  STRIPE_SECRET_KEY: 'sk_test_checkout_sessions',
  STRIPE_PRICE_ID_STARTER: 'price_starter_monthly',
  STRIPE_STARTER_PRICE_ID: 'price_starter_monthly',
  STRIPE_PRICE_STARTER: 'price_starter_monthly',
  STRIPE_PRICE_ID_PRO: 'price_pro_monthly',
  STRIPE_PRO_PRICE_ID: 'price_pro_monthly',
  STRIPE_PRICE_PRO: 'price_pro_monthly',
  STRIPE_PRICE_ID_BUSINESS: 'price_business_monthly',
  STRIPE_BUSINESS_PRICE_ID: 'price_business_monthly',
  STRIPE_PRICE_BUSINESS: 'price_business_monthly'
};

function rememberEnv(keys) {
  const previous = new Map();
  for (const key of keys) {
    previous.set(key, process.env[key]);
  }
  return previous;
}

function restoreEnv(previous) {
  for (const [key, value] of previous.entries()) {
    if (value === undefined) {
      delete process.env[key];
    }
    else {
      process.env[key] = value;
    }
  }
}

function installBillingEnv() {
  const previous = rememberEnv(Object.keys(BILLING_ENV));
  Object.assign(process.env, BILLING_ENV);
  return () => restoreEnv(previous);
}

function clearServerModule() {
  try {
    delete require.cache[require.resolve(SERVER_MODULE)];
  }
  catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
  }
}

function createFakeStripe() {
  const calls = {
    constructors: [],
    customersCreate: [],
    customersList: [],
    customersSearch: [],
    checkoutSessionsCreate: []
  };
  const customers = [];

  const stripe = {
    customers: {
      create: async (params) => {
        calls.customersCreate.push(params);

        const workspaceId = params.metadata && (params.metadata.workspaceId || params.metadata.workspace_id);
        const customer = {
          id: workspaceId ? `cus_${workspaceId}` : `cus_${customers.length + 1}`,
          email: params.email,
          metadata: params.metadata || {}
        };

        customers.push(customer);
        return customer;
      },
      list: async (params) => {
        calls.customersList.push(params);
        return { data: customers.slice() };
      },
      search: async (params) => {
        calls.customersSearch.push(params);
        return { data: customers.slice() };
      }
    },
    checkout: {
      sessions: {
        create: async (params) => {
          calls.checkoutSessionsCreate.push(params);

          return {
            id: `cs_test_${params.metadata && params.metadata.planId}`,
            url: `https://checkout.stripe.test/${params.metadata && params.metadata.planId}`
          };
        }
      }
    }
  };

  return { calls, stripe };
}

function installStripeModuleFake(fakeStripe, calls) {
  const originalLoad = Module._load;

  function StripeConstructor(...args) {
    calls.constructors.push(args);
    return fakeStripe;
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'stripe') {
      return StripeConstructor;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return () => {
    Module._load = originalLoad;
  };
}

async function withCheckoutApp(fn) {
  const restoreBillingEnv = installBillingEnv();
  const { calls, stripe } = createFakeStripe();
  const restoreStripeModule = installStripeModuleFake(stripe, calls);

  clearServerModule();

  try {
    const { app } = require(SERVER_MODULE);

    app.locals.stripe = stripe;
    app.locals.billingStripe = stripe;
    app.locals.billingCustomerStore = new Map();
    app.locals.billingBaseUrl = BILLING_ENV.APP_BASE_URL;

    return await fn({ app, calls });
  }
  finally {
    clearServerModule();
    restoreStripeModule();
    restoreBillingEnv();
  }
}

function adminHeaders(workspaceId = 'workspace_alpha') {
  return {
    'x-user-id': 'user_admin',
    'x-user-email': 'admin@example.test',
    'x-workspace-id': workspaceId,
    'x-workspace-role': 'admin'
  };
}

async function request(app, options) {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers = {
    ...(options.headers || {})
  };

  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = Buffer.byteLength(body);
  }

  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const response = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          method: options.method || 'GET',
          path: options.path,
          headers
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            text += chunk;
          });
          res.on('end', () => {
            const result = {
              statusCode: res.statusCode,
              headers: res.headers,
              text,
              json: null
            };

            if ((res.headers['content-type'] || '').includes('application/json')) {
              result.json = JSON.parse(text);
            }

            resolve(result);
          });
        }
      );

      req.on('error', reject);

      if (body !== undefined) {
        req.write(body);
      }

      req.end();
    });

    return response;
  }
  finally {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        }
        else {
          resolve();
        }
      });
    });
  }
}

function responseText(response) {
  return response.json ? JSON.stringify(response.json) : response.text;
}

test('POST /api/billing/checkout/session requires workspace admin auth before touching Stripe', async () => {
  await withCheckoutApp(async ({ app, calls }) => {
    const missingAuth = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      body: { planId: 'starter' }
    });

    assert.equal(missingAuth.statusCode, 401, responseText(missingAuth));
    assert.match(responseText(missingAuth), /auth|workspace/i);

    const memberAuth = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      headers: {
        ...adminHeaders(),
        'x-workspace-role': 'member'
      },
      body: { planId: 'starter' }
    });

    assert.equal(memberAuth.statusCode, 403, responseText(memberAuth));
    assert.match(responseText(memberAuth), /admin|permission|forbidden/i);
    assert.equal(calls.customersCreate.length, 0, 'unauthorized requests must not create Stripe customers');
    assert.equal(calls.checkoutSessionsCreate.length, 0, 'unauthorized requests must not create Checkout Sessions');
  });
});

test('POST /api/billing/checkout/session rejects free, missing, and unknown plans without touching Stripe', async () => {
  await withCheckoutApp(async ({ app, calls }) => {
    const missingPlan = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      headers: adminHeaders(),
      body: {}
    });

    assert.equal(missingPlan.statusCode, 400, responseText(missingPlan));
    assert.match(responseText(missingPlan), /planId|plan/i);

    const freePlan = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      headers: adminHeaders(),
      body: { planId: 'free' }
    });

    assert.equal(freePlan.statusCode, 400, responseText(freePlan));
    assert.match(responseText(freePlan), /free|paid|checkout/i);

    const unknownPlan = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      headers: adminHeaders(),
      body: { planId: 'enterprise' }
    });

    assert.equal(unknownPlan.statusCode, 404, responseText(unknownPlan));
    assert.match(responseText(unknownPlan), /unknown|not found|plan/i);
    assert.equal(calls.customersCreate.length, 0, 'invalid plan requests must not create Stripe customers');
    assert.equal(calls.checkoutSessionsCreate.length, 0, 'invalid plan requests must not create Checkout Sessions');
  });
});

test('POST /api/billing/checkout/session creates or reuses a customer and starts Stripe Checkout with subscription metadata', async () => {
  await withCheckoutApp(async ({ app, calls }) => {
    const first = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      headers: adminHeaders('workspace_alpha'),
      body: { planId: 'pro' }
    });

    assert.equal(first.statusCode, 200, responseText(first));
    assert.deepEqual(first.json, {
      sessionId: 'cs_test_pro',
      url: 'https://checkout.stripe.test/pro'
    });

    assert.equal(calls.customersCreate.length, 1, 'first checkout should create a Stripe Customer for the workspace');
    assert.deepEqual(calls.customersCreate[0].metadata, {
      workspaceId: 'workspace_alpha'
    });

    assert.equal(calls.checkoutSessionsCreate.length, 1);

    const session = calls.checkoutSessionsCreate[0];
    assert.equal(session.mode, 'subscription');
    assert.deepEqual(session.line_items, [
      { price: 'price_pro_monthly', quantity: 1 }
    ]);
    assert.equal(session.customer, 'cus_workspace_alpha');
    assert.deepEqual(session.metadata, {
      workspaceId: 'workspace_alpha',
      planId: 'pro'
    });
    assert.match(session.success_url, /^https:\/\/ops\.example\.test\/billing\?/);
    assert.match(session.success_url, /checkout=success/);
    assert.match(session.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.match(session.cancel_url, /^https:\/\/ops\.example\.test\/billing\?/);
    assert.match(session.cancel_url, /checkout=cancelled/);
    assert.doesNotMatch(JSON.stringify(session), /cardNumber|cardCvc|paymentMethodData/i);

    const second = await request(app, {
      method: 'POST',
      path: '/api/billing/checkout/session',
      headers: adminHeaders('workspace_alpha'),
      body: { planId: 'starter' }
    });

    assert.equal(second.statusCode, 200, responseText(second));
    assert.equal(calls.customersCreate.length, 1, 'second checkout for same workspace must reuse the Stripe Customer');
    assert.equal(calls.checkoutSessionsCreate.length, 2);
    assert.deepEqual(calls.checkoutSessionsCreate[1].line_items, [
      { price: 'price_starter_monthly', quantity: 1 }
    ]);
    assert.equal(calls.checkoutSessionsCreate[1].customer, 'cus_workspace_alpha');
  });
});
