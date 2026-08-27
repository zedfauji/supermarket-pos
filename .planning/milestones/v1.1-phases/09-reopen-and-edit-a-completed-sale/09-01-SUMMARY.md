---
phase: 09-reopen-and-edit-a-completed-sale
plan: 01
subsystem: payments
tags: [react-query, i18n, e2e, playwright, tab-editing, rpc-wrapper]

requires:
  - phase: 08-sale-payment-wiring-and-cleanup
    provides: process_direct_sale_atomic RPC, reopen_tab RPC/useReopenTab/ReopenTabDialog
provides:
  - "useAddItemToTab (thin wrapper over useMutationAddOrder) with unit tests"
  - "EditReopenedItemsPanel (Sheet widget, add-item side) composed into PaymentPane"
  - "EditItemsButton on PaymentPane payment rows, gated on live tab.status==='open'"
  - "e2e/48-reopen-closed-ticket.spec.ts fixture rebuilt on process_direct_sale_atomic (SC-4), SC-2 add-item coverage"
affects: [09-03-remove-item-and-guard-test]

actuals:
  tokens: 11425
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Thin RPC-wrapper feature hook: useAddItemToTab wraps an existing entity mutation hook (useMutationAddOrder) instead of calling supabase.rpc directly, reusing its offline guard/version guard/invalidation"
    - "Live tab-status visibility gate: new row-action buttons that depend on the tab's current status query useTab(payment.tabId) directly rather than inferring from a payment-status heuristic"

key-files:
  created:
    - src/features/add-item-to-tab/model/useAddItemToTab.ts
    - src/features/add-item-to-tab/model/useAddItemToTab.test.ts
    - src/features/add-item-to-tab/index.ts
    - src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx
  modified:
    - e2e/48-reopen-closed-ticket.spec.ts
    - src/widgets/PaymentPane/ui/PaymentPane.tsx
    - src/widgets/PaymentPane/ui/PaymentPane.test.tsx
    - src/features/reopen-tab/model/useReopenTab.ts
    - src/shared/lib/i18n/locales/en-US/featOrders.json
    - src/shared/lib/i18n/locales/es-MX/featOrders.json
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json

key-decisions:
  - "seedPaidTabViaDirectSale seeds unit_price at exactly product.base_price (not an offset) — process_direct_sale_atomic's own PRICE_MISMATCH check rejects any item whose unit_price differs from the catalog price by more than 0.01, so the plan's literal '(unitPriceOffset = 0)' signature couldn't carry a non-zero call-site value and still succeed."
  - "seedPaidTabViaDirectSale creates its own fallback shift (mirrors the old hand-built seedPaidTab) instead of depending on a prior browser-side login to open one — decouples DB seeding from UI/hydration timing races."
  - "EditReopenedItemsPanel's successful add keeps the Sheet open (resets addedRows, no close) — this panel will host a second independent PIN-gated action (item removal) once 09-03 lands, so closing on every save would be poor UX for a manager doing several edits in one visit."

patterns-established:
  - "New per-row PaymentPane buttons that need to react to a reopened tab must query useTab(payment.tabId) directly, and the mutation that flips the tab's status must explicitly invalidate that tab's tabKeys.detail(id) query — invalidating only tabKeys.lists() is not enough because a per-row detail query can already be mounted (and cached stale) before the flip happens."

requirements-completed: []  # SALE-03 remains partially complete — add-item (SC-2) and the fixture rebuild (SC-4) landed here; remove-item (SC-3) is 09-03's scope, and SALE-03 as a whole isn't done until both sub-flows exist.

