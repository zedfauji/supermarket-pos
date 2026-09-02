---
phase: 27-promotions-discount-management
reviewed: 2026-09-02T00:00:00Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - e2e/checkout/atomic-rpc-guards.spec.ts
  - e2e/checkout/peek-window.spec.ts
  - e2e/checkout/promotion-live-price.spec.ts
  - e2e/errors/promotion-floor-guard.spec.ts
  - e2e/infra/offline-promotion-conflict.spec.ts
  - e2e/payments/apply-promotion-and-custom-discount.spec.ts
  - e2e/payments/edge-cases.spec.ts
  - e2e/payments/promotion-snapshot-refund-reopen.spec.ts
  - e2e/promotions/loose-weight-open-unit-interaction.spec.ts
  - e2e/promotions/promotion-deleted-mid-cart.spec.ts
  - e2e/promotions/scope-overlap-resolution.spec.ts
  - e2e/promotions/timezone-boundary.spec.ts
  - e2e/rbac/rbac.spec.ts
  - e2e/reports/discount-and-revenue.spec.ts
  - src/app/promotions-route.tsx
  - src/app/router.tsx
  - src/entities/promotion/index.ts
  - src/entities/promotion/model/promotion-pricing.test.ts
  - src/entities/promotion/model/promotion-pricing.ts
  - src/entities/promotion/model/promotion-rpc.integration.test.ts
  - src/entities/promotion/model/queries.ts
  - src/entities/promotion/model/types.ts
  - src/entities/settings/model/queries.ts
  - src/entities/tab/model/cartStore.test.ts
  - src/entities/tab/model/cartStore.ts
  - src/entities/tab/model/queries.ts
  - src/entities/tab/ui/CartItem.test.tsx
  - src/entities/tab/ui/CartItem.tsx
  - src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx
  - src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx
  - src/features/checkout-sale/model/useCheckoutSale.test.ts
  - src/features/checkout-sale/model/useCheckoutSale.ts
  - src/features/manage-promotions/index.ts
  - src/features/manage-promotions/model/useMutationSavePromotion.ts
  - src/features/manage-promotions/ui/PromotionFormDialog.test.tsx
  - src/features/manage-promotions/ui/PromotionFormDialog.tsx
  - src/pages/promotions/index.tsx
  - src/shared/lib/audit-actions.ts
  - src/shared/lib/domain-helpers.test.ts
  - src/shared/lib/domain-helpers.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/groupOrderItems.test.ts
  - src/shared/lib/groupOrderItems.ts
  - src/shared/lib/i18n/locales/en-US/entities.json
  - src/shared/lib/i18n/locales/en-US/featOrders.json
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/entities.json
  - src/shared/lib/i18n/locales/es-MX/featOrders.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/shared/lib/payment-processor.ts
  - src/shared/lib/rbac.test.ts
  - src/shared/lib/rbac.ts
  - src/shared/lib/supabase.types.ts
  - src/shared/ui/StatusBadge.tsx
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
  - src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx
  - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
  - src/widgets/PaymentModal/PaymentModal.test.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.test.tsx
  - src/widgets/PaymentModal/ui/PaymentForm.tsx
  - src/widgets/ProductGrid/ui/ProductGrid.tsx
  - src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.test.tsx
  - src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx
  - supabase/functions/process-direct-sale/index.ts
  - supabase/migrations/20260901000001_promotions_schema.sql
  - supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql
  - supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-09-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

Reviewed the promotions/discount-management phase: the pure best-price-wins pricing function and its plpgsql mirror in `process_direct_sale_atomic`, the promotions CRUD schema/RLS/audit trigger, the cart-store promotion-snapshot/reconnect-conflict machinery, and the payment UI (`PaymentForm`'s new "Apply Promotion" selector and manager-PIN-gated ad-hoc discount).

The core direct-sale path (`CheckoutPanel` → `useCheckoutSale` → `process_direct_sale_atomic`) is solid: the client always submits the undiscounted catalog price, the RPC is the sole price authority, the floor guard and manager-override role re-check are correctly enforced server-side, and `evaluateBestPromotion()`'s TS implementation matches its plpgsql mirror (confirmed by both the property-based unit tests and the RPC integration test's parity assertion).

However, `PaymentForm`'s new "Apply Promotion" selector is also reachable from the **reopened-tab payment path** (`PaymentPane`, which uses the generic `process_payment_atomic`/`process_split_payment_atomic` RPCs, not `process_direct_sale_atomic`). On that path the promotion-derived price reduction is applied to the charged amount but never recorded anywhere the "fully covered" close-tab check reads from — this silently leaves the tab open with an under-recorded payment while the UI reports success (see CR-01). Several smaller consistency/UX gaps are also noted below.

## Critical Issues

### CR-01: "Apply Promotion" selector silently underpays and never closes a reopened tab

