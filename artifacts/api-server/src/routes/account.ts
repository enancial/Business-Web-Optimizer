import { Router, type IRouter } from 'express';
import jwt from 'jsonwebtoken';
import { getUncachableStripeClient, getStripePublishableKey } from '../stripeClient';
import { requireAuth, issueToken, type TokenPayload } from '../lib/authHelper';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Levenshtein distance (for email typo detection)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Searches Stripe for customers with the same email domain and returns a
 * masked hint (e.g. "j***@gmail.com") if a near-match (edit distance ≤ 2)
 * is found on the local part.  Returns null if no useful hint is available.
 */
async function findEmailHint(stripe: Stripe, enteredEmail: string): Promise<string | null> {
  const atIdx = enteredEmail.indexOf('@');
  if (atIdx < 0) return null;

  const localPart = enteredEmail.slice(0, atIdx).toLowerCase();
  const domain = enteredEmail.slice(atIdx + 1).toLowerCase();

  let results: Stripe.ApiSearchResult<Stripe.Customer>;
  try {
    results = await stripe.customers.search({
      query: `email~"@${domain}"`,
      limit: 10,
    });
  } catch {
    return null;
  }

  let bestEmail: string | null = null;
  let bestDist = Infinity;

  for (const customer of results.data) {
    const raw = customer.email?.toLowerCase() ?? '';
    const custAt = raw.indexOf('@');
    if (custAt < 0) continue;
    const custLocal = raw.slice(0, custAt);
    const custDomain = raw.slice(custAt + 1);
    if (custDomain !== domain) continue; // same domain only
    const dist = levenshtein(localPart, custLocal);
    if (dist > 0 && dist <= 2 && dist < bestDist) {
      bestDist = dist;
      bestEmail = raw;
    }
  }

  if (!bestEmail) return null;

  // Mask: keep first character of local part, replace rest with ***, keep domain
  const maskAt = bestEmail.indexOf('@');
  const maskLocal = bestEmail.slice(0, maskAt);
  const maskDomain = bestEmail.slice(maskAt);
  return maskLocal.charAt(0) + '***' + maskDomain;
}

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPTIMIZER_PLAN_LABELS: Record<string, string> = {
  optimizer: 'Optimizer',
  'optimizer-pro': 'Optimizer Pro',
};

function productFromPriceId(priceId: string): 'optimizer' | 'optimizer-pro' {
  if (priceId === process.env.OPTIMIZER_PRO_PRICE_ID) return 'optimizer-pro';
  return 'optimizer';
}

function getActiveSub(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  return (
    subs.find((s) => s.status === 'active' || s.status === 'trialing') ?? null
  );
}

// ---------------------------------------------------------------------------
// POST /api/account/auth
// Finds a Stripe customer by email and issues a JWT if they have an active
// optimizer subscription.  No existing token required.
// ---------------------------------------------------------------------------

