# Cloudflare Worker deployment

Business Web Optimizer runs on Cloudflare as Worker `business-web-optimizer-app` with D1 database `business-web-optimizer-db`.

`businessweboptimizer.com` is attached to this Worker as a Workers Custom Domain (id `ce7e3127…`), cut over 2026-09-27 from the old GrowthSignal Worker `business-web-optimizer` with `override_existing_origin`. `www` 301s to the apex. The custom domain is managed through the Cloudflare API, not `wrangler.jsonc`, so a deploy does not change it. Rollback: PUT the same hostname back to service `business-web-optimizer` with `override_existing_origin: true`.

## Current deployment

- Worker: `business-web-optimizer-app`
- Production URL: `https://businessweboptimizer.com`
- workers.dev URL: `https://business-web-optimizer-app.enancial.workers.dev`
- D1 database: `business-web-optimizer-db`
- D1 database ID: `29dc5ef0-d942-4228-adc8-10d7e8b504d4`
- Cron: hourly, `0 * * * *`, calling the trial-reminder logic through the Worker `scheduled` handler
- Static assets: `artifacts/businesswebdev/dist/public`
- Worker entrypoint: `artifacts/api-server/worker/index.ts`
- Worker config: `artifacts/api-server/wrangler.jsonc`

Production starts with an empty D1 database. The old Replit Postgres database is frozen/suspended and unreachable, so no production rows were backfilled.

## Deploy

Build and deploy from the repository root:

```powershell
$env:PATH='C:\Users\cyber\AppData\Roaming\npm;' + $env:PATH
pnpm --filter @workspace/businesswebdev run build
pnpm --filter @workspace/api-server run build
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
npx wrangler deploy --config artifacts\api-server\wrangler.jsonc
```

Wrangler must run with `CLOUDFLARE_API_TOKEN` unset so the stored OAuth login is used.

## Database migrations

Generate migrations after schema changes:

```powershell
pnpm --filter @workspace/db run generate
```

Apply the generated migration remotely:

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
npx wrangler d1 execute business-web-optimizer-db --remote --file lib\db\drizzle\<migration>.sql --config artifacts\api-server\wrangler.jsonc
```

## Secrets and variables

Set secrets with `wrangler secret put`; never commit `.dev.vars` or secret values.

Set on the Worker:

- `SESSION_SECRET`
- `ADMIN_SECRET`
- `STRIPE_SECRET_KEY` — dedicated restricted key `business-web-optimizer-app (2026-09-27)`, last 4 `okxv`. Write: Customers, Payment Intents, Payment Methods, Setup Intents, Customer Portal, Subscriptions. Read: Events, Products, Prices, Invoices, Promotion Codes, Coupons.
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET` — for endpoint `we_1UK72NJUmA42MDGcrlPx7A1i` → `https://businessweboptimizer.com/api/stripe/webhook` (payment_intent.succeeded, invoice.paid, customer.subscription.created/updated/deleted).

Not set:

- `SMTP2GO_API_KEY`

SMTP2GO sender domain `businessweboptimizer.com` is verified, but a send-only `/email/send` key could not be minted from the account-wide API key, so emailed reports and affiliate codes stay off until one exists. Webhook verification uses `constructEventAsync`; the sync `constructEvent` throws on Workers.

## Verification checklist

Verified 2026-09-27 on `https://businessweboptimizer.com`:

- `/` returns the Business Web Optimizer SPA.
- `/pricing` returns the SPA, not a 404.
- `/api/healthz` returns `{"status":"ok"}`.
- `POST /api/scan` with `{"url":"https://example.com"}` returns a free scan report without Stripe.
- `POST /api/create-payment-intent` returns HTTP 503 while Stripe is not configured.
- `/robots.txt` on workers.dev returns `Disallow: /`.
- `/sitemap.xml` on workers.dev returns 404.
- Remote D1 contains `affiliates`, `affiliate_conversions`, and `affiliate_earnings`.
