---
phase: 27-promotions-discount-management
plan: 04
subsystem: payments
tags: [react, supabase, postgres, plpgsql, playwright, vitest, radix-select, zustand, tanstack-query]

requires:
  - phase: 27-promotions-discount-management
    provides: "Plan 01's promotions schema, process_direct_sale_atomic (18-param, best-price-wins + floor guard + managerOverride), entities/promotion model layer (usePromotions/evaluateBestPromotion)"
provides:
  - "PIN-gated ad-hoc discount section on PaymentForm (requiredAction=apply_custom_discount), pool_only/consumptions_only scopes fully retired to a single 'all' label"
  - "\"Apply Promotion\" selector on the payment screen — cashier applies an existing active promotion with no PIN, coexisting with the ad-hoc discount (D-10)"
  - "Below-cost override retry flow: BELOW_COST_REQUIRES_OVERRIDE from any payment attempt surfaces the same ManagerPinDialog and resubmits the same attempt on success"
  - "Fix: process_payment_atomic/process_split_payment_atomic now account for an ad-hoc discount when deciding a tab is fully paid — the first real end-to-end ad-hoc-discounted direct sale exposed this pre-existing gap"
affects: [27-05, 27-06, 27-07]

actuals:
  tokens: 23400
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "process_payment_atomic's 'close only when fully covered' check must add back any payments.discount_amount already recorded on the tab before comparing against the raw (undiscounted) order_items subtotal — order_items.unit_price only ever reflects a promotion discount baked in at insert time, never an ad-hoc discount."
    - "E2E specs that reach ManagerPinDialog's authorized branch must be logged in AS the eligible role (manager/admin) — the RPC's server-side role re-check is keyed off the currently logged-in staff's own p_staff_id, not the staff whose PIN was entered in the dialog."
    - "Prefer an id-selector (#discount-toggle) over getByRole('switch', {name}) for a Radix Switch mid PIN-dialog-transition in real (non-mocked) Playwright runs — the label's accessible-name association intermittently doesn't resolve during the transition even though the element itself is always present."

key-files:
  created:
    - e2e/payments/apply-promotion-and-custom-discount.spec.ts
    - e2e/errors/promotion-floor-guard.spec.ts
    - supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql
  modified:
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
    - src/shared/lib/payment-processor.ts
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/shared/lib/edge-function-contracts.ts
    - src/shared/lib/i18n/locales/es-MX/featOrders.json
    - src/shared/lib/i18n/locales/en-US/featOrders.json
    - e2e/payments/edge-cases.spec.ts
    - e2e/reports/discount-and-revenue.spec.ts

key-decisions:
  - "The 'Apply Promotion' client-side re-evaluation reuses evaluateBestPromotion's own per-candidate money formula rather than re-deriving it — Math.max-on-discount semantics (expressed as Math.min on the resulting price) mean a manually-selected weaker promotion never worsens a line PROMO-03's live cart display already discounted better."
  - "process_direct_sale_atomic's server-side best-price-wins recomputation is authoritative regardless of which promotion the cashier manually selected — the client selection is a UX affordance/preview, not what actually gets charged; the RPC independently picks the best matching active promotion every time."
  - "Fixed process_payment_atomic/process_split_payment_atomic's tab-closing coverage check (a genuine pre-existing gap, not scoped to this plan's files_modified) rather than working around it in the client, because the plan's own success criteria ('ad-hoc discount ... functional on a direct sale for the first time') was unreachable without it — Task 1/2's PIN-gating was the first code path that could ever reach this branch with a real discount > 0."

patterns-established:
  - "E2E specs seeding a fresh isolated product+category+inventory row for precise below-cost/discount math (rather than reusing the shared 'Haldiram's Aloo Bhujia' catalog fixture) — mirrors promotion-rpc.integration.test.ts's seedProduct pattern, ported to Playwright's service-role client."

requirements-completed: [PROMO-05, PROMO-07]

