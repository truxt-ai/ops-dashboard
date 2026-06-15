'use strict';

const http = require('node:http');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../src/server');

async function get(path) {
  const server = app.listen(0);

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          method: 'GET',
          path
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            text += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              text
            });
          });
        }
      );

      req.on('error', reject);
      req.end();
    });
  }
  finally {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        }
        else {
          resolve();
        }
      });
    });
  }
}

test('dashboard renders BillingPlans/PlanSelector actions and client checkout behavior', async () => {
  const response = await get('/');

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /html/);

  for (const planId of ['free', 'starter', 'pro', 'business']) {
    assert.match(response.text, new RegExp(`data-testid=["']billing-plan-card-${planId}["']`));
    assert.match(response.text, new RegExp(`\\b${planId}\\b`, 'i'));
  }

  for (const planId of ['starter', 'pro', 'business']) {
    assert.match(response.text, new RegExp(`data-testid=["']start-checkout-${planId}["']`));
  }

  assert.doesNotMatch(
    response.text,
    /data-testid=["']start-checkout-free["']/,
    'free plan must not start a Stripe Checkout Session'
  );
  assert.match(response.text, /\/api\/billing\/checkout\/session/);
  assert.match(response.text, /fetch\s*\(/, 'PlanSelector must call the checkout-session endpoint from the page');
  assert.match(
    response.text,
    /window\.location\.(assign|href)|location\.(assign|href)/,
    'PlanSelector must redirect the browser to the returned Stripe Checkout URL'
  );
  assert.match(
    response.text,
    /aria-live=["']polite["']|role=["']status["']/,
    'checkout loading state must be announced accessibly'
  );
  assert.match(
    response.text,
    /data-testid=["']billing-checkout-error["']|role=["']alert["']/,
    'checkout errors must render in an accessible, testable region'
  );
});
