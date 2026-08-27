# Supermarket POS — Pivot Design

**Date:** 2026-08-10
**Status:** Approved for planning
**Repo:** this repo (already a clone of bar-pos; diverges into its own product from here — bar-pos itself stays separately maintained elsewhere)

## Context

This repo started as a bar/pool-parlour POS (Tauri 2 + React 19 + Supabase, Feature-Sliced Design). It's being pivoted into a POS for a single supermarket that sells goods imported from India (packaged spices/masalas, atta/rice/dals, snacks, pickles/papads, ghee/oil, tea/coffee, frozen items, ready-to-eat, sweets — mostly barcoded packaged goods, a minority sold loose by weight).

Target deployment: **one store, 1-2 terminals.** No multi-location support needed.

## Goals

- Reuse the proven generic retail infrastructure already in this codebase (auth, RBAC, caja, payments, offline queue, printing, barcode scanning, AI vision pipeline) rather than rebuilding it.
- Strip out everything specific to bars/pool tables/kitchens.
- Make inventory management — including supplier receiving and expiry tracking — the core strength of the product, sized correctly for a single store (not enterprise inventory).
- Ship an Alpha usable for real sales in 4-6 weeks.

## Non-goals

- Multi-location/multi-warehouse support.
- FIFO/weighted-average costing engines, demand forecasting, automatic PO generation.
- Batch-level FEFO auto-allocation at sale time.
- Supplier performance analytics.
- Accounting-system integration.
- Recipe/combo/ingredient costing (that's a bar/kitchen concept — dropped unless the store later adds prepared food).

## Codebase Strategy

Single repo, evolved in place (not a parallel fork elsewhere — this repo *is* the supermarket POS going forward). GSD planning history from the bar-pos phase has been cleared (`.planning/` reset) so the roadmap reflects this product only.

## Feature Classification

### Reuse as-is
- Entities: `staff`, `rbac`, `caja`, `payment`, `product`, `category`, `inventory`, `audit-log`, `open-unit`, `settings`, `resource`
- Features: `process-payment`, `manage-products`, `manage-categories`, `adjust-inventory`, `adjust-stock-movement`, `physical-count`, `override-negative-stock`, `register-caja-entry`, `clock-in/out-staff`, `manager-pin-gate`, `export-report`, `print-precheque`, `lookup-product-by-barcode`
- Hardware/lib: `useBarcodeScanner.ts` (USB-HID keystroke-wedge scanner, already wired into POS), ESC/POS receipt printing
- AI pipeline: `agent-chat` feature (file drop → CSV/image/PDF → Anthropic vision extraction → confirm → bulk import) — this is the "AI inventory scan" capability; it already exists and needs extending, not building from scratch
- `UomSchema` (`g/kg/ml/L/unit/case_24`) for multi-unit goods
- Pages: Home, Inventory, Staff, RBAC, Reports, Settings, Audit, Login, Payments

### Reuse with modification
- `open-unit` entity: repurpose "case → loose pieces" pattern for grocery case-breakdown
- Reports widgets (Caja, Product Sales, Hourly, Payment Methods, Low Stock): keep logic, drop bar-specific report tabs

### Strip out entirely
- Entities: `tab`, `waitlist`, `kds`, `prep`, `rappi-order`, `promotion`, `ingredient`, `recipe`, `combo`, `modifier-inventory-rule`
- Features: all tab lifecycle (`open/close/transfer/reopen/edit-paid-tab`, `split-tab`), pool timers, KDS bump, waitlist actions, prep batches, combo/promotion/recipe management
- Pages/widgets: pool-tables, pool-table-status, kds, kds-bar, kitchen-prep, rappi, waitlist, and their report widgets
- `pos` page: rebuilt (see below), not reused as-is

### Net-new
- `pos` page rebuilt as a direct-sale checkout screen: scan → cart → pay (no "tab" concept)
- Supplier entity (name, contact, associated products)
- Purchase order / receiving flow (line items: product, qty, cost price, expiry → confirm → stock qty increases + cost price updates)
- Expiry tracking (one active expiry date per product, "near-expiry" flag)
- Extended AI vision extraction: from name+price only → full line items (qty, cost, supplier, expiry) feeding the PO/receiving flow

## Inventory Management — Full Feature List

This is the most important subsystem in the product. Scoped deliberately small — the full loop and nothing more:

**catalog → stock qty → receive (PO) → sell (barcode) → count/adjust → low-stock & near-expiry alerts**

| Feature | Status | Scope |
|---|---|---|
| Product catalog (name, category, barcode, SKU, cost price, sale price, UoM) | Reuse | — |
| Stock on-hand quantity | Reuse | — |
| Barcode lookup at checkout | Reuse | — |
| Low-stock threshold / reorder point | Reuse | — |
| Manual stock adjustment (damage/loss/correction, reason logged) | Reuse | — |
| Physical count / stocktake reconciliation | Reuse | — |
| Multi-unit sales (case → pieces, kg/g/ml/L) | Reuse | — |
| Stock movement audit trail | Reuse | — |
| Supplier record | Net-new | Name, contact, products supplied. No scorecards/analytics. |
| Purchase order / goods receiving | Net-new | Single flow: line items in → confirm → stock + cost updated. No approval workflow, no PO status machine. |
| Expiry tracking | Net-new | One expiry date per active batch per product; "near-expiry" flag (e.g. within 14 days). No batch-level FEFO auto-allocation. |
| Landed cost | Net-new (minimal) | Cost price entered on receiving is duty-inclusive if applicable; no separate customs/freight allocation engine. |
| AI invoice/sheet intake | Extend existing | Vision pipeline already extracts name+price from images/PDF/CSV; extend schema to qty/cost/supplier/expiry and feed the receiving flow. |

## Hardware

| Item | Recommendation |
|---|---|
| Barcode scanner | USB or wireless HID (keyboard-wedge) 1D/2D scanner, e.g. Zebra/Symbol LI2208 — works with existing `useBarcodeScanner.ts`, zero driver work |
| Receipt printer | 80mm thermal ESC/POS — already integrated via `print-precheque` |
| Cash drawer | RJ11-triggered off the receipt printer — standard, no extra integration |
| Counter scale | Out of scope for now; revisit only if loose-weight items prove significant in practice |

## Phase Roadmap

1. **Phase 0 — Strip & rebrand**: remove bar/pool/kitchen entities, features, pages; rebuild `pos` page as direct-sale checkout skeleton
2. **Phase 1 — Core checkout**: barcode scan → cart → payment, using existing `process-payment`/`useBarcodeScanner`
3. **Phase 2 — Inventory management**: full loop above — catalog, stock, supplier, manual PO/receiving, expiry, low-stock, physical count (manual entry, no AI yet)
4. **Phase 3 — AI invoice intake**: extend the existing vision pipeline to full line-item extraction feeding Phase 2's receiving flow
5. **Phase 4 — Reports & hardening**: trim reports to generic retail set, polish, real-world fixes from Alpha/Beta usage

## Timeline

- **Alpha (4-6 weeks)** — Phases 0-2: rebuilt checkout + barcode scanning + full inventory management (manual entry). Usable for real sales in-store.
- **Beta (+3-5 weeks)** — Phase 3: AI invoice intake goes live. Needs real supplier sheets from the store early to tune extraction accuracy — this is the main schedule risk.
- **v1.0** — Phase 4: hardening/polish based on real Alpha/Beta usage.

## Workflow

GSD (`/gsd-new-project` to initialize fresh planning docs scoped to this product) drives phase-by-phase execution: `gsd-discuss-phase` → `gsd-plan-phase` → `gsd-execute-phase` → `gsd-verify-work` per phase, with this repo's CLAUDE.md mandating automated Playwright E2E over manual UAT throughout. Superpowers skills apply within execution: `test-driven-development` per feature, `systematic-debugging` on failures, `code-review`/`finishing-a-development-branch` at phase boundaries.

## Risks / Open Questions

- AI extraction accuracy on real (messy, mixed-format) supplier sheets is unproven — Beta timeline depends on getting real samples early.
- Whether loose-weight (scale-based) items are common enough to need scale hardware — deferred decision, revisit after Alpha usage data.
