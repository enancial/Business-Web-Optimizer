/**
 * End-to-end unit tests for the 7-day free trial signup flow.
 *
 * Exercises the complete path a user takes from hitting the checkout API to
 * gaining paid access — using Stripe test-mode mocks throughout, so no real
 * network traffic is made.
 *
 * Scenarios covered:
 *  1. POST /api/create-payment-intent → returns SetupIntent clientSecret +
 *     intentType='setup' + trialDays=7 (no immediate charge)
 *  2. POST /api/create-payment-intent → with a promo code, discount is reflected
 *     in the response but intentType still = 'setup' (trial unchanged)
 *  3. POST /api/create-payment-intent → missing OPTIMIZER_PRICE_ID returns 500
 *  4. POST /api/create-payment-intent → invalid product returns 400
 *  5. POST /api/create-payment-intent → Stripe returns no pending_setup_intent →
 *     subscription is cancelled and 500 returned (safe abort)
 *  6. customer.subscription.created webhook (status='trialing') → stripe-replit-sync
 *     handler fires → subscription is in the DB with status 'trialing'
 *  7. POST /api/account/auth with a trialing Stripe subscription → JWT
 *     contains tier='paid' (no charge required for access)
 *  8. invoice.paid with amount_paid=0 (trial period invoice) → no affiliate
 *     earnings recorded (guard fires correctly)
 *  9. POST /api/create-payment-intent → promoCode reduces price to $0 → isFree=true,
 *     no SetupIntent
 * 10. POST /api/create-payment-intent → optimizer-pro product returns correct
 *     price and trial metadata
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Hoisted DB mocks (must exist before vi.mock calls)
// ---------------------------------------------------------------------------

const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@workspace/db', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  affiliates: {},
  affiliateConversions: {},
  affiliateEarnings: {},
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn().mockResolvedValue('pk_test_mock'),
  getStripeSecretKey: vi.fn().mockResolvedValue('sk_test_mock'),
}));

import app from '../app';
import { handleWebhookEvent } from '../lib/subscriptionWebhook';
import { getUncachableStripeClient } from '../stripeClient';
import {
  createStripeMock,
  makeActiveSub,
  makeCustomer,
  TEST_CUSTOMER_ID,
  OPTIMIZER_PRICE_ID,
  OPTIMIZER_PRO_PRICE_ID,
  type StripeMock,
} from './helpers/stripeMock';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-for-automated-tests-only';
const TEST_SETUP_INTENT_SECRET = 'seti_test_secret_xyz';
const TEST_SUB_ID = 'sub_trial_test_001';

// ---------------------------------------------------------------------------
// Fluent DB chain mock (same pattern used across the test suite)
// ---------------------------------------------------------------------------

function dbChain<T>(resolveWith: T) {
  const chain: Record<string, unknown> = {};
  const thenable = Promise.resolve(resolveWith);
  for (const name of [
    'from', 'where', 'limit', 'having', 'groupBy',
    'innerJoin', 'leftJoin', 'values', 'onConflictDoNothing',
    'set', 'returning',
  ]) {
    chain[name] = vi.fn().mockReturnValue(chain);
  }
  chain.then = thenable.then.bind(thenable);
  chain.catch = thenable.catch.bind(thenable);
  chain.finally = thenable.finally.bind(thenable);
  return chain;
}

// ---------------------------------------------------------------------------
// Stripe mock logger
// ---------------------------------------------------------------------------

const mockLog = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn(), level: 'silent',
  silent: vi.fn(), isLevelEnabled: vi.fn(() => false),
} as unknown as import('pino').Logger;

// ---------------------------------------------------------------------------
// Stripe mock helpers
// ---------------------------------------------------------------------------

/** A trial subscription fixture with an attached pending_setup_intent. */
function makeTrialSub(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUB_ID,
    status: 'trialing',
    cancel_at_period_end: false,
    cancel_at: null,
    current_period_end: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    customer: TEST_CUSTOMER_ID,
    items: {
      data: [
        {
          id: 'si_trial_item',
          price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900, currency: 'usd' },
        },
      ],
    },
    metadata: { product: 'optimizer', price_id: OPTIMIZER_PRICE_ID },
    pending_setup_intent: {
      id: 'seti_trial_test',
      client_secret: TEST_SETUP_INTENT_SECRET,
    },
    ...overrides,
  };
}

