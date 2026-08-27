# Phase 9: Reopen-and-edit a completed sale - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A manager can reopen a completed/paid sale (via the existing `reopen_tab` RPC) and then add or remove line items on it, using the existing `create_order_with_items`/`useMutationAddOrder` RPC (add) and `remove_tab_item` RPC (remove) — explicitly NOT `edit_paid_tab`, whose status guard structurally excludes reopened (`status='open'`) sales and must stay unchanged. Re-closing/re-paying the reopened sale is out of scope — the phase only covers reopen + item edit, not a second checkout.

This phase resolves the open wiring question flagged in STATE.md/ROADMAP: `RemoveTabItemDialog`/`useRemoveTabItem` are NOT orphaned-and-broken the way `void-order` was — they are fully functional and tested, just never composed into any live UI (confirmed via codebase scout: zero non-test references anywhere in `src/`). The dialog's own doc comment references a `TableStatusPanel` parent that was deleted in Phase 1's bar-pos strip — that parent needs a replacement, not the dialog itself.

</domain>

<decisions>
## Implementation Decisions

### Edit surface (where reopen→edit lives)
- **D-01:** Add/remove-item editing happens in a new panel/sheet on `/payments` (`PaymentPane`), not by sending the manager to `/pos`. Visually similar in shell to `EditPaidTabDialog` (row list, qty/price, add-item affordance) but wired to `create_order_with_items` (add) + `remove_tab_item` (remove) instead of `edit_paid_tab`'s atomic multi-patch RPC. — **Reversibility:** costly — changing this later means moving the whole edit UX to a different page and re-threading `/pos`'s currently tab-unaware scan/search-to-cart flow to accept an existing tab, which CLAUDE.md's routes table explicitly says `/pos` does not do today.
- **D-02:** Entry point is a new standalone button on the payment row (e.g. "Edit items"), decoupled from the reopen action itself — same per-row-action pattern as the existing `EditTicketButton`/`RefundButton`/`ReopenTabButton`. It appears once the row's tab is `status='open'` (reopened), not auto-opened immediately after the reopen dialog succeeds.

