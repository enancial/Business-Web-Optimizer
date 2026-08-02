import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// affiliates — one row per program member
// ---------------------------------------------------------------------------
export const affiliates = pgTable('affiliates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  code: text('code').notNull().unique(),
  website: text('website'),
  promotionMethod: text('promotion_method'),
  paypalEmail: text('paypal_email'),
  active: boolean('active').notNull().default(true),
  /** One-time login code (6 digits) stored while pending verification */
  otpCode: text('otp_code'),
  otpExpiresAt: timestamp('otp_expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// affiliate_conversions — one row per referred subscription
// ---------------------------------------------------------------------------
export const affiliateConversions = pgTable('affiliate_conversions', {
  id: serial('id').primaryKey(),
  affiliateId: integer('affiliate_id')
    .references(() => affiliates.id)
    .notNull(),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  /** Unique: one conversion per subscription */
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  plan: text('plan').notNull(), // 'optimizer' | 'optimizer-pro'
  status: text('status').notNull().default('active'), // 'active' | 'canceled' | 'refunded'
  commissionRate: real('commission_rate').notNull().default(0.3),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// affiliate_earnings — one row per paid invoice that earns commission
// ---------------------------------------------------------------------------
export const affiliateEarnings = pgTable('affiliate_earnings', {
  id: serial('id').primaryKey(),
  affiliateId: integer('affiliate_id')
    .references(() => affiliates.id)
    .notNull(),
  /** Unique: idempotency guard — one earnings row per Stripe invoice */
  stripeInvoiceId: text('stripe_invoice_id').notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  commissionCents: integer('commission_cents').notNull(),
  periodMonth: integer('period_month').notNull(), // 1–12
  periodYear: integer('period_year').notNull(),
  paid: boolean('paid').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Affiliate = typeof affiliates.$inferSelect;
export type InsertAffiliate = typeof affiliates.$inferInsert;
export type AffiliateConversion = typeof affiliateConversions.$inferSelect;
export type AffiliateEarning = typeof affiliateEarnings.$inferSelect;
