'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const BILLING_MODULE = '../src/lib/billing/subscriptions';

function loadBillingSubscriptions() {
  try {
    return require(BILLING_MODULE);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && err.message.includes(BILLING_MODULE)) {
      assert.fail('expected src/lib/billing/subscriptions to export hasPaidFeatureAccess');
    }
    throw err;
  }
}

test('hasPaidFeatureAccess grants access only to paid plans with active or trialing status', async (t) => {
  const { hasPaidFeatureAccess } = loadBillingSubscriptions();
  assert.strictEqual(typeof hasPaidFeatureAccess, 'function');

  const cases = [
    {
      name: 'starter active billing record',
      billing: { plan: 'starter', subscription_status: 'active' },
      expected: true,
    },
    {
      name: 'pro trialing billing record',
      billing: { plan: 'pro', subscription_status: 'trialing' },
      expected: true,
    },
    {
      name: 'business active workspace wrapper',
      billing: { billing: { plan: 'business', subscription_status: 'active' } },
      expected: true,
    },
    {
      name: 'free active plan',
      billing: { plan: 'free', subscription_status: 'active' },
      expected: false,
    },
    {
      name: 'starter canceled subscription',
      billing: { plan: 'starter', subscription_status: 'canceled' },
      expected: false,
    },
    {
      name: 'pro incomplete subscription',
      billing: { plan: 'pro', subscription_status: 'incomplete' },
      expected: false,
    },
    {
      name: 'unknown paid-looking plan',
      billing: { plan: 'enterprise', subscription_status: 'active' },
      expected: false,
    },
    {
      name: 'missing billing record',
      billing: null,
      expected: false,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      assert.strictEqual(
        hasPaidFeatureAccess(testCase.billing),
        testCase.expected,
        `${testCase.name} should be ${testCase.expected ? 'granted' : 'denied'}`
      );
    });
  }
});
