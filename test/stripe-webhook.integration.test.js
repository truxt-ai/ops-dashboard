'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_integration_test_secret';

const { app } = require('../src/server');

const BILLING_MODULE = '../src/lib/billing/subscriptions';
const WEBHOOK_PATH = '/api/billing/stripe/webhook';

function optionalBillingSubscriptions() {
  try {
    return require(BILLING_MODULE);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && err.message.includes(BILLING_MODULE)) {
      return null;
    }
    throw err;
  }
}

function requireBillingSubscriptions() {
  const service = optionalBillingSubscriptions();
  assert.ok(
    service,
    'expected src/lib/billing/subscriptions to expose billing persistence helpers'
  );
  assert.strictEqual(typeof service.getWorkspaceBilling, 'function');
  assert.strictEqual(typeof service.resetBillingStateForTests, 'function');
  return service;
}

function resetBillingStateForTests() {
  const service = optionalBillingSubscriptions();
  if (!service) {
    return;
  }
  assert.strictEqual(typeof service.resetBillingStateForTests, 'function');
  service.resetBillingStateForTests();
}

function getWorkspaceBilling(workspaceId) {
  return requireBillingSubscriptions().getWorkspaceBilling(workspaceId);
}

function assertBillingFields(record, expected) {
  assert.ok(record, 'expected a persisted workspace billing record');
  for (const [key, value] of Object.entries(expected)) {
    assert.strictEqual(record[key], value, `${key} should be persisted`);
  }
}

function stripeSignature(rawBody, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const timestamp = Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function postStripeWebhook(event, signature = null) {
  const rawBody = JSON.stringify(event);
  const headers = {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(rawBody),
    'stripe-signature': signature || stripeSignature(rawBody),
  };

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.request(
        {
          method: 'POST',
          host: '127.0.0.1',
          port,
          path: WEBHOOK_PATH,
          headers,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            text += chunk;
          });
          res.on('end', () => {
            server.close((closeErr) => {
              if (closeErr) {
                reject(closeErr);
                return;
              }
              let body = null;
              try {
                body = text ? JSON.parse(text) : null;
              } catch (_) {
                body = null;
              }
              resolve({ status: res.statusCode, body, text });
            });
          });
        }
      );
      req.on('error', (err) => {
        server.close(() => reject(err));
      });
      req.end(rawBody);
    });
  });
}

