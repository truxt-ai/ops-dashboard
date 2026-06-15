'use strict';

const { verifyPayload } = require('./webhook-verify');

const DEFAULT_STRIPE_SECRET_KEY = 'sk_test_dummy';
const DEFAULT_STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_SECRET_KEY = DEFAULT_STRIPE_SECRET_KEY;
const DEFAULT_WEBHOOK_SECRET = DEFAULT_STRIPE_WEBHOOK_SECRET;

function readConfig(options = {}) {
  return {
    secretKey: options.secretKey || process.env.STRIPE_SECRET_KEY || DEFAULT_STRIPE_SECRET_KEY,
    webhookSecret: options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || DEFAULT_STRIPE_WEBHOOK_SECRET,
    currency: options.currency || process.env.BILLING_CURRENCY || process.env.STRIPE_CURRENCY || DEFAULT_CURRENCY,
  };
}

function payloadToString(rawBody) {
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.toString('utf8');
  }

  if (typeof rawBody === 'string') {
    return rawBody;
  }

  return JSON.stringify(rawBody || {});
}

function checkoutReference(params) {
  const metadata = params.metadata || {};
  if (metadata.planId || metadata.plan_id) return metadata.planId || metadata.plan_id;

  const firstLineItem = params.line_items && params.line_items[0];
  if (firstLineItem && typeof firstLineItem.price === 'string') {
    return firstLineItem.price.replace(/^price_/, '');
  }

  return params.client_reference_id || 'workspace';
}

function makeStripeClient(options = {}) {
  const config = readConfig(options);

  async function createCheckoutSession(params) {
    const reference = checkoutReference(params || {});

    return {
      id: `cs_test_${reference}`,
      url: `https://checkout.stripe.test/${encodeURIComponent(reference)}`,
      currency: config.currency,
    };
  }

  function constructWebhookEvent(rawBody, signature, secret) {
    verifyPayload(rawBody, signature, secret || config.webhookSecret);
    return JSON.parse(payloadToString(rawBody));
  }

  return {
    config,
    secretKey: config.secretKey,
    webhookSecret: config.webhookSecret,
    createCheckoutSession,
    constructWebhookEvent,
  };
}

function createStripeClient(options = {}) {
  return makeStripeClient(options);
}

const defaultClient = makeStripeClient();

function constructWebhookEvent(rawBody, signature, secret) {
  return defaultClient.constructWebhookEvent(rawBody, signature, secret);
}

module.exports = {
  makeStripeClient,
  createStripeClient,
  constructWebhookEvent,
  defaultClient,
  DEFAULT_STRIPE_SECRET_KEY,
  DEFAULT_STRIPE_WEBHOOK_SECRET,
  DEFAULT_SECRET_KEY,
  DEFAULT_WEBHOOK_SECRET,
  DEFAULT_CURRENCY,
};
