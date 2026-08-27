# Phase 3: Supplier, Receiving & Expiry Tracking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-14
**Phase:** 3-Supplier, Receiving & Expiry Tracking
**Areas discussed:** Supplier-Product Relationship, Receiving New Products, Cost Price, Expiry Alerting, Receiving Atomicity

---

## Supplier ↔ Product Relationship

| Option | Description | Selected |
|--------|-------------|----------|
| No formal link | Free-text 'products supplied' field, no DB link | |
| Many-to-many join table | `supplier_products` table, enables reorder suggestions later | ✓ |
| Optional `preferred_supplier_id` on product | Single nullable FK, no join table | |

**User's choice:** Many-to-many join table
**Notes:** Follow-up asked where the assignment UI lives — user chose "Both, synced" (Supplier form multi-select products AND Product form multi-select suppliers, same underlying table).

---

## Receiving Flow — New Products

| Option | Description | Selected |
|--------|-------------|----------|
| Existing products only | Line items pick from catalog only, no inline creation | |
| Allow inline quick-add | Create minimal product without leaving receiving screen | ✓ |

**User's choice:** Allow inline quick-add
**Notes:** Follow-up on required fields — user chose "Name + category + barcode + sale price" (not the more minimal "name + category + barcode only, price deferred" option), so quick-added products are immediately sellable.

---

## Cost Price

| Option | Description | Selected |
|--------|-------------|----------|
| Store cost only, sale price untouched | New `cost_price` field, `basePrice` unchanged by receiving | ✓ |
| Prompt to update sale price too | Show margin, optionally update `basePrice` during receiving | |

**User's choice:** Store cost only, sale price untouched

---

## Near-Expiry Alert Placement (EXP-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Home dashboard tile/badge | Mirrors `LowStockBadge` pattern | ✓ |
| Inventory page | Near-expiry list/tab next to low-stock | ✓ |
| POS checkout screen | Surface when an expiring item is scanned | ✓ |

**User's choice:** All three (multi-select) — Home dashboard, Inventory page, and POS checkout screen all surface the near-expiry signal.

**Follow-up — Alert threshold:**

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed at 14 days | Matches REQUIREMENTS.md example literally, no Settings UI | |
| Configurable in Settings | Admin-settable window, default 14 days | ✓ |

**User's choice:** Configurable in Settings

---

## Receiving Atomicity

| Option | Description | Selected |
|--------|-------------|----------|
| Single atomic RPC | Mirrors `process_direct_sale_atomic`/`process_payment_atomic` from Phase 2 | ✓ |
| Per-line-item client-side loop | Simpler surface, risks partial-failure mid-shipment | |

**User's choice:** Single atomic RPC — matches SUP-02's "atomically in one step" wording and the codebase's established pattern.

---

## Claude's Discretion

- Exact `supplier_products` join table shape beyond the FK pair
- Supplier record's contact field granularity (phone/email/address breakdown)
- Exact placement of the near-expiry signal on the POS checkout screen (banner vs. cart-line badge)

## Deferred Ideas

None — discussion stayed entirely within Phase 3 scope. AI invoice intake, FIFO/FEFO batch-level tracking, multi-warehouse, and supplier scorecards remain out of scope per PROJECT.md and were not raised as new ideas during this discussion.
