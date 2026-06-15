'use strict';

const { hasPaidFeatureAccess } = require('./plans');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFeatureList(features) {
  return features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('');
}

function renderAction(plan) {
  if (!hasPaidFeatureAccess(plan.id)) {
    return '<p class=\'billing-plan-note\'>Included with every workspace</p>';
  }

  return [
    `<button type='button' class='checkout-button' data-plan-id='${escapeHtml(plan.id)}' `,
    `data-testid='start-checkout-${escapeHtml(plan.id)}'>Start checkout</button>`,
  ].join('');
}

function renderPlanCard(plan) {
  return [
    `<article class='billing-plan-card' data-testid='billing-plan-card-${escapeHtml(plan.id)}'>`,
    `<h2>${escapeHtml(plan.name)}</h2>`,
    `<p class='billing-plan-price'>$${escapeHtml(plan.priceUsd)}</p>`,
    `<ul>${renderFeatureList(plan.features)}</ul>`,
    renderAction(plan),
    '</article>',
  ].join('');
}

function renderPlanSelector(plans) {
  return [
    '<!DOCTYPE html>',
    '<html lang=\'en\'>',
    '<head>',
    '<meta charset=\'utf-8\'>',
    '<meta name=\'viewport\' content=\'width=device-width, initial-scale=1\'>',
    '<title>Billing Plans</title>',
    '<style>',
    'body { font-family: system-ui, sans-serif; margin: 2rem; color: #18202f; background: #f8fafc; }',
    'main { max-width: 1120px; margin: 0 auto; }',
    '.billing-plans { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }',
    '.billing-plan-card { background: #fff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 1rem; }',
    '.billing-plan-price { font-size: 1.75rem; font-weight: 700; margin: 0.5rem 0; }',
    '.checkout-button { background: #0f766e; color: #fff; border: 0; border-radius: 6px; padding: 0.65rem 0.9rem; cursor: pointer; }',
    '.billing-plan-note, #checkout-loading, #checkout-error { color: #52606d; }',
    '#checkout-error { color: #b42318; }',
    '[hidden] { display: none; }',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<h1>Billing Plans</h1>',
    '<section class=\'billing-plans\'>',
    plans.map(renderPlanCard).join(''),
    '</section>',
    '<p id=\'checkout-loading\' data-testid=\'checkout-loading\' hidden>Loading checkout...</p>',
    '<p id=\'checkout-error\' data-testid=\'checkout-error\' hidden></p>',
    '</main>',
    '<script>',
    '(function () {',
    '  var loading = document.querySelector("[data-testid=\'checkout-loading\']");',
    '  var error = document.querySelector("[data-testid=\'checkout-error\']");',
    '  function showError(message) {',
    '    error.textContent = message;',
    '    error.hidden = false;',
    '  }',
    '  document.querySelectorAll(".checkout-button").forEach(function (button) {',
    '    button.addEventListener("click", function () {',
    '      var planId = button.getAttribute("data-plan-id");',
    '      loading.hidden = false;',
    '      error.hidden = true;',
    '      fetch(\'/api/billing/checkout/session\', {',
    '        method: \'POST\',',
    '        headers: { \'Content-Type\': \'application/json\' },',
    '        body: JSON.stringify({ planId: planId })',
    '      })',
    '        .then(function (response) {',
    '          if (!response.ok) { throw new Error("Unable to start checkout"); }',
    '          return response.json();',
    '        })',
    '        .then(function (session) {',
    '          window.location.assign(session.url);',
    '        })',
    '        .catch(function (err) {',
    '          loading.hidden = true;',
    '          showError(err.message);',
    '        });',
    '    });',
    '  });',
    '}());',
    '</script>',
    '</body>',
    '</html>',
  ].join('');
}

module.exports = { renderPlanSelector };
