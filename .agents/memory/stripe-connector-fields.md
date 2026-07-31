---
name: Stripe connector field names
description: Exact field names the Replit Stripe OAuth connector exposes in settings
---

## Rule
When fetching Stripe credentials from the Replit connectors API, use:
- `settings.secret` for the secret key (not `settings.secret_key`)
- `settings.publishable` for the publishable key (not `settings.publishable_key`)

Other available settings fields: `account_id`, `mcp`, `claim_url`.
There is NO `webhook_secret` in connector settings — the webhook secret is managed by `stripe-replit-sync`'s `findOrCreateManagedWebhook`.

**Why:** Discovered by inspecting the live connector API response. The Stripe skill template uses `secret_key`/`publishable_key` but those do not match what the Replit connector actually returns.

**How to apply:** Any `stripeClient.ts` that fetches from the connectors API must use `settings.secret` and `settings.publishable`.
