'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const EXPECTED_STATES = [
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'trialing',
];

function requireBillingModule(fileName) {
  const modulePath = `../src/lib/billing/${fileName}`;

  try {
    return require(modulePath);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && err.message.includes(fileName)) {
      assert.fail(`expected ${modulePath}.js to exist and export the billing contract`);
    }

    throw err;
  }
}

function requireSubscriptionState() {
  const subscriptionState = requireBillingModule('subscription-state');

  assert.ok(subscriptionState.STATES, 'STATES export is required');
  assert.strictEqual(
    typeof subscriptionState.nextSubscriptionState,
    'function',
    'nextSubscriptionState export is required'
  );

  return subscriptionState;
}

function assertTransition(nextSubscriptionState, current, incoming, expected) {
  assert.deepStrictEqual(
    nextSubscriptionState(current, incoming),
    expected,
    `${current} -> ${incoming}`
  );
}

test('subscription state exports the exact Stripe billing states', () => {
  const { STATES } = requireSubscriptionState();

  assert.deepStrictEqual(
    Object.values(STATES).sort(),
    EXPECTED_STATES.slice().sort(),
    'STATES should contain only the supported subscription states'
  );
});

test('nextSubscriptionState enforces the full transition table', () => {
  const { nextSubscriptionState } = requireSubscriptionState();
  const legalTransitions = new Map([
    ['incomplete', new Set(['trialing', 'active', 'past_due', 'canceled', 'incomplete_expired'])],
    ['trialing', new Set(['active', 'past_due', 'canceled'])],
    ['active', new Set(['past_due', 'canceled'])],
    ['past_due', new Set(['active', 'canceled'])],
    ['canceled', new Set()],
    ['incomplete_expired', new Set()],
  ]);

  for (const current of EXPECTED_STATES) {
    for (const incoming of EXPECTED_STATES) {
      if (current === incoming) {
        assertTransition(nextSubscriptionState, current, incoming, {
          state: current,
          changed: false,
          reason: 'noop',
        });
        continue;
      }

      if (legalTransitions.get(current).has(incoming)) {
        assertTransition(nextSubscriptionState, current, incoming, {
          state: incoming,
          changed: true,
          reason: 'ok',
        });
        continue;
      }

      assertTransition(nextSubscriptionState, current, incoming, {
        state: current,
        changed: false,
        reason: 'illegal-transition',
      });
    }
  }
});

test('nextSubscriptionState reports explicit edge-case reasons', () => {
  const { nextSubscriptionState } = requireSubscriptionState();

  assert.deepStrictEqual(nextSubscriptionState('canceled', 'active'), {
    state: 'canceled',
    changed: false,
    reason: 'illegal-transition',
  });
  assert.deepStrictEqual(nextSubscriptionState('active', 'active'), {
    state: 'active',
    changed: false,
    reason: 'noop',
  });
  assert.deepStrictEqual(nextSubscriptionState('active', 'incomplete'), {
    state: 'active',
    changed: false,
    reason: 'illegal-transition',
  });
  assert.deepStrictEqual(nextSubscriptionState('paused', 'active'), {
    state: 'paused',
    changed: false,
    reason: 'unknown-current',
  });
});

test('billing repo stores records by subscription id and resets test state', (t) => {
  const repo = requireBillingModule('billing-repo');

  for (const fn of ['upsert', 'get', 'has', 'size', 'reset', 'resetBillingStateForTests']) {
    assert.strictEqual(typeof repo[fn], 'function', `${fn} export is required`);
  }

  repo.resetBillingStateForTests();
  t.after(() => repo.resetBillingStateForTests());

  repo.upsert({
    stripe_subscription_id: 'sub_repo_contract',
    workspace_id: 'workspace_repo_contract',
    plan_id: 'pro',
    status: 'active',
  });

  assert.strictEqual(repo.has('sub_repo_contract'), true);
  assert.strictEqual(repo.size(), 1);
  assert.deepStrictEqual(repo.get('sub_repo_contract'), {
    stripe_subscription_id: 'sub_repo_contract',
    workspace_id: 'workspace_repo_contract',
    plan_id: 'pro',
    status: 'active',
  });

  repo.upsert({
    stripe_subscription_id: 'sub_repo_contract',
    workspace_id: 'workspace_repo_contract',
    plan_id: 'pro',
    status: 'past_due',
  });

  assert.strictEqual(repo.size(), 1, 'upserting the same subscription id should update in place');
  assert.strictEqual(repo.get('sub_repo_contract').status, 'past_due');

  repo.reset();
  assert.strictEqual(repo.size(), 0);
  assert.strictEqual(repo.has('sub_repo_contract'), false);
  assert.strictEqual(repo.get('sub_repo_contract') == null, true);
});