### PIN gating
- **D-03:** Every add-item save and every item removal on a reopened sale gets its own manager PIN gate — consistent with the existing per-action pattern (`reopen_tab`, `remove_tab_item`, `edit_paid_tab` are each independently PIN-gated today). No session-scoped "one PIN unlocks several edits" mechanism.
- **D-04 — add-item shape reconciled with D-03:** Adding an item is inline-row UX (pick product/qty/price directly in the panel, like `EditPaidTabDialog`'s `addedRows`), with ONE `ManagerPinDialog` confirming the whole pending add when the manager hits Save — "PIN per action" means per save-action (submitting a `create_order_with_items` call), not per keystroke while composing the row. This differs from remove, which stays one-item-per-PIN-prompt (D-05) — the two flows are not required to be symmetric.

### Remove-item UI reuse
- **D-05:** Reuse `RemoveTabItemDialog`/`useRemoveTabItem` as-is — no rewrite. It already calls the correct `remove_tab_item` RPC, has correct `TAB_NOT_OPEN`/`NOT_FOUND` error handling, and has existing test coverage (`useRemoveTabItem.test.ts`, `RemoveTabItemDialog.test.tsx`). Only new work: a new parent (the D-01 panel) composes it with a `ManagerPinDialog`, replacing the deleted `TableStatusPanel`'s role. Its own per-item `ConfirmDialog`-with-reason shell is kept, not converted to `EditPaidTabDialog`'s inline-remove-button style — the two features intentionally look different (remove-confirm-with-reason vs. add-inline-then-save).

### Claude's Discretion
- Exact new panel component name/location under `src/widgets/PaymentPane/` or a new feature folder — planner's call, following FSD (a widget composing the `remove-tab-item` and new `add-item-to-tab` features).
- Whether the new panel is a `Sheet` (matching `EditPaidTabDialog`) or a different shared/ui primitive — planner's call, `Sheet` is the established pattern for this kind of "editing an in-progress sale" surface in this codebase.
- `add-item-to-tab/`'s internal structure (mutation hook wrapping `useMutationAddOrder`, or calling `create_order_with_items` directly) — planner's call per ROADMAP SC-2's "thin wrapper" framing; the existing leftover `ModifierSheet.tsx` in that folder is unrelated bar-pos modifier UI and is not to be reused or extended for this.
- Whether the new "Edit items" button needs its own translation namespace entry or reuses `wPanels`/`featOrders` per the existing i18n namespace table — planner's call, follow CLAUDE.md's namespace-per-FSD-layer convention.
- Test fixture switch from hand-built tab/order/order_items rows to a `process_direct_sale_atomic`-originated fixture (SC-4) — a test-infrastructure detail for planner/executor, not a product decision.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` (SALE-03 definition, line 19)
- `.planning/ROADMAP.md` §"Phase 9: Reopen-and-edit a completed sale" (lines 190-206) — success criteria SC1-5
- `.planning/STATE.md` — "Blockers/Concerns" section flags the `RemoveTabItemDialog`/`useRemoveTabItem` open wiring question this discussion resolved

### Reopen (existing, unchanged)
- `src/features/reopen-tab/model/useReopenTab.ts` — existing `reopen_tab` RPC caller
- `src/features/reopen-tab/ui/ReopenTabDialog.tsx` — existing reopen dialog, PIN-gated, already wired into `PaymentPane`
- `e2e/48-reopen-closed-ticket.spec.ts` — existing SC-1 coverage (reopen click-through only); must be extended (or a sibling spec added) for SC-2/SC-3, and its `seedPaidTab` helper must be replaced with a fixture originating from `process_direct_sale_atomic` per SC-4

### Add-item (new wiring, SC-2)
- `src/entities/tab/model/queries.ts` lines 516, 550 — `useMutationAddOrder`, calls `create_order_with_items` RPC
- `src/app/OfflineQueueProcessor.tsx` line 67 — existing consumer of `useMutationAddOrder` for the offline-queue-replay path (pattern reference)
- `src/features/add-item-to-tab/ui/ModifierSheet.tsx` — leftover bar-pos modifier UI in this folder; NOT the add-item feature to build, do not extend
- `src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx` lines 305-368, 142-153 — `addedRows` inline-add-row pattern to follow for D-04

### Remove-item (existing, unwired, SC-3)
- `src/features/remove-tab-item/useRemoveTabItem.ts` — functional, tested, calls `remove_tab_item` RPC with correct `TAB_NOT_OPEN` handling; reuse as-is per D-05
- `src/features/remove-tab-item/ui/RemoveTabItemDialog.tsx` — functional, tested `ConfirmDialog`-based UI; its doc comment (lines 22-28) references the deleted `TableStatusPanel` — the new D-01 panel replaces that role
- `src/features/manager-pin-gate/` — `ManagerPinDialog` component/pattern for the new per-action PIN gates (D-03)

### PaymentPane integration point (SC-1/2/3 UI home)
- `src/widgets/PaymentPane/ui/PaymentPane.tsx` — existing per-row action buttons (`RefundButton`, `EditTicketButton`, `ReopenTabButton` at lines 21-95); the new "Edit items" button (D-02) follows this exact pattern
- `src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx` (full file) — closest existing analog for the new panel's shell/visual style (D-01)

### edit_paid_tab guard (must stay unchanged, SC-5)
- `src/features/edit-paid-tab/model/useEditPaidTab.ts` — the RPC/guard that must continue to structurally exclude `status='open'` sales
- Existing test coverage for that guard (exact file TBD at research time) — confirm it still passes unmodified

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RemoveTabItemDialog` + `useRemoveTabItem` — fully built and tested, zero live callers today; drop into the new panel as-is (D-05).
- `useMutationAddOrder` (`src/entities/tab/model/queries.ts`) — existing, tested, already has one live consumer (`OfflineQueueProcessor`) — the new `add-item-to-tab` feature wraps this, doesn't reinvent it.
- `ManagerPinDialog` (`src/features/manager-pin-gate/`) — the established PIN-gate component, reused for both new add and remove-in-context flows.
- `EditPaidTabDialog`'s `addedRows`/`updateAddedRow`/`handleAddItem` pattern — direct template for the new inline add-item row UX (D-04).

### Established Patterns
- Per-row action buttons in `PaymentPane` (`RefundButton`, `EditTicketButton`, `ReopenTabButton`) each independently check `payment.status`/`payment.isRefund` to decide visibility — the new "Edit items" button follows this, gated on the tab being `status='open'`.
- Every sensitive mutation in this phase's scope already returns `Result<T, AppError>` via `err()`/`ok()` and is independently PIN-gated via `ManagerPinDialog` with a `requiredAction` check — no new pattern needed, just composition.
- FSD: existing dialogs following "Sheet → fields → PIN gate → submit" shape (`EditPaidTabDialog`, `RefundSheet`) are the template weight-class for the new panel.

### Integration Points
- New panel composes into `PaymentPane` alongside the existing `EditPaidTabDialog`/`ReopenTabDialog` state management (`reopenTarget`, similar `editItemsTarget`-style local state).
- `remove_tab_item` RPC already returns `TAB_NOT_OPEN` as a distinct error code — confirms the RPC layer was already built anticipating this exact reopened-sale-editing use case, even though the UI never got wired up.

</code_context>

<specifics>
## Specific Ideas

No specific visual/copy references beyond "should look and feel like `EditPaidTabDialog`" for the add side, and "keep `RemoveTabItemDialog` exactly as it is" for the remove side — both explicitly discussed and decided above.

</specifics>

<deferred>
## Deferred Ideas

None raised — discussion stayed within Phase 9's SALE-03 scope (reopen + add/remove items). Re-closing/re-paying a reopened sale was explicitly named as out of scope, not deferred to a specific future phase — it isn't in ROADMAP.md/REQUIREMENTS.md at all currently.

### Reviewed Todos (not folded)
None — STATE.md's "Pending Todos" section is empty ("None yet"); `todo.match-phase 9` was not run with matches to review during this session.

</deferred>

---

*Phase: 09-reopen-and-edit-a-completed-sale*
*Context gathered: 2026-08-18*
