---
phase: 16-purchase-orders-reordering
plan: 02
subsystem: frontend
tags: [zod, tanstack-query, purchase-order, reorder, tdd, fast-check]

requires: ["16-01"]
provides:
  - "PurchaseOrder/PurchaseOrderItem Zod schemas (domain.ts) — single source of truth for the entity"
  - "entities/purchase-order query hooks (usePurchaseOrders/usePurchaseOrder/create/update/delete) mirroring entities/supplier's proven map/row shape"
  - "computeReorderQuantity(quantityOnHand, lowStockThreshold, unitsPerPackage) — D-07/D-08 reorder formula, TDD, fast-check-proven"
  - "useSuggestReorder(supplierId) — supplier-scoped, deterministically-ordered, cost-defaulted low-stock suggestion query"
  - "StatusBadge po_draft/po_received keys"
affects: ["16-03", "16-04"]

actuals:
  tokens: 5300
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "PurchaseOrderListItem = PurchaseOrder & { supplierName, itemCount, totalCost } — list-view aggregate fields computed client-side from a partial embed (supplier:suppliers(name), purchase_order_items(quantity, cost_price)) are kept outside the Zod domain schema rather than forced through it, since a partial join can never satisfy SupplierSchema/PurchaseOrderItemSchema's full shape"
    - "TDD RED/GREEN as two separate commits for a pure-function task, mirroring 16-01's tracer split"

key-files:
  created:
    - src/entities/purchase-order/model/reorder-quantity.ts
    - src/entities/purchase-order/model/reorder-quantity.test.ts
    - src/entities/purchase-order/model/types.ts
    - src/entities/purchase-order/model/queries.ts
    - src/entities/purchase-order/index.ts
    - src/features/suggest-reorder/model/useSuggestReorder.ts
    - src/features/suggest-reorder/index.ts
  modified:
    - src/shared/lib/domain.ts
    - src/shared/ui/StatusBadge.tsx

key-decisions:
  - "List-view supplier/items embeds (usePurchaseOrders) are partial selects (supplier:suppliers(name), purchase_order_items(quantity, cost_price)) that cannot satisfy the full SupplierSchema/PurchaseOrderItemSchema shape — rather than force a partial object through PurchaseOrderSchema.parse (which would throw), the list hook returns PurchaseOrderListItem, an intersection type adding supplierName/itemCount/totalCost as plain computed fields outside the Zod schema. The detail hook (usePurchaseOrder) uses full embeds (supplier:suppliers(*), purchase_order_items(*, product:products(*))) and populates the schema's real supplier/items fields."
  - "TypeScript control-flow narrowing on poRes.data (Result<T | null>) does not survive into a nested .map() callback — extracted a local `const po = poRes.data` after the null check before referencing po.id inside the item-insert map, avoiding a TS2532 possibly-null error without an unsafe non-null assertion."

requirements-completed: [PO-01, PO-02]

coverage:
  - id: D1
    description: "computeReorderQuantity floors at 0 at/above threshold (D-07) and rounds a positive result up to the nearest unitsPerPackage multiple, falling back to the raw value when unset (D-08)"
    requirement: "PO-02"
    verification:
      - kind: unit
        ref: "src/entities/purchase-order/model/reorder-quantity.test.ts (6/6 tests: 5 examples + 1 fast-check property)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PurchaseOrder/PurchaseOrderItem/PurchaseOrderCreate/PurchaseOrderStatus Zod schemas exist in domain.ts, the single source of truth for the entity"
    requirement: "PO-01"
    verification:
      - kind: other
        ref: "npm run typecheck (clean); grep -n PurchaseOrderSchema src/shared/lib/domain.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "entities/purchase-order exposes usePurchaseOrders/usePurchaseOrder/create/update/delete mutation hooks, every supabase.from() call wrapped in supabaseQuery/supabaseMutation"
    requirement: "PO-01"
    verification:
      - kind: other
        ref: "npm run typecheck (clean); npm run lint (clean); manual read of queries.ts confirming no unwrapped supabase.from() call"
        status: pass
    human_judgment: false
  - id: D4
    description: "useSuggestReorder scopes low-stock suggestions through supplier_products (not the store-wide lowStockAlerts list alone), applies D-07/D-08, orders deterministically via .order('product(name)'), defaults costPrice to 0, and excludes zero-quantity/exactly-at-threshold rows"
    requirement: "PO-02"
    verification:
      - kind: other
        ref: "npm run typecheck (clean); grep -n computeReorderQuantity src/features/suggest-reorder/model/useSuggestReorder.ts confirms Task 1's formula is called, not reimplemented"
        status: pass
    human_judgment: false
  - id: D5
    description: "StatusBadge renders po_draft/po_received keys"
    requirement: "PO-01"
    verification:
      - kind: other
        ref: "grep -n po_draft|po_received src/shared/ui/StatusBadge.tsx"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-24
status: complete
---

# Phase 16 Plan 02: Entity/Domain Layer — Purchase Orders + Reorder Formula Summary

**PurchaseOrder/PurchaseOrderItem Zod schemas, entities/purchase-order CRUD query hooks mirroring entities/supplier's proven shape, and the TDD-proven D-07/D-08 reorder formula wired into a supplier-scoped low-stock suggestion query — Wave 3's UI now has a complete, tested data layer with zero business logic left for the form components.**

## Performance

