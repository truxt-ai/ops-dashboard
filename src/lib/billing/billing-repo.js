'use strict';

const subscriptions = new Map();

function cloneRecord(record) {
  if (!record) return undefined;
  return {
    stripe_subscription_id: record.stripe_subscription_id,
    workspace_id: record.workspace_id,
    plan_id: record.plan_id,
    status: record.status,
  };
}

function normalizeUpsertArgs(subscriptionId, data) {
  if (subscriptionId && typeof subscriptionId === 'object') {
    const record = subscriptionId;
    return {
      subscriptionId: record.stripe_subscription_id || record.id || record.subscription_id,
      data: record,
    };
  }

  return {
    subscriptionId,
    data: data || {},
  };
}

function nextValue(data, existing, key) {
  if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
    return data[key];
  }

  return existing[key];
}

function upsert(subscriptionId, data) {
  const args = normalizeUpsertArgs(subscriptionId, data);
  if (!args.subscriptionId) {
    throw new Error('subscription id is required');
  }

  const existing = subscriptions.get(args.subscriptionId) || {};
  const record = {
    stripe_subscription_id: args.subscriptionId,
    workspace_id: nextValue(args.data, existing, 'workspace_id'),
    plan_id: nextValue(args.data, existing, 'plan_id'),
    status: nextValue(args.data, existing, 'status'),
  };

  subscriptions.set(args.subscriptionId, record);
  return cloneRecord(record);
}

function get(subscriptionId) {
  return cloneRecord(subscriptions.get(subscriptionId));
}

function has(subscriptionId) {
  return subscriptions.has(subscriptionId);
}

function size() {
  return subscriptions.size;
}

function reset() {
  subscriptions.clear();
}

function resetBillingStateForTests() {
  reset();
}

module.exports = {
  upsert,
  get,
  has,
  size,
  reset,
  resetBillingStateForTests,
};
