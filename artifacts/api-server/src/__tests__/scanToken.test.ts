/**
 * Tests for POST /api/issue-scan-token
 *
 * Covers:
 *  - Missing / malformed paymentIntentId → 400
 *  - PaymentIntent not yet succeeded → 422
 *  - PaymentIntent missing action metadata → 422
 *  - Valid PaymentIntent → 200 + signed JWT with correct payload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
  getStripePublishableKey: vi.fn().mockResolvedValue('pk_test_mock'),
  getStripeSecretKey: vi.fn().mockResolvedValue('sk_test_mock'),
}));

import app from '../app';
import { getUncachableStripeClient } from '../stripeClient';
import { createStripeMock, TEST_CUSTOMER_ID, type StripeMock } from './helpers/stripeMock';

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
  // Configure a valid PaymentIntent for issue-scan-token
  stripe.paymentIntents.retrieve.mockResolvedValue({
    id: 'pi_valid',
    status: 'succeeded',
    customer: TEST_CUSTOMER_ID,
    metadata: { action: 'create_subscription', product: 'optimizer' },
  });
  vi.mocked(getUncachableStripeClient).mockResolvedValue(
    stripe as unknown as Stripe,
  );
});

describe('POST /api/issue-scan-token', () => {
  it('returns 400 when paymentIntentId is missing', async () => {
    const res = await request(app).post('/api/issue-scan-token').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when paymentIntentId does not start with pi_', async () => {
    const res = await request(app)
      .post('/api/issue-scan-token')
      .send({ paymentIntentId: 'cs_invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 422 when PaymentIntent is not succeeded', async () => {
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_pending',
      status: 'requires_payment_method',
      customer: TEST_CUSTOMER_ID,
      metadata: { action: 'create_subscription', product: 'optimizer' },
    });
    const res = await request(app)
      .post('/api/issue-scan-token')
      .send({ paymentIntentId: 'pi_pending' });
    expect(res.status).toBe(422);
  });

  it('returns 422 when PaymentIntent lacks create_subscription action', async () => {
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_no_action',
      status: 'succeeded',
      customer: TEST_CUSTOMER_ID,
      metadata: { product: 'optimizer' }, // missing action field
    });
    const res = await request(app)
      .post('/api/issue-scan-token')
      .send({ paymentIntentId: 'pi_no_action' });
    expect(res.status).toBe(422);
  });

  it('issues a valid 30-day JWT for a correct PaymentIntent', async () => {
    const res = await request(app)
      .post('/api/issue-scan-token')
      .send({ paymentIntentId: 'pi_valid' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    const payload = decodeToken(res.body.token);
    expect(payload.tier).toBe('paid');
    expect(payload.customerId).toBe(TEST_CUSTOMER_ID);
    expect(payload.product).toBe('optimizer');
    const nowSec = Math.floor(Date.now() / 1000);
    expect(payload.exp - nowSec).toBeGreaterThan(30 * 24 * 3600 - 60);
  });

  it('issues a pro token when PaymentIntent product is optimizer-pro', async () => {
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_pro',
      status: 'succeeded',
      customer: TEST_CUSTOMER_ID,
      metadata: { action: 'create_subscription', product: 'optimizer-pro' },
    });
    const res = await request(app)
      .post('/api/issue-scan-token')
      .send({ paymentIntentId: 'pi_pro' });
    expect(res.status).toBe(200);
    const payload = decodeToken(res.body.token);
    expect(payload.product).toBe('optimizer-pro');
  });
});
