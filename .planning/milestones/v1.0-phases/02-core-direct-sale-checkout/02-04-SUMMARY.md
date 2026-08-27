---
phase: 02-core-direct-sale-checkout
plan: 04
subsystem: checkout
tags: [supabase, postgres, payments, playwright, security]
requires:
  - phase: 02-core-direct-sale-checkout
    provides: Direct-sale checkout UI and the atomic direct-sale RPC
provides:
  - Direct-sale completion only after a paid tab is persisted
  - Open Caja and caller-owned open-shift validation at the SQL trust boundary
  - End-to-end payment amount and adversarial direct-sale coverage
affects: [checkout, caja, payment-reporting, inventory]
actuals:
  tokens: 3501
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - Direct-sale RPCs validate client-controlled attribution before any write
    - Direct-sale success requires the nested payment RPC to close the tab as paid
key-files:
  created:
    - supabase/migrations/20260815000001_direct_sale_atomic_paid_and_shift_guard.sql
  modified:
    - src/shared/lib/edge-function-contracts.ts
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - e2e/50-direct-sale-checkout.spec.ts
key-decisions:
  - "A direct sale treats an open tab after payment as a failed transaction and rolls back all writes."
  - "Payment requests must use the tax-inclusive total displayed to the cashier."
patterns-established:
  - "Service-role direct-sale RPCs lock and verify Caja/shift ownership before inserting sale records."
requirements-completed: [CHK-03, CHK-04]
coverage:
  - id: D1
    description: Direct sales reject partial payments and invalid Caja or shift attribution without rows surviving.
    requirement: CHK-03
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: Cash checkout records one paid tab, one order, and the displayed tax-inclusive payment amount.
    requirement: CHK-04
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#cash payment creates one paid sale and decrements stock"
        status: pass
    human_judgment: false
duration: 10m
completed: 2026-08-12
status: complete
---

# Phase 02 Plan 04: Direct-sale payment guards Summary

**Atomic direct sales now require a fully paid tab, an open Caja, and the authenticated cashier's open shift.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-12T19:51:13Z
- **Completed:** 2026-08-12T20:01:40Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Verified the restored local Supabase Auth and REST services before running the checkout suite.
- Added SQL guards that reject closed Caja sessions, unrelated/closed shifts, and incomplete direct-sale payments before a sale can succeed.
- Strengthened direct-sale E2E coverage with paid-tab, payment amount, zero/partial payment, Caja, and shift assertions.

## Task Commits

1. **Task 1: Restore local Supabase stack** - no repository commit; the user-restored stack passed Auth/REST health checks.
2. **Task 2: Require paid status and validated Caja/shift** - `b2e6a7a` (test), `f91b262` (fix)
3. **Task 3: Strengthen direct-sale E2E assertions** - `b2e6a7a` (test), `d240bd1` (fix)

## Files Created/Modified

- `supabase/migrations/20260815000001_direct_sale_atomic_paid_and_shift_guard.sql` - Locks and validates attribution, then requires the tab to be paid before success.
- `src/shared/lib/edge-function-contracts.ts` - Maps Caja/shift RPC failures to application errors.
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - Sends the displayed tax-inclusive cash/card amount to payment processors.
- `e2e/50-direct-sale-checkout.spec.ts` - Verifies persisted sale records and adversarial direct-RPC outcomes.

## Decisions Made

- Direct-sale underpayment is rejected by testing the authoritative persisted tab state after the nested payment procedure; the exception rolls all new sale records back.
- Caja and shift checks stay in the security-definer RPC because the Edge Function passes untrusted IDs through a service-role client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical coverage] Added a partial-payment regression case.**
- **Found during:** Task 2 verification
- **Issue:** The planned zero-amount case already failed in the nested payment procedure and did not expose the actual partial-payment success path.
- **Fix:** Added a `$1` partial-payment assertion that failed before the migration and proves no payment/tab rows survive afterward.
- **Files modified:** `e2e/50-direct-sale-checkout.spec.ts`
- **Verification:** Red test returned `ok: true`; it passes after the migration.
- **Committed in:** `b2e6a7a`

**2. [Rule 1 - Bug] Charged the displayed tax-inclusive amount.**
- **Found during:** Task 3 verification
- **Issue:** The receipt displayed 16% tax but cash/card processors were sent the pre-tax amount, leaving persisted payments below the displayed total.
- **Fix:** Passed `subtotalWithTax` to both cash and non-overridden card payment processors.
- **Files modified:** `src/widgets/PaymentModal/ui/PaymentForm.tsx`
- **Verification:** Strengthened cash E2E assertion now confirms the persisted payment amount is within $0.02 of the tax-inclusive total.
- **Committed in:** `d240bd1`

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 1). Both are necessary for meaningful payment safety coverage and correct cashier charges.

## Issues Encountered

- `npx eslint` on touched TypeScript files still reports three pre-existing `i18next/no-literal-string` errors in unchanged `PaymentForm` idempotency-key namespace lines. They are recorded in `deferred-items.md`.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

Checkout now has a live local E2E proof for direct-sale payment completion and attribution guards.

## TDD Gate Compliance

Passed: `b2e6a7a` demonstrated partial-payment failure before `f91b262` applied the guard.

## Self-Check: PASSED

Confirmed the migration, client contract, payment form, E2E spec, summary, and all three task commits exist.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-12*
