# Business Web Optimizer — Test Plan

Confirms that Free, Optimizer, and Optimizer Pro all work as advertised, and that token expiry / re-issuance behaves correctly.

---

## Running the Automated Tests

```bash
# From the project root
pnpm --filter @workspace/api-server test

# Or from inside the api-server directory
cd artifacts/api-server
pnpm test
```

Tests run with **vitest** and **supertest** — no real Stripe calls are made (Stripe is fully mocked). No internet access required.

### What the automated tests cover

| File | What it tests |
|---|---|
| `scan.test.ts` | Free/paid/pro scan gating · expired token 401 · tampered/malformed token free fallback |
| `account.test.ts` | Auth endpoint · GET account · re-issue token · cancel · uncancel · change-plan · update-payment · auth middleware |
| `scanToken.test.ts` | POST /api/issue-scan-token: bad PI, not-succeeded PI, missing action metadata, valid PI |

---

## Manual Browser Testing

### Prerequisites
- The dev server is running (`pnpm dev` or Replit preview).
- You have a Stripe test-mode account with `OPTIMIZER_PRICE_ID` and `OPTIMIZER_PRO_PRICE_ID` set.
- Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC.

---

### 1 — Free Tier Scan

**Setup:** Open the site with no token in `localStorage` (private window or clear it).

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to `/` → enter any URL → click **Run Scan** | Scan runs without a token |
| 2 | Observe results panel | ≤ 3 issues shown |
| 3 | Check for upgrade prompt | "Upgrade to see X more issues" or similar gating notice visible |
| 4 | Check `gated` field | Verify in DevTools Network tab: `gated: true`, `totalIssues > 3` |
| 5 | Confirm score shown | Score between 0–100 visible |

---

### 2 — Optimizer Plan (paid scan)

**Setup:** Complete a test-mode checkout for the **Optimizer ($29/mo)** plan. After `POST /api/issue-scan-token` succeeds, `localStorage.bwo_scan_token` is set.

| Step | Action | Expected result |
|---|---|---|
| 1 | Land on `/success` after checkout | "View my account" button visible |
| 2 | Check `localStorage.bwo_scan_token` in DevTools | JWT present and decoded with `tier: "paid"`, `product: "optimizer"` |
| 3 | Navigate to `/` → run a scan | All issues returned (no 3-issue cap) |
| 4 | Verify Network tab | `gated` absent or false, no `totalIssues` field |
| 5 | Check Nav header | **My Account** link visible |

---

### 3 — Optimizer Pro Plan (paid scan + Pro-exclusive features)

Same base steps as Section 2, but use the **Optimizer Pro ($79/mo)** checkout. Verify:
- `product: "optimizer-pro"` in the decoded JWT
- Full scan results returned (no 3-issue cap, same as Optimizer)
- Plan name in `/account` shows "Optimizer Pro"

**Pro-exclusive: Schema.org Structured Data Analysis**

| Step | Action | Expected result |
|---|---|---|
| 1 | Run a scan with an Optimizer Pro token | Results panel shows a **"Schema.org Structured Data"** card with an `Optimizer Pro` badge |
| 2 | Click ▾ to expand the card | Shows types found, recommended additions, warnings, and a 0–100 score |
| 3 | Network tab → response body | `schemaDeepDive` object present: `typesFound`, `typesRecommended`, `warnings`, `score`, `summary` |
| 4 | Check `whiteLabel` field | `whiteLabel: true` in the scan response |
| 5 | Run same URL with an Optimizer token | **No** schema card shown — teaser box appears instead ("Upgrade to Optimizer Pro") |
| 6 | Run same URL with no token (free) | No schema card, no teaser |

**Pro-exclusive: White-label flag**

The API returns `whiteLabel: true` on Pro scans. PDF generation (when implemented) will use this to suppress BWO branding and allow a custom logo. The flag is present in the API response now; front-end PDF gating is marked TODO below.

---

### 4 — Token Expiry & No Silent Fallback

**Setup:** In DevTools Console, create an expired token and set it:

```js
// Paste into DevTools Console (requires you have the SESSION_SECRET — for local dev only)
// Alternatively, wait for a real token to expire or forge one for testing

// To simulate expiry: set a token that was issued with a past exp
// E.g. tamper the exp field in the base64 payload:
const raw = localStorage.getItem('bwo_scan_token');
const parts = raw.split('.');
const payload = JSON.parse(atob(parts[1]));
payload.exp = Math.floor(Date.now() / 1000) - 1; // 1 second ago
const fakeExpired = parts[0] + '.' + btoa(JSON.stringify(payload)) + '.' + parts[2];
localStorage.setItem('bwo_scan_token', fakeExpired);
```

> **Easier shortcut:** Go to `/account`, sign in, then in the console run `localStorage.setItem('bwo_scan_token', 'expired.fake.token')`.

| Step | Action | Expected result |
|---|---|---|
| 1 | With expired/invalid token, run a scan | Scan does NOT return free results silently |
| 2 | Observe the result panel | "Your paid scan access has expired" warning shown |
| 3 | Click **Go to My Account** | Navigates to `/account` |
| 4 | Observe `/account` page | Email auth gate shown (not dashboard) |
| 5 | Network tab | API returned `401` with `tokenExpired: true` |

---

### 5 — Token Re-Issuance from `/account`

**Setup:** Be logged in to `/account` with a valid non-expired token.

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to `/account` → see **Scan access** card | Expiry date shown |
| 2 | Click **Refresh token** | Button spins, then "✓ Scan access refreshed for another 30 days" |
| 3 | Check `localStorage.bwo_scan_token` | New JWT with `exp` ~30 days from now |
| 4 | Run a scan | Still gets full paid results |

---

