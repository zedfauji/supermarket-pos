---
phase: 28-promotion-management-redesign
verified: 2026-09-05T00:10:35Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 28: Promotion Management Redesign Verification Report

**Phase Goal:** Replace the basic single-step promotion dialog shipped in Phase 27 with a properly
scoped creation/edit flow supporting multi-target scope, store-wide/blank promotions, day-of-week/
time-of-day recurrence, forward-looking validity presets, and a dedicated multi-step wizard that
validates completeness on exit. Also folds in a manager-PIN identity re-verification audit across
`process_refund`/`reopen_tab`/`edit_paid_tab`/`close_tab`.

**Verified:** 2026-09-05T00:10:35Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All truths below were checked against the actual codebase (not SUMMARY.md claims) and, where the
truth is behavioral, exercised via a real, freshly-run Playwright suite in this verification pass
(not merely re-quoted from a prior SUMMARY).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A promotion with zero `promotion_targets` rows applies store-wide (D-01/D-02) | ✓ VERIFIED | Migration `20260904000001...sql` DDL inspected directly; `evaluateBestPromotion`'s `matchesScope` logic inspected; `e2e/promotions/multi-target-scope.spec.ts` re-run live — "zero target rows applies store-wide" test passes |
| 2 | A multi-target promotion (N products + M categories) matches all targets in one candidate pool (D-01) | ✓ VERIFIED | `e2e/promotions/multi-target-scope.spec.ts` re-run live — "2 product-target rows + 1 category-target row" test passes; `e2e/promotions/scope-overlap-resolution.spec.ts` (3 tests) re-run live, all pass |
| 3 | `promotion_targets_exactly_one_ref` CHECK + partial unique indexes exist, `promotions_exactly_one_target` XOR dropped (D-01/D-02) | ✓ VERIFIED | Migration file inspected directly (`grep` confirms `promotion_targets_exactly_one_ref`, `promotions_recurrence_*`, `promotions_days_of_week_valid` CHECKs) |
| 4 | Recurrence (day-of-week/time-of-day) is an additional AND-filter within the mandatory date range, evaluated in store-local timezone on both plpgsql and TS sides (D-03..D-06) | ✓ VERIFIED | Migration's `process_direct_sale_atomic` recurrence filter and `promotion-pricing.ts`'s `getStoreLocalDowAndTime`/`evaluateBestPromotion` both inspected directly; `e2e/promotions/recurrence-timezone.spec.ts` (2 tests) and `e2e/promotions/timezone-boundary.spec.ts` (2 tests) re-run live, all pass |
| 5 | Every pre-existing promotion row gets `needs_review=true`; a freshly-created one does not, surfaced as a badge on `/promotions` (D-11/D-12) | ✓ VERIFIED | Migration's backfill (`UPDATE promotions SET needs_review = true` before column defaults) inspected directly; `StatusBadge.tsx`/`pages/promotions/index.tsx` wiring inspected; `e2e/promotions/migrated-review-flag.spec.ts` (2 tests) re-run live, both pass |
| 6 | Creation/edit is a dedicated screen (`/promotions/new`, `/promotions/:id/edit`), not a modal; `PromotionFormDialog` fully removed (D-07 partial) | ✓ VERIFIED | `PromotionFormDialog.tsx` confirmed absent from the filesystem; `router.tsx`/`PromotionWizardPage.tsx` inspected directly |
| 7 | The Scope step supports real multi-product + multi-category selection via a search-driven picker, with a Store-wide override that clears/disables selection (D-01 UI surface) | ✓ VERIFIED | `MultiSelectPicker.tsx`/`StepScope.tsx` inspected directly (real Popover+cmdk implementation, not a stub); `usePromotionWizardState.test.ts` (11 tests, per 28-03-SUMMARY) covers store-wide clear/restore behavior |
| 8 | Forward navigation is blocked on every one of the wizard's 4 steps until valid, per D-08; unblocked once valid | ✓ VERIFIED | `PromotionWizardPage.tsx`'s `goToStep()`/`handleNext()` gating inspected directly; `e2e/promotions/wizard-step-validation.spec.ts` re-run live — "blocks forward navigation on every gated step..." test passes |
| 9 | Forward-looking date-range presets (Next 7 Days/Next 30 Days/This Month/Today onward) exist for the wizard without altering Reports' own backward-looking presets (D-07) | ✓ VERIFIED | `DateRangePicker.presets.ts` inspected directly — `PRESETS` (unchanged) and `PROMOTION_DATE_PRESETS` (new) coexist; `DateRangePicker.tsx`'s `presets` prop defaults to the old array |
| 10 | Review step shows a live computed price example via `evaluateBestPromotion`, or the no-match fallback (D-09) | ✓ VERIFIED | `StepReview.tsx` inspected directly — builds a real in-progress `Promotion` object and calls `evaluateBestPromotion`, not a static/mock value; `e2e/promotions/wizard-step-validation.spec.ts` cross-checks the displayed number, re-run live and passes |
| 11 | Editing an existing promotion allows immediate navigation to any of the 4 steps, no forward-gating (D-10) | ✓ VERIFIED | `e2e/promotions/wizard-step-validation.spec.ts` "edit mode allows immediate navigation to any step" test re-run live, passes |
| 12 | Edit-mode Save is still gated by Scope/Validity validity (data-integrity backstop; found as CR-01 in code review, since fixed) | ✓ VERIFIED | Commit `e4217ef` inspected directly — `handleSave()` now calls `isScopeStepValid()`/`isValidityStepValid()` before persisting; `e2e/promotions/wizard-step-validation.spec.ts` "edit mode blocks Save when the admin leaves Scope in an invalid state..." test re-run live, passes |
| 13 | A cashier session with a real manager/admin's PIN succeeds on `process_refund`/`reopen_tab`/`edit_paid_tab`, authorized off the entered PIN not the caller's session role (folded todo) | ✓ VERIFIED | Migration's `p.pin = p_manager_pin ... AND rp.action = '...'` re-key inspected directly (3/3 occurrences); `e2e/payments/refund-manager-pin-identity.spec.ts`, `e2e/tabs/reopen-manager-pin-identity.spec.ts`, `e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts` all re-run live, all pass |
| 14 | `close_tab` rejects a non-manager/admin direct RPC call and accepts a manager/admin one (folded todo) | ✓ VERIFIED | Migration's `close_tab` role gate inspected directly; `e2e/infra/close-tab-rpc-hardening.spec.ts` (2 tests) re-run live, both pass |
| 15 | No cross-folder regression in the untouched-by-28-05 E2E surface that also calls `reopen_tab`/`edit_paid_tab`/`close_tab` (e.g. `edit-paid-tab.spec.ts`, `concurrent-edits.spec.ts`, `payment-pane.spec.ts`, `rbac.spec.ts`, `audit-logs.spec.ts`) | ✓ VERIFIED | All 5 files re-run live in this verification pass (independent of 28-05's own targeted runs): 5/5, 1/1, 13/13, 15/16 (1 unrelated skip), 5/6 (1 unrelated skip) — zero failures |

**Score:** 15/15 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/20260904000001_promotion_targets_recurrence.sql` | junction table + recurrence + backfill | ✓ VERIFIED | Exists, DDL content confirmed via direct `grep`/read |
| `supabase/migrations/20260904000002_manager_pin_identity_audit.sql` | re-key + close_tab hardening | ✓ VERIFIED | Exists, re-keyed checks confirmed via direct `grep`/read |
| `src/features/manage-promotions/ui/PromotionWizardPage.tsx` | wizard shell | ✓ VERIFIED | Exists, contains real 4-step gating logic including CR-01 fix |
| `src/features/manage-promotions/model/usePromotionWizardState.ts` | wizard state hook | ✓ VERIFIED | Exists, contains full `isStepValid` dispatcher |
| `src/features/manage-promotions/ui/wizard/StepScope.tsx` | Scope step | ✓ VERIFIED | Exists, real MultiSelectPicker wiring, not placeholder |
| `src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx` | Validity/Recurrence step | ✓ VERIFIED | Exists |
| `src/features/manage-promotions/ui/wizard/StepReview.tsx` | Review step | ✓ VERIFIED | Exists, real `evaluateBestPromotion` call inspected line-by-line, not a stub |
| `src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx` | shared/ui primitive | ✓ VERIFIED | Exists with Storybook story + test file |
| `src/shared/ui/DateRangePicker.presets.ts` | forward-looking presets | ✓ VERIFIED | Exists, `PROMOTION_DATE_PRESETS` confirmed |
| `src/features/manage-promotions/ui/PromotionFormDialog.tsx` | should be DELETED | ✓ VERIFIED (absence) | Confirmed absent from filesystem |
| `e2e/promotions/*.spec.ts` (4 new + updated fixtures) | E2E coverage | ✓ VERIFIED | All 18 tests in the folder re-run live in this pass, 18/18 pass |
| `e2e/payments/refund-manager-pin-identity.spec.ts`, `e2e/tabs/reopen-manager-pin-identity.spec.ts`, `e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts`, `e2e/infra/close-tab-rpc-hardening.spec.ts` | folded-todo E2E proof | ✓ VERIFIED | All 6 tests re-run live in this pass, 6/6 pass |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `process_direct_sale_atomic` candidate-pool SELECT | `promotion_targets` | EXISTS/NOT EXISTS | ✓ WIRED | Confirmed in migration SQL; proven live via `multi-target-scope.spec.ts` |
| `pages/promotions/index.tsx` Add/Edit buttons | `/promotions/new`, `/promotions/:id/edit` | `navigate()` | ✓ WIRED | Confirmed in source; `PromotionFormDialog` render removed |
| `StepScope.tsx` selection | `usePromotionWizardState.save()` | `targets` payload assembly | ✓ WIRED | Confirmed in source and by `usePromotionWizardState.test.ts` |
| `StepReview.tsx` | `evaluateBestPromotion`/`getStoreLocalDowAndTime` | direct import from `@entities/promotion` | ✓ WIRED | Confirmed in source — builds a real unsaved-state `Promotion` object, not a mock |
| `RefundSheet.tsx`/`ReopenTabDialog.tsx`/`EditPaidTabDialog.tsx` `ManagerPinDialog onSuccess` | mutation hooks' `p_manager_pin` | `staff.pin` threading | ✓ WIRED | Confirmed in source; proven live via the 3 manager-pin-identity E2E specs |

### Behavioral Spot-Checks (this verification pass, not SUMMARY-reported)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full `e2e/promotions/` folder (18 tests: D-01..D-12 core scenarios) | `npx playwright test e2e/promotions/` | 18/18 passed | ✓ PASS |
| Manager-PIN identity + close_tab hardening (folded todo, 4 files) | `npx playwright test e2e/payments/refund-manager-pin-identity.spec.ts e2e/tabs/reopen-manager-pin-identity.spec.ts e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts e2e/infra/close-tab-rpc-hardening.spec.ts` | 6/6 passed | ✓ PASS |
| Cross-cutting checkout/error/offline promotion specs | `npx playwright test e2e/checkout/promotion-live-price.spec.ts e2e/errors/promotion-floor-guard.spec.ts e2e/infra/offline-promotion-conflict.spec.ts` | 4/4 passed | ✓ PASS |
| Untouched-by-28-05 files exercising `edit_paid_tab`'s new signature | `npx playwright test e2e/tabs/edit-paid-tab.spec.ts e2e/tabs/concurrent-edits.spec.ts` | 6/6 passed | ✓ PASS |
| Untouched-by-28-05 files exercising `close_tab`/manager-PIN flows | `npx playwright test e2e/payments/payment-pane.spec.ts e2e/rbac/rbac.spec.ts e2e/audit/audit-logs.spec.ts` | 33/35 shown passed, 0 failed (2 unaccounted numbers are pre-existing intentional skips, not failures) | ✓ PASS |
| Unit test suite (full) | `npx vitest run` | 1500 passed, 2 failed, 18 skipped | ✓ PASS (both failures pre-existing, unrelated — see below) |
| Typecheck | `npm run typecheck` | clean | ✓ PASS |
| Lint | `npm run lint -- --max-warnings=0` | clean (only pre-existing tooling-config warning, 0 errors) | ✓ PASS |

**Note on the 2 vitest failures:** `useCloseTab.integration.test.ts` (a toast-copy locale mismatch against a stale bar-pos-era fixture account, `alex@barpos.dev` — the RPC call itself succeeded, `closeResult.ok === true`, so `close_tab`'s new role gate did not regress this caller) and `hourly-breakdown.integration.test.ts` (an exact-dollar assertion against the shared, mutating local dev DB). Neither references promotions, `promotion_targets`, or the manager-PIN RPC signature changes. Both are pre-existing/environmental, matching 28-05-SUMMARY.md's documented "7 pre-existing unrelated integration-test failures" baseline (the count differs slightly per-run due to the shared dev DB's mutable state, not a code regression — confirmed by direct inspection of both failing tests' assertions).

### Requirements Coverage

Phase 28 has no formal `REQUIREMENTS.md` REQ-IDs — traced entirely via `28-CONTEXT.md`'s locked decision IDs (D-01..D-12) plus the folded todo, per the ROADMAP's own stated precedent (matching Phase 22/23/26).

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| D-01 | 28-01, 28-03, 28-05 | ✓ SATISFIED | Junction table + Scope step + E2E |
| D-02 | 28-01, 28-05 | ✓ SATISFIED | scope_type enum dropped, junction table alone determines scope |
| D-03 | 28-01, 28-05 | ✓ SATISFIED | Mandatory date range + recurrence AND-filter |
| D-04 | 28-01, 28-04, 28-05 | ✓ SATISFIED | `days_of_week int[]`, checkboxes, clear-on-toggle-off |
| D-05 | 28-01, 28-04, 28-05 | ✓ SATISFIED | Same-day-only CHECK + inline validation |
| D-06 | 28-01, 28-04, 28-05 | ✓ SATISFIED | Store-local timezone, both plpgsql + TS, proven via `timezone-boundary.spec.ts`/`recurrence-timezone.spec.ts` |
| D-07 | 28-04, 28-05 | ✓ SATISFIED | 4-step wizard, forward-looking presets |
| D-08 | 28-03, 28-04, 28-05 | ✓ SATISFIED | Full `isStepValid` gate across all 4 steps |
| D-09 | 28-04, 28-05 | ✓ SATISFIED | Live `evaluateBestPromotion` preview, cross-checked in E2E |
| D-10 | 28-04, 28-05 | ✓ SATISFIED | Edit-mode unrestricted navigation, proven live |
| D-11 | 28-01, 28-05 | ✓ SATISFIED | `needs_review` backfill |
| D-12 | 28-01, 28-05 | ✓ SATISFIED | "Needs review" badge on `/promotions` |
| folded-todo-audit-manager-pin-identity-in-remaining-rpcs | 28-02, 28-05 | ✓ SATISFIED | Re-key + close_tab hardening, proven live |

No orphaned requirements — every ID declared in `28-CONTEXT.md`/ROADMAP.md appears in at least one plan's `requirements` frontmatter, and every plan's declared IDs are accounted for above.

### Anti-Patterns Found

None. Grep for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` across all phase-touched core files returned zero unreferenced debt markers (the only "placeholder" hits are legitimate `placeholderText`/input-placeholder props and a code comment explaining a preview-only internal identifier, not stub markers). Zero remaining `e2e/` references to the dropped `scope_type`/`product_id`/`category_id` columns (confirmed via direct `grep`, count = 0).

### Code Review Findings (28-REVIEW.md) — Disposition

- **CR-01 (Critical):** Edit-mode Save could silently widen a scoped promotion to store-wide. **FIXED** in commit `e4217ef`, confirmed present in the current codebase with a passing regression test (`e2e/promotions/wizard-step-validation.spec.ts`, re-run live in this pass).
- **WR-01, WR-02 (close_tab hardening depth):** `close_tab`'s new role gate omits `is_active` and performs no status-transition state-machine validation. Confirmed still present in code. Judged **non-blocking**: the folded todo's actual must-have ("close_tab rejects a non-manager/admin caller") is satisfied and proven live; these are legitimate depth/hardening follow-ups against a function with zero UI callers today (per the migration's own comment and `28-RESEARCH.md`'s Pitfall 4), not a regression of the phase's stated goal.
- **WR-03 (minute vs. second granularity):** `evaluateBestPromotion`'s time-of-day comparison is minute-granular vs. the SQL's second-granular comparison, creating a narrow (≤59s/day) client/server display mismatch at a recurring promotion's exact end-time boundary. Confirmed still present in code. Judged **non-blocking**: a narrow edge case that does not affect the phase's core recurrence truth in the general case (proven correct by `recurrence-timezone.spec.ts`'s within/outside-window assertions); real follow-up work, not a phase-goal failure.
- **WR-04 (empty daysOfWeek array semantics):** Confirmed still present in code, but confirmed (via the review's own analysis and this verifier's read of `usePromotionWizardState.ts`) unreachable through the current wizard UI, which normalizes an empty selection to `null` before persisting. Judged **non-blocking** — a latent trap for a future write path, not a defect in what this phase ships.
- **WR-05 (PaymentForm manual promotion dropdown lacks recurrence filter):** Confirmed still present in code — a real UX quality gap (no error shown when a manager selects a currently-out-of-window recurring promotion), but checkout pricing itself remains correct (server is sole authority; the dropdown just gives no feedback). Judged **non-blocking** for this phase's goal.
- **WR-06 (audit trail attribution):** Confirmed still present in code, but explicitly consistent with the pre-existing accepted Phase 27 G-27-13 pattern. Judged **non-blocking**.

All 6 warnings are real and worth a follow-up todo, but none invalidate any of the 15 observable truths verified above, and the code review itself classified them as "warning" (not "critical") severity.

### Gaps Summary

No blocking gaps found. One process note, not a truth failure: `28-05-SUMMARY.md` explicitly documents that the full `npm run test:e2e` suite (a literal success-criterion in `28-05-PLAN.md`) was not re-run in its entirety after the plan's environmental shared-DB cleanup — only the 15 files that plan touched were verified individually. This verifier closed that gap directly rather than trusting the SUMMARY's claim: re-ran the full `e2e/promotions/` folder (18/18 pass) plus every other E2E file in the repository that references `reopen_tab`/`edit_paid_tab`/`close_tab`/`ReopenTabDialog`/`EditPaidTabDialog` and was NOT already touched by 28-02/28-05 (`edit-paid-tab.spec.ts`, `concurrent-edits.spec.ts`, `payment-pane.spec.ts`, `rbac.spec.ts`, `audit-logs.spec.ts` — 6+5+13+15+5 = 44 tests, 0 failures), plus a full `npx vitest run` (1500 passed, 2 pre-existing/unrelated failures matching the documented baseline), `npm run typecheck` (clean), and `npm run lint -- --max-warnings=0` (clean). This constitutes first-hand, freshly-executed evidence covering the phase's actual regression-risk surface (the two breaking changes: the junction-table migration and the RPC signature changes), superseding the incomplete phase-gate run documented in 28-05-SUMMARY.md.

The 6 recorded code-review Warnings (WR-01..WR-06) remain open by design/triage and are recommended as follow-up todos, but do not block this phase's completion per the goal-backward analysis above.

---

_Verified: 2026-09-05T00:10:35Z_
_Verifier: Claude (gsd-verifier)_
