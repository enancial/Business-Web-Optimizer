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
