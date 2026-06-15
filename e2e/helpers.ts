import { createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';
import type {
  BillingPlan,
  CheckoutSessionFailure,
  CheckoutSessionMock,
  CheckoutSessionRequest,
  StripePriceConfig,
  StripeWebhookFixture,
  TestApiClient,
  TestWorkspace,
} from './fixtures';

const DEFAULT_BASE_URL =
  process.env.E2E_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  'http://127.0.0.1:3000';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_e2e_test_secret';

export async function createTestApi(): Promise<TestApiClient> {
  const baseURL = DEFAULT_BASE_URL.replace(/\/$/, '');
  const workspaceIds: string[] = [];

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseURL}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${init.method || 'GET'} ${path} returned ${response.status}: ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    baseURL,
    async createWorkspace(input) {
      const workspace = await requestJson<TestWorkspace>('/__test/e2e/workspaces', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      workspaceIds.push(workspace.id);
      return workspace;
    },
    async configureStripePrices(prices: StripePriceConfig) {
      await requestJson<void>('/__test/e2e/stripe/prices', {
        method: 'PUT',
        body: JSON.stringify(prices),
      });
    },
    async mockStripeCheckoutSession(mock: CheckoutSessionMock) {
      await requestJson<void>('/__test/e2e/stripe/checkout-session', {
        method: 'PUT',
        body: JSON.stringify(mock),
      });
    },
    async mockStripeCheckoutFailure(failure: CheckoutSessionFailure) {
      await requestJson<void>('/__test/e2e/stripe/checkout-session/failure', {
        method: 'PUT',
        body: JSON.stringify(failure),
      });
    },
    async lastCheckoutSessionRequest(workspaceId: string) {
      return requestJson<CheckoutSessionRequest>(
        `/__test/e2e/stripe/checkout-session/requests/latest?workspaceId=${encodeURIComponent(
          workspaceId,
        )}`,
      );
    },
    async deliverStripeWebhook(fixture: StripeWebhookFixture) {
      const payload = JSON.stringify(fixture);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      return requestJson<{ status: number; replayed: boolean }>('/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': `t=${timestamp},v1=${signature}`,
        },
        body: payload,
      });
    },
    async getWorkspaceBillingState(workspaceId: string) {
      return requestJson(`/__test/e2e/workspaces/${workspaceId}/billing`);
    },
    async cleanup() {
      for (const workspaceId of workspaceIds.splice(0)) {
        await fetch(`${baseURL}/__test/e2e/workspaces/${workspaceId}`, {
          method: 'DELETE',
        }).catch(() => undefined);
      }
      await fetch(`${baseURL}/__test/e2e/cleanup`, { method: 'POST' }).catch(
        () => undefined,
      );
    },
  };
}

export async function loginAsDefault(page: Page, workspace?: TestWorkspace) {
  const session = {
    role: 'workspace_admin',
    email: workspace?.adminEmail || 'admin@example.test',
    workspaceId: workspace?.id,
    workspaceSlug: workspace?.slug,
  };

  await page.context().addCookies([
    {
      name: 'ops_dashboard_e2e_session',
      value: Buffer.from(JSON.stringify(session)).toString('base64url'),
      url: DEFAULT_BASE_URL,
    },
  ]);
  await page.addInitScript((value) => {
    window.localStorage.setItem('ops-dashboard:e2e-session', JSON.stringify(value));
  }, session);
}

export function stripeCheckoutCompletedFixture(input: {
  eventId: string;
  workspace: TestWorkspace;
  plan: Exclude<BillingPlan, 'free'>;
  priceId: string;
  customerId: string;
  subscriptionId: string;
}): StripeWebhookFixture {
  return {
    id: input.eventId,
    type: 'checkout.session.completed',
    created: 1_720_000_000,
    data: {
      object: {
        id: `cs_test_${input.workspace.slug}_${input.plan}`,
        mode: 'subscription',
        customer: input.customerId,
        subscription: input.subscriptionId,
        client_reference_id: input.workspace.id,
        metadata: {
          workspaceId: input.workspace.id,
          workspaceSlug: input.workspace.slug,
          plan: input.plan,
          priceId: input.priceId,
        },
      },
    },
  };
}

export function stripeSubscriptionCreatedFixture(input: {
  eventId: string;
  workspace: TestWorkspace;
  plan: Exclude<BillingPlan, 'free'>;
  priceId: string;
  customerId: string;
  subscriptionId: string;
  status: 'active' | 'trialing';
}): StripeWebhookFixture {
  return stripeSubscriptionFixture('customer.subscription.created', input);
}

export function stripeSubscriptionUpdatedFixture(input: {
  eventId: string;
  workspace: TestWorkspace;
  plan: Exclude<BillingPlan, 'free'>;
  priceId: string;
  customerId: string;
  subscriptionId: string;
  status: 'active' | 'trialing';
}): StripeWebhookFixture {
  return stripeSubscriptionFixture('customer.subscription.updated', input);
}

function stripeSubscriptionFixture(
  type: 'customer.subscription.created' | 'customer.subscription.updated',
  input: {
    eventId: string;
    workspace: TestWorkspace;
    plan: Exclude<BillingPlan, 'free'>;
    priceId: string;
    customerId: string;
    subscriptionId: string;
    status: 'active' | 'trialing';
  },
): StripeWebhookFixture {
  return {
    id: input.eventId,
    type,
    created: 1_720_000_001,
    data: {
      object: {
        id: input.subscriptionId,
        customer: input.customerId,
        status: input.status,
        items: {
          data: [
            {
              price: {
                id: input.priceId,
              },
            },
          ],
        },
        metadata: {
          workspaceId: input.workspace.id,
          workspaceSlug: input.workspace.slug,
          plan: input.plan,
        },
      },
    },
  };
}
