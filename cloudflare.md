# Cloudflare Worker deployment

Business Web Optimizer runs on Cloudflare as Worker `business-web-optimizer-app` with D1 database `business-web-optimizer-db`.

The Worker config is intentionally workers.dev-only. It does not attach `businessweboptimizer.com`, set routes, change DNS, or touch the existing `business-web-optimizer` Worker. The custom domain is attached later by the cutover owner after workers.dev verification.

## Current deployment

- Worker: `business-web-optimizer-app`
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

Already set on the Worker:

- `SESSION_SECRET`
- `ADMIN_SECRET`

Not set:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SMTP2GO_API_KEY`

With Stripe unset, free scans work and paid checkout/billing routes return HTTP 503 with an explicit configuration error. SMTP2GO sender domain `businessweboptimizer.com` is verified, but a new send-only `/email/send` key could not be minted from the current account-wide API key; leave `SMTP2GO_API_KEY` unset until a suitable send-only key is available.

## Verification checklist

Use the workers.dev URL only:

- `/` returns the Business Web Optimizer SPA.
- `/pricing` returns the SPA, not a 404.
- `/api/healthz` returns `{"status":"ok"}`.
- `POST /api/scan` with `{"url":"https://example.com"}` returns a free scan report without Stripe.
- `POST /api/create-payment-intent` returns HTTP 503 while Stripe is not configured.
- `/robots.txt` on workers.dev returns `Disallow: /`.
- `/sitemap.xml` on workers.dev returns 404.
- Remote D1 contains `affiliates`, `affiliate_conversions`, and `affiliate_earnings`.
