# Phase 2: Core Direct-Sale Checkout - Research

**Researched:** 2026-08-12
**Domain:** Rebuild of a bar-tab POS checkout flow into a grocery direct-sale checkout, on a live Supabase (Postgres) + Tauri 2 + React 19 codebase that just had its bar/pool domain stripped (Phase 1).
**Confidence:** HIGH for reuse/gap findings (all read from source this session with file:line citations). MEDIUM for the recommended new-RPC architecture (a design, not yet built — no alternative implementation exists in this codebase to point to). LOW/flagged-ASSUMED only for two schema-design choices explicitly left to Claude's discretion in CONTEXT.md.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
**Hold/park a sale**
- D-01: Checkout supports a single hold slot — one in-progress cart can be set aside (e.g. a "Hold" button) while the cashier serves another customer, then resumed later.
- D-02: Starting a new sale while one is held is allowed — the register is not locked to the held cart. The held sale shows as a banner/badge to resume.
- D-03: No auto-expiry on a held sale — it stays parked until the cashier manually resumes or clears it.
- D-04: No stock reservation while a sale is held — stock only decrements at actual payment (via the atomic payment RPC), consistent with CHK-03. — Reversibility: costly — rationale: the inventory model has no `reserved_qty` concept; adding stock reservation later means a schema change plus rewiring the atomic payment RPC's stock-decrement logic, not a local UI tweak.
- D-05: Clearing/discarding a held sale does NOT require a manager PIN gate (unlike void-order) — nothing was ever committed (no payment, no stock movement), so it's equivalent to clearing an in-progress cart.

**Loose-weight item entry**
- D-06: Cashier adds a loose kg/g item via search/select (no barcode — there is no scale hardware, deferred per PROJECT.md), then manually types the weight on a numeric keypad. Line price = weight × per-unit price.
- D-07: Per-kg/loose price reuses the product catalog's existing sale price field, interpreted per UoM — consistent with the existing `UomSchema`/open-unit pricing pattern already in the codebase. No new pricing field. *(Research correction: no `UomSchema` exists — see Summary/Pitfall 2. D-07's intent — reuse `basePrice`, no new pricing field — still holds; only the "already in the codebase" premise is wrong.)*
- D-08: A loose item's weight can be edited after it's added to the cart, using the same edit UX already used for adjusting quantity on packaged items (`cartStore.updateQuantity`/`setLineQuantity` pattern).
- D-09: Case-to-piece breakdown ("open unit") is strictly an Inventory-side action (Phase 3 territory) done before the item reaches the register — checkout only ever sells already-broken-down, piece-level products. Checkout does not trigger case-opening.

**Unknown/unmatched barcode**
- D-10: A scan with no catalog match shows an error toast ("Product not found") and the cashier falls back to the existing manual product search (CHK-02) already in the cart. No inline quick-create-product shortcut from checkout.
- D-11: Failed/unmatched scans ARE logged to the audit trail — the user explicitly wants visibility into which barcodes keep failing so the catalog can be backfilled later. (Deviates from the initially recommended "no logging" option.)

**Receipt & payment finish flow**
- D-12: Receipt auto-prints always after a successful payment (matches CHK-04). The cashier additionally has explicit options to email or skip the receipt.
- D-13: WhatsApp receipt delivery is DEFERRED — see Deferred Ideas below. Phase 2 ships auto-print + email + skip only.
- D-14: The existing multi-tender split-payment UI (`PaymentForm`'s split-mode toggle, up to 4 methods, live remaining-balance display) carries over unchanged for this screen — maps directly to CHK-03. No new payment UI to design.
- D-15: After a completed sale: show a brief success confirmation (e.g. "Sale complete — $X.XX"), then clear to a fresh empty cart ready for the next scan.

### Claude's Discretion
- Exact schema/naming for how the kept `tabs`/`order_items` plumbing (D-08 from Phase 1) is adapted/renamed for direct-sale checkout, including how the "held sale" (D-01) is represented underneath (e.g. a tab left in a pending state vs. a new lightweight table) — this is implementation, not vision, and belongs to research/planning. *(Research recommendation: do NOT rename the DB schema; represent the held sale purely client-side in Zustand, not as a DB row — see Architecture Pattern 1 and Open Question 3.)*
- Exact UI layout/component structure for the numeric weight keypad (D-06) and the hold/resume banner (D-02).
- Where in the audit log schema/UI the failed-scan events (D-11) surface. *(Research recommendation: direct `record_audit` RPC call, `p_action: 'barcode.scan_failed'` — see Architecture Pattern 3.)*

### Deferred Ideas (OUT OF SCOPE)
- WhatsApp receipt delivery — the user wants to send receipts via WhatsApp in addition to print/email/skip. Not built in Phase 2: the only WhatsApp integration that existed in this codebase (Twilio/WhatsApp-style notifier) was tied to the waitlist feature and was fully removed in Phase 1 (`drop_waitlist` migration). Standing this back up is new third-party integration work (WhatsApp Business API/Twilio), not a small addition like the existing email-receipt path. Candidate for its own future phase/milestone, alongside the already-deferred v2 AI invoice intake work.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| CHK-01 | User can scan a barcode and have the matched product added to the cart | `useBarcodeScanner` + `useLookupProductByBarcode` reused as-is (Pitfall 4 fix required for reliability); `cartStore.addItem` reused as-is. |
| CHK-02 | User can manually search and add a product to the cart when a barcode is missing or damaged | Net-new `ProductGrid`/search widget needed (deleted with `/pos` in Phase 1) built on existing `entities/product` (`ProductCard`, `CategoryTabs`, `useProducts`/`useCategories`) — see Recommended Project Structure. |
| CHK-03 | User can complete a sale with cash, card, or split-tender payment, with cart total, payment, and stock decrement applied atomically | Central finding of this research — see Summary point 3 and Architecture Pattern 2 (new wrapping RPC or documented sequential-call tradeoff). `PaymentForm`, `process_payment_atomic`, `process_split_payment_atomic` reused as-is per D-14/D-08. |
| CHK-04 | User can print a receipt for a completed sale | `pos-printer.ts`'s `printReceipt()` reused as-is; already wired as the default post-payment behavior in `PaymentForm.tsx`, matching D-12. |
| CHK-05 | User can ring up multi-unit items at checkout (loose kg/g goods, case→piece breakdown) | Case→piece half is out of scope for checkout per D-09 (Inventory-side only, already-broken-down products sell normally). Loose kg/g half is net-new schema + UI work — see Pitfalls 2 and 3, and Open Question 1. |
</phase_requirements>

## Summary

This is not a greenfield checkout build. Every reusable piece CONTEXT.md pointed at is real and confirmed by reading it this session — `cartStore`, `useLookupProductByBarcode`, `useBarcodeScanner`, `PaymentForm`, `pos-printer.ts`, `EmailReceiptDialog`, `process_payment_atomic`/`process_split_payment_atomic`. Reuse those; do not rewrite them.

But three of CONTEXT.md's underlying premises do not match the live code, and the planner needs to know this before scoping tasks:

1. **There is no `UomSchema`.** CONTEXT.md's "Established Patterns" section describes a `g/kg/ml/L/unit/case_24` unit-of-measure schema as already existing. It does not exist anywhere in `src/shared/lib/domain.ts` or the DB. What exists is `products.unitsPerPackage`/`parentProductId` (Phase 27's "open-unit" case→piece system) and a free-text `inventory.unit` label — neither models loose kg/g weight. **CHK-05's loose-weight half is net-new schema work**, not schema reuse. The case→piece half (D-09) genuinely is out of scope for checkout, confirmed correct.
2. **`order_items.quantity` and `inventory.quantity_on_hand` are both Postgres `INT`** (`CHECK (quantity > 0)`, `CHECK (quantity_on_hand >= 0)`). Phase 2 resolves fractional kilograms by storing `order_items.weight_grams` as integer grams while keeping `quantity = 1` for weighted lines; `20260814000001_loose_weight_items.sql` establishes that a weighted product's integer inventory is also grams.
3. **The direct-sale transaction decrements stock at payment time because it creates its order item only inside that transaction.** `20260814000001_loose_weight_items.sql` defines `decrement_inventory_on_order_item()` so a weighted row subtracts `NEW.weight_grams` from `inventory.quantity_on_hand` and records that same integer delta in `stock_movements`; regular products still subtract `NEW.quantity`. This preserves D-04 when `process_direct_sale_atomic` creates the item and payment atomically.

