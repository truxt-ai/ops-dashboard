'use strict';

const { beforeEach, test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createFakeStripe } = require('./helpers/fake-stripe');
const { postRaw } = require('./helpers/request');

const WEBHOOK_PATH = '/api/billing/webhook';
const WEBHOOK_SECRET = 'whsec_test_secret';
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'billing');

delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.STRIPE_SECRET_KEY;

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

function requireWebhookVerify() {
  const verify = requireBillingModule('webhook-verify');

  assert.strictEqual(typeof verify.signPayload, 'function', 'signPayload export is required');
  assert.strictEqual(typeof verify.verifyPayload, 'function', 'verifyPayload export is required');
  return verify;
}

function requireRepo() {
  const repo = requireBillingModule('billing-repo');

  for (const fn of ['get', 'has', 'size', 'resetBillingStateForTests']) {
    assert.strictEqual(typeof repo[fn], 'function', `${fn} export is required`);
  }

  return repo;
}

function maybeResetRepo() {
  try {
    requireBillingModule('billing-repo').resetBillingStateForTests();
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      return;
    }

    if (err && err.message && err.message.includes('expected ../src/lib/billing/billing-repo.js')) {
      return;
    }

    throw err;
  }
}

function requireBillingService() {
  const service = requireBillingModule('billing-service');

  assert.strictEqual(typeof service.makeBillingService, 'function', 'makeBillingService export is required');
  return service;
}

function requireServerApp() {
  const { app } = require('../src/server');

  assert.ok(app, 'src/server must keep exporting app');
  return app;
}

function fixtureRaw(fileName) {
  return fs.readFileSync(path.join(FIXTURE_DIR, fileName));
}

function fixtureEvent(fileName) {
  return JSON.parse(fixtureRaw(fileName).toString('utf8'));
}

function rawFromEvent(event) {
  return Buffer.from(`${JSON.stringify(event, null, 2)}\n`);
}

function sign(rawBody, secret = WEBHOOK_SECRET) {
  return requireWebhookVerify().signPayload(rawBody, secret);
}

function postWebhook(rawBody, signature) {
  return postRaw(requireServerApp(), WEBHOOK_PATH, rawBody, {
    'stripe-signature': signature,
  });
}

function subscriptionIdFromRecord(record, expectedSubscriptionId) {
  return record.stripe_subscription_id === expectedSubscriptionId ||
    record.subscription_id === expectedSubscriptionId;
}

function assertBillingRecord(subscriptionId, expected) {
  const record = requireRepo().get(subscriptionId);

  assert.ok(record, `expected billing record for ${subscriptionId}`);
  assert.ok(
    subscriptionIdFromRecord(record, subscriptionId),
    'record should persist its subscription id data'
  );
  assert.strictEqual(record.workspace_id, expected.workspace_id);
  assert.strictEqual(record.plan_id, expected.plan_id);
  assert.strictEqual(record.status, expected.status);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(record, 'workspaceId'),
    false,
    'repo records must use workspace_id, not workspaceId'
  );
}

async function postSignedFixture(fileName) {
  const raw = fixtureRaw(fileName);

  return postWebhook(raw, sign(raw));
}

beforeEach(() => {
  maybeResetRepo();
});

test('webhook verification validates HMAC signatures over exact raw bytes', () => {
  const { verifyPayload } = requireWebhookVerify();
  const raw = fixtureRaw('checkout.session.completed.json');
  const signature = sign(raw);
  const tampered = Buffer.concat([raw, Buffer.from('\n')]);

  assert.doesNotThrow(() => verifyPayload(raw, signature, WEBHOOK_SECRET));
  assert.throws(() => verifyPayload(tampered, signature, WEBHOOK_SECRET));
  assert.throws(() => verifyPayload(raw, signature, 'whsec_wrong_secret'));
});

test('billing service applies subscription fixtures through state machine and repo', async () => {
  const repo = requireRepo();
  const { makeBillingService } = requireBillingService();
  const billing = makeBillingService({ repo, stripe: createFakeStripe() });

  assert.strictEqual(
    typeof billing.handleWebhookEvent,
    'function',
    'makeBillingService should expose handleWebhookEvent(event)'
  );

  await billing.handleWebhookEvent(fixtureEvent('customer.subscription.created.json'));
  assertBillingRecord('sub_created_contract', {
    workspace_id: 'workspace_created_contract',
    plan_id: 'starter',
    status: 'trialing',
  });

  await billing.handleWebhookEvent(fixtureEvent('customer.subscription.updated.active.json'));
  assertBillingRecord('sub_updated_active_contract', {
    workspace_id: 'workspace_updated_active_contract',
    plan_id: 'pro',
    status: 'active',
  });
});

test('POST /api/billing/webhook accepts a valid signed checkout fixture and persists active state', async () => {
  const response = await postSignedFixture('checkout.session.completed.json');

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(response.body, { received: true });
  assertBillingRecord('sub_checkout_contract', {
    workspace_id: 'workspace_checkout_contract',
    plan_id: 'pro',
    status: 'active',
  });
});

