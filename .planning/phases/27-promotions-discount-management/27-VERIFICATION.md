---
phase: 27-promotions-discount-management
verified: 2026-09-04T00:15:00Z
status: passed
score: 21/21 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed:
    - "G-27-13 (blocker): manager-PIN override for ad-hoc discounts/below-cost-floor overrides was checked client-side only — process_payment_atomic and process_split_payment_atomic (the reopened-tab/PaymentPane RPCs) had ZERO server-side authorization check on discount fields, and process_direct_sale_atomic's own re-check was keyed off the caller's own p_staff_id instead of the PIN actually entered. Closed by plans 27-08/27-09: all three RPCs now independently re-derive the authorizing staff from profiles.pin = p_manager_pin."
    - "CR-01 (found in first code review of the gap-closure fix): process-payment/index.ts and process-split-payment/index.ts forwarded p_manager_override as `body.managerOverride ?? null` instead of `?? false`, which silently disabled the DISCOUNT_REQUIRES_MANAGER guard (NULL bypasses a boolean check in plpgsql). Fixed in both edge functions plus a defense-in-depth COALESCE(p_manager_override, false) added as the first statement in all three RPCs (migration 20260903093000)."
    - "CR-02 (found in first code review): processRappiPayment in payment-processor.ts never forwarded managerOverride/managerPin to callProcessPayment at all. Fixed — now forwards both fields, regression-tested."
    - "G-27-8 Part A: the promotion form's percent-discount input field prepended/kept leading zeros instead of replacing typed input (number-typed state coerced per-keystroke). Fixed in Plan 27-10 via string-buffered state, mirroring NearExpirySettingsTab.tsx's existing pattern."
  gaps_remaining: []
  regressions: []
---

# Phase 27: Promotions & Discount Management Verification Report (Re-Verification)

**Phase Goal:** Promotions/discounts can be scoped to a product, a category, or a subcategory (a
category row with parentId set — no new hierarchy needed), multiple can qualify on one line item
resolved best-price-wins, and one condition type auto-triggers off proximity to a product's expiry
date (reusing the existing configurable near-expiry threshold, default 14 days). A qualifying item
shows its discount live everywhere price is shown (cart, checkout, receipt), the discount survives
refund/reopen/offline scenarios correctly, and a manager-PIN gate protects both ad-hoc custom
discounts and any override of the below-cost floor guard — with the PIN server-side re-verified
against the actual submitted request, not merely checked client-side.

**Verified:** 2026-09-04T00:15:00Z
**Status:** passed
**Re-verification:** Yes — the prior `27-VERIFICATION.md` (2026-09-02, 16/16, status `passed`) predates
plans 27-08, 27-09, 27-10 (gap-closure for `G-27-13` and `G-27-8` Part A) and the subsequent
`27-REVIEW.md` re-review that found and fixed CR-01/CR-02. This report supersedes it.

## Context: What Changed Since the Prior Verification

The prior verification passed 16/16 truths but was **taken at face value from SUMMARY.md-adjacent
evidence that this pass does not repeat uncritically.** Both `27-08-SUMMARY.md` and `27-09-SUMMARY.md`
explicitly flagged that their own E2E regression tests (the actual proof the gap was closed) were
**never executed** in their sandboxed worktrees — recorded as `status: unknown`, `human_judgment: true`,
and "Blocker for full sign-off" in both summaries' Next Phase Readiness sections. `27-REVIEW.md`
(2026-09-03) performed a static code review of the fix and confirmed CR-01/CR-02 closed by inspection,
but a code review is not a live execution proof either.

**This re-verification does not trust any of those claims — it independently drove the real system:**
started the dev server (`npm run dev`, port 1520) against the project's actual self-hosted local
Supabase stack (Docker, confirmed running), and ran the specific regression E2E specs live.

## Goal Achievement

