/**
 * Tests for the subscriptionWebhook handler.
 *
 * Covers:
 *  - Subscription is created when customer has no existing active subscription
 *  - Duplicate creation is skipped (idempotency) when customer already has
 *    an active optimizer/optimizer-pro subscription with the SAME price
 *  - Duplicate creation is skipped when customer already has a subscription
 *    with a DIFFERENT optimizer price (cross-plan double-billing prevention)
 *  - Webhook is a no-op for non-subscription payment intents
 *  - Webhook is a no-op for non-payment_intent events
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

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
  OPTIMIZER_PRO_PRICE_ID,
  type StripeMock,
} from './helpers/stripeMock';

// ---------------------------------------------------------------------------
// Minimal pino-compatible logger mock
// ---------------------------------------------------------------------------

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
  level: 'silent',
  silent: vi.fn(),
  isLevelEnabled: vi.fn(() => false),
} as unknown as import('pino').Logger;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePaymentIntentEvent(
  overrides: Partial<{
    id: string;
    status: string;
    customer: string;
    payment_method: string;
    metadata: Record<string, string>;
  }> = {},
): Stripe.Event {
  return {
    id: 'evt_test',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_webhook',
        status: 'succeeded',
        customer: TEST_CUSTOMER_ID,
        payment_method: 'pm_test',
        metadata: {
          action: 'create_subscription',
          price_id: OPTIMIZER_PRICE_ID,
          product: 'optimizer',
        },
        ...overrides,
      } as unknown as Stripe.PaymentIntent,
    },
  } as unknown as Stripe.Event;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let stripe: StripeMock & { subscriptions: StripeMock['subscriptions'] & { create: ReturnType<typeof vi.fn> } };

beforeEach(() => {
  const base = createStripeMock();
  stripe = {
    ...base,
    subscriptions: {
      ...base.subscriptions,
      create: vi.fn().mockResolvedValue(makeActiveSub()),
    },
  } as typeof stripe;

  // Default: no existing subscriptions → creation should proceed
  stripe.subscriptions.list.mockResolvedValue({ data: [] });

  vi.mocked(getUncachableStripeClient).mockResolvedValue(
    stripe as unknown as Stripe,
  );

  vi.clearAllMocks();
  // Re-apply after clearAllMocks
  stripe.subscriptions.list.mockResolvedValue({ data: [] });
  stripe.subscriptions.create.mockResolvedValue(makeActiveSub());
  stripe.customers.update.mockResolvedValue({ id: TEST_CUSTOMER_ID } as Stripe.Customer);
  vi.mocked(getUncachableStripeClient).mockResolvedValue(stripe as unknown as Stripe);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subscriptionWebhook — idempotency (Task #10)', () => {
  it('creates a subscription when customer has no existing active subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({ data: [] });

    await handleWebhookEvent(makePaymentIntentEvent(), mockLog);

    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: TEST_CUSTOMER_ID,
        items: expect.arrayContaining([
          expect.objectContaining({ price: OPTIMIZER_PRICE_ID }),
        ]),
      }),
      { idempotencyKey: 'create-sub-pi_test_webhook' },
    );
  });

  it('prevents duplicate — skips creation when customer already has the SAME active optimizer subscription', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeActiveSub()], // same price already active
    });

    await handleWebhookEvent(makePaymentIntentEvent(), mockLog);

    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ existingSubscriptionId: expect.any(String) }),
      expect.stringContaining('Skipping duplicate subscription creation'),
    );
  });

  it('prevents duplicate — skips creation when customer already has a DIFFERENT optimizer plan (cross-plan double-billing)', async () => {
    // Customer already has optimizer-pro; trying to buy plain optimizer via checkout
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeActiveSub({
          items: {
            data: [
              {
                id: 'si_pro',
                price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900, currency: 'usd' },
              },
            ],
          },
        }),
      ],
    });

    // Requesting plain optimizer
    await handleWebhookEvent(
      makePaymentIntentEvent({
        metadata: {
          action: 'create_subscription',
          price_id: OPTIMIZER_PRICE_ID,
          product: 'optimizer',
        },
      }),
      mockLog,
    );

    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it('prevents duplicate — called twice for the same customer creates only one subscription', async () => {
    // First call: no existing subscription
    stripe.subscriptions.list.mockResolvedValueOnce({ data: [] });
    // Second call: the subscription now exists
    stripe.subscriptions.list.mockResolvedValueOnce({
      data: [makeActiveSub()],
    });

    await handleWebhookEvent(makePaymentIntentEvent(), mockLog);
    await handleWebhookEvent(makePaymentIntentEvent(), mockLog);

    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
  });

  it("passes Stripe idempotencyKey 'create-sub-' + PaymentIntent id (same string as BWD)", async () => {
    await handleWebhookEvent(makePaymentIntentEvent(), mockLog);

    expect(stripe.subscriptions.create).toHaveBeenCalledTimes(1);
    expect(stripe.subscriptions.create.mock.calls[0][1]).toEqual({
      idempotencyKey: 'create-sub-pi_test_webhook',
    });
  });

  it('concurrent deliveries that both pass the list check send the SAME idempotency key (Stripe returns one subscription)', async () => {
    // Race: both deliveries list before either create lands.
    stripe.subscriptions.list.mockResolvedValue({ data: [] });

    await Promise.all([
      handleWebhookEvent(makePaymentIntentEvent(), mockLog),
      handleWebhookEvent(makePaymentIntentEvent(), mockLog),
    ]);

    const keys = stripe.subscriptions.create.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys).toEqual(['create-sub-pi_test_webhook', 'create-sub-pi_test_webhook']);
  });

  it('uses a different idempotency key for a different PaymentIntent', async () => {
    await handleWebhookEvent(makePaymentIntentEvent({ id: 'pi_test_other' }), mockLog);

    expect(stripe.subscriptions.create.mock.calls[0][1]).toEqual({
      idempotencyKey: 'create-sub-pi_test_other',
    });
  });

  it('is a no-op for payment intents not tagged with create_subscription action', async () => {
    await handleWebhookEvent(
      makePaymentIntentEvent({ metadata: { action: 'other', price_id: OPTIMIZER_PRICE_ID, product: 'optimizer' } }),
      mockLog,
    );
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it('is a no-op for non-payment_intent event types', async () => {
    const event = { id: 'evt_other', type: 'customer.created', data: { object: {} } } as unknown as Stripe.Event;
    await handleWebhookEvent(event, mockLog);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it('logs an error and returns early when price_id, customer, or payment_method is missing', async () => {
    await handleWebhookEvent(
      makePaymentIntentEvent({ customer: '', metadata: { action: 'create_subscription', price_id: '', product: 'optimizer' } }),
      mockLog,
    );
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalled();
  });
});
