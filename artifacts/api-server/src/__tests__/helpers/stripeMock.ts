/**
 * Stripe mock factory for automated tests.
 *
 * Usage:
 *   import { createStripeMock, type StripeMock } from './helpers/stripeMock';
 *   let stripe: StripeMock;
 *   beforeEach(() => { stripe = createStripeMock(); });
 *   vi.mocked(getUncachableStripeClient).mockResolvedValue(stripe as unknown as Stripe);
 */
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared fixture data
// ---------------------------------------------------------------------------

export const TEST_CUSTOMER_ID = 'cus_test123';
export const TEST_SUB_ID = 'sub_test456';
export const TEST_ITEM_ID = 'si_test789';
export const OPTIMIZER_PRICE_ID = 'price_optimizer_test';
export const OPTIMIZER_PRO_PRICE_ID = 'price_optimizer_pro_test';
export const TEST_PERIOD_END = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

/** A minimal Stripe active subscription fixture (optimizer plan). */
export function makeActiveSub(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUB_ID,
    status: 'active',
    cancel_at_period_end: false,
    cancel_at: null,
    current_period_end: TEST_PERIOD_END,
    items: {
      data: [
        {
          id: TEST_ITEM_ID,
          price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900, currency: 'usd' },
        },
      ],
    },
    ...overrides,
  };
}

/** A minimal Stripe customer fixture. */
export function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CUSTOMER_ID,
    email: 'test@example.com',
    name: 'Test User',
    deleted: false,
    invoice_settings: {
      default_payment_method: {
        id: 'pm_test',
        card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2027 },
      },
    },
    ...overrides,
  };
}

/** A minimal Stripe invoice fixture. */
export function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_test001',
    number: 'TEST-001',
    amount_paid: 2900,
    currency: 'usd',
    created: Math.floor(Date.now() / 1000) - 86400,
    status: 'paid',
    invoice_pdf: 'https://stripe.com/test-invoice.pdf',
    hosted_invoice_url: 'https://invoice.stripe.com/test',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

export interface StripeMock {
  customers: {
    search: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  subscriptions: {
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  invoices: {
    list: ReturnType<typeof vi.fn>;
  };
  setupIntents: {
    create: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
  };
  paymentMethods: {
    attach: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  paymentIntents: {
    retrieve: ReturnType<typeof vi.fn>;
  };
}

export function createStripeMock(): StripeMock {
  return {
    customers: {
      search: vi.fn().mockResolvedValue({ data: [makeCustomer()] }),
      retrieve: vi.fn().mockResolvedValue(makeCustomer()),
      update: vi.fn().mockResolvedValue(makeCustomer()),
    },
    subscriptions: {
      list: vi.fn().mockResolvedValue({ data: [makeActiveSub()] }),
      update: vi.fn().mockResolvedValue(makeActiveSub()),
      create: vi.fn().mockResolvedValue({
        id: TEST_SUB_ID,
        status: 'trialing',
        items: { data: [{ price: { id: OPTIMIZER_PRICE_ID } }] },
        pending_setup_intent: { client_secret: 'seti_test_secret_sub' },
      }),
      cancel: vi.fn().mockResolvedValue({ id: TEST_SUB_ID, status: 'canceled' }),
    },
    invoices: {
      list: vi.fn().mockResolvedValue({ data: [makeInvoice()] }),
    },
    setupIntents: {
      create: vi.fn().mockResolvedValue({ client_secret: 'seti_test_secret' }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'seti_test',
        status: 'succeeded',
        customer: TEST_CUSTOMER_ID,
      }),
    },
    paymentMethods: {
      attach: vi.fn().mockResolvedValue({ id: 'pm_new' }),
      retrieve: vi.fn().mockResolvedValue({ id: 'pm_new', card: { brand: 'visa', last4: '0002' } }),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        id: 'pi_test',
        status: 'succeeded',
        customer: TEST_CUSTOMER_ID,
        metadata: { product: 'optimizer' },
      }),
    },
  };
}
