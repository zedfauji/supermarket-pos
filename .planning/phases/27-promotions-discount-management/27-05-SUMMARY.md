---
phase: 27-promotions-discount-management
plan: 05
subsystem: payments

tags: [react, react-testing-library, playwright, supabase, i18next]

requires:
  - phase: 27-promotions-discount-management
    provides: "Plan 01's promotion_id/discount_rate/discount_amount snapshot columns on order_items and the 18-param process_direct_sale_atomic that populates them"
  - phase: 27-promotions-discount-management
    provides: "Plan 04's payment-screen apply-promotion flow (PaymentForm.tsx) this plan's UI change and E2E flow through"
provides:
  - "mapOrderItemRow (entities/tab/model/queries.ts) now maps promotion_id/discount_rate/discount_amount into OrderItem — the read path every reopened/paid-tab view (PaymentForm via useTab/useTabs) relies on"
  - "groupOrderItems carries a summed discountAmount/first-non-null discountRate through the product+modifier merge"
  - "PaymentForm line-item list renders a historical 'X% off' / '-$Y off' indicator sourced from the stored snapshot, never a live evaluateBestPromotion re-derivation"
  - "e2e/payments/promotion-snapshot-refund-reopen.spec.ts — live proof that the snapshot survives promotion deletion, a full refund, and the existing margin report"
affects: [27-06, 27-07]

actuals:
  tokens: 6300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Reopened/paid-tab historical data (discount snapshot) is surfaced by extending the existing row-mapper (mapOrderItemRow) and the existing merge-aggregator (groupOrderItems), not by adding a parallel query path — mirrors how costPriceSnapshot's column already lived on the same OrderItem type."

key-files:
  created:
    - e2e/payments/promotion-snapshot-refund-reopen.spec.ts
  modified:
    - src/entities/tab/model/queries.ts
    - src/shared/lib/groupOrderItems.ts
    - src/shared/lib/groupOrderItems.test.ts
    - src/shared/lib/i18n/locales/en-US/wPanels.json
    - src/shared/lib/i18n/locales/es-MX/wPanels.json
    - src/widgets/PaymentModal/ui/PaymentForm.tsx
    - src/widgets/PaymentModal/PaymentModal.test.tsx

key-decisions:
  - "The plan's <read_first> pointed at 'wherever cost_price_snapshot is mapped alongside unit_price' as the target mapper to extend — that column turned out to be unmapped anywhere in the codebase (Zod-optional, unused by any query mapper). Used mapOrderItemRow (entities/tab/model/queries.ts) instead, identified by tracing PaymentForm's tab.items back through useTab/useTabs to the actual order_items row->OrderItem mapping function; this is the correct target regardless (it's what both useTabs and useTab — the single-tab fetch PaymentPane/PaymentForm use for a reopened tab — funnel through)."
  - "groupOrderItems (which PaymentForm's line-item list actually renders through, merging same product+modifier lines) needed its own discountAmount/discountRate fields added — without this the badge would compile against OrderItem but never render, since PaymentForm never iterates raw OrderItem[], only GroupedOrderItem[]. Summed discountAmount across merged lines, kept the first non-null discountRate (same promotion normally applies uniformly across matching lines)."

requirements-completed: [PROMO-06]

coverage:
  - id: D1
    description: "Historical discount badge on a reopened/paid tab's line-item list, sourced from stored order_items.discount_rate/discount_amount, never a live promotion re-evaluation"
    requirement: "PROMO-06"
    verification:
      - kind: unit
        ref: "src/widgets/PaymentModal/PaymentModal.test.tsx#historical line-item discount badge (Phase 27, PROMO-06) — both the positive and absent-snapshot cases"
        status: pass
      - kind: unit
        ref: "src/shared/lib/groupOrderItems.test.ts#carries a promotion discount snapshot through to the grouped row (PROMO-06), defaults, and sum-across-merged-lines cases"
        status: pass
      - kind: e2e
        ref: "e2e/payments/promotion-snapshot-refund-reopen.spec.ts#(a) a reopened sale still shows its historical discount after the promotion is deleted"
        status: pass
    human_judgment: false
  - id: D2
    description: "A full refund reverses the exact discounted amount actually charged, never a re-derived list-price amount"
    requirement: "PROMO-06"
    verification:
      - kind: e2e
        ref: "e2e/payments/promotion-snapshot-refund-reopen.spec.ts#(b) a full refund reverses the exact discounted amount charged, not a re-derived list-price amount"
        status: pass
    human_judgment: false
  - id: D3
    description: "get_product_sales_report's existing margin formula is automatically correct against the discounted unit_price vs cost_price_snapshot, with zero report-code changes"
    requirement: "PROMO-06"
    verification:
      - kind: e2e
        ref: "e2e/payments/promotion-snapshot-refund-reopen.spec.ts#(c) the product-sales margin report reflects the discounted unit price against cost_price_snapshot"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-02
