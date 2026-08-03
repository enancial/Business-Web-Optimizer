/**
 * Trial reminder job — sends a "your trial ends tomorrow" email to customers
 * whose free trial expires within the next 24 hours.
 *
 * Designed to be called on a recurring schedule (e.g. every hour).
 * Idempotency is tracked via Stripe subscription metadata:
 *   metadata.trial_reminder_sent = 'true'
 * so the email is sent at most once per subscription regardless of how many
 * times the job runs.
 */

import type { Logger } from 'pino';
import { getUncachableStripeClient } from '../stripeClient';
import { sendTransactionalEmail, buildTrialReminderEmail } from './subscriptionWebhook';

// How far ahead we look for expiring trials.
// 25 hours gives a comfortable buffer: if the job runs at :05 past the hour,
// trials ending anywhere in the next ~24h are still caught.
export const REMINDER_WINDOW_HOURS = 25;

/**
 * Main entry point for the scheduled job.
 *
 * Scans all trialing Stripe subscriptions, finds any whose trial ends within
 * the next REMINDER_WINDOW_HOURS, and sends a reminder email exactly once.
 */
export async function sendPendingTrialReminders(log: Logger): Promise<void> {
  const stripe = await getUncachableStripeClient();

  const nowSec = Math.floor(Date.now() / 1000);
  const windowEndSec = nowSec + REMINDER_WINDOW_HOURS * 3600;

  // Fetch all trialing subscriptions.
  // The Stripe API doesn't support filtering by trial_end, so we retrieve them
  // all and filter in-process.  Typical deployments have very few concurrent
  // trials, so a single page of 100 is almost always sufficient.
  const { data: subs } = await stripe.subscriptions.list({
    status: 'trialing',
    limit: 100,
  });

  const eligible = subs.filter(
    (s) =>
      typeof s.trial_end === 'number' &&
      s.trial_end >= nowSec &&
      s.trial_end <= windowEndSec &&
      s.metadata?.trial_reminder_sent !== 'true',
  );

  if (eligible.length === 0) {
    log.debug({ nowSec, windowEndSec }, 'Trial reminder job: no eligible subscriptions');
    return;
  }

  log.info({ count: eligible.length }, 'Trial reminder job: sending reminders');

  for (const sub of eligible) {
    const customerId =
      typeof sub.customer === 'string'
        ? sub.customer
        : (sub.customer as { id: string } | null)?.id ?? '';

    if (!customerId) {
      log.warn({ subscriptionId: sub.id }, 'Trial reminder: no customer ID — skipping');
      continue;
    }

    // Retrieve the customer to get their email
    let customer: Awaited<ReturnType<typeof stripe.customers.retrieve>>;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch (err) {
      log.error({ err, customerId }, 'Trial reminder: failed to retrieve customer — skipping');
      continue;
    }

    if (customer.deleted || !('email' in customer) || !customer.email) {
      log.warn({ customerId, subscriptionId: sub.id }, 'Trial reminder: customer has no email — skipping');
      continue;
    }

    const email = customer.email;

    // Derive plan details from the subscription
    const priceItem = sub.items.data[0];
    const amountCents = priceItem?.price?.unit_amount ?? 0;
    const priceId = priceItem?.price?.id ?? '';
    const isProPlan = priceId === process.env.OPTIMIZER_PRO_PRICE_ID;
    const planName = isProPlan ? 'Optimizer Pro' : 'Optimizer';
    const amountFormatted =
      amountCents > 0
        ? `$${(amountCents / 100).toFixed(2).replace(/\.00$/, '')}/mo`
        : 'your plan rate';

    // Format the trial end date
    const trialEndDate = new Date((sub.trial_end as number) * 1000);
    const dateFormatted = trialEndDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    });

    const accountUrl = 'https://businessweboptimizer.com/#/account';
    const html = buildTrialReminderEmail({ planName, amountFormatted, dateFormatted, accountUrl });

    const sent = await sendTransactionalEmail({
      to: email,
      subject: `Your ${planName} trial ends tomorrow — ${amountFormatted} will be charged`,
      html,
      log,
    });

    if (sent) {
      // Mark idempotency flag on the subscription so we never send twice
      try {
        await stripe.subscriptions.update(sub.id, {
          metadata: { trial_reminder_sent: 'true' },
        });
      } catch (err) {
        // Non-fatal: worst case we send a duplicate on the next run, which is
        // far better than crashing or skipping remaining subscriptions.
        log.error({ err, subscriptionId: sub.id }, 'Trial reminder: failed to mark subscription metadata');
      }

      log.info(
        { subscriptionId: sub.id, customerId, email, trialEndDate: dateFormatted },
        'Trial reminder email sent',
      );
    }
  }
}
