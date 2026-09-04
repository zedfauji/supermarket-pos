---
phase: 27-promotions-discount-management
reviewed: 2026-09-03T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - e2e/payments/apply-promotion-and-custom-discount.spec.ts
  - e2e/payments/payment-pane.spec.ts
  - e2e/promotions/percent-field-input.spec.ts
  - src/features/checkout-sale/model/useCheckoutSale.ts
  - src/features/manage-promotions/ui/PromotionFormDialog.test.tsx
  - src/features/manage-promotions/ui/PromotionFormDialog.tsx
  - src/features/manager-pin-gate/ui/ManagerPinDialog.test.tsx
  - src/features/manager-pin-gate/ui/ManagerPinDialog.tsx
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/payment-processor.test.ts
  - src/shared/lib/payment-processor.ts
  - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - supabase/functions/process-direct-sale/index.ts
  - supabase/functions/process-payment/index.ts
  - supabase/functions/process-split-payment/index.ts
  - supabase/migrations/20260903090000_process_direct_sale_manager_pin_reverify.sql
  - supabase/migrations/20260903091500_process_payment_manager_override_wiring.sql
  - supabase/migrations/20260903093000_manager_override_null_coalesce_guard.sql
  - src/entities/payment/model/manager-override-null-coalesce.integration.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 27: Code Review Report (Re-Review)

**Reviewed:** 2026-09-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found (no blockers — both prior BLOCKERs verified closed)

## Summary

This is a targeted re-review of the fix commit for the two BLOCKERs found in the prior pass on this same file scope:

- **CR-01** (`?? null` instead of `?? false` for `p_manager_override`, silently disabling the `DISCOUNT_REQUIRES_MANAGER` guard): **verified closed.** `process-payment/index.ts:175` and `process-split-payment/index.ts:197` now both send `body.managerOverride ?? false`, each with an inline comment explaining why `?? null` was wrong. `process-direct-sale/index.ts:322` already used `?? false`. On top of the edge-function fix, migration `20260903093000_manager_override_null_coalesce_guard.sql` adds `p_manager_override := COALESCE(p_manager_override, false);` as the literal first executable statement (right after `BEGIN`) in `process_payment_atomic`, `process_split_payment_atomic`, and `process_direct_sale_atomic`, closing the same hole for any caller that reaches these RPCs directly via PostgREST (all three grant `EXECUTE` to `authenticated`, confirmed in the migration's own comment). A new integration test (`manager-override-null-coalesce.integration.test.ts`) calls `process_payment_atomic`/`process_split_payment_atomic` with an explicit SQL `NULL` for `p_manager_override` and asserts `DISCOUNT_REQUIRES_MANAGER` is returned and no payment row is created — this is a real regression test against the DB, not just a unit mock.

- **CR-02** (`processRappiPayment` never forwarding `managerOverride`/`managerPin`): **verified closed.** `payment-processor.ts:184-185` now includes `managerOverride: discountInfo?.managerOverride, managerPin: discountInfo?.managerPin` in the `callProcessPayment` call inside `processRappiPayment`. A dedicated regression test in `payment-processor.test.ts` (`'processRappiPayment forwards managerOverride/managerPin (CR-02 regression...)'`) asserts both fields reach the edge-function-contracts call.

No new BLOCKER-class issues were introduced by this fix. Two WARNING-level gaps and one INFO-level observation are noted below — none block shipping the fix, but the first WARNING (missing direct-RPC test coverage for `process_direct_sale_atomic`'s own NULL-coalesce path) is worth closing before considering CR-01 fully regression-proofed at every layer the migration itself claims to defend.

## Narrative Findings (AI reviewer)

### WR-01: `process_direct_sale_atomic`'s NULL-coalesce defense is untested by the new integration test

**File:** `src/entities/payment/model/manager-override-null-coalesce.integration.test.ts:128-202`
**Issue:** The regression test suite added for this fix only exercises `process_payment_atomic` and `process_split_payment_atomic` with an explicit SQL `NULL` for `p_manager_override`. It does not add an equivalent case for `process_direct_sale_atomic`, even though migration `20260903093000_manager_override_null_coalesce_guard.sql`'s own stated rationale is that **all three** RPCs "grant EXECUTE to `authenticated`... so any logged-in staff member can call them directly via PostgREST, bypassing the edge function's coalesce entirely" — and the migration does add the identical `COALESCE(p_manager_override, false)` guard to `process_direct_sale_atomic` (line 656 of that migration) for exactly this reason. As written, the fix for `process_direct_sale_atomic`'s NULL-bypass path is implemented but not independently proven the same way the other two are.
**Fix:** Add a third `itInt(...)` case calling `process_direct_sale_atomic` directly with `p_manager_override: null` and a non-empty `p_discount_scope`/`p_discount_type`/`p_discount_value`/`p_discount_amount`, asserting `data.code === 'DISCOUNT_REQUIRES_MANAGER'` and that no `tabs`/`payments` rows were created. This requires seeding `caja_sessions`/`shifts` inputs (the function's own preconditions) but otherwise mirrors the existing two test bodies.

### WR-02: `v_manager_staff_id` is assigned but never read in all three RPCs

**File:** `supabase/migrations/20260903093000_manager_override_null_coalesce_guard.sql:47,97-102` (and the identical pattern at lines 339,362-367 and 645,700-706)
**Issue:** Each of `process_payment_atomic`, `process_split_payment_atomic`, and `process_direct_sale_atomic` declares `v_manager_staff_id uuid` and populates it via `SELECT p.id INTO v_manager_staff_id FROM profiles p JOIN role_permissions rp ...`, but only ever branches on `IF NOT FOUND THEN` — the resolved id itself is never used (not stored on the payment row, not passed to `record_audit`, not returned). This is a pre-existing pattern carried forward unchanged from the two prior migrations in this chain (`20260903090000`, `20260903091500`), not something this fix introduced, but it's dead state that silently discards useful audit information (which specific manager authorized the override) at the exact place that information would be cheapest to capture.
**Fix:** Either thread `v_manager_staff_id` into the `record_audit(...)` calls already present in each function (e.g. as `jsonb_build_object('authorizingManagerId', v_manager_staff_id, ...)`), or remove the unused variable/`SELECT p.id INTO` in favor of a bare `EXISTS(...)` check if the audit trail genuinely doesn't need it. Low priority — not a correctness bug, just a missed audit-quality opportunity that's been carried through three consecutive migrations now.

### IN-01: `20260903093000` migration omits the trailing `NOTIFY pgrst, 'reload schema';` its predecessors both include

**File:** `supabase/migrations/20260903093000_manager_override_null_coalesce_guard.sql` (end of file)
**Issue:** Both `20260903090000_process_direct_sale_manager_pin_reverify.sql` and `20260903091500_process_payment_manager_override_wiring.sql` end with `NOTIFY pgrst, 'reload schema';`. This migration does not. Since this migration is a pure function-body change via `CREATE OR REPLACE FUNCTION` with an argument list identical to `20260903091500`'s (no `DROP FUNCTION`/signature change), PostgREST's route table — keyed on function name + argument types — doesn't need the explicit reload the way an appended-parameter migration does, so this is very likely correct as-is, not a bug. It's still an inconsistency with the pattern the other two migrations in the same three-migration chain establish, and a future reader diffing these files may reasonably wonder if it was an oversight.
**Fix:** Either add a one-line comment noting the reload is intentionally omitted (signature unchanged, body-only replace), or add the `NOTIFY` anyway for consistency/harmlessness — either resolves the ambiguity for the next person touching this migration chain.

---

_Reviewed: 2026-09-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
