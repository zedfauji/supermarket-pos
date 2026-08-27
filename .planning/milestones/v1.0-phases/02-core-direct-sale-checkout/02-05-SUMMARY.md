---
phase: 02-core-direct-sale-checkout
plan: 05
subsystem: checkout
tags: [react, zustand, playwright, receipts, barcode]
requires:
  - phase: 02-core-direct-sale-checkout
    provides: Direct-sale payment guards and checkout flows
provides:
  - Payment cancellation that preserves an unpaid cart
  - Shared weight entry for product-grid and barcode selection
  - Lossless held-cart resume and weighted thermal receipt labels
affects: [checkout, barcode-scanning, receipts, cart-state]
actuals:
  tokens: 7197
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns:
    - Separate non-destructive modal close callbacks from confirmed-success callbacks
    - Reuse one lifted feature hook when independent UI paths share dialog state
key-files:
  created: []
  modified:
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts
    - src/entities/tab/model/cartStore.ts
    - src/shared/lib/receipt-format.ts
    - supabase/functions/process-direct-sale/index.ts
key-decisions:
  - "Cancel only closes the payment form; receipt Done owns direct-sale completion and cart clearing."
  - "Resume swaps non-empty active and held carts so neither in-progress sale is discarded."
patterns-established:
  - "Direct-sale receipts carry optional weightGrams from the edge function through the shared receipt contract."
requirements-completed: [CHK-01, CHK-02, CHK-05]
coverage:
  - id: D1
    description: Payment cancellation preserves the cart while receipt Done completes the sale.
    requirement: CHK-01
    verification:
      - kind: unit
        ref: src/widgets/PaymentModal/ui/PaymentForm.test.tsx
        status: pass
      - kind: e2e
        ref: e2e/50-direct-sale-checkout.spec.ts#cancelling before payment preserves the cart
        status: pass
    human_judgment: false
  - id: D2
    description: Barcode scans route sold-by-weight products to weight entry without creating a unit cart line.
    requirement: CHK-02
    verification:
      - kind: e2e
        ref: e2e/51-barcode-scan-search.spec.ts#scan of a loose-weight product opens weight entry instead of an unpayable line
        status: pass
    human_judgment: false
  - id: D3
    description: Held carts swap safely and direct-sale receipt lines show kilograms.
    requirement: CHK-05
    verification:
      - kind: unit
        ref: src/entities/tab/model/cartStore.test.ts and src/shared/lib/receipt-format.test.ts
        status: pass
      - kind: e2e
        ref: e2e/52-loose-weight-hold-sale.spec.ts#resuming a held sale swaps instead of discarding a new active cart
        status: pass
    human_judgment: false
duration: 12m
completed: 2026-08-12
status: complete
---

# Phase 02 Plan 05: Checkout safety closure Summary

**Direct-sale checkout now preserves cancelled carts, routes weighed barcode items through weight entry, swaps held carts safely, and prints kilograms on receipts.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-12T20:10:00Z
- **Completed:** 2026-08-12T20:22:17Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments

- Split PaymentForm Cancel from successful receipt Done, then localized all Phase-02 checkout literals so `npm run lint` is clean.
- Lifted the existing loose-weight state to CheckoutPanel, allowing product-grid and barcode paths to open the same dialog.
- Made held-sale resume a lossless swap and propagated grams into direct-sale thermal receipt labels.

## Task Commits

1. **Task 1: Separate Cancel from post-payment Done and fix lint** - `496f631` (test), `2b20fd1` (fix)
2. **Task 2: Route scanned sold-by-weight products through shared weight entry** - `a4de182` (test), `8232e3f` (fix)
3. **Task 3: Swap held carts and render weighted receipt lines** - `2260cf9` (test), `af8b024` (fix), `5f106e4` (test setup)

## Files Created/Modified

- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - Separates Cancel from receipt completion.
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` - Preserves cancelled carts and owns shared weight-entry state.
- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` - Opens weight entry for weighed products.
- `src/entities/tab/model/cartStore.ts` - Atomically swaps active and held carts.
- `src/shared/lib/receipt-format.ts` - Renders weighted lines as kilograms.
- `supabase/functions/process-direct-sale/index.ts` - Includes `weight_grams` in receipt data.

## Decisions Made

- Receipt Done falls back to `onClose` for existing PaymentModal and PaymentPane callers, avoiding a breaking contract change.
- The barcode E2E assigns and removes an isolated barcode because the development seed intentionally has no barcode values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking test fixture] Isolated barcode and shift setup for checkout E2E.**
- **Found during:** Tasks 2 and 3 verification
- **Issue:** Seed products had no barcode and `resetTestState()` closes every shift, preventing the direct RPC cases from reaching assertions.
- **Fix:** Tests assign a temporary barcode and create one cashier shift per loose-weight scenario, then reset the fixture state.
- **Files modified:** `e2e/51-barcode-scan-search.spec.ts`, `e2e/52-loose-weight-hold-sale.spec.ts`
- **Verification:** Targeted barcode and held-cart E2E tests pass.
- **Committed in:** `a4de182`, `5f106e4`

**2. [Rule 1 - Test bug] Updated stale card-payment call assertions.**
- **Found during:** Task 1 RED verification
- **Issue:** Existing assertions omitted the idempotency-key argument introduced by Plan 02-04.
- **Fix:** Assert the technical key is a string while retaining the payment amount checks.
- **Files modified:** `src/widgets/PaymentModal/ui/PaymentForm.test.tsx`
- **Verification:** PaymentForm unit suite passes all 22 tests.
- **Committed in:** `496f631`

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 1), both limited to reliable regression coverage.

## Issues Encountered

- The full combined Playwright command reached the Phase-02 tests but later `e2e/52` UI cases intermittently lost the Vite web server (`ERR_CONNECTION_REFUSED`). Fresh targeted runs for this plan's new cancellation, barcode, and cart-swap tests passed. This is test-runner infrastructure behavior, not an application assertion failure.

## User Setup Required

None.

## Next Phase Readiness

The remaining checkout blockers from verification are closed with focused automated coverage.

## TDD Gate Compliance

Passed: each behavior change was introduced with a failing regression test before its implementation commit.

## Known Stubs

None.

## Self-Check: PASSED

Confirmed all task commits and the changed checkout, scanner, cart, receipt, and E2E files exist.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-12*
