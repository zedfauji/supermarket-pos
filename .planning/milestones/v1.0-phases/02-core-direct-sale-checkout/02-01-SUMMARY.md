---
phase: 02-core-direct-sale-checkout
plan: 01
subsystem: payments
tags: [react, supabase, postgres, edge-functions, playwright, idempotency]
requires:
  - phase: 01-strip-rebrand
    provides: retained payment, cart, receipt, inventory-trigger, and caja infrastructure
provides:
  - Search-to-cart checkout at /pos with cash, card, and split tender
  - Atomic direct-sale RPC and Edge Function receipt responses
  - Stable idempotency keys for shared PaymentForm payment attempts
affects: [02-02 barcode checkout, 02-03 multi-unit checkout, payments]
actuals:
  tokens: 14716
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns: [direct-sale atomic RPC, PaymentForm-owned retry idempotency key]
key-files:
  created:
    - supabase/migrations/20260813000001_process_direct_sale_atomic.sql
    - supabase/migrations/20260813000002_fix_direct_sale_split_idempotency.sql
    - supabase/functions/process-direct-sale/index.ts
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/widgets/ProductGrid/ui/ProductGrid.tsx
    - src/pages/pos/index.tsx
  modified:
    - src/shared/lib/payment-processor.ts
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/shared/lib/edge-function-contracts.ts
    - e2e/50-direct-sale-checkout.spec.ts
key-decisions:
  - "Keep tabs/orders/order_items as the direct-sale persistence model while presenting checkout terminology in the UI."
  - "Generate one idempotency key in PaymentForm per payment attempt and pass it through shared processors."
  - "Recognize split-payment -leg0 keys before a direct-sale insert to prevent retry duplicates."
patterns-established:
  - "Direct-sale payment calls create order rows and invoke existing atomic payment RPCs in one database transaction."
  - "Edge receipt construction re-reads server-created payment IDs rather than trusting browser payloads."
requirements-completed: [CHK-02, CHK-03, CHK-04]
coverage:
  - id: D1
    description: "Cash, card, and cash-plus-card split checkout from /pos commit payment and stock changes."
    requirement: CHK-03
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Product search adds a cart line and the completed sale shows a receipt before clearing the cart."
    requirement: CHK-02
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#cash payment creates one paid sale and decrements stock"
        status: pass
    human_judgment: false
  - id: D3
    description: "Direct-sale retries reuse payment records, including split tender, without duplicate stock decrements."
    requirement: CHK-03
    verification:
      - kind: e2e
        ref: "e2e/50-direct-sale-checkout.spec.ts#reuses a split idempotency key without creating a second sale or stock decrement"
        status: pass
    human_judgment: false
duration: 28min
completed: 2026-08-12
status: complete
---

# Phase 02 Plan 01: Core Direct-Sale Checkout Summary

**Search-to-cart checkout at `/pos` now atomically records cash, card, and split-tender sales with receipts and retry-safe stock updates.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-12T16:39:04Z
- **Completed:** 2026-08-12T17:07:14Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Added the protected `/pos` checkout route, Home tile, product search grid, cart panel, and existing receipt flow.
- Added `process_direct_sale_atomic` and its Edge Function wrapper so order items, payment, and inventory decrement commit together.
- Wired card and split tender through the existing PaymentForm, with stable retry keys shared by all payment surfaces.
- Proved cash, card, split, price-tampering, and single/split idempotency behavior against the live Supabase stack.

## Task Commits

1. **Task 1: Atomic cash checkout tracer** - `a9f7d5d` (test), `ac5b41d` (feat)
2. **Task 2: Card, split tender, and shared retry safety** - `d231c6c` (test), `4e7665f` (feat)

## Files Created/Modified

- `supabase/migrations/20260813000001_process_direct_sale_atomic.sql` - atomic direct-sale persistence and payment delegation.
- `supabase/migrations/20260813000002_fix_direct_sale_split_idempotency.sql` - recognizes split `-leg0` retry keys before creating sale rows.
- `supabase/functions/process-direct-sale/index.ts` - authenticated Edge Function with single and multi-leg receipt payloads.
- `src/features/checkout-sale/model/useCheckoutSale.ts` - synthetic PaymentForm tab plus cash/card/split processors.
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` and `src/shared/lib/payment-processor.ts` - shared per-attempt idempotency key support.
- `e2e/50-direct-sale-checkout.spec.ts` - live cash, card, split, tampering, and retry coverage.

## Decisions Made

- Reused `tabs`, `orders`, and `order_items` behind the direct-sale UI to avoid a destructive schema rename.
- Kept idempotency key ownership in `PaymentForm`, the one shared caller for both `/pos` and `/payments`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Closed split direct-sale idempotency at the database boundary**
- **Found during:** Task 2
- **Issue:** Split payments store idempotency keys as `<key>-leg0`; the original direct-sale pre-insert check only inspected `<key>`, allowing a retry to create another tab and order.
- **Fix:** Added a follow-up `CREATE OR REPLACE FUNCTION` migration that recognizes both keys and returns the original split payment IDs.
- **Files modified:** `supabase/migrations/20260813000002_fix_direct_sale_split_idempotency.sql`
- **Verification:** Live migration check and split-idempotency Playwright test passed.
- **Committed in:** `4e7665f`

**Total deviations:** 1 auto-fixed (Rule 2)

## Issues Encountered

- The split form uses the configured `Terminal BBVA` label rather than an English `Card` label; the E2E selector was aligned with that existing UI copy.

## User Setup Required

None - the local Supabase migration was applied automatically.

## Next Phase Readiness

- Plan 02-02 can layer barcode lookup and categories onto the proven `/pos` slice.
- Plan 02-03 can extend the same atomic RPC for loose-weight and multi-unit items.

## Self-Check: PASSED

- Task commits `a9f7d5d`, `ac5b41d`, `d231c6c`, and `4e7665f` exist.
- Direct-sale migrations and checkout source files exist in the repository.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-12*
