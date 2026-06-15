'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const PLAN_MODULE = '../src/lib/billing/plans';

const PRICE_ENV_KEYS = {
  starter: ['STRIPE_PRICE_ID_STARTER', 'STRIPE_STARTER_PRICE_ID', 'STRIPE_PRICE_STARTER'],
  pro: ['STRIPE_PRICE_ID_PRO', 'STRIPE_PRO_PRICE_ID', 'STRIPE_PRICE_PRO'],
  business: ['STRIPE_PRICE_ID_BUSINESS', 'STRIPE_BUSINESS_PRICE_ID', 'STRIPE_PRICE_BUSINESS']
};

const PRICE_IDS = {
  starter: 'price_starter_monthly',
  pro: 'price_pro_monthly',
  business: 'price_business_monthly'
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

function allPriceEnvKeys() {
  return Object.values(PRICE_ENV_KEYS).flat();
}

function withConfiguredPriceEnv(fn) {
  const previous = rememberEnv(allPriceEnvKeys());

  try {
    for (const [planId, keys] of Object.entries(PRICE_ENV_KEYS)) {
      for (const key of keys) {
        process.env[key] = PRICE_IDS[planId];
      }
    }

    return fn();
  }
  finally {
    restoreEnv(previous);
  }
}

function withMissingPriceEnv(fn) {
  const previous = rememberEnv(allPriceEnvKeys());

  try {
    for (const key of allPriceEnvKeys()) {
      delete process.env[key];
    }

    return fn();
  }
  finally {
    restoreEnv(previous);
  }
}

function clearPlanModule() {
  try {
    delete require.cache[require.resolve(PLAN_MODULE)];
  }
  catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      throw err;
    }
  }
}

function loadPlansModule() {
  clearPlanModule();
  return require(PLAN_MODULE);
}

test('billing plan config exposes free, starter, pro, and business plans with Stripe price IDs for paid tiers', () => {
  withConfiguredPriceEnv(() => {
    const { getBillingPlan, listBillingPlans } = loadPlansModule();

    assert.equal(typeof listBillingPlans, 'function');
    assert.equal(typeof getBillingPlan, 'function');

    const plans = listBillingPlans();
    assert.deepEqual(plans.map((plan) => plan.id), ['free', 'starter', 'pro', 'business']);

    const byId = new Map(plans.map((plan) => [plan.id, plan]));

    assert.equal(byId.get('free').stripePriceId, null, 'free plan must not be backed by Stripe');
    assert.equal(byId.get('free').monthlyUsdCents, 0, 'free plan price must be zero USD');

    for (const planId of ['starter', 'pro', 'business']) {
      const plan = byId.get(planId);

      assert.equal(plan.active, true, `${planId} must be active for checkout`);
      assert.equal(plan.currency, 'usd', `${planId} must be billed in USD`);
      assert.equal(plan.interval, 'month', `${planId} must be billed monthly`);
      assert.equal(plan.stripePriceId, PRICE_IDS[planId], `${planId} must expose its configured Stripe price ID`);
      assert.ok(Number.isInteger(plan.monthlyUsdCents), `${planId} must expose a fixed monthly cent amount`);
      assert.ok(plan.monthlyUsdCents > 0, `${planId} must be a paid plan`);
      assert.deepEqual(getBillingPlan(planId), plan, `getBillingPlan must return the configured ${planId} plan`);
    }
  });
});

test('paid billing plans fail fast when required Stripe price IDs are missing', () => {
  withMissingPriceEnv(() => {
    assert.throws(
      () => {
        const { listBillingPlans } = loadPlansModule();
        listBillingPlans();
      },
      /stripe.*price|STRIPE_.*PRICE/i,
      'paid plans must not be usable without configured Stripe price IDs'
    );
  });
});
