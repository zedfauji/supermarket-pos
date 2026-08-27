# Phase 3: Supplier, Receiving & Expiry Tracking - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning

<domain>
## Phase Boundary

The owner can register suppliers, receive a shipment against a supplier in one atomic confirm step (stock, cost, and expiry updated together, no PO approval workflow), and see accurate real-time stock, low-stock, and near-expiry signals without manual reconciliation. Covers INV-01..04, SUP-01..02, EXP-01..02.

Real-time stock view (INV-01), manual adjustment with reason (INV-02), physical count reconciliation (INV-03), and low-stock list (INV-04) are **already implemented** (`src/pages/inventory`, `src/features/physical-count`, `LowStockBadge`) — this phase's net-new build surface is supplier CRUD, the atomic receiving flow, and expiry tracking/alerting. Confirm INV-01..04 still pass as-is; don't rebuild them.

</domain>

<decisions>
## Implementation Decisions

### Supplier ↔ Product Relationship
- **D-01:** Many-to-many join table (`supplier_products` or similar) links suppliers to the products they supply, not a free-text field or a single `preferred_supplier_id` FK. — **Reversibility:** costly — a join table is easy to add to but migrating away from it (e.g. collapsing to a single FK) means picking one supplier per product and discarding the rest of the relationships.
- **D-02:** The product-supplier assignment UI is editable from **both** the Supplier form (multi-select products) and the Product form (multi-select suppliers), synced to the same join table. Both UIs must be built and kept consistent against one underlying relationship.

### Receiving Flow — New Products
- **D-03:** Receiving line items support **inline quick-add**: if a scanned/entered barcode has no catalog match, the cashier can create a minimal product without leaving the receiving screen. Quick-add captures **name, category, barcode, and sale price** — the product is immediately sellable, no follow-up trip to product management required.

### Cost Price
- **D-04:** Receiving writes a `cost_price` (landed cost) field, stored separately from `basePrice` (sale price). Receiving never modifies `basePrice` — sale price stays edited only via existing product management. Avoids surprise price changes on every delivery.

### Expiry Tracking & Alerting
- **D-05:** EXP-01: one active expiry date per product, captured at receiving time (already the locked project-level decision in PROJECT.md — no batch-level FEFO).
- **D-06:** EXP-02 near-expiry alert surfaces in **three places**: a Home dashboard tile/badge (mirrors the existing `LowStockBadge` pattern), a near-expiry list/tab on the Inventory page (next to low-stock), and a surfaced signal on the POS checkout screen when an expiring item is scanned/added to cart.
- **D-07:** The near-expiry window is **configurable in Settings** (admin-only, mirrors existing Settings-tab patterns like Tip Split), not hardcoded to 14 days. 14 days is the default value, not a fixed constant.

### Receiving Atomicity
- **D-08:** Receiving is implemented as a **single atomic Postgres RPC** (e.g. `receive_shipment`) that commits stock + cost + expiry for all line items together or not at all — mirrors the established `process_direct_sale_atomic`/`process_payment_atomic` pattern from Phase 2, not a client-side loop of per-line-item calls. — **Reversibility:** costly — SUP-02 explicitly requires atomicity ("no PO approval workflow or status machine"); a client-loop implementation would need to be rewritten as an RPC to fix a partial-failure bug later, not just patched.

### Claude's Discretion
- Exact `supplier_products` table shape (columns beyond the FK pair), Supplier record's contact fields (phone/email/address — SUP-01 says "name, contact, products supplied" but doesn't specify contact field granularity), and where exactly on the POS checkout screen the near-expiry signal appears (banner vs. cart-line badge) are left to research/planning to resolve against existing UI patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Inventory (INV-01..04), §Supplier & Receiving (SUP-01..02), §Expiry (EXP-01..02) — the locked requirement text for this phase
- `.planning/ROADMAP.md` §Phase 3 — goal, success criteria, dependency on Phase 1 only (parallelizable with Phase 2, which is now complete)
- `.planning/PROJECT.md` §Key Decisions — locks "no FIFO/FEFO, no multi-warehouse, no auto-PO, one active expiry per product" as out-of-scope guardrails for this phase

### Established Atomic-RPC Pattern (to mirror for receiving)
- `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql` (or latest `process_direct_sale_atomic` definition) — the Phase 2 pattern: server-derived totals, atomic multi-effect commit, idempotency-key replay handling
- `src/entities/inventory/model/queries.ts`, `src/entities/inventory/model/store.ts` — existing inventory query/mutation patterns and Realtime bridge (`useInventoryRealtimeBridge`)

### Existing Low-Stock Pattern (to mirror for near-expiry)
- `src/entities/inventory/ui/LowStockBadge.tsx` — badge pattern to replicate for a near-expiry badge
- `src/pages/inventory/index.tsx` — `useLowStockToast` pattern (Sonner toast on new alert) and how `InventoryPagePanel` composes low-stock UI; near-expiry should follow the same composition

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/features/physical-count/` and `src/features/adjust-inventory/` — established feature-folder pattern (1 mutation hook + 1 UI component) for inventory-affecting actions with required-reason audit logging; the receiving feature should follow the same shape
- `src/entities/inventory/model/queries.ts` (`useInventoryAlerts`) — existing low-stock query to pattern-match a `useNearExpiryAlerts` query against
- `src/shared/lib/domain.ts` `InventorySchema`/`InventoryLogSchema` — Zod source-of-truth pattern; new `cost_price`/`expiry_date` fields and the new `Supplier`/`SupplierProduct` schemas must be added here, never hand-written elsewhere

### Established Patterns
- Atomic RPC + edge function pairing (Phase 2's `process_direct_sale_atomic` + `process-direct-sale` edge function) is the house style for any multi-effect, must-not-partially-fail mutation — receiving must follow it, not a client-side transaction-less loop
- Settings tabs are added as new admin-gated tabs following the `TipDistributionSettingsTab` pattern (`manage_settings` RBAC action) — the near-expiry threshold setting should follow this, likely stored in the existing `settings` key-value table like `tip_distribution` was

### Integration Points
- No `supplier` code exists anywhere in `src/` or `supabase/migrations/` today (confirmed via grep) — this is greenfield within the existing FSD skeleton (new `entities/supplier`, `features/manage-suppliers`, `features/receive-shipment`, likely a new `/suppliers` or `/receiving` route + nav tile)
- `ProductSchema` (`src/shared/lib/domain.ts`) has no `cost_price` or `expiry_date` field yet — must be added; note `comboEligible`/`isCombo`/`comboPriceOverride` are dormant leftover fields from the Phase 1 strip (deliberately left in place per STATE.md) — do not confuse with new receiving-related fields
- Home dashboard tile pattern for the new near-expiry badge should mirror wherever `LowStockBadge` (or an equivalent) is currently surfaced on `/home`, if it is — verify during research

</code_context>

<specifics>
## Specific Ideas

No specific UI mockups or reference products were discussed beyond the decisions above — open to standard approaches for exact layouts (Supplier list/detail page, receiving line-item table).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (AI invoice intake, FIFO/FEFO batch tracking, multi-warehouse, supplier scorecards remain explicitly out of scope per PROJECT.md and are not this phase's concern.)

</deferred>

---

*Phase: 3-Supplier, Receiving & Expiry Tracking*
*Context gathered: 2026-08-14*