**Primary recommendation:** Keep the cart 100% client-side (Zustand, as it already is — `cartStore` never touches the DB today) until the cashier presses Pay. At that point, insert `tabs`/`orders`/`order_items` for the *whole* cart in the same database transaction as the payment insert and tab-close — i.e., call `create_order_with_items` and `process_payment_atomic`/`process_split_payment_atomic` back-to-back inside one new wrapping RPC (or fold order/item creation into the payment RPCs directly). Because the inventory-decrement trigger fires inside whichever transaction does the `INSERT INTO order_items`, doing that insert in the same transaction as the payment satisfies CHK-03's atomicity for free, using the existing trigger unmodified. Do NOT persist "held" sales as an open tab with items already inserted — the trigger would fire and decrement stock before payment, violating D-04. Hold/resume must stay in-memory only (see Architecture Patterns).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Barcode scan capture | Browser/Client | — | USB-HID keystroke-wedge scanner acts as a keyboard; `useBarcodeScanner` listens for keystroke bursts client-side. |
| Product lookup by barcode/search | Browser/Client (cache) + API/Backend (DB query) | — | `useLookupProductByBarcode` reads TanStack cache first, falls back to a direct Supabase `select` — no RPC. |
| Cart state (build/hold/edit) | Browser/Client | — | `cartStore` is explicitly "Client-only — never persisted" (`src/entities/tab/model/cartStore.ts:52`). Recommendation: keep it that way through Phase 2, including the held-sale slot. |
| Sale commit (tab+order+items+payment+stock) | Database/Storage (Postgres RPC, `SECURITY DEFINER`) | API/Backend (Edge Function auth wrapper) | Atomicity can only be guaranteed inside one Postgres transaction; the existing pattern already puts all financial writes in `SECURITY DEFINER` PL/pgSQL functions called via Supabase Edge Functions, never raw client `INSERT`s. |
| Stock decrement | Database/Storage (trigger) | — | `trigger_decrement_inventory_on_order_item` (AFTER INSERT on `order_items`) — reuse this trigger; do not duplicate its logic client-side or in a second RPC. |
| Receipt print | Browser/Client (Tauri IPC) | — | `pos-printer.ts` calls `invoke('print_receipt', …)` in Tauri, falls back to a `window.print()` popup outside Tauri. No server involvement. |
| Receipt email | API/Backend (Edge Function) | — | `sendReceiptByEmail` → existing `send-receipt-email` edge function (unchanged, not investigated further — D-12 only asks for the existing email option, not a rebuild). |
| Failed-scan audit logging | Database/Storage (`record_audit` RPC, directly callable) | Browser/Client (call site) | `record_audit` is `GRANT EXECUTE ... TO authenticated` — client code calls it directly via `supabase.rpc('record_audit', …)`, no wrapping feature-specific RPC needed (precedent: `src/app/OfflineQueueProcessor.tsx:33-41`). |

## Standard Stack

No new external packages are required for this phase. Every capability CHK-01..CHK-05 needs is covered by already-installed dependencies (React 19.1.0, TypeScript 5.8.3, TanStack Query ^5.99.0, Zustand ^5.0.12, Zod ^4.3.6, Tailwind CSS + shadcn/ui, Playwright ^1.59.1) confirmed in `package.json`. This phase is composition + one schema/RPC change, not a new-library integration.

