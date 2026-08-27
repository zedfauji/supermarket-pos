# Phase 12: Checkout Verification (Scan & Search Confirmation) - Research

**Researched:** 2026-08-24
**Domain:** React 19 + Zustand + TanStack Query POS checkout UI; sonner toast confirmation pattern; Supabase PostgREST embed
**Confidence:** HIGH — this phase is entirely code-in-repo verification; no new libraries, no backend migration, every claim below is grounded in files read this session.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ambiguous-match scope (VER-01 narrowed to what's actually possible)**
- **D-01:** `products.barcode` has a DB-unique index (`products_barcode_unique`) — "multiple products for one barcode" cannot occur in this schema. `useLookupProductByBarcode` already filters `is_active = true` (an inactive barcode's lookup returns `null` → existing "product not found" toast, not a new confirmation path) and `ProductCard` already disables inactive tiles (`unavailable` prop, can't be clicked). **VER-01's actual new-work scope is two flag conditions, not three:** an active product with `basePrice === 0`, or an active product whose `quantityOnHand <= lowStockThreshold`. Do not build "multiple products per barcode" handling — it's dead code for an impossible case. — **Reversibility:** reversible — if the barcode-uniqueness constraint is ever relaxed, the ambiguous-match handling would need revisiting, but nothing here blocks that.
- **D-02 (scope addition beyond REQUIREMENTS.md's literal VER-01 wording):** Add a **low/negative-stock flag** as a second confirmation trigger, at parity with zero-price. Threshold: `quantityOnHand <= lowStockThreshold` (same "at or below reorder point" rule `InventoryPagePanel.tsx` already uses for its low-stock badge/count, e.g. lines ~27, ~46, ~152) — not "out of stock only" (`quantityOnHand <= 0`). This catches it earlier, before it hits zero. Planner/researcher should treat this as in-scope for Phase 12 alongside zero-price; note in REQUIREMENTS.md that VER-01's practical implementation covers {zero-price, low/negative-stock} rather than the original {multiple-barcode, inactive, zero-price} wording (D-01 already explains why the original two other conditions are moot).

**VER-02 manual-search interpretation**
- **D-03:** VER-02 ("cashier sees resolved product's name, price, and barcode before it's added") is satisfied by **adding a barcode line to the existing `ProductCard` tile** (`src/entities/product/ui/ProductCard.tsx`) — alongside the name and `MoneyDisplay` price it already renders. The tile-click flow stays exactly one action; no new confirm-before-add dialog for clean/unflagged manual-search selections. This only applies when a product IS flagged (D-01/D-02) — for those, the same confirmation toast (D-05) fires regardless of whether the product was reached via scan or via search-tile click. — **Reversibility:** reversible.

**Confirmation UI mechanics**
- **D-04:** The confirmation for a flagged product (zero-price or low/negative-stock) is a **`sonner` toast with inline Confirm/Cancel action buttons** — same toast library already used for `scanBarcodeToCart.productNotFound` in `useScanBarcodeToCart.ts`. Shows the product name and the specific flag reason (e.g. "Price is $0" / "Only N left in stock"). The toast **waits indefinitely** — no auto-timeout add or auto-reject; the cashier must explicitly Confirm or Cancel (or navigate away, per Claude's discretion below). — **Reversibility:** reversible.
- **D-05:** This same toast-confirm mechanism fires identically whether the flagged product was reached via barcode scan (`useScanBarcodeToCart`) or manual-search tile click (`ProductGrid`/`ProductCard`) — one shared confirmation path, not two separate implementations.

**Zero-price definition & recovery**
- **D-06:** "Zero-price" is exactly `product.basePrice === 0` on an active (`isActive === true`) product. Confirming the toast adds the item to the cart **at its current $0 price** — no price-override step, no redirect to Inventory/product-edit. Fixing the actual price remains a separate manager/admin task outside this phase's scope. — **Reversibility:** reversible.

### Claude's Discretion
- Exact toast/UI copy and icon choice for the two flag reasons (zero-price vs. low-stock), following existing i18n namespace conventions (`featOrders` for `scanBarcodeToCart.*`, `wPanels` for `ProductGrid`/checkout-panel copy).
- What happens if the cashier scans/selects a different item (or navigates away) while a confirmation toast is still pending — dismiss it silently, stack it, or some other reasonable default. Not specified by the user; use judgment consistent with `sonner`'s existing toast-stacking behavior in this app.
- Whether the low-stock check re-reads live `quantityOnHand` at scan/select time or relies on the same cached `useProducts()`/`useLookupProductByBarcode` cache path already used for price/active-status — follow whatever the existing lookup already does for consistency (per D-01, `useLookupProductByBarcode` already has a cache-then-DB-fallback pattern; extend it rather than adding a second stock-fetch path).
- Where exactly the "quantityOnHand" value is joined into the barcode-lookup query (`useLookupProductByBarcode`'s current `.select()` doesn't join `inventory` at all) and into `ProductGrid`'s `useProducts()` result if it doesn't already carry inventory data — planner/researcher should confirm current shape and add the join if missing.

### Deferred Ideas (OUT OF SCOPE)
- **Recently-price-changed-item confirmation** and **loose-weight-item-scanned-via-barcode confirmation** — raised as alternative "other ambiguous case" options during discussion but not selected; the user picked low/negative-stock instead. Not in scope for Phase 12; could be a future phase/requirement if stale-price-sticker or mis-scan incidents actually occur in practice.
- **Price-override-on-confirm for zero-price items** — considered and explicitly rejected in favor of the simpler "confirm adds at $0" (D-06); note if a future incident report shows cashiers accidentally completing $0 sales, this could be revisited.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-01 | A barcode scan or manual-search product lookup that resolves ambiguously (multiple products for one barcode, or a product flagged inactive/zero-price) surfaces a non-blocking confirmation before the item is added to the cart. A clean, unambiguous match is added to the cart in a single action — no confirmation step is added to the happy path. | D-01 narrows this to two real conditions (zero-price, low-stock); Architecture Patterns/Code Examples give the exact `getProductRiskFlag` predicate and the `inventory` join needed to evaluate it; Pitfall 1 prevents wiring the wrong threshold field; Pitfall 2 covers the no-inventory-row edge case |
| VER-02 | When adding an item from manual search results, the cashier sees the resolved product's name, price, and barcode before it's added to the cart, so a wrong-row click is caught before commit. | D-03 satisfied via a `ProductCard` barcode line (existing name/`MoneyDisplay` price fields already render); Recommended Project Structure lists the exact file edit; Validation Architecture maps this to a new Playwright assertion on the rendered barcode text |

</phase_requirements>

## Summary

Phase 12 adds exactly one new mechanism — a `sonner` toast with Confirm/Cancel buttons, `duration: Infinity` — that gates the add-to-cart moment for two conditions on an already-resolved, active product: `basePrice === 0` (zero-price) and `quantityOnHand <= lowStockThreshold` (low-stock, reusing `InventoryPagePanel.tsx`'s exact predicate). Everything else CONTEXT.md's D-01 ruled out (multiple-barcode-match, inactive-product path) is provably impossible or already handled: `products.barcode` carries a DB-unique partial index (`products_barcode_unique`), and `useLookupProductByBarcode` already filters `is_active = true`, folding an inactive scan into the existing "product not found" toast.

The one genuinely new piece of plumbing is data, not UI: neither `useProducts()` (feeds `ProductGrid`) nor `useLookupProductByBarcode()` (feeds barcode scan) currently joins the `inventory` table, so `Product` objects arriving at either add-to-cart site carry no `quantityOnHand`/`lowStockThreshold` at all today. `inventory.product_id` is a `isOneToOne: true` foreign key (confirmed in `supabase.types.ts`), so both queries can add a single-object PostgREST embed (`inventory(quantity_on_hand, low_stock_threshold)`) without becoming an array-valued join. The recommended shape mirrors the codebase's own precedent: `ProductSchema.category` is already `.optional()` for exactly this reason (a joined field that isn't always populated) — `quantityOnHand`/`lowStockThreshold` should be added to `ProductSchema` the same way, not as a parallel ad hoc type.

The other material finding is an FSD boundary constraint the planner must respect: `features` may import `entities`/`shared` but **not other features** (`eslint-plugin-boundaries`, `boundaries/dependencies` config, verified in `eslint.config.js`). D-05 asks for "one shared hook/util both paths call into" where the two paths are `useScanBarcodeToCart` (a feature) and `ProductGrid`/`CheckoutPanel` (a widget path that currently calls `addItem` directly, no feature in between). A new `features/confirm-*` folder would be importable from the widget but **not** from `useScanBarcodeToCart` — the shared logic must live in `entities/product/model/` (or `shared/lib/`), which both a feature and a widget are permitted to import.

**Primary recommendation:** Add `quantityOnHand`/`lowStockThreshold` as optional fields on `ProductSchema` (mirroring the existing `category` optional-join pattern), extend the `.select()` in both `useProducts()` and `useLookupProductByBarcode()` with `inventory(quantity_on_hand, low_stock_threshold)`, write one pure predicate (`entities/product/model/productRiskFlag.ts`) plus one shared confirm-toast hook in the `entities` layer, and call that hook from both `useScanBarcodeToCart.handleScan` (feature) and `CheckoutPanel`'s `ProductGrid onSelect` callback (widget) — never from a new sibling feature.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Barcode/search → product resolution | Frontend (entities/product, features/lookup-product-by-barcode) | Database (Supabase PostgREST embed) | Resolution already happens client-side against a TanStack Query cache with a Supabase fallback; no new backend logic needed, only a wider `.select()` |
| Risk-flag predicate (zero-price / low-stock) | Frontend (entities/product) | — | Pure function over already-fetched `Product` fields; no server round-trip, no RPC |
| Confirm/Cancel UI | Frontend (shared `sonner` Toaster, already mounted in `app/App.tsx`) | — | `Toaster` is a single app-level singleton; toasts are imperative calls, not new mounted components |
| Cart mutation on confirm | Frontend (entities/tab `cartStore.addItem`/`addWeightedItem`) | — | Unchanged — confirm/cancel only gates *when* the existing `addItem` call fires, not how |
| Manual-search product display fields (name/price/barcode) | Frontend (entities/product `ProductCard`) | — | Static rendering, no new data fetch beyond the same query already used for the grid |

## Standard Stack

### Core
No new libraries. This phase is 100% composition of already-installed dependencies:

| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sonner` | `^2.0.7` [VERIFIED: package.json:79] | Confirm/Cancel toast | Already the app's sole toast library (`app/App.tsx` mounts `<Toaster richColors position="top-right" />`); `useScanBarcodeToCart.ts` already calls `toast.error(...)` from it |
| `@tanstack/react-query` | project standard (CLAUDE.md) | Product/inventory data fetch + cache | `useProducts()`/`useLookupProductByBarcode()` already built on it; extending the `.select()` is the only change |
| `zod` v4 | project standard | `ProductSchema` extension | `domain.ts` is the enforced single source of truth for `Product`/`Inventory` types |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sonner` toast with `action`/`cancel` | A blocking `<Dialog>` (shadcn) | Rejected by CONTEXT.md D-04 explicitly ("non-blocking"); the codebase's `Dialog` components (`ConfirmDialog`, `WeightEntryDialog`) all trap focus and block interaction — wrong affordance here |
| Extending `ProductSchema` with `quantityOnHand`/`lowStockThreshold` | A separate `ProductWithStock` wrapper type/interface | `ProductSchema` already carries other optionally-joined fields (`category: CategorySchema.optional()`) for the exact same reason; a parallel type doubles the shape and risks the two drifting |

**Installation:** None — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages. `sonner` is pre-existing (`package.json:79`, confirmed installed at `node_modules/sonner`).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────┐        ┌──────────────────────────┐
│ USB HID scanner │        │ ProductGrid search input │
│ (keydown burst) │        │ (typed query, click tile)│
└────────┬─────────┘        └────────────┬─────────────┘
         │                                │
         ▼                                ▼
useBarcodeScanner            ProductCard.onSelect (widget)
         │                                │
         ▼                                ▼
useScanBarcodeToCart.handleScan   CheckoutPanel's onSelect prop
         │  (feature)                     │  (widget, currently: addItem directly)
         ▼                                ▼
useLookupProductByBarcode.lookup   useProducts() cached list
  (adds inventory join — NEW)       (adds inventory join — NEW)
         │                                │
         └───────────┬────────────────────┘
                      ▼
      entities/product: getProductRiskFlag(product)   <-- NEW pure predicate
        'zero-price' | 'low-stock' | null
                      │
        ┌─────────────┴─────────────┐
        │ null (clean match)        │ flagged
        ▼                           ▼
  addItem() directly      entities/product: useConfirmRiskyAdd()  <-- NEW shared hook
  (unweighted) or                  │  sonner toast, duration: Infinity,
  weightEntry.openFor()            │  Confirm -> addItem() / weightEntry.openFor()
  (unweighted vs weighted           │  Cancel  -> no-op, toast dismisses
   unchanged either path)          ▼
                          cartStore.addItem / addWeightedItem (unchanged)
```

### Recommended Project Structure
No new top-level folders. Changes land in existing files/dirs:
```
src/
├── entities/product/model/
│   ├── productRiskFlag.ts        # NEW — pure predicate, zero React
│   ├── useConfirmRiskyAdd.ts     # NEW — shared toast-confirm hook (entities layer, importable by features AND widgets)
│   ├── queries.ts                # EDIT — useProducts() .select() gains inventory(...) embed
│   └── types.ts                  # EDIT — ProductSchema gains optional quantityOnHand/lowStockThreshold
├── entities/product/ui/
│   └── ProductCard.tsx           # EDIT — render barcode line (VER-02)
├── features/lookup-product-by-barcode/model/
│   └── useLookupProductByBarcode.ts   # EDIT — .select() gains inventory(...) embed
├── features/scan-barcode-to-cart/model/
│   └── useScanBarcodeToCart.ts   # EDIT — call useConfirmRiskyAdd() before addItem/onWeightedProduct
└── widgets/CheckoutPanel/ui/
    └── CheckoutPanel.tsx         # EDIT — ProductGrid onSelect calls useConfirmRiskyAdd() before addItem
```

### Pattern 1: Single-object PostgREST embed for a 1:1 FK
**What:** `inventory.product_id` has `isOneToOne: true` in the generated Supabase relationship metadata [VERIFIED: src/shared/lib/supabase.types.ts:37-40 — `foreignKeyName: "inventory_product_id_fkey"`, `columns: ["product_id"]`, `isOneToOne: true`, `referencedRelation: "products"`]. Embedding `inventory(...)` from the `products` side of that relationship returns a single object (or `null`), not an array.
**When to use:** Any time `Product` needs its inventory row alongside it in a single round trip, as here.
**Example:**
```typescript
// src/entities/product/model/queries.ts — useProducts(), current .select() (queries.ts:142-150)
supabase
  .from('products')
  .select(`
    *,
    category:categories(*),
    product_modifiers(modifier:modifiers(*)),
    inventory(quantity_on_hand, low_stock_threshold)
  `)
  .eq('is_active', true)
  .order('name')

// mapProductRow (queries.ts:39) — add after existing fields:
quantityOnHand: (row as { inventory?: { quantity_on_hand: number } | null }).inventory?.quantity_on_hand ?? undefined,
lowStockThreshold: (row as { inventory?: { low_stock_threshold: number } | null }).inventory?.low_stock_threshold ?? undefined,
```
Apply the identical `.select()` addition to `useLookupProductByBarcode.ts`'s query (lines 29-48).

### Pattern 2: `sonner` action+cancel toast that waits indefinitely
**What:** `toast()` accepts `action`/`cancel` (each `{ label, onClick, actionButtonStyle? }`) and `duration` [VERIFIED: node_modules/sonner/dist/index.d.ts:43-47,60-64 — `interface Action { label: React.ReactNode; onClick: (event) => void; actionButtonStyle?: React.CSSProperties }`, and `ExternalToast` carries `duration?: number; action?: Action | React.ReactNode; cancel?: Action | React.ReactNode; onDismiss?: (toast: ToastT) => void`]. `duration: Infinity` is honored by sonner's own auto-close timer [VERIFIED: node_modules/sonner/dist/index.js:589 — `if (toast.promise && toastType === 'loading' || toast.duration === Infinity || toast.type === 'loading') return;`], i.e. it explicitly skips the auto-dismiss path — this satisfies D-04's "waits indefinitely."
**When to use:** The zero-price/low-stock confirmation toast.
**No existing precedent in this codebase** — grepped every `toast(...)`/`action:` call site; `VersionConflictToast.tsx` and all other toast usages are plain `toast.error(...)`/`toast.success(...)` with no buttons. This is genuinely new toast usage, not an extension of an established local pattern — treat the sonner API itself (not local code) as the source of truth.
**Example:**
```typescript
// entities/product/model/useConfirmRiskyAdd.ts (new)
import { toast } from 'sonner';

function confirmRiskyAdd(reason: string, onConfirm: () => void) {
  toast(reason, {
    duration: Infinity,
    action: { label: t('confirm'), onClick: onConfirm },
    cancel: { label: t('cancel'), onClick: () => undefined },
  });
}
```

### Anti-Patterns to Avoid
- **Adding a new `features/` folder for the shared confirm logic:** violates `boundaries/dependencies` — `features` cannot import `features` [VERIFIED: eslint.config.js:109-140 — `{ from: ['features'], allow: ['entities', 'shared'] }`, no `features` in its own allow-list]. `useScanBarcodeToCart` (a feature) would be unable to import a sibling feature. Put the shared hook in `entities/product/model/` instead — both `features` and `widgets` may import `entities`.
- **Reusing `products.stock_threshold` for the low-stock flag:** this codebase has *two different* low-stock concepts that must not be conflated. `products.stock_threshold` feeds `useInventoryAlerts()` (`entities/inventory/model/queries.ts:154-206`, the Home-dashboard low-stock alert list). `inventory.low_stock_threshold` feeds `InventoryPagePanel`'s badge/sort/stat count, which is the field D-02 explicitly names. [VERIFIED: src/widgets/InventoryPagePanel.tsx:27,46,152 — `if (inv.quantityOnHand <= inv.lowStockThreshold) return 1;` / `return 'border-l-2 border-l-pos-warning bg-pos-warning/5';` / `else if (r.quantityOnHand <= r.lowStockThreshold) lowStock += 1;`] Use `inventory.low_stock_threshold`, not `products.stock_threshold`.
- **Making `quantityOnHand`/`lowStockThreshold` required fields on `ProductSchema`:** `ProductSchema.parse()` is called from many sites that don't have inventory data at hand (`ProductForm.tsx`, `mocks.ts`, `entities/tab/model/queries.ts`, `entities/open-unit/model/queries.ts`, `entities/purchase-order/model/queries.ts` — all currently construct `Product` objects without any inventory join). Required fields would break every one of those `.parse()` calls. Keep both `.optional()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast stacking / auto-dismiss timing | A custom pending-confirmation queue/state machine | `sonner`'s built-in stacking (each `toast()` call gets its own id; `duration: Infinity` already opts a toast out of auto-dismiss) | `sonner` already manages multiple concurrent toasts; CONTEXT.md's Claude's Discretion note explicitly defers to "whatever `sonner`'s existing toast-stacking behavior" does |
| Low-stock threshold math | A second reorder-point calculation | The exact `quantityOnHand <= lowStockThreshold` comparison already live in `InventoryPagePanel.tsx` | D-02 is explicit: copy this predicate verbatim, do not invent a new low-stock rule |
| Barcode-uniqueness enforcement | App-level dedupe/first-match-wins logic for "multiple products per barcode" | Nothing — `products_barcode_unique` (`create unique index ... where barcode is not null`) already makes this impossible at the DB level [VERIFIED: supabase/migrations/20260423000002_products_barcode.sql:5-7 — `create unique index if not exists products_barcode_unique on public.products (barcode) where barcode is not null;`] | D-01: building "multiple matches" handling is dead code for an unreachable case |

**Key insight:** Every "hand-roll" temptation in this phase (ambiguous-match resolution, stock-threshold math, toast lifecycle) already has an exact existing answer elsewhere in the codebase or the DB schema — the actual work is wiring, not invention.

## Common Pitfalls

### Pitfall 1: Confusing `products.stock_threshold` with `inventory.low_stock_threshold`
**What goes wrong:** A planner/executor greps for "threshold" and finds `products.stock_threshold` first (it's the field already present on every `Product` object today, no join needed) and wires the flag off that instead of `inventory.low_stock_threshold`.
**Why it happens:** Both exist, both are called "threshold," and `stock_threshold` requires zero new plumbing (`Product` already carries it) while `low_stock_threshold` requires the new `inventory` join — the wrong one is the path of least resistance.
**How to avoid:** D-02 names the exact file/lines to copy (`InventoryPagePanel.tsx` ~27/~46/~152); those all read from `inv.lowStockThreshold`, i.e. the `inventory` table's `low_stock_threshold` column, never `products.stock_threshold`.
**Warning signs:** A flag implementation that doesn't need the new `inventory` join at all is almost certainly using the wrong field.

### Pitfall 2: Products with no `inventory` row
**What goes wrong:** Not every `products` row necessarily has a matching `inventory` row (e.g. brand-new products created before their first stock adjustment, or certain open-unit parent/child product configurations). A single-object embed with no match returns `inventory: null`.
**Why it happens:** The `inventory` table is populated by receiving/adjustment flows, not guaranteed to exist for every product row at creation time.
**How to avoid:** Treat `quantityOnHand === undefined` (no inventory row) as "cannot determine low-stock status" → do not flag, fall through to the clean single-action add. Never treat missing inventory data as a false positive for low-stock.
**Warning signs:** A product with no inventory history triggering an unexpected confirmation toast on every scan.

### Pitfall 3: Loose-weight (`soldByWeight`) products don't go through a single `addItem` call
**What goes wrong:** The scan/select flow for a `soldByWeight` product does not call `addItem` at select-time — it calls `onWeightedProduct(product)`/`weightEntry.openFor(product)`, which opens `WeightEntryDialog`, and only that dialog's own submit handler eventually calls `cartStore.addWeightedItem` [VERIFIED: src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts:32-37 — `if (product.soldByWeight) { onWeightedProduct(product); ... return; }`; src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:36-37 — `const addWeightedItem = useCartStore(state => state.addWeightedItem);`]. If a zero-price or low-stock product happens to be `soldByWeight`, gating "before `addItem`" is ambiguous — does the confirm toast fire before the weight dialog even opens, or after weight entry, right before `addWeightedItem`?
**Why it happens:** CONTEXT.md's Integration Points section describes the flag-check as inserting "before `addItem`" for both paths but doesn't address the weighted branch, which bypasses `addItem` entirely at select-time.
**How to avoid:** This needs an explicit planning decision — see Open Questions below. Recommend gating identically to the unweighted case (confirm before opening `WeightEntryDialog` at all, i.e. right after `getProductRiskFlag`, mirroring the unweighted `addItem` gate), since the risk (selling at $0 or dangerously low stock) is about the product being added at all, not about how its quantity is entered.
**Warning signs:** A zero-price loose-weight product silently opening the weight dialog with no confirmation, then completing an unconfirmed $0 sale.

### Pitfall 4: `exactOptionalPropertyTypes` + new optional `ProductSchema` fields
**What goes wrong:** Every one of the ~6 existing `ProductSchema.parse({...})` call sites across the codebase (`mapProductRow`, `mapInventoryRow`, `entities/tab/model/queries.ts`, `entities/open-unit/model/queries.ts`, `entities/purchase-order/model/queries.ts`, `ProductForm.tsx`, `mocks.ts`) construct a full literal object today. Adding new fields to `ProductSchema` doesn't break Zod's `.parse()` at runtime (Zod optional fields tolerate a missing key), but any *TypeScript-typed* object literal assigned to `Product` (not passed through `.parse()`) with `exactOptionalPropertyTypes: true` would need the new keys either present-as-`undefined` or omitted entirely, never `key?: T` shorthand on a manually-authored interface.
**Why it happens:** This codebase already has this exact gotcha documented in CLAUDE.md for "mutation inputs" — `Product` itself is inferred from Zod (`type Product = z.infer<typeof ProductSchema>`), so this only bites hand-authored object literals typed as `Product` outside of `.parse()`, e.g. `mocks.ts`.
**How to avoid:** Add the new fields as `.optional()` on `ProductSchema` (no `.default()`), same as `comboEligible`/`comboPriceOverride`/`category`. Confirm `mocks.ts`/`ProductCard.stories.tsx`/etc. still typecheck — they can simply omit the two new keys since they're optional.
**Warning signs:** `npm run typecheck` failures pointing at object literals assigned to `Product` after the schema change.

## Code Examples

### Risk-flag predicate (entities layer, pure function)
```typescript
// src/entities/product/model/productRiskFlag.ts (new)
import type { Product } from '@shared/lib/domain';

export type ProductRiskFlag = 'zero-price' | 'low-stock' | null;

export function getProductRiskFlag(product: Product): ProductRiskFlag {
  if (product.basePrice === 0) return 'zero-price';
  if (
    product.quantityOnHand !== undefined &&
    product.lowStockThreshold !== undefined &&
    product.quantityOnHand <= product.lowStockThreshold
  ) {
    return 'low-stock';
  }
  return null;
}
```
Source: derived directly from D-01/D-02/D-06 (`.planning/phases/12-.../12-CONTEXT.md`) and the verified `InventoryPagePanel.tsx` predicate (`quantityOnHand <= lowStockThreshold`) — no external doc, this is project-specific business logic.

### `useScanBarcodeToCart` integration point
```typescript
// src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts — inside handleScan, after `if (product) {`
if (product) {
  const flag = getProductRiskFlag(product);
  const commit = () => {
    if (product.soldByWeight) { onWeightedProduct(product); return; }
    addItem(product, []);
  };
  if (flag) {
    confirmRiskyAdd(flag, product, commit); // shared hook from entities/product
    return;
  }
  commit();
  return;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A | N/A | N/A | This phase is not adopting a new external pattern — it's applying an existing sonner API surface that this codebase hasn't used yet. No deprecations apply. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Confirm/Cancel button copy, icon choice, and exact toast message wording | Code Examples / Common Pitfalls | Low — CONTEXT.md explicitly leaves this to Claude's Discretion; cosmetic only |
| A2 | Loose-weight (`soldByWeight`) flagged products should be gated **before** `WeightEntryDialog` opens (Pitfall 3's recommendation), not after weight entry | Common Pitfalls #3 | Medium — if the planner instead defers the confirm to post-weight-entry, the toast would need to move into `WeightEntryDialog`'s submit handler (a different feature) rather than the pre-select gate; changes where D-05's "shared hook" gets called from |
| A3 | A product with no `inventory` row (`quantityOnHand === undefined`) should never be flagged low-stock (fail open, not fail closed) | Common Pitfalls #2 | Low-Medium — the alternative (flag every un-inventoried product) would add friction to legitimately clean, un-inventoried products, contradicting the "fast checkout" core value CONTEXT.md protects |

**If this table is empty:** N/A — see above; all three are genuinely undecided by CONTEXT.md, not verifiable claims about the codebase.

## Open Questions (RESOLVED)

1. **Does the zero-price/low-stock confirm apply to `soldByWeight` products, and if so, where does it gate?** — RESOLVED
   - What we know: CONTEXT.md's D-01/D-02 define the flag conditions on "an active product" generically, with no `soldByWeight` carve-out. The scan/select flow for weighted products bypasses `addItem` at select-time entirely, routing instead through `WeightEntryDialog`'s own submit handler.
   - What's unclear: Whether "surfaces a non-blocking confirmation before the item is added to the cart" (VER-01's wording) means before the *weight dialog opens* or before the dialog's *own submit* fires `addWeightedItem`.
   - RESOLVED: Gate before the weight dialog opens (Pitfall 3), for consistency with the unweighted path and because the risk signal (zero-price / low-stock) is about the product being selected at all, independent of how much weight gets entered afterward. Reflected in Plan 12-01's task wiring.

2. **Should the low-stock check use live data or the 5-minute-stale TanStack Query cache?** — RESOLVED
   - What we know: `useProducts()`/`useLookupProductByBarcode()`'s cache-hit path (`findCached`) can return a `Product` that's up to `staleTime: 5 * 60 * 1000` (5 min) old. CONTEXT.md's Claude's Discretion note says to follow whatever the existing lookup pattern already does for consistency.
   - What's unclear: Whether a 5-minute-stale `quantityOnHand` is acceptable for a "heads-up" (informational, non-blocking, D-04) confirmation, or whether it needs a live re-read.
   - RESOLVED: Use the existing cache-then-DB-fallback as-is (CONTEXT.md's explicit guidance) — this is a non-blocking informational nudge, not a stock-enforcement gate (that stays in `deplete_for_order_item` at payment time per the Phase Boundary section), so staleness tolerance matching the rest of the POS UI is appropriate. No code change needed beyond the `.select()` extension.

## Environment Availability

Skipped — this phase has no external tool/service/runtime dependencies beyond the existing dev toolchain (Node, Vite, Vitest, Playwright) already verified working in every prior phase of this project.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59 (E2E) + Vitest 4 (unit) — both already configured |
| Config file | `supermarket-pos/playwright.config.ts` (E2E), `supermarket-pos/vitest.config.ts` (unit, not read this session but referenced in CLAUDE.md) |
| Quick run command | `npx playwright test e2e/51-barcode-scan-search.spec.ts` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VER-01 (clean match) | Scanning/selecting an active, priced, adequately-stocked product adds it in one action with no confirmation UI | E2E | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | Existing spec passes today for this case (`scan adds a catalog product to the cart` test already asserts no extra UI); extend, don't replace |
| VER-01 (zero-price) | Scanning a `basePrice = 0` active product surfaces the confirm toast; item absent from cart until confirmed | E2E | new test in `e2e/51-barcode-scan-search.spec.ts` | ❌ Wave 0 — write new test using the existing `scanBarcode()` helper + `admin.from('products').update({ base_price: 0 })` pattern already used in the file for barcode/is_active mutation |
| VER-01 (low-stock) | Scanning a product where `quantity_on_hand <= low_stock_threshold` surfaces the confirm toast | E2E | new test in `e2e/51-barcode-scan-search.spec.ts` | ❌ Wave 0 — same pattern, `admin.from('inventory').update({ quantity_on_hand, low_stock_threshold })` |
| VER-01 (confirm/cancel outcomes) | Confirming adds the item; cancelling/dismissing leaves the cart unchanged | E2E | new test(s), both branches | ❌ Wave 0 |
| VER-02 | Manual-search tile shows name, price, and barcode before commit | E2E | new/extended test in `e2e/51-barcode-scan-search.spec.ts` (the file already has a manual-search test: `category tabs compose with search`) | ❌ Wave 0 — assert `ProductCard`'s new barcode line renders |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/51-barcode-scan-search.spec.ts`
- **Per wave merge:** `npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/51-barcode-scan-search.spec.ts` — needs new test cases for zero-price confirm, low-stock confirm, confirm/cancel outcomes (both scan and manual-search entry points), and the barcode-line-in-ProductCard assertion
- [ ] Test data pattern for triggering the flags: mutate `base_price` / `inventory.quantity_on_hand`+`low_stock_threshold` via `getServiceClient()` (same `admin.from(...).update(...)` pattern the file already uses for `barcode`/`is_active`/`sold_by_weight`), with a `finally` block restoring the original value — this file's existing tests already follow this exact seed/restore convention
- [ ] Vitest unit test for `getProductRiskFlag()` — pure function, ideal for a fast unit test co-located as `productRiskFlag.test.ts` (per CLAUDE.md's co-location convention) rather than relying solely on E2E

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase does not touch auth; runs inside the already-authenticated checkout screen |
| V3 Session Management | No | No session changes |
| V4 Access Control | No | No new RBAC action; any authenticated cashier can already add any active product to the cart today, this phase only adds a confirmation step, not a new permission boundary |
| V5 Input Validation | Yes | `ProductSchema`'s existing Zod validation (`MoneySchema`, `z.number().int().nonnegative()`) already governs `basePrice`/`quantityOnHand`/`lowStockThreshold` — new optional fields inherit the same validation, no new hand-rolled parsing |
| V6 Cryptography | No | No secrets/crypto surface touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cashier bypasses confirm via rapid re-scan while toast is pending | Tampering/Repudiation (minor — informational-only gate, not a stock-enforcement gate) | CONTEXT.md's Claude's Discretion note already accepts "dismiss it silently, stack it, or some other reasonable default" — this is a UX nuisance risk, not a security control, since the real stock-negative gate lives server-side in `deplete_for_order_item`'s `p_allow_negative` check (out of scope for this phase, confirmed untouched) |
| Confirming a $0 sale repeatedly (accidental free-item abuse) | Repudiation | Out of scope per D-06 and the Deferred Ideas section — `audit_logs`/`inventory_log` already capture the eventual sale; a price-override or rate-limit on $0 confirms is explicitly deferred |

## Sources

### Primary (HIGH confidence — read this session)
- `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts` — full scan→lookup→add flow, `enabledRef` staleness-guard pattern
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` — cache-then-DB lookup, `is_active` filter, no inventory join
- `src/entities/product/ui/ProductCard.tsx` — tile UI, `unavailable` pattern
- `src/widgets/ProductGrid/ui/ProductGrid.tsx` — search/filter/tile-click flow
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` — composition root, `onSelect={product => addItem(product, [])}` insertion point
- `src/widgets/InventoryPagePanel.tsx` (lines 25-51, 145-155) — canonical `quantityOnHand <= lowStockThreshold` predicate, verbatim quoted above
- `src/shared/lib/domain.ts` (lines 227-276, 505-530) — `ProductSchema`, `InventorySchema`
- `src/entities/product/model/queries.ts` — `useProducts()`, `mapProductRow`, existing `.select()` shape (no inventory join)
- `src/entities/inventory/model/queries.ts` — `useInventory()`, `useInventoryAlerts()` (the *other*, unrelated `products.stock_threshold` low-stock system)
- `src/shared/lib/supabase.types.ts` (lines 37-40, 891-931) — `inventory_product_id_fkey` `isOneToOne: true`, `products.stock_threshold` column
- `supabase/migrations/20260423000002_products_barcode.sql` — `products_barcode_unique` partial unique index
- `node_modules/sonner/dist/index.d.ts` (lines 43-64) — `Action`/`ExternalToast` type shapes
- `node_modules/sonner/dist/index.js` (line 589) — `duration === Infinity` skip-auto-close behavior
- `eslint.config.js` (lines 70-140) — `boundaries/elements`/`boundaries/dependencies`, confirming `features` cannot import `features`
- `e2e/51-barcode-scan-search.spec.ts` — full existing E2E coverage and seed/restore test pattern to extend
- `src/shared/lib/i18n/locales/{en-US,es-MX}/{featOrders,wPanels,entities}.json` — existing key conventions for the touched namespaces
- `.planning/phases/12-checkout-verification-scan-search-confirmation/12-CONTEXT.md` — all D-01..D-06 decisions
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` — requirement text, project state, workflow flags

### Secondary / Tertiary
None used — this phase required no external documentation lookup; the entire domain is in-repo. `.planning/config.json` has every external search provider (`brave_search`, `exa_search`, `tavily_search`, `firecrawl`, `ref_search`, `perplexity`, `jina`) disabled, and no external library/API research was needed given the phase's scope.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all versions read from `package.json`/`node_modules` directly
- Architecture: HIGH — every file/line cited was opened and quoted this session, including the FSD boundary rule that changes the recommended file layout
- Pitfalls: HIGH — all four pitfalls are grounded in specific line-cited code (dual threshold fields, weighted-item bypass, missing-inventory-row null case, exactOptionalPropertyTypes)

**Research date:** 2026-08-24
**Valid until:** No expiry driver — this is an internal-codebase-only research pass (no external library version to go stale); re-verify only if `domain.ts`/`eslint.config.js`/the queried files change before planning executes.
