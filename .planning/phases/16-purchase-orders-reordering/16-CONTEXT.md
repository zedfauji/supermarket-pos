# Phase 16: Purchase Orders & Reordering - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning

<domain>
## Phase Boundary

A manager+ can create a purchase order against a supplier (manual line items or a one-action low-stock-seeded draft), edit it, and receive it in full — delegating the actual stock/cost/expiry mutation to the existing `receive_shipment` RPC (extended with an optional PO reference) rather than duplicating receiving logic. New schema: `purchase_orders` / `purchase_order_items`. Cashiers have no access to this feature at all (create, receive, or view).

Out of scope (per PROJECT.md/REQUIREMENTS.md): partial/backorder receiving, auto-PO generation/demand forecasting, multi-level approval workflow, multi-supplier price comparison, EDI/API integration to suppliers.

</domain>

<decisions>
## Implementation Decisions

### PO access control
- **D-01:** Reuse the existing `manage_products` RBAC action to gate all PO functionality (create, edit, receive) — manager+admin already have it, cashier doesn't, and it exactly matches PO-01..03's "manager+" requirement. No new `manage_purchase_orders` action.
- **D-02:** The whole PO feature (including read/list/detail view) is manager+ only — cashiers cannot see purchase orders at all, matching how the existing Suppliers page already works (no cashier access). No read/write RBAC split.

