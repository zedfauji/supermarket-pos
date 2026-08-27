# Phase 9: Reopen-and-edit a completed sale - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 6 (2 new, 4 modified/extended)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx` (NEW) | widget/component | request-response (composes 2 CRUD mutations) | `src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx` | exact (shell/Sheet pattern) |
| `src/widgets/PaymentPane/ui/PaymentPane.tsx` (MODIFY: +button, +state, +mount) | component | request-response | same file, existing `EditTicketButton`/`ReopenTabButton` | exact (self-analog) |
| `src/features/add-item-to-tab/model/useAddItemToTab.ts` (NEW) | service/hook | CRUD (thin RPC wrapper) | `src/features/reopen-tab/model/useReopenTab.ts` | role-match (mutation hook wrapping RPC) |
| `src/features/add-item-to-tab/model/useAddItemToTab.test.ts` (NEW) | test | — | `src/features/reopen-tab/model/useReopenTab.test.ts` | exact (mirror shape per RESEARCH.md) |
| `e2e/48-reopen-closed-ticket.spec.ts` (MODIFY: extend SC-2/SC-3, replace fixture) | test | E2E request-response | `e2e/50-direct-sale-checkout.spec.ts` (fixture helper) | exact (fixture source) |
| `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` (MODIFY: +1 `it()`) | test | integration | same file, existing STALE_VERSION/AUTH_FORBIDDEN cases | exact (self-analog) |

Reused verbatim, no changes: `src/features/remove-tab-item/useRemoveTabItem.ts`, `src/features/remove-tab-item/ui/RemoveTabItemDialog.tsx`, `src/entities/tab/model/queries.ts` (`useMutationAddOrder`), `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`.

## Pattern Assignments

### `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx` (NEW widget)

**Analog:** `src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx` (full file, 461 lines — read in full this session)

**Imports pattern** (lines 1-42 of analog):
```typescript
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ManagerPinDialog } from "@features/manager-pin-gate";
import { useProducts } from "@entities/product";
import { tabKeys, useTab } from "@entities/tab";
import {
  Input, Label, MoneyDisplay, POSButton, QuantityControl,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@shared/ui";
```
For the new panel, additionally import `RemoveTabItemDialog` from `@features/remove-tab-item/ui/RemoveTabItemDialog` (deep import — no barrel exists, per RESEARCH.md) and the new `useAddItemToTab` from `@features/add-item-to-tab`.

**Sheet shell pattern** (lines 232-433): `Sheet open/onOpenChange` → `SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col"` → `SheetHeader`/`SheetTitle`/`SheetDescription` → scrollable item list body → sticky footer with total → `SheetFooter` with Cancel + Save `POSButton`s. Copy this shell as-is for the new panel.

**Inline add-row pattern (D-04)** — copy `addedRows` state + `updateAddedRow`/`handleAddItem` (lines 54-59, 80, 142-153, 305-368):
```typescript
interface AddedRow { key: string; productId: string; quantity: number; unitPrice: number; }
const [addedRows, setAddedRows] = useState<AddedRow[]>([]);

function updateAddedRow(key: string, patch: Partial<AddedRow>) {
  setAddedRows(prev => prev.map(row => (row.key === key ? { ...row, ...patch } : row)));
}
function handleAddItem() {
  const first = products?.[0];
  if (!first) return;
  setAddedRows(prev => [...prev, { key: crypto.randomUUID(), productId: first.id, quantity: 1, unitPrice: first.basePrice }]);
}
```
Row JSX (lines 305-368) — `Select` product picker + `QuantityControl` + `Input` price + remove-row ghost button — copy verbatim, drop `unitPrice` override syncing to `product.basePrice` on select change.

**Save → PIN gate → submit pattern** (lines 413-458): Save button sets `pinOpen=true`; `ManagerPinDialog onSuccess` calls `handleSubmit()`. For this phase use `requiredAction="reopen_tab"` (per RESEARCH.md Pitfall 1 — NOT `"edit_paid_tab"`, NOT `"void_order"` which no longer exists).
```typescript
<ManagerPinDialog
  open={pinOpen}
  onOpenChange={setPinOpen}
  requiredAction="reopen_tab"
  onSuccess={() => { setPinOpen(false); void handleSubmit(); }}
/>
```

