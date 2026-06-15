'use strict';

const DEFAULT_WEBHOOK_SECRET = 'whsec_test_secret';

function loadWebhookVerifier() {
  return require('../../src/lib/billing/webhook-verify');
}

function constructWebhookEvent(payload, signatureHeader, secret = DEFAULT_WEBHOOK_SECRET) {
  const { verifyPayload } = loadWebhookVerifier();
  return verifyPayload(payload, signatureHeader, secret);
}

function signWebhookPayload(payload, secret = DEFAULT_WEBHOOK_SECRET, timestamp = 1700000000) {
  const { signPayload } = loadWebhookVerifier();
  return signPayload(payload, secret, timestamp);
}

module.exports = {
  DEFAULT_WEBHOOK_SECRET,
  constructWebhookEvent,
  signWebhookPayload,
};
