---
phase: 02-core-direct-sale-checkout
reviewed: 2026-08-12T20:27:37Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - e2e/50-direct-sale-checkout.spec.ts
  - e2e/51-barcode-scan-search.spec.ts
  - e2e/52-loose-weight-hold-sale.spec.ts
  - src/entities/product/model/queries.ts
  - src/entities/tab/model/cartStore.ts
  - src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx
  - src/features/checkout-sale/model/useCheckoutSale.ts
  - src/features/hold-sale/ui/HoldSaleBanner.tsx
  - src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts
  - src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts
  - src/pages/pos/index.tsx
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/payment-processor.ts
  - src/shared/lib/receipt-format.ts
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - src/widgets/ProductGrid/ui/ProductGrid.tsx
  - supabase/functions/process-direct-sale/index.ts
  - supabase/migrations/20260813000001_process_direct_sale_atomic.sql
  - supabase/migrations/20260813000002_fix_direct_sale_split_idempotency.sql
  - supabase/migrations/20260814000001_loose_weight_items.sql
  - supabase/migrations/20260814000002_weighted_direct_sale_price.sql
  - supabase/migrations/20260815000001_direct_sale_atomic_paid_and_shift_guard.sql
findings:
  critical: 4
  warning: 1
  info: 0
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-08-12T20:27:37Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

The checkout flow has several confirmed integrity failures at its service-role boundary. In particular, it treats a client-provided amount as payment authority, permits cross-cashier idempotency replays, and keeps the scanner live while receipt completion will clear the cart. Split receipts also present a contradictory sale total.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Direct-sale totals, modifiers, discounts, and tax are still client-authoritative

**Classification:** BLOCKER

**File:** `supabase/migrations/20260815000001_direct_sale_atomic_paid_and_shift_guard.sql:63-82`; `src/widgets/PaymentModal/ui/PaymentForm.tsx:1036-1053`

**Issue:** The RPC writes the client-supplied `unit_price` and `modifier_price_delta` (lines 63-67), then passes the client-supplied payment amount through to `process_payment_atomic` (lines 69-78). Its final guard only tests whether that nested RPC marked the tab paid (lines 80-82). The nested payment calculation sums `unit_price * quantity`; it has no direct-sale tax, modifier-delta, or server-derived discount basis. A caller can therefore send the pre-tax item subtotal (or a lower card override) and tender that amount; the tab becomes `paid` even though the POS display says more is due. The E2E helper itself demonstrates this gap by successfully calling the RPC with `p_amount` equal to `base_price` rather than the displayed tax-inclusive total (`e2e/50-direct-sale-checkout.spec.ts:161-176`). An API caller can also attach a priced modifier with `modifier_price_delta: 0`, because neither the edge function nor SQL verifies the modifier IDs or derives their price.

**Fix:** Compute the authoritative item, modifier, discount, and tax total inside a single server-side transaction. Derive modifier prices from allowed catalog joins, reject client price/delta fields that differ from the derived values, and require the single payment or split-leg total to equal that authoritative amount before a tab can be set to `paid`. Do not permit the card override to reduce that amount; any terminal reconciliation adjustment needs a separately authorized flow.

### CR-02: Idempotency replay is not bound to the authenticated cashier

**Classification:** BLOCKER

**File:** `supabase/migrations/20260815000001_direct_sale_atomic_paid_and_shift_guard.sql:15-23`; `supabase/functions/process-direct-sale/index.ts:251-286`

**Issue:** The security-definer RPC returns an existing payment/tab for a matching idempotency key before it validates Caja, shift, or that the payment belongs to `p_staff_id`. The Edge Function then uses its service-role client to reread the original tab, payments, and all order lines to build a receipt. Thus any authenticated staff member who knows another cashier's replay key can obtain that sale's receipt and customer/order data, bypassing the shift/Caja authorization checks.

**Fix:** Include the authenticated staff identity in the idempotency lookup and reject a key owned by another staff member with `IDEMPOTENCY_MISMATCH`. Validate the caller's active shift/Caja before returning a replay, and ensure receipt reads are constrained to the authorized tab/payment owner.

### CR-03: Each split-tender receipt lists the entire basket but only one tender leg

**Classification:** BLOCKER

**File:** `supabase/functions/process-direct-sale/index.ts:80-156,251-272`

**Issue:** `buildReceipt` fetches every order item for `tabId` (lines 89-133), but takes `subtotal`, `total`, tendered amount, and change from one payment row (lines 134-156). The split branch calls it once for every payment ID (lines 251-257). A $100 basket split into two $50 legs therefore produces two receipts that both list $100 of goods while each says its total is $50. These are internally contradictory financial records.

**Fix:** Return one sale-level receipt whose payment section lists every split leg, or explicitly issue tender-only receipts that do not repeat the whole basket. In either design, derive the receipt total from the complete sale rather than an individual payment row.

### CR-04: Scanner input during the payment/receipt screen is silently discarded

**Classification:** BLOCKER

**File:** `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx:21,39-55`; `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.ts:17-27`

**Issue:** The scanner hook remains enabled unconditionally while `CheckoutPanel` renders `PaymentForm`. A scan at the receipt screen still calls `addItem`, but clicking receipt **Done** immediately calls `clearCart`. A cashier who scans the first item of the next sale before dismissing the prior receipt loses that newly scanned line with no warning.

**Fix:** Disable scanning whenever payment/receipt UI or either weight dialog is active, e.g. pass `!paymentOpen && !weightEntry.isOpen && editingWeightItemId === null` to the scanner hook. Add an E2E regression test that scans while the receipt is visible and verifies the item is not added or lost.

## Warnings

### WR-01: Barcode fallback can sell inactive products

**Classification:** WARNING

**File:** `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts:29-42`

**Issue:** The in-memory products query contains active products only, but the barcode cache-miss query filters solely by `barcode`. An inactive/deleted-from-grid product is therefore still mapped and added to the cart if its barcode is scanned.

**Fix:** Add `.eq('is_active', true)` to the fallback query and cover the inactive-barcode case so a scan follows the existing not-found path.

---

_Reviewed: 2026-08-12T20:27:37Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
