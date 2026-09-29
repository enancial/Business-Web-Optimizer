/**
 * Owner notices added by the 2026-09-29 funnel audit.
 *
 * Covers:
 *  - Card saved on a trialing BWO subscription → one internal notice to LEAD_NOTIFY_EMAIL
 *  - The notice says plainly when the Stripe customer has no email on file
 *  - Unrelated subscription updates send nothing
 *  - Subscriptions for other products on the shared Stripe account send nothing
 *  - Cancellation scheduled → notice; subscription deleted → notice
 *  - SMTP2GO failure never throws out of the webhook handler
 *  - Missing LEAD_NOTIFY_EMAIL → no send, no throw
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock('../stripeClient', () => ({ getUncachableStripeClient: vi.fn() }));
vi.mock('@workspace/db', () => ({
  db: { update: mockUpdate, select: vi.fn(), insert: vi.fn() },
  affiliates: {},
  affiliateConversions: { stripeSubscriptionId: 'x', id: 'id' },
  affiliateEarnings: {},
}));

import { handleWebhookEvent } from '../lib/subscriptionWebhook';
import { getUncachableStripeClient } from '../stripeClient';

const log = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
  child: vi.fn(), level: 'silent', silent: vi.fn(), isLevelEnabled: vi.fn(() => false),
} as unknown as import('pino').Logger;

let fetchSpy: ReturnType<typeof vi.fn>;
let customerEmail: string | null;

function sub(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_test_1',
    customer: 'cus_test_1',
    status: 'trialing',
    trial_end: 1790000000,
    default_payment_method: 'pm_test_1',
    cancel_at_period_end: false,
    metadata: { product: 'optimizer' },
    items: { data: [{ price: { id: 'price_opt' } }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function event(type: string, object: Stripe.Subscription, previous?: Record<string, unknown>): Stripe.Event {
  return { id: 'evt_test', type, data: { object, ...(previous ? { previous_attributes: previous } : {}) } } as unknown as Stripe.Event;
}

function sent(i = 0): { to: string[]; subject: string; text_body: string } {
  return JSON.parse(fetchSpy.mock.calls[i][1].body as string).emails[0];
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SMTP2GO_API_KEY = 'test-smtp-key';
  process.env.LEAD_NOTIFY_EMAIL = 'owner@example.com';
  process.env.OPTIMIZER_PRICE_ID = 'price_opt';
  process.env.OPTIMIZER_PRO_PRICE_ID = 'price_pro';
  customerEmail = null;
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ email_id: 'e1' }] }) });
  vi.stubGlobal('fetch', fetchSpy);
  vi.mocked(getUncachableStripeClient).mockResolvedValue({
    customers: { retrieve: vi.fn(async () => ({ id: 'cus_test_1', email: customerEmail })) },
  } as unknown as Awaited<ReturnType<typeof getUncachableStripeClient>>);
  const c: Record<string, unknown> = {};
  for (const n of ['set', 'where']) c[n] = vi.fn().mockReturnValue(c);
  c.returning = vi.fn().mockResolvedValue([]);
  mockUpdate.mockReturnValue(c);
});

describe('owner notices', () => {
  it('notifies once when a card is saved on a trialing BWO subscription, flagging a missing email', async () => {
    await handleWebhookEvent(event('customer.subscription.updated', sub(), { default_payment_method: null }), log);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const m = sent();
    expect(m.to).toEqual(['owner@example.com']);
    expect(m.subject).toContain('trial started (card saved)');
    expect(m.text_body).toContain('NONE ON FILE');
    expect(m.text_body).toContain('sub_test_1');
  });

  it('includes the customer email when Stripe has one', async () => {
    customerEmail = 'buyer@example.com';
    await handleWebhookEvent(event('customer.subscription.updated', sub(), { default_payment_method: null }), log);
    expect(sent().text_body).toContain('buyer@example.com');
    expect(sent().text_body).not.toContain('NONE ON FILE');
  });

  it('sends nothing for unrelated updates', async () => {
    await handleWebhookEvent(event('customer.subscription.updated', sub(), { metadata: {} }), log);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores subscriptions for other products on the shared Stripe account', async () => {
    const other = sub({ metadata: {}, items: { data: [{ price: { id: 'price_someone_else' } }] } });
    await handleWebhookEvent(event('customer.subscription.updated', other, { default_payment_method: null }), log);
    await handleWebhookEvent(event('customer.subscription.deleted', other), log);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('notifies when cancellation is scheduled', async () => {
    await handleWebhookEvent(event('customer.subscription.updated', sub({ cancel_at_period_end: true }), { cancel_at_period_end: false }), log);
    expect(sent().subject).toContain('cancellation scheduled');
  });

  it('notifies when a BWO subscription ends and still runs the affiliate update', async () => {
    await handleWebhookEvent(event('customer.subscription.deleted', sub({ status: 'canceled' })), log);
    expect(mockUpdate).toHaveBeenCalled();
    expect(sent().subject).toContain('subscription ended');
  });

  it('never throws when SMTP2GO fails', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));
    await expect(
      handleWebhookEvent(event('customer.subscription.updated', sub(), { default_payment_method: null }), log),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });

  it('sends nothing and does not throw when LEAD_NOTIFY_EMAIL is unset', async () => {
    delete process.env.LEAD_NOTIFY_EMAIL;
    await handleWebhookEvent(event('customer.subscription.deleted', sub()), log);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
