---
phase: 02-core-direct-sale-checkout
plan: 08
subsystem: checkout
tags: [react, zustand, playwright, vitest, i18next, supabase]

# Dependency graph
requires:
  - phase: 02-core-direct-sale-checkout
    provides: "Direct-sale checkout screen, scanner/weight-entry wiring, and process_direct_sale_atomic's tax-inclusive authoritative total (Plans 02-01..02-06)"
provides:
  - "Checkout-state-derived scanner gate: useScanBarcodeToCart is disabled during payment/receipt UI and either weight-entry dialog, and re-enabled only on the ordinary cart screen"
  - "Async-lookup race guard: a barcode lookup that started while scanning was enabled discards its result (no cart-add, no weight-entry-open) if scanning was disabled before it resolved"
  - "Barcode cache-miss fallback filters is_active=true, so a deactivated product's barcode is treated as unmatched"
  - "Repaired e2e/52 loose-weight full UI flow (unambiguous decimal-key locator) and its direct-RPC gram-decrement proof extended to stock_movements"
affects: [checkout, inventory, e2e-suite]

# Actuals (#2632)
actuals:
  tokens: 6850
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive a hook's `enabled` flag from every modal/overlay state that owns the register, not just the primary one, so a background async effect (barcode lookup) can't act after its triggering UI is no longer current"
    - "Track a prop's live value in a ref (updated via useEffect) so an in-flight async callback can re-check current state at resolution time instead of acting on the stale value captured at call time"

key-files:
  created:
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx
    - src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts
  modified:
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts
    - src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts
    - e2e/51-barcode-scan-search.spec.ts
    - e2e/52-loose-weight-hold-sale.spec.ts

key-decisions:
  - "Kept useScanBarcodeToCart mounted at all times and gated it purely via its `enabled` argument (never unmounted/remounted), so the hook's own async-lookup guard is the single source of truth for discarding stale results — no separate queueing mechanism was introduced."
  - "Left WeightEntryDialog's missing common:actions.back translation key untouched (out of files_modified scope); fixed the ambiguous e2e/52 decimal-key locator with `exact: true` instead, per the plan's explicit instruction to leave the back-button control alone."
  - "Duplicated e2e/50's getTaxRatePercent/computeAuthoritativeTotal helpers locally in e2e/52 rather than extracting a shared e2e/helpers module, since e2e/helpers/supabase.ts was outside this plan's files_modified and touching it risked colliding with the concurrent 02-07 agent's work on the same shared file set."

patterns-established:
  - "Scanner-safe modal gating: any future checkout modal/dialog must be added to CheckoutPanel's scannerEnabled predicate, or scans during it will silently mutate a cart that UI expects to be frozen."

requirements-completed: [CHK-01, CHK-05]

coverage:
  - id: D1
    description: "A scan received while payment, the completed-sale receipt, or either weight-entry dialog is active cannot add to a cart that is about to clear"
    requirement: "CHK-01"
    verification:
      - kind: unit
        ref: "src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx#ignores a scanner burst while payment/receipt UI is active (CHK-01)"
        status: pass
      - kind: unit
        ref: "src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx#ignores a scanner burst while the weight-entry dialog is open"
        status: pass
      - kind: unit
        ref: "src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx#restores ordinary scanning once payment is cancelled back to the cart screen"
        status: pass
      - kind: unit
        ref: "src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts#discards a lookup that resolves after checkout disables scanning mid-flight"
        status: pass
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts#a scan during the receipt screen is discarded and does not enter the next sale (CHK-01)"
        status: pass
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts#a scan while the weight-entry dialog is open is discarded and does not open a second dialog"
        status: pass
    human_judgment: false
  - id: D2
    description: "A barcode cache miss returns only an active catalogue product; an inactive product's barcode is treated as unmatched"
    requirement: "CHK-01"
    verification:
      - kind: e2e
        ref: "e2e/51-barcode-scan-search.spec.ts#an inactive product barcode is treated as unmatched, not sold (WR-01, T-02-08-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The complete loose-weight add/edit/pay browser flow is runnable through an unambiguous decimal-key selector, and reaches its exact 10,000-to-5,490-gram inventory assertion"
    requirement: "CHK-05"
    verification:
      - kind: e2e
        ref: "e2e/52-loose-weight-hold-sale.spec.ts#adds distinct weighted lines and edits one before checkout"
        status: pass
    human_judgment: false
  - id: D4
    description: "A paid loose-weight sale persists integer grams and decrements weighted inventory and its stock-movement record by those exact grams (375g sold, 1000g→625g, stock_movements.quantity_delta=-375)"
    requirement: "CHK-05"
    verification:
      - kind: e2e
        ref: "e2e/52-loose-weight-hold-sale.spec.ts#decrements and restores inventory by the exact grams sold"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-12
