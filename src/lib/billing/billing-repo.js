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
      subscriptionId: record.stripe_subscription_id || record.id || record.subscription_id || record.subscriptionId,
      data: record,
    };
  }

  return {
    subscriptionId,
    data: data || {},
  };
}

function nextValue(data, existing, key) {
  const aliases = {
    workspace_id: ['workspaceId'],
    plan_id: ['planId'],
  };

  for (const candidate of [key].concat(aliases[key] || [])) {
    if (Object.prototype.hasOwnProperty.call(data, candidate) && data[candidate] !== undefined) return data[candidate];
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

function findBySubscriptionId(subscriptionId) {
  return get(subscriptionId);
}

function list() {
  return Array.from(subscriptions.values()).map(cloneRecord);
}

function all() {
  return list();
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

function resetTestState() {
  reset();
}

module.exports = {
  upsert,
  get,
  findBySubscriptionId,
  getBySubscriptionId: findBySubscriptionId,
  list,
  all,
  has,
  size,
  reset,
  resetBillingStateForTests,
  resetTestState,
};
