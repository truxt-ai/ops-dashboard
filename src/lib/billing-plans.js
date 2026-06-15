'use strict';

const BILLING_PLANS = [
  {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    features: ['1 workspace', 'community support'],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceUsd: 29,
    features: ['5 workspaces', 'email support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 99,
    features: ['20 workspaces', 'priority support'],
  },
  {
    id: 'business',
    name: 'Business',
    priceUsd: 299,
    features: ['unlimited workspaces', 'SLA support'],
  },
];

function copyPlan(plan) {
  return {
    ...plan,
    features: [...plan.features],
  };
}

function listBillingPlans() {
  return BILLING_PLANS.map(copyPlan);
}

function getBillingPlan(id) {
  const plan = BILLING_PLANS.find((candidate) => candidate.id === id);
  return plan ? copyPlan(plan) : undefined;
}

function hasPaidFeatureAccess(planId) {
  return ['starter', 'pro', 'business'].includes(planId);
}

module.exports = {
  listBillingPlans,
  getBillingPlan,
  hasPaidFeatureAccess,
};
