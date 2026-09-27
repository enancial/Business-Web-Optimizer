# Business Web Optimizer

A SaaS site-optimisation tool: paste any URL, get an instant performance/SEO report, and optionally subscribe for deeper analysis with Optimizer or Optimizer Pro.

## Run & operate

- `pnpm --filter @workspace/api-server run dev` — run the API server locally with `PORT` set.
- `pnpm --filter @workspace/businesswebdev run dev` — run the frontend with Vite.
- `pnpm --filter @workspace/api-server run test` — run backend tests.
- `pnpm run typecheck` — full typecheck across packages.
- `pnpm --filter @workspace/db run generate` — generate D1/SQLite Drizzle migrations.
- `npx wrangler deploy --config artifacts/api-server/wrangler.jsonc` — deploy the Cloudflare Worker after the frontend build exists.

## Cloudflare deployment status

Business Web Optimizer is ported to a Cloudflare Worker named `business-web-optimizer-app` with D1 database `business-web-optimizer-db`. The Worker configuration intentionally has no `routes` or custom-domain binding; `businessweboptimizer.com` is attached by the cutover owner after workers.dev verification.

The previous Replit Postgres data source is frozen/suspended and unreachable. The D1 deployment starts from an empty database by owner precedent rather than fabricating or backfilling unavailable data.

## Required environment variables / secrets

| Key | Type | Purpose |
|---|---|---|
| `DB` | Cloudflare binding | D1 database binding configured in `artifacts/api-server/wrangler.jsonc` |
| `SESSION_SECRET` | secret | Signs JWT auth tokens issued to subscribers |
| `ADMIN_SECRET` | secret | Authenticates admin payout routes |
| `SMTP2GO_API_KEY` | secret | Sends scan-report and transactional emails via SMTP2Go REST API |
| `SMTP2GO_SENDER_EMAIL` | variable | Sender address, currently `report@businessweboptimizer.com` |
| `STRIPE_SECRET_KEY` | secret | Stripe API server-side key; not set until owner supplies a suitable key |
| `STRIPE_PUBLISHABLE_KEY` | variable | Stripe publishable key returned by `/api/checkout-config` |
| `STRIPE_WEBHOOK_SECRET` | secret | Verifies Stripe webhook signatures if billing is enabled |

With no Stripe key, free scans still work and paid checkout/billing routes return HTTP 503 with an explicit configuration error rather than a fake success.

## Stack

- pnpm workspaces, TypeScript 5.9
- **Frontend**: React + Vite + Wouter + Tailwind + shadcn/ui (`artifacts/businesswebdev`)
- **Backend**: Express 5 + pino logging running inside Cloudflare Workers (`artifacts/api-server`)
- **DB**: Cloudflare D1 + Drizzle ORM (`lib/db/src/schema/`)
- **Payments**: Stripe PaymentElement + verified Stripe webhook events
- **Email**: SMTP2Go REST API
- **Auth**: JWT signed with `SESSION_SECRET`; free-tier scan token cookie = `bwo_scan_token`; affiliate session token = `bwo_affiliate_token`

## Where things live

- DB schema: `lib/db/src/schema/`
- D1 migrations: `lib/db/drizzle/`
- Worker entrypoint: `artifacts/api-server/worker/index.ts`
- Worker config: `artifacts/api-server/wrangler.jsonc`
- API routes: `artifacts/api-server/src/routes/`
- Stripe webhook logic: `artifacts/api-server/src/lib/subscriptionWebhook.ts`
- Trial reminder cron: `artifacts/api-server/src/lib/trialReminder.ts`, triggered hourly by Worker cron
- Frontend pages: `artifacts/businesswebdev/src/pages/`
- Frontend routes: `artifacts/businesswebdev/src/App.tsx`

## Product

- **Free tier**: scan any URL, top 3 issues. No credit card required.
- **Optimizer** (`/checkout?product=optimizer`): 7-day free trial, then $29/mo. Full report with all checks.
- **Optimizer Pro** (`/checkout?product=optimizer-pro`): 7-day free trial, then $79/mo. Full report plus schema.org deep-dive and white-label flag.
- **Affiliate program**: affiliates sign up at `/affiliates/join`, share a referral link (`/?ref=CODE`), earn 30% commission for 12 months on each paid subscriber they refer. Dashboard at `/affiliates/dashboard`. Admin payout UI at `/admin/affiliate-payouts`.
- **Trial/affiliate details**: see `TRIAL_AND_AFFILIATES.md`.

## Architecture decisions

- **Tier from JWT only**: plan/product is always derived from the verified JWT bearer token; client-supplied body fields are ignored.
- **Expired tokens**: server returns `401 + { tokenExpired: true }`; tampered/malformed tokens fall back silently to free tier.
- **No Stripe Customer Portal**: all account management is on-site at `/account`.
- **Checkout flow (trial)**: `POST /api/create-payment-intent` creates a Stripe Subscription with `trial_period_days: 7` and returns a SetupIntent `client_secret` (`intentType: 'setup'`). Frontend calls `stripe.confirmSetup()` — no charge on day 0. Stripe charges after 7 days via `invoice.paid`.
- **Affiliate tracking (trial)**: referral code stored in Stripe Subscription metadata → `customer.subscription.created` (status: `trialing`) webhook → `affiliate_conversions` table. Legacy `payment_intent.succeeded` path kept for backward compatibility.
- **Commission window**: 30% of `invoice.amount_paid` for 12 months from `affiliate_conversions.created_at`. Trial's $0 invoice is skipped by the `amount_paid <= 0` guard.
- **Payout flow**: manual PayPal; admin marks rows paid via `/api/admin/affiliate-mark-paid`; CSV download available.

## Gotchas

- **Wrangler auth**: run wrangler with `CLOUDFLARE_API_TOKEN` unset so the stored OAuth login is used.
- **Affiliate DB tables**: `affiliates`, `affiliate_conversions`, `affiliate_earnings` are created by the generated D1 migration.
- **`ADMIN_SECRET`** must be set before admin routes will accept requests; a missing secret causes admin calls to return HTTP 503.
- **Stripe price IDs from legacy Replit config**: `OPTIMIZER_PRICE_ID=price_1TzrCmJUmA42MDGcjlMck8Gd`, `OPTIMIZER_PRO_PRICE_ID=price_1TzrCmJUmA42MDGcmqVtDmpO`, `LAUNCH_PACKAGE_PRICE_ID=price_1TzKdMJUmA42MDGciRYULgas`, and `MANAGEMENT_PLAN_PRICE_ID=price_1TzKdNJUmA42MDGcFVwM96Wi`. These are recorded for configuration continuity and still need live Stripe verification before billing is enabled.
- **Free ($0 promo) affiliate tracking**: not tracked — only conversions that lead to a paid subscription are attributed.
- **Trial entitlement**: `status === 'trialing'` grants full paid features — `getActiveSub()` in `account.ts` handles both active and trialing subscriptions.
