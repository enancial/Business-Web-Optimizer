import Stripe from "stripe";

/**
 * Fetches Stripe credentials from explicit environment variables only.
 */
async function getStripeCredentials(): Promise<{ secretKey: string }> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Stripe-backed scripts cannot run.",
    );
  }

  return { secretKey: process.env.STRIPE_SECRET_KEY };
}

/**
 * Returns a fresh authenticated Stripe client.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}
