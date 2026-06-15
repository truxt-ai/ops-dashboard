'use strict';

const SUBSCRIPTION_STATES = Object.freeze([
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
]);
const STATES = SUBSCRIPTION_STATES;
const ACTIVE_SUBSCRIPTION_STATES = Object.freeze(['trialing', 'active']);
const TERMINAL_SUBSCRIPTION_STATES = Object.freeze(['incomplete_expired', 'canceled']);
const VALID_STATES = new Set(SUBSCRIPTION_STATES);
const TERMINAL_STATES = new Set(TERMINAL_SUBSCRIPTION_STATES);
const ACTIVE_STATES = new Set(ACTIVE_SUBSCRIPTION_STATES);

const LEGAL_TRANSITIONS = {
  incomplete: new Set(['trialing', 'active', 'canceled', 'incomplete_expired']),
  incomplete_expired: new Set(),
  trialing: new Set(['active', 'past_due', 'canceled', 'paused']),
  active: new Set(['past_due', 'canceled', 'unpaid', 'paused']),
  past_due: new Set(['active', 'canceled', 'unpaid']),
  canceled: new Set(),
  unpaid: new Set(['active', 'canceled']),
  paused: new Set(['active', 'canceled']),
};

function isValidSubscriptionState(state) {
  return VALID_STATES.has(state);
}

function isPaidSubscriptionState(state) {
  return ACTIVE_STATES.has(state);
}

function nextSubscriptionState(current, incoming) {
  if (!VALID_STATES.has(current)) {
    return { state: current, changed: false, reason: 'unknown-current' };
  }

  if (current === incoming) {
    return { state: current, changed: false, reason: 'noop' };
  }

  if (!VALID_STATES.has(incoming) || TERMINAL_STATES.has(current)) {
    return { state: current, changed: false, reason: 'illegal-transition' };
  }

  if (!LEGAL_TRANSITIONS[current].has(incoming)) {
    return { state: current, changed: false, reason: 'illegal-transition' };
  }

  return { state: incoming, changed: true, reason: 'ok' };
}

module.exports = {
  STATES,
  SUBSCRIPTION_STATES,
  STRIPE_SUBSCRIPTION_STATES: SUBSCRIPTION_STATES,
  ACTIVE_SUBSCRIPTION_STATES,
  TERMINAL_SUBSCRIPTION_STATES,
  isValidSubscriptionState,
  isPaidSubscriptionState,
  nextSubscriptionState,
};