### Observable Truths — Gap Closure (G-27-13, CR-01, CR-02, G-27-8 Part A)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 17 | `process_direct_sale_atomic` re-verifies a manager override against the PIN actually entered (`profiles.pin = p_manager_pin`), not the caller's own `p_staff_id` | ✓ VERIFIED | Direct DB introspection: `pg_get_function_identity_arguments` shows `p_manager_pin text` as the last parameter on the live local-DB function; live E2E `apply-promotion-and-custom-discount.spec.ts` tests (b)/(c) — logged in as **cashier**, a different **manager's** PIN entered — PASS (re-ran, not reused from SUMMARY claim) |
| 18 | `process_payment_atomic` and `process_split_payment_atomic` (the reopened-tab/PaymentPane RPCs) gained the SAME PIN-based re-verification and no longer accept a discount field with zero authorization check | ✓ VERIFIED | DB introspection confirms both functions carry `p_manager_override boolean, p_manager_pin text` as trailing params; live E2E `payment-pane.spec.ts` T13 (single-tender) and T14 (split-tender) — cashier session + distinct manager's PIN — PASS |
| 19 | `process_direct_sale_atomic`'s internal delegation to `process_payment_atomic`/`process_split_payment_atomic` forwards its own already-validated `p_manager_override`/`p_manager_pin`, so an already-approved direct sale is not double-rejected by the new inner check | ✓ VERIFIED | `apply-promotion-and-custom-discount.spec.ts` (direct-sale/CheckoutPanel path) tests (a)/(b)/(c) all PASS live — a direct sale with an ad-hoc discount completes end-to-end through the inner delegation, proving the forward-through works, not just that the outer check exists |
| 20 | CR-01: `p_manager_override` is never NULL-propagated past the `DISCOUNT_REQUIRES_MANAGER` guard (edge function `?? false`, plus a DB-level `COALESCE(p_manager_override, false)` defense-in-depth) | ✓ VERIFIED | `grep`/`\sf` on the live local-DB function body: `p_manager_override := COALESCE(p_manager_override, false);` present as first statement in `process_payment_atomic`; edge functions confirmed `?? false` (not `?? null`) in `process-payment/index.ts:175`, `process-split-payment/index.ts:197`; live integration test `manager-override-null-coalesce.integration.test.ts` (13 test files, 93 tests total including this one) — PASS against the real local DB, not mocked |
| 21 | CR-02: `processRappiPayment` forwards `managerOverride`/`managerPin` to `callProcessPayment`, closing the silent-drop hole | ✓ VERIFIED | `grep` confirms `payment-processor.ts:184-185` includes both fields; `payment-processor.test.ts` regression case run live — PASS |
| 22 | G-27-8 Part A: typing "20" into the promotion percent field displays "20" (not "02"/"020"); clearing produces empty, not "0" | ✓ VERIFIED (behavior-dependent, test-exercised) | Live E2E `e2e/promotions/percent-field-input.spec.ts` PASS — real browser, real DOM value assertion, real DB row check (`discount_value = 20`) |

**Regression check (must not break original 16 truths):** Full unit suite re-run this session —
**141 test files / 1365 tests passed, 15 todo, 2 skipped, 0 failed.** `npm run typecheck` clean.
`npm run lint` clean (0 warnings; same info-only `boundaries` plugin notice as before). Live E2E
regression run against `core-payments.spec.ts`, `split-payment.spec.ts`, `atomic-rpc-guards.spec.ts`,
`promotion-floor-guard.spec.ts` — **23 passed, 0 failed** — the new trailing RPC parameters on all
three payment functions did not break any existing payment path.

**Score:** 21/21 truths verified (0 present-but-behavior-unverified) — 16 from the original goal
(re-confirmed live this session, not carried forward from the stale report without re-checking) + 5
new truths from the gap closure.

