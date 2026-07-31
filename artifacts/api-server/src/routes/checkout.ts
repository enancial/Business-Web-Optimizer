import { Router, type IRouter } from 'express';
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
 * POST /api/create-checkout-session
 * Creates an embedded Stripe Checkout session.
 * Body: { product: 'launch-package' | 'management-plan' }
 * Returns: { clientSecret: string }
 */
router.post('/create-checkout-session', async (req, res): Promise<void> => {
  const { product } = req.body;

  if (product !== 'launch-package' && product !== 'management-plan') {
    res.status(400).json({
      error: 'Invalid product. Must be launch-package or management-plan.',
    });
    return;
  }

  let priceId: string;
  let mode: 'payment' | 'subscription';

  if (product === 'launch-package') {
    priceId = process.env.LAUNCH_PACKAGE_PRICE_ID ?? '';
    mode = 'payment';
  } else {
    priceId = process.env.MANAGEMENT_PLAN_PRICE_ID ?? '';
    mode = 'subscription';
  }

  if (!priceId) {
    req.log.error({ product }, 'Missing price ID env var for product');
    res.status(500).json({
      error: 'Checkout not configured. Price ID missing — run the product seed script.',
    });
    return;
  }

  const stripe = await getUncachableStripeClient();

  const domain = process.env.REPLIT_DOMAINS?.split(',')[0];
  const baseUrl = domain
    ? `https://${domain}`
    : `${req.protocol}://${req.get('host')}`;

  // {CHECKOUT_SESSION_ID} is a Stripe template variable — do not change it
  const returnUrl = `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: returnUrl,
  });

  res.json({ clientSecret: session.client_secret });
});

export default router;
