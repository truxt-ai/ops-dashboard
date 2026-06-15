'use strict';

const PLAN_ORDER = Object.freeze(['free', 'starter', 'pro', 'business']);

const PRICE_ENV_BY_PLAN = Object.freeze({
  starter: 'STRIPE_PRICE_STARTER_MONTHLY',
  pro: 'STRIPE_PRICE_PRO_MONTHLY',
  business: 'STRIPE_PRICE_BUSINESS_MONTHLY',
});

const PLAN_DEFINITIONS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    monthlyLabel: '$0/mo',
    summary: 'Core service health for small demos.',
    features: Object.freeze(['Service metrics', 'Upstream health probe', 'Single workspace']),
  }),
  starter: Object.freeze({
    id: 'starter',
    name: 'Starter',
    monthlyLabel: 'Starter monthly',
    summary: 'Operational visibility for a growing team.',
    features: Object.freeze(['Plan-managed workspace', 'Dashboard health checks', 'Email support']),
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro',
    monthlyLabel: 'Pro monthly',
    summary: 'More room for active service operations.',
    features: Object.freeze(['Everything in Starter', 'Advanced risk summaries', 'Priority support']),
  }),
  business: Object.freeze({
    id: 'business',
    name: 'Business',
    monthlyLabel: 'Business monthly',
    summary: 'A shared workspace plan for larger teams.',
    features: Object.freeze(['Everything in Pro', 'Business workspace controls', 'Dedicated onboarding']),
  }),
});

function normalizePlanId(planId) {
  return String(planId || '').trim().toLowerCase();
}

function cleanConfigValue(value) {
  const stringValue = String(value || '').trim();
  return stringValue || null;
}

function checkoutError(code, statusCode, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function absoluteCheckoutUrl(value, env) {
  const raw = cleanConfigValue(value);
  const configured = raw || '/';

  if (/^https?:\/\//i.test(configured)) {
    return configured;
  }

  const baseUrl = cleanConfigValue(env.APP_BASE_URL) || cleanConfigValue(env.BASE_URL) || 'http://localhost:3000';
  const path = configured.startsWith('/') ? configured : `/${configured}`;
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function getCheckoutUrls(env = process.env) {
  return {
    successUrl: absoluteCheckoutUrl(env.STRIPE_CHECKOUT_SUCCESS_URL || env.STRIPE_SUCCESS_URL || env.CHECKOUT_SUCCESS_URL || '/?checkout=success', env),
    cancelUrl: absoluteCheckoutUrl(env.STRIPE_CHECKOUT_CANCEL_URL || env.STRIPE_CANCEL_URL || env.CHECKOUT_CANCEL_URL || '/?checkout=cancelled', env),
  };
}

function buildPlanCatalog(env = process.env) {
  return PLAN_ORDER.map((id) => {
    const definition = PLAN_DEFINITIONS[id];
    const priceEnv = PRICE_ENV_BY_PLAN[id] || null;
    const priceId = priceEnv ? cleanConfigValue(env[priceEnv]) : null;

    return {
      id,
      name: definition.name,
      monthlyLabel: definition.monthlyLabel,
      summary: definition.summary,
      features: Array.from(definition.features),
      priceEnv,
      priceId,
      billingInterval: 'month',
      checkoutEnabled: Boolean(priceId),
      requiresCheckout: Boolean(priceEnv),
    };
  });
}

function findPlan(planId, env = process.env) {
  const id = normalizePlanId(planId);
  const plan = buildPlanCatalog(env).find((candidate) => candidate.id === id);

  if (!plan) {
    throw checkoutError('invalid_plan', 400, 'Select a valid subscription plan.');
  }

  return plan;
}

function requireCheckoutPlan(planId, env = process.env) {
  const plan = findPlan(planId, env);

  if (!plan.requiresCheckout) {
    throw checkoutError('plan_does_not_require_checkout', 400, 'The free plan does not require checkout.');
  }

  if (!plan.priceId) {
    throw checkoutError('plan_price_not_configured', 500, `Missing Stripe price config: ${plan.priceEnv}.`);
  }

  return plan;
}

module.exports = {
  PLAN_DEFINITIONS,
  PLAN_ORDER,
  PRICE_ENV_BY_PLAN,
  buildPlanCatalog,
  findPlan,
  getCheckoutUrls,
  requireCheckoutPlan,
};