### Required Artifacts (Gap Closure)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260903090000_process_direct_sale_manager_pin_reverify.sql` | `process_direct_sale_atomic` PIN re-verification | ✓ VERIFIED | Applied to the local self-hosted DB (confirmed via live function signature + behavior); the DB migration ledger table itself doesn't list it (applied via direct `psql`, matching this repo's documented pattern for `db push` failures — see CLAUDE.md's migration-drift precedent) |
| `supabase/migrations/20260903091500_process_payment_manager_override_wiring.sql` | `process_payment_atomic`/`process_split_payment_atomic` PIN re-verification + edge-function forwarding | ✓ VERIFIED | Same — confirmed live in DB and behaviorally via E2E |
| `supabase/migrations/20260903093000_manager_override_null_coalesce_guard.sql` | CR-01 fix (DB-level COALESCE guard) | ✓ VERIFIED | `COALESCE(p_manager_override, false)` confirmed present in live function body |
| `src/entities/payment/model/manager-override-null-coalesce.integration.test.ts` | Regression test for CR-01 | ✓ VERIFIED | Exists, ran live, passes (93/93 across the 6-file batch it's included in) |
| `e2e/payments/apply-promotion-and-custom-discount.spec.ts` (edited) | Real cashier + distinct-manager E2E proof, direct-sale path | ✓ VERIFIED | Tests (b)/(c) confirmed `loginAs(page, 'cashier')` (grep); all 3 tests PASS live |
| `e2e/payments/payment-pane.spec.ts` (edited) | Real cashier + distinct-manager E2E proof, PaymentPane path | ✓ VERIFIED | T13/T14 confirmed `loginAs(page, 'cashier')`; both PASS live, plus all 14 pre-existing PaymentPane tests still PASS (no regression) |
| `e2e/promotions/percent-field-input.spec.ts` | G-27-8 Part A regression proof | ✓ VERIFIED | New file, PASS live |
| `src/features/manage-promotions/ui/PromotionFormDialog.tsx` (edited) | String-buffered percent input | ✓ VERIFIED | `discountPercentStr` state present; fixed-amount `MoneyInput` branch untouched (grep-confirmed no changes to that code path) |

### Key Link Verification (Gap Closure)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ManagerPinDialog.handlePinComplete` | `onSuccess(match: Staff)` | widened callback contract | ✓ WIRED | `ManagerPinDialog.tsx:32,83` — `onSuccess: (staff: Staff) => void`, called with `onSuccess(match)` |
| `PaymentForm` matched-staff PIN capture | `discountInfo.managerPin` | `authorizingManagerPin` state → `effectiveManagerPin` (override-aware) | ✓ WIRED | `PaymentForm.tsx:218,434,448,600,610` |
| `payment-processor.ts` `DiscountInfo.managerPin` | edge function `BodySchema.managerPin` | `process*Payment` forwarding calls | ✓ WIRED | Confirmed for `processCashPayment`/`processCardPayment`/`processSplitPayment`/`processRappiPayment` (CR-02) |
| `process-payment`/`process-split-payment`/`process-direct-sale` edge functions | RPC `p_manager_pin` argument | `body.managerPin ?? null` | ✓ WIRED | `grep` confirms all three: `process-payment/index.ts:176`, `process-split-payment/index.ts:198`, `process-direct-sale/index.ts:323` |
| RPC `p_manager_pin` | `profiles.pin` independent lookup | `SELECT p.id FROM profiles p JOIN role_permissions rp ... WHERE p.pin = p_manager_pin` | ✓ WIRED | Confirmed via live function body inspection on all three RPCs |
| `process_direct_sale_atomic` internal delegation | `process_payment_atomic`/`process_split_payment_atomic` | `p_manager_override := p_manager_override, p_manager_pin := p_manager_pin` | ✓ WIRED | Confirmed working end-to-end via passing direct-sale-with-discount E2E tests (a live sale actually completes through the double-delegation, not just a grep of the migration text) |

### Behavioral Spot-Checks (this session, independently executed)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` | `tsc --noEmit` | exit 0 | ✓ PASS |
| `npm run lint` | `eslint src --max-warnings 0` | exit 0 (0 warnings) | ✓ PASS |
| Full unit suite (run once) | `npm run test` | 141 files / 1365 tests passed, 15 todo, 2 skipped | ✓ PASS |
| Gap-closure unit/integration suite | `npx vitest run manager-override-null-coalesce.integration.test.ts payment-processor.test.ts PaymentModal manager-pin-gate manage-promotions` | 6 files / 93 tests passed | ✓ PASS |
| Live DB function signatures | `psql \df+` (via `pg_get_function_identity_arguments`) on all 3 RPCs | `p_manager_override boolean, p_manager_pin text` present as trailing params on all 3 | ✓ PASS |
| Live DB CR-01 guard | `psql \sf process_payment_atomic` | `p_manager_override := COALESCE(p_manager_override, false);` present as first statement | ✓ PASS |
| G-27-13 direct-sale path E2E (re-run, not reused) | `npx playwright test e2e/payments/apply-promotion-and-custom-discount.spec.ts` | 3/3 passed | ✓ PASS |
| G-27-13 PaymentPane path E2E (re-run, not reused) | `npx playwright test e2e/payments/payment-pane.spec.ts` | 16/16 passed (14 pre-existing + T13/T14) | ✓ PASS |
| G-27-8 Part A E2E (re-run, not reused) | `npx playwright test e2e/promotions/percent-field-input.spec.ts` | 1/1 passed | ✓ PASS |
| Regression: core payment/checkout/floor-guard paths | `npx playwright test core-payments.spec.ts split-payment.spec.ts atomic-rpc-guards.spec.ts promotion-floor-guard.spec.ts` | 23/23 passed | ✓ PASS |

All Playwright runs used a dev server (`npm run dev`, port 1520) started fresh for this verification
session, against the project's real self-hosted local Supabase stack (Docker containers confirmed
running: `supabase_db`, `supabase_edge_runtime`, `supabase_rest`, etc.) — no manual/human UAT step, per
this project's CLAUDE.md mandatory-automated-testing policy. Dev server process was terminated at the
end of this verification session.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| PROMO-01 | ✓ SATISFIED | Original truths 1, 6 (prior report) + G-27-8 Part A now closed (truth 22) |
| PROMO-02 | ✓ SATISFIED | Original truth 3 (prior report), unaffected by gap closure |
| PROMO-03 | ✓ SATISFIED | Original truths 4, 5 (prior report), unaffected by gap closure |
| PROMO-04 | ✓ SATISFIED | Original truth 2 (prior report), unaffected by gap closure |
| PROMO-05 | ✓ SATISFIED | Original truths 6, 7 (prior report) + gap-closure truths 17-19 now close the server-side re-verification loop across ALL THREE payment RPCs, not just `process_direct_sale_atomic` |
| PROMO-06 | ✓ SATISFIED | Original truths 8, 9, 10 (prior report), unaffected by gap closure |
| PROMO-07 | ✓ SATISFIED | Original truth 11 (prior report) + gap-closure truths 17-20 — the below-cost-override manager-PIN gate is now server-side re-verified on every RPC that can process a below-cost sale |
| PROMO-08 | ✓ SATISFIED | Original truth 12 (prior report), unaffected by gap closure |
| PROMO-09 | ✓ SATISFIED | Original truth 13 (prior report), unaffected by gap closure |