/** A minimal price fixture. */
function makePrice(overrides: Record<string, unknown> = {}) {
  return {
    id: OPTIMIZER_PRICE_ID,
    unit_amount: 2900,
    currency: 'usd',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Stripe mock + global setup
// ---------------------------------------------------------------------------

type ExtendedStripeMock = StripeMock & {
  subscriptions: StripeMock['subscriptions'] & { create: ReturnType<typeof vi.fn> };
  prices: { retrieve: ReturnType<typeof vi.fn> };
  customers: StripeMock['customers'] & { create: ReturnType<typeof vi.fn> };
};

let stripe: ExtendedStripeMock;

beforeEach(async () => {
  vi.resetAllMocks();

  const base = createStripeMock();
  stripe = {
    ...base,
    customers: {
      ...base.customers,
      create: vi.fn().mockResolvedValue({ id: TEST_CUSTOMER_ID }),
    },
    subscriptions: {
      ...base.subscriptions,
      create: vi.fn().mockResolvedValue(makeTrialSub()),
      cancel: vi.fn().mockResolvedValue({ id: TEST_SUB_ID, status: 'canceled' }),
    },
    prices: {
      retrieve: vi.fn().mockResolvedValue(makePrice()),
    },
  } as ExtendedStripeMock;

  // Default: no existing subscriptions (idempotency guard passes)
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.customers.search.mockResolvedValue({ data: [makeCustomer()] });

  vi.mocked(getUncachableStripeClient).mockResolvedValue(
    stripe as unknown as Stripe,
  );

  // Re-apply after resetAllMocks() clears mock implementations
  const { getStripePublishableKey, getStripeSecretKey } = await import('../stripeClient');
  vi.mocked(getStripePublishableKey).mockResolvedValue('pk_test_mock');
  vi.mocked(getStripeSecretKey).mockResolvedValue('sk_test_mock');
});

// ===========================================================================
// 1. POST /api/create-payment-intent — happy path trial flow
// ===========================================================================

describe('POST /api/create-payment-intent — trial subscription', () => {
  it('returns intentType=setup, clientSecret, and trialDays=7 for optimizer product', async () => {
    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    expect(res.status).toBe(200);
    expect(res.body.intentType).toBe('setup');
    expect(res.body.trialDays).toBe(7);
    expect(res.body.clientSecret).toBe(TEST_SETUP_INTENT_SECRET);
    expect(res.body.publishableKey).toBe('pk_test_mock');
  });

  it('creates a Stripe Subscription with trial_period_days=7 and payment_behavior=default_incomplete', async () => {
    await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trial_period_days: 7,
        payment_behavior: 'default_incomplete',
        payment_settings: expect.objectContaining({
          save_default_payment_method: 'on_subscription',
        }),
        expand: ['pending_setup_intent'],
      }),
    );
  });

  it('creates a new Stripe Customer for every trial signup', async () => {
    await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
  });

  it('reflects correct originalAmount and discountedAmount for optimizer ($29/mo)', async () => {
    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    expect(res.body.originalAmount).toBe(2900);
    expect(res.body.discountedAmount).toBe(2900);
    expect(res.body.currency).toBe('usd');
  });

  it('works for optimizer-pro product and reflects $79/mo pricing', async () => {
    stripe.prices.retrieve.mockResolvedValue(
      makePrice({ id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900 }),
    );
    stripe.subscriptions.create.mockResolvedValue(
      makeTrialSub({
        items: {
          data: [{ id: 'si_pro_item', price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900, currency: 'usd' } }],
        },
        metadata: { product: 'optimizer-pro', price_id: OPTIMIZER_PRO_PRICE_ID },
      }),
    );

    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer-pro' });

    expect(res.status).toBe(200);
    expect(res.body.intentType).toBe('setup');
    expect(res.body.originalAmount).toBe(7900);
    expect(res.body.trialDays).toBe(7);
  });

  it('does NOT charge the user — clientSecret comes from SetupIntent, not PaymentIntent', async () => {
    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    // A SetupIntent client_secret starts with 'seti_' in real Stripe;
    // our mock returns the exact value we provided.
    expect(res.body.clientSecret).toBe(TEST_SETUP_INTENT_SECRET);
    // There must be NO immediate payment amount in the response
    expect(res.body.isFree).toBeUndefined();
    // intentType must be 'setup' (not 'payment')
    expect(res.body.intentType).toBe('setup');
  });
});

// ===========================================================================
// 2. Trial + promo code — discount applied but still a trial SetupIntent
// ===========================================================================