coverage:
  - id: D1
    description: "e2e/48-reopen-closed-ticket.spec.ts's fixture rebuilt on process_direct_sale_atomic (SC-4); SC-1's existing manager-happy-path and bartender-negative reopen tests still pass unmodified against the new fixture"
    requirement: SALE-03
    verification:
      - kind: e2e
        ref: "e2e/48-reopen-closed-ticket.spec.ts -g \"SC-1\""
        status: pass
    human_judgment: false
  - id: D2
    description: "Manager reopens a paid sale, clicks the new 'Edit items' row button, adds a line item via EditReopenedItemsPanel, PIN-confirms once, and the item appears in the panel and as a new order_items row"
    requirement: SALE-03
    verification:
      - kind: e2e
        ref: "e2e/48-reopen-closed-ticket.spec.ts -g \"SC-2\""
        status: pass
      - kind: unit
        ref: "src/features/add-item-to-tab/model/useAddItemToTab.test.ts"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-08-18
status: complete
---

# Phase 9 Plan 01: Reopened-sale add-item tracer slice Summary

**`useAddItemToTab` thin RPC wrapper + `EditReopenedItemsPanel` Sheet (add-item side) wired into `PaymentPane` via a new live-status-gated `EditItemsButton`, proven by an `e2e/48-reopen-closed-ticket.spec.ts` fixture rebuilt on `process_direct_sale_atomic`.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-18T17:40Z (approx, session start)
- **Completed:** 2026-08-18T18:24Z
- **Tasks:** 3
- **Files modified:** 12 (4 created, 8 modified)

## Accomplishments
- Rebuilt `e2e/48-reopen-closed-ticket.spec.ts`'s seed fixture on the real `process_direct_sale_atomic` service-role RPC (SC-4), replacing hand-built `tabs`/`orders`/`order_items`/`payments` inserts — the two existing SC-1 tests pass unmodified against it.
- Added the new SC-2 E2E coverage: a manager reopens a paid sale, adds a line item through the new panel, PIN-confirms once, and the item lands in both the UI and `order_items`.
- Built `useAddItemToTab`, a thin wrapper over the already-tested `useMutationAddOrder` that submits every pending row in ONE `create_order_with_items` call (D-04), plus 3 unit tests mirroring `useReopenTab.test.ts`'s mocking shape.
- Built `EditReopenedItemsPanel` (add-item side only — existing items render read-only) and wired a new `EditItemsButton` into `PaymentPane`, visible only when the row's tab is live-`status='open'`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebuild the E2E fixture on process_direct_sale_atomic and write the failing SC-2 test (RED)** - `946a774` (test)
2. **Task 2: useAddItemToTab — thin wrapper over useMutationAddOrder** - `396a021` (feat)
3. **Task 3: EditReopenedItemsPanel + EditItemsButton wiring (GREEN)** - `35145b7` (feat)

_No separate plan-metadata commit — this is a worktree-parallel plan; STATE.md/ROADMAP.md are updated centrally by the orchestrator after the wave merges._

