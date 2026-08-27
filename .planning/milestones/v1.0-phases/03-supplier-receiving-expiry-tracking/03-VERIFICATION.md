---
phase: 03-supplier-receiving-expiry-tracking
verified: 2026-08-14T14:20:00-06:00
status: human_needed
score: 1/4 must-haves verified
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "Real-time stock remains accurate after adjustment and physical-count reconciliation."
    test: "Adjust stock with a required reason, then reconcile a physical count and confirm the on-hand value and audit entry update."
    expected: "The stock view updates without manual reconciliation and the adjustment is audit logged."
    why_human: "The relevant query, realtime bridge, adjustment, and physical-count code are wired, but this verification did not obtain a passing transition test."
  - truth: "An owner can create/edit a supplier and receive goods in one atomic confirm step."
    test: "Create and edit a supplier, receive a multi-line shipment, then confirm stock, cost, and expiry update together."
    expected: "The supplier changes persist and all receipt lines appear together without a purchase-order status flow."
    why_human: "All receiving E2E cases now pass, but supplier creation and editing themselves are not exercised by the receiving spec."
  - truth: "Near-expiry alerts are visible in normal operation and their threshold persists."
    test: "Change the admin threshold to a value different from the current value, reload, seed an in-window product, then inspect Home, Inventory, and POS."
    expected: "The saved threshold returns after reload and all three surfaces show the advisory signal."
    why_human: "Threshold persistence now passes, but no E2E test seeds an in-window product and asserts the Home, Inventory, and cart surfaces."
---

# Phase 3: Supplier, Receiving & Expiry Tracking Verification Report

**Phase Goal:** The owner can register suppliers, receive a shipment against a supplier in one atomic confirm step (stock, cost, and expiry updated together), and see accurate real-time stock, low-stock, and near-expiry signals without manual reconciliation.

**Status:** human_needed

The roadmap marks this phase `mvp`, but its goal is not a valid `As a … I want … so that …` user story. Verification therefore uses the four observable roadmap success criteria directly.

## User Flow Coverage

| Step | Expected outcome | Code evidence | Status |
| --- | --- | --- | --- |
| Maintain stock | Stock renders, adjusts with a reason, and physical count recalculates it | `src/entities/inventory/model/queries.ts`, `src/features/physical-count/model/usePhysicalCount.ts`, `src/pages/inventory/index.tsx` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED |
| See low stock | Reorder-point-derived low-stock signal is visible | `useInventoryAlerts()` plus `InventoryPagePanel` and `LowStockBadge` consumers; focused query tests pass | ✓ VERIFIED |
| Receive goods | Supplier CRUD leads to a multi-line receiving form, Edge Function, and atomic RPC | `/suppliers` route; `ReceiveShipmentForm`; `callReceiveShipment`; `receive_shipment` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED |
| See expiry risk | One threshold-driven query feeds Home, Inventory, and cart signals | `useNearExpiryAlerts()`; `HomeDashboard`; `InventoryPagePanel`; `CartItem` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED |

## Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Accurate stock follows adjustment and physical count | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Inventory query/realtime bridge and the adjustment/physical-count paths are substantive and wired; physical-count unit transitions pass, but manual adjustment/realtime were not re-proven. |
| 2 | Low-stock list follows each product's reorder point | ✓ VERIFIED | `useInventoryAlerts()` is a real inventory/products query rendered by the inventory UI/badge; its focused query tests pass. |
| 3 | Supplier editing and one-step atomic receiving update stock, cost, and expiry together | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | All three receiving E2E cases pass, including successful quick-add receipt and atomic invalid-later-line rollback; supplier create/edit UI lacks direct coverage. |
| 4 | Near-expiry alerts are visible during normal operation | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Threshold persistence E2E passes and all three surfaces are wired to the real query; populated/empty surface behavior is untested. |

**Score:** 1/4 truths behaviorally verified; 3 present but behavior-unverified.

## Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` | Supplier/shipments schema and receiving RPC | ✓ VERIFIED | Substantive schema, RLS, inventory columns, upsert, and service-role grant. |
| `supabase/migrations/20260817000002_receive_shipment_atomicity.sql` | Repair applied to already-migrated databases | ✓ VERIFIED | Pre-validates all items before writes and catches controlled errors after rollback. |
| `supabase/functions/receive-shipment/index.ts` | Authenticated, validated RPC wrapper | ✓ VERIFIED | Authenticates caller, validates Zod body, and calls `admin.rpc('receive_shipment')`. |
| `src/entities/supplier/model/queries.ts` | Supplier reads/mutations | ✓ VERIFIED | Real Supabase queries feed the supplier UI; see advisory type-contract warning below. |
| `src/features/receive-shipment/ui/ReceiveShipmentForm.tsx` | Multi-line receipt form | ✓ VERIFIED | Submits `supplierId` and mapped lines through `useReceiveShipment`. |
| `src/entities/inventory/ui/NearExpiryBadge.tsx` | Advisory expiry badge | ✓ VERIFIED | Renders real `useNearExpiryAlerts()` results, not static data. |
| `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` | Admin threshold setting | ✓ VERIFIED | Persists `near_expiry` through existing settings mutation and admin permission gate. |

