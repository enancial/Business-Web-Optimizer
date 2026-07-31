import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';

interface ConnectorSettings {
  secret?: string;
  publishable?: string;
}

interface ConnectorItem {
  settings?: ConnectorSettings;
}

interface ConnectorApiResponse {
  items?: ConnectorItem[];
}

/**
 * Fetches Stripe credentials.
 *
 * Priority order:
 *  1. STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY env vars (live-mode override)
 *  2. Replit connector (falls back to whatever key is stored there)
 *
 * Not cached — tokens can rotate, so fetch fresh each time.
 */
async function getStripeCredentials(): Promise<{
  secretKey: string;
  publishableKey: string;
}> {
  // 1. Prefer explicit env var overrides — used when the connector holds test keys
  //    but the app should run in live mode.
  if (process.env.STRIPE_SECRET_KEY) {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    };
  }

  // 2. Fall back to Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Missing Replit connector env vars. ' +
      'Ensure the Stripe integration is connected via the Integrations tab.',
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
    },
  );

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = (await resp.json()) as ConnectorApiResponse;
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      'Stripe integration not connected or missing credentials. ' +
      'Connect Stripe via the Integrations tab first.',
    );
  }

  return {
    secretKey: settings.secret,
    publishableKey: settings.publishable ?? '',
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
  return publishableKey;
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const { secretKey } = await getStripeCredentials();
  // webhookSecret is not stored in connector settings — it is managed by findOrCreateManagedWebhook
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: '',
  });
}
