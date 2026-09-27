import express, { type Express } from "express";
import cors from "cors";
import type Stripe from "stripe";
import router from "./routes";
import { logger } from "./lib/logger";
import { getUncachableStripeClient, StripeConfigurationError } from "./stripeClient";
import { handleWebhookEvent } from "./lib/subscriptionWebhook";

const app: Express = express();

// Replaces pino-http, which cannot initialise in workerd, while preserving req.log.
app.use((req, _res, next) => {
  req.log = logger;
  next();
});

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

    let event: Stripe.Event;
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        res.status(503).json({
          error: "Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET before enabling billing webhooks.",
        });
        return;
      }

      const stripe = await getUncachableStripeClient();
      // Workers only expose async SubtleCrypto, so the sync verifier throws there.
      event = await stripe.webhooks.constructEventAsync(
        req.body as Buffer,
        Array.isArray(sig) ? sig[0] : sig,
        webhookSecret,
      );
      await handleWebhookEvent(event, req.log);

      res.json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook error";
      req.log.error({ err }, "Stripe webhook processing error");
      const status = err instanceof StripeConfigurationError ? 503 : 400;
      res.status(status).json({ error: message });
    }
  },
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.get("/robots.txt", (req, res) => {
  const host = req.headers.host ?? "";
  if (host.endsWith(".workers.dev")) {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
    return;
  }

  res
    .type("text/plain")
    .send("User-agent: *\nAllow: /\nSitemap: https://businessweboptimizer.com/sitemap.xml\n");
});

app.get("/sitemap.xml", (req, res) => {
  const host = req.headers.host ?? "";
  if (host.endsWith(".workers.dev")) {
    res.status(404).type("text/plain").send("No sitemap on preview host.\n");
    return;
  }

  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://businessweboptimizer.com/</loc></url>
  <url><loc>https://businessweboptimizer.com/pricing</loc></url>
  <url><loc>https://businessweboptimizer.com/partners</loc></url>
</urlset>
`);
});

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof StripeConfigurationError) {
    req.log.error({ err }, "Stripe route called before Stripe is configured");
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  next(err);
});

export default app;
