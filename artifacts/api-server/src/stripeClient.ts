import Stripe from 'stripe';

export class StripeConfigurationError extends Error {
  statusCode = 503;

  constructor(message = 'Stripe is not configured. Set STRIPE_SECRET_KEY before using paid checkout or billing routes.') {
    super(message);
    this.name = 'StripeConfigurationError';
  }
}

/**
 * Fetches Stripe credentials from explicit environment variables only.
 */
async function getStripeCredentials(): Promise<{
  secretKey: string;
  publishableKey: string;
}> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new StripeConfigurationError();
  }

  return {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  };
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns the Stripe publishable key for use on the frontend.
 */
export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getStripeCredentials();
  if (!publishableKey) {
    throw new StripeConfigurationError(
      'Stripe checkout is not configured. Set STRIPE_PUBLISHABLE_KEY before using paid checkout routes.',
    );
  }
  return publishableKey;
}

/**
 * Returns the Stripe secret key (for cases that need raw API access).
 */
export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getStripeCredentials();
  return secretKey;
}
