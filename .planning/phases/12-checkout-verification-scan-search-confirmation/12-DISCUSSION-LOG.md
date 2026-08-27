# Phase 12: Checkout Verification (Scan & Search Confirmation) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-24
**Phase:** 12-checkout-verification-scan-search-confirmation
**Areas discussed:** Ambiguous-match scope reality-check, VER-02 manual-search interpretation, Confirmation UI mechanics, Zero-price definition & recovery

---

## Ambiguous-match scope reality-check

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, zero-price only | Narrow VER-01 to trigger confirmation only when an active product has basePrice === 0 | |
| Something else is ambiguous too | User wanted another case covered | ✓ |

**User's choice:** Something else is ambiguous too → follow-up asked which case; user picked **low-stock/negative-stock item**.

**Follow-up: threshold for the low-stock trigger**

| Option | Description | Selected |
|--------|-------------|----------|
| Out of stock only (qty ≤ 0) | Matches existing INVENTORY_NEGATIVE gate, surfaced earlier | |
| At/below reorder point (qty ≤ lowStockThreshold) | Same rule InventoryPagePanel already uses for low-stock badge | ✓ |

**Notes:** Barcode DB-uniqueness and existing inactive-product filtering/disabling mean "multiple products per barcode" and "inactive product" are already dead/handled — narrowed VER-01's real scope to {zero-price, low/negative-stock}. This extends beyond REQUIREMENTS.md's literal VER-01 wording (D-02 in CONTEXT.md notes this for traceability).

---

## VER-02 manual-search interpretation

| Option | Description | Selected |
|--------|-------------|----------|
| Add barcode to card, still one click | Show barcode on ProductCard tile; no new confirm dialog; happy path unchanged | ✓ |
| New confirm-before-add step for every search selection | Extra click for every manual-search add, even clean matches | |

**User's choice:** Add barcode to card, still one click.
**Notes:** Confirmation toast still fires for flagged products (zero-price/low-stock) regardless of scan-vs-search entry point — this decision only concerns the *unflagged* happy path.

---

## Confirmation UI mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Toast with Confirm/Cancel actions | sonner toast, same library as existing "not found" toast; waits indefinitely | ✓ |
| Inline dialog/sheet | More visible but blocks interaction — closer to a real "blocking" confirm | |

**User's choice:** Toast with Confirm/Cancel actions.
**Notes:** No auto-timeout add or reject — waits for explicit cashier action.

---

## Zero-price definition & recovery

| Option | Description | Selected |
|--------|-------------|----------|
| basePrice === 0; confirm adds at $0 | Simple equality check; confirming adds at current $0 price, no redirect | ✓ |
| basePrice === 0; confirm requires a price override | Confirming opens a price-entry step before adding | |

**User's choice:** basePrice === 0; confirm adds at $0.
**Notes:** Fixing the price stays a separate manager/admin task, out of this phase's scope.

---

## Claude's Discretion

- Exact toast/UI copy and icon choice for the two flag reasons, following existing i18n namespace conventions.
- Behavior when a new scan/select happens while a confirmation toast is still pending (dismiss/stack/other) — not specified, left to planner/executor judgment.
- Whether the low-stock check re-reads live `quantityOnHand` or uses the existing cache path — follow existing lookup precedent.
- Exact query/join changes needed to get `quantityOnHand` into the barcode-lookup and product-grid data shapes (not currently joined).

## Deferred Ideas

- Recently-price-changed-item confirmation (raised as an alternative "other ambiguous case", not selected).
- Loose-weight-item-scanned-via-barcode confirmation (raised as an alternative "other ambiguous case", not selected).
- Price-override-on-confirm for zero-price items (considered, rejected in favor of "confirm adds at $0").