**File:** `src/widgets/PaymentModal/ui/PaymentForm.tsx:304-327` (effectiveItems), `:417-427` and `:570-580` (discountInfoArg), used by `src/widgets/PaymentPane/ui/PaymentPane.tsx:322-327`
**Issue:**
`PaymentForm`'s "Apply Promotion" section (added this phase, gated only on `activePromotionOptions.length > 0`, `PaymentForm.tsx:764`) is rendered for *any* tab paid through `PaymentForm`, not just the synthetic direct-sale tab. `PaymentPane.tsx:322-327` renders `<PaymentForm tab={selectedTab} ... />` with **no `processors` prop**, so it falls back to `defaultProcessors` (`payment-processor.ts`'s `processCashPayment`/`processCardPayment`/`processSplitPayment`), which call the generic `process_payment_atomic`/`process_split_payment_atomic` RPCs — used for reopened tabs (`ReopenTabButton`/`EditItemsButton` in `PaymentPane.tsx` confirm `PaymentForm` is used against a real, already-`open`, already-has-`order_items` tab, not a synthetic one).

When a cashier selects a promotion from this dropdown, `effectiveItems` (`PaymentForm.tsx:304-327`) recomputes discounted `unitPrice` per matching line and `itemsSubtotal`/`subtotalWithTax` (the amount actually charged) drops accordingly. But the only channel that reaches the server is `discountInfoArg`, which is built purely from the **ad-hoc discount fields** (`discountType`/`discountValue`, from the separate PIN-gated "Discount" toggle):

```ts
const discountInfoArg =
  discountAmount > 0 || effectiveManagerOverride
    ? { scope: 'all' as const, type: discountType, value: discountValue, amount: discountAmount, managerOverride: effectiveManagerOverride }
    : undefined;
```

If the cashier only uses "Apply Promotion" (the whole point of the feature — it explicitly requires **no** PIN dialog per its own test, `PaymentForm.test.tsx:989-991`) and never touches the ad-hoc-discount toggle, `discountValue` stays `0`, `calculateDiscountAmount(...)` returns `0`, and `discountInfoArg` is `undefined` — **no discount is sent to the RPC at all**, even though a reduced `p_amount` is.

Server-side, `process_payment_atomic`/`process_split_payment_atomic` (`20260902000001_close_tab_accounts_for_adhoc_discount.sql:171-217`) decide whether to close the tab by comparing `v_paid_line + v_discount_recorded` (SUM of `payments.amount` + SUM of `payments.discount_amount`) against `v_owed` (SUM of `order_items.unit_price * quantity`, the tab's original, undiscounted stored price — never touched by this client-side promotion selection). Since the promotion reduction was folded into `p_amount` but never recorded in `payments.discount_amount`, `v_paid_line + v_discount_recorded` will be short by exactly the promotion amount, so the tab is left `status = 'open'` forever (the "partial payment" branch silently runs). The RPC still returns `ok: true` unconditionally after that branch, so `PaymentForm` shows a successful receipt and the cashier has no indication the sale didn't actually close — the tab quietly reappears as still-open/underpaid.

This is untested: `PaymentForm.test.tsx:958-1025` ("Apply Promotion selector") only asserts the displayed `total-row` text, never the RPC call args or the resulting tab status.

**Fix:** Fold the "Apply Promotion" line-price reduction into the same `discountAmount`/`discountInfoArg` channel the ad-hoc discount uses (e.g. compute `promotionDiscountTotal = baseSubtotal - itemsSubtotal-before-promotion` and add it to `discountAmount`, or add a dedicated `p_discount_amount` component), so `payments.discount_amount` always reflects the *total* gap between `order_items`' stored price and what was actually charged — or, simpler and safer given `process_payment_atomic` has no per-line promotion-recompute capability at all, restrict the "Apply Promotion" section to the CheckoutPanel/direct-sale context only (mirror `processors.processBankTransferPayment`'s presence-gating pattern) until the generic RPC path can account for it:

```tsx
{method !== 'rappi' && processors.processBankTransferPayment && activePromotionOptions.length > 0 && (
  <section data-testid="apply-promotion-section"> ... </section>
)}
```

## Warnings

### WR-01: Edge function still validates retired `discountScope` enum values

**File:** `supabase/functions/process-direct-sale/index.ts:33`
**Issue:** `BodySchema.discountScope` is `z.enum(['all', 'pool_only', 'consumptions_only'])`, but Phase 27 retired `pool_only`/`consumptions_only` everywhere else — `src/shared/lib/domain.ts:151` (`DiscountScopeSchema = z.enum(['all'])`), `src/shared/lib/edge-function-contracts.ts` (reuses `DiscountScopeSchema`), and `process_direct_sale_atomic` itself (`20260901000002_...sql:140-142`, `INVALID_DISCOUNT_SCOPE` if not `'all'`). A direct caller sending `pool_only` passes this Deno Zod schema only to be rejected two layers deeper by the RPC with a different error code/shape than the clean `VALIDATION_ERROR` a bad enum value should produce at the edge boundary — dead/stale validation that has drifted from the rest of the phase's schema.
**Fix:**
```ts
discountScope: z.enum(['all']).optional(),
```

### WR-02: Hardcoded, non-localized toast on the promotions route guard

