---
phase: 09-reopen-and-edit-a-completed-sale
reviewed: 2026-08-18T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - e2e/48-reopen-closed-ticket.spec.ts
  - src/features/add-item-to-tab/index.ts
  - src/features/add-item-to-tab/model/useAddItemToTab.test.ts
  - src/features/add-item-to-tab/model/useAddItemToTab.ts
  - src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts
  - src/features/reopen-tab/model/useReopenTab.ts
  - src/shared/lib/i18n/locales/en-US/featOrders.json
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/featOrders.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx
  - src/widgets/PaymentPane/ui/PaymentPane.test.tsx
  - src/widgets/PaymentPane/ui/PaymentPane.tsx
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-08-18
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the reopen-and-edit-a-completed-sale (SALE-03) feature slice: `useReopenTab`, `EditReopenedItemsPanel` (new), its composition of `useAddItemToTab`/`create_order_with_items` and the reused `RemoveTabItemDialog`/`remove_tab_item`, the `PaymentPane` wiring, and the e2e/integration test coverage. FSD layering is correct throughout (widget → features → entities → shared, no upward imports), i18n catalogs are complete and parallel across locales, and `edit_paid_tab`'s `TAB_NOT_EDITABLE` status guard is untouched by this phase (confirmed by the still-passing `SC-5` integration test).

However, the client-side `ManagerPinDialog` gate that this phase's own UI copy and docstrings describe as enforcing "manager-approved" edits to a reopened (previously-paid) sale is **not backed by any server-side authorization check** for either the add-item or remove-item path — both RPCs were deliberately reused unmodified from the ordinary in-progress-tab editing flow, where cashier-level access is intentional. Combined with the add-item RPC never writing an audit log row, this phase's "manager-approved, every change recorded" claim does not hold end-to-end for the add-item flow. These are traced through migration SQL and RLS policy files, not merely inferred from the reviewed TS files, and are reported here because they directly determine whether the reviewed client code's PIN gate provides the guarantee its own copy and plan docs claim.

## Critical Issues

### CR-01: Add/remove-item PIN gate on a reopened sale has no server-side enforcement — bypassable by any authenticated cashier

**File:** `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx:291-314` (both `ManagerPinDialog` instances, `requiredAction="reopen_tab"`)
**Also implicated:** `src/features/add-item-to-tab/model/useAddItemToTab.ts` (wraps `create_order_with_items`), `src/features/remove-tab-item/useRemoveTabItem.ts` (wraps `remove_tab_item`)

**Issue:** `reopen_tab` is correctly a manager+-only RBAC action (`src/shared/lib/rbac.ts`), and `ManagerPinDialog` correctly restricts `eligibleStaff` to manager/admin PINs for both the add-item Save flow and the per-row remove-item flow. But that gate is purely a client-side UI convention — the RPCs it protects have no matching server-side role check for this use case:

- `create_order_with_items` (`supabase/migrations/20260428000003_create_order_with_items_v2.sql`) has `GRANT EXECUTE ... TO authenticated` and performs no `auth.uid()`/role check at all inside the function body.
- `remove_tab_item` (`supabase/migrations/20260721000005_remove_tab_item_rpc.sql`) explicitly documents (lines 18-20): *"Deliberately does NOT add a manager/admin role gate (D-07, Pitfall 3): item removal stays bartender-accessible... Do not copy edit_paid_tab's role check."* Its only guard is `TAB_NOT_OPEN`, which a reopened tab (status flips back to `'open'`) satisfies.
- The RLS policies backing these tables (`order_items_insert_bartender`, restored `order_items_delete_bartender` in `20260420165000_order_items_bartender_delete.sql`/`20260712000001_restore_order_items_delete_bartender.sql`) grant cashier-role INSERT/DELETE on `order_items` with **no condition on `tabs.status`, `tabs.reopened_at`, or `tabs.reopen_count`** — only the `create_order`/cashier-permission check.

