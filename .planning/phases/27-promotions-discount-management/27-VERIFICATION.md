---
phase: 27-promotions-discount-management
verified: 2026-09-02T20:10:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 27: Promotions & Discount Management Verification Report

**Phase Goal:** Promotions/discounts scoped to product/category/subcategory, multiple qualifying
promotions resolved best-price-wins, expiry-proximity auto-trigger, live client-side discounted
price at scan time with `process_direct_sale_atomic` as sole server-side price authority, cashier
can apply an existing promotion at payment (no PIN) while an ad-hoc discount requires manager PIN,
every applied discount snapshotted per line item for refund/reopen/margin-report correctness, and a
floor guard preventing any below-cost combination.

**Verified:** 2026-09-02T20:10:00Z
**Status:** passed
**Re-verification:** No — initial verification (post-code-review-fix)

## Context: Post-Review Fix Verification

A code review (`27-REVIEW.md`, 2026-09-02) found 1 Critical + 5 Warning + 1 Info issue after all 7
plans completed. Three items were fixed afterward and are the primary focus of this verification
(not just the original plan work, which the SUMMARY.md files predate):

- **CR-01** (Critical — reopened-tab "Apply Promotion" selector could silently underpay and never
  close the tab): fixed in `e99af80`.
- **WR-01** (stale `discountScope` enum in edge function): fixed in `0ca508c`.
- **WR-05** (partial ad-hoc-discount-param NULL-propagation bypass in the RPC): fixed in `870705f`.

