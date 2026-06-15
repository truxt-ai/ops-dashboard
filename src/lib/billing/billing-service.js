'use strict';

const billingRepo = require('./billing-repo');
const { getBillingPlan, hasPaidFeatureAccess } = require('./plans');
const { nextSubscriptionState } = require('./subscription-state');

const processedEventIds = new Set();

function billingError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function requireCheckoutStripe(stripe) {
  if (!stripe || typeof stripe.createCheckoutSession !== 'function') {
    throw new Error('stripe.createCheckoutSession is required');
  }
}

function makeBillingService({ stripe, repo } = {}) {
  const serviceRepo = repo || billingRepo;

  async function startCheckout({ planId, workspaceId } = {}) {
    requireCheckoutStripe(stripe);

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

  function handleWebhookEvent(event) {
    return handleBillingEvent(event, serviceRepo);
  }

  return {
    startCheckout,
    handleWebhookEvent,
    applyBillingEvent: handleWebhookEvent,
    handleBillingEvent: handleWebhookEvent,
  };
}

function metadataFrom(object) {
  return object && object.metadata ? object.metadata : {};
}

function subscriptionIdFrom(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id || value.stripe_subscription_id || value.subscription_id || null;
}

function planIdFrom(object) {
  const metadata = metadataFrom(object);
  return metadata.planId || metadata.plan_id;
}

function workspaceIdFrom(object) {
  const metadata = metadataFrom(object);
  return object.client_reference_id || metadata.workspace_id;
}

function persistedFieldsFrom(object) {
  return {
    workspace_id: workspaceIdFrom(object),
    plan_id: planIdFrom(object),
  };
}

function currentStatus(repo, subscriptionId) {
  const current = repo.get(subscriptionId);
  return current && current.status ? current.status : 'incomplete';
}

function handleCheckoutCompleted(session, repo) {
  const subscriptionId = subscriptionIdFrom(session.subscription);
  if (!subscriptionId) {
    return { handled: false, reason: 'missing-subscription' };
  }

  repo.upsert(subscriptionId, {
    workspace_id: workspaceIdFrom(session),
    plan_id: planIdFrom(session),
    status: 'active',
  });

  return { handled: true, reason: 'checkout.session.completed' };
}

function handleSubscriptionChanged(subscription, repo) {
  const subscriptionId = subscriptionIdFrom(subscription);
  if (!subscriptionId || !subscription.status) {
    return { handled: false, reason: 'missing-subscription' };
  }

  const transition = nextSubscriptionState(
    currentStatus(repo, subscriptionId),
    subscription.status
  );

  if (!transition.changed) {
    return { handled: true, transition };
  }

  repo.upsert(subscriptionId, {
    ...persistedFieldsFrom(subscription),
    status: transition.state,
  });

  return { handled: true, transition };
}

function handleSubscriptionDeleted(subscription, repo) {
  const subscriptionId = subscriptionIdFrom(subscription);
  if (!subscriptionId) {
    return { handled: false, reason: 'missing-subscription' };
  }

  const transition = nextSubscriptionState(currentStatus(repo, subscriptionId), 'canceled');

  if (!transition.changed) {
    return { handled: true, transition };
  }

  repo.upsert(subscriptionId, {
    ...persistedFieldsFrom(subscription),
    status: transition.state,
  });

  return { handled: true, transition };
}

function handleBillingEvent(event, repo) {
  const targetRepo = repo || billingRepo;

  if (!event || !event.type) {
    return { handled: false, reason: 'missing-event' };
  }

  if (event.id && processedEventIds.has(event.id)) {
    return { handled: false, deduped: true };
  }

  const object = event.data && event.data.object ? event.data.object : {};
  let result;

  switch (event.type) {
    case 'checkout.session.completed':
      result = handleCheckoutCompleted(object, targetRepo);
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      result = handleSubscriptionChanged(object, targetRepo);
      break;
    case 'customer.subscription.deleted':
      result = handleSubscriptionDeleted(object, targetRepo);
      break;
    default:
      result = { handled: false, reason: 'unsupported-event' };
      break;
  }

  if (event.id) {
    processedEventIds.add(event.id);
  }

  return result;
}

function resetBillingStateForTests() {
  processedEventIds.clear();
  billingRepo.reset();
}

module.exports = {
  makeBillingService,
  handleBillingEvent,
  resetBillingStateForTests,
};
