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
import { db, affiliates, affiliateConversions, affiliateEarnings } from '@workspace/db';
import { eq, and } from 'drizzle-orm';

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
    case 'invoice.paid':
      await onInvoicePaid(event.data.object as Stripe.Invoice, log);
      break;
    case 'customer.subscription.created':
      await onSubscriptionCreated(event.data.object as Stripe.Subscription, log);
      break;
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(event.data.object as Stripe.Subscription, log);
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
  // Check for ANY active optimizer/optimizer-pro subscription, not just an
  // exact price match.  This prevents a second subscription if the same
  // customer buys again (e.g. navigating back to /checkout) or tries to
  // upgrade through checkout instead of the /account plan-change flow.
  const existing = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  const knownPriceIds = new Set(
    [priceId, process.env.OPTIMIZER_PRICE_ID, process.env.OPTIMIZER_PRO_PRICE_ID].filter(
      Boolean,
    ) as string[],
  );

  const live = existing.data.filter(
    (s) =>
      (s.status === 'active' || s.status === 'trialing' || s.status === 'incomplete') &&
      s.items.data.some((item) => knownPriceIds.has(item.price.id)),
  );

  if (live.length > 0) {
    log.warn(
      {
        paymentIntentId: paymentIntent.id,
        existingSubscriptionId: live[0].id,
        existingStatus: live[0].status,
        existingPriceId: live[0].items.data[0]?.price.id,
        requestedPriceId: priceId,
      },
      'Skipping duplicate subscription creation for customer — active optimizer subscription already exists',
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

  // Record affiliate conversion if this checkout was referred
  await recordAffiliateConversion(
    paymentIntent.metadata?.affiliate_code,
    customerId,
    subscription.id,
    paymentIntent.metadata?.product,
    log,
  );
}

// ---------------------------------------------------------------------------
// Affiliate: record a new conversion after subscription creation
// ---------------------------------------------------------------------------

async function recordAffiliateConversion(
  affiliateCode: string | undefined,
  customerId: string,
  subscriptionId: string,
  product: string | undefined,
  log: Logger,
): Promise<void> {
  if (!affiliateCode) return;

  const [affiliate] = await db
    .select()
    .from(affiliates)
    .where(and(eq(affiliates.code, affiliateCode), eq(affiliates.active, true)))
    .limit(1);

  if (!affiliate) {
    log.warn(
      { affiliateCode, subscriptionId },
      'Affiliate code in PaymentIntent metadata not found — skipping conversion',
    );
    return;
  }

  await db
    .insert(affiliateConversions)
    .values({
      affiliateId: affiliate.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      plan: product === 'optimizer-pro' ? 'optimizer-pro' : 'optimizer',
      status: 'active',
      commissionRate: 0.3,
    })
    .onConflictDoNothing();

  log.info(
    { affiliateId: affiliate.id, subscriptionId, plan: product },
    'Affiliate conversion recorded',
  );
}

// ---------------------------------------------------------------------------
// invoice.paid — accrue earnings for the first 12 months
// ---------------------------------------------------------------------------

async function onInvoicePaid(invoice: Stripe.Invoice, log: Logger): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : null;
  if (!subscriptionId || !invoice.amount_paid || invoice.amount_paid <= 0) return;

  // Find an active affiliate conversion for this subscription
  const [conversion] = await db
    .select()
    .from(affiliateConversions)
    .where(
      and(
        eq(affiliateConversions.stripeSubscriptionId, subscriptionId),
        eq(affiliateConversions.status, 'active'),
      ),
    )
    .limit(1);

  if (!conversion) return;

  // Enforce the 12-month commission window
  const conversionDate = new Date(conversion.createdAt);
  const now = new Date();
  const monthsElapsed =
    (now.getFullYear() - conversionDate.getFullYear()) * 12 +
    (now.getMonth() - conversionDate.getMonth());

  if (monthsElapsed >= 12) {
    log.info(
      { subscriptionId, monthsElapsed },
      'Affiliate commission window expired (12 months) — skipping earnings row',
    );
    return;
  }

  // Idempotency: skip if we already recorded earnings for this invoice
  const existing = await db
    .select({ id: affiliateEarnings.id })
    .from(affiliateEarnings)
    .where(eq(affiliateEarnings.stripeInvoiceId, invoice.id))
    .limit(1);
  if (existing.length > 0) return;

  const periodDate = new Date((invoice.period_start ?? 0) * 1000);
  const commissionCents = Math.round(invoice.amount_paid * conversion.commissionRate);

  await db.insert(affiliateEarnings).values({
    affiliateId: conversion.affiliateId,
    stripeInvoiceId: invoice.id,
    amountCents: invoice.amount_paid,
    commissionCents,
    periodMonth: periodDate.getMonth() + 1,
    periodYear: periodDate.getFullYear(),
    paid: false,
  });

  log.info(
    {
      affiliateId: conversion.affiliateId,
      invoiceId: invoice.id,
      amountCents: invoice.amount_paid,
      commissionCents,
    },
    'Affiliate earnings recorded for invoice.paid',
  );
}

// ---------------------------------------------------------------------------
// customer.subscription.created — record affiliate conversion at trial start
// ---------------------------------------------------------------------------

async function onSubscriptionCreated(
  subscription: Stripe.Subscription,
  log: Logger,
): Promise<void> {
  // Only attribute trial subscriptions here. Active (non-trial) subscriptions
  // from the old PaymentIntent flow are attributed in onPaymentIntentSucceeded.
  if (subscription.status !== 'trialing') return;

  const affiliateCode = subscription.metadata?.affiliate_code;
  if (!affiliateCode) return;

  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : (subscription.customer as Stripe.Customer | null)?.id ?? '';

  const product = subscription.metadata?.product;

  log.info(
    { subscriptionId: subscription.id, affiliateCode, product },
    'Trial subscription created with affiliate code — recording conversion',
  );

  await recordAffiliateConversion(affiliateCode, customerId, subscription.id, product, log);
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted — stop future commissions
// ---------------------------------------------------------------------------

async function onSubscriptionDeleted(
  subscription: Stripe.Subscription,
  log: Logger,
): Promise<void> {
  const updated = await db
    .update(affiliateConversions)
    .set({ status: 'canceled' })
    .where(eq(affiliateConversions.stripeSubscriptionId, subscription.id))
    .returning({ id: affiliateConversions.id });

  if (updated.length > 0) {
    log.info(
      { subscriptionId: subscription.id },
      'Affiliate conversion marked as canceled following subscription deletion',
    );
  }
}