status: complete
---

# Phase 2 Plan 08: Checkout-State Scanner Gate and Loose-Weight Regression Repair Summary

**CheckoutPanel now derives the barcode scanner's `enabled` flag from payment/receipt and weight-dialog state (with an async-lookup race guard in the hook itself), the barcode cache-miss fallback filters `is_active=true`, and the previously-unrunnable loose-weight E2E flow is repaired and extended to prove the exact-gram stock-movement contract.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-08-12T21:10:00-06:00 (approx.)
- **Completed:** 2026-08-12T21:59:12-06:00
- **Tasks:** 2 (1 tracer + tracer feedback gate, 1 auto)
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- Closed CR-04/T-02-08-01: `CheckoutPanel` now computes `scannerEnabled = !paymentOpen && !weightEntry.isOpen && editingWeightItemId === null` and passes it to `useScanBarcodeToCart`, instead of the previous unconditional `true`. A scan while payment/receipt UI or either weight dialog is active is fully ignored (the underlying `useBarcodeScanner` keydown listener is detached, so the lookup never even starts).
- Closed the async-lookup race: `useScanBarcodeToCart` now tracks `enabled` in a ref, and `handleScan` re-checks that ref after its `await lookup(code)` resolves — a lookup that started while scanning was enabled discards its result (no `addItem`/`onWeightedProduct` call, no toast, no audit) if scanning was disabled before it resolved.
- Closed WR-01/T-02-08-02: `useLookupProductByBarcode`'s cache-miss fallback query now filters `.eq('is_active', true)`, so a deactivated product's barcode is treated as unmatched rather than still being sellable.
- Repaired the regression blocking `e2e/52-loose-weight-hold-sale.spec.ts`'s primary UI flow: `getByRole('button', { name: '.' })` ambiguously matched both the keypad decimal key and the back button (whose aria-label falls back to its untranslated i18n key `actions.back`, which itself contains a "."). Switched to `{ name: '.', exact: true }`; the back button itself is untouched, per the plan's instruction.
- Updated `e2e/52`'s `directSaleInput()` helper to tender the tax-inclusive authoritative total (mirroring `e2e/50`'s helper and 02-06's `process_direct_sale_atomic` contract) instead of the pre-tax line price, which the RPC now rejects with `AMOUNT_MISMATCH`.
- Extended the direct-RPC gram-decrement test with a `stock_movements.quantity_delta = -375` assertion, proving the trigger writes the same integer grams it subtracted from inventory with no stock-unit conversion or rounding.
- Added 5 new Playwright regressions (2 in `e2e/51`, none removed) and 2 new Vitest files (`CheckoutPanel.test.tsx`, `useScanBarcodeToCart.test.ts`) covering the modal-derived gate, normal-state re-enable, and the async-disable race.

## Task Commits

