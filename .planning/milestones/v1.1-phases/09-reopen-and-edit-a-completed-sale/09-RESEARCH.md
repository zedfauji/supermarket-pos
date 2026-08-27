# Phase 9: Reopen-and-edit a completed sale - Research

**Researched:** 2026-08-18
**Domain:** In-repo FSD composition — reusing three already-built RPCs/hooks/dialogs behind a new panel and PIN gate. No new external libraries, no new database migrations expected.
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add/remove-item editing happens in a new panel/sheet on `/payments` (`PaymentPane`), not by sending the manager to `/pos`. Visually similar in shell to `EditPaidTabDialog` (row list, qty/price, add-item affordance) but wired to `create_order_with_items` (add) + `remove_tab_item` (remove) instead of `edit_paid_tab`'s atomic multi-patch RPC. — Reversibility: costly (would require re-threading `/pos` to accept an existing tab).
- **D-02:** Entry point is a new standalone button on the payment row (e.g. "Edit items"), decoupled from the reopen action itself — same per-row-action pattern as `EditTicketButton`/`RefundButton`/`ReopenTabButton`. Appears once the row's tab is `status='open'` (reopened), not auto-opened after reopen succeeds.
- **D-03:** Every add-item save and every item removal on a reopened sale gets its own manager PIN gate — no session-scoped "one PIN unlocks several edits" mechanism.
- **D-04:** Adding an item is inline-row UX (pick product/qty/price directly in the panel, like `EditPaidTabDialog`'s `addedRows`), with ONE `ManagerPinDialog` confirming the whole pending add when the manager hits Save — "PIN per action" means per save-action (submitting one `create_order_with_items` call), not per keystroke. Differs from remove (D-05), which stays one-item-per-PIN-prompt — the two flows are not required to be symmetric.
- **D-05:** Reuse `RemoveTabItemDialog`/`useRemoveTabItem` as-is — no rewrite. Only new work: a new parent (the D-01 panel) composes it with a `ManagerPinDialog`, replacing the deleted `TableStatusPanel`'s role. Its per-item `ConfirmDialog`-with-reason shell is kept, not converted to `EditPaidTabDialog`'s inline-remove-button style.

### Claude's Discretion

- Exact new panel component name/location under `src/widgets/PaymentPane/` or a new feature folder — following FSD (a widget composing `remove-tab-item` and new `add-item-to-tab` features).
- Whether the new panel is a `Sheet` (matching `EditPaidTabDialog`) or a different shared/ui primitive — `Sheet` is the established pattern.
- `add-item-to-tab/`'s internal structure (mutation hook wrapping `useMutationAddOrder`, or calling `create_order_with_items` directly) — the leftover `ModifierSheet.tsx` in that folder is unrelated bar-pos modifier UI, not to be reused or extended.
- Whether the new "Edit items" button needs its own translation namespace entry or reuses `wPanels`/`featOrders` per the existing i18n namespace table.
- Test fixture switch from hand-built tab/order/order_items rows to a `process_direct_sale_atomic`-originated fixture (SC-4) — a test-infrastructure detail for planner/executor.

### Deferred Ideas (OUT OF SCOPE)

None raised — discussion stayed within Phase 9's SALE-03 scope. Re-closing/re-paying a reopened sale is explicitly out of scope and not tracked anywhere in ROADMAP.md/REQUIREMENTS.md.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SALE-03 | A manager can reopen a completed/paid sale and edit its line items (add/remove), using the existing `reopen_tab`/`create_order_with_items`/`remove_tab_item` RPCs — not `edit_paid_tab`. `48-reopen-closed-ticket.spec.ts` passes again. | `reopen_tab` RPC verified unmodified and already wired (`ReopenTabDialog`/`useReopenTab`, live in `PaymentPane`). `create_order_with_items` verified via `useMutationAddOrder` (existing, tested, one live consumer). `remove_tab_item` verified via `useRemoveTabItem`/`RemoveTabItemDialog` (existing, tested, zero live consumers — this phase's real wiring gap). `edit_paid_tab`'s guard verified structurally excluding `status='open'` (source quoted below) — confirms SC-5 is a no-code-change / test-only requirement. |

</phase_requirements>

## Summary

This phase is pure composition, not new-system design. All three RPCs (`reopen_tab`, `create_order_with_items`, `remove_tab_item`) already exist, are already tested, and already behave correctly for a reopened sale — `remove_tab_item`'s own guard (`v_tab_status <> 'open'`) and `edit_paid_tab`'s own guard (`v_status NOT IN ('paid', 'closed')`) were written with this exact reopened-sale scenario in mind, even though the UI was never wired up. The only genuinely new code is: (1) one new widget/panel on `/payments` that composes `RemoveTabItemDialog` (verbatim) and a new thin `add-item-to-tab` feature (wrapping the already-tested `useMutationAddOrder`) behind their own `ManagerPinDialog` gates, and (2) a new "Edit items" button on `PaymentPane`'s payment row following the exact `EditTicketButton`/`ReopenTabButton` pattern already in that file.

