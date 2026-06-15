'use strict';

const { getCheckoutUrls, requireCheckoutPlan } = require('./billing-plans');

const workspaceCustomerIds = new Map();

function checkoutError(code, statusCode, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function cleanValue(value) {
  const stringValue = String(value || '').trim();
  return stringValue || null;
}

function getCachedCustomerId(customerStore, workspaceId) {
  if (!customerStore || typeof customerStore.get !== 'function') {
    return null;
  }

  return cleanValue(customerStore.get(workspaceId));
}

function cacheCustomerId(customerStore, workspaceId, customerId) {
  if (customerStore && typeof customerStore.set === 'function' && customerId) {
    customerStore.set(workspaceId, customerId);
  }
}

async function getOrCreateWorkspaceCustomer(options) {
  const {
    stripe,
    workspaceId,
    workspaceName,
    billingEmail,
    existingCustomerId,
    customerStore = workspaceCustomerIds,
  } = options;

  const reusableCustomerId = cleanValue(existingCustomerId) || getCachedCustomerId(customerStore, workspaceId);
  if (reusableCustomerId) {
    cacheCustomerId(customerStore, workspaceId, reusableCustomerId);
    return reusableCustomerId;
  }

  if (!stripe || !stripe.customers || typeof stripe.customers.create !== 'function') {
    throw checkoutError('stripe_customers_unavailable', 500, 'Stripe customers API is unavailable.');
  }

  const customerParams = {
    metadata: { workspaceId },
  };

  if (cleanValue(workspaceName)) {
    customerParams.name = cleanValue(workspaceName);
  }

  if (cleanValue(billingEmail)) {
    customerParams.email = cleanValue(billingEmail);
  }

  const customer = await stripe.customers.create(customerParams);
  const customerId = cleanValue(customer && customer.id);

  if (!customerId) {
    throw checkoutError('stripe_customer_missing_id', 502, 'Stripe did not return a customer id.');
  }

  cacheCustomerId(customerStore, workspaceId, customerId);
  return customerId;
}

async function createWorkspaceCheckoutSession(options) {
  const {
    stripe,
    getStripe,
    env = process.env,
    planId,
    workspaceId,
    workspaceName,
    billingEmail,
    existingCustomerId,
    customerStore = workspaceCustomerIds,
  } = options;

  const cleanWorkspaceId = cleanValue(workspaceId);
  if (!cleanWorkspaceId) {
    throw checkoutError('workspace_required', 400, 'A workspace id is required for checkout.');
  }

  const plan = requireCheckoutPlan(planId, env);
  const stripeClient = stripe || (typeof getStripe === 'function' ? getStripe() : null);

  if (!stripeClient || !stripeClient.checkout || !stripeClient.checkout.sessions || typeof stripeClient.checkout.sessions.create !== 'function') {
    throw checkoutError('stripe_checkout_unavailable', 500, 'Stripe checkout API is unavailable.');
  }
  const customerId = await getOrCreateWorkspaceCustomer({
    stripe: stripeClient,
    workspaceId: cleanWorkspaceId,
    workspaceName,
    billingEmail,
    existingCustomerId,
    customerStore,
  });
  const checkoutUrls = getCheckoutUrls(env);
  const metadata = {
    workspaceId: cleanWorkspaceId,
    plan: plan.id,
  };

  const session = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    success_url: checkoutUrls.successUrl,
    cancel_url: checkoutUrls.cancelUrl,
    metadata,
    subscription_data: { metadata },
  });

  return {
    sessionId: session && session.id,
    url: session && session.url,
  };
}

function resetWorkspaceCustomers() {
  workspaceCustomerIds.clear();
}

module.exports = {
  createWorkspaceCheckoutSession,
  getOrCreateWorkspaceCustomer,
  resetWorkspaceCustomers,
  workspaceCustomerIds,
};
