# Phase 2: Core Direct-Sale Checkout - Context

**Gathered:** 2026-08-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild the `/pos` route as a direct-sale checkout screen: scan or search a product, build a cart (including multi-unit/loose-weight items), pay by cash/card/split-tender, and print a receipt — all atomic (cart total + payment record + stock decrement commit together or not at all). Replaces the bar's tab-based POS page entirely. Maps CHK-01 through CHK-05.

Out of this phase: supplier/receiving/expiry (Phase 3), reports (Phase 4), AI invoice intake (v2/Beta, out of this roadmap).

</domain>

<decisions>
## Implementation Decisions

### Hold/park a sale
- **D-01:** Checkout supports a single hold slot — one in-progress cart can be set aside (e.g. a "Hold" button) while the cashier serves another customer, then resumed later.
- **D-02:** Starting a new sale while one is held is allowed — the register is not locked to the held cart. The held sale shows as a banner/badge to resume.
- **D-03:** No auto-expiry on a held sale — it stays parked until the cashier manually resumes or clears it.
- **D-04:** No stock reservation while a sale is held — stock only decrements at actual payment (via the atomic payment RPC), consistent with CHK-03. — **Reversibility:** costly — **rationale:** the inventory model has no `reserved_qty` concept; adding stock reservation later means a schema change plus rewiring the atomic payment RPC's stock-decrement logic, not a local UI tweak.
- **D-05:** Clearing/discarding a held sale does NOT require a manager PIN gate (unlike void-order) — nothing was ever committed (no payment, no stock movement), so it's equivalent to clearing an in-progress cart.

### Loose-weight item entry
- **D-06:** Cashier adds a loose kg/g item via search/select (no barcode — there is no scale hardware, deferred per PROJECT.md), then manually types the weight on a numeric keypad. Line price = weight × per-unit price.
- **D-07:** Per-kg/loose price reuses the product catalog's existing sale price field, interpreted per UoM — consistent with the existing `UomSchema`/open-unit pricing pattern already in the codebase. No new pricing field.
- **D-08:** A loose item's weight can be edited after it's added to the cart, using the same edit UX already used for adjusting quantity on packaged items (`cartStore.updateQuantity`/`setLineQuantity` pattern).
- **D-09:** Case-to-piece breakdown ("open unit") is strictly an Inventory-side action (Phase 3 territory) done before the item reaches the register — checkout only ever sells already-broken-down, piece-level products. Checkout does not trigger case-opening.

### Unknown/unmatched barcode
- **D-10:** A scan with no catalog match shows an error toast ("Product not found") and the cashier falls back to the existing manual product search (CHK-02) already in the cart. No inline quick-create-product shortcut from checkout.
- **D-11:** Failed/unmatched scans ARE logged to the audit trail — the user explicitly wants visibility into which barcodes keep failing so the catalog can be backfilled later. (Deviates from the initially recommended "no logging" option.)

