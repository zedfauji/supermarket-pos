---
phase: 16-purchase-orders-reordering
plan: 03
subsystem: ui
tags: [react, tanstack-query, tanstack-table, purchase-order, i18next, fsd]

requires:
  - phase: 16-02
    provides: "entities/purchase-order query hooks, useSuggestReorder, StatusBadge po_draft/po_received keys"
provides:
  - "PurchaseOrderForm — dual create/edit line-item form with Suggest-reorder-from-low-stock wiring"
  - "PurchaseOrderListPanel — DataTable-backed searchable PO list with create dialog and draft-only delete"
  - "PurchaseOrderDetailPanel — read-only PO detail view with draft-only Edit action"
  - "/purchase-orders route, PurchaseOrdersRoute guard, HomeDashboard tile"
affects: ["16-04"]

actuals:
  tokens: 7564
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "PurchaseOrderForm.onSubmitCreate returns Promise<Result<PurchaseOrder>> (not void) so the form itself can await the create mutation and drive its own inline-error/success-toast/close behavior, mirroring ReceiveShipmentForm's self-contained submit() exactly; onSubmitUpdate stays void-returning since the caller (PurchaseOrderDetailPanel) binds its own onSuccess to the mutateAsync call and owns that toast/close, mirroring SupplierForm/SupplierListPanel's existing split."
    - "DataTable's own isLoading skeleton rendering is reused as-is for the PO list (no hand-rolled TableRowSkeleton branch before it) — DataTable already implements the loading-skeleton must-have internally."

key-files:
  created:
    - src/features/create-purchase-order/ui/PurchaseOrderForm.tsx
    - src/features/create-purchase-order/index.ts
    - src/widgets/PurchaseOrderListPanel.tsx
    - src/widgets/PurchaseOrderDetailPanel.tsx
    - src/app/purchase-orders-route.tsx
    - src/pages/purchase-orders/index.tsx
  modified:
    - src/app/router.tsx
    - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
    - src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx
    - src/shared/lib/i18n/locales/en-US/featMgmt.json
    - src/shared/lib/i18n/locales/es-MX/featMgmt.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/common.json
    - src/shared/lib/i18n/locales/es-MX/common.json
    - src/shared/lib/i18n/locales/en-US/pages.json
    - src/shared/lib/i18n/locales/es-MX/pages.json
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "PurchaseOrderForm.onSubmitCreate typed as (value) => Promise<Result<PurchaseOrder>> rather than the plan's literal (value) => void — the plan's own Task 1 description requires the form to await the create result to show an inline saveError and only toast+close on success (mirroring ReceiveShipmentForm), which is impossible if the caller pre-voids the mutateAsync promise as Task 2's snippet showed. Resolved by making the type Promise-returning; PurchaseOrderListPanel passes `value => create.mutateAsync(value)` (no void). onSubmitUpdate keeps its void/fire-and-forget shape since PurchaseOrderDetailPanel already binds its own onSuccess handler to the mutateAsync call it passes through, matching Task 1's 'update's own success toast/close is the caller's responsibility' note."
  - "PurchaseOrderDetailPanel's edit-mode PurchaseOrderForm needs a real onSubmitCreate value even though it is never invoked (create branch is skipped whenever initialPurchaseOrder is set) — passed a typed stub `() => Promise.resolve(err(unknownError()))` rather than loosening the prop to optional, keeping the form's public contract uniform for both callers."

requirements-completed: [PO-01, PO-02]