Both of these RPCs were designed for the *normal, in-progress open-tab* editing flow, where cashier access is correct by design (D-07). Phase 09 reuses them **unmodified** for a semantically different action — correcting a previously-paid, manager-reopened sale — and relies entirely on the client-only `ManagerPinDialog` to make that distinction. Any authenticated cashier session (browser devtools console, a modified client build, or a direct `supabase.rpc('create_order_with_items', ...)`/`remove_tab_item` call using the tab id visible on any receipt) can add or remove line items on a reopened, previously-completed sale without ever presenting a manager PIN — the exact scenario this phase's PIN gate exists to prevent (per the plan's own framing: *"gated by ManagerPinDialog with requiredAction='reopen_tab'"*).

This is different from `reopen_tab` itself and `edit_paid_tab`, both of which do raise `AUTH_FORBIDDEN` (`P0A01`) server-side for non-manager callers — those two are correctly hardened. The add/remove-item leg of the same feature is not.

**Fix:** Add a server-side guard specific to reopened tabs. Cheapest options, in order of surface area:
1. In `remove_tab_item`, add a check: if the target tab has `reopened_at IS NOT NULL` (or `reopen_count > 0`), require `get_user_role() IN ('manager','admin')` (mirror `edit_paid_tab`'s `AUTH_FORBIDDEN` check) — this doesn't touch the existing cashier-on-open-tab behavior since that path has `reopened_at IS NULL`.
2. For add-item, either (a) add the same conditional role check inside `create_order_with_items`, or (b) stop reusing the generic RPC for this specific flow and introduce a thin `add_item_to_reopened_tab` wrapper RPC that checks role + `reopened_at IS NOT NULL` before delegating to the existing insert logic.
```sql
-- inside remove_tab_item / create_order_with_items, before the mutation:
IF v_tab.reopened_at IS NOT NULL THEN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'AUTH_FORBIDDEN: manager or admin role required to edit a reopened sale' USING ERRCODE = 'P0A01';
  END IF;
END IF;
```

---

### CR-02: "Add item" flow on a reopened sale writes no audit log — contradicts the panel's own "each save is recorded" copy

**File:** `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx` (Sheet description, line 153) / `src/shared/lib/i18n/locales/en-US/featOrders.json:89`
**Issue:** `EditReopenedItemsPanel`'s `SheetDescription` reads: *"Add or remove items on this reopened sale. Each save is recorded and manager-approved."* (`editReopenedItems.description`, identical claim in es-MX at `featOrders.json:89`). The remove-item path backs this up — `remove_tab_item` calls `PERFORM record_audit('order_item.remove', ...)` on success (`supabase/migrations/20260721000005_remove_tab_item_rpc.sql:80`). The reopen action itself also calls `record_audit('tab.reopen', ...)` (`20260720000004_reopen_tab_rpc.sql:172`), and `edit_paid_tab` calls `record_audit('tab.edit_paid', ...)` with a before/after diff.

But the add-item path (`useAddItemToTab` → `create_order_with_items`) has **no `record_audit`/`audit_logs` call anywhere in its RPC** (`supabase/migrations/20260428000003_create_order_with_items_v2.sql` and the depletion-related follow-ups touching the same function contain no reference to `record_audit`). A manager adding a line item — including its manually-editable `unitPrice` — to a previously-paid, reopened sale leaves no audit trail of who added what, at what price, or why. This is a real gap for a feature whose entire premise is manager-accountable correction of a completed sale, and the UI actively tells the operator the opposite is true.

**Fix:** Either have `create_order_with_items` call `record_audit('order.add_items', 'order', v_order_id, NULL, jsonb_build_object('items', v_items, 'reopened_tab', v_tab.reopened_at IS NOT NULL), 'rpc')` on success (guarded so it doesn't spam audit_logs for every normal in-progress-order add — e.g. only when `v_tab.reopened_at IS NOT NULL`), or add a dedicated `add_item_to_reopened_tab` RPC (see CR-01 fix option 2b) that both enforces the role check and writes the audit row, and point `useAddItemToTab` at that RPC instead of the generic one when called from `EditReopenedItemsPanel`.

## Warnings

### WR-01: `unitPrice` input on added rows accepts negative values with no client or server floor

**File:** `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx:240-249`
**Issue:** `<Input type="number" min={0} ... onChange={e => updateAddedRow(row.key, { unitPrice: Number(e.target.value) || 0 })}>`. The `min={0}` HTML attribute only affects the number-input's spinner/native validation UI — it does not block a manually typed `-5`, and `Number('-5') || 0` evaluates to `-5` (not `0`), so a negative unit price passes straight through to `handleSubmit` → `create_order_with_items`, which itself performs no price-floor check server-side (confirmed in the migration — `unit_price` is cast straight from the JSON payload with no `CHECK`). Combined with CR-01, a negative-price "add" reduces the reopened sale's total with no server-side rejection.
**Fix:** Clamp client-side (`Math.max(0, Number(e.target.value) || 0)`) and add a server-side `unit_price >= 0` check in `create_order_with_items` (or the reopened-sale-specific RPC from CR-01's fix) so the guarantee doesn't depend solely on the UI.

### WR-02: `useReopenTab` classifies `NO_OPEN_CAJA`/`AUTH_FORBIDDEN` via substring match on `error.message`

**File:** `src/features/reopen-tab/model/useReopenTab.ts:51-62`
**Issue:** `rpcRes.error.message.includes('NO_OPEN_CAJA')` / `.includes('AUTH_FORBIDDEN')` classify these two custom SQLSTATEs by matching text inside the raised exception message rather than the SQLSTATE code (`P0A02`/`P0A01`) that `parseSupabaseError` already threads through for STALE_VERSION/NOT_FOUND_VERSIONED elsewhere in the same function. If the RPC's `RAISE EXCEPTION` message text is ever reworded (e.g. localized, or the "NO_OPEN_CAJA:" prefix is dropped/reordered) this silently falls through to the generic `SUPABASE_ERROR` branch instead of surfacing the correct, more actionable `CAJA_CLOSED`/`AUTH_FORBIDDEN` toast — a regression that would not be caught by type-checking and is easy to introduce in an unrelated SQL-wording change.
**Fix:** Prefer matching on the Postgres SQLSTATE (`rpcRes.error.details`/underlying `code` if surfaced through `supabaseMutation`, mirroring how P0V01/P0V02 are already mapped) instead of message-substring matching; if the raw error object doesn't currently expose the SQLSTATE to this layer, extend `parseSupabaseError` to map `P0A01`/`P0A02` the same way it already maps `P0V01`/`P0V02`, removing the need for this hook to special-case message text at all.

### WR-03: Near-duplicate add-row logic between `EditReopenedItemsPanel` and `EditPaidTabDialog` with no shared abstraction

**File:** `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx:50-55,71,77-88,185-253` vs `src/features/edit-paid-tab/ui/EditPaidTabDialog.tsx:54-59,80,142-153,305-368`
**Issue:** The `AddedRow` interface, `updateAddedRow`, `handleAddItem`, and the entire "add a new row" JSX block (product `Select`, quantity `QuantityControl`, price `Input`) are copy-pasted near-verbatim between the two components (differing only in i18n key prefixes and one CSS class). Any future fix to this block (e.g. WR-01's price clamp) has to be applied twice and will drift if only one call site is patched — as nearly happened here, since this phase copied the pattern including its pre-existing lack of price validation.
**Fix:** Extract a shared `AddedItemRows`/`useAddedRows` piece (e.g. in `entities/tab/ui/` or a small shared feature) that owns `AddedRow` state + rendering, parameterized by the `products` list and an `addItem`/`removeItem` callback, and have both dialogs consume it.

## Info

### IN-01: `EditReopenedItemsPanel` has no dedicated unit/component test

**File:** `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx`
**Issue:** Unlike `useAddItemToTab` (`useAddItemToTab.test.ts`) and `useReopenTab`, there is no `EditReopenedItemsPanel.test.tsx`. Coverage for this component's branching (loading state, empty state, add-row/remove-row interplay, dual independent PIN gates, version-conflict handling in `handleSubmit`) exists only via the single e2e spec (`e2e/48-reopen-closed-ticket.spec.ts`), which is valuable for the happy path but doesn't exercise edge cases like a STALE_VERSION response to `addItems`, or the Sheet-close reset logic in `handleOpenChange`.
**Fix:** Add a component test mirroring `PaymentPane.test.tsx`'s mocking style (mock `useAddItemToTab`, `useTab`, `useProducts`, `ManagerPinDialog`, `RemoveTabItemDialog`) covering at minimum: add-row → PIN success → success toast, add-row → PIN success → STALE_VERSION → sheet closes, and reset-on-close of all local state.

---

_Reviewed: 2026-08-18_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