**Two-step PIN → confirm orchestration for remove (D-05)** — this is NOT in `EditPaidTabDialog` (which uses local removedIds + one shared PIN); it is recovered from the deleted `TableStatusPanel` per RESEARCH.md Pattern 2, quoted there:
```typescript
// Adapt requiredAction to "reopen_tab" — do NOT reuse "void_order" (gone, Pitfall 1)
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

**Error handling pattern** (lines 194-214, from `EditPaidTabDialog.handleSubmit`): check `result.ok`, handle `STALE_VERSION`/`NOT_FOUND_VERSIONED` via `handleVersionError`, else `toast.error(result.error.message)`; on success `toast.success(...)` + close. Apply the same shape to the new `useAddItemToTab` submit path (simpler — no version-conflict special-casing needed unless `useMutationAddOrder`'s optimistic version guard surfaces one, which it can per `queries.ts` `expectedVersion` logic).

**Reset-on-close pattern** (lines 219-230): clear all local state (`addedRows`, PIN/dialog open flags, selected-item-for-removal) inside `handleOpenChange` when `nextOpen === false`.

---

### `src/widgets/PaymentPane/ui/PaymentPane.tsx` (MODIFY)

**Analog:** itself — `EditTicketButton`/`ReopenTabButton` (lines 46-91), `PaymentHistoryList` composition (lines 93-155), state block (lines 157-171).

**New button pattern** (visibility differs from siblings — needs live tab status, not `payment.status`; per RESEARCH.md Pattern 3 / Pitfall 3):
```typescript
function EditItemsButton({ payment, onEditItems }: EditItemsButtonProps) {
  const { t } = useTranslation('wPanels');
  const { data: tab } = useTab(payment.tabId); // same hook ReopenTabDialog/EditPaidTabDialog use

  if (payment.isRefund === true) return null;
  if (tab?.status !== 'open') return null; // only a reopened tab

  return (
    <POSButton variant="outline" size="sm" onClick={() => { onEditItems(payment.tabId); }}>
      {t('paymentPane.editItems')}
    </POSButton>
  );
}
```
Mount alongside `EditTicketButton`/`ReopenTabButton`/`RefundButton` at line ~146 inside the payment row's action `div`. Add `editItemsTarget` state (mirrors `editTarget`/`reopenTarget` at lines 166-168) and mount `<EditReopenedItemsPanel open={...} tabId={editItemsTarget} onOpenChange={...} />` next to the existing `<EditPaidTabDialog>`/`<ReopenTabDialog>` mounts (not shown in the excerpt read, but same pattern — sibling dialogs mounted at the bottom of `PaymentPane`'s returned JSX).

---

### `src/features/add-item-to-tab/model/useAddItemToTab.ts` (NEW)

**Analog:** `src/features/reopen-tab/model/useReopenTab.ts` (full file, 109 lines) for mutation-hook shape; actual RPC delegate is `useMutationAddOrder` in `src/entities/tab/model/queries.ts` (lines 476-586, read this session).

**Pattern — thin wrapper, do not re-implement the RPC call:**
```typescript
// New file: src/features/add-item-to-tab/model/useAddItemToTab.ts
import { useMutationAddOrder } from '@entities/tab/model/queries';