One correction to CLAUDE.md's stack table for anyone cross-referencing it: `package.json` pins `"tailwindcss": "^4.3.3"` (Tailwind v4), not v3 as the "Actual Stack" table states — `[VERIFIED: package.json]`. Not load-bearing for this phase; noted so the planner doesn't chase a stale version number.

## Package Legitimacy Audit

Not applicable — no new external packages are being installed in this phase.

## Architecture Patterns

### System Architecture Diagram

```
Cashier scans barcode ──┐
                         ├─→ useLookupProductByBarcode.lookup(code)
Cashier searches product┘        │
                                  ├─ hit  → cartStore.addItem(product, [], unitPrice?)
                                  └─ miss → toast "Product not found"
                                             + supabase.rpc('record_audit', { p_action:'barcode.scan_failed', ... })
                                             → fall back to manual search (CHK-02)

cartStore (Zustand, client-only, never persisted)
  ├─ items: CartItem[]                (existing: quantity-based lines)
  ├─ [NEW] weightedItems / weightGrams field on CartItem for loose kg/g lines (CHK-05)
  └─ [NEW] heldCart: CartItem[] | null  (D-01..D-05 — single hold slot, in-memory only)

Cashier presses "Charge $X.XX"
        │
        ▼
[NEW] one wrapping client call, inside ONE Postgres transaction:
  1. useMutationOpenTab()            → INSERT tabs (customerName placeholder, cajaSessionId, shiftId)
  2. create_order_with_items RPC     → INSERT orders, INSERT order_items (full cart in one call)
                                         └─ fires trigger_decrement_inventory_on_order_item
                                            (AFTER INSERT, same txn) → inventory.quantity_on_hand -= qty
  3. process_payment_atomic /
     process_split_payment_atomic    → INSERT payments, UPDATE tabs.status='paid'
        │
        ├─ ok=true  → PaymentForm's existing success path:
        │              printReceipt(receiptData)  [D-12 auto-print, existing pos-printer.ts]
        │              + optional EmailReceiptDialog / skip
        │              → "Sale complete — $X.XX" toast → cartStore.clearCart()
        └─ ok=false → surface error, cart is untouched (steps 1-2 must be
                       inside the SAME transaction as step 3, or a step-3
                       failure leaves an already-stock-decremented,
                       unpaid tab — see Common Pitfalls #1)
```

Steps 1–3 currently exist as **three separate RPC calls in the bar-tab flow** (open tab when a table/customer starts a session; add items whenever the bartender rings something in; pay whenever the customer wants to settle). For direct-sale checkout, CHK-03's atomicity requirement means steps 1–3 must collapse into work that either happens in one new SQL function, or is proven to be safe as sequential calls only because nothing user-facing or stock-affecting happens between them until the payment RPC. See the pitfall below — this is the one thing in this phase most likely to get relitigated by a plan reviewer, so treat it as the central design decision, not a footnote.

### Recommended Project Structure

No FSD layer changes needed — this phase populates layers that already have placeholder or sibling directories:

```
src/pages/pos/                          # [NEW] route container (was deleted in Phase 1, no stub)
src/widgets/CheckoutPanel/               # [NEW] composes ProductGrid + CartPanel + hold banner
src/widgets/ProductGrid/                 # [NEW] product browse/search grid — CLAUDE.md's route
                                          #   table references this widget name but it does not
                                          #   exist in src/ today (deleted with /pos in Phase 1);
                                          #   build it from entities/product's ProductCard + CategoryTabs
src/features/scan-barcode-to-cart/       # [NEW] thin wrapper: useBarcodeScanner + useLookupProductByBarcode + cartStore.addItem + D-10/D-11 fallback/audit
src/features/add-loose-weight-item/      # [NEW] weight keypad UI + cartStore weight-line action (D-06/D-07/D-08)
src/features/hold-sale/                  # [NEW] hold/resume banner + cartStore.heldCart (D-01..D-05)
src/features/checkout-sale/              # [NEW] "Charge" button → open-tab + create-order + PaymentForm wiring (the atomic-commit orchestration above)
src/entities/tab/model/cartStore.ts      # [REUSE, extend] add weight-line support + heldCart slot
src/entities/tab/ui/CartItem.tsx         # [REUSE, extend] branch quantity-stepper vs weight-entry per line
src/features/lookup-product-by-barcode/  # [REUSE as-is after Pitfall #4 fix]
src/shared/lib/useBarcodeScanner.ts      # [REUSE as-is]
src/widgets/PaymentModal/ui/PaymentForm.tsx  # [REUSE as-is per D-14 — do not touch the UI]
src/features/process-payment/ui/EmailReceiptDialog.tsx  # [REUSE as-is]
src/shared/lib/pos-printer.ts            # [REUSE as-is]
```

### Pattern 1: Cart stays client-only until payment (no "held tab" row in Postgres)

**What:** `cartStore` (Zustand) already never touches the database (`src/entities/tab/model/cartStore.ts:52`, comment: "Client-only — never persisted"). Extend this same store with a second slot, e.g. `heldCart: CartItem[] | null`, rather than writing an in-progress sale to `tabs`/`order_items` and giving it a "held" status.

**When to use:** For D-01..D-05 (hold/resume) and for the active cart during CHK-01/02/05 item entry — i.e., for the entire pre-payment lifecycle of a sale.