coverage:
  - id: D1
    description: "PurchaseOrderForm supports both create and edit, Suggest-reorder replaces an empty line list in one confirmable click (never auto-submits), cost defaults from inventory.costPrice (D-05/D-06), Save Draft is guarded against empty/in-flight/incomplete submissions, and no expiry field is present"
    requirement: "PO-01"
    verification:
      - kind: other
        ref: "npm run typecheck (clean); npm run lint (clean, 0 warnings); grep -n purchaseOrderForm src/shared/lib/i18n/locales/{en-US,es-MX}/featMgmt.json confirms both locales carry the new keys"
        status: pass
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts (not yet written — scheduled for 16-04 Task 2, which proves the create/auto-draft/edit flow end-to-end per ROADMAP Phase 16 success criteria 1-2)"
        status: unknown
    human_judgment: true
    rationale: "This wave's only automated proof is typecheck/lint/build (structural correctness); the actual runtime create->suggest->edit user flow is proven by the Playwright spec Wave 4 (16-04) authors against this UI. Per repo CLAUDE.md's mandatory-automated-testing policy, deferring to that spec rather than a human click-through."
  - id: D2
    description: "PurchaseOrderListPanel (DataTable: supplier/status/items/total/created/draft-only-delete columns, searchable, EmptyState with New Purchase Order action) and PurchaseOrderDetailPanel (read-only line items, draft-only Edit action, no action controls on a received PO)"
    requirement: "PO-01"
    verification:
      - kind: other
        ref: "npm run typecheck (clean); npm run lint (clean); grep -n \"aria-label={t('purchaseOrderListPanel.delete')}\" src/widgets/PurchaseOrderListPanel.tsx confirms the icon-only delete button carries an accessible label; grep -c \"po_draft\\|po_received\" src/widgets/PurchaseOrderListPanel.tsx src/widgets/PurchaseOrderDetailPanel.tsx confirms both files reference the Wave 2 StatusBadge keys"
        status: pass
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts (not yet written — scheduled for 16-04)"
        status: unknown
    human_judgment: true
    rationale: "Same as D1 — structural checks pass in this wave; the browse/open/edit/delete runtime flow is proven by Wave 4's Playwright spec, not a human click-through."
  - id: D3
    description: "/purchase-orders is reachable from the Home dashboard (manager+ only tile, gated manage_products) and directly via URL, guarded by PurchaseOrdersRoute; unreachable/redirected for a cashier"
    requirement: "PO-01"
    verification:
      - kind: other
        ref: "npm run build (succeeds — proves the lazy-loaded route/page compiles and bundles cleanly); grep -n 'path=\"/purchase-orders\"' src/app/router.tsx; grep -n \"requiredAction: 'manage_products'\" src/widgets/HomeDashboard/ui/HomeDashboard.tsx"
        status: pass
      - kind: unit
        ref: "src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx > HomeDashboard > gated buttons show lock icon for cashier (updated 7 -> 8 for the new gated tile)"
        status: pass
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts Test D (not yet written — scheduled for 16-04, proves the cashier route-redirect + RLS zero-rows assertion)"
        status: unknown
    human_judgment: true
    rationale: "Route wiring/build/unit-test evidence is in hand; the cashier-exclusion assertion against the real RLS boundary is Wave 4's Test D, not reproduced here."

duration: ~45min
completed: 2026-08-24
status: complete
---

# Phase 16 Plan 03: Purchase Order Create/Edit/Browse UI Summary

**PurchaseOrderForm (dual create/edit with one-click low-stock suggestion), a DataTable-backed PurchaseOrderListPanel, a read-only PurchaseOrderDetailPanel, and the /purchase-orders route + HomeDashboard tile — the full PO-01/PO-02 manager-facing UI, reusing every existing component (Dialog, DataTable, ConfirmDialog, EmptyState, MoneyInput, MoneyDisplay, POSButton, FormField) with zero new shadcn components.**

## Performance

- **Duration:** ~45min
- **Completed:** 2026-08-24
- **Tasks:** 3/3 completed
- **Files modified:** 19 (6 created, 13 modified)

## Accomplishments