export function useAddItemToTab() {
  const addOrder = useMutationAddOrder();

  async function addItem(input: {
    tabId: string; staffId: string; productId: string; quantity: number; unitPrice: number;
  }) {
    return addOrder.mutateAsync({
      tabId: input.tabId,
      order: { staffId: input.staffId, status: 'pending', notes: null },
      items: [{
        productId: input.productId, quantity: input.quantity, unitPrice: input.unitPrice,
        modifierIds: [], modifierPriceDelta: 0, notes: null,
      }],
    });
  }

  return { addItem, isPending: addOrder.isPending };
}
```
`useMutationAddOrder` already handles: `isOnline()` offline guard, `p_expected_version` optimistic-concurrency payload, `supabaseQuery` error mapping, Zod-validated `Order`/`OrderItem` return, query invalidation. Do not duplicate any of that in the wrapper.

**Result/error shape convention** (from `useReopenTab.ts` lines 41-105) — if the wrapper needs its own error translation layer beyond what `useMutationAddOrder` gives, follow this exact discriminate-then-i18n pattern (check `.ok`, map known RPC `code`s to i18n'd `AppError`s via `err({ code: '...' as AppErrorCode, message: i18n.t(...) })`, pass through unknown ones).

---

### `src/features/add-item-to-tab/model/useAddItemToTab.test.ts` (NEW)

**Analog:** `src/features/reopen-tab/model/useReopenTab.test.ts` — mirror its shape per RESEARCH.md explicit instruction ("mirror useReopenTab.test.ts's shape"). Not read this pass (file exists per RESEARCH.md citation) — read it directly before writing the test to match its mocking approach for `@tanstack/react-query` mutation hooks and Supabase RPC mocks.

---

### `e2e/48-reopen-closed-ticket.spec.ts` (MODIFY — extend SC-2/SC-3, replace fixture for SC-4)

**Analog:** `e2e/50-direct-sale-checkout.spec.ts` lines 366-403 (`directSaleInput` helper, read this session) — use as the template for the new `process_direct_sale_atomic`-based fixture replacing `seedPaidTab()`:
```typescript
// Source: e2e/50-direct-sale-checkout.spec.ts:366-403
const { data: shift } = await admin.from('shifts').select('id, staff_id').is('clock_out', null).limit(1).maybeSingle();
const { data: product } = await admin.from('products').select('id, base_price').eq('is_active', true).limit(1).single();
const args = {
  p_staff_id: shift.staff_id, p_shift_id: shift.id, p_caja_session_id: cajaSessionId,
  p_items: [{ product_id: product.id, quantity: 1, unit_price: Number(product.base_price) }],
  p_idempotency_key: `e2e-reopen-${randomUUID()}`, p_method: 'cash',
  p_amount: Number(product.base_price), p_tip_amount: 0, p_tendered_amount: 100,
};
const { data } = await admin.rpc('process_direct_sale_atomic', args); // data.tabId is status='paid'
```
Must call via `getServiceClient()` (service-role only, `REVOKE ALL ... FROM PUBLIC/anon/authenticated`). See RESEARCH.md Assumption A2 — confirm `p_amount` doesn't need tax adjustment against `50-direct-sale-checkout.spec.ts`'s `computeAuthoritativeTotal`/`getTaxRatePercent` helpers before reusing the flat `base_price` value.

---

### `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` (MODIFY — add 1 `it()`, SC-5/Pitfall 2)

**Analog:** same file's existing STALE_VERSION/AUTH_FORBIDDEN `it()` blocks (lines 260-517, cited in RESEARCH.md) — not re-read this session (large integration test file, targeted read deferred to planner/executor). New case: seed or reopen a tab to `status='open'`, call `edit_paid_tab`, assert `{ ok: false, code: 'TAB_NOT_EDITABLE' }`, following the same seed→call→assert shape as the existing cases in that file.

---

## Shared Patterns

### Manager PIN gate
**Source:** `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (lines 1-60+, read this session)
**Apply to:** Both new PIN gates in `EditReopenedItemsPanel` (add-item save, per-item remove)
```typescript
export interface ManagerPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredAction: StaffAction;
  onSuccess: () => void;
}
```
`requiredAction` must be an existing `StaffAction` union member — use `"reopen_tab"` (manager+-only via `MANAGER_EXTRA`), not `"void_order"` (deleted) or a new value (out of scope, zero-diff choice per RESEARCH.md A1).

### Remove-item dialog (reused verbatim, D-05)
**Source:** `src/features/remove-tab-item/useRemoveTabItem.ts` (full file, 94 lines) + `src/features/remove-tab-item/ui/RemoveTabItemDialog.tsx` (full file, 111 lines)
**Apply to:** `EditReopenedItemsPanel`'s remove side, unmodified. `useRemoveTabItem` already handles `isOnline()` guard, `NOT_FOUND`/`TAB_NOT_OPEN` error mapping, and `tabKeys` invalidation on success — no changes needed. Note its own doc comment: "Manager PIN gate (Step 1) is intentionally excluded: cross-feature imports violate FSD" — the new panel is exactly the parent that must supply that PIN step.

### Error/Result handling
**Source:** `src/shared/lib/result.ts` (`Ok`/`Err`, `err()`/`ok()`), used identically across `useReopenTab.ts`, `useRemoveTabItem.ts`, `useMutationAddOrder` (`queries.ts`)
**Apply to:** All new mutation code in this phase — never throw raw errors, always return `Result<T>`.

### Toast + i18n on submit
**Source:** `RemoveTabItemDialog.tsx` lines 62-68, `EditPaidTabDialog.tsx` lines 194-217
**Apply to:** New panel's submit handlers — `toast.error(result.error.message)` on failure, `toast.success(t('...'))` on success, using the `featOrders` namespace (matches `useTranslation("featOrders")` in both analogs).

## No Analog Found

None — every file in this phase has a strong, directly-cited analog already verified in RESEARCH.md; this is a pure-composition phase with zero net-new architectural patterns.

## Metadata

**Analog search scope:** `src/widgets/PaymentPane/`, `src/features/{edit-paid-tab,remove-tab-item,reopen-tab,manager-pin-gate,add-item-to-tab}/`, `src/entities/tab/model/queries.ts`, `e2e/{48-reopen-closed-ticket,50-direct-sale-checkout}.spec.ts`
**Files scanned:** 8 read directly this session (PaymentPane.tsx, EditPaidTabDialog.tsx, useRemoveTabItem.ts, useReopenTab.ts, ManagerPinDialog.tsx, RemoveTabItemDialog.tsx, queries.ts excerpt) plus CONTEXT.md/RESEARCH.md's own prior-session citations (edit-paid-tab-rpc.integration.test.ts, 50-direct-sale-checkout.spec.ts, TableStatusPanel git history, SQL migrations)
**Pattern extraction date:** 2026-08-18