router.post('/account/auth', async (req, res): Promise<void> => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration.' });
    return;
  }

  const stripe = await getUncachableStripeClient();

  // Search Stripe for customers with this email
  let customers: Stripe.ApiSearchResult<Stripe.Customer>;
  try {
    customers = await stripe.customers.search({
      query: `email:"${email.toLowerCase().trim()}"`,
      limit: 5,
    });
  } catch (err) {
    req.log.error({ err }, 'Stripe customer search failed');
    res.status(502).json({ error: 'Could not verify your account. Please try again.' });
    return;
  }

  if (!customers.data.length) {
    const hint = await findEmailHint(stripe, email.toLowerCase().trim());
    res.status(404).json({
      error: 'No account found for that email address. Please check for typos and try again.',
      errorCode: 'not_found',
      ...(hint ? { hint } : {}),
    });
    return;
  }

  const optimizerPriceId = process.env.OPTIMIZER_PRICE_ID ?? '';
  const optimizerProPriceId = process.env.OPTIMIZER_PRO_PRICE_ID ?? '';

  // Find the first customer with an active optimizer subscription.
  // Also track whether any customer had an optimizer sub that is now inactive.
  let foundInactiveOptimizerSub = false;

  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 10,
    });

    const isOptimizerSub = (s: Stripe.Subscription) =>
      s.items.data.some(
        (item) =>
          item.price.id === optimizerPriceId ||
          item.price.id === optimizerProPriceId,
      );

    const activeSub = subs.data.find(
      (s) => (s.status === 'active' || s.status === 'trialing') && isOptimizerSub(s),
    );

    if (activeSub) {
      const priceId = activeSub.items.data[0]?.price.id ?? '';
      const product = productFromPriceId(priceId);
      const token = issueToken({ tier: 'paid', customerId: customer.id, product });
      req.log.info({ customerId: customer.id, product }, 'Account auth token issued');
      res.json({ token });
      return;
    }

    // Check for any optimizer subscription regardless of status (e.g. canceled, past_due)
    if (subs.data.some(isOptimizerSub)) {
      foundInactiveOptimizerSub = true;
    }
  }

  if (foundInactiveOptimizerSub) {
    res.status(403).json({
      error: 'Your trial or subscription is no longer active.',
      errorCode: 'subscription_inactive',
    });
  } else {
    res.status(403).json({
      error: 'No active Optimizer subscription was found for that email.',
      errorCode: 'no_subscription',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/account
// Returns subscription details, payment method, and recent invoices.
// ---------------------------------------------------------------------------

router.get('/account', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const stripe = await getUncachableStripeClient();

  try {
    const [customerRaw, subsRaw, invoicesRaw] = await Promise.all([
      stripe.customers.retrieve(auth.customerId, {
        expand: ['invoice_settings.default_payment_method'],
      }),
      stripe.subscriptions.list({ customer: auth.customerId, limit: 5 }),
      stripe.invoices.list({ customer: auth.customerId, limit: 12 }),
    ]);

    if (customerRaw.deleted) {
      res.status(404).json({ error: 'Customer account not found.' });
      return;
    }
    const customer = customerRaw as Stripe.Customer;

    // Payment method
    const pmRaw = customer.invoice_settings?.default_payment_method;
    const pm =
      pmRaw && typeof pmRaw === 'object' && 'card' in pmRaw
        ? (pmRaw as Stripe.PaymentMethod)
        : null;
    const paymentMethod = pm?.card
      ? {
          id: pm.id,
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        }
      : null;

    // Active subscription
    const activeSub = getActiveSub(subsRaw.data);
    const optimizerPriceId = process.env.OPTIMIZER_PRICE_ID ?? '';
    const optimizerProPriceId = process.env.OPTIMIZER_PRO_PRICE_ID ?? '';
    let subscription = null;
    if (activeSub) {
      const priceId = activeSub.items.data[0]?.price.id ?? '';
      const plan =
        priceId === optimizerProPriceId
          ? 'optimizer-pro'
          : priceId === optimizerPriceId
            ? 'optimizer'
            : 'optimizer';
      subscription = {
        id: activeSub.id,
        status: activeSub.status,
        plan,
        planLabel: OPTIMIZER_PLAN_LABELS[plan] ?? plan,
        currentPeriodEnd: activeSub.current_period_end,
        trialEnd: activeSub.trial_end ?? null,
        amount: activeSub.items.data[0]?.price.unit_amount ?? 0,
        currency: activeSub.items.data[0]?.price.currency ?? 'usd',
        cancelAtPeriodEnd: activeSub.cancel_at_period_end,
        cancelAt: activeSub.cancel_at ?? null,
      };
    }

    // Invoices
    const invoices = invoicesRaw.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? null,
      amount: inv.amount_paid,
      currency: inv.currency,
      date: inv.created,
      status: inv.status ?? 'unknown',
      pdfUrl: inv.invoice_pdf ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
    }));

    res.json({
      customer: {
        email: customer.email ?? '',
        name: typeof customer.name === 'string' ? customer.name : null,
      },
      subscription,
      paymentMethod,
      invoices,
    });
  } catch (err) {
    req.log.error({ err }, 'GET /api/account failed');
    res.status(500).json({ error: 'Could not load account data.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/account/re-issue-token
// Issues a fresh 30-day JWT for a subscriber with a valid (non-expired) token.
// ---------------------------------------------------------------------------

router.post('/account/re-issue-token', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const stripe = await getUncachableStripeClient();

  const subs = await stripe.subscriptions.list({
    customer: auth.customerId,
    limit: 3,
  });
  const activeSub = getActiveSub(subs.data);
  if (!activeSub) {
    res.status(403).json({ error: 'No active subscription found.' });
    return;
  }

  const priceId = activeSub.items.data[0]?.price.id ?? '';
  const product = productFromPriceId(priceId);
  const token = issueToken({ tier: 'paid', customerId: auth.customerId, product });

  req.log.info({ customerId: auth.customerId }, 'Scan token re-issued');
  res.json({ token });
});

// ---------------------------------------------------------------------------
// POST /api/account/cancel
// Cancels the active subscription at end of current billing period.
// ---------------------------------------------------------------------------

router.post('/account/cancel', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const stripe = await getUncachableStripeClient();

  const subs = await stripe.subscriptions.list({
    customer: auth.customerId,
    limit: 3,
  });
  const activeSub = getActiveSub(subs.data);

  if (!activeSub) {
    res.status(404).json({ error: 'No active subscription found.' });
    return;
  }

  if (activeSub.cancel_at_period_end) {
    res.status(422).json({ error: 'Subscription is already scheduled for cancellation.' });
    return;
  }

  const updated = await stripe.subscriptions.update(activeSub.id, {
    cancel_at_period_end: true,
  });

  req.log.info({ subscriptionId: activeSub.id, cancelAt: updated.cancel_at }, 'Subscription cancel-at-period-end set');
  res.json({ cancelAt: updated.cancel_at, cancelAtPeriodEnd: updated.cancel_at_period_end });
});

// ---------------------------------------------------------------------------
// POST /api/account/uncancel
// Removes a pending cancellation (keeps subscription active).
// ---------------------------------------------------------------------------

router.post('/account/uncancel', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const stripe = await getUncachableStripeClient();

  const subs = await stripe.subscriptions.list({ customer: auth.customerId, limit: 3 });
  const activeSub = getActiveSub(subs.data);
  if (!activeSub) {
    res.status(404).json({ error: 'No subscription found.' });
    return;
  }

  const updated = await stripe.subscriptions.update(activeSub.id, {
    cancel_at_period_end: false,
  });

  res.json({ cancelAtPeriodEnd: updated.cancel_at_period_end });
});

// ---------------------------------------------------------------------------
// POST /api/account/change-plan
// Switches between optimizer and optimizer-pro mid-cycle with proration.
// ---------------------------------------------------------------------------

router.post('/account/change-plan', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { plan } = req.body as { plan?: unknown };
  if (plan !== 'optimizer' && plan !== 'optimizer-pro') {
    res.status(400).json({ error: 'plan must be "optimizer" or "optimizer-pro".' });
    return;
  }

  const newPriceId =
    plan === 'optimizer-pro'
      ? process.env.OPTIMIZER_PRO_PRICE_ID
      : process.env.OPTIMIZER_PRICE_ID;

  if (!newPriceId) {
    res.status(500).json({ error: 'Price not configured. Contact support.' });
    return;
  }

  const stripe = await getUncachableStripeClient();

  const subs = await stripe.subscriptions.list({ customer: auth.customerId, limit: 3 });
  const activeSub = getActiveSub(subs.data);

  if (!activeSub) {
    res.status(404).json({ error: 'No active subscription found.' });
    return;
  }

  const currentPriceId = activeSub.items.data[0]?.price.id;
  if (currentPriceId === newPriceId) {
    res.status(422).json({ error: 'You are already on that plan.' });
    return;
  }

  const itemId = activeSub.items.data[0]?.id;
  if (!itemId) {
    res.status(500).json({ error: 'Subscription item not found.' });
    return;
  }

  await stripe.subscriptions.update(activeSub.id, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: 'always_invoice',
  });

  // Issue a new token with the updated plan
  const newToken = issueToken({ tier: 'paid', customerId: auth.customerId, product: plan });

  req.log.info({ subscriptionId: activeSub.id, oldPrice: currentPriceId, newPrice: newPriceId }, 'Plan changed');
  res.json({ plan, token: newToken });
});

