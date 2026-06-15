'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const expectedPlanScalars = [
  { id: 'free', name: 'Free', priceUsd: 0, stripePriceId: 'price_free' },
  { id: 'starter', name: 'Starter', priceUsd: 29, stripePriceId: 'price_starter' },
  { id: 'pro', name: 'Pro', priceUsd: 99, stripePriceId: 'price_pro' },
  { id: 'business', name: 'Business', priceUsd: 299, stripePriceId: 'price_business' },
];

function loadPlansModule() {
  return require('../src/lib/billing/plans');
}

test('listBillingPlans exposes the deterministic ordered billing catalog', () => {
  const { listBillingPlans } = loadPlansModule();

  const plans = listBillingPlans();
  assert.deepStrictEqual(
    plans.map((plan) => Object.keys(plan).sort()),
    expectedPlanScalars.map(() => ['features', 'id', 'name', 'priceUsd', 'stripePriceId']),
  );
  assert.deepStrictEqual(
    plans.map(({ id, name, priceUsd, stripePriceId }) => ({ id, name, priceUsd, stripePriceId })),
    expectedPlanScalars,
  );
  assert.strictEqual(plans[0].priceUsd, 0);

  for (const plan of plans) {
    assert.ok(Array.isArray(plan.features), `${plan.id} features should be an array`);
    assert.ok(plan.features.length > 0, `${plan.id} should render at least one feature`);
    for (const feature of plan.features) {
      assert.strictEqual(typeof feature, 'string');
      assert.notStrictEqual(feature.trim(), '');
    }
  }
});

test('getBillingPlan returns known plans and null for an unknown plan id', () => {
  const { getBillingPlan } = loadPlansModule();

  for (const expectedPlan of expectedPlanScalars) {
    const plan = getBillingPlan(expectedPlan.id);
    assert.deepStrictEqual(
      { id: plan.id, name: plan.name, priceUsd: plan.priceUsd, stripePriceId: plan.stripePriceId },
      expectedPlan,
    );
  }

  assert.strictEqual(getBillingPlan('enterprise'), null);
});

test('hasPaidFeatureAccess is true only for paid catalog plans', () => {
  const { hasPaidFeatureAccess } = loadPlansModule();

  assert.strictEqual(hasPaidFeatureAccess('free'), false);
  assert.strictEqual(hasPaidFeatureAccess('starter'), true);
  assert.strictEqual(hasPaidFeatureAccess('pro'), true);
  assert.strictEqual(hasPaidFeatureAccess('business'), true);
  assert.strictEqual(hasPaidFeatureAccess('enterprise'), false);
  assert.strictEqual(hasPaidFeatureAccess(), false);
});
