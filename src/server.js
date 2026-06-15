'use strict';

const path = require('path');
const express = require('express');
const axios = require('axios');
const _ = require('lodash');
const minimist = require('minimist');
const { listBillingPlans, getBillingPlan, hasPaidFeatureAccess } = require('./lib/billing/plans');
const { renderPlanSelector } = require('./lib/billing/plan-selector-view');
const { makeBillingService, handleBillingEvent } = require('./lib/billing/billing-service');
const {
  DEFAULT_STRIPE_WEBHOOK_SECRET,
  constructWebhookEvent: constructDefaultWebhookEvent,
  makeStripeClient,
} = require('./lib/billing/stripe-client');

const args = minimist(process.argv.slice(2));
const PORT = args.port || process.env.PORT || 3000;

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

function billingLocals(app) {
  return app.locals && app.locals.billing ? app.locals.billing : {};
}

function resolveStripe(app, config) {
  const billing = billingLocals(app);
  return app.locals.stripe
    || app.locals.billingStripe
    || billing.stripe
    || config.stripe
    || makeStripeClient(config.stripeOptions);
}

function resolveRepo(app, config) {
  const billing = billingLocals(app);
  return app.locals.billingRepo
    || app.locals.repo
    || billing.repo
    || config.billingRepo
    || config.repo;
}

function resolveBillingService(app, config, stripe, repo) {
  const billing = billingLocals(app);
  return app.locals.billingService
    || billing.service
    || billing.billingService
    || config.billingService
    || makeBillingService({ stripe, repo });
}

function createApp(options) {
  const config = options || {};
  const app = express();
  const webhookSecret = config.webhookSecret
    || process.env.STRIPE_WEBHOOK_SECRET
    || DEFAULT_STRIPE_WEBHOOK_SECRET;

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const signature = req.get('stripe-signature');
    const stripe = resolveStripe(app, config);
    const repo = resolveRepo(app, config);
    const billingService = resolveBillingService(app, config, stripe, repo);
    const constructWebhookEvent = typeof stripe.constructWebhookEvent === 'function'
      ? stripe.constructWebhookEvent.bind(stripe)
      : constructDefaultWebhookEvent;

    try {
      const event = constructWebhookEvent(req.body, signature, webhookSecret);
      if (billingService && typeof billingService.handleWebhookEvent === 'function') {
        billingService.handleWebhookEvent(event);
      } else if (billingService && typeof billingService.applyBillingEvent === 'function') {
        billingService.applyBillingEvent(event);
      } else {
        handleBillingEvent(event, repo);
      }
      res.json({ received: true });
    } catch (err) {
      res.status(400).json({ error: 'invalid_signature' });
    }
  });

  app.get('/', (req, res) => {
    res.render('dashboard', { metrics: buildMetrics() });
  });

  app.get('/billing', (req, res) => {
    res.type('html').send(renderPlanSelector(listBillingPlans()));
  });

  app.post('/api/billing/checkout/session', express.json(), async (req, res) => {
    const workspaceId = req.get('x-workspace-id');

    if (!workspaceId) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    if (req.get('x-workspace-role') !== 'admin') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const planId = req.body && typeof req.body.planId === 'string' ? req.body.planId.trim() : '';

    if (!planId) {
      res.status(400).json({ error: 'invalid_plan' });
      return;
    }

    const plan = getBillingPlan(planId);

    if (!plan) {
      res.status(404).json({ error: 'unknown_plan' });
      return;
    }

    if (!hasPaidFeatureAccess(plan.id)) {
      res.status(400).json({ error: 'not_a_paid_plan' });
      return;
    }

    try {
      const stripe = resolveStripe(app, config);
      const repo = resolveRepo(app, config);
      const billingService = resolveBillingService(app, config, stripe, repo);
      const session = await billingService.startCheckout({ planId: plan.id, workspaceId });
      res.status(200).json(session);
    } catch (err) {
      const statusByCode = {
        invalid_plan: 400,
        not_a_paid_plan: 400,
        unknown_plan: 404,
      };
      const status = statusByCode[err.code] || 500;
      const code = statusByCode[err.code] ? err.code : 'checkout_failed';
      res.status(status).json({ error: code });
    }
  });

  // Proxy a health probe through axios so the dependency is genuinely exercised.
  app.get('/health/upstream', async (req, res) => {
    try {
      const r = await axios.get('https://example.com', { timeout: 2000 });
      res.json({ upstream: 'ok', status: r.status });
    } catch (err) {
      res.status(502).json({ upstream: 'unreachable', error: err.message });
    }
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`axiom-demo-dashboard listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, buildMetrics, createApp };