test('POST /api/billing/webhook rejects tampered bodies and wrong secrets without state changes', async () => {
  const raw = fixtureRaw('checkout.session.completed.json');
  const signature = sign(raw);
  const tampered = Buffer.from(
    raw.toString('utf8').replace('workspace_checkout_contract', 'workspace_tampered_contract')
  );

  const tamperedResponse = await postWebhook(tampered, signature);
  assert.strictEqual(tamperedResponse.status, 400);
  assert.deepStrictEqual(tamperedResponse.body, { error: 'invalid_signature' });

  const wrongSecretResponse = await postWebhook(raw, sign(raw, 'whsec_wrong_secret'));
  assert.strictEqual(wrongSecretResponse.status, 400);
  assert.deepStrictEqual(wrongSecretResponse.body, { error: 'invalid_signature' });

  assert.strictEqual(requireRepo().size(), 0);
});

test('subscription created and updated active fixtures persist workspace_id and plan_id', async () => {
  const created = await postSignedFixture('customer.subscription.created.json');
  assert.strictEqual(created.status, 200);
  assert.deepStrictEqual(created.body, { received: true });
  assertBillingRecord('sub_created_contract', {
    workspace_id: 'workspace_created_contract',
    plan_id: 'starter',
    status: 'trialing',
  });

  const updated = await postSignedFixture('customer.subscription.updated.active.json');
  assert.strictEqual(updated.status, 200);
  assert.deepStrictEqual(updated.body, { received: true });
  assertBillingRecord('sub_updated_active_contract', {
    workspace_id: 'workspace_updated_active_contract',
    plan_id: 'pro',
    status: 'active',
  });
});

test('subscription updated past_due and deleted fixtures mutate an existing subscription', async () => {
  assert.strictEqual((await postSignedFixture('checkout.session.completed.json')).status, 200);
  assert.strictEqual((await postSignedFixture('customer.subscription.updated.past_due.json')).status, 200);
  assertBillingRecord('sub_checkout_contract', {
    workspace_id: 'workspace_checkout_contract',
    plan_id: 'pro',
    status: 'past_due',
  });

  assert.strictEqual((await postSignedFixture('customer.subscription.deleted.json')).status, 200);
  assertBillingRecord('sub_checkout_contract', {
    workspace_id: 'workspace_checkout_contract',
    plan_id: 'pro',
    status: 'canceled',
  });
});

test('unsupported invoice.created events are acknowledged without repo writes', async () => {
  const event = {
    id: 'evt_invoice_created_ignored_contract',
    object: 'event',
    type: 'invoice.created',
    data: {
      object: {
        id: 'in_ignored_contract',
        object: 'invoice',
        customer: 'cus_invoice_ignored_contract',
        metadata: {
          workspace_id: 'workspace_invoice_ignored_contract',
          planId: 'pro',
        },
      },
    },
  };
  const raw = rawFromEvent(event);
  const response = await postWebhook(raw, sign(raw));

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(response.body, { received: true });
  assert.strictEqual(requireRepo().size(), 0);
});

test('duplicate event ids are idempotent and do not double-write changed payloads', async () => {
  assert.strictEqual((await postSignedFixture('checkout.session.completed.json')).status, 200);

  const duplicate = fixtureEvent('checkout.session.completed.json');
  duplicate.data.object.metadata.planId = 'business';
  duplicate.data.object.client_reference_id = 'workspace_duplicate_should_not_replace';
  duplicate.data.object.metadata.workspace_id = 'workspace_duplicate_should_not_replace';
  const duplicateRaw = rawFromEvent(duplicate);
  const duplicateResponse = await postWebhook(duplicateRaw, sign(duplicateRaw));

  assert.strictEqual(duplicateResponse.status, 200);
  assert.deepStrictEqual(duplicateResponse.body, { received: true });
  assert.strictEqual(requireRepo().size(), 1);
  assertBillingRecord('sub_checkout_contract', {
    workspace_id: 'workspace_checkout_contract',
    plan_id: 'pro',
    status: 'active',
  });
});

test('resetBillingStateForTests clears repo records and processed event ids', async () => {
  const raw = fixtureRaw('checkout.session.completed.json');
  const signature = sign(raw);

  assert.strictEqual((await postWebhook(raw, signature)).status, 200);
  assert.strictEqual(requireRepo().size(), 1);

  requireRepo().resetBillingStateForTests();
  assert.strictEqual(requireRepo().size(), 0);

  assert.strictEqual((await postWebhook(raw, signature)).status, 200);
  assert.strictEqual(requireRepo().size(), 1);
  assertBillingRecord('sub_checkout_contract', {
    workspace_id: 'workspace_checkout_contract',
    plan_id: 'pro',
    status: 'active',
  });
});
