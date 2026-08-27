# Phase 12: Checkout Verification (Scan & Search Confirmation) - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a non-blocking confirmation step to the direct-sale checkout's add-to-cart path (barcode scan and manual product search), but only when the resolved product is flagged as risky to sell as-is (zero price, or at/below its low-stock threshold). A clean match — active, priced, adequately stocked — still adds to the cart in one action, scan or click, with no added friction. This phase does not touch payment-time stock enforcement (`deplete_for_order_item`'s `p_allow_negative`/`INVENTORY_NEGATIVE` gate) — that stays as-is; this is an earlier, informational heads-up at add-to-cart time.

</domain>

<decisions>
## Implementation Decisions

### Ambiguous-match scope (VER-01 narrowed to what's actually possible)
- **D-01:** `products.barcode` has a DB-unique index (`products_barcode_unique`) — "multiple products for one barcode" cannot occur in this schema. `useLookupProductByBarcode` already filters `is_active = true` (an inactive barcode's lookup returns `null` → existing "product not found" toast, not a new confirmation path) and `ProductCard` already disables inactive tiles (`unavailable` prop, can't be clicked). **VER-01's actual new-work scope is two flag conditions, not three:** an active product with `basePrice === 0`, or an active product whose `quantityOnHand <= lowStockThreshold`. Do not build "multiple products per barcode" handling — it's dead code for an impossible case. — **Reversibility:** reversible — if the barcode-uniqueness constraint is ever relaxed, the ambiguous-match handling would need revisiting, but nothing here blocks that.
- **D-02 (scope addition beyond REQUIREMENTS.md's literal VER-01 wording):** Add a **low/negative-stock flag** as a second confirmation trigger, at parity with zero-price. Threshold: `quantityOnHand <= lowStockThreshold` (same "at or below reorder point" rule `InventoryPagePanel.tsx` already uses for its low-stock badge/count, e.g. lines ~27, ~46, ~152) — not "out of stock only" (`quantityOnHand <= 0`). This catches it earlier, before it hits zero. Planner/researcher should treat this as in-scope for Phase 12 alongside zero-price; note in REQUIREMENTS.md that VER-01's practical implementation covers {zero-price, low/negative-stock} rather than the original {multiple-barcode, inactive, zero-price} wording (D-01 already explains why the original two other conditions are moot).

### VER-02 manual-search interpretation
- **D-03:** VER-02 ("cashier sees resolved product's name, price, and barcode before it's added") is satisfied by **adding a barcode line to the existing `ProductCard` tile** (`src/entities/product/ui/ProductCard.tsx`) — alongside the name and `MoneyDisplay` price it already renders. The tile-click flow stays exactly one action; no new confirm-before-add dialog for clean/unflagged manual-search selections. This only applies when a product IS flagged (D-01/D-02) — for those, the same confirmation toast (D-05) fires regardless of whether the product was reached via scan or via search-tile click. — **Reversibility:** reversible.

### Confirmation UI mechanics
- **D-04:** The confirmation for a flagged product (zero-price or low/negative-stock) is a **`sonner` toast with inline Confirm/Cancel action buttons** — same toast library already used for `scanBarcodeToCart.productNotFound` in `useScanBarcodeToCart.ts`. Shows the product name and the specific flag reason (e.g. "Price is $0" / "Only N left in stock"). The toast **waits indefinitely** — no auto-timeout add or auto-reject; the cashier must explicitly Confirm or Cancel (or navigate away, per Claude's discretion below). — **Reversibility:** reversible.
- **D-05:** This same toast-confirm mechanism fires identically whether the flagged product was reached via barcode scan (`useScanBarcodeToCart`) or manual-search tile click (`ProductGrid`/`ProductCard`) — one shared confirmation path, not two separate implementations.

### Zero-price definition & recovery
- **D-06:** "Zero-price" is exactly `product.basePrice === 0` on an active (`isActive === true`) product. Confirming the toast adds the item to the cart **at its current $0 price** — no price-override step, no redirect to Inventory/product-edit. Fixing the actual price remains a separate manager/admin task outside this phase's scope. — **Reversibility:** reversible.

### Claude's Discretion
- Exact toast/UI copy and icon choice for the two flag reasons (zero-price vs. low-stock), following existing i18n namespace conventions (`featOrders` for `scanBarcodeToCart.*`, `wPanels` for `ProductGrid`/checkout-panel copy).
- What happens if the cashier scans/selects a different item (or navigates away) while a confirmation toast is still pending — dismiss it silently, stack it, or some other reasonable default. Not specified by the user; use judgment consistent with `sonner`'s existing toast-stacking behavior in this app.
- Whether the low-stock check re-reads live `quantityOnHand` at scan/select time or relies on the same cached `useProducts()`/`useLookupProductByBarcode` cache path already used for price/active-status — follow whatever the existing lookup already does for consistency (per D-01, `useLookupProductByBarcode` already has a cache-then-DB-fallback pattern; extend it rather than adding a second stock-fetch path).
- Where exactly the "quantityOnHand" value is joined into the barcode-lookup query (`useLookupProductByBarcode`'s current `.select()` doesn't join `inventory` at all) and into `ProductGrid`'s `useProducts()` result if it doesn't already carry inventory data — planner/researcher should confirm current shape and add the join if missing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` (VER-01, VER-02 definitions, lines ~12-13) — note D-01/D-02 narrow and extend VER-01's practical scope; update REQUIREMENTS.md wording during planning if useful for traceability.
- `.planning/ROADMAP.md` §"Phase 12: Checkout Verification (Scan & Search Confirmation)" — success criteria; D-01 explains why criterion wording ("multiple products / inactive") maps to a reduced real-world case.
- `.planning/REQUIREMENTS.md` "Explicitly Out of Scope" table (line ~72) — "Confirmation dialog on every scanned item" is explicitly rejected; D-03/D-04's toast-only-when-flagged design must not regress into a per-item confirmation.

### Existing scan/search/cart code to extend
- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` — current scan → lookup → `addItem`/`onWeightedProduct` flow; confirmation logic (D-04/D-05) inserts here for the scan path.
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` — current lookup query (cache-then-DB, `is_active=true` filter, no inventory join today per Claude's Discretion note above).
- `src/entities/product/ui/ProductCard.tsx` — tile UI; add barcode display (D-03) here; `unavailable`/unclickable pattern for inactive products already the precedent for how a flagged-but-clickable state should look/behave (though flagged ≠ disabled — flagged products ARE clickable, just confirm-gated).
- `src/widgets/ProductGrid/ui/ProductGrid.tsx` — manual search + tile-click-to-add flow; confirmation logic (D-04/D-05) inserts here for the search path.
- `src/widgets/InventoryPagePanel.tsx` (lines ~27, ~46, ~152) — existing `quantityOnHand <= lowStockThreshold` low-stock definition to reuse verbatim (D-02).

### Payment-time stock gate (out of scope, do not touch)
- `supabase/migrations/20260810000007_deplete_for_order_item_v6.sql` and prior versions — `p_allow_negative`/`INVENTORY_NEGATIVE` gate at checkout/payment time; unrelated to this phase's earlier, informational add-to-cart heads-up. `src/features/override-negative-stock/` is the existing manager-override path for this — do not duplicate or replace it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sonner` toast (already imported as `toast` in `useScanBarcodeToCart.ts`) — reuse directly for the new Confirm/Cancel confirmation, following the existing `toast.error(...)` call pattern in the same file.
- `InventoryPagePanel.tsx`'s `quantityOnHand <= lowStockThreshold` comparison — copy this exact predicate rather than inventing a new low-stock rule.
- `MoneyDisplay` component (`src/shared/ui/MoneyDisplay.tsx`) — already used on `ProductCard` for price; no new money-formatting component needed for showing barcode/price in the confirmation toast.

### Established Patterns
- `useScanBarcodeToCart`'s `enabledRef` pattern (reading live ref value at async-resolution time, not a stale closure) is the precedent to follow if the confirmation flow needs to check "is this scan/lookup still the live one" once inventory data is joined in.
- `ProductCard`'s `unavailable` (disabled + badge) pattern is the precedent for rendering a distinct visual state — but flagged products need a NEW state (clickable, not disabled) rather than reusing `unavailable` as-is.

### Integration Points
- Barcode-scan path: `useBarcodeScanner` → `useScanBarcodeToCart.handleScan` → `useLookupProductByBarcode.lookup` → (new) flag check → `addItem` or confirmation toast → `addItem` on confirm.
- Manual-search path: `ProductGrid` → `ProductCard.onSelect` → (new) flag check → `onSelect`/`weightEntry.openFor` or confirmation toast → proceed on confirm.
- Both paths currently call into `useCartStore.addItem` (barcode path) or the parent's `onSelect` callback (search path, wired up by whatever widget composes `ProductGrid` into the checkout page) — the flag-check-and-confirm logic should be a single shared hook/util both paths call into, per D-05.

</code_context>

<specifics>
## Specific Ideas

- Confirmation is a `sonner` toast with Confirm/Cancel action buttons, waits indefinitely, shows product name + specific flag reason (D-04).
- Low-stock threshold is "at or below reorder point" (`quantityOnHand <= lowStockThreshold`), not "out of stock only" (D-02).
- Zero-price confirm just adds at $0 — no price-fix redirect (D-06).

</specifics>

<deferred>
## Deferred Ideas

- **Recently-price-changed-item confirmation** and **loose-weight-item-scanned-via-barcode confirmation** — raised as alternative "other ambiguous case" options during discussion but not selected; the user picked low/negative-stock instead. Not in scope for Phase 12; could be a future phase/requirement if stale-price-sticker or mis-scan incidents actually occur in practice.
- **Price-override-on-confirm for zero-price items** — considered and explicitly rejected in favor of the simpler "confirm adds at $0" (D-06); note if a future incident report shows cashiers accidentally completing $0 sales, this could be revisited.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 12-checkout-verification-scan-search-confirmation*
*Context gathered: 2026-08-24*