## Key Links and Data Flow

| From | To | Status | Evidence |
| --- | --- | --- | --- |
| Receive form | client contract → Edge Function → RPC | ✓ WIRED | `useReceiveShipment` calls `callReceiveShipment`; the Edge Function passes mapped fields to `admin.rpc('receive_shipment')`. |
| Receiving RPC | inventory and stock movements | ✓ WIRED | `INSERT ... ON CONFLICT (product_id) DO UPDATE` updates only `inventory.cost_price`/`expiry_date`; it never updates `products.base_price`. |
| Near-expiry UI | settings → inventory query → Home/Inventory/cart | ✓ FLOWING | The query reads `settings.nearExpiry.thresholdDays`, selects actual inventory/products rows, and each of the three surfaces consumes its result. |
| Settings authorization | browser → `settings` RLS | ✓ WIRED | The existing policy permits every key to admins while manager keys are restricted to `billing`/`pool_tables`, excluding `near_expiry`. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Quick-add receipt, duplicate-barcode recovery, and invalid later-line rollback | `npx playwright test e2e/53-supplier-receiving.spec.ts` | 3 passed | ✓ PASS |
| Invalid later shipment line rolls back earlier valid line and shipment header | `npx playwright test e2e/53-supplier-receiving.spec.ts --grep 'rejects a later invalid line'` | 1 passed | ✓ PASS |
| TypeScript contract compiles | `npm run typecheck` | exit 0 | ✓ PASS |
| Threshold save survives reload | `npx playwright test e2e/54-near-expiry-alerts.spec.ts --reporter=line` | 1 passed after selecting a value different from the persisted one | ✓ PASS |
| Low-stock query and physical-count transitions | `npx vitest run src/entities/inventory/model/queries.test.ts src/features/physical-count/model/usePhysicalCount.test.ts --reporter=dot` | 14 passed | ✓ PASS |

## Requirements Coverage

| Requirement | Status | Evidence |
| --- | --- | --- |
| INV-01 | NEEDS HUMAN | Inventory query/realtime bridge and physical-count transitions are proven; manual adjustment/realtime transition was not re-proven. |
| INV-02 | NEEDS HUMAN | Required-reason adjustment and audit path exist; transition not re-proven. |
| INV-03 | NEEDS HUMAN | Physical-count reconciliation hook/UI exist; transition not re-proven. |
| INV-04 | SATISFIED | Reorder-point query behavior is covered by focused passing tests and wired to UI consumers. |
| SUP-01 | NEEDS HUMAN | Supplier list/form CRUD is wired to real Supabase mutations; no direct create/edit browser case exists. |
| SUP-02 | SATISFIED | Successful quick-add receiving and atomic rejection both pass in browser/E2E coverage. |
| EXP-01 | SATISFIED | Successful E2E receipt proves expiry persistence; the RPC exclusively writes `inventory.expiry_date`. |
| EXP-02 | NEEDS HUMAN | Threshold persistence passes; populated/empty normal-operation alert surfaces lack E2E coverage. |

## Anti-Patterns and Advisory Findings

No untracked `TBD`, `FIXME`, or `XXX` debt marker was found in the Phase 03 implementation paths.

- `src/entities/supplier/model/queries.ts` and the expiry query use broad Supabase type escapes because generated database types are stale (review WR-03). This is a maintainability warning, not a disconnected feature path.
- `InventoryPagePanel` renders an empty near-expiry table on query failure rather than a distinct error state (review WR-02). This does not falsify the success criterion, but staff cannot distinguish a failed request from no alerts.
- Supplier/product link replacement is not transactional (review WR-01). It is outside one-step receiving atomicity, but a failed second request can leave relationships partially synchronized.

## Human Verification Required

1. Run the three user-flow checks listed in the frontmatter: manual stock adjustment/realtime, supplier create/edit, and populated/empty expiry surfaces.
2. Add automated E2E coverage for a cashier rejection through the Edge Function, manager denial for `near_expiry`, and the populated/empty expiry surfaces. These were plan acceptance checks but are absent from `e2e/54-near-expiry-alerts.spec.ts`.

_Verified: 2026-08-14T14:20:00-06:00_
_Verifier: gsd-verifier_
