/**
 * Custom webhook business logic for verified Stripe webhook events.
 */

import type Stripe from 'stripe';
import type { Logger } from 'pino';
import { getUncachableStripeClient } from '../stripeClient';
import { db, affiliates, affiliateConversions, affiliateEarnings } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { sendViaSmtp2go } from './smtp2go';

// ---------------------------------------------------------------------------
// Shared email helper (SMTP2Go)
// ---------------------------------------------------------------------------

/**
 * Sends a transactional email via SMTP2Go.
 * Returns true on success, false on failure (non-throwing — callers log).
 */
export async function sendTransactionalEmail({
  to,
  subject,
  html,
  log,
}: {
  to: string;
  subject: string;
  html: string;
  log: Logger;
}): Promise<boolean> {
  const apiKey = process.env.SMTP2GO_API_KEY;
  if (!apiKey) {
    log.error('SMTP2GO_API_KEY is not set — cannot send transactional email');
    return false;
  }

  const sender =
    process.env.SMTP2GO_SENDER_EMAIL ?? 'report@businessweboptimizer.com';

  const result = await sendViaSmtp2go(apiKey, {
    to: [to],
    sender,
    subject,
    html_body: html,
  });

  if (!result.ok) {
    if (result.unreachable) {
      log.error({ err: result.detail, to, subject }, 'Failed to reach SMTP2Go API');
    } else {
      log.error(
        { status: result.status, detail: result.detail, to, subject },
        'SMTP2Go send failed',
      );
    }
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Main dispatcher — call this after the webhook signature has been verified.
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
      // All other events are intentionally ignored.
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
  const invoiceWithSubscription = invoice as unknown as {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscriptionId =
    typeof invoiceWithSubscription.subscription === 'string'
      ? invoiceWithSubscription.subscription
      : null;
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

export function buildTrialReminderEmail({
  planName,
  amountFormatted,
  dateFormatted,
  accountUrl,
}: {
  planName: string;
  amountFormatted: string;
  dateFormatted: string;
  accountUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your free trial ends soon</title>
</head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">

          <!-- Header -->
          <tr>
            <td style="background: #1a3a7a; border-radius: 12px 12px 0 0; padding: 32px 32px 28px;">
              <p style="margin: 0 0 4px; font-size: 13px; color: #93c5fd; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;">Business Web Optimizer</p>
              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 700; color: #ffffff; line-height: 1.2;">Your free trial ends tomorrow</h1>
              <p style="margin: 0; font-size: 14px; color: #bfdbfe;">Here's what you need to know before ${dateFormatted}.</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: #ffffff; padding: 32px 32px 24px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.6;">
                Your 7-day free trial of <strong>${planName}</strong> is ending on <strong>${dateFormatted}</strong>.
                Unless you cancel before then, your card will be charged <strong>${amountFormatted}</strong> and your subscription will continue automatically.
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">
                <strong>Want to keep your access?</strong> No action needed — we'll take care of the rest.
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">
                <strong>Want to cancel?</strong> Visit your account page before ${dateFormatted} and click <em>Cancel trial</em>. You won't be charged.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius: 8px; background: #1a3a7a;">
                    <a href="${accountUrl}" style="
                      display: inline-block;
                      padding: 14px 32px;
                      font-size: 15px;
                      font-weight: 700;
                      color: #ffffff;
                      text-decoration: none;
                      border-radius: 8px;
                    ">Manage my account →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider + details -->
          <tr>
            <td style="background: #ffffff; padding: 0 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 4px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 6px; font-size: 13px; color: #6b7280;">Plan</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">${planName} — ${amountFormatted}</p>
                  </td>
                  <td align="right" valign="top">
                    <p style="margin: 0 0 6px; font-size: 13px; color: #6b7280;">Trial ends</p>
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">${dateFormatted}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; border-radius: 0 0 12px 12px; padding: 20px 32px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                Questions? Reply to this email or call
                <a href="tel:+19844007773" style="color: #6b7280;">(984) 400‑7773</a>.
                You're receiving this because you started a free trial at
                <a href="https://businessweboptimizer.com" style="color: #6b7280;">businessweboptimizer.com</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