### Receipt & payment finish flow
- **D-12:** Receipt auto-prints always after a successful payment (matches CHK-04). The cashier additionally has explicit options to email or skip the receipt.
- **D-13:** WhatsApp receipt delivery is DEFERRED — see Deferred Ideas below. Phase 2 ships auto-print + email + skip only.
- **D-14:** The existing multi-tender split-payment UI (`PaymentForm`'s split-mode toggle, up to 4 methods, live remaining-balance display) carries over unchanged for this screen — maps directly to CHK-03. No new payment UI to design.
- **D-15:** After a completed sale: show a brief success confirmation (e.g. "Sale complete — $X.XX"), then clear to a fresh empty cart ready for the next scan.

### Claude's Discretion
- Exact schema/naming for how the kept `tabs`/`order_items` plumbing (D-08 from Phase 1) is adapted/renamed for direct-sale checkout, including how the "held sale" (D-01) is represented underneath (e.g. a tab left in a pending state vs. a new lightweight table) — this is implementation, not vision, and belongs to research/planning.
- Exact UI layout/component structure for the numeric weight keypad (D-06) and the hold/resume banner (D-02).
- Where in the audit log schema/UI the failed-scan events (D-11) surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product/roadmap scope
- `.planning/PROJECT.md` — product definition, v1 requirements, out-of-scope list, constraints (counter scale explicitly deferred)
- `.planning/REQUIREMENTS.md` — CHK-01..CHK-05 acceptance criteria for this phase
- `.planning/ROADMAP.md` §"Phase 2: Core Direct-Sale Checkout" — goal, success criteria, dependencies
- `.planning/specs/2026-08-10-supermarket-pos-pivot-design.md` — pivot design doc; §"Feature Classification" and §"Inventory Management — Full Feature List" for reuse-vs-net-new boundaries

### Prior-phase decisions this phase depends on
- `.planning/phases/01-strip-rebrand/01-CONTEXT.md` — D-07 (`/pos` route removed, no stub), D-08 (`tabs`/`order_items` schema + `process_payment` atomic-RPC discipline KEPT for Phase 2 to adapt/rename, not rebuild), D-09 (split-tab/transfer-tab stripped, split-**payment** and process-refund kept), D-12 (old tab-based E2E specs deleted; Phase 2 writes fresh specs against the new flow), D-17 (tab-named RBAC action strings like `close_tab`/`delete_tab` left unrenamed pending this phase's schema decision)

### Known risk to address while this code is touched
- `.planning/codebase/CONCERNS.md` — flags a live idempotency gap in `process_split_payment_atomic`; since Phase 2 touches the payment path directly, fix this while here rather than deferring further

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/entities/tab/model/cartStore.ts` — Zustand cart store already implements add/remove/quantity-update/clear with line-total calc; still carries bar-era modifier logic that needs pruning but the add/edit/quantity mechanics directly support D-06/D-08's "same edit UX as quantity" decision.
- `src/entities/tab/ui/CartItem.tsx` — existing cart line UI component.
- `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` — cache-first barcode lookup against the `products` table; returns `null` on no match, which is the hook point for D-10's error-toast/fallback-to-search behavior.
- `src/shared/lib/useBarcodeScanner.ts` — USB-HID keystroke-wedge scanner hook, reusable as-is.
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` — existing multi-tender split-payment UI (D-14 carries this over as-is).
- `src/features/process-payment/ui/EmailReceiptDialog.tsx`, `ReceiptPreview.tsx` — existing email-receipt UI, reusable for D-12's email option.
- `supabase/functions/process-payment`, `process-split-payment` — existing atomic payment edge functions/RPCs to adapt per D-08.
- `src/features/void-order` — existing manager-PIN-gated void pattern; explicitly NOT applied to held-sale clearing (D-05), but the pattern exists if needed elsewhere.

### Established Patterns
- `UomSchema` (`g/kg/ml/L/unit/case_24`) and the `open-unit` entity already encode multi-unit pricing — D-07 reuses this rather than inventing a new loose-weight pricing field.
- Atomic-RPC discipline (cart total + payment + stock decrement in one transaction) is the established pattern from `process_payment`/`process_split_payment_atomic` — CHK-03 and D-04 both depend on preserving this discipline rather than a fresh ad-hoc write sequence.

### Integration Points
- The rebuilt `/pos` route needs a router entry (currently absent — Phase 1's D-07 removed it with no stub) and a Home dashboard tile (Phase 1's D-14 deliberately left no placeholder tile).
- Failed-scan audit logging (D-11) integrates with the existing `audit-log` entity/infrastructure noted as reusable-as-is in PROJECT.md.

</code_context>

<specifics>
## Specific Ideas

- WhatsApp receipt delivery: the user specifically wants this as an eventual option alongside print/email/skip — see Deferred Ideas.
- "Sale complete — $X.XX" style brief confirmation before clearing (D-15) — exact wording/duration is Claude's discretion.

</specifics>

<deferred>
## Deferred Ideas

- **WhatsApp receipt delivery** — the user wants to send receipts via WhatsApp in addition to print/email/skip. Not built in Phase 2: the only WhatsApp integration that existed in this codebase (Twilio/WhatsApp-style notifier) was tied to the waitlist feature and was fully removed in Phase 1 (`drop_waitlist` migration). Standing this back up is new third-party integration work (WhatsApp Business API/Twilio), not a small addition like the existing email-receipt path. Candidate for its own future phase/milestone, alongside the already-deferred v2 AI invoice intake work.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-Core Direct-Sale Checkout*
*Context gathered: 2026-08-11*