**Why (verified, not stylistic):** `trigger_decrement_inventory_on_order_item` (`supabase/migrations/20260414000008_triggers.sql:74-77`) fires unconditionally on `AFTER INSERT ON order_items FOR EACH ROW` and immediately does `UPDATE inventory SET quantity_on_hand = quantity_on_hand - NEW.quantity`. There is no flag that suppresses this trigger — `create_order_with_items`'s `p_skip_depletion` parameter only gates the separate `PERFORM deplete_for_order_item(...)` call (open-unit/case-piece depletion, `supabase/migrations/20260810000008_drop_promotions.sql:120-126`), not this trigger. So the instant an `order_items` row exists in Postgres for a cart line, its stock is gone from `inventory.quantity_on_hand` — regardless of whether a payment was ever taken. D-04 explicitly requires the opposite ("No stock reservation while a sale is held … stock only decrements at actual payment"). The only way to honor D-04 with this trigger in place is to not create `order_items` rows until the moment of payment.

**Example (recommended shape, not existing code):**
```typescript
// src/entities/tab/model/cartStore.ts — extend, do not replace
interface CartState {
  items: CartItem[];
  heldCart: CartItem[] | null; // [NEW] D-01: single hold slot
}
interface CartActions {
  // ...existing actions unchanged...
  holdCart: () => void;   // moves items -> heldCart, clears items (D-01/D-02)
  resumeHeld: () => void; // moves heldCart -> items
  discardHeld: () => void; // D-05: no PIN gate, nothing was ever committed
}
```

### Pattern 2: Commit the whole sale atomically, in one Postgres transaction, at payment time

**What:** When the cashier presses "Charge", perform (a) tab creation, (b) full-cart order/item insert, (c) payment insert + tab close — with (b) and (c) forced into the same DB transaction, since (b) is what fires the stock-decrement trigger.

**When to use:** Every completed sale (CHK-03).

**Recommended options, in order of preference:**
1. **New wrapping SQL function** (`process_direct_sale_atomic` or similar) that does everything `create_order_with_items` does (verbatim, that function is small — `supabase/migrations/20260810000008_drop_promotions.sql:60-147`) followed by everything `process_payment_atomic` does (`supabase/migrations/20260810000003_drop_pool_resources.sql:72-267`), in one `SECURITY DEFINER` function, one transaction. Cleanest atomicity guarantee; costs one new migration and duplicates ~150 lines of already-battle-tested SQL logic (row locking, version guard, idempotency-key handling) — acceptable, this is exactly the kind of "small, well-scoped SQL change" CONTEXT.md's canonical refs ask for while this code is touched.
2. **Sequential RPC calls with a compensating rollback on step-3 failure** — i.e., call `create_order_with_items` then `process_payment_atomic`; if the payment call fails, issue a client-side `DELETE`/void to undo the item insert (which fires `trigger_restore_inventory_on_order_item_delete` and restores stock, `supabase/migrations/20260414000008_triggers.sql:102-105`). Not truly atomic (a crash between steps 2 and 3 leaves stock decremented with no payment, recoverable only by a human), but reuses existing RPCs completely unmodified. Lower engineering cost, weaker atomicity guarantee than option 1 — flag this tradeoff explicitly to the user/planner rather than silently picking it.

Do not build a third option that reimplements stock decrement logic client-side or in a new trigger-adjacent path — the existing trigger already does this correctly once it fires inside the right transaction.

### Pattern 3: Failed-scan audit logging via direct `record_audit` RPC call

**What:** Call `supabase.rpc('record_audit', {...})` directly from the scan-handling code — no new feature-specific RPC needed.

**When to use:** D-11 — every barcode scan with no catalog match.

**Example (verified pattern, existing call site):**
```typescript
// Source: src/app/OfflineQueueProcessor.tsx:33-41 (existing direct-call precedent)
const res = await supabase.rpc('record_audit', {
  p_action: 'barcode.scan_failed',   // matches existing dot-namespace convention:
                                      // 'staff.role_change', 'permission.toggle',
                                      // 'conflict.stale_version' (grep-verified call sites)
  p_entity_type: 'product',
  p_entity_id: null,                 // no product exists to reference
  p_before: { barcode: scannedCode },
  p_after: null,
  p_terminal_id: TERMINAL_ID,
  p_user_id: null,
} as never);
```
`record_audit`'s signature (`supabase/migrations/20260703000001_record_audit_terminal_id.sql:47-56`) is `(p_action text, p_entity_type text, p_entity_id uuid DEFAULT NULL, p_before jsonb DEFAULT NULL, p_after jsonb DEFAULT NULL, p_source text DEFAULT 'rpc', p_terminal_id text DEFAULT NULL, p_user_id uuid DEFAULT NULL)` and is `GRANT EXECUTE ... TO authenticated` (line 96 of the same file) — directly callable from client code, matching the pattern above.

### Anti-Patterns to Avoid

