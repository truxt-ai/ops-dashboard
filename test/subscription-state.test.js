'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

function loadSubscriptionState() {
  try {
    return require('../src/lib/billing/subscription-state');
  } catch (err) {
    assert.fail(`expected src/lib/billing/subscription-state.js to export STATES and nextSubscriptionState: ${err.message}`);
  }
}

function subscriptionEvent(type, status = 'active') {
  return {
    id: `evt_${type.replace(/\./g, '_')}_${status}`,
    type,
    data: {
      object: {
        id: 'sub_state_table',
        status,
        metadata: {
          workspace_id: 'ws_state_table',
          plan_id: 'pro',
        },
      },
    },
  };
}

test('STATES enumerates every persisted subscription status used by billing', () => {
  const { STATES } = loadSubscriptionState();

  assert.deepStrictEqual(STATES, {
    NONE: 'none',
    ACTIVE: 'active',
    PAST_DUE: 'past_due',
    CANCELED: 'canceled',
  });
});

test('nextSubscriptionState applies the exhaustive Stripe event transition table', () => {
  const { nextSubscriptionState } = loadSubscriptionState();
  const cases = [
    ['none', subscriptionEvent('checkout.session.completed'), 'active'],
    ['none', subscriptionEvent('customer.subscription.created', 'active'), 'active'],
    ['none', subscriptionEvent('customer.subscription.updated', 'active'), 'active'],
    ['active', subscriptionEvent('customer.subscription.updated', 'past_due'), 'past_due'],
    ['past_due', subscriptionEvent('customer.subscription.updated', 'active'), 'active'],
    ['active', subscriptionEvent('customer.subscription.deleted', 'canceled'), 'canceled'],
    ['past_due', subscriptionEvent('customer.subscription.deleted', 'canceled'), 'canceled'],
    ['active', subscriptionEvent('invoice.created'), 'active'],
    ['past_due', subscriptionEvent('customer.subscription.updated', 'trialing'), 'past_due'],
  ];

  for (const [currentState, event, expectedState] of cases) {
    assert.strictEqual(
      nextSubscriptionState(currentState, event),
      expectedState,
      `${event.type} with Stripe status ${event.data.object.status} transitions ${currentState} to ${expectedState}`,
    );
  }
});
