---
phase: 02-core-direct-sale-checkout
plan: 07
subsystem: payments
tags: [supabase-edge-functions, deno, zod, react, playwright, receipts]

# Dependency graph
requires:
  - phase: 02-core-direct-sale-checkout
    provides: "process_direct_sale_atomic authoritative totals + staff/shift/Caja-scoped idempotency replay (Plan 02-06)"
provides:
  - "buildSaleReceipt: one authorized, sale-level receipt for both single-tender and split direct sales, filtered by the authenticated staff/shift/Caja identity"
  - "ReceiptData.tenders — every payment leg's method/amount/tip/tendered/change/terminal-reference, replacing the per-leg receipts array"
  - "PaymentForm renders and prints a split sale's single sale-level receipt once, with per-leg tender lines on the printed/previewed receipt text"
affects: [checkout, payments, receipts, reports]

# Actuals (#2632)
actuals:
  tokens: 8500
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sale-level receipt composition: build the basket once from order_items and aggregate every payments row for the tab into one receipt object (tenders[]), rather than building one receipt per payment leg"
    - "Defense-in-depth receipt authorization: filter every service-role receipt read by the authenticated staff/shift/Caja identity in addition to the RPC's own pre-lookup authorization, so a future RPC-boundary regression cannot alone leak another cashier's receipt"

key-files:
  created: []
  modified:
    - supabase/functions/process-direct-sale/index.ts
    - src/shared/lib/edge-function-contracts.ts
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/shared/lib/receipt-format.ts
    - e2e/50-direct-sale-checkout.spec.ts
    - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
    - src/shared/lib/receipt-format.test.ts

key-decisions:
  - "Kept PaymentProcessors.processSplitPayment's return shape as `receipts: ReceiptData[]` (unchanged) rather than switching to a single ReceiptData, since PaymentForm.tsx is shared with the untouched generic tab split-payment path (payment-processor.ts / process-split-payment edge function), which by design (D-09) still returns one receipt per leg. useCheckoutSale's direct-sale adapter now wraps the edge function's single receiptData as a one-element array so the shared type contract never had to change."
  - "PaymentForm only ever displays/navigates the first receipt in that array (receipts[0]) — always the single truthful receipt for a direct sale — while the background print loop still iterates the full array, so the generic multi-leg tab path's existing print-every-leg behavior is unaffected even though its on-screen 'Receipt N of M' navigation was removed."
  - "receiptNumber is now derived from tabId (not paymentId), since a single receipt can now represent multiple payment rows."
  - "tenders[] is always populated (length 1 for an ordinary single-tender sale), and receipt-format.ts only switches to the per-leg-line rendering when tenders.length > 1 — a single-tender receipt's printed text is byte-for-byte unchanged from before this plan."

patterns-established:
  - "A component-level 'first item of an array' is preferred over adding an alternate single-value field to a shared processor contract, when the field is otherwise structurally identical to what other, untouched callers of the same contract still produce."

requirements-completed: [CHK-03, CHK-04]

