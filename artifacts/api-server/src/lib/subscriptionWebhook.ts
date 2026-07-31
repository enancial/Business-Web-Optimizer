/**
 * Custom webhook business logic layered on top of stripe-replit-sync.
 *
 * stripe-replit-sync's processWebhook() already verifies the Stripe signature
 * and upserts every event into the local DB.  This module runs *after* that
 * sync step to handle domain-specific actions — currently: creating a recurring
 * subscription when a Management Plan PaymentIntent succeeds.
 */

import type Stripe from 'stripe';
import type { Logger } from 'pino';
import { getUncachableStripeClient } from '../stripeClient';

// ---------------------------------------------------------------------------
// Main dispatcher — call this after stripeSync.processWebhook() returns
// ---------------------------------------------------------------------------

export async function handleWebhookEvent(
  event: Stripe.Event,
  log: Logger,
): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await onPaymentIntentSucceeded(
        event.data.object as Stripe.PaymentIntent,
        log,
      );
      break;
    default:
      // All other events are handled by stripe-replit-sync — nothing to do here.
      break;
  }
}

// ---------------------------------------------------------------------------
// payment_intent.succeeded handler
// ---------------------------------------------------------------------------

async function onPaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  log: Logger,
): Promise<void> {
  // Only act on live-mode events — skip test/sandbox payment intents
  if (!paymentIntent.livemode) {
    if (paymentIntent.metadata?.action === 'create_subscription') {
      log.info(
        { id: paymentIntent.id },
        'create_subscription action skipped (test mode)',
      );
    }
    return;
  }

  // Only handle payment intents that were tagged for subscription creation
  if (paymentIntent.metadata?.action !== 'create_subscription') return;

  const priceId =
    paymentIntent.metadata.price_id ||
    process.env.MANAGEMENT_PLAN_PRICE_ID ||
    '';

  const customerId =
    typeof paymentIntent.customer === 'string'
      ? paymentIntent.customer
      : (paymentIntent.customer as Stripe.Customer | null)?.id ?? '';

  const paymentMethodId =
    typeof paymentIntent.payment_method === 'string'
      ? paymentIntent.payment_method
      : (paymentIntent.payment_method as Stripe.PaymentMethod | null)?.id ?? '';

  if (!priceId || !customerId || !paymentMethodId) {
    log.error(
      {
        paymentIntentId: paymentIntent.id,
        hasPrice: Boolean(priceId),
        hasCustomer: Boolean(customerId),
        hasPaymentMethod: Boolean(paymentMethodId),
      },
      'Cannot create subscription: missing price_id, customer, or payment_method on PaymentIntent',
    );
    return;
  }

  const stripe = await getUncachableStripeClient();

  // ── Idempotency check ────────────────────────────────────────────────────
  // If a subscription already exists for this customer + price, don't create
  // a duplicate. This keeps the handler safe to re-run on retried webhooks.
  const existing = await stripe.subscriptions.list({
    customer: customerId,
    price: priceId,
    // Check both active and incomplete (might still be processing)
    status: 'all',
    limit: 5,
  });

  const live = existing.data.filter(
    (s) =>
      s.status === 'active' ||
      s.status === 'trialing' ||
      s.status === 'incomplete',
  );

  if (live.length > 0) {
    log.info(
      {
        paymentIntentId: paymentIntent.id,
        existingSubscriptionId: live[0].id,
        status: live[0].status,
      },
      'Subscription already exists for this customer+price — skipping duplicate creation',
    );
    return;
  }

  // ── Create the recurring subscription ────────────────────────────────────
  // The PaymentIntent was created with setup_future_usage: 'off_session',
  // so Stripe has already attached the payment method to the customer.
  // Set it as the default so invoices charge automatically.
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Apply promotion code to the subscription if one was used at checkout.
  // 'once' coupons apply to the first subscription invoice (month 2).
  // 'forever' / 'repeating' coupons continue for subsequent months.
  const promotionCodeId = paymentIntent.metadata?.promotion_code_id;

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    default_payment_method: paymentMethodId,
    // Bill immediately for the second month (first was the PaymentIntent)
    billing_cycle_anchor_config: { day_of_month: new Date().getDate() },
    ...(promotionCodeId
      ? { discounts: [{ promotion_code: promotionCodeId }] }
      : {}),
    metadata: {
      source_payment_intent: paymentIntent.id,
      ...(promotionCodeId ? { promotion_code_id: promotionCodeId } : {}),
    },
  });

  log.info(
    {
      subscriptionId: subscription.id,
      customerId,
      priceId,
      status: subscription.status,
      paymentIntentId: paymentIntent.id,
    },
    'Recurring subscription created automatically via payment_intent.succeeded webhook',
  );

  // stripe-replit-sync will sync this subscription to the local DB when
  // the customer.subscription.created webhook arrives — no extra DB work needed.
}
