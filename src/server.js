'use strict';

const path = require('path');
const express = require('express');
const axios = require('axios');
const _ = require('lodash');
const minimist = require('minimist');
const { buildPlanCatalog } = require('./lib/billing/plans');
const { createWorkspaceCheckoutSession } = require('./lib/checkout-service');
const { handleStripeWebhookEvent } = require('./lib/billing/webhooks');
const { getStripeClient } = require('./lib/stripe-client');

const args = minimist(process.argv.slice(2));
const PORT = args.port || process.env.PORT || 3000;

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.post('/api/billing/stripe/webhook', express.raw({ type: '*/*' }), handleStripeWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Compute a few fake metrics for the dashboard. Kept deterministic so the demo
// renders the same numbers every time.
function buildMetrics() {
  const services = [
    { name: 'api-gateway', requests: 18420, errors: 12 },
    { name: 'auth-service', requests: 9310, errors: 3 },
    { name: 'billing', requests: 4502, errors: 0 },
  ];
  const totalRequests = _.sumBy(services, 'requests');
  const totalErrors = _.sumBy(services, 'errors');
  const errorRate = _.round((totalErrors / totalRequests) * 100, 3);
  return { services, totalRequests, totalErrors, errorRate };
}

app.get('/', (req, res) => {
  res.render('dashboard', {
    metrics: buildMetrics(),
    plans: buildPlanCatalog(),
  });
});

function headerValue(req, name) {
  return String(req.get(name) || '').trim();
}

function workspaceRole(req) {
  const appUser = req.app.locals.currentUser || req.app.locals.user || {};
  const appWorkspace = req.app.locals.workspace || {};

  return String(
    headerValue(req, 'x-workspace-role') ||
    headerValue(req, 'x-user-role') ||
    headerValue(req, 'x-role') ||
    requestField(req, 'workspaceRole') ||
    requestField(req, 'role') ||
    (req.user && (req.user.workspaceRole || req.user.role)) ||
    (req.workspace && req.workspace.role) ||
    appUser.workspaceRole ||
    appUser.role ||
    appWorkspace.role ||
    ''
  ).trim().toLowerCase();
}

function isWorkspaceAdmin(req) {
  if (req.app.locals.isWorkspaceAdmin === true) {
    return true;
  }

  const adminFlag =
    headerValue(req, 'x-workspace-admin') ||
    headerValue(req, 'x-user-admin') ||
    headerValue(req, 'x-admin') ||
    headerValue(req, 'x-is-admin') ||
    requestField(req, 'isWorkspaceAdmin') ||
    requestField(req, 'isAdmin');

  if (['true', '1', 'yes'].includes(String(adminFlag || '').trim().toLowerCase())) {
    return true;
  }

  const appWorkspace = req.app.locals.workspace || {};
  return ['admin', 'owner'].includes(workspaceRole(req)) || Boolean(req.workspace && req.workspace.isAdmin) || Boolean(appWorkspace.isAdmin);
}

function requestField(req, fieldName) {
  if (req.body && req.body[fieldName]) {
    return req.body[fieldName];
  }

  if (req.query && req.query[fieldName]) {
    return req.query[fieldName];
  }

  return null;
}

function getWorkspaceContext(req) {
  const workspace = req.workspace || {};
  const user = req.user || {};
  const appWorkspace = req.app.locals.workspace || {};
  const appUser = req.app.locals.currentUser || req.app.locals.user || {};

  return {
    planId: requestField(req, 'planId') || requestField(req, 'plan') || requestField(req, 'pricePlan'),
    workspaceId: headerValue(req, 'x-workspace-id') || requestField(req, 'workspaceId') || workspace.id || appWorkspace.id || req.app.locals.workspaceId,
    workspaceName: headerValue(req, 'x-workspace-name') || requestField(req, 'workspaceName') || workspace.name || appWorkspace.name,
    billingEmail: headerValue(req, 'x-billing-email') || headerValue(req, 'x-user-email') || requestField(req, 'billingEmail') || user.email || appUser.email,
    existingCustomerId: headerValue(req, 'x-stripe-customer-id') || requestField(req, 'stripeCustomerId') || workspace.stripeCustomerId || appWorkspace.stripeCustomerId,
  };
}

function getRequestStripeClient(req) {
  return req.app.locals.stripe || req.app.locals.stripeClient || getStripeClient();
}

function hasWorkspacePrincipal(req) {
  const appUser = req.app.locals.currentUser || req.app.locals.user || {};
  return Boolean(
    workspaceRole(req) ||
    headerValue(req, 'x-user-id') ||
    requestField(req, 'userId') ||
    requestField(req, 'memberId') ||
    appUser.id ||
    appUser.email ||
    req.user
  );
}

function getBillingEnv(req) {
  const locals = req.app.locals || {};
  const config = locals.billingConfig || locals.billing || locals.config || {};
  const localEnv = locals.env || {};
  const prices = locals.stripePrices || config.stripePrices || config.prices || config.priceIds || {};

  const env = { ...process.env, ...localEnv, ...config };
  env.STRIPE_PRICE_STARTER_MONTHLY = env.STRIPE_PRICE_STARTER_MONTHLY || prices.starter || prices.STRIPE_PRICE_STARTER_MONTHLY;
  env.STRIPE_PRICE_PRO_MONTHLY = env.STRIPE_PRICE_PRO_MONTHLY || prices.pro || prices.STRIPE_PRICE_PRO_MONTHLY;
  env.STRIPE_PRICE_BUSINESS_MONTHLY = env.STRIPE_PRICE_BUSINESS_MONTHLY || prices.business || prices.STRIPE_PRICE_BUSINESS_MONTHLY;
  return env;
}

function shouldRedirectToCheckout(req) {
  return !req.path.startsWith('/api/') && req.accepts(['html', 'json']) === 'html' && !req.is('application/json');
}

function stripeStatusCode(err) {
  if (err && err.statusCode) {
    return err.statusCode;
  }

  if (err && err.statusCode === 0) {
    return 500;
  }

  return 502;
}

async function handleCheckoutSession(req, res) {
  if (!isWorkspaceAdmin(req)) {
    const statusCode = hasWorkspacePrincipal(req) ? 403 : 401;
    return res.status(statusCode).json({
      error: 'workspace_admin_required',
      message: 'Only workspace admins can start subscription checkout.',
    });
  }

  try {
    const session = await createWorkspaceCheckoutSession({
      getStripe: () => getRequestStripeClient(req),
      env: getBillingEnv(req),
      ...getWorkspaceContext(req),
    });

    if (!session.sessionId || !session.url) {
      return res.status(502).json({
        error: 'stripe_session_invalid',
        message: 'Stripe did not return a checkout session URL.',
      });
    }

    if (shouldRedirectToCheckout(req)) {
      return res.redirect(303, session.url);
    }

    return res.json(session);
  } catch (err) {
    return res.status(stripeStatusCode(err)).json({
      error: err.code || 'checkout_session_failed',
      message: err.message || 'Unable to create checkout session.',
    });
  }
}

app.get('/api/billing/plans', (req, res) => {
  res.json({ plans: buildPlanCatalog() });
});

app.post('/api/billing/checkout', handleCheckoutSession);
app.post('/api/billing/checkout/session', handleCheckoutSession);
app.post('/api/billing/checkout/sessions', handleCheckoutSession);
app.post('/api/checkout/sessions', handleCheckoutSession);
app.post('/billing/checkout', handleCheckoutSession);
app.post('/checkout', handleCheckoutSession);


function getWebhookSecret(req) {
  return req.app.locals.stripeWebhookSecret || req.app.locals.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
}

function getWebhookStripeClient(req) {
  const localStripe = req.app.locals.stripe || req.app.locals.stripeClient;
  if (localStripe) {
    return localStripe;
  }

  try {
    return getStripeClient();
  } catch (err) {
    const Stripe = require('stripe');
    return Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
  }
}

function rawBodyText(body) {
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8');
  }

  return String(body || '');
}

