import { expect, test } from '@playwright/test';
import {
  createTestApi,
  loginAsDefault,
  stripeCheckoutCompletedFixture,
  stripeSubscriptionCreatedFixture,
  stripeSubscriptionUpdatedFixture,
} from './helpers';
import type { StripePriceConfig, TestApiClient, TestWorkspace } from './fixtures';

let api: TestApiClient;
let workspace: TestWorkspace;

const prices: StripePriceConfig = {
  starter: 'price_starter_e2e',
  pro: 'price_pro_e2e',
  business: 'price_business_e2e',
};

test.beforeEach(async ({ page }) => {
  api = await createTestApi();
  workspace = await api.createWorkspace({
    name: 'Acme Ops',
    slug: 'acme-ops',
    adminEmail: 'admin@example.test',
    plan: 'free',
  });
  await api.configureStripePrices(prices);
  await loginAsDefault(page, workspace);
});

test.afterEach(async () => {
  await api.cleanup();
});

test('workspace admin starts Pro Checkout from billing settings', async ({ page }) => {
  const checkoutUrl = 'https://checkout.stripe.test/c/pay/cs_test_pro_acme_ops';

  await api.mockStripeCheckoutSession({
    workspaceId: workspace.id,
    plan: 'pro',
    priceId: prices.pro,
    url: checkoutUrl,
    customerId: 'cus_acme_ops',
    subscriptionId: 'sub_acme_ops_pro',
  });

  await page.goto('/settings/billing');

  await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible();
  const starter = page.getByRole('region', { name: /starter/i });
  const pro = page.getByRole('region', { name: /pro/i });
  const business = page.getByRole('region', { name: /business/i });

  await expect(starter.getByRole('button', { name: /start starter checkout/i })).toBeVisible();
  await expect(pro.getByRole('button', { name: /start pro checkout/i })).toBeEnabled();
  await expect(business.getByRole('button', { name: /start business checkout/i })).toBeVisible();

  await pro.getByRole('button', { name: /start pro checkout/i }).click();

  await expect
    .poll(
      async () => {
        if (page.url().startsWith(checkoutUrl)) {
          return checkoutUrl;
        }

        const checkoutLink = page.getByRole('link', {
          name: /continue to stripe checkout/i,
        });
        if (await checkoutLink.isVisible().catch(() => false)) {
          return checkoutLink.getAttribute('href');
        }

        return 'pending';
      },
      {
        message:
          'Pro checkout should redirect to Stripe or expose the Stripe Checkout URL',
      },
    )
    .toBe(checkoutUrl);

  const request = await api.lastCheckoutSessionRequest(workspace.id);
  expect(request).toMatchObject({
    workspaceId: workspace.id,
    plan: 'pro',
    mode: 'subscription',
    priceId: prices.pro,
  });
  expect(request.successUrl).toContain('/settings/billing');
  expect(request.cancelUrl).toContain('/settings/billing');
});

test('signed Stripe webhooks activate Pro access and replay safely', async ({ page }) => {
  const customerId = 'cus_acme_ops';
  const subscriptionId = 'sub_acme_ops_pro';
  const completed = stripeCheckoutCompletedFixture({
    eventId: 'evt_checkout_completed_acme_ops',
    workspace,
    plan: 'pro',
    priceId: prices.pro,
    customerId,
    subscriptionId,
  });
  const created = stripeSubscriptionCreatedFixture({
    eventId: 'evt_subscription_created_acme_ops',
    workspace,
    plan: 'pro',
    priceId: prices.pro,
    customerId,
    subscriptionId,
    status: 'trialing',
  });
  const updated = stripeSubscriptionUpdatedFixture({
    eventId: 'evt_subscription_updated_acme_ops',
    workspace,
    plan: 'pro',
    priceId: prices.pro,
    customerId,
    subscriptionId,
    status: 'active',
  });

  await page.goto('/settings/billing');
  await expect(page.getByTestId('paid-feature-gate')).toContainText(/upgrade to pro/i);

  await api.deliverStripeWebhook(completed);
  await api.deliverStripeWebhook(created);
  await api.deliverStripeWebhook(updated);
  const replay = await api.deliverStripeWebhook(updated);

  expect(replay).toMatchObject({ status: 200, replayed: true });

  await page.reload();
  await expect(page.getByRole('status', { name: /subscription status/i })).toContainText(
    /pro.+active/i,
  );
  await expect(page.getByTestId('paid-feature-gate')).toContainText(/pro access enabled/i);

  await page.getByRole('link', { name: /open pro insights/i }).click();
  await expect(page).toHaveURL(/\/pro\/insights$/);
  await expect(page.getByRole('heading', { name: /pro insights/i })).toBeVisible();

  const billing = await api.getWorkspaceBillingState(workspace.id);
  expect(billing).toMatchObject({
    workspaceId: workspace.id,
    plan: 'pro',
    status: 'active',
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
  expect(
    billing.processedWebhookEvents.filter((eventId) => eventId === updated.id),
  ).toHaveLength(1);
});

test('checkout creation errors stay visible on the billing page', async ({ page }) => {
  await api.mockStripeCheckoutFailure({
    workspaceId: workspace.id,
    plan: 'pro',
    status: 503,
    message: 'Stripe checkout is temporarily unavailable',
  });

  await page.goto('/settings/billing');
  await page
    .getByRole('region', { name: /pro/i })
    .getByRole('button', { name: /start pro checkout/i })
    .click();

  await expect(page.getByRole('alert')).toContainText(/unable to start checkout/i);
  await expect(page.getByRole('alert')).toContainText(/temporarily unavailable/i);
  await expect(page).toHaveURL(/\/settings\/billing$/);
  await expect(
    page
      .getByRole('region', { name: /pro/i })
      .getByRole('button', { name: /start pro checkout/i }),
  ).toBeEnabled();
});