- `PurchaseOrderForm` supports both create and edit in one component (mirrors `SupplierForm`'s dual-dispatch shape), reuses `ReceiveShipmentForm`'s line-item grid/EmptyState/product-search-match logic minus the expiry column, and wires "Suggest reorder from low stock" to `useSuggestReorder(supplierId)` — a single confirmable click that replaces an empty line list, disabled once any line exists to prevent a silent overwrite, and never auto-saves (nothing persists until Save Draft).
- Line cost defaults from `inventory.costPrice` on product match (D-05/D-06), falling back to 0 with no blocking validation when the product has never been received.
- `PurchaseOrderListPanel` is a `DataTable`-backed searchable list (supplier, status badge, item count, total cost, created date, draft-only delete action with an accessible `aria-label`) with a "New Purchase Order" create dialog and a delete `ConfirmDialog`, mirroring `SupplierListPanel`'s composition pattern.
- `PurchaseOrderDetailPanel` shows a read-only line-item view (product/quantity/cost, `max-h-72 overflow-y-auto` scroll cap) with a draft-only "Edit" action opening `PurchaseOrderForm` in edit mode; a received PO renders no action controls at all (Receive Shipment lands in Wave 4).
- `/purchase-orders` is reachable from the Home dashboard (new `FileText`-icon tile after `/suppliers`, gated `manage_products`) and directly via URL, guarded by a new `PurchaseOrdersRoute` mirroring `ReportsRoute` exactly.
- All new copy routes through i18next across `featMgmt`, `wAdmin`, `common`, `pages`, and `wPanels` namespaces in both `en-US` and `es-MX` (es-MX values are genuine translations, not byte-copies, per this repo's i18n convention for new content).

## Task Commits

1. **Task 1: PurchaseOrderForm — create + edit, line-item grid, Suggest-reorder wiring** - `f512fbd` (feat)
2. **Task 2: PurchaseOrderListPanel (DataTable) + PurchaseOrderDetailPanel** - `cccfa17` (feat)
3. **Task 3: PurchaseOrdersRoute guard + /purchase-orders route + HomeDashboard tile + page composition** - `938201f` (feat)
4. **Rule 1 fix: HomeDashboard lock-icon count** - `c5b9163` (test)

## Files Created/Modified

- `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx` - dual create/edit form, line-item grid, suggest-reorder wiring
- `src/features/create-purchase-order/index.ts` - barrel
- `src/widgets/PurchaseOrderListPanel.tsx` - DataTable list, create dialog, delete confirm
- `src/widgets/PurchaseOrderDetailPanel.tsx` - read-only detail view, draft-only Edit action
- `src/app/purchase-orders-route.tsx` - `PurchaseOrdersRoute` guard (mirrors `ReportsRoute`)
- `src/app/router.tsx` - new `/purchase-orders` route entry
- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` - new tile after `/suppliers`
- `src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx` - lock-icon count updated 7 -> 8
- `src/pages/purchase-orders/index.tsx` - `PageContainer` + `PurchaseOrderListPanel` composition
- `src/shared/lib/i18n/locales/{en-US,es-MX}/featMgmt.json` - `purchaseOrderForm.*`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wAdmin.json` - `purchaseOrderListPanel.*`, `purchaseOrderDetailPanel.*`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/common.json` - `statusBadge.poDraft`/`poReceived`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/pages.json` - `purchaseOrders.title`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wPanels.json` - `homeDashboard.tiles.purchaseOrders`

## Decisions Made

- `PurchaseOrderForm`'s `onSubmitCreate` prop is typed `(value: PurchaseOrderCreate) => Promise<Result<PurchaseOrder>>` rather than the plan's literal `(value) => void` — see `key-decisions` above for the full reasoning. This was necessary to make the plan's own described behavior (form awaits the create result, shows inline `saveError` on failure, toasts + closes only on success) actually implementable; `onSubmitUpdate` was left void-returning since its success/error handling is intentionally owned by the caller.
- `PurchaseOrderDetailPanel`'s nested edit-mode form passes a typed no-op stub for `onSubmitCreate` (never invoked in edit mode) rather than making the prop optional, to keep `PurchaseOrderForm`'s public contract identical for both call sites.
- DataTable's built-in `isLoading` skeleton handling is relied on directly for the PO list (no separate hand-rolled skeleton branch before it) — it already satisfies the "PO list shows skeleton loading rows" must-have without duplication.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing test assertion broken by the new HomeDashboard tile**
- **Found during:** Task 3 (post-task `npm run test` sanity run)
- **Issue:** `HomeDashboard.test.tsx`'s "gated buttons show lock icon for cashier" test hardcoded an expected lock-icon count of 7; adding the new `manage_products`-gated Purchase Orders tile made the actual count 8, failing the existing test.
- **Fix:** Updated the expected count to 8 and the accompanying comment listing the gated tiles.
- **Files modified:** `src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx`
- **Verification:** `npx vitest run src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx` — 7/7 passed; full `npm run test` — 1189 passed, 0 failed.
- **Committed in:** `c5b9163`

**2. [Rule 1 - Bug] Corrected `PurchaseOrderForm`'s `onSubmitCreate` prop signature**
- **Found during:** Task 1 (writing the submit handler)
- **Issue:** The plan's literal prop type (`(value) => void`) is incompatible with the plan's own described behavior — awaiting the create result to drive inline error/success-toast/close, mirroring `ReceiveShipmentForm`.
- **Fix:** Typed `onSubmitCreate` as `(value: PurchaseOrderCreate) => Promise<Result<PurchaseOrder>>`; `PurchaseOrderListPanel` passes `value => create.mutateAsync(value)` (no `void`) so the form can await it.
- **Files modified:** `src/features/create-purchase-order/ui/PurchaseOrderForm.tsx`, `src/widgets/PurchaseOrderListPanel.tsx`
- **Verification:** `npm run typecheck` clean; manual trace of the create flow confirms inline error-on-failure and toast+close-on-success both work as specified.
- **Committed in:** `f512fbd`, `cccfa17`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 — both required for correctness; no scope creep).
**Impact on plan:** Both fixes were necessary to make the plan's own described behavior actually work / to keep the existing test suite green. No functionality beyond what the plan specified was added.

## Issues Encountered

- This worktree had no `node_modules/` and no `.env.local` (both gitignored, absent from a fresh worktree checkout) — ran `npm ci` and copied `.env.local` from the main checkout (`/mnt/ai/POS/supermarket-pos/.env.local`) before any typecheck/lint/build/test command would run. One-off environment setup, not a repo or plan change (same issue 16-02-SUMMARY.md documented for this worktree).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 4 (16-04) can build directly on this UI: `ReceiveShipmentForm` gains an `initialPurchaseOrder` pre-fill prop and `PurchaseOrderDetailPanel` gains a "Receive Shipment" action for draft POs, plus the `e2e/56-purchase-orders.spec.ts` spec that proves ROADMAP Phase 16's four success criteria end-to-end (create, auto-draft-then-edit, receive-in-full, cashier exclusion). No blockers — `PurchaseOrderDetailPanel`'s existing `po.status === 'draft'` branch is exactly where the Receive Shipment button will be added.

---
*Phase: 16-purchase-orders-reordering*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 7 files listed under Files Created/Modified's new-file set confirmed present via `ls -la`. All 4 task commits (`f512fbd`, `cccfa17`, `938201f`, `c5b9163`) confirmed present via `git log --oneline --all`. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test` (1189 passed) all green as of the final commit.
