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
 * Two paths:
 *
 * 1. PaymentIntent path (legacy non-trial checkout):
 *    Body: { paymentIntentId: "pi_…" }
 *    Verifies the PaymentIntent succeeded and was tagged for subscription
 *    creation, then issues a 30-day JWT.
 *
 * 2. SetupIntent path (trial checkout):
 *    Body: { setupIntentId: "seti_…" }
 *    Verifies the SetupIntent succeeded, finds the customer's trialing
 *    optimizer/optimizer-pro subscription, and issues a 30-day JWT.
 *    Stripe places ?setup_intent=seti_… in the /success redirect URL
 *    when stripe.confirmSetup() completes.
 *
 * Returns: { token: string }
 */
router.post('/issue-scan-token', async (req, res): Promise<void> => {
  const { paymentIntentId, setupIntentId } = req.body as {
    paymentIntentId?: unknown;
    setupIntentId?: unknown;
  };

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    req.log.error('SESSION_SECRET env var is not set — cannot issue scan token');
    res.status(500).json({ error: 'Server misconfiguration. Please contact support.' });
    return;
  }

  const stripe = await getUncachableStripeClient();

  // ── SetupIntent path (trial checkout) ────────────────────────────────────
  if (typeof setupIntentId === 'string' && setupIntentId.startsWith('seti_')) {
    let si: Awaited<ReturnType<typeof stripe.setupIntents.retrieve>>;
    try {
      si = await stripe.setupIntents.retrieve(setupIntentId);
    } catch (err) {
      req.log.error({ err, setupIntentId }, 'Failed to retrieve SetupIntent for scan token');
      res.status(422).json({ error: 'Could not verify your trial signup. Please contact support.' });
      return;
    }

    if (si.status !== 'succeeded') {
      req.log.warn({ setupIntentId, status: si.status }, 'SetupIntent not succeeded — refusing token');
      res.status(422).json({ error: 'Trial setup has not completed successfully.' });
      return;
    }

    const customerId =
      typeof si.customer === 'string'
        ? si.customer
        : (si.customer as { id: string } | null)?.id ?? null;

    if (!customerId) {
      req.log.error({ setupIntentId }, 'SetupIntent has no customer — cannot issue token');
      res.status(422).json({ error: 'Could not identify your account. Please contact support.' });
      return;
    }

    // Find the trialing optimizer subscription for this customer
    const knownPriceIds = new Set(
      [process.env.OPTIMIZER_PRICE_ID, process.env.OPTIMIZER_PRO_PRICE_ID].filter(Boolean),
    );
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'trialing',
      limit: 10,
    });

    const trialSub = subs.data.find((s) =>
      s.items.data.some((item) => knownPriceIds.has(item.price.id)),
    );

    if (!trialSub) {
      req.log.warn({ setupIntentId, customerId }, 'No trialing optimizer subscription found — refusing token');
      res.status(422).json({ error: 'No active trial subscription found for your account.' });
      return;
    }

    // Derive product from the price ID on the subscription
    const priceId = trialSub.items.data[0]?.price.id ?? '';
    const product =
      priceId === process.env.OPTIMIZER_PRO_PRICE_ID ? 'optimizer-pro' : 'optimizer';

    const token = jwt.sign(
      { tier: 'paid', customerId, product },
      secret,
      { expiresIn: '30d' },
    );

    req.log.info({ setupIntentId, customerId, product }, 'Scan token issued for trial SetupIntent');
    res.json({ token });
    return;
  }

  // ── PaymentIntent path (legacy non-trial checkout) ────────────────────────
  if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
    res.status(400).json({ error: 'paymentIntentId or setupIntentId is required.' });
    return;
  }

  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    req.log.error({ err, paymentIntentId }, 'Failed to retrieve PaymentIntent for scan token');
    res.status(422).json({ error: 'Could not verify your payment. Please contact support.' });
    return;
  }

  if (pi.status !== 'succeeded') {
    req.log.warn({ paymentIntentId, status: pi.status }, 'PaymentIntent not succeeded — refusing token');
    res.status(422).json({ error: 'Payment has not completed successfully.' });
    return;
  }

  if (pi.metadata?.action !== 'create_subscription') {
    req.log.warn({ paymentIntentId, metadata: pi.metadata }, 'PaymentIntent not tagged for subscription — refusing token');
    res.status(422).json({ error: 'Payment intent is not associated with a subscription.' });
    return;
  }

  const customerId =
    typeof pi.customer === 'string'
      ? pi.customer
      : (pi.customer as { id: string } | null)?.id ?? null;

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
