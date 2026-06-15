'use strict';

const { isPaidPlan, normalizePlanId } = require('./plans');

const PAID_FEATURE_STATUSES = Object.freeze(['active', 'trialing']);
const workspaceBillingRecords = new Map();
const customerWorkspaceIds = new Map();
const processedStripeEventIds = new Set();

function cleanValue(value) {
  const stringValue = String(value || '').trim();
  return stringValue || null;
}

function stripeId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return cleanValue(value);
  }

  return cleanValue(value.id);
}

function nestedBilling(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  return input.billing || input.billingRecord || input.subscription || (input.workspace && (input.workspace.billing || input.workspace.subscription || input.workspace)) || null;
}

function firstValue(input, keys) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const direct = keys.find((key) => cleanValue(input[key]));
  if (direct) {
    return input[direct];
  }

  const nested = nestedBilling(input);
  if (nested && nested !== input) {
    return firstValue(nested, keys);
  }

  return null;
}

function subscriptionStatus(input) {
  if (typeof input === 'string') {
    return cleanValue(input);
  }

  return cleanValue(firstValue(input, [
    'subscriptionStatus',
    'status',
    'stripeSubscriptionStatus',
    'billingStatus',
    'subscription_state',
    'subscription_status',
    'state',
  ]));
}

function subscriptionPlan(input) {
  if (typeof input === 'string') {
    return input;
  }

  return firstValue(input, [
    'plan',
    'planId',
    'billingPlan',
    'subscriptionPlan',
    'billingPlanId',
    'subscriptionPlanId',
    'currentPlan',
    'currentPlanId',
    'pricingPlan',
    'tier',
  ]);
}

function hasPaidFeatureAccess(input, maybeStatus) {
  const planId = normalizePlanId(typeof input === 'string' ? input : subscriptionPlan(input));
  const status = typeof maybeStatus === 'object' && maybeStatus !== null ? subscriptionStatus(maybeStatus) : cleanValue(maybeStatus) || subscriptionStatus(input);

  return isPaidPlan(planId) && PAID_FEATURE_STATUSES.includes(String(status || '').toLowerCase());
}

function rememberWorkspaceCustomer(workspaceId, customerId) {
  const cleanWorkspaceId = cleanValue(workspaceId);
  const cleanCustomerId = cleanValue(customerId);

  if (!cleanWorkspaceId || !cleanCustomerId) {
    return null;
  }

  customerWorkspaceIds.set(cleanCustomerId, cleanWorkspaceId);
  return cleanWorkspaceId;
}

function getCustomerWorkspaceId(customerId) {
  return customerWorkspaceIds.get(cleanValue(customerId)) || null;
}

function upsertWorkspaceBilling(workspaceId, fields) {
  const cleanWorkspaceId = cleanValue(workspaceId);
  if (!cleanWorkspaceId) {
    return null;
  }

  const current = workspaceBillingRecords.get(cleanWorkspaceId) || { workspaceId: cleanWorkspaceId, workspace_id: cleanWorkspaceId };
  const next = {
    ...current,
    ...fields,
    workspaceId: cleanWorkspaceId,
    workspace_id: cleanWorkspaceId,
    updatedAt: new Date(0).toISOString(),
  };

  if (next.planId && !next.plan_id) {
    next.plan_id = next.planId;
  }

  if (next.billingPlan && !next.billing_plan) {
    next.billing_plan = next.billingPlan;
  }

  if (next.stripeCustomerId && !next.stripe_customer_id) {
    next.stripe_customer_id = next.stripeCustomerId;
  }

  if (next.stripeSubscriptionId && !next.stripe_subscription_id) {
    next.stripe_subscription_id = next.stripeSubscriptionId;
  }

  if (next.subscriptionStatus && !next.subscription_status) {
    next.subscription_status = next.subscriptionStatus;
  }

  if (next.stripeCustomerId) {
    rememberWorkspaceCustomer(cleanWorkspaceId, next.stripeCustomerId);
  }

  workspaceBillingRecords.set(cleanWorkspaceId, next);
  return { ...next };
}

function getWorkspaceBilling(workspaceId) {
  const record = workspaceBillingRecords.get(cleanValue(workspaceId));
  return record ? { ...record } : null;
}

function listWorkspaceBilling() {
  return Array.from(workspaceBillingRecords.values()).map((record) => ({ ...record }));
}

function hasProcessedStripeEvent(eventId) {
  return processedStripeEventIds.has(cleanValue(eventId));
}

function markStripeEventProcessed(eventId) {
  const cleanEventId = cleanValue(eventId);
  if (cleanEventId) {
    processedStripeEventIds.add(cleanEventId);
  }
}

function resetBillingState() {
  workspaceBillingRecords.clear();
  customerWorkspaceIds.clear();
  processedStripeEventIds.clear();
}

module.exports = {
  ACTIVE_SUBSCRIPTION_STATUSES: PAID_FEATURE_STATUSES,
  PAID_FEATURE_STATUSES,
  billingRecords: workspaceBillingRecords,
  customerWorkspaceIds,
  getBillingForWorkspace: getWorkspaceBilling,
  getCustomerWorkspaceId,
  getWorkspaceBilling,
  hasPaidFeatureAccess,
  hasProcessedStripeEvent,
  listWorkspaceBilling,
  markStripeEventProcessed,
  processedStripeEventIds,
  rememberWorkspaceCustomer,
  resetBillingState,
  resetBillingStateForTests: resetBillingState,
  stripeId,
  upsertWorkspaceBilling,
  workspaceBillingRecords,
};
