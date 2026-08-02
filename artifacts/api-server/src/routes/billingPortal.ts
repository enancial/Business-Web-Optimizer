import { Router, type IRouter } from 'express';
import { getUncachableStripeClient } from '../stripeClient';

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/billing-portal
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Customer Portal session for a subscriber.
 *
 * Accepts either:
 *   { paymentIntentId: string }  — looks up customer from the PaymentIntent
 *                                   (used on the Success page after redirect)
 *   { customerId: string }       — directly creates the portal session
 *
 * Returns: { url: string }  — redirect the browser to this URL
 */
router.post('/billing-portal', async (req, res): Promise<void> => {
  const { paymentIntentId, customerId: rawCustomerId } = req.body as {
    paymentIntentId?: unknown;
    customerId?: unknown;
  };

  const stripe = await getUncachableStripeClient();

  let customerId: string | undefined;

  if (typeof rawCustomerId === 'string' && rawCustomerId.startsWith('cus_')) {
    customerId = rawCustomerId;
  } else if (typeof paymentIntentId === 'string' && paymentIntentId.startsWith('pi_')) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      customerId =
        typeof pi.customer === 'string'
          ? pi.customer
          : (pi.customer as { id: string } | null)?.id;
    } catch (err) {
      req.log.error({ err, paymentIntentId }, 'Failed to retrieve PaymentIntent for portal');
      res.status(422).json({ error: 'Could not look up your subscription. Please contact support.' });
      return;
    }
  }

  if (!customerId) {
    res.status(400).json({ error: 'customerId or paymentIntentId is required.' });
    return;
  }

  // The portal return URL — send them back to the homepage
  const returnUrl =
    (process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? 'businessweboptimizer.com'}`);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    req.log.info({ customerId, sessionId: session.id }, 'Billing portal session created');
    res.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    req.log.error({ err, customerId }, 'Failed to create billing portal session');
    // Stripe throws when the portal isn't configured yet
    if (msg.includes('No configuration provided')) {
      res.status(503).json({
        error:
          'The billing portal is not configured yet. Please enable it in your Stripe Dashboard → Settings → Billing → Customer portal.',
      });
      return;
    }
    res.status(500).json({ error: `Could not open billing portal: ${msg}` });
  }
});

export default router;
