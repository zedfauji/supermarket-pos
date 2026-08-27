---
phase: 16-purchase-orders-reordering
plan: 04
subsystem: ui
tags: [react, tanstack-query, i18next, playwright, e2e, purchase-order, rls]

requires:
  - phase: 16-01
    provides: "receive_shipment RPC extended with p_po_id, purchase_orders/purchase_order_items schema + RLS"
  - phase: 16-03
    provides: "PurchaseOrderDetailPanel, PurchaseOrderForm, PurchaseOrderListPanel, /purchase-orders route"
provides:
  - "ReceiveShipmentForm.initialPurchaseOrder pre-fill prop (poId carried through to useReceiveShipment)"
  - "PurchaseOrderDetailPanel Receive Shipment CTA on draft POs, reusing the existing receive form unmodified"
  - "e2e/56-purchase-orders.spec.ts proving all 4 ROADMAP Phase 16 success criteria end-to-end, headless"
affects: []

actuals:
  tokens: 5400
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Thin-wrapper receive pre-fill: the raw RPC error code (e.g. PO_ALREADY_RECEIVED) survives client-side only in AppError.details, not .code, because the shared edge-error mapper (mapProcessPaymentEdgeError) has no explicit case for PO-specific codes and falls through to its generic SUPABASE_ERROR default. Any future PO-specific error UI must check .details, not .code."
    - "Playwright dialog scoping under a persistent role=dialog side panel: this app's AI Assistant panel is always mounted with role=\"dialog\" (moved off-screen via CSS transform, not display:none), so any unscoped page.getByRole('dialog') silently matches it too. Every dialog locator in new specs must scope via .filter({ hasText: ... }) on content unique to the target dialog."

key-files:
  created:
    - e2e/56-purchase-orders.spec.ts
  modified:
    - src/features/receive-shipment/ui/ReceiveShipmentForm.tsx
    - src/features/receive-shipment/model/useReceiveShipment.ts
    - src/widgets/PurchaseOrderDetailPanel.tsx
    - src/shared/lib/i18n/locales/en-US/wAdmin.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json

key-decisions:
  - "PO_ALREADY_RECEIVED detection reads result.error.details (not .code) in ReceiveShipmentForm's submit() — the shared mapProcessPaymentEdgeError() edge-error mapper has no case for PO-specific RPC codes, so they fall through to its default branch which sets { code: 'SUPABASE_ERROR', details: <raw code> }. Fixed locally in ReceiveShipmentForm rather than adding cases to the shared mapper, to avoid widening that function's blast radius for a single call site."
  - "ReceiveShipmentForm's supplier <select> and pre-filled lines use lazy useState(() => ...) initializers keyed off initialPurchaseOrder — correct because PurchaseOrderDetailPanel mounts a single ReceiveShipmentForm instance for the lifetime of one PO detail view (open/onOpenChange only toggles visibility, the component never remounts with a different PO)."

requirements-completed: [PO-01, PO-02, PO-03]

coverage:
  - id: D1
    description: "ReceiveShipmentForm accepts an optional initialPurchaseOrder pre-fill (supplier + lines, disabled supplier select, poId carried through mutateAsync), with no second receive form and no second status-update call"
    requirement: "PO-03"
    verification:
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts#Receive Shipment updates stock and closes the PO (PO-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PurchaseOrderDetailPanel shows a Receive Shipment CTA on draft POs; receiving atomically closes the PO (status='received') and updates inventory in the same RPC call, proven through the running UI"
    requirement: "PO-03"
    verification:
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts#Receive Shipment updates stock and closes the PO (PO-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manual PO creation end-to-end through the UI"
    requirement: "PO-01"
    verification:
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts#manager creates a purchase order manually (PO-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Suggest-reorder-from-low-stock one-click auto-draft, pre-filled with the D-07/D-08 computed quantity and still editable before save"
    requirement: "PO-02"
    verification:
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts#Suggest reorder from low stock pre-fills and is editable before save (PO-02)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A cashier is excluded from Purchase Orders at both the route (redirect to /home) and the real RLS boundary (zero rows from a raw REST SELECT with a genuine cashier access token) — the UI redirect alone is not treated as sufficient proof"
    requirement: "PO-01"
    verification:
      - kind: e2e
        ref: "e2e/56-purchase-orders.spec.ts#cashier cannot see or reach Purchase Orders (D-02)"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-24
