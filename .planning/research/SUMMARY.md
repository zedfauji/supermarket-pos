# Project Research Summary

**Project:** Supermarket POS — Receipt Designer + Purchase Orders + Inventory Analytics (v1.3 milestone)
**Domain:** Single-store grocery POS extension: receipt branding/layout customization, supplier purchase-order/reordering workflow, and inventory valuation/shrinkage/turnover reporting
**Researched:** 2026-08-19
**Confidence:** HIGH

## Executive Summary

This milestone adds three features to an already-mature Tauri 2 + React 19 + Supabase supermarket POS: a receipt template/branding designer, a purchase-order/reordering workflow, and four new inventory analytics reports (valuation, shrinkage/waste, expiry-loss, turnover). Across all four research tracks, the dominant finding is the same: **almost nothing new needs to be installed or architected from scratch.** This is overwhelmingly an extension exercise — new Postgres columns/tables/views styled exactly like the existing `receipt_settings`/`suppliers`/`shipments` schema, and new UI composed from libraries already in the repo (`recharts`, `@react-pdf/renderer`, `xlsx`, TanStack Query, shadcn). The one genuinely new engineering surface is on the Rust side: `printer.rs` currently only ESC/POS-encodes a flat `Vec<String>` with one hardcoded bold/centered line and has zero bit-image (logo) support — a real receipt designer requires extending that Rust command with structured elements and, if logo printing is in scope, a `GS v 0` raster path via the `image` crate.

The recommended approach is disciplined reuse of three already-proven patterns in this codebase: (1) `receipt_settings` as a singleton table gets new columns, not a new `receipt_templates` entity; (2) PO receiving must call into the existing, twice-hardened `receive_shipment` RPC rather than duplicating its weighted-average-cost/earliest-expiry-wins logic; (3) all four new reports are read-only aggregation queries over existing tables (`inventory`, `stock_movements`, `inventory_log`), not new movement-tracking or snapshot tables. The project's own history is the strongest evidence for these constraints — v1.1 shipped a retroactive RLS/singleton-constraint fix (SEC-02) for `receipt_settings` and a cost/expiry-overwrite bug fix for `receive_shipment`; repeating either shortcut in this milestone reopens bugs this codebase already paid down.

The key risks are: (a) a receipt-designer preview that doesn't match real thermal output (fixed-width monospace grid, single-byte codepage, no CSS) unless preview and print share one formatter; (b) reorder suggestions computed in the wrong unit of measure (base units vs. supplier pack/case size) producing unusable PO lines; (c) inventory reports using inconsistent or undocumented cost bases, causing numbers that don't reconcile with the Inventory page or Product Sales report. All three are addressed by pinning formulas/patterns in each phase's plan before implementation and reusing single-source-of-truth modules (`receipt-format.ts`, `receive_shipment`, one documented cost-basis per report) rather than building parallel logic.

## Key Findings

### Recommended Stack

No new frontend dependencies are required for PO or reporting work — `recharts`, `@react-pdf/renderer`, `xlsx`, Zod, TanStack Query, and Zustand are already installed and already the established pattern for charts, PDFs, exports, and state. The template/branding config should be a Zod-validated JSONB column on `receipt_settings`, not a new store. The only real additions are on the Rust side.

**Core technologies (all reused, not added):**
- Postgres JSONB column + Zod (`ReceiptTemplateSchema`) — versioned, validated receipt layout config on the existing singleton `receipt_settings` table
- `recharts` (installed) — inventory analytics charts, same library as existing Reports tabs
- `@react-pdf/renderer` (installed) — PO documents / printable inventory reports, same pattern as existing email receipts/exports
- `xlsx` (installed) — report export, already used by `shared/lib/exporters`
- `image` crate (Rust, new) — decode/dither logo for ESC/POS `GS v 0` bit-image printing, only if thermal logo printing is in scope this milestone