// ---------------------------------------------------------------------------
// POST /api/account/update-payment
// Creates a SetupIntent so the subscriber can enter a new payment method.
// ---------------------------------------------------------------------------

router.post('/account/update-payment', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const stripe = await getUncachableStripeClient();
  const publishableKey = await getStripePublishableKey();

  const intent = await stripe.setupIntents.create({
    customer: auth.customerId,
    automatic_payment_methods: { enabled: true },
  });

  res.json({ clientSecret: intent.client_secret, publishableKey });
});

// ---------------------------------------------------------------------------
// POST /api/account/set-default-payment
// After SetupIntent confirms, sets the new payment method as default.
// ---------------------------------------------------------------------------

router.post('/account/set-default-payment', async (req, res): Promise<void> => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const { paymentMethodId } = req.body as { paymentMethodId?: unknown };
  if (typeof paymentMethodId !== 'string' || !paymentMethodId.startsWith('pm_')) {
    res.status(400).json({ error: 'paymentMethodId is required.' });
    return;
  }

  const stripe = await getUncachableStripeClient();

  // Attach to customer if not already attached
  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: auth.customerId });
  } catch {
    // May already be attached — continue
  }

  // Set as default for future invoices
  await stripe.customers.update(auth.customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Also update the active subscription's default PM
  const subs = await stripe.subscriptions.list({ customer: auth.customerId, limit: 3 });
  const activeSub = getActiveSub(subs.data);
  if (activeSub) {
    await stripe.subscriptions.update(activeSub.id, {
      default_payment_method: paymentMethodId,
    });
  }

  req.log.info({ customerId: auth.customerId, paymentMethodId }, 'Default payment method updated');
  res.json({ success: true });
});

export default router;
