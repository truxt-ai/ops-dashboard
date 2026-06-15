'use strict';

const DEFAULT_STRIPE_SECRET_KEY = 'sk_test_dummy';
const DEFAULT_STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
const DEFAULT_CURRENCY = 'USD';

function readConfig(options) {
  return {
    secretKey: options.secretKey || process.env.STRIPE_SECRET_KEY || DEFAULT_STRIPE_SECRET_KEY,
    webhookSecret: options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || DEFAULT_STRIPE_WEBHOOK_SECRET,
    currency: options.currency || process.env.BILLING_CURRENCY || process.env.STRIPE_CURRENCY || DEFAULT_CURRENCY,
  };
}

function makeStripeClient(options = {}) {
  const config = readConfig(options);

  async function createCheckoutSession(params) {
    const reference = params.client_reference_id || 'workspace';

    return {
      id: `cs_test_${reference}`,
      url: `https://checkout.stripe.test/session/${encodeURIComponent(reference)}`,
      currency: config.currency,
    };
  }

  return {
    config,
    createCheckoutSession,
  };
}

module.exports = {
  makeStripeClient,
  DEFAULT_STRIPE_SECRET_KEY,
  DEFAULT_STRIPE_WEBHOOK_SECRET,
  DEFAULT_CURRENCY,
};
