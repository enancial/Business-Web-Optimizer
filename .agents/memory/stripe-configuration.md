---
name: Stripe configuration
description: Cloudflare Worker Stripe configuration for Business Web Optimizer
---

## Rule

The Cloudflare Worker runtime reads Stripe credentials only from explicit environment variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

Do not add a Replit connector fallback and do not reintroduce the old Postgres-backed Stripe sync bridge. If Stripe keys are absent, paid checkout, account, billing, token-issuance, and webhook routes must fail loudly with HTTP 503. Free scans must continue to work.

## Why

Business Web Optimizer was ported off Replit/Postgres onto Cloudflare Workers + D1. The Replit connector and Postgres-backed sync bridge do not run in the Worker runtime, and the production Stripe key is an owner-reserved configuration step.
