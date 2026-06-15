'use strict';

let cachedSecretKey = null;
let cachedClient = null;

function stripeError(code, statusCode, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function createStripeClient(secretKey = process.env.STRIPE_SECRET_KEY) {
  const key = String(secretKey || '').trim();

  if (!key) {
    throw stripeError('stripe_not_configured', 500, 'STRIPE_SECRET_KEY is required to create checkout sessions.');
  }

  const Stripe = require('stripe');
  return Stripe(key);
}

function getStripeClient(env = process.env) {
  const secretKey = String(env.STRIPE_SECRET_KEY || '').trim();

  if (!cachedClient || cachedSecretKey !== secretKey) {
    cachedClient = createStripeClient(secretKey);
    cachedSecretKey = secretKey;
  }

  return cachedClient;
}

function resetStripeClient() {
  cachedSecretKey = null;
  cachedClient = null;
}

module.exports = {
  createStripeClient,
  getStripeClient,
  resetStripeClient,
};