### Creation & lifecycle implementation path
- **D-03:** PO creation and status transitions (draft → submitted, edits) use plain RLS-gated inserts/updates on `purchase_orders`/`purchase_order_items` — **not** a new RPC/Edge Function. Unlike `receive_shipment`, PO creation has no cross-table atomicity requirement (stock/cost/expiry don't move at create time), so a manager-gated RLS policy is sufficient.
- **D-04:** Receiving a PO in full still goes through `receive_shipment`, extended to accept an optional `po_id` (or similar) parameter. **`receive_shipment` itself sets `purchase_orders.status = 'received'`/closed** when a PO reference is passed — not a separate client-side update after the RPC call — keeping the stock mutation and PO status change atomic in one RPC, avoiding a window where stock moved but the PO still shows open. — **Reversibility:** costly — **rationale:** changes the `receive_shipment` RPC's signature and internal transaction; once other callers (PO flow, receiving UI) depend on the new atomic-close behavior, reverting to a two-step client update requires touching every caller and re-auditing the non-atomic window.

### Line-item cost default
- **D-05:** A PO line item's cost defaults to the product's current `inventory.costPrice` (the same weighted-average-cost field `receive_shipment` already maintains) when a manager adds a product to a PO. Requires no schema change — read-only lookup at add-line time, manager can still edit it.
- **D-06:** When a product has never been received (`costPrice` is null), the line defaults to 0 and the manager fills it in manually — same fallback behavior `ReceiveShipmentForm` already uses today. No blocking validation forcing a cost before the line saves.

### Draft reorder quantities (PO-02 auto-draft)
- **D-07 (Claude's discretion, confirmed default):** Suggested quantity per line = `lowStockThreshold − quantityOnHand`, floored at 0 (top up to the reorder point). No arbitrary multiplier/buffer — uses only fields that already exist on every product, no dependency on missing pack-size data.
- **D-08:** For products where `products.unitsPerPackage` is set (case/box products from the open-unit feature), round the raw top-up quantity **up** to the nearest whole multiple of `unitsPerPackage` — you're ordering cases from a supplier, not loose units. Falls back to the raw D-07 quantity when `unitsPerPackage` is null (the common case — most products have no case/box link; per research PITFALLS.md Pitfall 4, `supplier_products` itself carries no pack-size data at all).

### Claude's Discretion
- Exact reorder-quantity formula (D-07) and its case-rounding behavior (D-08) — user explicitly deferred to "You decide"; the values above are the concrete defaults to implement, not open questions for the planner to re-raise.
- PO status enum values beyond draft/received-closed (e.g. whether an intermediate "submitted"/"ordered" status exists between draft and received) were not discussed — not raised as a gray area by the user; planner should pick the minimum states PO-01..03's success criteria require (draft → received/closed is the only lifecycle the requirements actually name).
- UI page placement (new top-level route vs. a tab/panel on the existing Suppliers page) was not discussed — Phase 16 carries `UI hint: yes` in ROADMAP.md, so route this through `/gsd-ui-phase 16` before/alongside planning rather than deciding it here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` §PO-01..03 — locked requirement text, v2-deferred items (partial/backorder receiving), Out of Scope table (no auto-PO/forecasting, no multi-level approval, no multi-supplier comparison, no EDI/API integration)
- `.planning/ROADMAP.md` §"Phase 16" — goal, success criteria (4 items), depends-on note (sequenced last so `receive_shipment` stays stable through Phases 14-15), `UI hint: yes`

### Project-level decisions
- `.planning/PROJECT.md` — Out of Scope: FIFO/weighted-average costing engines, demand forecasting, automatic PO generation; batch-level FEFO auto-allocation; supplier performance analytics
- `.planning/STATE.md` Blockers/Concerns (Phase 16 entries) — the two open decisions this discussion resolved (RBAC action choice, create-PO architecture) plus the reorder-quantity pack-size rounding pitfall (D-08 resolves it)

### Prior phase context (v1.3)
- `.planning/phases/14-inventory-analytics-reports-valuation-shrinkage-waste-expiry/14-CONTEXT.md` — established `stock_movements`/`inventory_log` reconstruction patterns; not directly reused here but same milestone's data-model conventions
- `.planning/phases/15-receipt-designer-layout-branding-logo-printing/` — most recent completed phase; established this milestone's TDD/wave-execution pattern, no functional overlap with PO work

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/entities/supplier` (`model/queries.ts`, `useSupplierProductIds`, `syncSupplierProducts`) — supplier/product linking already built; PO product-picker can filter by `supplier_products` the same way `SupplierForm` does.
- `src/features/receive-shipment` (`useReceiveShipment.ts`, `ReceiveShipmentForm.tsx`) — the RPC-call pattern and line-item form UX (product select, qty, cost, expiry inputs) to mirror for PO line items; `receive_shipment` itself is the RPC PO-03 extends.
- `src/entities/inventory/model/store.ts` — `lowStockAlerts`/`lowStockProductIds` (derived from `quantityOnHand <= lowStockThreshold`) is the exact data source for PO-02's auto-draft seed list.
- `src/shared/lib/domain.ts` `ProductSchema.unitsPerPackage` — existing case/box pack-size field (Phase 27, open-unit feature) to use for D-08's rounding; `SupplierProductSchema` has no cost or pack-size field (link-table only: id/supplierId/productId/createdAt).
- `src/shared/lib/rbac.ts` — `manage_products` already resolves to `MANAGER_EXTRA` (manager+admin); reused as-is per D-01, no changes needed to this file.

### Established Patterns
- Manager-gated feature pages with no cashier route access (Suppliers page) — PO page should follow the same pattern, not a permission-conditional render.
- RPC-for-atomic-multi-table-write pattern (`receive_shipment`, `process_direct_sale_atomic`) vs. plain-RLS-insert pattern (most CRUD features, e.g. `manage-suppliers`) — D-03/D-04 explicitly split PO create (plain RLS) from PO receive (extends the existing atomic RPC).

### Integration Points
- `receive_shipment` RPC signature (currently: supplier_id, line items with product/qty/cost/expiry) needs an additive optional `po_id` param — must stay backward-compatible with the existing non-PO receiving flow (Suppliers page "Receive Shipment" button), which has no PO to reference.
- New `purchase_orders`/`purchase_order_items` tables need RLS policies scoped to `manage_products`-equivalent role check, following the existing `suppliers`/`supplier_products` RLS pattern.

</code_context>

<specifics>
## Specific Ideas

No specific UI/visual references given — user deferred UI placement/layout decisions to `/gsd-ui-phase 16` (ROADMAP.md already flags `UI hint: yes` for this phase).

</specifics>

<deferred>
## Deferred Ideas

None raised — discussion stayed within the four selected implementation-decision areas (PO access control, creation path, cost default, draft reorder quantities). No scope-creep redirects were needed.

</deferred>

---

*Phase: 16-Purchase Orders & Reordering*
*Context gathered: 2026-08-23*
