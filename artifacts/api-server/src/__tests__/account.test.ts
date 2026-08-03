/**
 * Tests for the /api/account/* endpoints.
 *
 * All Stripe API calls are mocked via vi.mock so no real network traffic is made.
 *
 * Covers:
 *  - POST /api/account/auth    — email lookup, JWT issuance
 *  - GET  /api/account         — subscription details, invoices, PM
 *  - POST /api/account/re-issue-token
 *  - POST /api/account/cancel
 *  - POST /api/account/uncancel
 *  - POST /api/account/change-plan
 *  - POST /api/account/update-payment
 *  - Auth middleware: missing token, expired token, tampered token
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Mock Stripe BEFORE importing app (vitest hoists vi.mock())
// ---------------------------------------------------------------------------

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn().mockResolvedValue('pk_test_mock'),
  getStripeSecretKey: vi.fn().mockResolvedValue('sk_test_mock'),
}));

import app from '../app';
import { getUncachableStripeClient } from '../stripeClient';
import { makePaidToken, makeExpiredToken, makeTamperedToken, MALFORMED_TOKEN } from './helpers/jwt';
import {
  createStripeMock,
  makeActiveSub,
  makeCustomer,
  makeInvoice,
  TEST_CUSTOMER_ID,
  TEST_SUB_ID,
  TEST_ITEM_ID,
  OPTIMIZER_PRICE_ID,
  OPTIMIZER_PRO_PRICE_ID,
  type StripeMock,
} from './helpers/stripeMock';

const TEST_SECRET = 'test-secret-for-automated-tests-only';

function decodeToken(token: string) {
  return jwt.verify(token, TEST_SECRET) as {
    tier: string;
    customerId: string;
    product: string;
    exp: number;
  };
}

let stripe: StripeMock;

beforeEach(() => {
  stripe = createStripeMock();
  vi.mocked(getUncachableStripeClient).mockResolvedValue(
    stripe as unknown as Stripe,
  );
});

// ---------------------------------------------------------------------------
// POST /api/account/auth
// ---------------------------------------------------------------------------

describe('POST /api/account/auth', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/account/auth').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-email string', async () => {
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'notanemail' });
    expect(res.status).toBe(400);
  });

  it('returns 404 with errorCode "not_found" when no Stripe customer found', async () => {
    stripe.customers.search.mockResolvedValue({ data: [] });
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('not_found');
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 403 with errorCode "subscription_inactive" when customer has a canceled optimizer subscription', async () => {
    // Customer found, but the optimizer subscription is canceled (not active/trialing)
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          status: 'canceled',
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900, currency: 'usd' } }],
          },
        }),
      ],
    });
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('subscription_inactive');
    expect(typeof res.body.error).toBe('string');
  });

  it('returns 403 with errorCode "subscription_inactive" when customer has a past_due optimizer subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          status: 'past_due',
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900, currency: 'usd' } }],
          },
        }),
      ],
    });
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('subscription_inactive');
  });

  it('returns 403 with errorCode "no_subscription" when customer has only unrelated subscriptions', async () => {
    // Customer found but subscription uses an unrelated price (never had optimizer)
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: 'price_unrelated', unit_amount: 999, currency: 'usd' } }],
          },
        }),
      ],
    });
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('no_subscription');
  });

  it('returns 403 with errorCode "no_subscription" when customer has no subscriptions at all', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('no_subscription');
  });

  it('passes status: "all" to subscriptions.list so canceled subs are included', async () => {
    // Simulate a canceled optimizer sub (only visible with status: 'all')
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          status: 'canceled',
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900, currency: 'usd' } }],
          },
        }),
      ],
    });
    await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });
    expect(stripe.subscriptions.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'all' }),
    );
  });

  it('issues a 30-day JWT for a customer with an active optimizer subscription', async () => {
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const payload = decodeToken(res.body.token);
    expect(payload.tier).toBe('paid');
    expect(payload.customerId).toBe(TEST_CUSTOMER_ID);
    expect(payload.product).toBe('optimizer');
    // Expires in ~30 days (within 1 minute tolerance)
    const nowSec = Math.floor(Date.now() / 1000);
    expect(payload.exp - nowSec).toBeGreaterThan(30 * 24 * 3600 - 60);
  });

  it('issues pro token when customer has an optimizer-pro subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900, currency: 'usd' } }],
          },
        }),
      ],
    });
    const res = await request(app)
      .post('/api/account/auth')
      .send({ email: 'pro@example.com' });
    expect(res.status).toBe(200);
    const payload = decodeToken(res.body.token);
    expect(payload.product).toBe('optimizer-pro');
  });

  // -------------------------------------------------------------------------
  // Timeout guard: primary Stripe calls must not hang the server
  // -------------------------------------------------------------------------

  it('returns 502 and responds promptly when the primary customers.search hangs', async () => {
    // Use a very short timeout so the test completes quickly
    process.env.AUTH_STRIPE_TIMEOUT_MS = '50';

    try {
      // customers.search resolves only after 200 ms — past the 50 ms timeout
      stripe.customers.search.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: [] }), 200)),
      );

      const start = Date.now();
      const res = await request(app)
        .post('/api/account/auth')
        .send({ email: 'test@example.com' });
      const elapsed = Date.now() - start;

      expect(res.status).toBe(502);
      // Should resolve well before the 200 ms mock delay (timeout fired first)
      expect(elapsed).toBeLessThan(180);
    } finally {
      delete process.env.AUTH_STRIPE_TIMEOUT_MS;
    }
  });

  it('returns 502 and responds promptly when subscriptions.list hangs', async () => {
    // customer found, but subscriptions.list never returns within timeout
    process.env.AUTH_STRIPE_TIMEOUT_MS = '50';

    try {
      // customers.search resolves immediately with a matching customer
      // subscriptions.list resolves only after 200 ms — past the 50 ms timeout
      stripe.subscriptions.list.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: [] }), 200)),
      );

      const start = Date.now();
      const res = await request(app)
        .post('/api/account/auth')
        .send({ email: 'test@example.com' });
      const elapsed = Date.now() - start;

      expect(res.status).toBe(502);
      expect(elapsed).toBeLessThan(180);
    } finally {
      delete process.env.AUTH_STRIPE_TIMEOUT_MS;
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/account
// ---------------------------------------------------------------------------

describe('GET /api/account', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/account');
    expect(res.status).toBe(401);
    expect(res.body.authRequired).toBe(true);
  });

  it('returns 401 + tokenExpired=true with an expired token', async () => {
    const res = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${makeExpiredToken()}`);
    expect(res.status).toBe(401);
    expect(res.body.tokenExpired).toBe(true);
  });

  it('returns 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${makeTamperedToken()}`);
    expect(res.status).toBe(401);
  });

  it('returns customer, subscription, paymentMethod, and invoices', async () => {
    const res = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(200);

    // Customer
    expect(res.body.customer.email).toBe('test@example.com');

    // Subscription
    expect(res.body.subscription.plan).toBe('optimizer');
    expect(res.body.subscription.status).toBe('active');
    expect(res.body.subscription.amount).toBe(2900);
    expect(res.body.subscription.cancelAtPeriodEnd).toBe(false);

    // Payment method
    expect(res.body.paymentMethod.brand).toBe('visa');
    expect(res.body.paymentMethod.last4).toBe('4242');

    // Invoices
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(res.body.invoices[0].status).toBe('paid');
    expect(res.body.invoices[0].amount).toBe(2900);
  });

  it('subscription.plan is "optimizer-pro" when the price matches', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900, currency: 'usd' } }],
          },
        }),
      ],
    });
    const res = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${makePaidToken({ product: 'optimizer-pro' })}`);
    expect(res.status).toBe(200);
    expect(res.body.subscription.plan).toBe('optimizer-pro');
    expect(res.body.subscription.amount).toBe(7900);
  });

  it('subscription is null when no active subscription found', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
    const res = await request(app)
      .get('/api/account')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/re-issue-token
// ---------------------------------------------------------------------------

describe('POST /api/account/re-issue-token', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/account/re-issue-token');
    expect(res.status).toBe(401);
  });

  it('returns 403 when no active subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
    const res = await request(app)
      .post('/api/account/re-issue-token')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(403);
  });

  it('issues a fresh 30-day JWT with the correct product', async () => {
    const res = await request(app)
      .post('/api/account/re-issue-token')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const payload = decodeToken(res.body.token);
    expect(payload.tier).toBe('paid');
    expect(payload.customerId).toBe(TEST_CUSTOMER_ID);
    expect(payload.product).toBe('optimizer');

    const nowSec = Math.floor(Date.now() / 1000);
    expect(payload.exp - nowSec).toBeGreaterThan(30 * 24 * 3600 - 60);
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/cancel
// ---------------------------------------------------------------------------

describe('POST /api/account/cancel', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/account/cancel');
    expect(res.status).toBe(401);
  });

  it('returns 404 when no active subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [] });
    const res = await request(app)
      .post('/api/account/cancel')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(404);
  });

  it('returns 422 when already scheduled for cancellation', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeActiveSub({ cancel_at_period_end: true })],
    });
    const res = await request(app)
      .post('/api/account/cancel')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(422);
  });

  it('calls stripe.subscriptions.update with cancel_at_period_end=true', async () => {
    stripe.subscriptions.update.mockResolvedValue(
      makeActiveSub({ cancel_at_period_end: true, cancel_at: Date.now() / 1000 + 86400 }),
    );
    const res = await request(app)
      .post('/api/account/cancel')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.cancelAtPeriodEnd).toBe(true);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      TEST_SUB_ID,
      expect.objectContaining({ cancel_at_period_end: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/uncancel
// ---------------------------------------------------------------------------

describe('POST /api/account/uncancel', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/account/uncancel');
    expect(res.status).toBe(401);
  });

  it('calls stripe.subscriptions.update with cancel_at_period_end=false', async () => {
    stripe.subscriptions.update.mockResolvedValue(
      makeActiveSub({ cancel_at_period_end: false }),
    );
    const res = await request(app)
      .post('/api/account/uncancel')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.cancelAtPeriodEnd).toBe(false);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      TEST_SUB_ID,
      expect.objectContaining({ cancel_at_period_end: false }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/change-plan
// ---------------------------------------------------------------------------

describe('POST /api/account/change-plan', () => {
  it('returns 400 for invalid plan value', async () => {
    const res = await request(app)
      .post('/api/account/change-plan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ plan: 'enterprise' });
    expect(res.status).toBe(400);
  });

  it('returns 422 when already on the requested plan', async () => {
    // Current plan is optimizer, requesting optimizer
    const res = await request(app)
      .post('/api/account/change-plan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ plan: 'optimizer' });
    expect(res.status).toBe(422);
  });

  it('upgrades optimizer → optimizer-pro and returns a new JWT', async () => {
    stripe.subscriptions.update.mockResolvedValue(
      makeActiveSub({
        items: {
          data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900, currency: 'usd' } }],
        },
      }),
    );
    const res = await request(app)
      .post('/api/account/change-plan')
      .set('Authorization', `Bearer ${makePaidToken()}`)
      .send({ plan: 'optimizer-pro' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('optimizer-pro');
    expect(typeof res.body.token).toBe('string');

    const payload = decodeToken(res.body.token);
    expect(payload.product).toBe('optimizer-pro');

    // Verify Stripe was called with the pro price ID and proration
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      TEST_SUB_ID,
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ price: OPTIMIZER_PRO_PRICE_ID }),
        ]),
        proration_behavior: 'always_invoice',
      }),
    );
  });

  it('downgrades optimizer-pro → optimizer and returns a new JWT', async () => {
    // Current plan is optimizer-pro
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          items: {
            data: [{ id: TEST_ITEM_ID, price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900, currency: 'usd' } }],
          },
        }),
      ],
    });
    stripe.subscriptions.update.mockResolvedValue(makeActiveSub());

    const res = await request(app)
      .post('/api/account/change-plan')
      .set('Authorization', `Bearer ${makePaidToken({ product: 'optimizer-pro' })}`).send({ plan: 'optimizer' });

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('optimizer');
    const payload = decodeToken(res.body.token);
    expect(payload.product).toBe('optimizer');
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      TEST_SUB_ID,
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ price: OPTIMIZER_PRICE_ID }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/account/update-payment
// ---------------------------------------------------------------------------

describe('POST /api/account/update-payment', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/account/update-payment');
    expect(res.status).toBe(401);
  });

  it('returns a SetupIntent clientSecret and publishableKey', async () => {
    const res = await request(app)
      .post('/api/account/update-payment')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.clientSecret).toBe('string');
    expect(res.body.clientSecret).toContain('seti_test');
    expect(typeof res.body.publishableKey).toBe('string');
  });

  it('creates the SetupIntent attached to the correct customer', async () => {
    await request(app)
      .post('/api/account/update-payment')
      .set('Authorization', `Bearer ${makePaidToken()}`);
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: TEST_CUSTOMER_ID }),
    );
  });
});
