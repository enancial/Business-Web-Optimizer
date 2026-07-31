---
name: stripe-replit-sync setup behavior
description: How runMigrations and table creation actually work for stripe-replit-sync
---

## Rule
`runMigrations({ databaseUrl })` — do NOT pass a `schema` parameter, it's hardcoded to `"stripe"` internally.

The function creates all `stripe.*` tables (accounts, products, prices, subscriptions, etc.) on first run. If the server crashes before tables exist (race condition on very first deploy), simply restart — tables will be present on second start.

StripeSync is initialized with an empty `stripeWebhookSecret: ''` — the real secret is fetched/stored internally by `findOrCreateManagedWebhook`. Subsequent calls to `processWebhook` use the stored secret from the `stripe._managed_webhooks` table.

**Why:** Discovered during implementation. The stripe skill template references `schema` param and `webhook_secret` from connector, but neither exists in practice.

**How to apply:** Always call `runMigrations({ databaseUrl })` before creating StripeSync instances. The webhook secret does not need to be passed manually.

## esbuild bundling — must externalize

Add `"stripe"` and `"stripe-replit-sync"` to the `external` array in `build.mjs`. If bundled, esbuild rewrites `import.meta.url` to the bundle path, so `stripe-replit-sync`'s internal `__dirname`-based migration file lookup points to the dist folder instead of the package, silently skipping all migrations. Externalizing also cuts ~900 KB from the bundle and lets Node resolve them from workspace root `node_modules` at runtime (path: `node_modules/.pnpm/stripe-replit-sync.../`).

## Startup order for deployment

Call `app.listen(port, ...)` **before** any Stripe init. Run `initStripe()` as a fire-and-forget background task (`.catch(logger.error)`). The production healthcheck hits `/api/healthz` immediately after the process starts — if `app.listen` is awaited behind Stripe migrations (~30-60 s), the healthcheck times out and the deployment is killed.