coverage:
  - id: D1
    description: "Ad-hoc discount section on the payment screen requires a successful ManagerPinDialog before expanding; a correct PIN reveals percent/fixed fields (scope fixed to 'all') and submits with managerOverride: true; an incorrect PIN leaves the section collapsed and the sale unsubmitted"
    requirement: "PROMO-05"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx — discount-section PIN-gate cases"
        status: pass
      - kind: e2e
        ref: "e2e/payments/apply-promotion-and-custom-discount.spec.ts#(b) the ad-hoc discount section requires a manager PIN"
        status: pass
    human_judgment: false
  - id: D2
    description: "pool_only/consumptions_only discount-scope buttons fully retired — a single non-interactive 'all' label renders instead"
    requirement: "PROMO-05"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx#the pool_only/consumptions_only scope buttons no longer exist"
        status: pass
    human_judgment: false
  - id: D3
    description: "\"Apply Promotion\" selector lets a cashier apply an existing active promotion at payment with no manager PIN; the section is hidden entirely when zero promotions are currently active; selecting a promotion never overwrites the ad-hoc discount fields (D-10 coexistence)"
    requirement: "PROMO-05"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx#PaymentForm — Apply Promotion selector (4 cases)"
        status: pass
      - kind: e2e
        ref: "e2e/payments/apply-promotion-and-custom-discount.spec.ts#(a) selecting an active promotion requires no manager PIN and #(c) an applied promotion and an ad-hoc discount coexist"
        status: pass
    human_judgment: false
  - id: D4
    description: "A below-cost combination from any payment attempt (ad-hoc discount, an applied promotion, or their combination) surfaces the exact UI-SPEC copy and blocks the sale; a manager PIN retries the SAME payment attempt (same idempotency key) and completes at the allowed below-cost price"
    requirement: "PROMO-07"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx#PaymentForm — below-cost override retry"
        status: pass
      - kind: e2e
        ref: "e2e/errors/promotion-floor-guard.spec.ts#a below-cost promotion blocks checkout ... then a manager PIN completes the same attempt"
        status: pass
    human_judgment: false

duration: "~40min (resumed session, 14:29-15:05 MDT); Task 1 completed in a prior interrupted session"
completed: 2026-09-02
status: complete
---

# Phase 27 Plan 4: Payment-Screen Discount UI Summary

**Payment screen's ad-hoc discount is PIN-gated and functional on a real direct sale for the first time; an "Apply Promotion" selector applies an existing promotion with no PIN; below-cost combinations block and a manager PIN unblocks — all proven by real Playwright checkouts, plus a genuine backend bug fix that made the ad-hoc-discount path actually completable.**

## Performance

- **Duration:** ~40 min (resumed session, 2026-09-02T14:29 - 15:05 MDT). Task 1 ("PIN-gate the ad-hoc discount section + retire pool_only/consumptions_only") was completed in a prior session that was interrupted by a rate limit before Task 2 finished; this session resumed from restored WIP.
- **Started:** 2026-09-02T14:29:00-06:00 (this resumed session; Task 1 itself started earlier, ~10:40)
- **Completed:** 2026-09-02T15:05:00-06:00
- **Tasks:** 3/3
- **Files modified:** 12 (3 created, 9 modified) across all task/fix commits combined

## Accomplishments
- PIN-gated ad-hoc discount section (`ManagerPinDialog`, `requiredAction="apply_custom_discount"`) — expanding the discount toggle now always requires a successful manager PIN first; `pool_only`/`consumptions_only` discount-scope buttons are fully retired to a single "all" label.
- "Apply Promotion" `Select` on the payment screen — populated from `usePromotions()` filtered to currently-active promotions, hidden entirely when none are active, applies via `evaluateBestPromotion`'s own per-candidate formula with Math.max-on-discount semantics (never worsens an already-better-discounted line).
- Below-cost override retry: `BELOW_COST_REQUIRES_OVERRIDE` from any payment attempt (ad-hoc discount, an applied promotion, or their combination) surfaces the exact UI-SPEC copy and the same `ManagerPinDialog`; a successful PIN resubmits the SAME payment attempt (same idempotency key), not a new sale.
- Two new E2E specs proving PROMO-05 (apply-existing-vs-ad-hoc coexistence) and PROMO-07 (floor-guard block-then-override) end to end against a real checkout.
- **Deviation:** found and fixed a genuine pre-existing bug in `process_payment_atomic`/`process_split_payment_atomic` — the tab-closing "fully covered" check never accounted for an ad-hoc discount, so any real ad-hoc-discounted direct sale would authorize successfully but leave the tab permanently `open` (`DIRECT_SALE_PAYMENT_FAILED: Payment did not cover the sale total`). This was unreachable before Phase 27 (direct sale always rejected discounts with `DISCOUNT_UNSUPPORTED`); this plan's PIN-gating was the first code path that could ever exercise it with a real discount.

## Task Commits

Task 1 was committed in a prior (interrupted) session; Tasks 2-3 and the deviation fixes were committed this session:

