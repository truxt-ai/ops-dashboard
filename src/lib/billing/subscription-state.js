'use strict';

const STATES = Object.freeze([
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete_expired',
]);

const VALID_STATES = new Set(STATES);
const TERMINAL_STATES = new Set(['canceled', 'incomplete_expired']);

const LEGAL_TRANSITIONS = {
  incomplete: new Set(['trialing', 'active', 'canceled', 'incomplete_expired']),
  trialing: new Set(['active', 'past_due', 'canceled']),
  active: new Set(['past_due', 'canceled']),
  past_due: new Set(['active', 'canceled']),
  canceled: new Set(),
  incomplete_expired: new Set(),
};

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
  nextSubscriptionState,
};