**Explicitly rejected additions:** a second charting library, a drag-drop page-builder (GrapesJS/Craft.js), `xstate` for PO status (a DB `CHECK`/enum handles a 4-state workflow), a Rust ESC/POS crate (hand-rolled encoder already works), materialized views/BI tooling for reports (single-store scale doesn't need it), client-side image dithering libraries.

### Expected Features

**Must have (table stakes) — P1:**
- Logo on printed receipt (new Rust work — `logoDataUrl` exists but never reaches the thermal print path)
- Editable header/footer text and optional line-item toggles (mostly already-existing schema fields, needs proper editor UI)
- Live print-accurate preview before printing
- PO creation with line items against a supplier, reusing `suppliers`/`supplier_products`
- Low-stock-seeded reorder suggestions (highest-leverage, lowest-cost feature — data already exists)
- Receive against an open PO (full receive, delegating to `receive_shipment`)
- Inventory valuation, shrinkage/waste, and expiry-loss reports (read-only aggregations)

**Should have (competitive) — P2:**
- Partial PO receiving with backorder tracking (add after full-receive flow is proven)
- Turnover report (layers on top of valuation)
- Category-level shrinkage/turnover breakdowns

**Defer (v2+/P3):**
- Locale-aware custom field labels beyond existing `receipt` i18n namespace
- Trend views (week/month-over-month) for the new reports
- Multiple receipt templates per terminal, auto-PO generation/forecasting, multi-supplier price comparison, EDI integration, multi-level PO approval, FIFO/FEFO costing, AI-driven shrinkage classification — all explicitly anti-features for this single-store, 1-2-terminal scope (several directly excluded in PROJECT.md).

### Architecture Approach

No new FSD layer or backend paradigm. Every new capability is either an extension of an existing entity/table or a new entity (`entities/purchase-order`) that mirrors the exact `receive_shipment` pattern: Zod-validated Edge Function → `SECURITY DEFINER` RPC → RLS-protected tables → `record_audit`.

**Major components:**
1. `entities/settings` (extend) + `shared/lib/receipt-format.ts` (extend) — template-driven receipt rendering, single formatter shared by preview, print, and PDF paths
2. `entities/purchase-order` (new) + `create-purchase-order`/`receive-po-shipment`/`suggest-reorder` features — PO lifecycle, with `receive-po-shipment` as a thin wrapper delegating to `receive_shipment`
3. Four new report widgets (`InventoryValuationPanel`, `ShrinkageWasteReport`, `ExpiryLossReport`, `TurnoverReport`) — TanStack Query hooks running aggregate `select`s over existing `inventory`/`stock_movements`, wired into `ReportsPage`'s existing Tabs and `export-report` CSV exporter

Suggested build order (dependency-driven, from ARCHITECTURE.md): (1) receipt_settings schema extension + template-driven rendering first (lowest risk, unblocks UI), (2) inventory reporting second (zero new schema beyond an optional `reason` enum value, independent of PO work), (3) purchase orders third (highest schema-design risk, benefits from patterns proven in 1-2), (4) receipt designer UI polish last.

### Critical Pitfalls

1. **Receipt preview doesn't match real thermal output** — the physical printer is a fixed 42-48 char monospace grid, not a CSS canvas. Avoid by rendering preview through the exact same formatter (`receipt-format.ts`) that generates the ESC/POS byte stream, and enforce the character budget in the editor itself.
2. **Non-ASCII/accented characters (es-MX) print as garbage** — ESC/POS uses single-byte codepages, not UTF-8. Explicitly set/verify printer codepage once at printer-service init and test with real Spanish accented text, not ASCII fixtures.
3. **A second "receive stock" code path duplicates `receive_shipment`** — this RPC was hardened twice in v1.1 (cost/expiry-overwrite fix, weighted-average-cost fix). PO receiving must call into it, never reimplement stock/cost/expiry mutation.
4. **Reorder suggestions in the wrong unit of measure** — computing suggestions in base units (pieces/grams) instead of supplier pack/case size produces unusable PO lines. Must round to `supplier_products` pack size and flag products with missing data.
5. **Inventory reports use inconsistent cost bases** — valuation, margin, and turnover must each use one clearly documented cost-basis definition (current weighted-average cost, distinct from historical-cost-snapshot margin) so numbers reconcile across reports; state the formula in the report UI itself.
6. **New receipt-template storage skips the RLS/migration discipline this project already relearned the hard way** — `receipt_settings` needed a retroactive RLS/singleton fix in v1.1 (SEC-02); any new template storage must get migration-tracked RLS and cardinality constraints from its first migration, not "later."

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss)
**Rationale:** Zero new schema beyond one optional `reason` enum addition; entirely read-only aggregation over data that already exists (`inventory.cost_price`, `stock_movements`). Lowest risk, fastest path to shipped value, fully independent of PO/receipt-designer work — ships first per ARCHITECTURE.md's dependency-ordered build order.
**Delivers:** Three new Reports tabs (valuation, shrinkage/waste, expiry-loss) with documented, single cost-basis formulas surfaced in the UI.
**Addresses:** FEATURES.md P1 items — inventory valuation report, shrinkage/waste report, expiry-loss report.
**Avoids:** Pitfalls 6, 7, 8 (cost-basis mismatch, shrinkage double-counting, expiry-loss overpromising batch traceability) — pin formula/scope in the plan before implementation.

