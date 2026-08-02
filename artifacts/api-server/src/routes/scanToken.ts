import { Router, type IRouter } from 'express';
import jwt from 'jsonwebtoken';
import { getUncachableStripeClient } from '../stripeClient';

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/issue-scan-token
// ---------------------------------------------------------------------------

/**
 * Issues a signed JWT that grants paid-tier access to POST /api/scan.
 *
 * The caller must supply the Stripe PaymentIntent ID that Stripe places in the
 * ?payment_intent= query param on the /success redirect.  The server verifies
 * the PaymentIntent succeeded and was tagged for subscription creation, then
 * issues a 30-day JWT signed with SESSION_SECRET.
 *
 * Body:   { paymentIntentId: string }
 * Returns: { token: string }
 */
router.post('/issue-scan-token', async (req, res): Promise<void> => {
  const { paymentIntentId } = req.body as { paymentIntentId?: unknown };

  if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
    res.status(400).json({ error: 'paymentIntentId is required.' });
    return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    req.log.error('SESSION_SECRET env var is not set — cannot issue scan token');
    res.status(500).json({ error: 'Server misconfiguration. Please contact support.' });
    return;
  }

  const stripe = await getUncachableStripeClient();

  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    req.log.error({ err, paymentIntentId }, 'Failed to retrieve PaymentIntent for scan token');
    res.status(422).json({ error: 'Could not verify your payment. Please contact support.' });
    return;
  }

  // Must have succeeded
  if (pi.status !== 'succeeded') {
    req.log.warn({ paymentIntentId, status: pi.status }, 'PaymentIntent not succeeded — refusing token');
    res.status(422).json({ error: 'Payment has not completed successfully.' });
    return;
  }

  // Must have been tagged for subscription creation by our own checkout flow
  if (pi.metadata?.action !== 'create_subscription') {
    req.log.warn({ paymentIntentId, metadata: pi.metadata }, 'PaymentIntent not tagged for subscription — refusing token');
    res.status(422).json({ error: 'Payment intent is not associated with a subscription.' });
    return;
  }

  const customerId =
    typeof pi.customer === 'string'
      ? pi.customer
      : (pi.customer as { id: string } | null)?.id ?? null;

  // Sign a 30-day token
  const token = jwt.sign(
    {
      tier: 'paid',
      ...(customerId ? { customerId } : {}),
      product: pi.metadata.product ?? 'optimizer',
    },
    secret,
    { expiresIn: '30d' },
  );

  req.log.info({ paymentIntentId, customerId }, 'Scan token issued');
  res.json({ token });
});

export default router;
