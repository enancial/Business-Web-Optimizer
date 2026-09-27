/**
 * Tests for the trial reminder scheduled job (lib/trialReminder.ts).
 *
 * Covers:
 *  - Sends email to customers whose trial ends within the 24h window
 *  - Does NOT send when trial ends outside the window (too far away)
 *  - Does NOT send when trial has already ended (past)
 *  - Idempotency: skips subscriptions with trial_reminder_sent = 'true' in metadata
 *  - Marks subscription metadata as trial_reminder_sent after sending
 *  - Skips when customer has no email address
 *  - Skips when customer is deleted
 *  - Includes correct plan name and amount for Optimizer Pro
 *  - Does not throw when SMTP2Go returns a failure — logs error and continues
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
}));

import { sendPendingTrialReminders, REMINDER_WINDOW_HOURS } from '../lib/trialReminder';
import { getUncachableStripeClient } from '../stripeClient';
import {
  createStripeMock,
  makeCustomer,
  TEST_CUSTOMER_ID,
  TEST_SUB_ID,
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

const NOW_SEC = Math.floor(Date.now() / 1000);
/** trial_end 20 hours from now — well inside the 25h window */
const TRIAL_END_IN_20H = NOW_SEC + 20 * 3600;
/** trial_end 30 hours from now — outside the 25h window */
const TRIAL_END_IN_30H = NOW_SEC + 30 * 3600;
/** trial_end 2 hours ago — already expired */
const TRIAL_END_PAST = NOW_SEC - 2 * 3600;

function makeTrialSub(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_SUB_ID,
    status: 'trialing',
    customer: TEST_CUSTOMER_ID,
    trial_end: TRIAL_END_IN_20H,
    metadata: {},
    items: {
      data: [{ id: 'si_test', price: { id: OPTIMIZER_PRICE_ID, unit_amount: 2900 } }],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let stripe: StripeMock;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();

  stripe = createStripeMock();

  // Default: one trialing subscription ending in 20h
  stripe.subscriptions.list.mockResolvedValue({ data: [makeTrialSub()] });

  // Default: customer has a valid email
  stripe.customers.retrieve.mockResolvedValue(
    makeCustomer({ email: 'user@example.com' }),
  );

  // Default: subscription update succeeds
  stripe.subscriptions.update.mockResolvedValue(makeTrialSub({
    metadata: { trial_reminder_sent: 'true' },
  }));

  vi.mocked(getUncachableStripeClient).mockResolvedValue(stripe as unknown as Stripe);

  // Stub fetch for SMTP2Go
  fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ email_id: 'test-email-id' }] }),
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchSpy);

  process.env.SMTP2GO_API_KEY = 'test-smtp-key';
  process.env.OPTIMIZER_PRICE_ID = OPTIMIZER_PRICE_ID;
  process.env.OPTIMIZER_PRO_PRICE_ID = OPTIMIZER_PRO_PRICE_ID;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** The single email in the /email/batch payload of the first fetch call. */
function sentEmail(): unknown {
  const payload = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as { emails: unknown[] };
  expect(payload.emails).toHaveLength(1);
  return payload.emails[0];
}

describe('sendPendingTrialReminders — 24h window', () => {
  it('sends an email when the trial ends within the reminder window', async () => {
    await sendPendingTrialReminders(mockLog);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.smtp2go.com/v3/email/batch',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = sentEmail() as {
      to: string[];
      subject: string;
      html_body: string;
    };
    expect(body.to).toEqual(['user@example.com']);
    expect(body.subject).toMatch(/trial ends tomorrow/i);
    expect(body.html_body).toContain('$29');
    expect(body.html_body).toContain('Optimizer');
  });

  it(`does NOT send when trial_end is beyond ${REMINDER_WINDOW_HOURS}h from now`, async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeTrialSub({ trial_end: TRIAL_END_IN_30H })],
    });

    await sendPendingTrialReminders(mockLog);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT send when the trial has already expired', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeTrialSub({ trial_end: TRIAL_END_PAST })],
    });

    await sendPendingTrialReminders(mockLog);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('sendPendingTrialReminders — idempotency', () => {
  it('skips subscriptions already marked trial_reminder_sent = true', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [makeTrialSub({ metadata: { trial_reminder_sent: 'true' } })],
    });

    await sendPendingTrialReminders(mockLog);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks subscription metadata trial_reminder_sent after sending', async () => {
    await sendPendingTrialReminders(mockLog);

    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      TEST_SUB_ID,
      expect.objectContaining({ metadata: { trial_reminder_sent: 'true' } }),
    );
  });
});

describe('sendPendingTrialReminders — customer edge cases', () => {
  it('skips the email when the customer has no email address', async () => {
    stripe.customers.retrieve.mockResolvedValue(makeCustomer({ email: null }));

    await sendPendingTrialReminders(mockLog);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: TEST_CUSTOMER_ID }),
      expect.stringContaining('no email'),
    );
  });

  it('skips the email when the customer is deleted', async () => {
    stripe.customers.retrieve.mockResolvedValue({ id: TEST_CUSTOMER_ID, deleted: true });

    await sendPendingTrialReminders(mockLog);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('sendPendingTrialReminders — plan detection', () => {
  it('sends Optimizer Pro email and amount for pro plan subscriptions', async () => {
    stripe.subscriptions.list.mockResolvedValue({
      data: [
        makeTrialSub({
          items: {
            data: [{ id: 'si_pro', price: { id: OPTIMIZER_PRO_PRICE_ID, unit_amount: 7900 } }],
          },
        }),
      ],
    });

    await sendPendingTrialReminders(mockLog);

    const body = sentEmail() as {
      html_body: string;
      subject: string;
    };
    expect(body.html_body).toContain('Optimizer Pro');
    expect(body.html_body).toContain('$79');
    expect(body.subject).toContain('Optimizer Pro');
  });
});

describe('sendPendingTrialReminders — error resilience', () => {
  it('does not throw when SMTP2Go returns a failure — logs error and continues', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ data: { error: 'bad email', error_code: 'E_ApiResponseCodes.API_EXCEPTION' } }),
    } as unknown as Response);

    await expect(sendPendingTrialReminders(mockLog)).resolves.not.toThrow();

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
      'SMTP2Go send failed',
    );
  });

  it('treats HTTP 200 without an email_id as a failed send, not a success', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as unknown as Response);

    await sendPendingTrialReminders(mockLog);

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200 }),
      'SMTP2Go send failed',
    );
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('sends the key in the X-Smtp2go-Api-Key header, not the body', async () => {
    await sendPendingTrialReminders(mockLog);
    const init = fetchSpy.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(init.headers['X-Smtp2go-Api-Key']).toBe('test-smtp-key');
    expect(init.body).not.toContain('test-smtp-key');
  });

  it('continues processing remaining subscriptions when one customer retrieval fails', async () => {
    const sub1 = makeTrialSub({ id: 'sub_a', customer: 'cus_a' });
    const sub2 = makeTrialSub({ id: 'sub_b', customer: 'cus_b' });

    stripe.subscriptions.list.mockResolvedValue({ data: [sub1, sub2] });

    // First customer throws; second succeeds
    stripe.customers.retrieve
      .mockRejectedValueOnce(new Error('Stripe error'))
      .mockResolvedValueOnce(makeCustomer({ email: 'second@example.com' }));

    await expect(sendPendingTrialReminders(mockLog)).resolves.not.toThrow();

    // Second customer's email should still be sent
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = sentEmail() as { to: string[] };
    expect(body.to).toEqual(['second@example.com']);
  });
});
