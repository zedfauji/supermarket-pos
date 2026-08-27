# Phase 16: Purchase Orders & Reordering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-23
**Phase:** 16-Purchase Orders & Reordering
**Areas discussed:** PO access control, Creation path, Line-item cost default, Draft reorder quantities

---

## PO access control

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse manage_products | Manager+admin already have it, cashier doesn't; zero new RBAC surface | ✓ |
| New manage_purchase_orders action | Dedicated toggle for future role flexibility; more RBAC surface for a distinction nothing in requirements asks for | |

**User's choice:** Reuse manage_products
**Notes:** —

| Option | Description | Selected |
|--------|-------------|----------|
| Manager+ only, fully | Matches existing Suppliers page — no cashier access at all, including view | ✓ |
| Cashier can view, not create/receive | Read-only view path for cashiers | |

**User's choice:** Manager+ only, fully

---

## Creation path

| Option | Description | Selected |
|--------|-------------|----------|
| Plain RLS-gated inserts/updates | No cross-table atomicity requirement at create time; RLS policy sufficient | ✓ |
| New RPC (like receive_shipment) | Mirrors existing atomic-write pattern; more surface for no functional gain | |
| You decide | — | |

**User's choice:** Plain RLS-gated inserts/updates

| Option | Description | Selected |
|--------|-------------|----------|
| receive_shipment sets PO status | Keeps stock update + PO status change atomic in one RPC call | ✓ |
| Separate client-side update after | Simpler to build but leaves a non-atomic window | |

**User's choice:** receive_shipment sets PO status

---

## Line-item cost default

| Option | Description | Selected |
|--------|-------------|----------|
| Last-received inventory.costPrice | Pre-fills from current weighted-average cost, no schema change | ✓ |
| Manual entry only (0 default) | Matches receive_shipment's form today; leaves PO-01's "default cost" wording unfulfilled | |
| You decide | — | |

**User's choice:** Last-received inventory.costPrice

| Option | Description | Selected |
|--------|-------------|----------|
| Default to 0, manager fills it in | Same fallback as receive_shipment's form today | ✓ |
| Block adding until a cost is entered | More friction, not enforced elsewhere in the codebase | |

**User's choice:** Default to 0, manager fills it in

---

## Draft reorder quantities

| Option | Description | Selected |
|--------|-------------|----------|
| Top-up to reorder point | qty = lowStockThreshold − quantityOnHand, floor 0; no pack-size dependency | (Claude's discretion) |
| Top-up to a multiple of reorder point | Arbitrary buffer multiplier | |
| You decide | — | ✓ |

**User's choice:** You decide — Claude's discretion default: top-up to reorder point (D-07 in CONTEXT.md)

| Option | Description | Selected |
|--------|-------------|----------|
| Round up to whole packages | When unitsPerPackage is set, round top-up qty to nearest multiple; falls back to raw units otherwise | ✓ |
| Always raw base units | Ignore unitsPerPackage; manager rounds manually | |

**User's choice:** Round up to whole packages

---

## Claude's Discretion

- Exact reorder-quantity formula (top-up to reorder point, D-07) and case-size rounding (D-08) — user deferred to "You decide"; concrete defaults now locked in CONTEXT.md rather than left open.
- PO status enum values beyond draft/received-closed — not raised as a gray area; planner picks the minimum states the requirements name.
- UI page placement (new route vs. Suppliers page tab) — deferred to `/gsd-ui-phase 16` per ROADMAP.md's `UI hint: yes`.

## Deferred Ideas

None — discussion stayed within the four selected areas, no scope-creep redirects needed.
