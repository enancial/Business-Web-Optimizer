import { Router, type IRouter } from 'express';
import type Stripe from 'stripe';
import { getUncachableStripeClient, getStripePublishableKey, getStripeSecretKey } from '../stripeClient';
import { db, affiliates } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Valid product keys
type Product = 'optimizer' | 'optimizer-pro';

function isValidProduct(p: unknown): p is Product {
  return p === 'optimizer' || p === 'optimizer-pro';
}

function getPriceId(product: Product): string {
  if (product === 'optimizer') return process.env.OPTIMIZER_PRICE_ID ?? '';
  return process.env.OPTIMIZER_PRO_PRICE_ID ?? '';
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
 * Body:  { code: string, product: 'optimizer' | 'optimizer-pro' }
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
  if (!isValidProduct(product)) {
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

  const priceId = getPriceId(product);

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
 * Creates the appropriate Stripe object for checkout and returns a clientSecret.
 *
 * - optimizer / optimizer-pro (paid) → Creates a Subscription with trial_period_days: 7
 *   and payment_behavior: 'default_incomplete'. Stripe attaches a pending_setup_intent;
 *   its client_secret (intentType: 'setup') lets the frontend collect card details via
 *   PaymentElement with no charge today. After day 7 Stripe charges automatically and
 *   fires invoice.paid — which is when affiliate earnings accrue.
 *
 * - $0 after promo → Creates the subscription directly; returns { isFree: true }
 *   so the frontend can skip card entry.
 *
 * Body:  { product: 'optimizer' | 'optimizer-pro', promotionCode?: string, affiliateCode?: string }
 * Returns: { clientSecret?: string, intentType?: 'setup', trialDays?: number,
 *            publishableKey: string, isFree?: boolean,
 *            originalAmount: number, discountedAmount: number, currency: string,
 *            discountLabel?: string }
 */
router.post('/create-payment-intent', async (req, res): Promise<void> => {
  const { product, promotionCode, affiliateCode } = req.body as {
    product: unknown;
    promotionCode?: unknown;
    affiliateCode?: unknown;
  };

  if (!isValidProduct(product)) {
    res.status(400).json({
      error: "Invalid product. Must be 'optimizer' or 'optimizer-pro'.",
    });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const publishableKey = await getStripePublishableKey();

  const priceId = getPriceId(product);

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

  // ── Affiliate code validation ────────────────────────────────────────────
  // Silently ignore invalid codes so existing checkout flow is never blocked.
  // A slow or failing DB will NOT block checkout — a 2 s timeout + try/catch
  // ensures any DB trouble results only in no affiliate credit, never a failed
  // checkout for the customer.
  let validatedAffiliateCode: string | null = null;
  if (typeof affiliateCode === 'string' && affiliateCode.trim()) {
    const code = affiliateCode.trim().toUpperCase();
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Affiliate DB lookup timed out after 2 s')),
          2000,
        ),
      );
      const rows = await Promise.race([
        db
          .select({ code: affiliates.code })
          .from(affiliates)
          .where(and(eq(affiliates.code, code), eq(affiliates.active, true)))
          .limit(1),
        timeout,
      ]);
      if (rows[0]) validatedAffiliateCode = rows[0].code;
    } catch (err) {
      req.log.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          affiliateCode: code,
        },
        'Affiliate DB lookup failed or timed out — checkout proceeds without affiliate credit',
      );
      // validatedAffiliateCode stays null; checkout proceeds normally
    }
  }

  // ── Free order ($0 after discount) ────────────────────────────────────────
  // Stripe does not accept PaymentIntents with amount = 0. Create a free
  // subscription with the promotion code applied.
  if (discountedAmount === 0) {
    if (promoCode) {
      const customer = await stripe.customers.create();
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceId }],
        discounts: [{ promotion_code: promoCode.id }],
        metadata: { source: 'free_promo_checkout', product },
      });
      req.log.info(
        { subscriptionId: subscription.id, promoCodeId: promoCode.id, product },
        'Free subscription created via promo code',
      );
    }

    res.json({ ...responseBase, isFree: true });
    return;
  }

  // ── Trial subscription — collect card, charge after 7 days ─────────────────
  // Stripe creates a pending_setup_intent on the subscription; the frontend
  // confirms it via PaymentElement (no charge today). After day 7 Stripe issues
  // the first invoice and charges the saved payment method automatically.
  const customer = await stripe.customers.create();

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    trial_period_days: 7,
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['pending_setup_intent'],
    ...(promoCode ? { discounts: [{ promotion_code: promoCode.id }] } : {}),
    metadata: {
      product,
      price_id: priceId,
      ...(promoCode
        ? { promotion_code_id: promoCode.id, promotion_code: promoCode.code }
        : {}),
      ...(validatedAffiliateCode ? { affiliate_code: validatedAffiliateCode } : {}),
    },
  });

  const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | null;
  if (!setupIntent?.client_secret) {
    req.log.error(
      { subscriptionId: subscription.id },
      'No pending_setup_intent on trial subscription — aborting checkout',
    );
    await stripe.subscriptions.cancel(subscription.id);
    res.status(500).json({ error: 'Could not initialise trial checkout. Please try again.' });
    return;
  }

  req.log.info(
    { subscriptionId: subscription.id, product, trialDays: 7 },
    'Trial subscription created — awaiting SetupIntent confirmation',
  );

  res.json({
    ...responseBase,
    clientSecret: setupIntent.client_secret,
    intentType: 'setup',
    trialDays: 7,
  });
});

export default router;
