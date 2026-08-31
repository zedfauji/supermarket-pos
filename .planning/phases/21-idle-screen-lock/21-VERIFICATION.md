---
phase: 21-idle-screen-lock
verified: 2026-08-31T04:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 21: Idle Screen Lock Verification Report

**Phase Goal:** Any screen, any role (incl. admin) locks behind a PIN prompt after a configurable
inactivity timeout (default 60s, per-terminal), no exemption for in-progress transactions. Unlock
accepts any valid staff PIN without changing session identity. Lock and unlock events both write to
`audit_logs`.

**Verified:** 2026-08-31
**Status:** passed
**Re-verification:** No — initial verification (post code-review-fix, commit `eb0a0c5`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | LCK-01: Idle-lock overlay engages after configurable per-terminal timeout, on every screen/role, non-dismissable (Escape/outside-click), no exemption for in-progress transactions | ✓ VERIFIED | `e2e/security/idle-lock.spec.ts` (overlay engages at 15s seeded timeout, Escape does not dismiss) + `e2e/security/idle-lock-transactions.spec.ts` (cart + open payment modal survive lock/unlock unchanged, confirm button occluded while locked, sale still completes) — both independently re-run by this verification, both pass. `useIdleTimer.ts`/`IdleLockProvider.tsx` read directly: `children` always rendered, timer paused (not merely ignored) while locked. |
| 2 | LCK-02: Per-terminal timeout stored like `receipt_settings` (one row per terminal), editable only by `manage_settings` (admin-only) | ✓ VERIFIED | `supabase/migrations/20260830000002_terminal_lock_settings.sql` live on Local **and** Remote (`supabase migration list` re-run, both columns show `20260830000002`). RLS integration test (`terminal-lock-settings-rls.integration.test.ts`, re-run, 4/4 pass) proves cashier AND manager writes rejected, only admin succeeds — matches `rbac.ts`'s `ADMIN_EXTRA`/`manage_settings` admin-only scope (directly confirmed in `rbac.ts`). `e2e/settings/lock-timeout.spec.ts` re-run, passes: admin configures/persists the timeout, manager cannot see the tab. |
| 3 | LCK-03: Overlay unlocks on any valid staff PIN (not necessarily original staff); active session identity unchanged (screen lock, not re-login) | ✓ VERIFIED | `IdleLockOverlay.tsx` read directly: unlock candidate is the full unfiltered `useStaffList()` result (no role filter, per D-04); `handlePinComplete` never calls any `supabase.auth.*` method (`grep supabase.auth` on the file returns zero matches). `e2e/security/idle-lock.spec.ts` re-run, passes the cross-staff-unlock assertion (Home welcome banner still shows the original cashier's name after a manager unlocks). |
| 4 | LCK-04: Both lock and unlock write to `audit_logs`, recording session owner and (for unlock) unlocking staff | ✓ VERIFIED | `useIdleLockAudit.ts` read directly: `recordLock`/`recordUnlock` call `record_audit` with explicit `sessionOwnerStaffId`/`unlockedByStaffId` in `p_before`/`p_after` JSON (never the raw PIN). `idle-lock-audit.integration.test.ts` re-run (part of the 3-file/11-test Vitest run), passes — before/after JSON round-trips correctly, `actor_id` never equals the unlocking staff's id. `e2e/security/idle-lock.spec.ts`'s audit-attribution assertion re-run, passes. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### CR-01/WR-01 Code-Review Fix Verification (commit `eb0a0c5`)

The phase's own code review (`21-REVIEW.md`) found a Critical finding (CR-01) after Plan 21-01/21-02
landed: `ConfirmDialog`'s global `window`-level Enter-to-confirm `keydown` listener was not gated on
lock state, allowing a blind Enter-keypress bypass of the lock (e.g. re-submitting a payment via
`PaymentForm`'s offline-retry `ConfirmDialog` with no PIN). `WeightEntryDialog` had the same pattern
(WR-01). This was fixed in commit `eb0a0c5`, moving `lock-state-store.ts` from
`features/idle-screen-lock/model/` to `shared/lib/` (so `shared/ui/ConfirmDialog` can depend on it
without inverting the FSD import direction) and gating both listeners on `locked`.

| Check | Method | Result |
|-------|--------|--------|
| `lock-state-store.ts` lives at `src/shared/lib/lock-state-store.ts`, no leftover references to the old `features/idle-screen-lock/model/` path anywhere in `src/`/`e2e/` | Direct file read + repo-wide grep | ✓ Confirmed — file exists at new path; zero matches for the old import path |
| `ConfirmDialog.tsx`'s keydown effect is gated on `locked` (`useLockStateStore` from `@shared/lib/lock-state-store`) | Direct file read (lines 91, 111-135) | ✓ Confirmed — `if (!open \|\| isLoading \|\| locked) return;` |
| `WeightEntryDialog.tsx`'s keydown effect is gated on `locked` | Direct file read (lines 7, 48, 50-67) | ✓ Confirmed — `if (!open \|\| locked) return;` |
| `IdleLockProvider.tsx`/`CheckoutPanel.tsx` updated to import from the new `shared/lib` path | Direct file read + grep | ✓ Confirmed — both import `useLockStateStore` from `@shared/lib/lock-state-store` |
| Unit test coverage added and passing | `npx vitest run src/shared/ui/ConfirmDialog.test.tsx src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` (independently re-run by this verification) | ✓ 13/13 pass, including the 3 new CR-01-specific cases in `ConfirmDialog.test.tsx` ("does not fire onConfirm/onCancel while locked", "resumes after unlock with no remount") |
| Regression check: does the fix reopen a lower-severity open item (WR-02/03/04, IN-01)? | Re-read `21-REVIEW.md` Warnings/Info sections against current code | ✓ No — WR-02 (no PIN-attempt throttling), WR-03 (`useTerminalLockSettings` skips Zod validation), WR-04 (`LockSettingsTab` silent no-op on invalid input), IN-01 (generic error masks staff-list-fetch failure) all remain open, all lower severity, all explicitly out of scope for this phase per the task instructions — none are touched or worsened by `eb0a0c5`. |
| `npm run typecheck` / `npm run lint` on the touched files | Independently re-run | ✓ Both pass clean |
| Full `e2e/security/` suite (all 3 specs spanning Plan 21-01/21-02 + the CR-01 fix) | `npx playwright test e2e/security/` (independently re-run against a live dev server + local Supabase, NOT taken from SUMMARY claims) | ✓ 3/3 pass |

**Conclusion: the CR-01/WR-01 fix genuinely closes the gap** — the blind Enter-keypress bypass is
eliminated for `ConfirmDialog` (and its ~10 callers, since the fix is at the single choke point) and
`WeightEntryDialog`, verified both by direct code reading and by independently re-running the full
automated test suite (not trusting SUMMARY.md's pass claims).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260830000002_terminal_lock_settings.sql` | `terminal_lock_settings` table + admin-only RLS | ✓ VERIFIED | Applied on Local and Remote per `supabase migration list` |
| `src/features/idle-screen-lock/model/useIdleTimer.ts` | Idle-detect hook | ✓ VERIFIED | Read directly; 5/5 unit tests pass |
| `src/features/idle-screen-lock/ui/IdleLockOverlay.tsx` | Non-dismissable PIN overlay | ✓ VERIFIED | Read directly; no `supabase.auth.*` calls; wired into `IdleLockProvider` |
| `src/features/idle-screen-lock/ui/IdleLockProvider.tsx` | Provider mounted in `App.tsx` | ✓ VERIFIED | Read directly; `App.tsx` wraps `<Router/>` with it between `<ClockDriftBanner/>` |
| `src/shared/lib/lock-state-store.ts` | Shared cross-module lock-state store | ✓ VERIFIED | Read directly; consumed by `IdleLockProvider`, `CheckoutPanel`, `ConfirmDialog`, `WeightEntryDialog` |
| `src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx` | Admin-only Settings UI | ✓ VERIFIED | `e2e/settings/lock-timeout.spec.ts` re-run, passes |
| `e2e/security/idle-lock.spec.ts`, `idle-lock-bypass.spec.ts`, `idle-lock-transactions.spec.ts` | E2E coverage | ✓ VERIFIED | All 3 independently re-run, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `App.tsx` | `IdleLockProvider` | Mount between `ClockDriftBanner` and `Router` | ✓ WIRED | Confirmed by direct read |
| `IdleLockProvider` | `useLockStateStore` | `setLocked(true/false)` on idle/unlock | ✓ WIRED | Confirmed by direct read |
| `CheckoutPanel` | `useLockStateStore` | `scannerEnabled = ... && !locked` | ✓ WIRED | Confirmed by direct read + `idle-lock-bypass.spec.ts` re-run pass |
| `ConfirmDialog` (shared/ui) | `useLockStateStore` (shared/lib) | keydown effect gated on `locked` | ✓ WIRED | Confirmed by direct read + `ConfirmDialog.test.tsx` re-run pass |
| `WeightEntryDialog` | `useLockStateStore` | keydown effect gated on `locked` | ✓ WIRED | Confirmed by direct read + `WeightEntryDialog.test.tsx` re-run pass |
| `LockSettingsTab` | `useMutationUpdateTerminalLockSettings` | admin-only save, RLS-enforced | ✓ WIRED | `e2e/settings/lock-timeout.spec.ts` re-run pass |

### Behavioral Spot-Checks / Independent Test Re-Runs

All commands below were independently executed by this verification against a live local Supabase
instance and dev server (`localhost:1520`) — not taken from SUMMARY.md claims.

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| CR-01 fix unit coverage | `npx vitest run src/shared/ui/ConfirmDialog.test.tsx src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` | 2 files, 13 tests passed | ✓ PASS |
| Full typecheck | `npm run typecheck` | Clean | ✓ PASS |
| Lint on touched files | `npx eslint <touched files>` | 0 errors (pre-existing boundaries-plugin syntax warning only, unrelated) | ✓ PASS |
| Full security E2E suite | `npx playwright test e2e/security/` | 3/3 passed (idle-lock, idle-lock-bypass, idle-lock-transactions) | ✓ PASS |
| Settings E2E | `npx playwright test e2e/settings/lock-timeout.spec.ts` | 1/1 passed | ✓ PASS |
| RLS + audit integration tests + idle-timer unit test | `npx vitest run src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts src/features/idle-screen-lock/model/useIdleTimer.test.ts` | 3 files, 11 tests passed | ✓ PASS |
| Migration applied Local + Remote | `supabase migration list` | `20260830000002` present in both columns | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| LCK-01 | 21-01, 21-02 | Idle-lock overlay, no exemption for transactions | ✓ SATISFIED | `idle-lock.spec.ts` + `idle-lock-transactions.spec.ts` + `idle-lock-bypass.spec.ts`, all re-run pass |
| LCK-02 | 21-01 | Per-terminal timeout, admin-only edit | ✓ SATISFIED | RLS integration test + `lock-timeout.spec.ts`, both re-run pass |
| LCK-03 | 21-01 | Any-staff-PIN unlock, session identity unchanged | ✓ SATISFIED | `idle-lock.spec.ts` cross-staff assertion, re-run pass; `supabase.auth` grep on overlay = 0 matches |
| LCK-04 | 21-01 | Lock/unlock audit_logs attribution | ✓ SATISFIED | `idle-lock-audit.integration.test.ts` + `idle-lock.spec.ts` audit assertion, both re-run pass |

No orphaned requirements — REQUIREMENTS.md's v1.7 section lists exactly LCK-01..04, and all four are
claimed by 21-01-PLAN.md's `requirements` frontmatter (21-02 additionally claims LCK-01 for its
hardening work). REQUIREMENTS.md's traceability table and checkbox state still show these as
"Not yet roadmapped"/"Pending" — this is a documentation-sync step (typically done in the ship/complete
workflow after verification passes), not a gap in the implementation itself; flagged here for the
orchestrator to update REQUIREMENTS.md's traceability table and checkboxes alongside marking the phase
complete.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX` markers introduced by this phase's files. The four lower-severity
review Warnings/Info items (WR-02 no PIN-attempt throttling, WR-03 skipped Zod validation on
`useTerminalLockSettings`, WR-04 silent no-op on invalid Lock Settings input, IN-01 generic
incorrect-PIN error masking a staff-list-fetch failure) remain open by design — the task explicitly
scoped this verification to confirm they are not required for phase completion and are not reopened by
the CR-01 fix. Confirmed: none of the four are touched by commit `eb0a0c5`, and none block LCK-01..04.

### Human Verification Required

None. Every truth has automated Playwright/Vitest coverage that was independently re-run by this
verification (not just SUMMARY.md claims), per this repo's no-manual-UAT policy. The one documented
manual-verification carve-out in this repo (native Tauri window shell / physical USB-HID keypad) does
not apply here — the idle-lock mechanism is fully exercised through the browser-driven Playwright
suite.

### Gaps Summary

None. All 4 must-have truths (LCK-01..04) are verified with independently-reproduced passing automated
tests, all required artifacts exist and are wired, the CR-01 Critical finding and its WR-01 sibling are
confirmed fixed and regression-tested, and the remaining lower-severity review items (WR-02/03/04,
IN-01) are confirmed still open but explicitly out of scope for this phase's completion per the
verification task's own instructions.

---

_Verified: 2026-08-31_
_Verifier: Claude (gsd-verifier)_
