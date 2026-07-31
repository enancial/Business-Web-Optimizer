import { Router, type IRouter } from 'express';
import type Stripe from 'stripe';
import { getUncachableStripeClient, getStripePublishableKey, getStripeSecretKey } from '../stripeClient';

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Looks up a promotion code string (e.g. "DEV1FREE") in Stripe and returns
 * the PromotionCode object if it is active, or null if not found / inactive.
 */
/**
 * Look up an active promotion code via the Stripe REST API directly.
 *
 * The Stripe Node SDK v22 silently drops the nested `coupon` object from the
 * TypeScript wrapper in list responses. Using raw fetch guarantees the full
 * coupon is always present in the returned object.
 */
async function findActivePromoCode(
  code: string,
): Promise<Stripe.PromotionCode | null> {
  const secretKey = await getStripeSecretKey();

  const qs = new URLSearchParams({
    code: code.trim().toUpperCase(),
    active: 'true',
    limit: '1',
  });

  const res = await fetch(`https://api.stripe.com/v1/promotion_codes?${qs}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { data: Stripe.PromotionCode[] };
  return data.data[0] ?? null;
}

/**
 * Applies a coupon to an amount (in cents) and returns the discounted amount.
 * Clamps at 0 — never goes negative.
 */
function applyDiscount(amount: number, coupon: Stripe.Coupon): number {
  if (coupon.percent_off != null) {
    return Math.max(0, Math.round(amount * (1 - coupon.percent_off / 100)));
  }
  if (coupon.amount_off != null) {
    return Math.max(0, amount - coupon.amount_off);
  }
  return amount;
}

/**
 * Human-readable discount label, e.g. "100% off" or "$50.00 off".
 */
function discountLabel(coupon: Stripe.Coupon): string {
  if (coupon.percent_off != null) return `${coupon.percent_off}% off`;
  if (coupon.amount_off != null)
    return `$${(coupon.amount_off / 100).toFixed(2)} off`;
  return 'discount applied';
}

// ---------------------------------------------------------------------------
// GET /api/checkout-config
// ---------------------------------------------------------------------------

/**
 * Returns the Stripe publishable key for frontend initialization.
 */
router.get('/checkout-config', async (_req, res): Promise<void> => {
  const publishableKey = await getStripePublishableKey();
  res.json({ publishableKey });
});

// ---------------------------------------------------------------------------
// POST /api/validate-promo
// ---------------------------------------------------------------------------

/**
 * Validates a promotion code for a given product and returns pricing details.
 *
 * Body:  { code: string, product: 'launch-package' | 'management-plan' }
 * Returns: {
 *   valid: boolean,
 *   promotionCodeId?: string,
 *   discountLabel?: string,
 *   originalAmount?: number,   // cents
 *   discountedAmount?: number, // cents
 *   currency?: string,
 *   duration?: string,         // 'once' | 'repeating' | 'forever'
 *   error?: string
 * }
 */
router.post('/validate-promo', async (req, res): Promise<void> => {
  const { code, product } = req.body as { code?: unknown; product?: unknown };

  if (typeof code !== 'string' || !code.trim()) {
    res.status(400).json({ valid: false, error: 'Promo code is required.' });
    return;
  }
  if (product !== 'launch-package' && product !== 'management-plan') {
    res.status(400).json({ valid: false, error: 'Invalid product.' });
    return;
  }

  const stripe = await getUncachableStripeClient();

  const promoCode = await findActivePromoCode(code);
  if (!promoCode) {
    res
      .status(422)
      .json({ valid: false, error: 'Invalid or expired promo code.' });
    return;
  }

  const priceId =
    product === 'launch-package'
      ? (process.env.LAUNCH_PACKAGE_PRICE_ID ?? '')
      : (process.env.MANAGEMENT_PLAN_PRICE_ID ?? '');

  if (!priceId) {
    res.status(500).json({ valid: false, error: 'Product not configured.' });
    return;
  }

  const price = await stripe.prices.retrieve(priceId);
  if (!price.unit_amount) {
    res
      .status(500)
      .json({ valid: false, error: 'Price is not a fixed-amount price.' });
    return;
  }

  const originalAmount = price.unit_amount;
  const discountedAmount = applyDiscount(originalAmount, promoCode.coupon);

  res.json({
    valid: true,
    promotionCodeId: promoCode.id,
    discountLabel: discountLabel(promoCode.coupon),
    originalAmount,
    discountedAmount,
    currency: price.currency,
    duration: promoCode.coupon.duration,
  });
});

// ---------------------------------------------------------------------------
// POST /api/create-payment-intent
// ---------------------------------------------------------------------------

/**
 * Creates the appropriate Stripe payment object and returns a clientSecret.
 *
 * - launch-package  → PaymentIntent at (possibly discounted) price
 * - management-plan → PaymentIntent with setup_future_usage (webhook creates subscription)
 *
 * If a valid promotionCode is supplied and reduces the amount to $0, this
 * endpoint handles the order directly (no PaymentIntent is needed for $0) and
 * returns { isFree: true } so the frontend can skip card entry.
 *
 * Body:  { product: 'launch-package' | 'management-plan', promotionCode?: string }
 * Returns: { clientSecret?: string, publishableKey: string, isFree?: boolean,
 *            originalAmount?: number, discountedAmount?: number, currency?: string,
 *            discountLabel?: string }
 */
router.post('/create-payment-intent', async (req, res): Promise<void> => {
  const { product, promotionCode } = req.body as {
    product: unknown;
    promotionCode?: unknown;
  };

  if (product !== 'launch-package' && product !== 'management-plan') {
    res.status(400).json({
      error: "Invalid product. Must be 'launch-package' or 'management-plan'.",
    });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const publishableKey = await getStripePublishableKey();

  const priceId =
    product === 'launch-package'
      ? (process.env.LAUNCH_PACKAGE_PRICE_ID ?? '')
      : (process.env.MANAGEMENT_PLAN_PRICE_ID ?? '');

  if (!priceId) {
    req.log.error(`Price ID env var not set for product: ${product}`);
    res.status(500).json({ error: 'Checkout is not configured. Price ID missing.' });
    return;
  }

  const price = await stripe.prices.retrieve(priceId);
  if (!price.unit_amount) {
    res.status(500).json({ error: 'Price is not a fixed-amount price.' });
    return;
  }

  // ── Resolve promotion code (if provided) ──────────────────────────────────
  let promoCode: Stripe.PromotionCode | null = null;
  if (typeof promotionCode === 'string' && promotionCode.trim()) {
    promoCode = await findActivePromoCode(promotionCode);
    if (!promoCode) {
      res.status(422).json({ error: 'Invalid or expired promo code.' });
      return;
    }
  }

  const originalAmount = price.unit_amount;
  const discountedAmount = promoCode
    ? applyDiscount(originalAmount, promoCode.coupon)
    : originalAmount;

  const responseBase = {
    publishableKey,
    originalAmount,
    discountedAmount,
    currency: price.currency,
    discountLabel: promoCode ? discountLabel(promoCode.coupon) : undefined,
  };

  // ── Free order ($0 after discount) ────────────────────────────────────────
  // Stripe does not accept PaymentIntents with amount = 0. Handle these cases
  // directly: for management-plan create a free subscription; for launch-package
  // there is nothing to charge.
  if (discountedAmount === 0) {
    if (product === 'management-plan' && promoCode) {
      // Create a free subscription with the promotion code applied.
      // $0 invoices are auto-paid by Stripe without a payment method.
      const customer = await stripe.customers.create();
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        discounts: [{ promotion_code: promoCode.id }],
        metadata: { source: 'free_promo_checkout' },
      });
      req.log.info(
        { subscriptionId: subscription.id, promoCodeId: promoCode.id },
        'Free management-plan subscription created via promo code',
      );
    }

    res.json({ ...responseBase, isFree: true });
    return;
  }

  // ── Paid order — create PaymentIntent ────────────────────────────────────
  let clientSecret: string;

  if (product === 'launch-package') {
    const intent = await stripe.paymentIntents.create({
      amount: discountedAmount,
      currency: price.currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        product: 'launch-package',
        price_id: priceId,
        ...(promoCode
          ? { promotion_code_id: promoCode.id, promotion_code: promoCode.code }
          : {}),
      },
    });
    clientSecret = intent.client_secret!;
  } else {
    // management-plan: collect payment + save card for recurring charges.
    // A payment_intent.succeeded webhook will create the subscription.
    const customer = await stripe.customers.create();

    const intent = await stripe.paymentIntents.create({
      amount: discountedAmount,
      currency: price.currency,
      customer: customer.id,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: {
        product: 'management-plan',
        price_id: priceId,
        action: 'create_subscription',
        ...(promoCode
          ? { promotion_code_id: promoCode.id, promotion_code: promoCode.code }
          : {}),
      },
    });
    clientSecret = intent.client_secret!;
  }

  res.json({ ...responseBase, clientSecret });
});

export default router;
