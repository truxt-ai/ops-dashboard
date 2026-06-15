'use strict';

function createFakeStripe(options = {}) {
  const webhookSecret = options.webhookSecret || 'whsec_test_secret';
  const createCheckoutSessionCalls = [];
  const webhookEvents = [];

  return {
    createCheckoutSessionCalls,
    checkoutSessions: createCheckoutSessionCalls,
    webhookEvents,

    async createCheckoutSession(params) {
      createCheckoutSessionCalls.push(params);

      const planId = params && params.metadata && params.metadata.planId;
      return {
        id: `cs_test_${planId}`,
        url: `https://checkout.stripe.test/${planId}`,
      };
    },

    constructWebhookEvent(rawBody, signature, secret = webhookSecret) {
      const { verifyPayload } = require('../../src/lib/billing/webhook-verify');

      webhookEvents.push({
        rawBody,
        signature,
        secret,
        rawBodyIsBuffer: Buffer.isBuffer(rawBody),
      });

      verifyPayload(rawBody, signature, secret);
      return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
    },
  };
}

module.exports = { createFakeStripe };