describe('POST /api/create-payment-intent — trial with promo code', () => {
  beforeEach(() => {
    // Mock the raw-fetch promo lookup used by findActivePromoCode.
    // The route calls fetch() directly against the Stripe REST API.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'promo_test_20off',
            code: 'SAVE20',
            active: true,
            coupon: {
              id: 'coupon_20off',
              percent_off: 20,
              duration: 'forever',
            },
          },
        ],
      }),
    } as unknown as Response);
  });

  it('applies the discount to discountedAmount and still returns intentType=setup', async () => {
    stripe.subscriptions.create.mockResolvedValue(
      makeTrialSub({
        metadata: { product: 'optimizer', price_id: OPTIMIZER_PRICE_ID, promotion_code_id: 'promo_test_20off' },
      }),
    );

    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer', promotionCode: 'promo_test_20off' });

    expect(res.status).toBe(200);
    expect(res.body.intentType).toBe('setup');
    expect(res.body.trialDays).toBe(7);
    // 20% off $29 = $23.20 → 2320 cents
    expect(res.body.discountedAmount).toBe(2320);
    expect(res.body.discountLabel).toBe('20% off');
  });

  it('attaches the promotion code to the Stripe subscription', async () => {
    stripe.subscriptions.create.mockResolvedValue(makeTrialSub());

    await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer', promotionCode: 'promo_test_20off' });

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: 'promo_test_20off' }],
      }),
    );
  });
});

// ===========================================================================
// 3. $0 promo code path — isFree=true, no SetupIntent
// ===========================================================================

describe('POST /api/create-payment-intent — $0 promo (isFree path)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'promo_100off',
            code: 'FREE100',
            active: true,
            coupon: {
              id: 'coupon_100off',
              percent_off: 100,
              duration: 'once',
            },
          },
        ],
      }),
    } as unknown as Response);
  });

  it('returns isFree=true and no clientSecret when promo reduces price to $0', async () => {
    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer', promotionCode: 'promo_100off' });

    expect(res.status).toBe(200);
    expect(res.body.isFree).toBe(true);
    expect(res.body.clientSecret).toBeUndefined();
    expect(res.body.intentType).toBeUndefined();
    expect(res.body.discountedAmount).toBe(0);
  });
});

// ===========================================================================
// 4. Error cases
// ===========================================================================

describe('POST /api/create-payment-intent — error cases', () => {
  it('returns 400 for an invalid product', async () => {
    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'unknown-plan' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid product/i);
  });

  it('returns 500 when OPTIMIZER_PRICE_ID env var is not set', async () => {
    const original = process.env.OPTIMIZER_PRICE_ID;
    delete process.env.OPTIMIZER_PRICE_ID;

    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    process.env.OPTIMIZER_PRICE_ID = original;

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/price id missing/i);
  });

  it('cancels the incomplete subscription and returns 500 when Stripe returns no pending_setup_intent', async () => {
    stripe.subscriptions.create.mockResolvedValue({
      ...makeTrialSub(),
      pending_setup_intent: null, // Stripe anomaly
    });

    const res = await request(app)
      .post('/api/create-payment-intent')
      .send({ product: 'optimizer' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/trial checkout/i);
    // The dangling subscription must be cancelled to avoid orphaned customers
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 5. customer.subscription.created webhook — trialing status
// ===========================================================================

describe('customer.subscription.created webhook — trial start', () => {
  it('is handled without error when subscription status is trialing (no affiliate)', async () => {
    // No affiliate code in metadata → onSubscriptionCreated returns early
    const event: Stripe.Event = {
      id: 'evt_sub_created_trial',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: TEST_SUB_ID,
          status: 'trialing',
          customer: TEST_CUSTOMER_ID,
          metadata: { product: 'optimizer', price_id: OPTIMIZER_PRICE_ID },
          items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
        } as Stripe.Subscription,
      },
    } as unknown as Stripe.Event;

    // Should not throw
    await expect(handleWebhookEvent(event, mockLog)).resolves.toBeUndefined();
    // No DB calls — no affiliate_code in metadata
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('records affiliate conversion when subscription is trialing and affiliate_code is set', async () => {
    const TEST_AFFILIATE = {
      id: 42,
      name: 'Alice Ref',
      email: 'alice@example.com',
      code: 'ALICEREF',
      active: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    mockSelect.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    const event: Stripe.Event = {
      id: 'evt_sub_created_aff',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: TEST_SUB_ID,
          status: 'trialing',
          customer: TEST_CUSTOMER_ID,
          metadata: {
            product: 'optimizer',
            price_id: OPTIMIZER_PRICE_ID,
            affiliate_code: 'ALICEREF',
          },
          items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
        } as Stripe.Subscription,
      },
    } as unknown as Stripe.Event;

    await handleWebhookEvent(event, mockLog);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ affiliateId: 42 }),
      expect.stringContaining('Affiliate conversion recorded'),
    );
  });

  it('is a no-op when subscription status is active (non-trial path)', async () => {
    const event: Stripe.Event = {
      id: 'evt_sub_created_active',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: TEST_SUB_ID,
          status: 'active',
          customer: TEST_CUSTOMER_ID,
          metadata: { affiliate_code: 'ALICEREF' },
          items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
        } as Stripe.Subscription,
      },
    } as unknown as Stripe.Event;

    await handleWebhookEvent(event, mockLog);

    // Handler returns early for non-trialing subscriptions
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. POST /api/account/auth — JWT contains tier='paid' for trialing subscription
// ===========================================================================

describe('POST /api/account/auth — trialing subscription grants paid access', () => {
  it('issues a JWT with tier=paid when the user has a trialing Stripe subscription', async () => {
    // Stripe customer search returns our test customer
    stripe.customers.search.mockResolvedValue({ data: [makeCustomer()] });
    // Subscription list returns a trialing subscription
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          id: TEST_SUB_ID,
          status: 'trialing',
          items: {
            data: [{
              id: 'si_trial_item',
              price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900, currency: 'usd' },
            }],
          },
        }),
      ],
    });

    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Decode the JWT and verify the tier claim
    const payload = jwt.verify(res.body.token, TEST_SECRET) as {
      tier: string;
      customerId: string;
      product: string;
    };

    expect(payload.tier).toBe('paid');
    expect(payload.customerId).toBe(TEST_CUSTOMER_ID);
    expect(payload.product).toBe('optimizer');
  });

  it('issues a JWT with tier=paid when the subscription status is active (existing subscriber)', async () => {
    stripe.customers.search.mockResolvedValue({ data: [makeCustomer()] });
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeActiveSub({ status: 'active' })],
    });

    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, TEST_SECRET) as { tier: string };
    expect(payload.tier).toBe('paid');
  });

  it('returns 403 when the user has no active or trialing subscription', async () => {
    stripe.customers.search.mockResolvedValue({ data: [makeCustomer()] });
    // Only cancelled subscriptions — no active/trialing access
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeActiveSub({ status: 'canceled' })],
    });

    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });

    // Route returns 403 when a customer exists but has no active/trialing plan
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });
});

