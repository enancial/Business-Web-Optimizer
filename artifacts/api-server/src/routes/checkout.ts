import { Router, type IRouter } from 'express';
import type Stripe from 'stripe';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';

const router: IRouter = Router();

/**
 * GET /api/checkout-config
 * Returns the Stripe publishable key for frontend initialization.
 */
router.get('/checkout-config', async (_req, res): Promise<void> => {
  const publishableKey = await getStripePublishableKey();
  res.json({ publishableKey });
});

/**
 * POST /api/create-payment-intent
 *
 * Creates the appropriate Stripe payment object for the given product and
 * returns a clientSecret the frontend uses to mount the Payment Element.
 *
 * - launch-package  → PaymentIntent (one-time, $2,500)
 * - management-plan → Subscription (incomplete; returns its PaymentIntent secret)
 *
 * Body:  { product: 'launch-package' | 'management-plan' }
 * Returns: { clientSecret: string, publishableKey: string }
 */
router.post('/create-payment-intent', async (req, res): Promise<void> => {
  const { product } = req.body as { product: unknown };

  if (product !== 'launch-package' && product !== 'management-plan') {
    res.status(400).json({
      error: "Invalid product. Must be 'launch-package' or 'management-plan'.",
    });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const publishableKey = await getStripePublishableKey();

  let clientSecret: string;

  if (product === 'launch-package') {
    const priceId = process.env.LAUNCH_PACKAGE_PRICE_ID ?? '';
    if (!priceId) {
      req.log.error('LAUNCH_PACKAGE_PRICE_ID env var is not set');
      res.status(500).json({
        error: 'Launch package checkout is not configured. Price ID missing.',
      });
      return;
    }

    // Look up the price to get amount/currency so we never hardcode them
    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount;
    if (!amount) {
      res.status(500).json({ error: 'Price is not a fixed-amount price.' });
      return;
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: price.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { product: 'launch-package', price_id: priceId },
    });

    clientSecret = intent.client_secret!;
  } else {
    // management-plan — collect first month's payment and save card for future charges.
    //
    // Stripe's subscription API creates invoices/payment-intents asynchronously in
    // newer API versions, making it unreliable to retrieve the client_secret immediately
    // after subscriptions.create(). Instead we:
    //   1. Collect payment upfront via a PaymentIntent (setup_future_usage: off_session
    //      saves the card on the customer for future monthly charges).
    //   2. After payment succeeds, a 'payment_intent.succeeded' webhook can create the
    //      recurring subscription with the saved payment method, or it can be set up
    //      manually in the Stripe Dashboard.
    const priceId = process.env.MANAGEMENT_PLAN_PRICE_ID ?? '';
    if (!priceId) {
      req.log.error('MANAGEMENT_PLAN_PRICE_ID env var is not set');
      res.status(500).json({
        error: 'Management plan checkout is not configured. Price ID missing.',
      });
      return;
    }

    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount;
    if (!amount) {
      res.status(500).json({ error: 'Price is not a fixed-amount price.' });
      return;
    }

    // Create a customer so the saved payment method can be reused for recurring billing
    const customer = await stripe.customers.create();

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: price.currency,
      customer: customer.id,
      // Save the payment method on the customer after this payment succeeds
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: {
        product: 'management-plan',
        price_id: priceId,
        // Signals the webhook handler to create the recurring subscription
        action: 'create_subscription',
      },
    });

    clientSecret = intent.client_secret!;
  }

  res.json({ clientSecret, publishableKey });
});

export default router;