status: complete
---

# Phase 27 Plan 5: Promotion Discount Snapshot Survival Summary

**Historical "X% off" indicator on reopened/paid-tab line items sourced from the stored order_items snapshot columns, plus a live E2E proof (checkout → delete the promotion → reopen → refund → margin report) that the snapshot survives all three unchanged.**

## Performance

- **Duration:** ~15 min (commit-to-commit)
- **Started:** 2026-09-02T15:07:15-06:00 (approx, prior plan's completion commit)
- **Completed:** 2026-09-02T15:22:28-06:00
- **Tasks:** 2
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- `mapOrderItemRow` (the row-mapper both `useTabs()` and `useTab(id)` funnel through) now maps `promotion_id`/`discount_rate`/`discount_amount` into `OrderItem`'s already-Zod-typed camelCase fields — no schema change needed, Plan 01 already added the fields.
- `groupOrderItems` (what PaymentForm's line-item list actually iterates, not raw `OrderItem[]`) carries `discountAmount` (summed across merged product+modifier lines) and `discountRate` (first non-null) through the merge.
- `PaymentForm`'s line-item list renders a small "X% off" / "-$Y off" indicator per line when `discountAmount > 0`, sourced entirely from the stored snapshot columns — verified to still render after the underlying promotion is deleted.
- `e2e/payments/promotion-snapshot-refund-reopen.spec.ts`: 3 tests proving PROMO-06 end to end against a real checkout/refund/reopen/report flow — (a) reopen after promotion deletion, (b) full refund reverses the discounted amount not list price, (c) margin report is correct against the discounted price with the existing RPC unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Historical discount badge on reopened/paid-tab line items** - `e51884e` (feat)
2. **Task 2: E2E proof of PROMO-06 (snapshot survives refund + reopen + margin)** - `eb1095c` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `src/entities/tab/model/queries.ts` - `mapOrderItemRow` maps the three promotion-snapshot columns
- `src/shared/lib/groupOrderItems.ts` - `GroupedOrderItem` carries `discountAmount`/`discountRate`
- `src/shared/lib/groupOrderItems.test.ts` - 3 new cases (carries snapshot, defaults when absent, sums across merged lines)
- `src/shared/lib/i18n/locales/{en-US,es-MX}/wPanels.json` - `lineItemDiscountRate`/`lineItemDiscountAmount` keys
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` - renders the badge per grouped line item
- `src/widgets/PaymentModal/PaymentModal.test.tsx` - 2 new cases (badge renders with a snapshot, absent without one)
- `e2e/payments/promotion-snapshot-refund-reopen.spec.ts` - the PROMO-06 E2E proof (new file)

## Decisions Made
- Targeted `mapOrderItemRow` rather than a `cost_price_snapshot`-adjacent mapper the plan's `<read_first>` implied would exist — that column is genuinely unmapped anywhere in the codebase today (Zod-optional, unused). `mapOrderItemRow` is the correct and only target: it's what both `useTabs()` (open-tab list) and `useTab(id)` (the single-tab fetch PaymentPane/PaymentForm use to view a reopened tab) map every `order_items` row through.
- Extended `groupOrderItems` (not just `OrderItemSchema`/the mapper) because PaymentForm's line-item list renders `GroupedOrderItem[]`, not raw `OrderItem[]` — the badge would have compiled but silently never rendered without this.
- E2E spec structured as 3 independent tests (not one long chained scenario) because reopening a sale voids its original payment (`payments.status = 'reopened_void'`), which would make a subsequent refund on "that same sale" impossible to express in the UI — each test seeds its own product/promotion/sale so (a) reopen, (b) refund, and (c) margin report are each provable in isolation without an artificial ordering constraint the app itself doesn't support.

## Deviations from Plan

None — plan executed as written, aside from the mapper-location correction noted above (not a deviation from the *task*, since the actual target mapper — `mapOrderItemRow` — is exactly the function the task's phrasing pointed at ("the mapper that maps unit_price for order_items"); only the specific `cost_price_snapshot` cross-reference used to locate it was inaccurate).

## Issues Encountered
- First E2E run of test (b) failed on a Playwright strict-mode violation (`getByText('30.00')` matched both the item's unit price and the refund total, which coincide for a single-item full refund). Fixed by scoping the locator to the item's own row div (`div.rounded-lg.border.p-3`) instead of the whole refund dialog. Re-ran green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PROMO-06 is fully proven; Plans 06/07 (remaining phase 27 plans) are unaffected by and do not depend on this plan's UI change.
- No blockers.

---
*Phase: 27-promotions-discount-management*
*Completed: 2026-09-02*

## Self-Check: PASSED

All files listed under `key-files` verified present on disk; both task commit hashes (`e51884e`, `eb1095c`) verified present in `git log`.