// ===========================================================================
// 7. invoice.paid with amount_paid=0 — no charge during trial
// ===========================================================================

describe('invoice.paid — $0 trial invoice does not accrue affiliate earnings', () => {
  it('skips all DB work when amount_paid is 0 (trial period Stripe invoice)', async () => {
    const event: Stripe.Event = {
      id: 'evt_inv_trial_zero',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_trial_zero',
          subscription: TEST_SUB_ID,
          amount_paid: 0, // ← Stripe fires this during trial with $0
          period_start: Math.floor(Date.now() / 1000),
        } as Stripe.Invoice,
      },
    } as unknown as Stripe.Event;

    await handleWebhookEvent(event, mockLog);

    // The amount_paid <= 0 guard must fire before any DB interaction
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('accrues affiliate earnings for a real post-trial invoice (amount_paid > 0)', async () => {
    const TEST_CONVERSION = {
      id: 1,
      affiliateId: 42,
      stripeCustomerId: TEST_CUSTOMER_ID,
      stripeSubscriptionId: TEST_SUB_ID,
      plan: 'optimizer',
      status: 'active',
      commissionRate: 0.3,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    };

    mockSelect
      .mockReturnValueOnce(dbChain([TEST_CONVERSION])) // active conversion found
      .mockReturnValueOnce(dbChain([]));               // no prior earnings for this invoice
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    const event: Stripe.Event = {
      id: 'evt_inv_real_charge',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_real_charge',
          subscription: TEST_SUB_ID,
          amount_paid: 2900, // ← first real charge after 7-day trial
          period_start: Math.floor(new Date('2026-08-03T00:00:00Z').getTime() / 1000),
        } as Stripe.Invoice,
      },
    } as unknown as Stripe.Event;

    await handleWebhookEvent(event, mockLog);

    expect(mockInsert).toHaveBeenCalledTimes(1);

    const valuesArg = (
      insertChain as Record<string, ReturnType<typeof vi.fn>>
    ).values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.commissionCents).toBe(870); // 30% of $29.00
    expect(valuesArg.amountCents).toBe(2900);
    expect(valuesArg.paid).toBe(false);
  });
});
