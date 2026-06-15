export type BillingPlan = 'free' | 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled';

export interface TestWorkspace {
  id: string;
  slug: string;
  name: string;
  adminEmail: string;
}

export interface StripePriceConfig {
  starter: string;
  pro: string;
  business: string;
}

export interface CheckoutSessionMock {
  workspaceId: string;
  plan: Exclude<BillingPlan, 'free'>;
  priceId: string;
  url: string;
  customerId: string;
  subscriptionId: string;
}

export interface CheckoutSessionFailure {
  workspaceId: string;
  plan: Exclude<BillingPlan, 'free'>;
  status: number;
  message: string;
}

export interface CheckoutSessionRequest {
  workspaceId: string;
  plan: Exclude<BillingPlan, 'free'>;
  mode: 'subscription';
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeWebhookFixture {
  id: string;
  type:
    | 'checkout.session.completed'
    | 'customer.subscription.created'
    | 'customer.subscription.updated';
  created: number;
  data: {
    object: Record<string, unknown>;
  };
}

export interface BillingState {
  workspaceId: string;
  plan: BillingPlan;
  status: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  processedWebhookEvents: string[];
}

export interface TestApiClient {
  baseURL: string;
  createWorkspace(input: {
    name: string;
    slug: string;
    adminEmail: string;
    plan: BillingPlan;
  }): Promise<TestWorkspace>;
  configureStripePrices(prices: StripePriceConfig): Promise<void>;
  mockStripeCheckoutSession(mock: CheckoutSessionMock): Promise<void>;
  mockStripeCheckoutFailure(failure: CheckoutSessionFailure): Promise<void>;
  lastCheckoutSessionRequest(workspaceId: string): Promise<CheckoutSessionRequest>;
  deliverStripeWebhook(fixture: StripeWebhookFixture): Promise<{
    status: number;
    replayed: boolean;
  }>;
  getWorkspaceBillingState(workspaceId: string): Promise<BillingState>;
  cleanup(): Promise<void>;
}