### Phase 2: Receipt Designer (Layout, Branding, Logo Printing)
**Rationale:** Purely additive migration to the existing `receipt_settings` singleton; independent of PO work. Sequenced after reports because it carries the one genuinely new Rust engineering surface (thermal bit-image printing) and benefits from not competing with PO schema-design risk in the same window.
**Delivers:** Extended `ReceiptSettingsSchema` (structured element list), extended `receipt-format.ts` (template-driven rendering shared by preview/print/PDF), extended `printer.rs` (structured `PrintElement` payload, optional `GS v 0` logo raster via the `image` crate).
**Uses:** Existing `ReceiptPreview.tsx`, `receipt-format.ts`, Zod-as-source-of-truth convention; new `image` crate only if logo-on-paper is confirmed in scope.
**Implements:** ARCHITECTURE.md Pattern 3 (`receipt_settings` extension over new entity).
**Avoids:** Pitfalls 1, 2, 3 (preview/print divergence, codepage garbling, RLS/migration discipline gap) — automated tests should round-trip a saved template through the real ESC/POS encoder and assert line-length budget + accented-character bytes.

### Phase 3: Purchase Orders & Reordering
**Rationale:** Highest schema-design risk (new tables, new RBAC decision, PO status lifecycle) — sequenced last so it lands after the two lower-risk tracks have proven the reporting-aggregation and RLS/migration patterns this phase reuses. `receive-po-shipment` must be built on top of an already-stable `receive_shipment`.
**Delivers:** `purchase_orders`/`purchase_order_items` tables + RLS, `create_purchase_order`/`receive_po_shipment` RPCs, low-stock-seeded PO suggestion UI, PO list/detail pages.
**Addresses:** FEATURES.md P1 items — PO creation, reorder suggestions, receive-against-PO; P2 partial receiving deferred to a later milestone.
**Avoids:** Pitfalls 4, 5 (wrong unit of measure in reorder suggestions, duplicated receive-stock logic) — reorder query must join `supplier_products` for pack-size rounding and flag missing data; `receive_po_shipment` must delegate to `receive_shipment`, never reimplement it.

### Phase Ordering Rationale