**File:** `src/app/promotions-route.tsx:13`
**Issue:** `toast.error('This page is restricted to admins.')` is a raw English string in an app whose default locale is es-MX (`react-i18next`, `i18next/no-literal-string` enforced elsewhere in the codebase). It's also inconsistent with the sibling route guard `src/app/rbac-route.tsx`, which silently `<Navigate>`s with no toast at all — a Spanish-locale admin/cashier hitting `/promotions` without `manage_promotions` sees an English error no other route guard produces.
**Fix:** Either drop the toast to match `RbacRoute`'s pattern, or route it through `i18n.t(...)` with an es-MX/en-US key pair like the rest of the app's user-facing copy.

### WR-03: `NearExpirySettingsTab.save()` fails silently on invalid input

**File:** `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx:25-29`
**Issue:**
```ts
const save = async () => {
  const value = Number(thresholdDays);
  if (!Number.isInteger(value) || value < 1 || value > 365) return;
  const discountValue = Number(discountPercent);
  if (Number.isNaN(discountValue) || discountValue < 0 || discountValue > 100) return;
  ...
```
Both guards `return` with no toast/inline error, so a manager who types e.g. `400` into the threshold field and clicks Save gets zero feedback — the button stays enabled (`disabled={!dirty || ...}`, and `dirty` is still `true`), nothing happens, and there's no visual cue why.
**Fix:** Surface a `toast.error(...)` or inline field error (mirroring `PromotionFormDialog`'s `nameError`/`targetError`/`valueError` pattern already used elsewhere in this same phase) before the early return.

### WR-04: `PromotionFormDialog` has no client-side `endsAt > startsAt` validation

**File:** `src/features/manage-promotions/ui/PromotionFormDialog.tsx:106-151`
**Issue:** `promotions.ends_at` has a DB `CHECK (ends_at > starts_at)` (`20260901000001_promotions_schema.sql:40`), but `handleSave()` never checks `toStr >= fromStr` before submitting. Picking an end date before/equal to the start date produces a generic Postgres constraint-violation message surfaced via `toast.error(result.error.message)` instead of the same kind of clear, field-level validation the form already does for name/target/discount value.
**Fix:** Add a check alongside the existing `nameError`/`targetError`/`valueError` validations, e.g. `if (endOfDay(toStr) <= startOfDay(fromStr)) { setDateError(...); hasError = true; }`.

### WR-05: `process_direct_sale_atomic` doesn't require discount fields to be supplied together

**File:** `supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql:135-143, 280-287`
**Issue:** The "ad-hoc discount requires manager" gate only checks that *at least one* of `p_discount_scope`/`p_discount_type`/`p_discount_value`/`p_discount_amount` is non-null before requiring `p_manager_override`; it never verifies all four are present together. If a caller supplies `p_discount_scope='all'` with `p_discount_value` NULL (e.g. a malformed direct RPC/edge call bypassing the normal UI, which always sends the four fields as one group — see `useCheckoutSale.ts:133-141`), `v_adhoc_discount := ROUND(LEAST(CASE ... ELSE p_discount_value END, v_subtotal), 2)` evaluates to `NULL`, which propagates through `v_subtotal`/`v_derived_total`. Because a plpgsql `IF NULL THEN` branch is treated as false (not an error), the subsequent `AMOUNT_MISMATCH` guard (`p_amount IS NULL OR abs(p_amount - v_derived_total) > 0.01`) is silently skipped instead of rejecting the malformed request, and the RPC proceeds with a NULL-derived total. This requires an already-authorized manager+ caller to trigger and doesn't corrupt `order_items` (those are computed independently earlier in the function), but it is a defense-in-depth gap around a money-path guard that's supposed to be authoritative.
**Fix:** Require all four discount fields together, e.g. `IF (p_discount_scope IS NOT NULL) <> (p_discount_type IS NOT NULL AND p_discount_value IS NOT NULL) THEN RETURN ... 'INVALID_DISCOUNT_PARAMS' ...`.

## Info

### IN-01: TS/SQL exact-tie parity edge case when two promotions share `created_at`

**File:** `src/entities/promotion/model/promotion-pricing.ts:71-79` vs. `supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql:203`
**Issue:** The TS tie-break (`amount === bestPromoAmount && bestPromoCreatedAt !== null && createdAt > bestPromoCreatedAt`) is strict-greater-than, so on an exact `created_at` tie between two candidates it deterministically keeps whichever appears first in the `activePromotions` array. The SQL side (`ORDER BY amount DESC, p.created_at DESC LIMIT 1`) has no secondary tiebreaker (e.g. `id`) either, so on the same exact-timestamp tie Postgres's choice is not guaranteed to match the TS array-order-dependent choice, and neither is stable/documented for that specific case. Extremely unlikely in practice (two promotions created within the same microsecond), and doesn't affect correctness of the discount math — noted for completeness of the "TS/plpgsql mirror" parity claim in `promotion-pricing.ts`'s file header.
**Fix:** Not urgent; if ever hardened, add `id` as a final tiebreaker on both sides for a fully deterministic, matching order.

---

_Reviewed: 2026-09-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
