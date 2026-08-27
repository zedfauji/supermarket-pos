---
phase: 08-sale-payment-workflow-wiring-cleanup
verified: 2026-08-18T15:55:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 08: Sale/Payment Workflow Wiring + Cleanup Verification Report

**Phase Goal:** Staff can be created through the UI with a real caller-role check, checkout fails fast instead of hanging or silently queuing when offline, refund and checkout error paths show clear staff-facing messages, the refund payload is validated, and the shipped app carries the real Tauri identifier.
**Verified:** 2026-08-18T15:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 (SC1/SALE-02) | An admin/manager can create a staff account through the UI wired to `create-staff`; a non-admin/manager caller (and now, per the code-review fix, a manager assigning `admin`) is rejected by the function's role check — verified by Playwright E2E | ✓ VERIFIED | `supabase/functions/create-staff/index.ts` lines 18-91: 401 on missing/invalid Bearer, 403 on non-admin/manager caller, 403 on manager assigning `admin`/`manager` role (CR-01 fix, line 86-91). Live-run `e2e/22-staff-management.spec.ts -g "SM2\|SM7\|SM8"` → 3 passed (1.1m), including SM8 (new negative test added by orchestrator's CR-01 fix). |
| 2 (SC2/SALE-04) | With network simulated offline, checkout shows a clear "you're offline" message immediately instead of hanging/queuing — verified by Playwright E2E | ✓ VERIFIED | `useCheckoutSale.ts` lines 103-104: `isOnline()` guard returns `NETWORK_OFFLINE` before any fetch. `PaymentForm.tsx` renders a dedicated `ConfirmDialog` (lines 1133+) on `NETWORK_OFFLINE`, distinct from `OfflineBanner`/toast. Live-run `e2e/50-direct-sale-checkout.spec.ts -g "offline\|Try Again\|Cancel on offline\|split payment also appears"` → 4 passed (55.1s): offline-before-submit, retry-after-reconnect, cancel-no-side-effects, split-payment-offline. |
| 3 (SC3/SALE-05) | Refund failure and other checkout/payment error paths show a translated, staff-facing message instead of raw Postgres/RPC text — verified by Playwright E2E asserting rendered text | ✓ VERIFIED | `useProcessRefund.ts` line 49-53: `SUPABASE_ERROR` fallback now returns `i18n.t('featOrders:processRefund.genericError')`, never `error.message` (and is wrapped in `supabaseMutation()` — WR-01 fix — so a thrown/network exception during the RPC call also resolves to this same translated path instead of an unhandled rejection). Same pattern independently confirmed in `useRemoveTabItem.ts`, `useReopenTab.ts`, `useEditPaidTab.ts`, `entities/caja/model/queries.ts` (all grep-verified to only intercept the unmapped `SUPABASE_ERROR` branch, mapped codes untouched). Live-run `e2e/35-refund.spec.ts` (full file) → 4 passed (1.2m): T1-T4, T5, T6, and the new "generic: unmapped process_refund RPC failure shows translated toast" test. |
| 4 (SC4/SALE-06) | `process-refund` contains no `as any` cast; its jsonb refund-items payload is rejected by Zod validation when malformed — verified by Vitest unit test | ✓ VERIFIED | `grep -c 'as any' src/entities/refund/model/queries.ts src/features/process-refund/model/useProcessRefund.ts` → 0/0. `ProcessRefundInputSchema` defined in `src/shared/lib/domain.ts` lines 1415-1435 (non-empty items, positive qty/amount, no-duplicate-order_item_id `.refine()`), re-exported via `entities/refund`. `useProcessRefund.ts` line 24 `safeParse`s before calling `supabase.rpc`. Full unit suite (`npm run test`) → 1125 passed, 0 failed, including `useProcessRefund.test.ts`. |
| 5 (SC5/OPS-01) | `tauri.conf.json`'s `identifier` reads `com.tajhouseofspices.supermarketpos` — confirmed by direct inspection | ✓ VERIFIED | Direct file read: line 5 is exactly `"identifier": "com.tajhouseofspices.supermarketpos",`. `git show` confirms a single-line diff — no other field touched. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/checkout-sale/model/useCheckoutSale.ts` | `isOnline()` guard added | ✓ VERIFIED | Lines 103-104, first check in `submit()`, before CAJA_CLOSED |
| `src/widgets/PaymentModal/ui/PaymentForm.tsx` | Error-code plumbing + offline dialog | ✓ VERIFIED | `AppErrorCode` threaded through `runPayment()`'s 3 legs; `showOfflineDialog` state + `ConfirmDialog` at line 1133; both `handlePrimary`/`handleSplitPrimary` branch on `NETWORK_OFFLINE` (lines 408, 478) |
| `src/shared/lib/domain.ts` | `ProcessRefundInputSchema` | ✓ VERIFIED | Lines 1415-1435, matches D-12 exactly incl. duplicate-item `.refine()` |
| `src/entities/refund/model/types.ts` / `index.ts` | Re-exports schema + type | ✓ VERIFIED | Confirmed via grep and passing imports in `useProcessRefund.ts` |
| `src/features/process-refund/model/useProcessRefund.test.ts` | New unit test file | ✓ VERIFIED | Exists, passes as part of full suite |
| `src/features/reopen-tab/model/useReopenTab.test.ts`, `src/features/edit-paid-tab/model/useEditPaidTab.test.ts` | New unit test files (previously only live-DB integration coverage) | ✓ VERIFIED | Exist, pass as part of full suite |
| `src-tauri/tauri.conf.json` | identifier updated | ✓ VERIFIED | Confirmed, single-line diff |
| `supabase/functions/create-staff/index.ts` | Bearer-auth + role check + role-assignment cap | ✓ VERIFIED | Full auth/role/body-validation chain present; CR-01 fix (lines 86-91) present in current source, not just claimed |
| `src/features/create-staff/model/useCreateStaff.ts`, `ui/CreateStaffDialog.tsx`, `index.ts` | New mutation hook + dialog + barrel | ✓ VERIFIED | Exist; `isOnline()` guard present; wired into `StaffDashboard.tsx` |
| `src/shared/lib/edge-function-contracts.ts` | `callCreateStaff` + schemas | ✓ VERIFIED | Present (imported successfully by `useCreateStaff.ts`, typecheck clean) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `useCheckoutSale.submit()` | `PaymentForm.tsx` offline dialog | `NETWORK_OFFLINE` code preserved through `runPayment()` narrowing | ✓ WIRED | Live E2E proves this end-to-end (offline dialog appears within 5s, not full action timeout) |
| `ProcessRefundInputSchema` (domain.ts) | `useProcessRefund.ts` mutationFn | re-export via `entities/refund` → `safeParse` before `supabase.rpc` | ✓ WIRED | Confirmed by source read + passing unit tests |
| `create-staff` edge function auth/role block | `profiles.insert` | 401/403/400 gates precede all mutation calls | ✓ WIRED | Live E2E (SM7, SM8) proves no `profiles` row is created on a rejected request |
| `CreateStaffDialog` | `StaffDashboard.tsx` | `ProtectedAction action="manage_staff"` gate + dialog composition | ✓ WIRED | Confirmed in source; live E2E SM2 exercises the real UI end-to-end including forced-PIN-change on first login |
| Each `featOrders` hook's `SUPABASE_ERROR` fallback | toast at the consuming dialog | `i18n.t(...genericError)` | ✓ WIRED | Confirmed in `useRemoveTabItem.ts`, `useReopenTab.ts`, `useEditPaidTab.ts`, `entities/caja/model/queries.ts`, `useProcessRefund.ts` — mapped codes (NOT_FOUND, TAB_NOT_OPEN, CAJA_CLOSED, AUTH_FORBIDDEN, REOPEN_CAP_EXCEEDED, REFUND_EXCEEDS_ORIGINAL, etc.) left untouched per source read |