- **Duration:** ~25min
- **Completed:** 2026-08-24
- **Tasks:** 3/3 completed
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- `computeReorderQuantity` implements D-07's floor-at-0 top-up and D-08's pack-size rounding, proven by 5 example cases plus a fast-check property test (result always >= 0; when unitsPerPackage is positive and result > 0, result is a multiple of it) — built RED-then-GREEN as two separate commits.
- `domain.ts` gained a "PURCHASE ORDERS" section (`PurchaseOrderSchema`, `PurchaseOrderItemSchema`, `PurchaseOrderItemCreateSchema`, `PurchaseOrderCreateSchema`, `PurchaseOrderStatusSchema`) inserted right after `SupplierProduct`'s type export, matching the existing z.object/z.infer pattern exactly.
- `entities/purchase-order` exposes `usePurchaseOrders()` (list view with supplier name + item-count/total-cost summary reduced from a partial embed), `usePurchaseOrder(id)` (full detail with nested supplier + items + product), and create/update/delete mutation hooks — all plain RLS-gated inserts/updates/deletes per D-03, mirroring `entities/supplier/model/queries.ts`'s map/row translator pattern.
- `useSuggestReorder(supplierId)` joins `inventory` through `supplier_products` (closing RESEARCH.md Pitfall 3 — the store-wide `lowStockAlerts` list alone is insufficient), applies `computeReorderQuantity` per row, excludes zero-quantity suggestions, defaults `costPrice` to 0 (D-05/D-06), and orders deterministically via `.order('product(name)')` mirroring `useInventory`'s proven embed+order shape.
- `StatusBadge` can now render `po_draft`/`po_received`.

## Task Commits

1. **Task 1a: RED — failing test for computeReorderQuantity** - `8d440a6` (test)
2. **Task 1b: GREEN — computeReorderQuantity implementation** - `158451f` (feat)
3. **Task 2: PurchaseOrder domain schemas + entities/purchase-order query hooks + StatusBadge keys** - `a549c5c` (feat)
4. **Task 3: suggest-reorder — supplier-scoped low-stock query** - `819d2f5` (feat)

## Files Created/Modified

- `src/entities/purchase-order/model/reorder-quantity.ts` - `computeReorderQuantity(quantityOnHand, lowStockThreshold, unitsPerPackage): number`
- `src/entities/purchase-order/model/reorder-quantity.test.ts` - 5 example cases + 1 fast-check property test
- `src/entities/purchase-order/model/types.ts` - re-exports PurchaseOrder*/PurchaseOrderItem* types/schemas from domain.ts
- `src/entities/purchase-order/model/queries.ts` - `purchaseOrderKeys`, `usePurchaseOrders`, `usePurchaseOrder`, `useMutationCreatePurchaseOrder`, `useMutationUpdatePurchaseOrder`, `useMutationDeletePurchaseOrder`
- `src/entities/purchase-order/index.ts` - barrel re-exporting the above
- `src/features/suggest-reorder/model/useSuggestReorder.ts` - `useSuggestReorder(supplierId)`
- `src/features/suggest-reorder/index.ts` - barrel
- `src/shared/lib/domain.ts` - new "PURCHASE ORDERS" section (`PurchaseOrderSchema`, `PurchaseOrderItemSchema`, `PurchaseOrderItemCreateSchema`, `PurchaseOrderCreateSchema`, `PurchaseOrderStatusSchema`, and their `z.infer` type exports)
- `src/shared/ui/StatusBadge.tsx` - `po_draft`/`po_received` statusConfig keys

## Decisions Made

- List-view supplier/items embeds (`usePurchaseOrders`) are partial selects that cannot satisfy the full `SupplierSchema`/`PurchaseOrderItemSchema` shape — rather than force a partial object through `PurchaseOrderSchema.parse` (which would throw on missing required fields), the list hook returns `PurchaseOrderListItem` (`PurchaseOrder & { supplierName, itemCount, totalCost }`), keeping those aggregate/summary fields as plain computed values outside the Zod schema. The detail hook (`usePurchaseOrder`) uses full embeds and populates the schema's real `supplier`/`items` fields, validated through `SupplierSchema`/`PurchaseOrderItemSchema`.
- TypeScript control-flow narrowing on `poRes.data` (`Result<T | null>`) does not survive into a nested `.map()` callback — extracted a local `const po = poRes.data` after the null check before referencing `po.id` inside the item-insert map, avoiding a possibly-null error without an unsafe non-null assertion.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- This worktree had no `node_modules/` and no `.env.local` (both are gitignored, not present in a fresh worktree checkout) — ran `npm ci` and copied `.env.local` from the main checkout (`/mnt/ai/POS/supermarket-pos/.env.local`) before any test/typecheck command would run. This is a one-off environment setup step for this worktree session, not a repo or plan change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 3's UI (create/edit PO form, low-stock reorder panel, PO list/detail widgets) can build directly on `entities/purchase-order`'s query hooks and `useSuggestReorder` without further data-layer work. No blockers.

---
*Phase: 16-purchase-orders-reordering*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 9 files listed in Files Created/Modified confirmed present via `git status`/`ls`. All 4 task commits (`8d440a6`, `158451f`, `a549c5c`, `819d2f5`) confirmed present via `git log --oneline -6`. `npm run typecheck`, `npm run lint`, and `npm run test` (1189 passed) all green as of the final commit.
