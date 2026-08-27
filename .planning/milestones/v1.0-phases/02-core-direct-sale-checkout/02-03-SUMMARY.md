---
phase: 02-core-direct-sale-checkout
plan: 03
subsystem: checkout
tags: [react, zustand, supabase, postgres, playwright, loose-weight]
requires:
  - phase: 02-core-direct-sale-checkout
    provides: Direct-sale checkout UI and atomic payment flow from Plans 02-01 and 02-02
provides:
  - Gram-accurate loose-weight sales with bounded server validation and stock triggers
  - Numeric weight entry/editing with separately tracked weighted cart lines
  - One in-memory hold/resume/discard slot for unfinished sales
affects: [phase-03-inventory, checkout, inventory-reporting]
actuals:
  tokens: 30855
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns:
    - Weighted inventory stores grams only for products.sold_by_weight products
    - The database derives weighted direct-sale line totals from catalog price and grams
    - Held carts stay in Zustand memory until a payment is submitted
key-files:
  created:
    - supabase/migrations/20260814000001_loose_weight_items.sql
    - supabase/migrations/20260814000002_weighted_direct_sale_price.sql
    - src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx
    - src/features/hold-sale/ui/HoldSaleBanner.tsx
  modified:
    - src/entities/tab/model/cartStore.ts
    - src/features/checkout-sale/model/useCheckoutSale.ts
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - e2e/52-loose-weight-hold-sale.spec.ts
key-decisions:
  - "Products sold by weight use grams in inventory.quantity_on_hand; unit-sold products retain unit counts."
  - "Direct-sale weighted line totals are derived server-side from base price and grams before payment is recorded."
patterns-established:
  - "Weighted cart lines always append and are edited by tempId, never quantity-merged."
  - "Held sale state is one in-memory cart slot and has no inventory or payment effects."
requirements-completed: [CHK-05]
coverage:
  - id: D1
    description: Gram-accurate weighted direct-sale schema and database accounting
    requirement: CHK-05
    verification:
      - kind: other
        ref: "local Supabase SQL RPC proof"
        status: pass
    human_judgment: false
  - id: D2
    description: Weight keypad, distinct weighted cart lines, edits, and held-sale checkout UX
    requirement: CHK-05
    verification:
      - kind: e2e
        ref: "e2e/52-loose-weight-hold-sale.spec.ts"
        status: unknown
    human_judgment: true
    rationale: "The local Supabase global setup stalled before Playwright reached assertions."
duration: 35m
completed: 2026-08-12
status: complete
---

# Phase 02 Plan 03: Loose-weight checkout and held-sale Summary

**Gram-accurate loose-weight checkout with server-derived totals, editable per-weight cart lines, and a single in-memory held-sale slot.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-08-12T11:53:16-06:00
- **Completed:** 2026-08-12T12:28:00-06:00
- **Tasks:** 3
- **Files modified:** 33

## Accomplishments

- Added `weight_grams` and `sold_by_weight`, bounded to `(0, 50000]`, with explicitly documented mixed-unit inventory semantics and gram-accurate decrement/restore triggers.
- Added a numeric kg entry/edit dialog, cent-rounded weighted totals, and append-only weighted cart lines that remain independently editable.
- Added in-memory hold, resume, and non-destructive discard actions without creating orders, payments, or stock movements before checkout.

## Task Commits

Each task was committed atomically:

1. **Task 2: Loose-weight schema** - `6290220` (test), `77cb10d` (feat)
2. **Task 3: Weight-entry keypad** - `ca6b9ff` (test), `c0b985b` (feat)
3. **Task 4: Hold / resume / discard a sale** - `52755bf` (test), `f76a4d2` (feat)
4. **Correctness follow-up:** `c1e3a7f` (fix) derives weighted sale totals on the database side.

## Files Created/Modified

- `supabase/migrations/20260814000001_loose_weight_items.sql` - Weight fields, validation, gram-based inventory triggers, and direct-sale RPC support.
- `supabase/migrations/20260814000002_weighted_direct_sale_price.sql` - Server-derived weighted line pricing for payment-safe order totals.
- `src/entities/tab/model/cartStore.ts` - Weighted item arithmetic/actions plus held-cart state transitions.
- `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` - Keyboard and keypad-driven kg entry for add/edit flows.
- `src/features/hold-sale/ui/HoldSaleBanner.tsx` - Resume/discard controls with default, non-destructive confirmation.
- `src/features/checkout-sale/model/useCheckoutSale.ts` - Weight values and weighted line totals forwarded to direct sale processing.
- `e2e/52-loose-weight-hold-sale.spec.ts` - Browser coverage for weighted and held-sale scenarios.

## Decisions Made

- User-selected gram-accurate mode: `inventory.quantity_on_hand` means grams for products with `sold_by_weight = true`, while regular products continue to use units. The migration comment warns consumers never to aggregate the values without checking the product type.
- The database calculates a weighted order item's persisted line amount from `base_price × weight_grams / 1000`, preventing a client payload from causing payment/order total mismatches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Derived weighted line price in the direct-sale RPC**
- **Found during:** Task 4 verification
- **Issue:** Persisting per-kg `unit_price` with `quantity = 1` made the existing payment RPC calculate the full per-kg price rather than the weighted line total.
- **Fix:** Added a follow-up migration that validates the client-supplied weighted amount against the catalog price and persists the server-derived cent-rounded line total.
- **Files modified:** `supabase/migrations/20260814000002_weighted_direct_sale_price.sql`, `src/features/checkout-sale/model/useCheckoutSale.ts`, `e2e/52-loose-weight-hold-sale.spec.ts`
- **Verification:** Local database proof recorded 375 g at $6.50/kg as $2.44, decremented stock from 1000 g to 625 g, and restored it to 1000 g after order deletion.
- **Committed in:** `c1e3a7f`

**2. [Rule 3 - Blocking environment] Used the direct local database connection for migration/type generation**
- **Found during:** Task 2
- **Issue:** The local Supabase pooler was not running, so `supabase db push --local` and `supabase gen types --local` could not connect.
- **Fix:** Applied both migrations and regenerated TypeScript types through the running local Postgres container's direct connection.
- **Files modified:** `src/shared/lib/supabase.types.ts`, `supabase/migrations/20260814000001_loose_weight_items.sql`, `supabase/migrations/20260814000002_weighted_direct_sale_price.sql`
- **Verification:** `supabase_migrations.schema_migrations` contains both migration versions; direct SQL calls reject out-of-range weights without adding order items.

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3).
**Impact on plan:** Both changes are required for correct checkout accounting and local verification; no scope expansion.

## Issues Encountered

- `npm run typecheck` passes.
- `npm run lint` remains blocked by 12 pre-existing errors in `useCheckoutSale.ts` and `PaymentForm.tsx`, documented by Plan 02-02; this plan added no new lint findings.
- Vitest and Playwright both stalled in the existing local Supabase global setup before test assertions ran. The e2e scenario remains recorded as an unrun verification; direct local database checks verified migration tracking, exact gram decrement/restore, paid total calculation, and out-of-range rejection without inserts.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 3 inventory work can rely on the documented mixed-unit invariant and must branch on `products.sold_by_weight` before comparing or aggregating `inventory.quantity_on_hand`.

## TDD Gate Compliance

Passed: each behavior task has a preceding `test(02-03)` RED commit followed by its implementation commit.

## Self-Check: PASSED

Confirmed required migrations, checkout UI files, and all seven task commits exist in the repository history.

---
*Phase: 02-core-direct-sale-checkout*
*Completed: 2026-08-12*