1. **Task 1: Gate one receipt-screen scanner attempt before cart completion** - `f693ce9` (feat) + `3f512ef` (test, added after running the tracer's e2e verify)
2. **Task 2: Make weighted checkout and cache-miss catalogue filtering deterministic** - `902d177` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` - Derives `scannerEnabled` from payment/receipt and weight-dialog state; passes it to `useScanBarcodeToCart` instead of unconditional `true`
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` (new) - Vitest coverage for the modal-derived scanner gate and normal-state re-enable
- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` - Tracks `enabled` in a ref and re-checks it after the async lookup resolves, discarding stale results
- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts` (new) - Vitest coverage for the pending-lookup-after-disable race
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` - Cache-miss fallback query now filters `is_active = true`
- `e2e/51-barcode-scan-search.spec.ts` - Adds receipt-state and weight-dialog scanner-race regressions plus the inactive-barcode cache-miss regression
- `e2e/52-loose-weight-hold-sale.spec.ts` - Fixes the ambiguous decimal-key locator, updates `directSaleInput()` to the tax-inclusive authoritative total, and adds the `stock_movements` gram-exactness assertion

## Decisions Made

- Kept `useScanBarcodeToCart` mounted at all times, gated purely via its `enabled` argument (never conditionally unmounted), so the hook's own async-lookup guard is the single source of truth for discarding stale in-flight results — no separate queueing mechanism was introduced, matching the plan's explicit instruction not to queue scans.
- Left `WeightEntryDialog`'s missing `common:actions.back` translation key untouched (it is not in this plan's `files_modified`); fixed the ambiguous locator on the test side with `exact: true` instead, per the plan's instruction to leave the back-button control alone.
- Duplicated `e2e/50`'s `getTaxRatePercent`/`computeAuthoritativeTotal` helpers locally in `e2e/52` rather than extracting a shared `e2e/helpers` module, since `e2e/helpers/supabase.ts` was outside this plan's `files_modified` and touching it risked colliding with the concurrent 02-07 agent's work on the same file.

## Deviations from Plan

None - plan executed exactly as written. Task 1's Playwright e2e/51 additions were committed as a small follow-up commit (`3f512ef`) after the initial feat commit (`f693ce9`) rather than in the same commit, because the tracer's own `<verify>` requires running the e2e suite after the code change; this is a task-boundary sequencing choice, not a deviation from what was built.

## Issues Encountered

- **Transient typecheck noise from the concurrent 02-07 agent.** `npm run typecheck` intermittently reported a `Property 'receipts' does not exist` error in `src/features/checkout-sale/model/useCheckoutSale.ts` — a file explicitly out of this plan's scope, mid-edit by the concurrent 02-07 agent (`src/shared/lib/edge-function-contracts.ts` was simultaneously modified, unstaged, throughout this plan's execution). Confirmed the error was isolated to that one file and resolved itself once 02-07 finished its own edit; no fix was made here.
- **Pre-existing, out-of-scope flake noticed while running the full `e2e/52` file.** `holds, resumes, and discards one in-memory sale while another sale completes` intermittently fails with a Playwright strict-mode violation (`getByText('Budweiser')` resolving to both the still-visible ProductGrid card and the newly-resumed cart line). This test is not named in Task 2's `<verify>` filter and was not touched by this plan; flagged here for a future pass, not fixed (out of scope, and touching it risked overlapping with PaymentForm.tsx/timing changes owned by the concurrent 02-07 agent).
- **e2e/lint scope note:** `npm run lint` (`eslint src`) and `npm run typecheck` (`tsc` against `tsconfig.json`, which only includes `src`/`scripts`) do not cover `e2e/**` at all — confirmed by running `npx eslint` directly against the two touched spec files, which surfaced many pre-existing typed-lint findings unrelated to this plan's diff (missing type info because `tsconfig.json` doesn't include `e2e/`). The plan's own `<verify>` commands (`npm run lint`, `npm run typecheck`) both pass as specified; this is a pre-existing project-wide gap in e2e lint/type coverage, not something this plan introduced or was asked to close.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CHK-01 (barcode-to-cart, including the receipt/weight-dialog race and inactive-product fallback) and CHK-05 (loose-weight checkout, including its previously-unrunnable primary E2E and the exact-gram stock-movement contract) are both closed for this phase's gap-closure scope.
- CHK-03/CHK-04 (financial authority, replay authorization, split-receipt truthfulness) remain owned by the concurrent 02-07 plan and are not addressed here.
- The `holds, resumes, and discards one in-memory sale while another sale completes` intermittent strict-mode flake in `e2e/52` (see Issues Encountered) is unresolved and should be picked up in a future pass once 02-07's concurrent PaymentForm.tsx/timing changes have landed.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-12*

## Self-Check: PASSED