### 6 — Email Re-Authentication (lost / expired token)

| Step | Action | Expected result |
|---|---|---|
| 1 | Clear `localStorage.bwo_scan_token` → navigate to `/account` | Email form shown |
| 2 | Enter wrong email | Error: "No account found for that email address" |
| 3 | Enter the email used at checkout | New JWT returned, dashboard loads |
| 4 | Verify dashboard content | Plan, billing date, invoices visible |

---

### 7 — Account Dashboard: Plan Display

| Step | Action | Expected result |
|---|---|---|
| 1 | Sign in at `/account` | Plan card shows "Optimizer" or "Optimizer Pro" |
| 2 | Status badge | "Active" shown in green |
| 3 | Next billing date | Date ≈ 30 days from checkout |
| 4 | Monthly amount | $29 (Optimizer) or $79 (Optimizer Pro) |
| 5 | Open Stripe Dashboard → Subscriptions | Same subscription visible |

---

### 8 — Plan Change (Upgrade Optimizer → Optimizer Pro)

| Step | Action | Expected result |
|---|---|---|
| 1 | `/account` with Optimizer plan | "Change plan" section visible |
| 2 | Click "Change plan" to expand | Shows both plan cards |
| 3 | Click **Switch** on Optimizer Pro card | Spinner → "Plan changed successfully" |
| 4 | Plan card updates | Shows "Optimizer Pro" |
| 5 | Stripe Dashboard → Subscriptions | Price changed to $79/mo |
| 6 | Run a scan | `product: "optimizer-pro"` in new JWT |
| 7 | Verify proration invoice | Stripe creates a proration invoice for the difference |

**Downgrade (Optimizer Pro → Optimizer):**

Same steps in reverse. Credit is applied via proration.

---

### 9 — Cancel Subscription

| Step | Action | Expected result |
|---|---|---|
| 1 | `/account` → scroll to **Cancel subscription** | "Cancels at end of current billing period" notice |
| 2 | Click **Cancel subscription** | Confirmation prompt appears |
| 3 | Click **Yes, cancel my plan** | Button spins → cancellation scheduled notice appears in plan card |
| 4 | Reload `/account` | Plan card shows amber "Cancels on [date]" badge |
| 5 | Stripe Dashboard → Subscription | `cancel_at_period_end: true` |
| 6 | Scan still works until period end | Full paid scan returns results normally |

---

### 10 — Uncancel Subscription

**Setup:** Subscription must have `cancel_at_period_end: true` (from Section 9).

| Step | Action | Expected result |
|---|---|---|
| 1 | `/account` → see "Keep your subscription" section | "Resume subscription" button |
| 2 | Click **Resume subscription** | Spinner → button gone |
| 3 | Plan card | Amber cancellation badge gone; normal "Next billing date" shown |
| 4 | Stripe Dashboard → Subscription | `cancel_at_period_end: false` |

---

### 11 — Payment Method Update

| Step | Action | Expected result |
|---|---|---|
| 1 | `/account` → **Payment method** card | Existing card brand/last4 shown |
| 2 | Click **Update** | Stripe PaymentElement appears inline |
| 3 | Enter test card `4000 0000 0000 0077` (Visa Debit) | Card accepted |
| 4 | Click **Save new card** | Spinner → "Payment method updated successfully" |
| 5 | Reload `/account` | New last4 shown in payment method card |
| 6 | Stripe Dashboard → Customer → Payment methods | New card listed as default |

---

## Verifying Stripe State

Open [Stripe Dashboard → Test mode](https://dashboard.stripe.com/test):

| What changed | Where to check |
|---|---|
| Subscription created | Customers → `[email]` → Subscriptions |
| Plan changed | Subscription → Items (price should match) |
| Prorated invoice | Subscription → Invoices |
| `cancel_at_period_end` set | Subscription → detail row |
| Default payment method | Customer → Payment methods |
| New subscription webhook | Webhooks → recent events |

---

## Tier Feature Matrix

| Feature | Free | Optimizer | Optimizer Pro |
|---|---|---|---|
| Scan runs | ✅ | ✅ | ✅ |
| Issues shown | Top 3 | All | All |
| Score shown | ✅ | ✅ | ✅ |
| Gating notice | ✅ | ❌ | ❌ |
| PDF email report | ❌ | ✅ | ✅ |
| `/account` dashboard | ❌ | ✅ | ✅ |
| Token re-issuance | ❌ | ✅ | ✅ |
| Plan change | ❌ | ✅ | ✅ |
| Cancel / uncancel | ❌ | ✅ | ✅ |
| **Schema.org deep-dive** | ❌ | ❌ (teaser shown) | ✅ |
| **White-label API flag** | ❌ | ❌ | ✅ (`whiteLabel: true`) |
| Checkout re-entry guard | — | redirects to `/account` | redirects to `/account` |
| Duplicate subscription prevention | — | ✅ (webhook idempotency) | ✅ (webhook idempotency) |

---

## Known Limitations / TODO

- **Scheduled auto-scans UI** — not yet implemented. The pricing page mentions this for Optimizer Pro. The `product` field in the JWT is available for future gating.
- **Competitor site comparison** — not yet implemented. Pricing page lists this for Optimizer Pro. Requires additional fetch + analysis of competitor URLs.
- **White-label PDF download** — `whiteLabel: true` is returned in the API; front-end PDF generation is not yet implemented. The flag will suppress BWO branding when a PDF export feature is added.
- **API access / developer API** — not yet implemented for Pro subscribers.
- **Priority support queue** — not a software feature; handled operationally.
- The `billingPortal.ts` route remains in the codebase but is not linked from the UI. All account management is on-site.
- Token expiry is 30 days. Users must re-authenticate via email if the token is not refreshed before expiry.