### Behavioral Spot-Checks / Live E2E Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Staff creation + role-gate + role-assignment cap | `npx playwright test e2e/22-staff-management.spec.ts -g "SM2\|SM7\|SM8"` | 3 passed (1.1m) | ✓ PASS |
| Offline-checkout guard (submit, retry, cancel, split) | `npx playwright test e2e/50-direct-sale-checkout.spec.ts -g "offline\|Try Again\|Cancel on offline\|split payment also appears"` | 4 passed (55.1s) | ✓ PASS |
| Refund flow incl. generic-error translation | `npx playwright test e2e/35-refund.spec.ts` (full file) | 4 passed (1.2m) | ✓ PASS |
| `audit-edge-coverage.test.ts` (recordAudit untouched) | `npx vitest run src/shared/lib/__tests__/audit-edge-coverage.test.ts` | 3 passed | ✓ PASS |
| Full unit suite | `npm run test -- --run` | 1125 passed, 15 todo, 0 failed | ✓ PASS |
| Typecheck | `npm run typecheck` | clean, no errors | ✓ PASS |
| Lint | `npm run lint` | clean (0 errors, boundary-plugin info warning only, not a code finding) | ✓ PASS |

### Code Review Fix Verification (CR-01, WR-01)

Both fixes claimed by the post-execution context were read directly from current source, not taken on claim:

- **CR-01 (critical, elevation of privilege):** `supabase/functions/create-staff/index.ts` lines 83-91 — a manager caller assigning `role: 'admin'` or `role: 'manager'` is now rejected with 403 before any mutation, closing the residual escalation path the code review found. Companion negative test `SM8` exists in `e2e/22-staff-management.spec.ts` (line 182) and was run live: **passes**.
- **WR-01 (warning, missing offline guard/exception handling):** `useProcessRefund.ts` line 31 now wraps the RPC call in `supabaseMutation(() => supabase.rpc(...))` (same pattern as `useReopenTab`/`useEditPaidTab`), so a thrown/network exception during refund resolves to a translated `SUPABASE_ERROR` toast instead of an unhandled promise rejection. Verified via the full unit suite (1125 pass) and live `e2e/35-refund.spec.ts` (4 pass).

Two low-priority findings (WR-02 cosmetic `@barpos.local` email domain; IN-01/IN-02 minor error-code-mapping/test-coverage notes) remain open per 08-REVIEW.md and are explicitly out of scope for this phase — confirmed not to block any of the 5 ROADMAP success criteria.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SALE-02 | 08-06 | Staff creation UI + caller-role check | ✓ SATISFIED | Source + live E2E (SM2, SM7, SM8) |
| SALE-04 | 08-01 | Offline-checkout fail-fast guard | ✓ SATISFIED | Source + live E2E (4 tests) |
| SALE-05 | 08-03, 08-04 | Translated error messages (sweep + refund's confirmed leak) | ✓ SATISFIED | Source (4 hooks + queries.ts) + live E2E (35-refund.spec.ts) |
| SALE-06 | 08-02 | Refund payload Zod validation + `as any` removal | ✓ SATISFIED | Source + unit tests (full suite green) |
| OPS-01 | 08-05 | Real Tauri identifier | ✓ SATISFIED | Direct file inspection |

No orphaned requirements: all 5 IDs declared across the 6 plans' frontmatter match ROADMAP.md's declared "Requirements: SALE-02, SALE-04, SALE-05, SALE-06, OPS-01" exactly (SALE-05 is intentionally split across two plans — confirmed non-overlapping scope: 08-03 covers remove-tab-item/reopen-tab/edit-paid-tab/register-caja-entry, 08-04 covers process-refund specifically, sequenced after 08-02 due to a shared-file conflict).

**Note (non-blocking):** `.planning/REQUIREMENTS.md`'s status table (lines 99-103) still reads "Not started" for all five IDs — this is a stale tracking-doc field, not a code gap; it should be updated to "Complete" as part of phase closure but does not affect goal achievement.

### Anti-Patterns Found

None. Grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` across all 13 phase-touched core files returned zero matches. No stub returns, no hardcoded empty props found in the files inspected.

### Human Verification Required

None. All 5 ROADMAP success criteria are E2E-testable and were live-run against the local Supabase stack (not just re-stated from SUMMARY.md), consistent with this project's CLAUDE.md automated-testing policy.

### Gaps Summary

No gaps. All 5 phase requirements are implemented, wired end-to-end, and independently verified by running (not just reading about) the relevant Playwright/Vitest suites against the local dev stack. The two issues raised in the phase's own code review (CR-01 critical, WR-01 warning) were confirmed fixed in current source, with their respective regression tests (SM8, refund unit/E2E suite) passing live. The two remaining low-priority review findings (WR-02, IN-01/IN-02) are correctly scoped out of this phase per the project's file-don't-fix-inline precedent and do not block any success criterion.

---

_Verified: 2026-08-18T15:55:00Z_
_Verifier: Claude (gsd-verifier)_
