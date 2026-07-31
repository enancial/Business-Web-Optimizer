import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync } from "./stripeClient";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Initialize Stripe sync infrastructure (migrations, webhook, backfill)
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

logger.info("Running Stripe schema migrations…");
await runMigrations({ databaseUrl });
logger.info("Stripe schema ready");

const stripeSync = await getStripeSync();

const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
if (domain) {
  const webhookUrl = `https://${domain}/api/stripe/webhook`;
  logger.info({ webhookUrl }, "Registering Stripe webhook…");
  await stripeSync.findOrCreateManagedWebhook(webhookUrl);
  logger.info("Stripe webhook configured");
} else {
  logger.warn("REPLIT_DOMAINS not set — skipping webhook registration");
}

// Sync existing Stripe data in the background (non-blocking)
stripeSync
  .syncBackfill()
  .then(() => logger.info("Stripe backfill complete"))
  .catch((err) => logger.error({ err }, "Stripe backfill error"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
