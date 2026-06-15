'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const {
  DEFAULT_WEBHOOK_SECRET,
  constructWebhookEvent,
  signWebhookPayload,
} = require('./helpers/fake-stripe');

const fixtureDir = path.join(__dirname, 'fixtures', 'billing');

function loadBillingRepo() {
  try {
    return require('../src/lib/billing/billing-repo');
  } catch (err) {
    assert.fail(`expected src/lib/billing/billing-repo.js to export the in-memory billing repo API: ${err.message}`);
  }
}

function loadBillingService() {
  try {
    return require('../src/lib/billing/billing-service');
  } catch (err) {
    assert.fail(`expected src/lib/billing/billing-service.js to export makeBillingService with handleEvent: ${err.message}`);
  }
}

function loadServerApp() {
  try {
    return require('../src/server').app;
  } catch (err) {
    assert.fail(`expected src/server.js to export an Express app with POST /api/billing/webhook: ${err.message}`);
  }
}

function fixtureBuffer(name) {
  return fs.readFileSync(path.join(fixtureDir, name));
}

function fixtureEvent(name) {
  return JSON.parse(fixtureBuffer(name).toString('utf8'));
}

function resetBillingState() {
  const repo = loadBillingRepo();
  assert.strictEqual(
    typeof repo.resetBillingStateForTests,
    'function',
    'billing repo must export resetBillingStateForTests for isolated integration tests',
  );
  repo.resetBillingStateForTests();
  return repo;
}

function makeService(repo = resetBillingState()) {
  const { makeBillingService } = loadBillingService();
  const service = makeBillingService({ repo });
  assert.strictEqual(typeof service.handleEvent, 'function', 'billing service must expose handleEvent(event)');
  return service;
}

function assertRecord(repo, subscriptionId, expected) {
  const record = repo.get(subscriptionId);
  assert.deepStrictEqual(
    record,
    expected,
    `subscription ${subscriptionId} should be persisted with literal workspace_id, plan_id, and status keys`,
  );
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function postWebhook(server, body, signatureHeader) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/billing/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signatureHeader,
    },
    body,
  });
  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch (_err) {
    json = null;
  }

  return { response, text, json };
}


test('fake Stripe helper accepts a valid raw Buffer signature and rejects tampered bodies and wrong secrets', () => {
  const body = fixtureBuffer('customer.subscription.created.json');
  const signatureHeader = signWebhookPayload(body, DEFAULT_WEBHOOK_SECRET, 1700000000);

  assert.match(signatureHeader, /^t=1700000000,v1=[a-f0-9]{64}$/);
  assert.strictEqual(
    constructWebhookEvent(body, signatureHeader, DEFAULT_WEBHOOK_SECRET).type,
    'customer.subscription.created',
  );
  assert.throws(
    () => constructWebhookEvent(Buffer.concat([body, Buffer.from('\n')]), signatureHeader, DEFAULT_WEBHOOK_SECRET),
    /signature|tamper|invalid/i,
  );
  assert.throws(
    () => constructWebhookEvent(body, signatureHeader, 'whsec_wrong_secret'),
    /signature|secret|invalid/i,
  );
});

test('billing service persists checkout.session.completed workspace and plan data by subscription id', () => {
  const repo = resetBillingState();
  const service = makeService(repo);

  service.handleEvent(fixtureEvent('checkout.session.completed.json'));

  assertRecord(repo, 'sub_checkout_pro', {
    workspace_id: 'ws_checkout_alpha',
    plan_id: 'pro',
    status: 'active',
  });
});

