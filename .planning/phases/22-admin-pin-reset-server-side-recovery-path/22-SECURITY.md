---
phase: 22
slug: admin-pin-reset-server-side-recovery-path
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-31
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser (authenticated staff session) -> `admin-reset-pin` Edge Function | Client-supplied JWT + request body cross into a privileged, service-role-backed function | JWT, target staff ID, new PIN |
| Edge Function -> Supabase Auth (`auth.users`) | Privileged service-role write to the real credential store via `admin.updateUserById` | New PIN (as bcrypt-hashed password) |
| Edge Function -> Postgres (`profiles`) | Privileged service-role write to the `pin`/`must_change_pin` mirror | New PIN (plaintext mirror column), must_change_pin flag |
| Browser (acting admin's own re-entered PIN, `ManagerPinDialog`) | Client-side confirm gate compared against `useStaffList()`'s cache before the network call fires | Acting admin's own PIN (client-side check only) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | Elevation of Privilege | admin-reset-pin role gate | critical | mitigate | `supabase/functions/admin-reset-pin/index.ts`: server-side `callerProfile.role !== 'admin'` check -> 403, independent of client-side RBAC hiding | closed |
| T-22-02 | Elevation of Privilege | stale/cached JWT role claim of a demoted admin | medium | mitigate | Live `profiles.role` re-query via `supabaseAdmin.from('profiles').select('role')` on every request; never trusts JWT claims | closed |
| T-22-03 | Tampering | dual-write partial failure (auth.users succeeds, profiles fails) | high | mitigate | `auth.users` written first; a `profiles` write failure returns `PARTIAL_FAILURE`-prefixed 500 error and writes an explicit `partialFailure: true` audit entry instead of a generic one | closed |
| T-22-04 | Tampering / Denial of Service | missing or inactive target not rejected | medium | mitigate | Explicit target lookup -> 404 on missing row; `is_active` guard -> 400, both enforced server-side | closed |
| T-22-05 | Information Disclosure | raw new PIN value logged into `audit_logs.after` or edge-function logs | medium | mitigate | `recordAudit`'s `after` payload only ever carries `{ mustChangePin: true }` or the partial-failure marker object — `newPin` never appears in either audit call | closed |
| T-22-06 | Elevation of Privilege / Tampering | a compromised-but-authenticated admin session resets many staff PINs unattended | medium | mitigate | `ManagerPinDialog` (re-entry of the acting admin's own PIN) wired into `AdminResetPinDialog.tsx` as a confirm-before-fire gate, on top of T-22-01's server-side authorization gate | closed |
| T-22-07 | Denial of Service / Tampering | no rate limiting on repeated reset calls | low | accept | Explicitly out of scope for this single-store, 1-2 terminal deployment per REQUIREMENTS.md "Out of Scope" (per-user rate limiting), consistent with the existing `agent-proxy` precedent | closed |
| T-22-08 | Spoofing / Tampering | confirm-gate bypass — calling the edge function directly, skipping `ManagerPinDialog` | low | accept | The client dialog is a UX speed bump, not the authorization boundary; the real boundary (T-22-01) is unaffected by skipping it — an authenticated admin's JWT already grants what the edge function allows | closed |
| T-22-09 | Information Disclosure | collision warning reveals which staff member currently holds a given PIN | low | accept | Only reveals a name already visible on the same Staff page to any admin-level session; no new information beyond what `useStaffList()` already exposes | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-07 | No per-user rate limiting on reset calls — explicitly out of scope for a single-store, 1-2 terminal deployment (REQUIREMENTS.md "Out of Scope"), consistent with existing `agent-proxy` precedent | PLAN.md 22-01 (D-series decisions) | 2026-08-30 |
| AR-22-02 | T-22-08 | Confirm-gate (`ManagerPinDialog`) is a UX speed bump, not the authorization boundary; skipping it client-side does not bypass the server-side admin-role gate (T-22-01) | PLAN.md 22-01 (D-03) | 2026-08-30 |
| AR-22-03 | T-22-09 | Collision warning surfaces no information beyond what `useStaffList()` already exposes to any admin-level session on the same Staff page | PLAN.md 22-01 (D-07) | 2026-08-30 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-31 | 9 | 9 | 0 | /gsd-secure-phase (L1 grep-depth, register authored at plan time — short-circuited per ASVS L1 rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-31