status: complete
---

# Phase 16 Plan 04: Receive-from-PO Wiring + Phase-Closing E2E Suite Summary

**ReceiveShipmentForm gains an `initialPurchaseOrder` pre-fill prop (poId carried through to the already-hardened `receive_shipment` RPC), PurchaseOrderDetailPanel gets a "Receive Shipment" CTA on draft POs reusing that same unmodified form, and `e2e/56-purchase-orders.spec.ts` proves all 4 of ROADMAP Phase 16's success criteria end-to-end, headless.**

## Performance

- **Duration:** ~50min
- **Completed:** 2026-08-24
- **Tasks:** 2/2 completed
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- `ReceiveShipmentForm` accepts an optional `initialPurchaseOrder` prop (id/supplierId/items) — when set, the supplier `<select>` is disabled, lines are pre-seeded from the PO's items (expiry stays blank/manager-fillable, since a PO never carries expiry), and `poId` is carried through to `useReceiveShipment.mutateAsync`. No second receive form, no second status-update call, per 16-UI-SPEC.md's explicit "thin wrapper" instruction and D-04.
- `useReceiveShipment` now also invalidates `purchaseOrderKeys.all` on success, so a PO's detail view refetches and shows "received" immediately after a successful receive.
- `PurchaseOrderDetailPanel` renders a "Receive Shipment" `POSButton` on draft POs (alongside the existing Edit button), opening the same `ReceiveShipmentForm` pre-filled with the PO's supplier/lines.
- A `PO_ALREADY_RECEIVED` receive failure surfaces via a dedicated toast (`purchaseOrderDetailPanel.alreadyReceivedError`) instead of the generic receive-shipment error copy; every other error code keeps the existing generic message.
- `e2e/56-purchase-orders.spec.ts` (4 tests, all passing headless against the local dev server + self-hosted Supabase stack) proves: manual PO creation, one-click low-stock auto-draft with pre-save editing (D-07's `lowStockThreshold - quantityOnHand` formula verified numerically), Receive Shipment atomically closing the PO and updating stock, and cashier exclusion from both the `/purchase-orders` route and the real `purchase_orders` RLS policy via a raw REST call with a genuine cashier access token.

## Task Commits

1. **Task 1: ReceiveShipmentForm PO pre-fill + PurchaseOrderDetailPanel Receive CTA** - `2a4d7b0` (feat)
2. **Task 2: e2e/56-purchase-orders.spec.ts (create, auto-draft, receive-in-full, RBAC)** - `e37a52b` (test)

## Files Created/Modified

- `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` - `initialPurchaseOrder` prop, disabled supplier select when pre-filled, `poId` passed to `receive.mutateAsync`, `PO_ALREADY_RECEIVED` toast branch
- `src/features/receive-shipment/model/useReceiveShipment.ts` - added `purchaseOrderKeys.all` invalidation to the existing `onSuccess`
- `src/widgets/PurchaseOrderDetailPanel.tsx` - "Receive Shipment" CTA + `ReceiveShipmentForm` wiring for draft POs
- `src/shared/lib/i18n/locales/en-US/wAdmin.json`, `es-MX/wAdmin.json` - `purchaseOrderDetailPanel.receive`/`alreadyReceivedError`
- `e2e/56-purchase-orders.spec.ts` - 4-test spec covering ROADMAP Phase 16 success criteria 1-4

## Decisions Made

- `PO_ALREADY_RECEIVED` detection reads `result.error.details` (not `.code`) — traced the actual runtime shape through `edge-function-contracts.ts`'s `mapProcessPaymentEdgeError()`: that shared mapper has no case for PO-specific RPC codes, so unmapped codes fall into its `default` branch, which sets `{ code: 'SUPABASE_ERROR', details: <raw code> }`. The plan's literal wording ("PO_ALREADY_RECEIVED error code from the result") would not have worked as a `.code` check against real runtime behavior; fixed to check `.details` instead, scoped locally to `ReceiveShipmentForm` rather than widening the shared mapper for one call site (Rule 1 — bug fix required for the described behavior to actually work).
- Playwright dialog locators in the new spec scope via `.filter({ hasText: ... })` rather than a bare `page.getByRole('dialog')` — this app's persistent AI Assistant side panel is always mounted with `role="dialog"` (hidden via CSS transform, not `display:none`), so an unscoped locator matches it too and `toBeHidden()` assertions on the intended dialog never resolve. Discovered via a real test failure, not anticipated from reading code.
- `New Purchase Order` button locator uses `.first()` — the list's own `EmptyState` renders a duplicate "New Purchase Order" action button when the table has zero rows, so an unscoped `getByRole('button', { name: ... })` is ambiguous on a fresh seed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `PO_ALREADY_RECEIVED` error-code check corrected to read `.details` instead of `.code`**
- **Found during:** Task 1
- **Issue:** The plan's action text described branching on "a `PO_ALREADY_RECEIVED` error code from the result," implying `result.error.code === 'PO_ALREADY_RECEIVED'`. Tracing `callReceiveShipment` → `mapProcessPaymentEdgeError` showed unmapped RPC codes (including all PO-specific ones) collapse to `code: 'SUPABASE_ERROR'`, with the raw code preserved only in `details`.
- **Fix:** Branch on `result.error.details === 'PO_ALREADY_RECEIVED'` instead.
- **Files modified:** `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx`
- **Verification:** `npm run typecheck` clean; confirmed via code trace through `edge-function-contracts.ts` and the RPC migration's `RETURN jsonb_build_object('ok', false, 'code', 'PO_ALREADY_RECEIVED', ...)`.
- **Committed in:** `2a4d7b0` (part of Task 1's commit — caught before commit, no separate fix commit needed)

**2. [Rule 1 - Bug] Two Playwright locator ambiguities fixed during Task 2's own test run**
- **Found during:** Task 2 (running the new spec against the real app)
- **Issue:** (a) `getByRole('button', { name: /new purchase order/i })` matched both the page header button and the `EmptyState`'s own action button when the list was empty. (b) An unscoped `getByRole('dialog')` matched this app's always-mounted AI Assistant side panel (`role="dialog"`, off-screen via CSS transform) in addition to the intended create/receive dialog, so `toBeHidden()` assertions never resolved after the intended dialog closed.
- **Fix:** (a) `.first()` on the ambiguous button locator. (b) Scoped every dialog locator with `.filter({ hasText: ... })` on content unique to the target dialog.
- **Files modified:** `e2e/56-purchase-orders.spec.ts`
- **Verification:** Full spec run twice consecutively, 4/4 passing both times.
- **Committed in:** `e37a52b` (caught and fixed before commit — the file was only committed once all 4 tests were green)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — required for the plan's own described behavior/tests to actually work). No scope creep.

## Issues Encountered

- This worktree had no `node_modules/` and no `.env.local` (both gitignored, absent from a fresh worktree checkout) — ran `npm ci` and copied `.env.local` from the main checkout before any typecheck/lint/E2E command would run. One-off environment setup, matching the same issue documented in 16-02-SUMMARY.md and 16-03-SUMMARY.md for this worktree.
- Task 2's E2E run required a local dev server (`npm run dev`, port 1520) and confirmed the pre-existing local Supabase Docker stack was already running (`supabase-kong` on port 8000); Google Chrome was already present at `/usr/bin/google-chrome-stable`, satisfying `playwright.config.ts`'s `channel: 'chrome'` requirement.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 16 (Purchase Orders & Reordering) is functionally complete: PO-01 (manual creation, cashier exclusion), PO-02 (low-stock auto-draft), and PO-03 (receive-in-full closing the PO atomically) are all proven end-to-end by `e2e/56-purchase-orders.spec.ts`, the phase's sole verification surface for the full user-facing flow per this repo's mandatory-automated-testing policy. This is the last plan in the phase — no further Wave 4+ work is scheduled. Ready for orchestrator-level phase verification (`/gsd-verify-work` or equivalent).

---
*Phase: 16-purchase-orders-reordering*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 6 files listed in Files Created/Modified confirmed present via `git ls-files --error-unmatch`. Both task commits (`2a4d7b0`, `e37a52b`) confirmed present via `git log --oneline --all`. `npm run typecheck` and `npm run lint` both clean; `npx playwright test e2e/56-purchase-orders.spec.ts` — 4/4 passed, run twice consecutively with no flakiness.
