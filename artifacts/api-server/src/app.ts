import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import type Stripe from "stripe";
import router from "./routes";
import { logger } from "./lib/logger";
import { getStripeSync } from "./stripeClient";
import { handleWebhookEvent } from "./lib/subscriptionWebhook";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Stripe webhook — MUST be registered before express.json() so the raw body is preserved
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const sig = req.headers["stripe-signature"];
    if (!sig) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    // Parse the raw body so we can inspect event metadata after the sync.
    // Signature verification happens inside stripeSync.processWebhook().
    let event: Stripe.Event;
    try {
      event = JSON.parse((req.body as Buffer).toString()) as Stripe.Event;
    } catch {
      res.status(400).json({ error: "Invalid webhook payload" });
      return;
    }

    try {
      const stripeSync = await getStripeSync();

      // 1. Let stripe-replit-sync verify the signature and sync to local DB
      await stripeSync.processWebhook(
        req.body as Buffer,
        Array.isArray(sig) ? sig[0] : sig,
      );

      // 2. Run custom business logic (e.g. auto-create subscription on payment)
      await handleWebhookEvent(event, req.log);

      res.json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook error";
      req.log.error({ err }, "Stripe webhook processing error");
      res.status(400).json({ error: message });
    }
  },
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