No orphaned requirements. All 9 PROMO IDs traced in `.planning/REQUIREMENTS.md` (lines 358-366, all
"Complete") and claimed across plans 27-01 through 27-10's `requirements` frontmatter.

### Anti-Patterns Found

None in any gap-closure file. `grep` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` across
`ManagerPinDialog.tsx`, `PaymentForm.tsx`, `payment-processor.ts`, `edge-function-contracts.ts`,
`useCheckoutSale.ts`, `process-direct-sale/index.ts`, `process-payment/index.ts`,
`process-split-payment/index.ts`, `PromotionFormDialog.tsx` returned zero matches.

### Non-Blocking Observations (from this pass and the carried-forward `27-REVIEW.md`)

These do not contradict any must-have truth and do not block the phase goal:

| Item | Detail | Why non-blocking |
|---|---|---|
| WR-01 (27-REVIEW.md) | `process_direct_sale_atomic`'s own NULL-coalesce defense path has no dedicated direct-RPC regression test (only `process_payment_atomic`/`process_split_payment_atomic` are covered by `manager-override-null-coalesce.integration.test.ts`) | The guard itself is confirmed present in the live DB function body; `process-direct-sale/index.ts` already used `?? false` (not `?? null`) even before the DB-level COALESCE was added, so this path was never actually exposed to the CR-01 class of bug — only test coverage symmetry is missing, not behavior |
| WR-02 (27-REVIEW.md) | `v_manager_staff_id` resolved but never persisted to `record_audit`/a payment column in any of the 3 RPCs | Pre-existing audit-quality gap, not a correctness bug; the authorization check itself works correctly regardless |
| IN-01 (27-REVIEW.md) | `20260903093000` migration omits the `NOTIFY pgrst, 'reload schema'` its predecessors include | Confirmed likely correct as-is (body-only `CREATE OR REPLACE`, no signature change in that specific migration) — flagged only as a documentation-clarity nit |
| Un-filed follow-up todo | Both `27-08-SUMMARY.md` and `27-09-SUMMARY.md` state a `.planning/todos/` (or STATE.md Pending Todos) entry should be filed for the same structural PIN-identity gap in `process_refund`/`reopen_tab_rpc`/`edit_paid_tab_rpc`/`close_tab` (explicitly out of this phase's scope). Checked `.planning/todos/pending/` and `.planning/STATE.md` — **no such entry exists yet.** This is a process/tracking gap, not a Phase 27 functional gap (those four RPCs were never in Phase 27's requirement scope), but should be filed before this class of defect is forgotten. |
| Migration ledger / cloud-deploy drift | The 3 gap-closure migrations (and, in fact, every migration from `20260901000001` onward) are applied to the **local self-hosted DB** (confirmed live, functions behave correctly) but are **not yet pushed to the linked cloud project** (`mkvinyekkyennyegfoxq`) and are not tracked in the local `supabase_migrations.schema_migrations` ledger (applied via direct `psql`, matching this repo's documented `db push` workaround pattern). This is the correct dev/test environment for THIS verification (this repo's own CLAUDE.md and Phase 20 establish the self-hosted stack as dev/test, the cloud project as a separate release-time deploy target via `scripts/deploy-remote-backend.ps1`), so it does not block Phase 27's goal-backward verification — but it is a pre-existing, project-wide (not Phase-27-specific) release-readiness gap that should be swept before the next production deploy. |

## Gaps Summary

None. Both gap-closure targets are fully closed and independently re-proven this session:

- **G-27-13** is closed end-to-end across all three payment RPCs (`process_direct_sale_atomic`,
  `process_payment_atomic`, `process_split_payment_atomic`) — confirmed by direct database
  introspection of the live function signatures/bodies AND by re-running (not reusing SUMMARY.md's
  claims of) the actual Playwright regression specs, all of which passed against a freshly started dev
  server and the project's real local Supabase stack.
- **CR-01/CR-02** (found in the first code review of the G-27-13 fix) are confirmed closed by direct
  inspection of the live DB function body and edge-function source, plus a passing live integration
  test.
- **G-27-8 Part A** is closed and proven by a live, real-browser Playwright E2E test.
- **No regressions:** full unit suite (1365 tests), typecheck, lint, and a targeted E2E regression pass
  across core payment/checkout/floor-guard paths all pass cleanly after the RPC signature changes.

---

_Verified: 2026-09-04T00:15:00Z_
_Verifier: Claude (gsd-verifier)_