- Dependencies discovered in research: valuation report is a prerequisite building block for turnover (if pursued later); PO receiving depends on `receive_shipment` remaining unchanged and stable, so PO work should not run concurrently with any receipt/report-driven changes to that RPC.
- Architecture pattern grouping: Phases 1 and 2 both follow "extend existing table + read/render existing data," while Phase 3 introduces genuinely new tables and a new RBAC decision — grouping by this risk profile lets the team validate the RLS/migration and read-aggregation patterns twice on low-risk work before applying them to higher-stakes new schema.
- Pitfall avoidance: sequencing reports before receipt-designer-logo and PO ensures the "single documented cost basis" discipline (Pitfall 6) is established early and can be referenced/reused rather than invented under time pressure during PO/valuation-adjacent decisions later.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Receipt Designer):** Rust `GS v 0` bit-image/raster ESC/POS command implementation (dithering, dot-width chunking) is genuinely new code with no existing pattern in this codebase — flag for `--research-phase` if logo-on-paper printing is confirmed in scope.
- **Phase 3 (Purchase Orders):** PO status RBAC gating decision (reuse `manage_products` vs. new `manage_purchase_orders` action) and whether `create-purchase-order` needs an Edge Function at all (vs. plain RLS-gated insert) are open decisions noted in ARCHITECTURE.md — resolve during phase planning, not deep research, but flag if the RBAC decision proves non-trivial.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Inventory Analytics):** Standard TanStack Query aggregation over existing tables, identical to every existing Reports tab pattern already in the codebase — well-documented, established pattern.
- **Phase 2 (Receipt Designer, non-logo portions):** Extending `receipt_settings` singleton + `receipt-format.ts` rendering is a direct rerun of a pattern already proven in this codebase (v1.1) — standard.
- **Phase 3 (Purchase Orders, core CRUD/lifecycle):** Two-table header+line-items pattern with `SECURITY DEFINER` RPC mirrors `shipments`/`receive_shipment` exactly — standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified directly against installed `package.json`/`Cargo.toml` and current source files (`printer.rs`, `pos-printer.ts`), not greenfield guessing. |
| Features | MEDIUM | Codebase-derived findings are HIGH confidence (direct source reads); competitive/table-stakes claims are cross-checked across multiple vendor docs/blogs (Lightspeed, Odoo, inFlow, AMS Retail, koronapos.com) — solid consensus but secondary sources. |
| Architecture | HIGH | Verified directly against this repo's own migrations, RPCs (`receive_shipment`), and FSD conventions — primary-source research, not generic domain patterns. |
| Pitfalls | HIGH overall; MEDIUM on exact reorder/valuation formulas | Grounded in this codebase's own documented history (v1.1 SEC-02 RLS fix, cost/expiry-overwrite bug fix) plus general ESC/POS and retail-inventory literature. Exact valuation/turnover formulas are not pinned in PROJECT.md and need to be decided during phase planning, not assumed. |

**Overall confidence:** HIGH

### Gaps to Address

- **Turnover averaging method** (Pitfall 9): no periodic-snapshot infrastructure exists yet for accurate period-average inventory value; PITFALLS.md recommends computing from the movement log going forward and documenting the limitation for pre-feature periods. Resolve during Phase 1 (or whenever turnover is scheduled) planning, not now.
- **Whether logo-on-paper printing is confirmed in scope for this milestone**: STACK.md and FEATURES.md both flag this as the single largest new-engineering item (Rust bit-image support); if descoped, the `image` crate addition and its associated research flag drop out entirely. Confirm during requirements/roadmap finalization.
- **PO write-access RBAC action** (reuse `manage_products` vs. new `manage_purchase_orders`): ARCHITECTURE.md notes this is "cheap either way" but undecided — resolve in Phase 3 planning.
- **Whether `create-purchase-order` needs its own Edge Function**: no cross-table atomicity requirement was identified for PO drafting itself (only for receiving); evaluate before building a function that isn't needed.

## Sources

### Primary (HIGH confidence)
- Direct repo inspection: `package.json`/`Cargo.toml`, `src-tauri/src/commands/printer.rs`, `src/shared/lib/pos-printer.ts`, `src/shared/lib/receipt-format.ts`, `src/shared/lib/domain.ts`, `src/features/upload-logo/`, `supabase/migrations/*` (receipt_settings, suppliers/shipments, inventory, stock_movements), `supabase/functions/receive-shipment/index.ts`, `.planning/PROJECT.md`, `CLAUDE.md`
- crates.io: image — v0.25.10, verified 2026-08-19
- npmjs.com: @dnd-kit/core — v6.3.1, verified 2026-08-19

### Secondary (MEDIUM confidence)
- Lightspeed Retail — receipt templates
- Microsoft Dynamics 365 Commerce — receipt formats
- Parzibyte — thermal printer receipt designer
- Odoo POS Receipt Builder — illustrates canvas-builder anti-pattern
- PosNation — PO management for grocers
- inFlow Inventory — PO software
- AMS Retail — low-stock alerts/reordering
- AMS Retail — vendor orders
- doss.com — PO workflow automation
- NRS+ — independent grocery POS wins
- KORONA POS — inventory control reports
- Descartes Finale — inventory shrinkage guide
- Descartes Finale — inventory costing methods
- BlueCart — inventory shrinkage
- WCPOS — thermal printer templates
- Bloomreach — reorder point formula
- US Tech Automations — auto-generate POs from reorder points
- floridapayments.com — common inventory mistakes

---
*Research completed: 2026-08-19*
*Ready for roadmap: yes*