## Files Created/Modified
- `e2e/48-reopen-closed-ticket.spec.ts` - `seedPaidTabViaDirectSale` fixture (SC-4) + new SC-2 add-item test block
- `src/features/add-item-to-tab/model/useAddItemToTab.ts` - thin wrapper over `useMutationAddOrder`
- `src/features/add-item-to-tab/model/useAddItemToTab.test.ts` - unit coverage (RPC shape, success, unmapped-error handling)
- `src/features/add-item-to-tab/index.ts` - new barrel, exports only `useAddItemToTab`
- `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx` - new Sheet, add-item side
- `src/widgets/PaymentPane/ui/PaymentPane.tsx` - new `EditItemsButton` + panel mount/state
- `src/widgets/PaymentPane/ui/PaymentPane.test.tsx` - added missing `useMutationAddOrder` mock stub (deviation, see below)
- `src/features/reopen-tab/model/useReopenTab.ts` - added `tabKeys.detail(tabId)` invalidation (deviation, see below)
- `src/shared/lib/i18n/locales/{en-US,es-MX}/featOrders.json` - new `editReopenedItems` namespace
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wPanels.json` - new `paymentPane.editItems` key

## Decisions Made
- `seedPaidTabViaDirectSale` seeds at exactly `product.base_price` (no offset) — `process_direct_sale_atomic`'s `PRICE_MISMATCH` guard rejects any deviation beyond 0.01, so RESEARCH.md's Assumption A2 ("flat `base_price` may not need a tax adjustment") turned out to also forbid the plan's own literal `unitPriceOffset` parameter carrying a non-zero value at any call site.
- `seedPaidTabViaDirectSale` creates its own fallback shift via the service-role client rather than relying on a prior UI login to open one, decoupling fixture seeding from browser/hydration timing.
- A successful add-item save keeps `EditReopenedItemsPanel` open (resets `addedRows`, no `onOpenChange(false)`) since the panel will host a second independent PIN-gated action (remove-item, 09-03) — closing after every single-item save would force a manager to reopen the panel for each additional edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `e2e/48-reopen-closed-ticket.spec.ts`'s SC-1 selectors were stale es-MX copy, but the fixed E2E accounts render en-US**
- **Found during:** Task 1
- **Issue:** The spec's existing SC-1 tests asserted on Spanish button/toast text (`'Reabrir cuenta'`, `'Solicitar aprobación'`, `/cuenta reabierta correctamente/i`), but `loginAs('manager'/'cashier')` uses the fixed E2E accounts, which CLAUDE.md documents as pinned to en-US since commit 331e1b6 — predating this file's Spanish-selector convention. Both SC-1 tests were failing at HEAD, independent of the fixture rebuild.
- **Fix:** Translated every UI-text selector in the file (button names, dialog names, toast regex) to the en-US copy the app actually renders; added a header-comment note explaining the locale convention for future editors.
- **Files modified:** `e2e/48-reopen-closed-ticket.spec.ts`
- **Verification:** `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-1"` — both tests pass.
- **Committed in:** `946a774`

**2. [Rule 3 - Blocking] `seedPaidTabViaDirectSale` needed its own shift-creation fallback and exact catalog-price matching**
- **Found during:** Task 1
- **Issue:** (a) `resetTestState()` closes every open shift before each test, and the plan's literal helper (select-only, no create) threw `open shift not found` when called before any browser login opened one. (b) `process_direct_sale_atomic`'s `PRICE_MISMATCH` guard requires `unit_price` to match `products.base_price` within 0.01 — the plan's `unitPriceOffset` parameter, if given a non-zero call-site value (as literally instructed), would always fail this check.
- **Fix:** Added a shift-creation fallback (mirrors the old `seedPaidTab`'s pattern) and dropped the offset parameter, always seeding at exactly `product.base_price`.
- **Files modified:** `e2e/48-reopen-closed-ticket.spec.ts`
- **Verification:** `npx playwright test e2e/48-reopen-closed-ticket.spec.ts` — all 3 tests (SC-1 x2, SC-2) pass together.
- **Committed in:** `946a774`

**3. [Rule 1 - Bug] `useReopenTab`'s success path left every row's already-mounted `useTab(tabId)` query stale at `status='paid'`**
- **Found during:** Task 3 (SC-2 E2E verification)
- **Issue:** The new `EditItemsButton` reads `useTab(payment.tabId).status`, per RESEARCH.md Pitfall 3's explicit guidance to use the live tab status. But `PaymentHistoryList`'s rows are keyed by `payment.id` (stable across re-renders), so each row's `EditItemsButton` — and its `useTab` query — was already mounted (and cached at `status='paid'`) on first page load, before any reopen happened. `useReopenTab`'s success handler only invalidated `tabKeys.lists()`/`paymentKeys.lists()`/`auditKeys.all`, never the individual tab's `tabKeys.detail(id)` — so the button never appeared after a successful reopen.
- **Fix:** Added `void qc.invalidateQueries({ queryKey: tabKeys.detail(input.tabId) })` alongside the existing invalidation calls in `useReopenTab.ts`.
- **Files modified:** `src/features/reopen-tab/model/useReopenTab.ts`
- **Verification:** `npx vitest run src/features/reopen-tab/model/useReopenTab.test.ts` (3/3 still pass, no assertions touched); `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-2"` now passes.
- **Committed in:** `35145b7`

**4. [Rule 1 - Bug, test infra] `PaymentPane.test.tsx`'s existing `@entities/tab/model/queries` mock was missing `useMutationAddOrder`**
- **Found during:** Task 3
- **Issue:** The plan's own action text asserted "the new panel reuses those same stubs without any test-file edit," but `EditReopenedItemsPanel` (mounted unconditionally in `PaymentPane`, matching `EditPaidTabDialog`'s established pattern) calls `useAddItemToTab()`, which calls `useMutationAddOrder()` from the same mocked module. The existing `vi.mock` factory only defined `useTabs`/`useTab`/`tabKeys`, so every one of `PaymentPane.test.tsx`'s 8 tests failed with "No `useMutationAddOrder` export is defined on the mock."
- **Fix:** Added one stubbed export (`useMutationAddOrder: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false })`) to the existing mock factory — no assertions or test bodies changed.
- **Files modified:** `src/widgets/PaymentPane/ui/PaymentPane.test.tsx`
- **Verification:** `npx vitest run src/widgets/PaymentPane/ui/PaymentPane.test.tsx` — all 8 existing tests pass, none of their assertions modified.
- **Committed in:** `35145b7`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bug fixes in the E2E spec, 1 Rule 3 blocking fixture fix, 1 Rule 1 bug fix in `useReopenTab`, 1 Rule 1 minimal test-mock fix).
**Impact on plan:** All four were required for the plan's own acceptance criteria (SC-1/SC-2 both green, `PaymentPane.test.tsx` green) to actually hold. No scope creep beyond what verification demanded — no assertions were weakened or removed in either modified test file.