1. **Task 1: PIN-gate the ad-hoc discount section + retire pool_only/consumptions_only** - `dab6da7` (feat, prior session)
2. **Task 2: "Apply Promotion" selector + below-cost override retry** - `0f513d2` (feat)
3. **Deviation: process_payment_atomic/process_split_payment_atomic tab-closing fix** - `4b8640d` (fix)
4. **Deviation: route existing discount E2E specs through the new manager-PIN gate** - `a5539b4` (fix)
5. **Task 3: E2E proof of PROMO-05 and PROMO-07** - `061d44f` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - PIN-gated discount toggle, retired scope buttons, "Apply Promotion" selector + `effectiveItems` re-evaluation, below-cost retry wiring
- `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` - PIN-gate cases, Apply Promotion selector cases, below-cost override retry case
- `src/shared/lib/payment-processor.ts` - `DiscountInfo.managerOverride: boolean` threaded through every payment-processor call site
- `src/features/checkout-sale/model/useCheckoutSale.ts` - `managerOverride` threaded into `callProcessDirectSale`
- `src/shared/lib/edge-function-contracts.ts` - `BELOW_COST_REQUIRES_OVERRIDE`/`DISCOUNT_REQUIRES_MANAGER` error mapping
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featOrders.json` - `applyPromotion.{label,placeholder}`, `belowCostOverride.message`
- `supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql` - fixes the tab-closing coverage check to account for `payments.discount_amount`
- `e2e/payments/apply-promotion-and-custom-discount.spec.ts` - (new) PROMO-05 E2E proof, 3 scenarios
- `e2e/errors/promotion-floor-guard.spec.ts` - (new) PROMO-07 E2E proof
- `e2e/payments/edge-cases.spec.ts`, `e2e/reports/discount-and-revenue.spec.ts` - updated to pass the new manager-PIN gate before asserting on discount fields (pre-existing specs broken by Task 1's PIN-gating change)

## Decisions Made
- The "Apply Promotion" selector's client-side price re-evaluation is a UX preview only — `process_direct_sale_atomic` always independently recomputes the actual best-price-wins promotion server-side, so whichever promotion the cashier picks (or doesn't pick at all, since the cart already live-displays the best price per PROMO-03), the charged amount is authoritative and identical either way.
- Fixed the tab-closing coverage-check bug in the shared `process_payment_atomic`/`process_split_payment_atomic` functions rather than working around it client-side, since it directly blocked this plan's stated success criteria and is squarely a Rule 1 (auto-fix bugs) case — the bug was invisible until this plan's own work first made the code path reachable with a real discount.
- E2E specs that need the ad-hoc-discount RPC path to actually complete a sale must log in as `manager` (not `cashier`) — the RPC's `apply_custom_discount` role re-check is keyed off the currently logged-in staff's own `p_staff_id`, not the staff whose PIN was entered into `ManagerPinDialog`. This matches every other manager-PIN-gated E2E spec already in this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `PaymentForm.test.tsx` lint error in the restored WIP (`import()` type annotation)**
- **Found during:** Task 2 (finishing the restored WIP)
- **Issue:** `npm run lint` failed on `@typescript-eslint/consistent-type-imports` — the WIP's `vi.mock('@entities/promotion', ...)` used an inline `typeof import('@entities/promotion')` annotation instead of the file's established pattern (a top-level `import type * as X` + `typeof X`, matching the existing `pos-printer` mock in the same file).
- **Fix:** Added `import type * as PromotionModule from '@entities/promotion'` and used `typeof PromotionModule`.
- **Files modified:** `src/widgets/PaymentModal/ui/PaymentForm.test.tsx`
- **Verification:** `npm run lint` clean; `npm run typecheck` and `npx vitest run` both still pass (35/35).
- **Committed in:** `0f513d2` (Task 2 commit)

**2. [Rule 1 - Bug] Existing E2E specs broken by Task 1's PIN-gating (pre-existing regression from this same plan's own change)**
- **Found during:** Task 3 (running the full plan `<verification>` before writing this SUMMARY)
- **Issue:** `e2e/payments/edge-cases.spec.ts` (PE4) and `e2e/reports/discount-and-revenue.spec.ts` (D3, D4) clicked the ad-hoc discount toggle and asserted the fields appeared immediately — a direct regression from Task 1's PIN gate (already committed in a prior session), which now requires a successful `ManagerPinDialog` first.
- **Fix:** Both specs updated to pass the manager-PIN gate (entering `E2E_MANAGER_PIN`) before asserting on the discount fields; extracted `expandDiscountSection()` helper in `discount-and-revenue.spec.ts`.
- **Files modified:** `e2e/payments/edge-cases.spec.ts`, `e2e/reports/discount-and-revenue.spec.ts`
- **Verification:** `npx playwright test e2e/reports/discount-and-revenue.spec.ts e2e/payments/edge-cases.spec.ts` — 6/6 pass.
- **Committed in:** `a5539b4`

**3. [Rule 1 - Bug] `process_payment_atomic`/`process_split_payment_atomic` never accounted for an ad-hoc discount when closing a tab**
- **Found during:** Task 3 (writing the D-10 coexistence E2E case — a real ad-hoc-discounted direct sale never reached `paid` status, failing with `DIRECT_SALE_PAYMENT_FAILED: Payment did not cover the sale total`)
- **Issue:** Both RPCs compare `v_paid_line` (the actually-charged, POST-discount amount) against `v_owed` (`SUM(order_items.unit_price * quantity)`, which only ever reflects a promotion discount baked into `unit_price` at insert time — never an ad-hoc discount, which is tracked exclusively on `payments.discount_amount`). Before Phase 27, `process_direct_sale_atomic` hard-rejected any ad-hoc discount with `DISCOUNT_UNSUPPORTED`, so this branch was never reachable from a direct sale; this plan's PIN-gating was the first path that could actually submit one.
- **Fix:** Added a migration (`20260902000001_close_tab_accounts_for_adhoc_discount.sql`) that sums `payments.discount_amount` alongside `payments.amount` and adds it back before the "fully covered" comparison — `paid + discount >= raw item subtotal`.
- **Files modified:** `supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql` (new)
- **Verification:** Applied to the local self-hosted Supabase stack via `docker exec ... psql -U supabase_admin` (the function owner). Re-ran `src/entities/promotion/model/promotion-rpc.integration.test.ts` (3/3), `src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts`, `src/entities/payment/model/split-payment-rpc.integration.test.ts`, `src/features/reopen-tab/model/reopen-tab-rpc.integration.test.ts` (23/23 combined) — no regressions from the shared-function edit. All 4 new E2E tests across both new spec files now pass.
- **Committed in:** `4b8640d`

---

**Total deviations:** 3 auto-fixed (2 bugs directly caused by this plan's own Task 1 change, 1 lint fix in the restored WIP)
**Impact on plan:** All three were necessary to make the plan's stated success criteria ("ad-hoc discount ... functional on a direct sale for the first time") actually true, and to keep the existing E2E suite green. No scope creep — the RPC fix is scoped to exactly the two functions that share the broken tab-closing check this plan's own new code path first exercised with a real discount.

## Issues Encountered
- The `npx supabase migration list --local` / `db push` tooling in this environment reports migration status against a linked cloud project's "remote" column, not the running local self-hosted stack — matching the pattern already documented in 27-01-SUMMARY.md, the new migration was applied directly via `docker exec supabase_db_supermarket-pos-selfhosted psql -U supabase_admin -d postgres` (the function owner; the default `postgres` role lacked `must be owner of function` privileges).
- A shared working tree hazard was flagged at dispatch (a concurrent phase-26 session on the same checkout) — confirmed `git branch --show-current` reported `main` before every commit in this session; no cross-branch contamination occurred.

## User Setup Required
None - no external service configuration required. The new migration was applied and verified against the local self-hosted Supabase stack.

## Next Phase Readiness
- Plans 05-07 can build on a fully-functional payment-screen discount UI: PIN-gated ad-hoc discount, "Apply Promotion" selector, and the below-cost override retry flow are all proven against real checkouts, not mocks.
- The `process_payment_atomic`/`process_split_payment_atomic` tab-closing fix is a general correctness fix (not Phase-27-specific) — any future plan touching ad-hoc discounts on the tab-based (non-direct-sale) payment flow benefits from it too.
- No blockers for the next plan in this phase.

---
*Phase: 27-promotions-discount-management*
*Completed: 2026-09-02*

## Self-Check: PASSED

All 4 created/output files verified present on disk (`e2e/payments/apply-promotion-and-custom-discount.spec.ts`, `e2e/errors/promotion-floor-guard.spec.ts`, `supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql`, this SUMMARY.md). All 5 commit hashes (`dab6da7`, `0f513d2`, `4b8640d`, `a5539b4`, `061d44f`) verified present in git history.