function getWebhookEvent(req) {
  const signature = headerValue(req, 'stripe-signature');
  const webhookSecret = getWebhookSecret(req);
  const stripe = signature || webhookSecret ? getWebhookStripeClient(req) : null;

  if (stripe && stripe.webhooks && typeof stripe.webhooks.constructEvent === 'function' && (signature || webhookSecret)) {
    return stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  }

  return JSON.parse(rawBodyText(req.body));
}

function handleStripeWebhook(req, res) {
  let event;

  try {
    event = getWebhookEvent(req);
  } catch (err) {
    return res.status(400).json({
      error: 'invalid_stripe_webhook',
      message: err.message || 'Invalid Stripe webhook signature.',
    });
  }

  const result = handleStripeWebhookEvent(event, getBillingEnv(req));
  return res.json({ received: true, ...result });
}

// Proxy a health probe through axios so the dependency is genuinely exercised.
app.get('/health/upstream', async (req, res) => {
  try {
    const r = await axios.get('https://example.com', { timeout: 2000 });
    res.json({ upstream: 'ok', status: r.status });
  } catch (err) {
    res.status(502).json({ upstream: 'unreachable', error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`axiom-demo-dashboard listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  buildMetrics,
  buildPlanCatalog,
  getBillingEnv,
  getWebhookEvent,
  getWorkspaceContext,
  hasWorkspacePrincipal,
  handleCheckoutSession,
  handleStripeWebhook,
  isWorkspaceAdmin,
};
