'use strict';

const path = require('path');
const express = require('express');
const axios = require('axios');
const _ = require('lodash');
const minimist = require('minimist');
const { buildPlanCatalog } = require('./lib/billing-plans');
const { createWorkspaceCheckoutSession } = require('./lib/checkout-service');
const { getStripeClient } = require('./lib/stripe-client');

const args = minimist(process.argv.slice(2));
const PORT = args.port || process.env.PORT || 3000;

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
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

function isWorkspaceAdmin(req) {
  const explicitAdminHeader = headerValue(req, 'x-workspace-admin').toLowerCase();
  if (['true', '1', 'yes'].includes(explicitAdminHeader)) {
    return true;
  }

  const role =
    headerValue(req, 'x-workspace-role') ||
    headerValue(req, 'x-user-role') ||
    headerValue(req, 'x-role') ||
    (req.user && (req.user.workspaceRole || req.user.role)) ||
    (req.workspace && req.workspace.role) ||
    '';

  return ['admin', 'owner'].includes(String(role).trim().toLowerCase()) || Boolean(req.workspace && req.workspace.isAdmin);
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

  return {
    planId: requestField(req, 'planId') || requestField(req, 'plan') || requestField(req, 'pricePlan'),
    workspaceId: headerValue(req, 'x-workspace-id') || requestField(req, 'workspaceId') || workspace.id,
    workspaceName: headerValue(req, 'x-workspace-name') || requestField(req, 'workspaceName') || workspace.name,
    billingEmail: headerValue(req, 'x-billing-email') || headerValue(req, 'x-user-email') || requestField(req, 'billingEmail') || user.email,
    existingCustomerId: headerValue(req, 'x-stripe-customer-id') || requestField(req, 'stripeCustomerId') || workspace.stripeCustomerId,
  };
}

function getRequestStripeClient(req) {
  return req.app.locals.stripe || req.app.locals.stripeClient || getStripeClient();
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
    return res.status(403).json({
      error: 'workspace_admin_required',
      message: 'Only workspace admins can start subscription checkout.',
    });
  }

  try {
    const session = await createWorkspaceCheckoutSession({
      getStripe: () => getRequestStripeClient(req),
      env: process.env,
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
app.post('/api/billing/checkout/sessions', handleCheckoutSession);
app.post('/api/checkout/sessions', handleCheckoutSession);
app.post('/billing/checkout', handleCheckoutSession);
app.post('/checkout', handleCheckoutSession);

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
  getWorkspaceContext,
  handleCheckoutSession,
  isWorkspaceAdmin,
};