function checkoutCompletedEvent({
  id = 'evt_checkout_completed_it',
  workspaceId = 'workspace_stripe_it',
  customer = 'cus_workspace_it',
  subscription = 'sub_workspace_it',
  plan = 'pro',
  status = 'active',
} = {}) {
  return {
    id,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${id}`,
        object: 'checkout.session',
        mode: 'subscription',
        customer,
        subscription,
        status: 'complete',
        payment_status: 'paid',
        metadata: {
          workspace_id: workspaceId,
          plan,
          subscription_status: status,
        },
      },
    },
  };
}

function subscriptionEvent(type, {
  id,
  customer = 'cus_workspace_it',
  subscription = 'sub_workspace_it',
  plan = 'starter',
  status = 'trialing',
  price = 'price_starter_monthly',
} = {}) {
  return {
    id,
    object: 'event',
    type,
    data: {
      object: {
        id: subscription,
        object: 'subscription',
        customer,
        status,
        metadata: {},
        items: {
          object: 'list',
          data: [
            {
              id: `si_${id}`,
              object: 'subscription_item',
              price: {
                id: price,
                object: 'price',
                metadata: { plan },
              },
            },
          ],
        },
      },
    },
  };
}

test('rejects invalid Stripe signatures without mutating billing state', async () => {
  resetBillingStateForTests();

  const workspaceId = 'workspace_bad_signature_it';
  const response = await postStripeWebhook(
    checkoutCompletedEvent({ id: 'evt_bad_signature_it', workspaceId }),
    't=1700000000,v1=not-a-valid-signature'
  );

  assert.strictEqual(response.status, 400);
  assert.strictEqual(getWorkspaceBilling(workspaceId), null);
});

test('acknowledges unsupported Stripe events without creating billing state', async () => {
  resetBillingStateForTests();

  const workspaceId = 'workspace_unsupported_event_it';
  const response = await postStripeWebhook({
    id: 'evt_invoice_ignored_it',
    object: 'event',
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_unsupported_it',
        object: 'invoice',
        customer: 'cus_unsupported_it',
        metadata: { workspace_id: workspaceId },
      },
    },
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body && response.body.received, true);
  assert.strictEqual(getWorkspaceBilling(workspaceId), null);
});

test('checkout.session.completed persists workspace billing fields and ignores duplicate event ids', async () => {
  resetBillingStateForTests();

  const workspaceId = 'workspace_checkout_completed_it';
  const customer = 'cus_checkout_completed_it';
  const subscription = 'sub_checkout_completed_it';

  const first = await postStripeWebhook(
    checkoutCompletedEvent({
      id: 'evt_checkout_duplicate_guard_it',
      workspaceId,
      customer,
      subscription,
      plan: 'starter',
      status: 'trialing',
    })
  );

  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body && first.body.received, true);
  assertBillingFields(getWorkspaceBilling(workspaceId), {
    workspace_id: workspaceId,
    stripe_customer_id: customer,
    stripe_subscription_id: subscription,
    plan: 'starter',
    subscription_status: 'trialing',
  });

  const duplicateWithChangedPayload = await postStripeWebhook(
    checkoutCompletedEvent({
      id: 'evt_checkout_duplicate_guard_it',
      workspaceId,
      customer,
      subscription,
      plan: 'business',
      status: 'canceled',
    })
  );

  assert.strictEqual(duplicateWithChangedPayload.status, 200);
  assertBillingFields(getWorkspaceBilling(workspaceId), {
    workspace_id: workspaceId,
    stripe_customer_id: customer,
    stripe_subscription_id: subscription,
    plan: 'starter',
    subscription_status: 'trialing',
  });
});

test('customer.subscription.created and updated refresh the same workspace record', async () => {
  resetBillingStateForTests();

  const workspaceId = 'workspace_subscription_updates_it';
  const customer = 'cus_subscription_updates_it';
  const subscription = 'sub_subscription_updates_it';

  const checkout = await postStripeWebhook(
    checkoutCompletedEvent({
      id: 'evt_checkout_before_subscription_it',
      workspaceId,
      customer,
      subscription,
      plan: 'starter',
      status: 'trialing',
    })
  );
  assert.strictEqual(checkout.status, 200);

  const created = await postStripeWebhook(
    subscriptionEvent('customer.subscription.created', {
      id: 'evt_subscription_created_it',
      customer,
      subscription,
      plan: 'starter',
      status: 'trialing',
    })
  );
  assert.strictEqual(created.status, 200);
  assertBillingFields(getWorkspaceBilling(workspaceId), {
    workspace_id: workspaceId,
    stripe_customer_id: customer,
    stripe_subscription_id: subscription,
    plan: 'starter',
    subscription_status: 'trialing',
  });

  const updated = await postStripeWebhook(
    subscriptionEvent('customer.subscription.updated', {
      id: 'evt_subscription_updated_it',
      customer,
      subscription,
      plan: 'starter',
      status: 'active',
    })
  );
  assert.strictEqual(updated.status, 200);
  assertBillingFields(getWorkspaceBilling(workspaceId), {
    workspace_id: workspaceId,
    stripe_customer_id: customer,
    stripe_subscription_id: subscription,
    plan: 'starter',
    subscription_status: 'active',
  });
});

test('subscription updates without a workspace mapping are harmless', async () => {
  resetBillingStateForTests();

  const response = await postStripeWebhook(
    subscriptionEvent('customer.subscription.updated', {
      id: 'evt_subscription_missing_workspace_it',
      customer: 'cus_missing_workspace_it',
      subscription: 'sub_missing_workspace_it',
      plan: 'pro',
      status: 'active',
    })
  );

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body && response.body.received, true);
  assert.strictEqual(getWorkspaceBilling('workspace_missing_workspace_it'), null);
});
