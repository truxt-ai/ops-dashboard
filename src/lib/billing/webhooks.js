'use strict';

const { normalizePlanId, planIdForPriceId } = require('./plans');
const {
  getCustomerWorkspaceId,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  rememberWorkspaceCustomer,
  stripeId,
  upsertWorkspaceBilling,
  getWorkspaceBilling,
  resetBillingState,
} = require('./subscriptions');

function cleanValue(value) {
  const stringValue = String(value || '').trim();
  return stringValue || null;
}

function metadataValue(metadata, key) {
  return metadata && cleanValue(metadata[key]);
}

function subscriptionPriceId(subscription) {
  const firstItem = subscription && subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data[0] : null;
  const price = firstItem && firstItem.price;

  if (!price) {
    return null;
  }

  return cleanValue(price.id);
}

function planFromObject(object, env) {
  const metadata = object && object.metadata;
  return (
    normalizePlanId(metadataValue(metadata, 'plan') || metadataValue(metadata, 'planId') || metadataValue(metadata, 'billingPlan')) ||
    planIdForPriceId(subscriptionPriceId(object), env)
  );
}

function recordCheckoutSessionCompleted(session, env = process.env) {
  const metadata = session && session.metadata;
  const workspaceId = metadataValue(metadata, 'workspaceId') || metadataValue(metadata, 'workspace_id') || cleanValue(session && session.client_reference_id);

  if (!workspaceId) {
    return null;
  }

  const stripeCustomerId = stripeId(session.customer);
  const stripeSubscriptionId = stripeId(session.subscription);
  const plan = planFromObject(session, env);

  if (stripeCustomerId) {
    rememberWorkspaceCustomer(workspaceId, stripeCustomerId);
  }

  return upsertWorkspaceBilling(workspaceId, {
    plan,
    planId: plan,
    billingPlan: plan,
    stripeCustomerId,
    stripeSubscriptionId,
    subscriptionStatus: cleanValue(session.subscription_status) || 'active',
    checkoutSessionId: cleanValue(session.id),
  });
}

function recordSubscriptionEvent(subscription, env = process.env) {
  const metadata = subscription && subscription.metadata;
  const stripeCustomerId = stripeId(subscription && subscription.customer);
  const workspaceId = metadataValue(metadata, 'workspaceId') || metadataValue(metadata, 'workspace_id') || getCustomerWorkspaceId(stripeCustomerId);

  if (!workspaceId) {
    return null;
  }

  if (stripeCustomerId) {
    rememberWorkspaceCustomer(workspaceId, stripeCustomerId);
  }

  const plan = planFromObject(subscription, env);

  return upsertWorkspaceBilling(workspaceId, {
    plan,
    planId: plan,
    billingPlan: plan,
    stripeCustomerId,
    stripeSubscriptionId: stripeId(subscription),
    subscriptionStatus: cleanValue(subscription && subscription.status),
  });
}

function handleStripeWebhookEvent(event, env = process.env) {
  if (!event || !cleanValue(event.type)) {
    return { handled: false, reason: 'missing_event_type' };
  }

  if (event.id && hasProcessedStripeEvent(event.id)) {
    return { handled: true, duplicate: true };
  }

  let record = null;

  if (event.type === 'checkout.session.completed') {
    record = recordCheckoutSessionCompleted(event.data && event.data.object, env);
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    record = recordSubscriptionEvent(event.data && event.data.object, env);
  }

  if (event.id) {
    markStripeEventProcessed(event.id);
  }

  return {
    handled: Boolean(record),
    record,
    type: event.type,
  };
}

module.exports = {
  getWorkspaceBilling,
  handleStripeWebhookEvent,
  recordCheckoutSessionCompleted,
  recordSubscriptionEvent,
  resetBillingState,
};
