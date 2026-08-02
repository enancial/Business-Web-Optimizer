/**
 * JWT helpers for automated tests.
 * Uses the same SESSION_SECRET that vitest.config.ts injects.
 */
import jwt from 'jsonwebtoken';

export const TEST_SECRET = 'test-secret-for-automated-tests-only';

export interface PaidPayload {
  tier?: string;
  customerId?: string;
  product?: string;
}

/** Valid 30-day paid token. */
export function makePaidToken(overrides: PaidPayload = {}): string {
  return jwt.sign(
    {
      tier: 'paid',
      customerId: 'cus_test123',
      product: 'optimizer',
      ...overrides,
    },
    TEST_SECRET,
    { expiresIn: '30d' },
  );
}

/** Valid 30-day Optimizer Pro paid token. */
export function makeProToken(overrides: PaidPayload = {}): string {
  return makePaidToken({ product: 'optimizer-pro', ...overrides });
}

/** Token that expired 1 second ago. */
export function makeExpiredToken(overrides: PaidPayload = {}): string {
  return jwt.sign(
    {
      tier: 'paid',
      customerId: 'cus_test123',
      product: 'optimizer',
      ...overrides,
    },
    TEST_SECRET,
    { expiresIn: -1 }, // already expired
  );
}

/** Token signed with a wrong secret (tampered). */
export function makeTamperedToken(): string {
  return jwt.sign(
    { tier: 'paid', customerId: 'cus_test123', product: 'optimizer' },
    'wrong-secret-not-the-real-one',
    { expiresIn: '30d' },
  );
}

/** Structurally invalid (not a JWT at all). */
export const MALFORMED_TOKEN = 'not.a.valid.jwt';
