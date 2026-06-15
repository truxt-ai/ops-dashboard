'use strict';

const PLAN_ORDER = Object.freeze(['free', 'starter', 'pro', 'business']);

const PRICE_ENV_BY_PLAN = Object.freeze({
  starter: 'STRIPE_PRICE_STARTER_MONTHLY',
  pro: 'STRIPE_PRICE_PRO_MONTHLY',
  business: 'STRIPE_PRICE_BUSINESS_MONTHLY',
});

const PRICE_ENV_ALIASES_BY_PLAN = Object.freeze({
  starter: Object.freeze(['STRIPE_PRICE_STARTER_MONTHLY', 'STRIPE_STARTER_PRICE_ID', 'STRIPE_PRICE_STARTER', 'STARTER_PRICE_ID']),
  pro: Object.freeze(['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRO_PRICE_ID', 'STRIPE_PRICE_PRO', 'PRO_PRICE_ID']),
  business: Object.freeze(['STRIPE_PRICE_BUSINESS_MONTHLY', 'STRIPE_BUSINESS_PRICE_ID', 'STRIPE_PRICE_BUSINESS', 'BUSINESS_PRICE_ID']),
});

const PLAN_COPY = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    displayName: 'Free',
    monthlyLabel: '$0/mo',
    summary: 'Core service health for small demos.',
    features: Object.freeze(['Service metrics', 'Upstream health probe', 'Single workspace']),
  }),
  starter: Object.freeze({
    id: 'starter',
    name: 'Starter',
    displayName: 'Starter',
    monthlyLabel: 'Starter monthly',
    summary: 'Operational visibility for a growing team.',
    features: Object.freeze(['Plan-managed workspace', 'Dashboard health checks', 'Email support']),
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro',
    displayName: 'Pro',
    monthlyLabel: 'Pro monthly',
    summary: 'More room for active service operations.',
    features: Object.freeze(['Everything in Starter', 'Advanced risk summaries', 'Priority support']),
  }),
  business: Object.freeze({
    id: 'business',
    name: 'Business',
    displayName: 'Business',
    monthlyLabel: 'Business monthly',
    summary: 'A shared workspace plan for larger teams.',
    features: Object.freeze(['Everything in Pro', 'Business workspace controls', 'Dedicated onboarding']),
  }),
});

function normalizePlanId(planId) {
  if (planId && typeof planId === 'object') {
    return normalizePlanId(planId.id || planId.key || planId.name || planId.plan || planId.planId);
  }

  return String(planId || '').trim().toLowerCase();
}

function cleanConfigValue(value) {
  const stringValue = String(value || '').trim();
  return stringValue || null;
}

function billingError(code, statusCode, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function findStripePriceId(planId, env = process.env) {
  const aliases = PRICE_ENV_ALIASES_BY_PLAN[normalizePlanId(planId)] || [];
  const matchingEnv = aliases.find((name) => cleanConfigValue(env[name]));
  return matchingEnv ? cleanConfigValue(env[matchingEnv]) : null;
}

function requireStripePrice(planId, env = process.env) {
  const id = normalizePlanId(planId);
  const priceEnv = PRICE_ENV_BY_PLAN[id];
  const priceId = findStripePriceId(id, env);

  if (!priceEnv) {
    return null;
  }

  if (!priceId) {
    throw billingError('plan_price_not_configured', 500, `Missing Stripe price config: ${priceEnv}.`);
  }

  return priceId;
}

function buildPlan(planId, env = process.env, options = {}) {
  const id = normalizePlanId(planId);
  const definition = PLAN_COPY[id];

  if (!definition) {
    throw billingError('invalid_plan', 404, 'Select a valid subscription plan.');
  }

  const priceEnv = PRICE_ENV_BY_PLAN[id] || null;
  const isPaid = Boolean(priceEnv);
  const priceId = isPaid && options.requireConfiguredPrices ? requireStripePrice(id, env) : findStripePriceId(id, env);

  return {
    id,
    key: id,
    name: definition.name,
    displayName: definition.displayName,
    monthlyLabel: definition.monthlyLabel,
    summary: definition.summary,
    features: Array.from(definition.features),
    priceEnv,
    stripePriceEnv: priceEnv,
    priceId,
    stripePriceId: priceId,
    billingInterval: 'month',
    interval: 'month',
    isPaid,
    paid: isPaid,
    requiresCheckout: isPaid,
    checkoutEnabled: !isPaid || Boolean(priceId),
  };
}

function buildPlanCatalog(env = process.env, options = {}) {
  return PLAN_ORDER.map((id) => buildPlan(id, env, options));
}

function listBillingPlans(env = process.env) {
  return buildPlanCatalog(env, { requireConfiguredPrices: true });
}

function getBillingPlans(env = process.env) {
  return listBillingPlans(env);
}

function findPlan(planId, env = process.env, options = {}) {
  return buildPlan(planId, env, options);
}

function getBillingPlan(planId, env = process.env) {
  return buildPlan(planId, env, { requireConfiguredPrices: true });
}

function isPaidPlan(planId) {
  return Boolean(PRICE_ENV_BY_PLAN[normalizePlanId(planId)]);
}

function requireCheckoutPlan(planId, env = process.env) {
  const plan = buildPlan(planId, env, { requireConfiguredPrices: true });

  if (!plan.isPaid) {
    throw billingError('plan_does_not_require_checkout', 400, 'The free plan does not require checkout.');
  }

  return plan;
}

function planIdForPriceId(priceId, env = process.env) {
  const cleanPriceId = cleanConfigValue(priceId);
  if (!cleanPriceId) {
    return null;
  }

  const match = PLAN_ORDER.find((id) => findStripePriceId(id, env) === cleanPriceId);
  return match || null;
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

const exported = {
  PLAN_COPY,
  PLAN_DEFINITIONS: PLAN_COPY,
  PLAN_ORDER,
  PRICE_ENV_ALIASES_BY_PLAN,
  PRICE_ENV_BY_PLAN,
  STRIPE_PRICE_ENV_BY_PLAN: PRICE_ENV_BY_PLAN,
  buildPlan,
  buildPlanCatalog,
  findStripePriceId,
  findPlan,
  getBillingPlan,
  getBillingPlans,
  getPlans: getBillingPlans,
  getCheckoutUrls,
  isPaidPlan,
  listBillingPlans,
  normalizePlanId,
  planIdForPriceId,
  requireCheckoutPlan,
  requireStripePrice,
};

Object.defineProperties(exported, {
  BILLING_PLANS: {
    enumerable: true,
    get() {
      return getBillingPlans();
    },
  },
  PLANS: {
    enumerable: true,
    get() {
      return getBillingPlans();
    },
  },
  plans: {
    enumerable: true,
    get() {
      return getBillingPlans();
    },
  },
});

module.exports = exported;
