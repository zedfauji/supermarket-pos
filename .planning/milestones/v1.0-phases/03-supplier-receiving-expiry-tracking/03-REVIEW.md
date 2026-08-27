---
phase: 03-supplier-receiving-expiry-tracking
reviewed: 2026-08-14T14:13:00-06:00
depth: standard
files_reviewed: 50
files_reviewed_list:
  - e2e/53-supplier-receiving.spec.ts
  - e2e/54-near-expiry-alerts.spec.ts
  - src/app/router.tsx
  - src/entities/inventory/index.ts
  - src/entities/inventory/model/index.ts
  - src/entities/inventory/model/queries.ts
  - src/entities/inventory/ui/NearExpiryBadge.tsx
  - src/entities/product/model/queries.ts
  - src/entities/settings/model/queries.ts
  - src/entities/settings/model/types.ts
  - src/entities/supplier/index.ts
  - src/entities/supplier/model/queries.ts
  - src/entities/supplier/model/types.ts
  - src/entities/tab/ui/CartItem.tsx
  - src/features/manage-products/ui/CatalogProductsTab.tsx
  - src/features/manage-products/ui/ProductForm.tsx
  - src/features/manage-suppliers/index.ts
  - src/features/manage-suppliers/ui/SupplierForm.tsx
  - src/features/physical-count/model/usePhysicalCount.ts
  - src/features/receive-shipment/index.ts
  - src/features/receive-shipment/model/useReceiveShipment.ts
  - src/features/receive-shipment/ui/ReceiveShipmentForm.tsx
  - src/pages/inventory/index.tsx
  - src/pages/suppliers/index.tsx
  - src/shared/lib/audit-actions.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/groupOrderItemsForReceipt.test.ts
  - src/shared/lib/i18n/locales/en-US/entities.json
  - src/shared/lib/i18n/locales/en-US/featMgmt.json
  - src/shared/lib/i18n/locales/en-US/pages.json
  - src/shared/lib/i18n/locales/en-US/settings.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/entities.json
  - src/shared/lib/i18n/locales/es-MX/featMgmt.json
  - src/shared/lib/i18n/locales/es-MX/pages.json
  - src/shared/lib/i18n/locales/es-MX/settings.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx
  - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
  - src/widgets/InventoryPagePanel.tsx
  - src/widgets/PaymentModal/PaymentModal.test.tsx
  - src/widgets/SettingsTabsPanel/index.tsx
  - src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx
  - src/widgets/SupplierListPanel.tsx
  - supabase/functions/receive-shipment/index.ts
  - supabase/migrations/20260817000001_suppliers_receiving_expiry.sql
  - supabase/migrations/20260817000002_receive_shipment_atomicity.sql
findings:
  critical: 0
  warning: 4
  info: 0
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-08-14T14:13:00-06:00
**Depth:** standard
**Files Reviewed:** 50
**Status:** issues_found

## Summary

Re-reviewed all Phase 03 implementation commits through `4319b90`, including the receiving RPC's caller, migrations, and regression coverage. CR-01 is resolved: rejected lines now raise a controlled exception inside the RPC's exception block, so PostgreSQL rolls back all writes in that block before the function returns `{ ok: false }`. The follow-up migration applies the same repair to databases that already ran the original migration.

The focused regression test passed: `npx playwright test e2e/53-supplier-receiving.spec.ts --grep 'rejects a later invalid line'` — 1 passed (15.5s). It confirms a valid first line plus a later unknown product leaves both inventory and shipment count unchanged.

## Warnings

### WR-01: Supplier/product synchronization can leave partial relationship state

**File:** `src/entities/supplier/model/queries.ts:106-169`

**Issue:** Both sync functions delete all existing relationships and then issue a separate insert request. If that insert fails, the supplier/product is left with no links. Supplier creation has the same problem: the supplier insert can succeed, link synchronization can fail, and a retry can create a duplicate supplier.

**Fix:** Move the parent write plus relationship replacement into one transactional Postgres RPC. At minimum, return the persisted supplier ID on a failed link write so callers can recover instead of retrying blindly.

### WR-02: The near-expiry tab silently renders an empty table on a failed request

**File:** `src/widgets/InventoryPagePanel.tsx:113, 428-435`

**Issue:** The panel discards `resultError` and loading state from `useNearExpiryAlerts()`. A failed query renders an empty table rather than an error, so staff cannot distinguish unavailable alerts from no alerts.

**Fix:** Render an alert/error state from `resultError`, a loading state while pending, and use the empty state only after a successful empty result.

### WR-03: Database contract is stale and Phase 03 queries bypass it with `any`/casts

**File:** `src/entities/supplier/model/queries.ts:14`; `src/entities/inventory/model/queries.ts:255-260`

**Issue:** The generated Supabase contract has no Phase 03 supplier/shipment tables, RPC, `inventory.cost_price`, or `inventory.expiry_date`. Broad `any` and `unknown` casts therefore suppress compile-time checking at the database boundary.

**Fix:** Regenerate `src/shared/lib/supabase.types.ts` against the migrated database and remove the broad client/cast escapes while retaining runtime parsing.

### WR-04: Coverage still misses authorization and alert-display behavior

**File:** `e2e/53-supplier-receiving.spec.ts:140-194`; `e2e/54-near-expiry-alerts.spec.ts:12-22`

**Issue:** The new test correctly locks in RPC atomicity, but it calls the RPC with a service client, not the Edge Function as a cashier. The expiry test covers only setting persistence, not manager rejection, threshold filtering, or the Home/Inventory/Cart surfaces. Authorization and user-visible alert regressions remain undetected.

**Fix:** Add E2E/integration checks for cashier receipt rejection through `receive-shipment`, manager failure to update `near_expiry`, seeded inside/outside-window expiry rows, all three alert surfaces, and the empty state.

---

_Reviewed: 2026-08-14T14:13:00-06:00_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
