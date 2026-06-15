'use strict';

function createFakeStripe() {
  const createCheckoutSessionCalls = [];

  return {
    createCheckoutSessionCalls,
    async createCheckoutSession(params) {
      createCheckoutSessionCalls.push(params);

      const planId = params && params.metadata && params.metadata.planId;
      return {
        id: `cs_test_${planId}`,
        url: `https://checkout.stripe.test/${planId}`,
      };
    },
  };
}

module.exports = { createFakeStripe };
