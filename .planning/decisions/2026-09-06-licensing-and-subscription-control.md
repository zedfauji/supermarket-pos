# Licensing & Subscription Control — decision record (2026-09-06)

## Problem

The POS is sold per store. Pricing: 500 MXN/month, 5,000 MXN/year, 15,000 MXN lifetime
(4 years of updates). Non-paying tenants must be blockable, including tenants running a
local Supabase (offline) stack. Terminal count per tenant must be tracked and capped.

## Research: don't reinvent

Looked at the usual options for desktop-app licensing:

| Option | Verdict |
|---|---|
| Keygen (open-source, self-hosted Rails) | Right model (license → machines → heartbeats, signed offline licenses). Too heavy to self-host for a handful of tenants. We copy its *model*, not its stack. |
| Cryptlex / LicenseSpring / Lemon Squeezy license keys | SaaS, USD-billed, monthly fee comparable to one tenant's revenue. Not worth it at this scale. |
| Stripe/Conekta subscriptions | Payment *collection* is out of scope for now — owner collects via transfer/cash in MX. Payments are recorded manually in the portal; hooking a PSP webhook to `record_payment` is the upgrade path. |

Decision: implement Keygen's model on a **separate Supabase project** (local for now,
`license-server/`), with a small admin portal. No new auth/crypto libraries — WebCrypto
ECDSA P-256 is available in Deno (edge functions), WebView2/Chromium, and Node (tests).

## Model

- **Tenant** = one store (matches an entry in `customers/customers.json` by `slug`). Owns
  one `license_key` (`XXXX-XXXX-XXXX-XXXX`), a `plan`, subscription dates, `max_terminals`,
  `lease_days` (default 60), `grace_days` (default 7), `status` (`active|suspended`).
- **Terminal** = one installation. The POS generates a UUID on first run and stores it in
  `localStorage`. Activation registers it against the tenant; portal can revoke it.
- **Payment** = manual ledger row; `record_payment()` extends the subscription:
  monthly +1 month, yearly +1 year, lifetime → `period_end = null`, `updates_until = +4y`.
- **License token** = `base64url(JSON payload) + "." + base64url(ECDSA-P256 sig)`, signed by
  the license server with a private key held only as an edge-function secret. The POS
  embeds the public key and verifies offline. Payload carries plan, `period_end`,
  `grace_days`, `updates_until`, `max_terminals`, `status`, `issued_at`, `lease_until`.

## Enforcement (client-side, offline-capable)

`evaluateLicense(payload, now)` is a pure function:

| Condition | State | UI |
|---|---|---|
| no/invalid token | `locked` (unlicensed/invalid) | full-screen gate: enter key or paste offline token |
| `status = suspended` | `locked` | gate |
| `now > lease_until` | `locked` (lease expired — 2-month offline rule) | gate: "connect to internet / paste offline token" |
| `now > period_end + grace_days` | `locked` (subscription expired) | gate |
| `now > period_end` | `grace` | red banner with days left |
| `period_end - now < warn window` (monthly 7d, yearly 30d) | `warning` | amber banner |
| lease expiring in < 7d and offline | `warning` | amber banner |
| lifetime past `updates_until` | `active` + `updatesExpired` | updater check skipped; note in Settings → License |

While `locked`, the Supabase client also refuses non-GET, non-auth requests
(`global.fetch` wrapper) — that is the "block operations to remote DB" lever. Server-side
RLS enforcement inside each tenant's own POS database is deliberately *not* done: it
would require the license server to hold credentials for every tenant project.
Upgrade path if ever needed: tenant DB `license_state` table refreshed by heartbeat.

Heartbeat: on startup, on `online`, every 6 h. Each heartbeat returns a fresh token (new
`lease_until = now + lease_days`), so an online terminal never hits the lease limit. A
fully offline store gets an offline token from the portal every ≤ 60 days (or the owner
raises `lease_days` for that tenant).

Clock rollback: the store remembers the max wall-clock it has seen and evaluates against
`max(now, maxSeen)`. Cheap deterrent, not tamper-proof — acceptable for this scale.

## Enforcement toggle

`VITE_LICENSE_ENFORCE` — default `true` in production builds, `false` in dev/e2e
(`import.meta.env.PROD`). E2E suite (next session) runs with enforcement off, plus
dedicated specs that turn it on via `page.addInitScript` + a test keypair.

## Out of scope (YAGNI, add when needed)

- PSP integration (Stripe/Conekta) → call `record_payment` from a webhook.
- Per-feature entitlements → add a `features` array to the token payload.
- Hardware fingerprinting → the UUID + revoke-in-portal is enough for a handful of stores.
- Email reminders → the portal's "expiring soon" list covers it manually.
