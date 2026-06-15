'use strict';

const { getBillingPlan, hasPaidFeatureAccess } = require('./plans');

function billingError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function makeBillingService({ stripe, repo } = {}) {
  if (!stripe || typeof stripe.createCheckoutSession !== 'function') {
    throw new Error('stripe.createCheckoutSession is required');
  }

  void repo;

  async function startCheckout({ planId, workspaceId } = {}) {
    if (!planId) {
      throw billingError('invalid_plan', 'planId is required');
    }

    const plan = getBillingPlan(planId);
    if (!plan) {
      throw billingError('unknown_plan', 'Unknown billing plan');
    }

    if (!hasPaidFeatureAccess(plan.id)) {
      throw billingError('not_a_paid_plan', 'Plan is not a paid plan');
    }

    const metadata = {
      planId: plan.id,
    };

    if (workspaceId) {
      metadata.workspace_id = workspaceId;
    }

    const session = await stripe.createCheckoutSession({
      mode: 'subscription',
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      metadata,
      client_reference_id: workspaceId,
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  return { startCheckout };
}

module.exports = { makeBillingService };
