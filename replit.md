# Business Web Optimizer

A SaaS site-optimisation tool: paste any URL, get an instant performance/SEO report, and optionally subscribe for deeper analysis with Optimizer or Optimizer Pro.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/businesswebdev run dev` — run the frontend (Vite, dynamic port)
- `pnpm --filter @workspace/api-server run test` — run all backend tests (Vitest, ~83 tests)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push Drizzle schema changes to the live Postgres DB (dev only)

## Required Environment Variables / Secrets

| Key | Type | Purpose |
|---|---|---|
| `DATABASE_URL` | runtime-managed | Postgres connection string (set automatically by Replit) |
| `SESSION_SECRET` | secret | Signs JWT auth tokens issued to subscribers |
| `STRIPE_SECRET_KEY` | secret | Stripe API (server-side) |
| `STRIPE_PUBLISHABLE_KEY` | secret | Stripe API (client-side, embedded in frontend) |
| `SMTP2GO_API_KEY` | secret | Sends scan-report emails via SMTP2Go REST API |
| `ADMIN_SECRET` | secret | Bearer token for admin payout routes (`/api/admin/affiliate-payouts`, `/api/admin/affiliate-mark-paid`) — keep this value safe and share only with admins |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React + Vite + Wouter + Tailwind + shadcn/ui (`artifacts/businesswebdev`)
- **Backend**: Express 5 + pino logging (`artifacts/api-server`)
- **DB**: PostgreSQL + Drizzle ORM (`lib/db/src/schema/`)
- **Payments**: Stripe PaymentElement + `stripe-replit-sync` webhook bridge
- **Email**: SMTP2Go REST API
- **Auth**: JWT signed with `SESSION_SECRET`; free-tier scan token cookie = `bwo_scan_token`; affiliate session token = `bwo_affiliate_token`

## Where Things Live

- DB schema: `lib/db/src/schema/` — `users.ts`, `affiliates.ts`
- API routes: `artifacts/api-server/src/routes/` — `scan.ts`, `checkout.ts`, `account.ts`, `affiliates.ts`, `adminAffiliates.ts`
- Stripe webhook logic: `artifacts/api-server/src/lib/subscriptionWebhook.ts`
- Frontend pages: `artifacts/businesswebdev/src/pages/`
- Frontend routes: `artifacts/businesswebdev/src/App.tsx`

## Product

- **Free tier**: scan any URL, up to 5 pages, top 3 issues. No credit card required.
- **Optimizer** (`/checkout?product=optimizer`): 7-day free trial, then $29/mo. Full report with all checks.
- **Optimizer Pro** (`/checkout?product=optimizer-pro`): 7-day free trial, then $79/mo. Full report **plus** schema.org deep-dive and white-label flag.
- **Affiliate program**: affiliates sign up at `/affiliates/join`, share a referral link (`/?ref=CODE`), earn 30 % commission for 12 months on each paid subscriber they refer. Dashboard at `/affiliates/dashboard`. Admin payout UI at `/admin/affiliate-payouts`.
- **Trial/affiliate details**: see `TRIAL_AND_AFFILIATES.md`.

## Architecture Decisions

- **Tier from JWT only**: plan/product is always derived from the verified JWT bearer token; client-supplied body fields are ignored.
- **Expired tokens**: server returns `401 + { tokenExpired: true }`; tampered/malformed tokens fall back silently to free tier.
- **No Stripe Customer Portal**: all account management is on-site at `/account`.
- **Checkout flow (trial)**: `POST /api/create-payment-intent` creates a Stripe Subscription with `trial_period_days: 7` and returns a SetupIntent `client_secret` (`intentType: 'setup'`). Frontend calls `stripe.confirmSetup()` — no charge on day 0. Stripe charges after 7 days via `invoice.paid`.
- **Affiliate tracking (trial)**: referral code stored in Stripe Subscription metadata → `customer.subscription.created` (status: `trialing`) webhook → `affiliate_conversions` table. Legacy `payment_intent.succeeded` path kept for backward compatibility.
- **Commission window**: 30 % of `invoice.amount_paid` for 12 months from `affiliate_conversions.created_at`. Trial's $0 invoice is skipped by the `amount_paid <= 0` guard.
- **Payout flow**: manual PayPal; admin marks rows paid via `/api/admin/affiliate-mark-paid`; CSV download available.

## Gotchas

- **`stripe-replit-sync`**: `runMigrations()` takes no `schema` parameter; tables don't exist until the first successful webhook run.
- **Affiliate DB tables**: `affiliates`, `affiliate_conversions`, `affiliate_earnings` — created by `pnpm --filter @workspace/db run push`.
- **`ADMIN_SECRET`** must be set before admin routes will accept requests; a missing secret causes all admin calls to return 401.
- **Free ($0 promo) affiliate tracking**: not tracked — only conversions that lead to a paid subscription are attributed.
- **Trial entitlement**: `status === 'trialing'` grants full paid features — `getActiveSub()` in `account.ts` already handles both statuses; no code change needed.

## User Preferences

_Populate as you build — explicit user instructions worth remembering across sessions._