## Issues Encountered
- **Shared dev-server port contention (environmental, not code):** This worktree runs alongside a parallel sibling agent (plan 09-02) executing in its own worktree, but `vite.config.ts` pins the dev server to a fixed port (1520, required by Tauri). Several early E2E attempts hit `ERR_CONNECTION_REFUSED`/`ERR_CONNECTION_RESET` because the sibling's dev server was transiently occupying that port. Resolved by retrying once port 1520 was free and starting this worktree's own `npm run dev` explicitly. No code change was needed or made for this.
- **Unrelated integration-test noise from the same shared backend:** A full `npx vitest run` (not required by this plan's own `<verify>` block, run as an extra sanity check) showed ~35 failures across 10 integration-test files (tip-distribution, split-payment, various report suites, `edit-paid-tab-rpc`, `process-refund-rpc`, `reopen-tab-rpc`) — all `NO_OPEN_CAJA` or similar shared-state errors, none in files this plan touches. This traces to the same shared live Supabase backend being reset/closed by concurrent E2E runs (mine and/or the sibling's) mid-suite. Confirmed unrelated via `git diff --stat` (none of the 10 failing files appear in this plan's diff) and via `useReopenTab.test.ts` (the one file I did touch) passing cleanly in isolation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `EditReopenedItemsPanel`'s add-item side and `useAddItemToTab` are ready for 09-03 to extend with the remove-item side (composing `RemoveTabItemDialog`/`useRemoveTabItem` per D-05, plus the SC-5 `edit_paid_tab` guard test).
- The `tabKeys.detail(tabId)` invalidation fix in `useReopenTab.ts` benefits any future per-row live-status UI, not just this panel.
- SALE-03 is NOT yet complete — only SC-2 (add) and part of SC-4 (fixture) landed here; SC-3 (remove) and the SC-5 guard test are 09-03's scope.

## Self-Check: PASSED

- FOUND: src/features/add-item-to-tab/model/useAddItemToTab.ts
- FOUND: src/features/add-item-to-tab/model/useAddItemToTab.test.ts
- FOUND: src/features/add-item-to-tab/index.ts
- FOUND: src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx
- FOUND: commit 946a774
- FOUND: commit 396a021
- FOUND: commit 35145b7

---
*Phase: 09-reopen-and-edit-a-completed-sale*
*Completed: 2026-08-18*
