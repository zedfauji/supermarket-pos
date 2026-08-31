---
phase: 21
slug: idle-screen-lock
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-30
---

# Phase 21 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Staff (physical, unattended terminal) -> IdleLockOverlay | Untrusted physical access to an unattended, already-authenticated terminal — anyone standing at it can attempt PINs | Entered PIN string (never persisted, compared client-side only) |
| Client (React) -> Supabase RLS (`terminal_lock_settings`) | Client-submitted lock-timeout writes cross into RLS-enforced Postgres | `lock_timeout_seconds` integer |
| Client (React) -> `record_audit` RPC | Client-submitted audit payloads (`p_before`/`p_after` JSON) cross into a SECURITY DEFINER function | Staff id/name identity pairs (no PIN) |
| Global `window`-level HID-scanner / keydown listeners -> cart, payment, and dialog mutation handlers | An unattended, physically-scannable terminal is a real input surface even while visually "locked" | Barcode scan sequences, Enter/Escape/digit keypresses |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-21-01 | Elevation of Privilege | `IdleLockOverlay` unlock path | critical | mitigate | Unlock is a pure client-side string comparison against `profiles.pin` (via `useStaffList()`); never calls `supabase.auth.*`, so the active auth session (`currentStaff`) is provably unchanged across a cross-staff unlock. Verified by reading `IdleLockOverlay.tsx`/`IdleLockProvider.tsx` — no auth call present — plus E2E coverage in `e2e/security/idle-lock.spec.ts`. | closed |
| T-21-02 | Repudiation | `audit_logs` lock/unlock accountability | high | mitigate | `record_audit` calls for `screen.lock`/`screen.unlock` carry explicit `p_before`/`p_after` JSON with both the session-owner and unlocking-staff identities, since `actor_id` alone can't distinguish them (the auth session never changes). Verified in `useIdleLockAudit.ts`. | closed |
| T-21-03 | Elevation of Privilege | `terminal_lock_settings` RLS write policies | high | mitigate | INSERT/UPDATE/DELETE policies check `get_user_role() = 'admin'` (not manager+admin), matching `manage_settings`'s actual admin-only RBAC scope. Verified in `supabase/migrations/20260830000002_terminal_lock_settings.sql`. | closed |
| T-21-04 | Information Disclosure | PIN values in audit/log payloads | medium | mitigate | `record_audit` payloads for `screen.lock`/`screen.unlock` carry only staff id/name, never the raw entered PIN — matches the existing `toggle-permission` precedent of never logging secrets. Verified in `useIdleLockAudit.ts`. | closed |
| T-21-05 | Denial of Service (self) | Zero active staff / staff-list fetch failure blocks unlock permanently | low | accept | Pre-existing systemic failure mode shared with `ManagerPinDialog`, not newly introduced by this phase. | closed |
| T-21-06 | Tampering | Global `window`-level keydown/scanner listeners (`useBarcodeScanner` in `CheckoutPanel`, `ConfirmDialog`, `WeightEntryDialog`) bypassing the visual lock | high | mitigate | All three listeners now gate on the shared `useLockStateStore().locked` flag (moved to `shared/lib` so `shared/ui`'s `ConfirmDialog` can read it without inverting FSD import direction). `CheckoutPanel`'s `scannerEnabled` requires `&& !locked`; `ConfirmDialog`/`WeightEntryDialog`'s window keydown handlers early-return on `locked`. Originally landed for the scanner in Plan 21-01/21-02; a code-review finding (21-REVIEW.md CR-01/WR-01) caught `ConfirmDialog` and `WeightEntryDialog` missing the same gate — fixed in commit `eb0a0c5`, with regression tests in `ConfirmDialog.test.tsx` and `WeightEntryDialog.test.tsx` plus `e2e/security/idle-lock-bypass.spec.ts`. | closed |
| T-21-07 | Tampering | `ProductPeekWindow`'s own `useBarcodeScanner` call (separate Tauri OS window) | medium | accept | Deliberately out of scope per RESEARCH.md Open Question 1 — a separate JS realm not sharing `useLockStateStore`; revisit only if usage data shows the window is held open long enough to matter. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-21-01 | T-21-05 | Zero-active-staff DoS is a pre-existing systemic failure mode shared with `ManagerPinDialog`; not introduced by this phase, no in-phase mitigation planned. | Phase 21 planning (RESEARCH.md) | 2026-08-30 |
| AR-21-02 | T-21-07 | `ProductPeekWindow` runs in a separate Tauri OS window/JS realm not sharing `useLockStateStore`; explicitly deferred per RESEARCH.md Open Question 1 pending real usage data. | Phase 21 planning (RESEARCH.md) | 2026-08-30 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-30 | 7 | 7 | 0 | /gsd-secure-phase (L1 grep-depth verification, register authored at plan time — auditor short-circuited per ASVS L1 rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-30