The remaining 3 Warnings (WR-02 hardcoded English toast, WR-03 silent no-op on invalid settings
input, WR-04 missing client-side date-range check) and 1 Info (IN-01 tie-break edge case) were
deliberately left unfixed as documented non-blocking UX/polish gaps. Verified below (see "Deferred
/ Accepted Non-Blocking Items") that none of them contradict a must-have truth from the plans.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A promotion can be scoped to a product, a category, or a subcategory (category row with `parentId`) | ✓ VERIFIED | `promotions` table has `product_id`/`category_id` columns (`supabase/migrations/20260901000001_promotions_schema.sql`); subcategories are just category rows with `parentId` set, no new scope type needed — `PromotionFormDialog.tsx` scope picker is `product`/`category` only, matching the "no new hierarchy" design |
| 2 | Multiple qualifying promotions on one line resolve best-price-wins, never merged/stacked (PROMO-04) | ✓ VERIFIED | `evaluateBestPromotion()` (TS, `promotion-pricing.ts`) + plpgsql mirror `ORDER BY amount DESC, p.created_at DESC LIMIT 1` in `process_direct_sale_atomic` (`20260901000002_...sql`); parity proven by `promotion-rpc.integration.test.ts` (passing) and live E2E `e2e/promotions/scope-overlap-resolution.spec.ts` (2 scenarios, both PASS against real DB) |
| 3 | An expiry-proximity condition type auto-triggers off `inventory.expiry_date` proximity, reusing the near-expiry threshold (PROMO-02) | ✓ VERIFIED | RPC reads `settings.near_expiry` (`thresholdDays`/`discountPercent`) with the same `<=` inclusive cutoff `useNearExpiryAlerts` uses; `NearExpirySettingsTab.discountPercent` field added in Plan 02; unit-tested in `promotion-pricing.test.ts` |
| 4 | A qualifying item shows its discounted price live at scan/add-to-cart, client display only (PROMO-03) | ✓ VERIFIED | `CheckoutPanel.tsx`'s `resolveUnitPrice()` calls `evaluateBestPromotion()` on every add-to-cart path (grid click, Peek relay, loose-weight, open-unit); live E2E `e2e/checkout/promotion-live-price.spec.ts` (2 scenarios) PASS |
| 5 | `process_direct_sale_atomic` remains sole price authority, recomputing promotions server-side rather than trusting the client | ✓ VERIFIED | RPC independently re-derives `v_line_discount` per item from `promotions`/`inventory.expiry_date`, compares against client `p_amount` with the existing 0.01 `AMOUNT_MISMATCH` tolerance; `e2e/promotions/promotion-deleted-mid-cart.spec.ts` PASS (server rejects stale client-discounted amount) |
| 6 | Cashier can apply an existing active promotion at payment with no manager PIN (PROMO-05) | ✓ VERIFIED | `PaymentForm.tsx` "Apply Promotion" `<Select>`, gated only on `activePromotionOptions.length > 0` and (post-CR-01-fix) `processors.processBankTransferPayment` presence — no PIN dialog; `e2e/payments/apply-promotion-and-custom-discount.spec.ts` scenario (a) PASS |
| 7 | An ad-hoc/custom discount requires manager PIN, mirroring the refund-PIN pattern (PROMO-05) | ✓ VERIFIED | `ManagerPinDialog(requiredAction='apply_custom_discount')` gates the discount toggle; RPC re-checks `role_permissions` server-side independent of client PIN UX; `e2e/payments/apply-promotion-and-custom-discount.spec.ts` scenario (b) PASS |
| 8 | Every applied promotion/discount is snapshotted per line item (promotion id, rate, amount) at sale time (PROMO-06) | ✓ VERIFIED | `order_items.promotion_id/discount_rate/discount_amount` columns + RPC insert (`20260901000002_...sql`); mapped into `OrderItem` domain type in `entities/tab/model/queries.ts:142-144`; historical badge rendered in `PaymentForm.tsx:748-758` |
| 9 | Refund/reopen restores the exact historical discount even if the promotion has since changed/been deleted (PROMO-06) | ✓ VERIFIED (behavior-dependent, test-exercised) | `e2e/payments/promotion-snapshot-refund-reopen.spec.ts` scenario (a): promotion deleted, reopened sale still shows historical discount — PASS live against real DB; scenario (b): refund reverses exact charged (already-discounted) amount — PASS |
| 10 | The margin report stays accurate against the discounted price, not list price (PROMO-06) | ✓ VERIFIED (behavior-dependent, test-exercised) | `get_product_sales_report`'s existing `unit_price - cost_price_snapshot` formula needed no code change since `unit_price` already stores the discounted line price; `e2e/payments/promotion-snapshot-refund-reopen.spec.ts` scenario (c) confirms this live — PASS |
| 11 | A floor guard prevents any combination of discounts from dropping the sale price below recorded cost (PROMO-07) | ✓ VERIFIED (behavior-dependent, test-exercised) | RPC: `IF v_line_price < COALESCE(v_cost_price, 0) AND NOT p_manager_override THEN RETURN BELOW_COST_REQUIRES_OVERRIDE`; `e2e/errors/promotion-floor-guard.spec.ts` PASS live (blocks without override, completes with manager PIN override) |
| 12 | A discount computed while offline is flagged for review on reconnect rather than silently re-priced (PROMO-08) | ✓ VERIFIED (behavior-dependent, test-exercised) | `cartStore.ts` `flagPriceConflict`/`resolveConflict`; `CheckoutPanel.tsx` disables Process Payment while `hasPriceConflict`; `e2e/infra/offline-promotion-conflict.spec.ts` PASS live |
| 13 | Automated E2E coverage proves scope-overlap, timezone boundary, deleted-mid-cart, loose-weight/open-unit interaction (PROMO-09) | ✓ VERIFIED | `e2e/promotions/` (4 spec files, 8 tests) all exist, enumerate, and PASS live against the dev server + remote Supabase (see Behavioral Spot-Checks) |
| 14 | CR-01 fix: the "Apply Promotion" selector on the reopened-tab payment path (`PaymentPane`) never silently underpays/leaves a tab open | ✓ VERIFIED (behavior-dependent, test-exercised) | Section now gated on `processors.processBankTransferPayment`, supplied only by `useCheckoutSale` (grep-confirmed: no other caller supplies it); regression test `PaymentForm.test.tsx` "CR-01: the section stays hidden on the reopened-tab payment path" — PASS (73/73 in `npx vitest run src/widgets/PaymentModal`) |
| 15 | WR-01 fix: edge function `discountScope` validation matches the retired `'all'`-only enum everywhere else | ✓ VERIFIED | `process-direct-sale/index.ts:33` now `z.enum(['all']).optional()`, matching `domain.ts`'s `DiscountScopeSchema` and the RPC's `INVALID_DISCOUNT_SCOPE` check |
| 16 | WR-05 fix: the RPC rejects a malformed/partial ad-hoc-discount param set instead of NULL-propagating past `AMOUNT_MISMATCH` | ✓ VERIFIED | `20260902000002_process_direct_sale_atomic_discount_param_validation.sql` adds `INVALID_DISCOUNT_PARAMS` all-or-nothing check; migration confirmed applied to remote (`npx supabase migration list` shows `20260902000002` local=remote) |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260901000001_promotions_schema.sql` | promotions table + RLS | ✓ VERIFIED | Applied to remote; `promotions` present in `supabase.types.ts` |
| `supabase/migrations/20260901000002_process_direct_sale_atomic_promotions.sql` | RPC promotion/floor-guard extension | ✓ VERIFIED | Applied to remote |
| `supabase/migrations/20260902000001_close_tab_accounts_for_adhoc_discount.sql` | close-tab accounting for ad-hoc discount | ✓ VERIFIED | Applied to remote |
| `supabase/migrations/20260902000002_process_direct_sale_atomic_discount_param_validation.sql` | WR-05 fix | ✓ VERIFIED | Applied to remote (post-review) |
| `src/entities/promotion/model/promotion-pricing.ts` | pure `evaluateBestPromotion()` | ✓ VERIFIED | 113 lines, wired into 9 files across cart/checkout/payment |
| `src/entities/promotion/model/queries.ts` | `usePromotions()` CRUD hooks | ✓ VERIFIED | 204 lines, used by PromotionsPage, CheckoutPanel, PaymentForm |
| `src/pages/promotions/index.tsx` + `src/app/promotions-route.tsx` | admin-only `/promotions` page | ✓ VERIFIED | Route gated on `manage_promotions`, registered in `router.tsx`, Home dashboard tile present |
| `src/features/manage-promotions/ui/PromotionFormDialog.tsx` | Create/Edit dialog | ✓ VERIFIED | 321 lines, product/category scope toggle, percent/fixed type, date range |
| `e2e/checkout/promotion-live-price.spec.ts`, `e2e/errors/promotion-floor-guard.spec.ts`, `e2e/payments/apply-promotion-and-custom-discount.spec.ts`, `e2e/payments/promotion-snapshot-refund-reopen.spec.ts`, `e2e/infra/offline-promotion-conflict.spec.ts`, `e2e/promotions/*.spec.ts` (4 files) | Full PROMO-01..09 E2E matrix | ✓ VERIFIED | All 10 spec files exist, 18 tests total, all PASS live (see Behavioral Spot-Checks) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `process_direct_sale_atomic` per-item loop | `promotions` + `inventory.expiry_date` | direct SQL read inside RPC | ✓ WIRED | Confirmed in migration source |
| `CheckoutPanel.tsx` add-to-cart paths | `evaluateBestPromotion()` | `resolveUnitPrice()` helper | ✓ WIRED | grep confirms 9 files import/use `evaluateBestPromotion` |
| `PaymentForm.tsx` "Apply Promotion" section | `useCheckoutSale`-only rendering | `processors.processBankTransferPayment` presence gate (CR-01 fix) | ✓ WIRED | Only `useCheckoutSale.ts` supplies this processor (grep-confirmed, 4 files total incl. tests); `PaymentPane.tsx` renders `<PaymentForm>` with no `processors` prop → falls back to default, section stays hidden (regression-tested) |
| `order_items.promotion_id/discount_rate/discount_amount` | reopened/paid-tab line-item display | `entities/tab/model/queries.ts` row mapper → `PaymentForm.tsx` historical badge | ✓ WIRED | Mapping present at `queries.ts:142-144`, rendered at `PaymentForm.tsx:748-758` |
| `cartStore.addItem/addWeightedItem` | reconnect conflict detection | `promotionId`/`discountSnapshotAt` → `flagPriceConflict`/`resolveConflict` → `CartItem.priceConflict` → Process Payment `disabled` | ✓ WIRED | Confirmed end to end via grep + `CheckoutPanel.tsx:289` disabled condition |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` | `tsc --noEmit` | exit 0 | ✓ PASS |
| `npm run lint` | `eslint src --max-warnings 0` | exit 0 (0 warnings, boundaries plugin info-only) | ✓ PASS |
| Full unit suite (run once) | `npm run test` | 143 test files / 1363 tests passed, 15 todo, 2 skipped | ✓ PASS |
| PaymentModal + promotion unit suite | `npx vitest run src/widgets/PaymentModal src/entities/promotion` | 4 files / 73 tests passed (incl. CR-01 regression test) | ✓ PASS |
| Promotion E2E test enumeration | `npx playwright test --list e2e/promotions/ e2e/checkout/promotion-live-price.spec.ts e2e/errors/promotion-floor-guard.spec.ts e2e/payments/apply-promotion-and-custom-discount.spec.ts e2e/payments/promotion-snapshot-refund-reopen.spec.ts e2e/infra/offline-promotion-conflict.spec.ts` | 18 tests found across 9 files | ✓ PASS |
| Promotion E2E full run against live dev server (`npm run dev`, port 1520) + remote Supabase | `npx playwright test e2e/promotions/ e2e/checkout/promotion-live-price.spec.ts e2e/errors/promotion-floor-guard.spec.ts e2e/payments/apply-promotion-and-custom-discount.spec.ts e2e/payments/promotion-snapshot-refund-reopen.spec.ts e2e/infra/offline-promotion-conflict.spec.ts` | 18 passed (1.5m) | ✓ PASS |
| Migrations applied to remote Supabase | `npx supabase migration list` | local == remote for `20260901000001`, `20260901000002`, `20260902000001`, `20260902000002` (WR-05 fix included) | ✓ PASS |

This satisfies the project's CLAUDE.md mandatory-automated-testing policy: no manual/human UAT step was used anywhere in this verification.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| PROMO-01 | 27-01, 27-02 | Scoped to product/category/subcategory, percent/fixed, active date range, admin-only `manage_promotions` RBAC | ✓ SATISFIED | Truths 1, 6 above; `rbac.ts:71` |
| PROMO-02 | 27-01, 27-02 | Expiry-proximity auto-trigger reusing near-expiry threshold | ✓ SATISFIED | Truth 3 above |
| PROMO-03 | 27-01, 27-03 | Live discounted price client-side; RPC remains sole server authority | ✓ SATISFIED | Truths 4, 5 above |
| PROMO-04 | 27-01 | Best-price-wins across multiple qualifying promotions | ✓ SATISFIED | Truth 2 above |
| PROMO-05 | 27-04 | Cashier applies promotion no-PIN; ad-hoc discount requires manager PIN; retired `pool_only`/`consumptions_only` | ✓ SATISFIED | Truths 6, 7, 15 above |
| PROMO-06 | 27-05 | Per-line snapshot; refund/reopen restores historical discount; margin report accurate | ✓ SATISFIED | Truths 8, 9, 10 above |
| PROMO-07 | 27-01, 27-04 | Floor guard blocks below-cost discount combinations | ✓ SATISFIED | Truth 11 above |
| PROMO-08 | 27-06 | Offline discount snapshot + reconnect conflict flag | ✓ SATISFIED | Truth 12 above |
| PROMO-09 | 27-07 | Full E2E scenario matrix | ✓ SATISFIED | Truth 13 above |

No orphaned requirements — all 9 PROMO IDs are claimed by at least one plan's `requirements` frontmatter and independently confirmed present in `.planning/REQUIREMENTS.md` traceability table (lines 358-366, all "Complete").

### Anti-Patterns Found

None. `grep` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|not yet implemented|coming soon` across every phase-touched file (entities/promotion, features/manage-promotions, pages/promotions, PaymentForm.tsx, cartStore.ts, CartItem.tsx, CheckoutPanel.tsx, WeightEntryDialog.tsx, all 4 promotions migrations, all promotion E2E specs) returned zero matches.

### Deferred / Accepted Non-Blocking Items (from 27-REVIEW.md)

These were explicitly left unfixed as documented non-blocking UX/polish gaps. Checked against every plan's must-have truths — none is contradicted:

| Item | File | Why non-blocking |
|---|---|---|
| WR-02 — hardcoded English toast on `/promotions` route guard | `src/app/promotions-route.tsx:13` | Cosmetic i18n gap on an admin-only route; `i18next/no-literal-string` lint is scoped to `shared/ui`/`entities`/`features`/`widgets`/`pages` — `app/` is out of that gate's scope, and `npm run lint` passes clean. No plan must-have asserts this toast is localized. |
| WR-03 — `NearExpirySettingsTab.save()` silent no-op on invalid input | `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx:25-29` | Confirmed present in code (both guards `return` with no toast). Plan 27-02's must-have only requires the new `discountPercent` field's save/error path to *mirror* the pre-existing `thresholdDays` field's pattern — it does, byte-for-byte (same silent-return shape), satisfying that truth even though the underlying UX gap (pre-existing on `thresholdDays`) persists. |
| WR-04 — `PromotionFormDialog` missing client-side `endsAt > startsAt` check | `src/features/manage-promotions/ui/PromotionFormDialog.tsx:106-151` | A malformed date range surfaces the DB `CHECK` violation via the existing generic `toast.error(result.error.message)` path — a save is still rejected (no bad row is ever persisted), just with a less polished message. No must-have truth requires client-side pre-validation of this specific field. |
| IN-01 — TS/SQL exact `created_at` tie-break mismatch | `promotion-pricing.ts` vs. RPC `ORDER BY` | Requires two promotions created within the same microsecond; does not affect discount math correctness, only which of two equal-amount promotions is recorded as the winner. No must-have truth asserts tie-break determinism beyond "most-recently-created wins" (which both sides implement; only the sub-microsecond tie has no secondary key). |

## Gaps Summary

None. All 16 observable truths (goal-level + the 3 post-review fixes) are verified against the
actual codebase, not just SUMMARY.md claims. The Critical finding (CR-01) and both correctness
Warnings (WR-01, WR-05) from `27-REVIEW.md` were independently re-verified in this pass — code
inspected, matching regression test found and run, and (for the SQL fixes) confirmed applied to the
remote Supabase project via `npx supabase migration list`. Full typecheck, lint, unit suite (once),
and all 18 promotion-specific E2E specs were run live against the dev server and remote database in
this verification session and all passed — no reliance on SUMMARY.md pass-claims.

---

_Verified: 2026-09-02T20:10:00Z_
_Verifier: Claude (gsd-verifier)_
