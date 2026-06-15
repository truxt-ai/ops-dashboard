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

function subscriptionStatus(input) {
  if (typeof input === 'string') {
    return cleanValue(input);
  }

  if (!input) {
    return null;
  }

  return cleanValue(input.subscriptionStatus || input.status || input.stripeSubscriptionStatus || input.billingStatus);
}

function subscriptionPlan(input) {
  if (typeof input === 'string') {
    return input;
  }

  if (!input) {
    return null;
  }

  return input.plan || input.planId || input.billingPlan || input.subscriptionPlan;
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

  const current = workspaceBillingRecords.get(cleanWorkspaceId) || { workspaceId: cleanWorkspaceId };
  const next = {
    ...current,
    ...fields,
    workspaceId: cleanWorkspaceId,
    updatedAt: new Date(0).toISOString(),
  };

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
  customerWorkspaceIds,
  getCustomerWorkspaceId,
  getBillingForWorkspace: getWorkspaceBilling,
  getWorkspaceBilling,
  hasPaidFeatureAccess,
  hasProcessedStripeEvent,
  listWorkspaceBilling,
  markStripeEventProcessed,
  processedStripeEventIds,
  rememberWorkspaceCustomer,
  resetBillingState,
  stripeId,
  upsertWorkspaceBilling,
  billingRecords: workspaceBillingRecords,
  workspaceBillingRecords,
};