- **Reusing `create_order_with_items` as a per-item "add to cart" RPC call (the old bar-tab pattern).** Each call is a separate transaction; the stock-decrement trigger fires per call, immediately. This breaks D-04 (no decrement while held) and, if the cashier abandons the sale before paying, leaves phantom stock decrements with no compensating action taken. Keep the cart in Zustand; call the order-creation RPC exactly once, at payment time, with the full cart array (`create_order_with_items` already accepts `p_items` as a JSON array — it is designed for a bulk insert, not a per-item call).
- **Repurposing `order_items.quantity` (INT) to hold a fractional weight.** The `CHECK (quantity > 0)` constraint and the TypeScript `z.number().int()` constraint on both `OrderItemSchema.quantity` and `CartItemSchema.quantity` (`src/shared/lib/domain.ts:329,1042`) will reject or silently truncate a decimal weight. Add a separate field instead (see Common Pitfalls #2).
- **Treating `TabStatusSchema`'s `'split'` value, `order_items.combo_slot_id`/`parent_order_item_id`, or `products.isCombo`/`comboEligible`/`comboPriceOverride` as live features.** These are documented-dormant leftovers from Phase 1's combos/split-tab strips (`src/shared/lib/domain.ts:74-81`, product schema comments at lines 246-250) — do not build against them, do not "clean them up" as part of this phase either (out of scope, tracked separately).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic payment + tab-close, idempotent retries, optimistic-concurrency version guard | A new payment write path | `process_payment_atomic` / `process_split_payment_atomic` unchanged (extend only per Pattern 2) | Already handles row locking (`FOR UPDATE`), `STALE_VERSION`/`NOT_FOUND_VERSIONED` guards, per-payment idempotency key with a `UNIQUE INDEX` (`idx_payments_idempotency_key`, `supabase/migrations/20260417000001_payment_processing.sql:22`) backing a `unique_violation` exception handler that replays the original result. Rebuilding this is exactly the kind of payment-integrity bug class CLAUDE.md's `AppErrorCode`/`Result<T>` discipline exists to prevent. |
| Receipt formatting + thermal printing | New print code | `pos-printer.ts`'s `printReceipt()`, `receiptDataToPrinterLines()`, `buildThermalReceiptText()` | Already handles Tauri ESC/POS vs. browser `window.print()` fallback, locale-aware line building. Zero bar-specific logic in this file — confirmed by reading it in full. |
| USB barcode scanner input capture | A new keystroke listener | `useBarcodeScanner` (`src/shared/lib/useBarcodeScanner.ts`) | Already implements the keystroke-wedge burst-detection pattern generic USB HID scanners use; not bar-specific. |
| Email receipt delivery | New email UI/logic | `EmailReceiptDialog` + `sendReceiptByEmail` | Fully generic — takes a `ReceiptData` prop, no tab/bar coupling. Confirmed by reading the component. |

**Key insight:** The temptation in this phase is to rebuild the payment/RPC layer because "it's a different kind of sale now." It isn't, at the SQL layer — a direct sale is structurally a tab that gets exactly one order, created and paid in the same breath. The only genuinely new backend work is (a) wrapping order-creation + payment in one transaction, and (b) the loose-weight schema addition. Everything else is composition of existing, tested primitives.

## Common Pitfalls

### Pitfall 1: Two-call payment flow silently violates CHK-03's atomicity
**What goes wrong:** `create_order_with_items` (order/item insert, fires the stock-decrement trigger) and `process_payment_atomic` (payment insert, tab close) are two separate RPC calls today. If Phase 2 wires the direct-sale flow as "call RPC A, then call RPC B" without forcing them into one transaction, a crash/network-drop/app-restart between the two calls leaves stock decremented with no payment recorded and no way to distinguish that tab from a legitimately abandoned one.
**Why it happens:** This is exactly how the bar-tab flow works today (add items over time, pay later) — it's the natural pattern to copy without re-deriving why it was structured that way (drinks are consumed the moment they're poured, so early decrement is correct there; a grocery scan is not consumed until it's paid for).
**How to avoid:** Follow Architecture Pattern 2, option 1 — one new SQL function wrapping both operations, one transaction, one commit/rollback boundary. If the plan instead chooses option 2 (sequential calls + compensating void), that tradeoff must be an explicit, named decision in the plan, not an accident of reusing the bar-tab call sequence.
**Warning signs:** A plan task titled "call create_order_with_items when cashier presses Charge, then call process_payment_atomic" with no rollback/compensation step for the case where the second call fails.

### Pitfall 2: `order_items.quantity`/`inventory.quantity_on_hand` cannot hold a fractional weight
**What goes wrong:** A loose kg item weighing 0.375 kg has nowhere to go — `order_items.quantity INT NOT NULL DEFAULT 1` (`supabase/migrations/20260414000004_tabs_and_orders.sql:52`, `CHECK (quantity > 0)` at line 59) and `CartItemSchema.quantity: z.number().int().min(1)` (`src/shared/lib/domain.ts:1042`) both reject non-integers.
**Why it happens:** CONTEXT.md's "Established Patterns" section asserts a `UomSchema` already exists to handle this — it does not (verified: zero matches for `Uom` anywhere in `src/` or `supabase/`). The planner may inherit that false premise from CONTEXT.md and assume this is a reuse task.
**How to avoid:** Add a new nullable field — recommend `weightGrams: z.number().int().positive().nullable()` on `CartItemSchema`/`OrderItemSchema` (mirrored as `weight_grams INTEGER NULL` on `order_items`), storing weight as integer grams (avoids float-precision drift; `quantity` stays `1` as a DB-constraint-satisfying sentinel for weighted lines). Compute `lineTotal = (weightGrams / 1000) * unitPrice`. Add a `products` flag (e.g. `soldByWeight boolean default false`) so checkout UI knows which products get a weight keypad vs. a quantity stepper — no such flag exists today either (`[ASSUMED]` — this exact field name/shape is Claude's discretion per CONTEXT.md, not a verified requirement; confirm with the user during planning if a different flag/UX trigger is preferred, e.g. deriving it from a category instead of a per-product boolean).
**Warning signs:** Any task that tries to pass a decimal into `quantity`, or that skips adding a weight field entirely and hopes `unitPrice` alone carries the math.

### Pitfall 3: Preserve the resolved integer-gram inventory contract through later direct-sale migrations
**What goes wrong:** A later `CREATE OR REPLACE FUNCTION process_direct_sale_atomic` can preserve weight pricing while no longer inserting the stored `weight_grams` that `decrement_inventory_on_order_item()` consumes, or a test can validate only the browser display. Either failure makes weighted inventory inaccurate despite the resolved stock-unit model.
**Why it happens:** `quantity` remains the integer sentinel 1 for weighted lines, while the `20260814000001_loose_weight_items.sql` trigger deliberately chooses `NEW.weight_grams` for products where `sold_by_weight = true` and writes that same integer delta to `stock_movements`.
**How to avoid:** Preserve `weight_grams` in every direct-sale RPC insert. The client submits a bounded integer gram count; the RPC converts grams to kilograms only for `base_price` calculation and rounds currency to cents; the trigger subtracts the stored integer grams without stock rounding or conversion. Prove the contract through a service-role RPC regression that persists 375 grams, changes 1,000 grams on hand to 625, and records `-375` in `stock_movements`.
**Warning signs:** A direct-sale migration that omits `weight_grams` from its `order_items` insert, or a weighted test that checks only UI totals rather than the persisted inventory and movement rows.

### Pitfall 4: `useLookupProductByBarcode` reports "not found" for real products outside the TanStack cache window
**What goes wrong:** On a cache miss, `lookup()` queries the DB (`select('id, name, barcode').eq('barcode', code).maybeSingle()`), confirms the product exists (`data` is truthy), then discards that result and calls `findCached(code)` a second time against the `['products']` TanStack cache (`src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts:23-45`, specifically lines 39-42) to resolve the "full" `Product` object. If that product isn't in the cached list — because it was added/barcode-edited after the list's `staleTime` (`useProducts`'s query has `staleTime: 5 * 60 * 1000`, `src/entities/product/model/queries.ts:174`) last refreshed, or because the checkout page hasn't mounted `useProducts()` yet at all — `findCached` returns `null` even though the DB just confirmed the product exists, and the scan is reported to the cashier as "not found."
**Why it happens:** The DB query only selects 3 columns (`id, name, barcode`) — not enough to construct a full `Product`, so the function leans on the cache for the rest instead of doing a full-column DB query.
**How to avoid:** Have the checkout page mount `useProducts()` (or an equivalent that populates the exact `['products']` query key) on load, so the cache is warm before scanning starts — mitigates but does not eliminate the gap (a product added mid-shift is still invisible until the 5-minute staleTime refetches). For CHK-01 reliability, recommend selecting full product columns in the fallback query (matching `useProducts`'s shape, including `category:categories(*)`) instead of relying on a second cache lookup, or triggering a `queryClient.invalidateQueries(['products'])` on a confirmed-but-uncached hit.
**Warning signs:** E2E flakiness where a freshly-seeded/freshly-edited product's barcode intermittently "fails" to scan in tests that don't pre-warm the products query.

### Pitfall 5: `/pos` needs both a router entry and a Home tile — Phase 1 deliberately left neither
**What goes wrong:** Navigating to `/pos` today falls through the catch-all route and redirects to `/home` (`src/app/router.tsx` — no `/pos` `<Route>` exists; the trailing `<Route path="*" element={<Navigate to="/home" replace />} />` catches it). There is also no Home dashboard tile linking to it.
**Why it happens:** Phase 1's D-07/D-10/D-14 explicitly removed the route and tile with no stub, by design, pending this phase's rebuild.
**How to avoid:** Both the router entry and the Home tile are must-have tasks in this phase's plan, not incidental — confirm the plan doesn't assume the route already exists because CLAUDE.md's route table lists `/pos` (that table describes the target state, not the current one).

## Runtime State Inventory

Not applicable — this phase is a net-new feature build on kept infrastructure, not a rename/refactor/migration of existing runtime state. (Phase 1 already completed the strip/rename work; its own RESEARCH.md covers that inventory.)

## Code Examples

### Direct DB read for barcode lookup (existing, reusable pattern — cache-first)
```typescript
// Source: src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts:23-45
const lookup = useCallback(
  async (code: string): Promise<Product | null> => {
    const cached = findCached(code);
    if (cached) return cached;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, barcode' as any)
      .eq('barcode' as any, code)
      .maybeSingle();
    if (error) { logger.error('barcode_lookup.failed', { code: error.code, message: error.message }); return null; }
    if (!data) return null;
    const full = findCached(code); // see Pitfall 4 — this is the fragile step
    return full;
  },
  [findCached]
);
```

### Auto-print after payment (existing, reusable — matches D-12)
```typescript
// Source: src/widgets/PaymentModal/ui/PaymentForm.tsx:399-404 (paraphrased call sites, both cash and card paths)
const drawer = await openCashDrawer();
const printed = await printReceipt(receipt); // src/shared/lib/pos-printer.ts:49-63
```

### Cart line math (existing, reuse for whole-unit lines; extend for weighted lines per Pitfall 2)
```typescript
// Source: src/entities/tab/model/cartStore.ts:49-50
const calcLineTotal = (unitPrice: number, modifiers: Modifier[], quantity: number): number =>
  (unitPrice + modifiers.reduce((sum, m) => sum + m.priceDelta, 0)) * quantity;
// [NEW, recommended] weighted-line equivalent:
// const calcWeightedLineTotal = (pricePerKg: number, weightGrams: number): number =>
//   Math.round(pricePerKg * (weightGrams / 1000) * 100) / 100;
```

## State of the Art

| Old Approach (bar-tab, pre-Phase-1) | New Approach (direct-sale, Phase 2) | When Changed | Impact |
|--------------------------------------|--------------------------------------|---------------|--------|
| Tab opened, items added incrementally over the life of a running tab, stock decremented per add | Tab/order/items created once, in full, at the moment of payment | This phase | Stock decrement timing must move from "item insert" to "payment commit" — see Architecture Pattern 2 |
| `/pos` route = tab-based order entry (`PosPage`) | `/pos` route = direct-sale checkout (new page/widgets) | Phase 1 removed the old page and route; Phase 2 rebuilds it fresh | No route/page currently exists at `/pos` — must be created, not edited |
| Modifiers (drink customizations) shape `CartItem.selectedModifiers` | Likely unused for grocery products — pass `[]` | N/A, still technically present in the schema | `ModifierSchema`/`useModifiers` remain in the codebase (not stripped) but grocery products won't typically have modifiers; don't build new modifier UI for this phase unless a specific product category needs it (not in CHK-01..05) |

**Deprecated/outdated:** `products.happyHourPrice` (always `null` now, per its own JSDoc at `src/shared/lib/domain.ts:228-234`) and the `CartItem.tsx` "happy hour" Zap-icon check (`item.unitPrice !== item.product.basePrice`, `src/entities/tab/ui/CartItem.tsx:52-54`) are Phase 20 leftovers — harmless to leave as dead code for this phase, but don't extend or rely on this comparison to mean anything for direct-sale checkout.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A per-product `soldByWeight` boolean (vs. a category-level flag or some other UX trigger) is the right mechanism for the checkout UI to decide whether to show a weight keypad instead of a quantity stepper for a given product. | Common Pitfalls #2 | Low-to-medium — this is explicitly Claude's Discretion per CONTEXT.md; if the user wants a different mechanism (e.g. category-based), only the UI-decision-point code changes, not the weight math itself. |
| A2 | RESOLVED: for `products.sold_by_weight = true`, `inventory.quantity_on_hand` is an integer gram count and the trigger decrements `weight_grams`; regular products continue to use whole saleable units. | `20260814000001_loose_weight_items.sql:1-35` | The persisted unit and decrement behavior are explicit; later direct-sale migrations must retain the stored gram field and direct-RPC regression. |
| A3 | Option 1 (new wrapping SQL RPC combining order-creation + payment in one transaction) is worth its migration cost over option 2 (sequential calls + compensating void) for CHK-03's atomicity guarantee. | Architecture Pattern 2 | Medium — option 2 is cheaper to build but leaves a real (if narrow) atomicity gap; if the user/planner is fine with that tradeoff for Alpha, option 2 is legitimate and research doesn't have standing to force option 1. |

## Open Questions

1. **RESOLVED — How `inventory.quantity_on_hand` decrements for loose-weight (kg/g) products.**
   - Decision and evidence: `20260814000001_loose_weight_items.sql:1-35` sets the stock unit to integer grams when `products.sold_by_weight = true`, persists `order_items.weight_grams`, and makes `decrement_inventory_on_order_item()` subtract that stored integer and write the same negative integer to `stock_movements`.
   - Conversion and rounding boundary: the client sends bounded integer grams; `process_direct_sale_atomic` computes `base_price * (weight_grams / 1000.0)` and rounds currency to cents; the inventory trigger performs no conversion or rounding.
   - Required regression: apply any forward direct-sale RPC migration, then prove a 375-gram paid sale changes 1,000 grams to 625 and emits a `-375` movement through the service-role RPC, in addition to the browser-flow assertion.

2. **RESOLVED — The single held-sale slot survives an app restart.**
   - User decision: the one permitted held sale must survive a Tauri/WebView restart. Persist only `heldCart` with Zustand's existing native `persist` middleware and browser local storage; the active `items` cart remains session-only. This preserves D-01's single slot and D-02's ability to start a new active sale after restart.
   - Data authority and boundary: the persisted value is the complete client-side `CartItem[]` snapshot (product, selected modifiers, quantity, `unitPrice`, `lineTotal`, notes, and optional integer `weightGrams`). It is solely the pre-payment resume state: Plan 02-06's `process_direct_sale_atomic` remains authoritative for catalogue pricing and payment, and no `tabs`, `orders`, `order_items`, payments, inventory, or stock movements are created while the slot is held (D-04).
   - Serialization and migration: use a dedicated versioned local-storage key, `partialize` to the one slot, and validate/migrate its small persisted envelope with the existing `CartItemSchema`; invalid or obsolete local data restores no held cart rather than an incomplete sale. A later payload change increments the store version and supplies its forward migration. Resume and discard must write the slot back to `null`, retaining D-03/D-05's manual-only lifecycle.

3. **RESOLVED — Direct-sale checkout retains the existing `tabs`/`orders`/`order_items` schema names.**
   - Existing-plan rationale: the Phase 2 plans implement direct sales through the retained atomic plumbing while presenting “Sale”/“Checkout” in UI and i18n. Renaming the persisted schema would repeat the documented `pool_tables → resources` fragility across RPCs, triggers, RLS, and E2E support for no CHK-01..CHK-05 outcome.
   - Consequence for held-sale restart persistence: it is a client-only local record, not a new table or a renamed direct-sale column. Revisit schema vocabulary only when a later phase has a concrete data/reporting need that justifies a forward migration.

## Environment Availability

Skipped — this phase has no new external tool/service dependencies beyond what Phase 1 already confirmed present (Supabase local stack, Tauri toolchain, Node/npm). No new CLI, runtime, or service is introduced.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V1 Architecture | Yes | All financial state changes (tab open, order/item insert, payment, stock decrement) must go through `SECURITY DEFINER` Postgres RPCs called via the Supabase Edge Function auth wrapper — never raw client-side `INSERT`/`UPDATE` on `payments`, `order_items`, or `inventory`. This is already the established pattern (`process-payment` edge function verifies the JWT via `/auth/v1/user` before calling the RPC — `supabase/functions/process-payment/index.ts:108-120`); the new order-creation-at-payment-time RPC must follow the same shape. |
| V4 Access Control | Yes | RBAC actions (`create_order`, `close_tab` — `src/shared/lib/rbac.ts:14,19`) already gate tab/order mutation; `deplete_for_order_item` itself has a role guard rejecting `kitchen` role (`supabase/migrations/20260810000007_deplete_for_order_item_v6.sql:42-44`). No new role/action needed for CHK-01..05 — cashier-and-above already covers checkout. |
| V5 Input Validation | Yes | Zod schemas (`domain.ts`) validate all client-constructed payloads before they reach an RPC call; the edge functions additionally re-validate with their own Zod `BodySchema` server-side (defense in depth — confirmed in `process-payment/index.ts:5-38`). New weight-entry fields must get the same double validation (client Zod schema + edge function/RPC-side bounds check, e.g. reject `weightGrams <= 0` or absurdly large values). |
| V6 Cryptography | No | Nothing in this phase touches secrets, tokens, or crypto — payment processing is cash/card-reference/split, no card data is captured or stored (confirmed: `PaymentSchema` only stores `referenceNumber`/`tenderedAmount`, never raw card data). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Client retries a payment submission after a timeout, double-charging | Tampering / Repudiation | Idempotency key generated once per logical payment attempt and reused across retries — **currently NOT the case** (see below), needs fixing in this phase since Phase 2 touches this path directly. |
| Cashier crafts a client-side request to skip stock decrement while still recording a payment | Tampering | The RPC must be the sole writer of both `payments` and (via the trigger) `inventory` in one transaction — never let the client call the order-insert and payment-insert as independently-triggerable, unauthenticated-relative-to-each-other steps. |
| Race between two terminals selling the last unit of a low-stock item | Repudiation (of stock state) | `inventory.quantity_on_hand >= 0` CHECK constraint (`supabase/migrations/20260414000007_inventory.sql:14`) already prevents negative stock at the DB layer; a genuine race will surface as a Postgres constraint violation the RPC must translate into a user-facing "out of stock" error, not a generic 500. |

**Correction to CONTEXT.md's stated idempotency gap:** CONTEXT.md's canonical refs direct this phase to "fix" a "live idempotency gap in `process_split_payment_atomic`" per CONCERNS.md. Reading the live SQL this session (`supabase/migrations/20260810000003_drop_pool_resources.sql:269-530`) shows the RPC-side mechanism is **already correctly implemented**: per-leg idempotency keys (`p_idempotency_key || '-leg' || i`), backed by a real `UNIQUE INDEX` (`idx_payments_idempotency_key`), with a `WHEN unique_violation` exception handler that replays the original result. The actual gap is one layer up, on the **client**: `processSplitPayment()`/`processCashPayment()`/`processCardPayment()` (`src/shared/lib/payment-processor.ts:48,84,131,161`) call `generateIdempotencyKey(prefix)` **fresh on every function invocation** — so if a cashier's first "Charge" click times out on the network (server-side transaction may have already committed) and they click "Charge" again, `PaymentForm` calls the processor function again, which mints a brand-new key, and the server-side idempotency check never engages because the key it's deduping on has changed. **The fix belongs in the client** (persist/reuse one idempotency key across retries of the same logical payment attempt, e.g. via a `useRef` scoped to the current cart/tab, cleared only on success or explicit cart reset) — not in the RPC, which is already correct. Flag this precisely to the planner so the fix targets the right file (`payment-processor.ts` / `PaymentForm.tsx`'s retry handling), not `process_split_payment_atomic`.

## Sources

### Primary (HIGH confidence — read directly this session, cited by file:line above)
- `src/entities/tab/model/cartStore.ts`, `types.ts`
- `src/shared/lib/domain.ts` (schemas: `TabStatusSchema`, `OrderItemSchema`, `OrderSchema`, `TabSchema`, `PaymentSchema`, `ProductSchema`, `CartItemSchema`, `OpenUnitSchema`, `OfflineActionTypeSchema`)
- `src/shared/lib/supabase.types.ts` (`order_items` table shape)
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts`
- `src/entities/product/model/queries.ts` (`useProducts`)
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` (grep-level: print/audit call sites)
- `src/shared/lib/pos-printer.ts`
- `src/features/process-payment/ui/EmailReceiptDialog.tsx`
- `src/shared/lib/payment-processor.ts`, `src/shared/lib/domain-helpers.ts` (`generateIdempotencyKey`)
- `src/app/OfflineQueueProcessor.tsx` (direct `record_audit` call precedent)
- `src/app/router.tsx` (confirms no `/pos` route exists)
- `src/entities/tab/model/store.ts` (`useTabStore`, offline queue)
- `src/shared/lib/rbac.ts`
- `supabase/migrations/20260414000004_tabs_and_orders.sql` (`order_items.quantity INT` constraint)
- `supabase/migrations/20260414000007_inventory.sql` (`inventory` table)
- `supabase/migrations/20260414000008_triggers.sql` (stock-decrement/restore triggers — the central finding)
- `supabase/migrations/20260424000001_stock_movements.sql` (trigger rewrite to `stock_movements`)
- `supabase/migrations/20260810000008_drop_promotions.sql` (live `create_order_with_items` body)
- `supabase/migrations/20260810000003_drop_pool_resources.sql` (live `process_payment_atomic`/`process_split_payment_atomic` bodies)
- `supabase/migrations/20260810000007_deplete_for_order_item_v6.sql` (live open-unit-only depletion body)
- `supabase/migrations/20260703000001_record_audit_terminal_id.sql` (`record_audit` signature + grants)
- `supabase/migrations/20260417000001_payment_processing.sql` (`idx_payments_idempotency_key` unique index)
- `supabase/functions/process-payment/index.ts`
- `.planning/codebase/CONCERNS.md`, `.planning/phases/02-core-direct-sale-checkout/02-CONTEXT.md`, `.planning/phases/01-strip-rebrand/*` (referenced), `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `package.json`, `.planning/config.json`

### Secondary / Tertiary
None used — this research was entirely answerable from the live codebase; no web search was needed or performed (all MCP search providers are disabled in `.planning/config.json`, and the questions were about this specific codebase's actual state, not general framework documentation).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all versions read from `package.json`.
- Architecture (reuse map + atomicity gap): HIGH — every claim backed by a file:line read this session, including the two corrections to CONTEXT.md's premises (UomSchema, idempotency gap location).
- New-RPC design recommendation: MEDIUM — this is a design proposal (option 1 vs. option 2 in Pattern 2), not a fact; the planner/user should confirm the tradeoff explicitly.
- Loose-weight stock-decrement precision: LOW / explicitly an Open Question — no existing code answers this, flagged rather than guessed.

**Research date:** 2026-08-12
**Valid until:** Effectively tied to this codebase's current migration head — re-verify the live SQL bodies (`process_payment_atomic`, `create_order_with_items`, the inventory triggers) if any other phase or hotfix touches payments/orders/inventory before Phase 2 executes, since this research read specific migration files by name and a later migration could redefine them again.
