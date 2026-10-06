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
- `SMTP2GO_API_KEY` — dedicated key `business-web-optimizer-app (Cloudflare) 2026-09-27`, last 4 `F919`, scoped to `/email/batch` only.

All mail goes through `src/lib/smtp2go.ts`, which calls `/v3/email/batch` with the key in the `X-Smtp2go-Api-Key` header. The account-wide key can mint `/email/batch` keys but not `/email/send` keys, which is why the code doesn't use `/email/send`. A send only counts as successful when SMTP2GO returns an `email_id`; an HTTP 200 without one is a failure. A newly minted key answered "API User … not found" for its first few minutes and then worked, so test a fresh key again before you replace it. Sender domain `businessweboptimizer.com` is verified.

Webhook verification uses `constructEventAsync`, because the sync `constructEvent` throws on Workers.

Plain variable in `wrangler.jsonc`: `LEAD_NOTIFY_EMAIL` (`enancial@gmail.com`) receives the owner notice for each report request.

## Report leads

`POST /api/send-report` stores the request in D1 `report_leads` **before** sending anything, so a failed send still leaves the lead on record. It then emails the report, records `report_status` (`sent` / `failed`), `report_email_id` and `report_error`, and sends an owner notice to `LEAD_NOTIFY_EMAIL`, setting `owner_notified`. If the row can't be stored, the error is logged and the report and owner notice still go out, so the notice is the fallback record. The success response says which happened: `{ sent: true, stored, leadId, ownerNotified }`. When storage **and** the owner notice both fail, the route logs `REPORT LEAD UNRECORDED` with the email, URL and score, because the logs are then the only record. The visitor asked for a report, not a sales follow-up, so these rows are not a consent basis for outreach.

Read them:

```powershell
npx wrangler d1 execute business-web-optimizer-db --remote --command "SELECT id,email,url,score,report_status,owner_notified,created_at FROM report_leads ORDER BY id DESC LIMIT 20" --config artifacts\api-server\wrangler.jsonc
```

## Verification checklist

Verified 2026-09-27 on `https://businessweboptimizer.com`:

- `/` returns the Business Web Optimizer SPA.
- `/pricing` returns the SPA, not a 404.
- `/api/healthz` returns `{"status":"ok"}`.
- `POST /api/scan` with `{"url":"https://example.com"}` returns a free scan report without Stripe.
- `GET /api/checkout-config` returns the live publishable key.
- `POST /api/validate-promo` with a real code returns `valid: true` and live price amounts.
- `POST /api/stripe/webhook` with a forged signature returns 400 "No signatures found".
- `POST /api/send-report` to `enancial@gmail.com` returns `{"sent":true}`. SMTP2GO logged the message as `delivered`, and it arrived in the Gmail inbox, not spam.
- The same request (deploy `ce2c3f75`) stored a `report_leads` row with `report_status='sent'`, an `email_id`, and `owner_notified=1`; both the report and the owner notice were `delivered` and in the inbox. The test row was deleted afterwards (count 0).
- 2026-09-30, deploy `39397849`: the same request on the custom domain returned `{"sent":true,"stored":true,"leadId":6,"ownerNotified":true}`, and an independent read through the D1 gateway found row 6 before it was deleted. The custom domain is bound to Worker `business-web-optimizer-app` (production) and the zone has no other Workers routes. A retest within a minute of deploy still returned the old `{"sent":true}`; that was propagation, so retest before treating a stale response as a routing fault.
- `/robots.txt` on workers.dev returns `Disallow: /`.
- `/sitemap.xml` on workers.dev returns 404.
- Remote D1 contains `affiliates`, `affiliate_conversions`, `affiliate_earnings`, and `report_leads` (migration `0001_narrow_living_mummy.sql`).