test('billing service persists subscription updates and keeps event.id idempotency across retries', () => {
  const repo = resetBillingState();
  const service = makeService(repo);
  const activeEvent = fixtureEvent('customer.subscription.updated.active.json');
  const duplicateWithDifferentStatus = JSON.parse(JSON.stringify(activeEvent));
  duplicateWithDifferentStatus.data.object.status = 'past_due';

  service.handleEvent(activeEvent);
  service.handleEvent(duplicateWithDifferentStatus);

  assertRecord(repo, 'sub_update_pro', {
    workspace_id: 'ws_update_alpha',
    plan_id: 'pro',
    status: 'active',
  });
  assert.strictEqual(repo.size(), 1, 'duplicate event.id must not create or mutate another billing record');
});

test('billing service records past_due and deleted subscription transitions', () => {
  const repo = resetBillingState();
  const service = makeService(repo);

  service.handleEvent(fixtureEvent('customer.subscription.updated.past_due.json'));
  service.handleEvent(fixtureEvent('customer.subscription.deleted.json'));

  assertRecord(repo, 'sub_update_pro', {
    workspace_id: 'ws_update_alpha',
    plan_id: 'pro',
    status: 'past_due',
  });
  assertRecord(repo, 'sub_deleted_pro', {
    workspace_id: 'ws_deleted_alpha',
    plan_id: 'pro',
    status: 'canceled',
  });
});

test('billing service treats unsupported Stripe events as a no-op', () => {
  const repo = resetBillingState();
  const service = makeService(repo);

  service.handleEvent({
    id: 'evt_invoice_created_ignored',
    type: 'invoice.created',
    data: {
      object: {
        id: 'in_ignored',
        subscription: 'sub_ignored',
        metadata: {
          workspace_id: 'ws_ignored',
          plan_id: 'pro',
        },
      },
    },
  });

  assert.strictEqual(repo.size(), 0);
  assert.strictEqual(repo.has('sub_ignored'), false);
});

test('resetBillingStateForTests clears persisted records and processed webhook ids', () => {
  const repo = resetBillingState();
  makeService(repo).handleEvent(fixtureEvent('customer.subscription.created.json'));

  assert.strictEqual(repo.size(), 1);
  repo.resetBillingStateForTests();

  assert.strictEqual(repo.size(), 0);
  assert.strictEqual(repo.has('sub_created_pro'), false);

  makeService(repo).handleEvent(fixtureEvent('customer.subscription.created.json'));
  assert.strictEqual(repo.size(), 1, 'reset must also clear processed event.id history for isolated tests');
});

test('POST /api/billing/webhook accepts a signed raw JSON Buffer and returns the success contract', async () => {
  const repo = resetBillingState();
  const body = fixtureBuffer('customer.subscription.updated.active.json');
  const signatureHeader = signWebhookPayload(body);
  const server = await listen(loadServerApp());

  try {
    const { response, json, text } = await postWebhook(server, body, signatureHeader);

    assert.strictEqual(response.status, 200, text);
    assert.deepStrictEqual(json, { received: true });
    assertRecord(repo, 'sub_update_pro', {
      workspace_id: 'ws_update_alpha',
      plan_id: 'pro',
      status: 'active',
    });
  } finally {
    await close(server);
  }
});

test('POST /api/billing/webhook rejects tampered bodies and wrong webhook secrets without persisting state', async () => {
  const repo = resetBillingState();
  const body = fixtureBuffer('customer.subscription.updated.active.json');
  const goodSignature = signWebhookPayload(body);
  const wrongSecretSignature = signWebhookPayload(body, 'whsec_wrong_secret');
  const server = await listen(loadServerApp());

  try {
    const tampered = await postWebhook(server, Buffer.concat([body, Buffer.from('\n')]), goodSignature);
    const wrongSecret = await postWebhook(server, body, wrongSecretSignature);

    assert.strictEqual(tampered.response.status, 400, tampered.text);
    assert.match(tampered.text, /signature|invalid/i);
    assert.strictEqual(wrongSecret.response.status, 400, wrongSecret.text);
    assert.match(wrongSecret.text, /signature|invalid/i);
    assert.strictEqual(repo.size(), 0);
  } finally {
    await close(server);
  }
});
