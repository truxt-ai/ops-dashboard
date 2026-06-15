'use strict';

const PLAN_DEFINITIONS = [
  {
    id: 'free',
    name: 'Free',
    priceUsd: 0,
    stripePriceId: 'price_free',
    features: ['Service health overview', 'Basic uptime reporting'],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceUsd: 29,
    stripePriceId: 'price_starter',
    features: ['Team dashboard', 'Billing insights', 'Email support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 99,
    stripePriceId: 'price_pro',
    features: ['Advanced analytics', 'Priority support', 'Audit exports'],
  },
  {
    id: 'business',
    name: 'Business',
    priceUsd: 299,
    stripePriceId: 'price_business',
    features: ['SAML SSO', 'Dedicated success manager', 'Custom reporting'],
  },
];

const PAID_PLAN_IDS = new Set(['starter', 'pro', 'business']);

function copyPlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    priceUsd: plan.priceUsd,
    stripePriceId: plan.stripePriceId,
    features: plan.features.slice(),
  };
}

function listBillingPlans() {
  return PLAN_DEFINITIONS.map(copyPlan);
}

function getBillingPlan(id) {
  const plan = PLAN_DEFINITIONS.find((candidate) => candidate.id === id);
  return plan ? copyPlan(plan) : undefined;
}

function hasPaidFeatureAccess(planId) {
  return PAID_PLAN_IDS.has(planId);
}

module.exports = {
  listBillingPlans,
  getBillingPlan,
  hasPaidFeatureAccess,
};
