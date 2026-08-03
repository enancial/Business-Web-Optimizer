/**
 * End-to-end tests for the affiliate referral flow.
 *
 * Covers:
 *  - Affiliate signup via POST /api/affiliates/join
 *  - payment_intent.succeeded → affiliate conversion recorded
 *  - payment_intent.succeeded → no DB call when no affiliate_code in metadata
 *  - payment_intent.succeeded → warning logged for unknown affiliate code
 *  - invoice.paid → earnings row created with 30% commission
 *  - invoice.paid → correct period_month/period_year from invoice.period_start
 *  - invoice.paid → idempotent (same invoice twice → one row)
 *  - invoice.paid → skips after 12-month commission window expires
 *  - invoice.paid → still records at 11 months (inside window)
 *  - invoice.paid → no-op when subscription has no affiliate conversion
 *  - customer.subscription.deleted → conversion marked 'canceled'
 *  - customer.subscription.deleted → no-op when no matching conversion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before vi.mock() calls
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
}));

import { handleWebhookEvent } from '../lib/subscriptionWebhook';
import { getUncachableStripeClient } from '../stripeClient';
import {
  createStripeMock,
  makeActiveSub,
  TEST_CUSTOMER_ID,
  OPTIMIZER_PRICE_ID,
  type StripeMock,
} from './helpers/stripeMock';

// ---------------------------------------------------------------------------
// Fluent DB chain mock
//
// Returns an object that:
//   - Accepts any chained method call (from, where, limit, values, …) and
//     returns itself so Drizzle-style builder chains resolve without throwing.
//   - Resolves to `resolveWith` when awaited.
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
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_AFFILIATE = {
  id: 1,
  name: 'Jane Doe',
  email: 'jane@example.com',
  code: 'AFFTEST1',
  active: true,
  website: null,
  promotionMethod: null,
  paypalEmail: null,
  otpCode: null,
  otpExpiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const TEST_CONVERSION = {
  id: 1,
  affiliateId: 1,
  stripeCustomerId: TEST_CUSTOMER_ID,
  stripeSubscriptionId: 'sub_aff_test',
  plan: 'optimizer',
  status: 'active',
  commissionRate: 0.3,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const mockLog = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn(), level: 'silent',
  silent: vi.fn(), isLevelEnabled: vi.fn(() => false),
} as unknown as import('pino').Logger;

// ---------------------------------------------------------------------------
// Stripe mock setup
// ---------------------------------------------------------------------------

type StripeWithCreate = StripeMock & {
  subscriptions: StripeMock['subscriptions'] & { create: ReturnType<typeof vi.fn> };
};

let stripe: StripeWithCreate;

beforeEach(() => {
  // resetAllMocks clears both call history AND unconsumed mockReturnValueOnce
  // queues so no stale setup leaks from one test into the next.
  vi.resetAllMocks();

  const base = createStripeMock();
  stripe = {
    ...base,
    subscriptions: {
      ...base.subscriptions,
      create: vi.fn().mockResolvedValue({
        id: 'sub_aff_test',
        status: 'active',
        items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
      }),
    },
  } as StripeWithCreate;

  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.customers.update.mockResolvedValue({ id: TEST_CUSTOMER_ID });
  vi.mocked(getUncachableStripeClient).mockResolvedValue(stripe as unknown as Stripe);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

function makePaymentIntentEvent(
  metadata: Record<string, string> = {},
): Stripe.Event {
  return {
    id: 'evt_pi_test',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_aff_test',
        status: 'succeeded',
        customer: TEST_CUSTOMER_ID,
        payment_method: 'pm_test',
        metadata: {
          action: 'create_subscription',
          price_id: OPTIMIZER_PRICE_ID,
          product: 'optimizer',
          ...metadata,
        },
      } as Stripe.PaymentIntent,
    },
  } as unknown as Stripe.Event;
}

function makeInvoicePaidEvent(overrides: Partial<Stripe.Invoice> = {}): Stripe.Event {
  return {
    id: 'evt_inv_test',
    type: 'invoice.paid',
    data: {
      object: {
        id: 'in_aff_test',
        subscription: 'sub_aff_test',
        amount_paid: 2900,
        period_start: Math.floor(new Date('2026-08-01T00:00:00Z').getTime() / 1000),
        ...overrides,
      } as Stripe.Invoice,
    },
  } as unknown as Stripe.Event;
}

function makeSubscriptionDeletedEvent(subscriptionId = 'sub_aff_test'): Stripe.Event {
  return {
    id: 'evt_del_test',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: subscriptionId,
        status: 'canceled',
        items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
      } as Stripe.Subscription,
    },
  } as unknown as Stripe.Event;
}

function makeSubscriptionCreatedEvent(
  overrides: { status?: string; metadata?: Record<string, string> } = {},
): Stripe.Event {
  return {
    id: 'evt_sub_created_test',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_trial_test',
        status: overrides.status ?? 'trialing',
        customer: TEST_CUSTOMER_ID,
        metadata: overrides.metadata ?? {},
        items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
      } as Stripe.Subscription,
    },
  } as unknown as Stripe.Event;
}

// ===========================================================================
// Test suites
// ===========================================================================

// ---------------------------------------------------------------------------
// Affiliate signup
// ---------------------------------------------------------------------------

describe('Affiliate signup — POST /api/affiliates/join', () => {
  it('creates an affiliate and returns a unique code and referral links', async () => {
    // Import app lazily so the DB mock is already in place
    const { default: app } = await import('../app');

    // 1. No duplicate email
    mockSelect.mockReturnValueOnce(dbChain([]));
    // 2. Code collision check → unique on first attempt
    mockSelect.mockReturnValueOnce(dbChain([]));
    // 3. Insert returning the created affiliate
    mockInsert.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));

    const res = await request(app)
      .post('/api/affiliates/join')
      .send({ name: 'Jane Doe', email: 'jane@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.code).toBe('AFFTEST1');
    expect(res.body.links.optimizer).toContain('ref=AFFTEST1');
    expect(res.body.links.optimizerPro).toContain('ref=AFFTEST1');
  });

  it('returns 409 when the email is already registered', async () => {
    const { default: app } = await import('../app');

    // Duplicate email found
    mockSelect.mockReturnValueOnce(dbChain([{ id: 99 }]));

    const res = await request(app)
      .post('/api/affiliates/join')
      .send({ name: 'Jane Doe', email: 'jane@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// payment_intent.succeeded — affiliate conversion recording
// ---------------------------------------------------------------------------

describe('Affiliate flow — payment_intent.succeeded', () => {
  it('records a conversion row when checkout includes a valid affiliate_code', async () => {
    // DB calls in recordAffiliateConversion:
    //   1. select affiliate by code   → [TEST_AFFILIATE]
    //   2. insert conversion row      → (void)
    mockSelect.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    await handleWebhookEvent(
      makePaymentIntentEvent({ affiliate_code: 'AFFTEST1' }),
      mockLog,
    );

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ affiliateId: 1, plan: 'optimizer' }),
      expect.stringContaining('Affiliate conversion recorded'),
    );
  });

  it('stores commission_rate = 0.30 on the conversion row', async () => {
    mockSelect.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    await handleWebhookEvent(
      makePaymentIntentEvent({ affiliate_code: 'AFFTEST1' }),
      mockLog,
    );

    const valuesArg = (
      insertChain as Record<string, ReturnType<typeof vi.fn>>
    ).values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.commissionRate).toBe(0.3);
    expect(valuesArg.plan).toBe('optimizer');
  });

  it('stores plan = optimizer-pro for a Pro checkout', async () => {
    mockSelect.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    await handleWebhookEvent(
      makePaymentIntentEvent({ affiliate_code: 'AFFTEST1', product: 'optimizer-pro' }),
      mockLog,
    );

    const valuesArg = (
      insertChain as Record<string, ReturnType<typeof vi.fn>>
    ).values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.plan).toBe('optimizer-pro');
  });

  it('logs a warning and skips insert when the affiliate_code is not found in DB', async () => {
    mockSelect.mockReturnValueOnce(dbChain([])); // code not found

    await handleWebhookEvent(
      makePaymentIntentEvent({ affiliate_code: 'BADCODE1' }),
      mockLog,
    );

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ affiliateCode: 'BADCODE1' }),
      expect.stringContaining('not found — skipping conversion'),
    );
  });

  it('makes no DB calls when no affiliate_code is present in metadata', async () => {
    // No affiliate_code → recordAffiliateConversion returns immediately
    await handleWebhookEvent(makePaymentIntentEvent(), mockLog);

    // Only DB-touching code in this path is recordAffiliateConversion's
    // early-return guard — so zero select/insert calls expected.
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// invoice.paid — earnings accrual
// ---------------------------------------------------------------------------

describe('Affiliate flow — invoice.paid', () => {
  it('creates an earnings row with 30% of invoice amount_paid', async () => {
    mockSelect
      .mockReturnValueOnce(dbChain([TEST_CONVERSION])) // active conversion found
      .mockReturnValueOnce(dbChain([]));               // no prior earnings for this invoice
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    await handleWebhookEvent(makeInvoicePaidEvent(), mockLog);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const valuesArg = (
      insertChain as Record<string, ReturnType<typeof vi.fn>>
    ).values.mock.calls[0][0] as Record<string, unknown>;

    expect(valuesArg.commissionCents).toBe(Math.round(2900 * 0.3)); // 870
    expect(valuesArg.amountCents).toBe(2900);
    expect(valuesArg.affiliateId).toBe(1);
    expect(valuesArg.paid).toBe(false);
  });

  it('derives period_month and period_year from invoice.period_start', async () => {
    mockSelect
      .mockReturnValueOnce(dbChain([TEST_CONVERSION]))
      .mockReturnValueOnce(dbChain([]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    // period_start = 2026-03-15 → month=3, year=2026
    const periodStart = Math.floor(new Date('2026-03-15T00:00:00Z').getTime() / 1000);
    await handleWebhookEvent(makeInvoicePaidEvent({ period_start: periodStart }), mockLog);

    const valuesArg = (
      insertChain as Record<string, ReturnType<typeof vi.fn>>
    ).values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.periodMonth).toBe(3);
    expect(valuesArg.periodYear).toBe(2026);
  });

  it('skips insert when earnings for the same invoice already exist (idempotency)', async () => {
    mockSelect
      .mockReturnValueOnce(dbChain([TEST_CONVERSION]))
      .mockReturnValueOnce(dbChain([{ id: 99 }])); // existing earnings row

    await handleWebhookEvent(makeInvoicePaidEvent(), mockLog);

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips earnings row when 12-month commission window has expired (exactly 12 months)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00Z')); // "now"

    const expiredConversion = {
      ...TEST_CONVERSION,
      // Created August 2025 — exactly 12 months elapsed → window closed
      createdAt: new Date('2025-08-02T00:00:00Z'),
    };
    mockSelect
      .mockReturnValueOnce(dbChain([expiredConversion]))
      .mockReturnValueOnce(dbChain([]));

    await handleWebhookEvent(makeInvoicePaidEvent(), mockLog);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ monthsElapsed: 12 }),
      expect.stringContaining('commission window expired'),
    );
  });

  it('still records earnings at 11 months (inside the 12-month window)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00Z'));

    const recentConversion = {
      ...TEST_CONVERSION,
      // Created September 2025 — 11 months elapsed → still in window
      createdAt: new Date('2025-09-02T00:00:00Z'),
    };
    mockSelect
      .mockReturnValueOnce(dbChain([recentConversion]))
      .mockReturnValueOnce(dbChain([]));
    mockInsert.mockReturnValueOnce(dbChain([]));

    await handleWebhookEvent(makeInvoicePaidEvent(), mockLog);

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there is no active affiliate conversion for the subscription', async () => {
    mockSelect.mockReturnValueOnce(dbChain([])); // no conversion found → early return

    await handleWebhookEvent(makeInvoicePaidEvent(), mockLog);

    expect(mockInsert).not.toHaveBeenCalled();
    // Only the conversion lookup runs — no second select for idempotency
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it('skips earnings for a $0 trial invoice (amount_paid = 0)', async () => {
    // The onInvoicePaid guard (amount_paid <= 0) must exit before any DB call
    await handleWebhookEvent(makeInvoicePaidEvent({ amount_paid: 0 }), mockLog);

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.deleted — stop future commissions
// ---------------------------------------------------------------------------

describe('Affiliate flow — customer.subscription.deleted', () => {
  it('marks the affiliate conversion as canceled', async () => {
    const updateChain = dbChain([{ id: 1 }]);
    mockUpdate.mockReturnValueOnce(updateChain);

    await handleWebhookEvent(makeSubscriptionDeletedEvent(), mockLog);

    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const setArg = (
      updateChain as Record<string, ReturnType<typeof vi.fn>>
    ).set.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.status).toBe('canceled');

    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub_aff_test' }),
      expect.stringContaining('marked as canceled'),
    );
  });

  it('is a no-op (no info log) when the subscription had no affiliate conversion', async () => {
    mockUpdate.mockReturnValueOnce(dbChain([])); // no rows updated

    await handleWebhookEvent(makeSubscriptionDeletedEvent(), mockLog);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // update was called but no info log fires when updated.length === 0
    expect(mockLog.info).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('marked as canceled'),
    );
  });
});

// ---------------------------------------------------------------------------
// customer.subscription.created — affiliate conversion at trial start
// ---------------------------------------------------------------------------

describe('Affiliate flow — customer.subscription.created (trial)', () => {
  it('records a conversion when status is trialing and affiliate_code is set', async () => {
    mockSelect.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    await handleWebhookEvent(
      makeSubscriptionCreatedEvent({
        status: 'trialing',
        metadata: { affiliate_code: 'AFFTEST1', product: 'optimizer', price_id: OPTIMIZER_PRICE_ID },
      }),
      mockLog,
    );

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ affiliateId: 1 }),
      expect.stringContaining('Affiliate conversion recorded'),
    );
  });

  it('records plan = optimizer-pro when product metadata says optimizer-pro', async () => {
    mockSelect.mockReturnValueOnce(dbChain([TEST_AFFILIATE]));
    const insertChain = dbChain([]);
    mockInsert.mockReturnValueOnce(insertChain);

    await handleWebhookEvent(
      makeSubscriptionCreatedEvent({
        status: 'trialing',
        metadata: { affiliate_code: 'AFFTEST1', product: 'optimizer-pro' },
      }),
      mockLog,
    );

    const valuesArg = (
      insertChain as Record<string, ReturnType<typeof vi.fn>>
    ).values.mock.calls[0][0] as Record<string, unknown>;
    expect(valuesArg.plan).toBe('optimizer-pro');
  });

  it('is a no-op when subscription status is active (not a trial)', async () => {
    await handleWebhookEvent(
      makeSubscriptionCreatedEvent({
        status: 'active',
        metadata: { affiliate_code: 'AFFTEST1', product: 'optimizer' },
      }),
      mockLog,
    );

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no affiliate_code in subscription metadata', async () => {
    await handleWebhookEvent(
      makeSubscriptionCreatedEvent({ status: 'trialing', metadata: {} }),
      mockLog,
    );

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