coverage:
  - id: D1
    description: "process-direct-sale composes one sale-level receipt (basket once, every persisted payment leg in receiptData.tenders) for both single-tender and split direct sales"
    requirement: "CHK-04"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#split payment returns one truthful sale-level receipt with the basket once and every tender leg"
        status: pass
      - kind: unit
        ref: "src/widgets/PaymentModal/ui/PaymentForm.test.tsx#submit calls processSplitPayment with legs summing to subtotalWithTax; renders the single sale-level receipt once; Done reaches onClose"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every service-role receipt read in buildSaleReceipt is filtered by the authenticated staff/shift/Caja identity (defense-in-depth beyond the RPC's own pre-lookup authorization)"
    requirement: "CHK-03"
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#original-cashier replay through the edge function returns the same sale-level receipt with no new payment"
        status: pass
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#cross-cashier replay through the edge function is rejected without leaking receipt data"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildThermalReceiptText renders one concise line per tender leg for a split sale instead of repeating the basket/subtotal/total, while a single-tender receipt's rendering is unchanged"
    requirement: "CHK-04"
    verification:
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#renders one line per tender leg for a split sale, without repeating the single-payment line"
        status: pass
      - kind: unit
        ref: "src/shared/lib/receipt-format.test.ts#falls back to the single-payment line when only one tender leg is present"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-08-13
status: complete
---

# Phase 2 Plan 07: Authorized Sale-Level Receipt for Direct and Split-Tender Sales Summary

**`process-direct-sale`'s edge function now composes one authorized, staff/shift/Caja-filtered sale-level receipt (basket once, every payment leg in `receiptData.tenders`) for both single-tender and split direct sales, and PaymentForm shows/prints that one receipt instead of a per-leg "Receipt N of M" queue.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-08-13T03:35:00Z
- **Completed:** 2026-08-13T04:03:40Z
- **Tasks:** 2
- **Files modified:** 8 (6 in plan scope + 2 test files added per the plan's own task-level file lists and `<verify>` commands — see Deviations)

## Accomplishments

- Closed CR-03: `process-direct-sale/index.ts`'s `buildReceipt` (one call per payment leg, each repeating the *entire* basket while showing only that leg's amount as "total") is replaced by `buildSaleReceipt` — one call per sale, composing the basket once from `order_items` and aggregating every persisted `payments` row for the tab into a `tenders[]` array (method, amount, tip, tendered amount, change, terminal reference). A two-leg split sale now shows one basket and both legs summing to the paid total, verified end-to-end via the actual edge function HTTP response.
- Closed the remaining piece of T-02-07-01 (receipt disclosure): every service-role read inside `buildSaleReceipt` is additionally filtered by the authenticated staff/shift/Caja identity (`.eq('staff_id', ...).eq('shift_id', ...).eq('caja_session_id', ...)`), so a future regression at the RPC authorization boundary (Plan 02-06) cannot alone leak another cashier's receipt data through this service-role read. Verified directly against the deployed edge function: an original-cashier idempotency replay returns the same receipt with no new payment row, and a cross-cashier replay attempt is rejected (400+) with no `tabId`/`paymentId`/`receiptData` in the response body.
- `edge-function-contracts.ts`: added `ReceiptTenderSchema` and `ReceiptData.tenders` (optional array); dropped `ProcessDirectSaleSuccessSchema`'s old per-leg `receipts` array — direct-sale success responses now always carry one `receiptData`.
- `useCheckoutSale.ts`'s `processSplitPayment` adapter now reads the edge function's single `receiptData` and wraps it as a one-element `receipts` array, so `PaymentForm`'s shared `PaymentProcessors` type contract (also used by the untouched, generic tab split-payment path) never had to change shape.
- `PaymentForm.tsx`: removed the `receiptQueue`/`receiptIndex` state and the "Receipt N of M" navigation UI. A split payment now renders through the exact same `step === 'receipt' && receiptData` branch as a normal cash/card payment, displaying `receipts[0]`. The background print loop still iterates the full `receipts` array, so the untouched generic tab split-payment path's existing "print every leg" hardware behavior is unaffected.
- `receipt-format.ts`: `buildThermalReceiptText` now renders one line per tender leg (method + amount, plus tendered/change/terminal-reference where applicable) when `receipt.tenders.length > 1`; a single-tender receipt's rendering is byte-for-byte unchanged (falls back to the pre-existing `paymentMethod`/`tenderedAmount`/`changeAmount`/`terminalReference` line).

## Task Commits

1. **Task 1: Return a cashier-scoped sale receipt with all split tender legs** - `611cbbd` (feat)
2. **Task 2: Display and print the sale receipt once** - `45efe02` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `supabase/functions/process-direct-sale/index.ts` - `buildSaleReceipt` replaces `buildReceipt`; one sale-level receipt composed from all persisted order_items + payments, filtered by staff/shift/Caja
- `src/shared/lib/edge-function-contracts.ts` - `ReceiptTenderSchema`/`ReceiptData.tenders`; `ProcessDirectSaleSuccessSchema` drops the per-leg `receipts` array
- `src/features/checkout-sale/model/useCheckoutSale.ts` - `processSplitPayment` reads `receiptData` and wraps it as a one-element `receipts` array
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - removes receipt queue/index state; split payment renders through the single-receipt path
- `src/shared/lib/receipt-format.ts` - per-tender-leg line rendering when more than one tender is present
- `e2e/50-direct-sale-checkout.spec.ts` - adds original-cashier replay, cross-cashier replay denial, and split-truthful-receipt Edge Function-level checks
- `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` - updates the split-mode test for the single-receipt flow (no more "Receipt N of M")
- `src/shared/lib/receipt-format.test.ts` - adds tender-leg rendering coverage (multi-leg branch + single-leg fallback)

## Decisions Made

- Kept `PaymentProcessors.processSplitPayment`'s return shape (`receipts: ReceiptData[]`) unchanged rather than introducing a new single-`receiptData` variant, since `PaymentForm.tsx` is shared with the untouched generic tab split-payment path (`payment-processor.ts` / `process-split-payment` edge function), which by design (D-09) still returns one receipt per leg. `useCheckoutSale`'s direct-sale adapter wraps the edge function's single `receiptData` as a one-element array to satisfy that shared contract.
- `PaymentForm` only ever displays the first receipt in that array; the background print loop still iterates the full array, so a genuinely multi-leg *generic tab* split payment (out of this plan's scope) still gets every leg printed even though its on-screen "Receipt N of M" navigation is gone.
- `receiptNumber` now derives from `tabId` rather than `paymentId`, since one receipt can represent multiple payment rows.
- `tenders[]` is always populated (length 1 for an ordinary sale); `receipt-format.ts` only switches rendering when `tenders.length > 1`, so a single-tender receipt's printed text is unchanged from before this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated `PaymentForm.test.tsx` and added `receipt-format.test.ts` coverage, though neither file is in the plan's top-level `files_modified` list**
- **Found during:** Task 2
- **Issue:** The plan's rolled-up `files_modified` frontmatter omits `src/widgets/PaymentModal/ui/PaymentForm.test.tsx`, but Task 2's own `<files>` element explicitly lists it, and its `<verify>` command (`npx vitest run .../PaymentForm.test.tsx src/shared/lib/receipt-format.test.ts`) requires both test files to pass. Removing the "Receipt N of M" queue UI directly breaks the pre-existing `PaymentForm.test.tsx` test that asserted on that exact text.
- **Fix:** Updated the existing split-mode receipt test to assert the new single-receipt behavior instead of the removed queue; added two new `receipt-format.test.ts` cases (multi-leg tender-line rendering + single-leg fallback) to give the new branch in `receipt-format.ts` at least one runnable check, since it introduces new money-adjacent formatting logic.
- **Files modified:** `src/widgets/PaymentModal/ui/PaymentForm.test.tsx`, `src/shared/lib/receipt-format.test.ts`
- **Verification:** `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx src/shared/lib/receipt-format.test.ts` — 54/54 pass.
- **Committed in:** `45efe02` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — required to keep the plan's own `<verify>` command green; scoped entirely to test files, no production behavior change beyond what Task 2 already specified)
**Impact on plan:** No scope creep — both files were named by Task 2's own `<files>`/`<verify>` elements even though the plan-level `files_modified` rollup missed them. Neither touches any file claimed by the concurrently-running 02-08 agent.

## Issues Encountered

- **Transient e2e flakiness from the concurrently-running 02-08 agent sharing the same live Supabase stack and dev server.** Two of the new e2e tests (cross-cashier replay, split truthful-receipt) failed intermittently in full-suite runs with either a `409` on what should have been the very first legitimate call, or `ERR_CONNECTION_REFUSED` against `localhost:1520` — both traced to the other agent's own concurrently-running Playwright process contending for the shared dev server / shared open-shift state, not a defect in this plan's code. Re-running the same tests in isolation (no concurrent Playwright process active) passed consistently (4/4, then 20/20 for the full spec file). No code change was needed; documenting for the orchestrator in case a similar flake surfaces during wave-level CI.

## User Setup Required

None - no external service configuration required. The local Supabase Edge Functions container bind-mounts `supabase/functions/` directly, so the updated `process-direct-sale/index.ts` was picked up without a separate deploy step.

## Next Phase Readiness

- CHK-04's split-tender receipt truthfulness gap (CR-03) and the remaining defense-in-depth piece of CHK-03/CR-02's receipt-disclosure gap (T-02-07-01) from `02-VERIFICATION.md` are closed.
- `02-VERIFICATION.md`'s other two open items — CHK-01's receipt-screen scanner race (CR-04) and CHK-05's loose-weight E2E locator regression — are explicitly out of this plan's scope (`02-07-PLAN.md` targets CHK-03/CHK-04 receipt truthfulness only) and are being addressed by the concurrently-running 02-08 plan.
- Physical printer output (this phase's one remaining `behavior_unverified` item from `02-VERIFICATION.md`) is still not provable by browser E2E and remains a documented hardware-only gap.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-13*

## Self-Check: PASSED
