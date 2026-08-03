# Trial & Affiliate Program — Technical Reference

## 7-Day Free Trial

### How it's configured

The trial is set **in code at subscription creation time** using Stripe's `trial_period_days: 7` parameter. No Stripe Dashboard changes are required; no new products or prices were created. The same `OPTIMIZER_PRICE_ID` and `OPTIMIZER_PRO_PRICE_ID` environment variables are used.

### Checkout flow

1. User clicks "Start 7-day free trial" on the pricing page.
2. Frontend calls `POST /api/create-payment-intent` with `{ product, promotionCode?, affiliateCode? }`.
3. Backend creates a Stripe Customer + Subscription with:
   - `trial_period_days: 7`
   - `payment_behavior: 'default_incomplete'`
   - `payment_settings: { save_default_payment_method: 'on_subscription' }`
   - `expand: ['pending_setup_intent']`
4. Backend returns `{ clientSecret: <setup_intent.client_secret>, intentType: 'setup', trialDays: 7, ... }`.
5. Frontend initialises `<Elements>` with the SetupIntent `client_secret`.
6. User enters card details in Stripe's `<PaymentElement>` — **no charge occurs**.
7. Frontend calls `stripe.confirmSetup()` (not `confirmPayment()`), saves the card, redirects to `/success`.
8. Stripe fires `customer.subscription.created` with `status: trialing` — affiliate conversion is recorded here if an `affiliate_code` was passed in subscription metadata.
9. After 7 days, Stripe fires `invoice.paid` with the real amount — this is the first charge, and affiliate earnings accrue here.

### Promo codes with trial

Promo codes are applied to the subscription via `discounts: [{ promotion_code: promoCode.id }]`. They take effect on the first real invoice (after the trial). A `once` coupon applies to the first paid invoice; `forever`/`repeating` coupons apply to all subsequent invoices.

### Free ($0) promo path — unchanged

When a promo code reduces the price to $0, the existing direct subscription creation path is used (no trial, no SetupIntent). This path was not changed.

---

## Feature Tiers

| Feature | Free | Optimizer ($29/mo) | Optimizer Pro ($79/mo) |
|---|---|---|---|
| Page scan limit | 5 pages | Unlimited | Unlimited |
| Issues shown | Top 3 | All 20+ checks | All 20+ checks |
| PDF report | ✗ | ✓ | ✓ |
| Monthly re-scan | ✗ | ✓ | ✓ |
| Email delivery | ✗ | ✓ | ✓ |
| Scheduled auto-scans | ✗ | ✗ | ✓ |
| Competitor comparison | ✗ | ✗ | ✓ |
| Schema.org deep-dive | ✗ | ✗ | ✓ |
| White-label reports | ✗ | ✗ | ✓ |
| API access | ✗ | ✗ | ✓ |
| Credit card required | No | Yes (trial) | Yes (trial) |
| 7-day free trial | n/a | ✓ | ✓ |

---

## Entitlement Logic

Plan is determined **from the verified JWT only** — never from client-supplied body fields.

A subscriber with Stripe subscription `status === 'trialing'` OR `status === 'active'` receives full paid features. This is enforced in:

- `artifacts/api-server/src/routes/account.ts` — `getActiveSub()`: `subs.find(s => s.status === 'active' || s.status === 'trialing')`
- `POST /api/account/auth` — issues a `{ tier: 'paid' }` JWT for both `active` and `trialing` subscriptions

**No code changes were needed for entitlement** — the `trialing` check was already in place.

---

## Affiliate Attribution with Trial

### Previous flow (legacy, kept for backward compat)

`payment_intent.succeeded` → `recordAffiliateConversion()`

### New trial flow

`customer.subscription.created` (status: `trialing`) → `onSubscriptionCreated()` → `recordAffiliateConversion()`

- The `affiliate_code` travels in the Stripe Subscription's `metadata.affiliate_code` field (set at subscription creation in `checkout.ts`).
- The 12-month commission window starts from `affiliate_conversions.created_at` — i.e. **at trial start**, not at first charge.
- `invoice.paid` fires after day 7 with `amount_paid > 0` → `onInvoicePaid()` accrues earnings (unchanged).
- `invoice.paid` fires during the trial with `amount_paid === 0` → skipped by the `amount_paid <= 0` guard (unchanged).

---

## Stripe Dashboard — Required Steps

**None.** The trial is configured entirely in code. `trial_period_days: 7` is passed at subscription creation time via the Stripe API. Existing Price objects were not modified. No new products, prices, or coupons were created.