The one non-trivial open question this research resolves for the planner: the deleted `TableStatusPanel`'s old PIN gate for item removal used `requiredAction="void_order"` — a `StaffAction` that no longer exists in `src/shared/lib/rbac.ts` (the `void_order` RBAC action was deleted end-to-end in Phase 5). That value cannot be reused. The planner must pick a manager+-only `StaffAction` for the new panel's PIN gates; reusing the existing `'reopen_tab'` action (already manager+-only, already semantically "this reopened-sale editing surface requires a manager") is the zero-diff choice — it requires no change to `rbac.ts`'s `STAFF_ACTIONS`/`MANAGER_EXTRA` sets. See Pitfall 1 below.

**Primary recommendation:** Build one new widget-level component (e.g. `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx` or a sibling feature-composing widget) that is a `Sheet` opened from a new `EditItemsButton` in `PaymentPane.tsx`, follows `EditPaidTabDialog`'s `addedRows` pattern for the add side (backed by a new thin `src/features/add-item-to-tab/model/useAddItemToTab.ts` wrapping `useMutationAddOrder`), and composes `RemoveTabItemDialog`/`useRemoveTabItem` unmodified for the remove side, gating both save actions behind `ManagerPinDialog requiredAction="reopen_tab"`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reopen a paid/closed sale (`reopen_tab`) | API / Backend (Postgres RPC, `SECURITY DEFINER`) | Browser/Client (`ReopenTabDialog`, already built) | Status flip + payment-void + caja-offset + audit must be one atomic server-side transaction; already fully implemented and unchanged by this phase. |
| Add a line item to the reopened sale | API / Backend (`create_order_with_items` RPC via `useMutationAddOrder`) | Browser/Client (new inline-row UI in the panel) | Server RPC already owns catalog-price validation, inventory depletion, and version-guard; client only composes existing pieces. |
| Remove a line item from the reopened sale | API / Backend (`remove_tab_item` RPC via `useRemoveTabItem`) | Browser/Client (`RemoveTabItemDialog`, reused verbatim) | RPC already owns inventory restore + parent-order-void-if-empty + audit; already fully built and tested, just unwired. |
| Manager PIN authorization for add/remove | Browser/Client (`ManagerPinDialog`, UX gate) | API / Backend (server-side role re-check inside each RPC, defense-in-depth) | Client PIN check is UX only — every RPC this phase touches (`reopen_tab`, `edit_paid_tab`) already re-checks `profiles.role IN ('manager','admin')` server-side; `remove_tab_item` deliberately has **no** server-side role check (D-07 in its own migration header — matches `useRemoveTabItem`'s current bartender-accessible level). This phase's new PIN gates are therefore the *only* enforcement point for remove/add on a reopened sale unless a future phase adds a server-side check to those two RPCs. |
| Entry-point visibility ("Edit items" button) | Browser/Client (`PaymentPane.tsx`) | — | Pure UI-state row-button visibility, same tier as its three siblings. |

## Standard Stack

No new libraries. This phase is 100% composition of already-installed, already-used dependencies:

| Library | Version (from package.json, already in use) | Purpose in this phase |
|---------|-----------------------------------------------|------------------------|
| `@tanstack/react-query` v5 | pinned per project stack table | `useMutationAddOrder` (existing), any new `useAddItemToTab` wrapper hook |
| `react-i18next` | pinned per project stack table | New `featOrders`/`wPanels` keys per UI-SPEC copy contract |
| `zod` v4 | pinned per project stack table | No new schema needed — `OrderItemCreateSchema`/`OrderCreateSchema` already cover the add-item payload shape |
| `@supabase/supabase-js` | pinned per project stack table | RPC calls, already wrapped by `supabaseMutation`/`supabaseQuery` helpers |

**No `Package Legitimacy Audit` section** — this phase installs zero new packages. `npm install` is not part of this phase's task list.

**No `Environment Availability` section** — this phase has no new external dependency beyond the already-running Supabase project and already-configured Playwright/Chrome, both established in prior phases.

## Architecture Patterns

### System Architecture Diagram

```
PaymentPane (widget, /payments)
  │
  ├─ PaymentHistoryList → payment row
  │     ├─ [existing] RefundButton / EditTicketButton / ReopenTabButton
  │     └─ [NEW] EditItemsButton  ──visible only when selected payment's tab.status === 'open'──┐
  │                                                                                              │
  │                                                                                              ▼
  │                                                                          [NEW] EditReopenedItemsPanel (Sheet)
  │                                                                              │
  │                                                       ┌──────────────────────┼───────────────────────┐
  │                                                       ▼                                                ▼
  │                                          Add-item inline rows (EditPaidTabDialog                 Existing items list
  │                                          addedRows pattern) → Save button                         → per-row Remove button
  │                                                       │                                                │
  │                                                       ▼                                                ▼
  │                                          ManagerPinDialog (requiredAction=                  ManagerPinDialog (requiredAction=
  │                                          "reopen_tab", one gate per Save)                    "reopen_tab", one gate per item)
  │                                                       │                                                │
  │                                                       ▼                                                ▼
  │                                    useAddItemToTab (NEW, thin wrapper)              RemoveTabItemDialog + useRemoveTabItem (REUSED, unmodified)
  │                                                       │                                                │
  │                                                       ▼                                                ▼
  │                                    useMutationAddOrder (EXISTING)                    supabase.rpc('remove_tab_item', ...) (EXISTING)
  │                                                       │                                                │
  │                                                       ▼                                                ▼
  │                                    supabase.rpc('create_order_with_items', ...)          Postgres: restores inventory, hard-deletes
  │                                    (EXISTING RPC, catalog-price + version-guarded)        order_item, voids parent order if empty
  │
  └─ [existing, unchanged] ReopenTabDialog → supabase.rpc('reopen_tab', ...)
```

Entry to the whole flow is always the same payment row in `PaymentHistoryList` — a manager reopens (existing `ReopenTabButton` → `ReopenTabDialog`), the row re-renders once `tabs.status` flips to `'open'` (query invalidation already wired in `useReopenTab`), and the new `EditItemsButton` appears on that same row.

### Recommended Project Structure

```
src/
├── widgets/PaymentPane/
│   ├── ui/
│   │   ├── PaymentPane.tsx              # +1 button, +1 panel-open state, +1 <EditReopenedItemsPanel> mount
│   │   └── EditReopenedItemsPanel.tsx   # NEW — the D-01 Sheet, composes both features
│   └── ...
├── features/
│   ├── add-item-to-tab/
│   │   ├── model/
│   │   │   ├── useAddItemToTab.ts       # NEW — thin wrapper over useMutationAddOrder
│   │   │   └── useAddItemToTab.test.ts  # NEW — unit test, mirrors useReopenTab.test.ts shape
│   │   ├── ui/ModifierSheet.tsx         # UNTOUCHED — unrelated bar-pos leftover, do not extend
│   │   └── index.ts                     # NEW — barrel export (this folder currently has none)
│   └── remove-tab-item/                 # UNTOUCHED — reused as-is (D-05)
│       ├── useRemoveTabItem.ts
│       └── ui/RemoveTabItemDialog.tsx
└── entities/tab/model/queries.ts        # UNTOUCHED — useMutationAddOrder already exists (lines 516-586)
```

`src/features/remove-tab-item/` currently has no `index.ts` barrel (unlike `reopen-tab/` and `edit-paid-tab/`, which both do) — deep imports (`@features/remove-tab-item/ui/RemoveTabItemDialog`, `@features/remove-tab-item/useRemoveTabItem`) work today and are what CONTEXT.md's canonical refs already use; adding a barrel is optional polish, not required for the phase to function.

### Pattern 1: Thin RPC-wrapper feature hook (add-item-to-tab)

**What:** A `useMutation`-based hook in `features/add-item-to-tab/model/` that calls the existing `useMutationAddOrder` (from `entities/tab`) with a fixed `order.status` and maps its `Result` the same way `useReopenTab`/`useEditPaidTab` do (i18n'd error messages, no raw Postgres text per SALE-05 precedent).

**When to use:** For the add-item save action inside the new panel.

**Example (skeleton, following `useMutationAddOrder`'s verified call shape):**
```typescript
// Source: src/entities/tab/model/queries.ts:516-586 (useMutationAddOrder, verified this session)
// New file: src/features/add-item-to-tab/model/useAddItemToTab.ts
import { useMutationAddOrder } from '@entities/tab/model/queries';

export function useAddItemToTab() {
  const addOrder = useMutationAddOrder();

  async function addItem(input: {
    tabId: string;
    staffId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
  }) {
    return addOrder.mutateAsync({
      tabId: input.tabId,
      order: { staffId: input.staffId, status: 'pending', notes: null },
      items: [
        {
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          modifierIds: [],
          modifierPriceDelta: 0,
          notes: null,
        },
      ],
    });
  }

  return { addItem, isPending: addOrder.isPending };
}
```
`useMutationAddOrder`'s own price/catalog validation is inside `create_order_with_items` — this wrapper does not need to duplicate `EditPaidTabDialog`'s product-picker basePrice defaulting logic beyond what's needed for the inline row UI itself.

### Pattern 2: Panel composing an already-PIN-gated dialog (RemoveTabItemDialog)

**What:** `RemoveTabItemDialog` deliberately has **no** PIN gate inside it (its own doc comment: "Manager PIN gate (Step 1) is intentionally excluded: cross-feature imports violate FSD"). The parent must run `ManagerPinDialog` first, then open `RemoveTabItemDialog` only on `onSuccess`.

**When to use:** Exactly the two-step orchestration the deleted `TableStatusPanel` used to do (verified via `git log -p -- '**/TableStatusPanel*'` this session) — reproduce that same two-step state machine (`showPinForRemoval` → `showRemoveConfirm`) in the new panel, minus the `requiredAction="void_order"` value (see Pitfall 1).

**Example (verified from the deleted TableStatusPanel's actual code, git history):**
```typescript
// Source: git history, deleted src/widgets/TableStatusPanel/index.tsx (verified via `git log -p`)
// Adapt requiredAction to a still-valid StaffAction (see Pitfall 1) — do NOT
// reuse "void_order" as shown in the original deleted file, that value is gone.
<ManagerPinDialog
  open={showPinForRemoval}
  onOpenChange={open => { if (!open) { setShowPinForRemoval(false); setSelectedItemForRemoval(null); } }}
  requiredAction="reopen_tab"
  onSuccess={() => { setShowPinForRemoval(false); setShowRemoveConfirm(true); }}
/>
<RemoveTabItemDialog
  open={showRemoveConfirm}
  item={selectedItemForRemoval}
  tabId={tab?.id ?? ''}
  orderId={selectedItemForRemoval?.orderId ?? ''}
  onClose={() => { setShowRemoveConfirm(false); setSelectedItemForRemoval(null); }}
/>
```

### Pattern 3: Row-visibility gate on `status='open'` (new EditItemsButton)

**What:** Every existing sibling button in `PaymentPane.tsx` (`RefundButton`, `EditTicketButton`, `ReopenTabButton`) is a component that reads `payment.status`/`payment.isRefund` and returns `null` to hide itself — no shared visibility util, just an early return per component (verified in `PaymentPane.tsx` lines 25-91).

**When to use:** For the new `EditItemsButton` (D-02). It needs the **tab's** status (`'open'`), not the `payment`'s status — `Payment` doesn't carry `tabId`'s live tab status directly as a field usable for this check the way the other three buttons check `payment.status`. The panel-opening handler already has `payment.tabId`; the button itself will need a tab-status lookup (e.g. via the same `useTab`/`tabKeys` cache `EditPaidTabDialog`/`ReopenTabDialog` already read) to decide visibility, since a payment on a `status='paid'` tab (not yet reopened) must NOT show "Edit items" — only a reopened (`status='open'`) tab should.

**Example (skeleton, following the existing button pattern):**
```typescript
// Source: src/widgets/PaymentPane/ui/PaymentPane.tsx:46-67 (EditTicketButton, verified this session)
function EditItemsButton({ payment, onEditItems }: EditItemsButtonProps) {
  const { t } = useTranslation('wPanels');
  const { data: tab } = useTab(payment.tabId); // same hook ReopenTabDialog/EditPaidTabDialog already use

  if (payment.isRefund === true) return null;
  if (tab?.status !== 'open') return null; // only a reopened tab, not every paid tab

  return (
    <POSButton variant="outline" size="sm" onClick={() => { onEditItems(payment.tabId); }}>
      {t('paymentPane.editItems')}
    </POSButton>
  );
}
```

### Anti-Patterns to Avoid

- **Loosening `edit_paid_tab`'s guard to also accept `status='open'`:** SC-5 explicitly forbids this. The guard (`v_status NOT IN ('paid', 'closed')`, verified quote below) must stay unchanged — this phase's add/remove flow goes through `create_order_with_items`/`remove_tab_item`, never `edit_paid_tab`.
- **Reusing `requiredAction="void_order"`** copied verbatim from the deleted `TableStatusPanel` code (it's a tempting copy-paste source since it's the *exact* prior remove-item PIN gate) — that `StaffAction` value no longer exists in `rbac.ts`'s `STAFF_ACTIONS` array; using it would be a TypeScript compile error, not a silent runtime bug, but flagging it explicitly since it's the most likely "looks right, isn't" trap in this phase.
- **Building a new generic "edit tab items" abstraction shared between `EditPaidTabDialog` and the new panel:** the two flows use structurally different RPCs (`edit_paid_tab`'s single atomic multi-patch vs. `create_order_with_items` + `remove_tab_item`'s two separate calls) and different PIN-per-action granularity (D-04 vs D-05) — CONTEXT.md explicitly says they are "not required to be symmetric." Don't force a shared component; copy the *pattern*, not the code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Removing a line item from an open tab, restoring inventory, voiding an empty parent order | A new "reopened-sale remove" RPC or client-side inventory-restore logic | `remove_tab_item` RPC + `useRemoveTabItem`/`RemoveTabItemDialog` (existing, tested, D-05) | Already atomic, already audited, already has the exact `TAB_NOT_OPEN` guard this use case needs. |
| Adding a line item with catalog-price validation and version-guarded inventory depletion | A new "reopened-sale add" RPC | `create_order_with_items` RPC via existing `useMutationAddOrder` | Already handles optimistic-concurrency (`p_expected_version`) and is already exercised by the offline-queue replay path. |
| Manager-role PIN verification UI | A new PIN component or inline password field | `ManagerPinDialog` (existing, `src/features/manager-pin-gate/`) | Every sensitive mutation in this codebase already uses this exact component; it already reads `eligibleStaff` via `canAccess(role, requiredAction)`. |
| Server-side authorization for the PIN-gated actions | Trusting the client-side PIN check alone | Existing server-side `AUTH_FORBIDDEN` role re-checks inside `reopen_tab`/`edit_paid_tab` (already present); **note `remove_tab_item` intentionally has none** (see Architectural Responsibility Map row above) | Client PIN dialogs are UX only; this phase does not need to add a new server-side check to `remove_tab_item` per its own migration's explicit D-07 design note, but the planner should be aware the client PIN gate is the *only* real check on that path today. |

**Key insight:** Every piece of backend logic this phase needs was already built in Phases 22-24 (bar-pos era) specifically anticipating a reopened-sale-editing UI that was never wired up. The entire phase is UI composition risk, not backend-logic risk.

## Common Pitfalls

### Pitfall 1: `requiredAction="void_order"` no longer exists — do not copy it from the deleted `TableStatusPanel`
**What goes wrong:** The most direct historical precedent for "PIN-gate an item removal on a reopened/open tab" is the deleted `TableStatusPanel`'s exact two-step `ManagerPinDialog` → `RemoveTabItemDialog` orchestration (verified via `git log -p -- '**/TableStatusPanel*'` this session) — but that code used `requiredAction="void_order"`.
**Why it happens:** `void_order` was a valid `StaffAction` at the time `TableStatusPanel` was written; it was deleted end-to-end (RBAC seed rows, i18n keys, edge function, component) in Phase 5 of this same v1.1 milestone. `STAFF_ACTIONS` in `src/shared/lib/rbac.ts` (read this session, lines 13-32) is: `'create_order' | 'view_own_tabs' | 'view_all_tabs' | 'clock_in' | 'clock_out' | 'close_tab' | 'view_reports' | 'adjust_inventory' | 'manage_products' | 'manage_staff' | 'manage_settings' | 'delete_tab' | 'view_all_shifts' | 'manage_caja' | 'process_refund' | 'view_audit_log' | 'edit_paid_tab' | 'reopen_tab'` — no `void_order`, no dedicated remove/add-item action.
**How to avoid:** Reuse `'reopen_tab'` as the `requiredAction` for both new PIN gates (add-item save, per-item remove) in this phase. It is already manager+-only (in `MANAGER_EXTRA`, verified lines 45-55) and semantically fits ("this reopened-sale editing surface requires a manager"). This requires zero changes to `rbac.ts`. Adding a new dedicated `StaffAction` (e.g. `'edit_reopened_tab'`) is a valid alternative but is unnecessary new surface area for a MANAGER_EXTRA-identical permission set — flagged in Open Questions for the planner to make the final call.
**Warning signs:** A TypeScript compile error on `requiredAction="void_order"` (the string literal won't satisfy `StaffAction`) — this will be caught immediately by `npm run typecheck`, not a silent bug.

### Pitfall 2: `edit_paid_tab`'s `TAB_NOT_EDITABLE` guard has no existing automated test for the `status='open'` case
**What goes wrong:** SC-5 says the guard must be "confirmed by its existing/updated test coverage," implying such coverage might already exist. It does not, for this exact scenario.
**Why it happens:** `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` (read this session, `it(...)` list at lines 260-517) covers STALE_VERSION, AUTH_FORBIDDEN, patch-whitelisting, caja-entry-on-total-change, audit-log writing, and three inventory-adjustment (CR-01) cases — none of them seed a `status='open'` tab and assert `TAB_NOT_EDITABLE`.
**How to avoid:** The plan must add one new integration test case (reopen a tab via `reopen_tab` or seed one directly at `status='open'`, then call `edit_paid_tab` on it, assert `{ ok: false, code: 'TAB_NOT_EDITABLE' }`) to genuinely satisfy SC-5, not just "read the source and confirm it looks unchanged."
**Warning signs:** If the plan marks SC-5 done with zero new/modified test files, the requirement is under-verified per this project's CLAUDE.md automated-testing mandate.

### Pitfall 3: Payment-row → tab-status mismatch for the new "Edit items" button
**What goes wrong:** `PaymentPane`'s existing three row buttons (`RefundButton`, `EditTicketButton`, `ReopenTabButton`) all gate visibility on fields already present on the `Payment` object (`payment.status`, `payment.isRefund`) — cheap, no extra query. The new `EditItemsButton` needs the **tab's** status (`status='open'`), which is not a `Payment` field; a naive implementation might try to infer "reopened" from `payment.status === 'reopened_void'` (the voided-original-payment's status after `reopen_tab` runs) instead of querying the tab directly.
**Why it happens:** `reopen_tab`'s own migration (verified, lines 119-121) sets the *voided original payment's* `status='reopened_void'` — that is a real, reliable signal that *this specific payment row* is a voided-because-reopened one, but it is one hop removed from "is the tab currently open right now." Using it as a proxy is fragile if a tab is reopened multiple times (cap of 2, verified in `reopen_tab_rpc.sql` line 94) or if a future edit flips status back.
**How to avoid:** Query the tab directly (`useTab(payment.tabId)`, the same hook `ReopenTabDialog`/`EditPaidTabDialog` already use) and check `tab.status === 'open'` for visibility, not a payment-status heuristic. This also naturally handles the button disappearing again if a future phase adds re-close/re-pay (out of scope here, but the visibility check should not need to change when that lands).
**Warning signs:** "Edit items" button appearing on a payment row for a tab that was reopened-then-somehow-closed-by-other-means, or not appearing on a legitimately reopened tab because the payment-status heuristic didn't match the exact reopen count/path.

## Code Examples

### `edit_paid_tab`'s guard, verified unchanged-required (SC-5)
```sql
-- Source: supabase/migrations/20260719000001_edit_paid_tab_rpc.sql:85-92 (read this session)
-- Only paid/closed tabs are correctable — this is a correction tool, not a
-- reopen. Phase 23 (reopen_tab) is out of scope here.
IF v_status NOT IN ('paid', 'closed') THEN
  RETURN jsonb_build_object(
    'ok', false, 'code', 'TAB_NOT_EDITABLE',
    'message', 'Only paid or closed tabs can be edited'
  );
END IF;
```
This structurally excludes `status='open'` (a reopened sale) already — no code change needed for SC-5, only test coverage (Pitfall 2).

### `remove_tab_item`'s guard, confirms this exact use case was anticipated
```sql
-- Source: supabase/migrations/20260721000008_fix_remove_tab_item_deplete_cast.sql:46-52
-- (current live version — supersedes 20260721000005's signature-mismatch bug, read this session)
-- Defense-in-depth: only open tabs are eligible for item removal.
SELECT t.status INTO v_tab_status
FROM tabs t JOIN orders o ON o.id = v_order_id WHERE t.id = o.tab_id;

IF v_tab_status <> 'open' THEN
  RETURN jsonb_build_object('ok', false, 'code', 'TAB_NOT_OPEN');
END IF;
```

### `process_direct_sale_atomic` fixture shape for the SC-4 test rewrite
```typescript
// Source: e2e/50-direct-sale-checkout.spec.ts:366-403 (directSaleInput helper, read this session)
// Adapt for the reopen spec: call via getServiceClient().rpc('process_direct_sale_atomic', args),
// then the returned tabId is already status='paid' (process_payment_atomic sets
// status='paid' on full payment — verified in
// supabase/migrations/20260429000000_process_payment_close_when_fully_paid.sql:153),
// directly reopenable — no extra "update tabs to paid" step needed unlike the
// current seedPaidTab() in 48-reopen-closed-ticket.spec.ts.
const { data: shift } = await admin.from('shifts').select('id, staff_id').is('clock_out', null).limit(1).maybeSingle();
const { data: product } = await admin.from('products').select('id, base_price').eq('is_active', true).limit(1).single();
const args = {
  p_staff_id: shift.staff_id,
  p_shift_id: shift.id,
  p_caja_session_id: cajaSessionId,
  p_items: [{ product_id: product.id, quantity: 1, unit_price: Number(product.base_price) }],
  p_idempotency_key: `e2e-reopen-${randomUUID()}`,
  p_method: 'cash',
  p_amount: Number(product.base_price), // adjust for tax if the project's tax rate applies at checkout
  p_tip_amount: 0,
  p_tendered_amount: 100,
};
const { data, error } = await admin.rpc('process_direct_sale_atomic', args);
// data.tabId is now status='paid', ready for reopen_tab
```
`process_direct_sale_atomic` is `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT ... TO service_role` (verified, migration lines 146-151) — it must be called via `getServiceClient()` (the service-role client), exactly as `e2e/50-direct-sale-checkout.spec.ts` already does; it cannot be called from the browser session.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `seedPaidTab()` hand-inserts `tabs`/`orders`/`order_items`/`payments` rows directly, manually setting `status: 'paid'` and `version: 2` | `process_direct_sale_atomic`-originated fixture (SC-4) | This phase | Fixture now exercises the real checkout path's invariants (idempotency key, catalog-price match, `process_payment_atomic`'s status transition) instead of a hand-maintained guess at what a "real" paid tab looks like — reduces drift risk as the checkout RPC evolves. |

**Deprecated/outdated:** None — no library or pattern in this phase is being deprecated, only a test-fixture construction method.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Reusing `requiredAction="reopen_tab"` (rather than adding a new dedicated `StaffAction`) is an acceptable interpretation of D-03's "every add-item save and every item removal ... gets its own manager PIN gate" | Pitfall 1 / Primary recommendation | Low — `canAccess` behavior is identical either way (manager+ only); only affects RBAC-table readability/audit-log semantics, not actual access control. If the team wants a dedicated action for auditability, the planner should add one to `rbac.ts` instead — either choice satisfies D-03's stated *behavior*. |
| A2 | `p_amount` in the `process_direct_sale_atomic` fixture example above does not need a tax adjustment for this project's specific tax configuration | Code Examples | Low-Medium — if `PRICE_MISMATCH`/total-mismatch validation inside `process_payment_atomic` is strict, the executor may need to call the same `computeAuthoritativeTotal`/`getTaxRatePercent` helpers `50-direct-sale-checkout.spec.ts` already defines, rather than a flat `p_amount = base_price`. Not independently re-verified against `process_payment_atomic`'s internals this session — flagged for the executor to confirm against that spec's exact helper functions when writing the new fixture. |

## Open Questions (RESOLVED)

1. **(RESOLVED) Where exactly does the new panel/widget file live, and what is its exact name?**
   - What we know: CONTEXT.md leaves this to planner's discretion; must be a `Sheet` composing `remove-tab-item` and the new `add-item-to-tab` feature, living under `src/widgets/PaymentPane/` or a new feature folder.
   - What's unclear: Whether it's a widget-level component (composing two features, which FSD permits) or itself a new `features/edit-reopened-tab-items/` folder (which would then import from two sibling features — also FSD-legal at the feature layer only if one of them isn't importing the other).
   - Recommendation: Widget-level (`src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx`), matching where `EditPaidTabDialog`/`ReopenTabDialog` are *mounted* today even though those two are themselves feature-layer components — the new panel is different in that it must compose two independent features together (add + remove), which is the widget layer's defined job in this codebase's FSD variant.
   - Resolution: Adopted verbatim in `09-01-PLAN.md`/`09-03-PLAN.md` — `EditReopenedItemsPanel` was placed exactly at the recommended widget-level path.

2. **(RESOLVED) Should `remove_tab_item` gain a server-side manager-role check to match `edit_paid_tab`/`reopen_tab`'s defense-in-depth pattern?**
   - What we know: `remove_tab_item`'s migration explicitly documents this as deliberate (D-07: "item removal stays bartender-accessible, matching `useRemoveTabItem`'s current effective access level. Do not copy `edit_paid_tab`'s role check").
   - What's unclear: Whether wiring `remove_tab_item` into a manager-only-PIN-gated reopened-sale panel changes that calculus — a cashier with direct RPC access (not through the UI) could still call `remove_tab_item` on a reopened tab today, PIN gate or not, since the RPC itself doesn't check role.
   - Recommendation: Out of scope for this phase per its own explicit boundary (D-05: "Reuse `RemoveTabItemDialog`/`useRemoveTabItem` as-is — no rewrite") — flagging only so the planner doesn't accidentally scope-creep into modifying the RPC. If this is a real security concern, it should be a separate phase/ticket, not bundled here.
   - Resolution: Adopted — plans explicitly declined to modify `remove_tab_item`'s role check, matching the recommendation.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit/integration) + Playwright v1.59 (E2E) |
| Config file | `supermarket-pos/vitest.config.ts`, `supermarket-pos/playwright.config.ts` |
| Quick run command | `npx vitest run src/features/add-item-to-tab/model/useAddItemToTab.test.ts` |
| Full suite command | `npm run test` (unit), `npm run test:e2e` (E2E, requires dev server + `.env.local` E2E credentials) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| SALE-03 / SC-1 | Manager reopens a paid sale via `reopen_tab`, status flips to `open` | E2E | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-1"` | ✅ (already passing, unmodified) |
| SALE-03 / SC-2 | Manager adds a line item via the new `add-item-to-tab` wrapper, item appears in total | E2E | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-2"` | ❌ Wave 0 — new test block |
| SALE-03 / SC-2 | `useAddItemToTab` unit coverage | unit | `npx vitest run src/features/add-item-to-tab/model/useAddItemToTab.test.ts` | ❌ Wave 0 — new file |
| SALE-03 / SC-3 | Manager removes a line item via `remove_tab_item` on a reopened sale | E2E | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-3"` | ❌ Wave 0 — new test block (existing `RemoveTabItemDialog`/`useRemoveTabItem` unit tests already cover the hook/dialog in isolation) |
| SALE-03 / SC-4 | Fixture originates from `process_direct_sale_atomic`, not hand-built rows | E2E (fixture refactor) | same spec file, `seedPaidTab` replacement | ❌ Wave 0 — modify existing helper |
| SALE-03 / SC-5 | `edit_paid_tab`'s guard still excludes `status='open'`, confirmed by test | integration | `npx vitest run src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` | ❌ Wave 0 — new `it()` case (Pitfall 2) |

### Sampling Rate

- **Per task commit:** targeted `npx vitest run <file>` / `npx playwright test <file>`
- **Per wave merge:** `npm run test` (full unit suite) + `npm run typecheck` + `npm run lint`
- **Phase gate:** `npm run test:e2e` full suite green (or at minimum every spec touching `tabs`/`payments`/`order_items`) before `/gsd-verify-work`, per project CLAUDE.md's automated-only verification mandate.

### Wave 0 Gaps

- [ ] `src/features/add-item-to-tab/model/useAddItemToTab.ts` + `.test.ts` — new thin wrapper hook and its unit test (mirror `useReopenTab.test.ts`'s shape)
- [ ] `e2e/48-reopen-closed-ticket.spec.ts` — extend with SC-2/SC-3 test blocks; replace `seedPaidTab` with a `process_direct_sale_atomic`-based helper (SC-4)
- [ ] `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` — add one new `it()` asserting `TAB_NOT_EDITABLE` for a `status='open'` tab (SC-5, Pitfall 2)
- [ ] No new Vitest/Playwright framework install needed — both already configured and used by 43 existing E2E specs and the sibling `edit-paid-tab`/`reopen-tab` integration tests.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No (new work) | Existing Supabase Auth session, unchanged by this phase |
| V3 Session Management | No (new work) | Unchanged |
| V4 Access Control | Yes | `ManagerPinDialog` + `canAccess(role, requiredAction)` (client UX gate) backed by each RPC's own server-side role re-check where present — see Architectural Responsibility Map row on PIN authorization and Open Question 2 for `remove_tab_item`'s specific (deliberate, pre-existing) gap |
| V5 Input Validation | Yes | `create_order_with_items`'s existing catalog-price/quantity validation (unchanged); no new client-supplied free-form fields introduced by this phase beyond what `EditPaidTabDialog`'s existing add-row pattern already validates (product picker constrains `productId` to the loaded product list) |
| V6 Cryptography | No | Not applicable — no new secrets/crypto in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Client-side-only authorization bypass (calling `remove_tab_item`/`create_order_with_items` directly with a valid session, skipping the UI's PIN gate entirely) | Elevation of Privilege | Already exists as a residual risk independent of this phase (Open Question 2) — `create_order_with_items` requires no special role today either (any authenticated staff can call it; that's by design, matching normal order-taking), and `remove_tab_item` deliberately has no role check (D-07). This phase's PIN gates are a UX control on the *panel*, not a new server-side authorization boundary — do not present them as closing this gap, since they don't. |
| Manager PIN reused as a "shared secret" broadcast to a cashier to bypass the gate | Elevation of Privilege | Out of scope for this phase — this is an operational/training control, not a code control, identical to the risk already accepted for every other `ManagerPinDialog` usage in the codebase (refund, reopen, edit-paid-tab). |

## Sources

### Primary (HIGH confidence — read directly this session)
- `src/features/reopen-tab/model/useReopenTab.ts`, `ui/ReopenTabDialog.tsx`
- `src/features/edit-paid-tab/model/useEditPaidTab.ts`, `ui/EditPaidTabDialog.tsx`, `model/edit-paid-tab-rpc.integration.test.ts`
- `src/features/remove-tab-item/useRemoveTabItem.ts`, `ui/RemoveTabItemDialog.tsx`
- `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`, `index.ts`
- `src/widgets/PaymentPane/ui/PaymentPane.tsx`
- `src/entities/tab/model/queries.ts` (lines 476-586, `useMutationAddOrder`)
- `src/entities/tab/model/types.ts`
- `src/shared/lib/domain.ts` (lines 60-160, 326-400, `TabStatusSchema`/`OrderItemSchema`/`OrderSchema`)
- `src/shared/lib/rbac.ts` (lines 1-64, `STAFF_ACTIONS`/`MANAGER_EXTRA`/`CASHIER_ACTIONS`)
- `src/app/OfflineQueueProcessor.tsx`
- `supabase/migrations/20260719000001_edit_paid_tab_rpc.sql`
- `supabase/migrations/20260720000004_reopen_tab_rpc.sql`
- `supabase/migrations/20260721000005_remove_tab_item_rpc.sql`
- `supabase/migrations/20260721000008_fix_remove_tab_item_deplete_cast.sql` (current live version)
- `supabase/migrations/20260813000001_process_direct_sale_atomic.sql`
- `supabase/migrations/20260429000000_process_payment_close_when_fully_paid.sql`
- `e2e/48-reopen-closed-ticket.spec.ts`
- `e2e/50-direct-sale-checkout.spec.ts` (lines 79-419, `directSaleInput` helper)
- `e2e/helpers/supabase.ts`
- `git log -p -- '**/TableStatusPanel*'` (deleted-file archaeology for the historical PIN-gate/remove-item orchestration and its now-invalid `requiredAction="void_order"`)
- `.planning/phases/09-reopen-and-edit-a-completed-sale/09-CONTEXT.md`
- `.planning/phases/09-reopen-and-edit-a-completed-sale/09-UI-SPEC.md`
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- `/mnt/ai/POS/supermarket-pos/CLAUDE.md`

### Secondary (MEDIUM confidence)
- None — this phase required no external documentation lookups (no new libraries, no framework version questions); all research was in-repo source verification.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, every hook/component/RPC cited was read directly this session.
- Architecture: HIGH — the exact historical precedent (deleted `TableStatusPanel`) for this phase's UI orchestration was recovered via `git log -p` and verified line-by-line.
- Pitfalls: HIGH — Pitfall 1 (`void_order` gone) and Pitfall 2 (missing SC-5 test coverage) were both confirmed by direct source inspection, not inference.

**Research date:** 2026-08-18
**Valid until:** 2026-09-17 (30 days — stable in-repo domain, no fast-moving external dependency)
