---
phase: 04-reports-hardening
plan: 05
subsystem: reports
tags: [supabase, reports, playwright, vitest, gap-closure]
requires:
  - phase: 04-04
    provides: Retained report-tab regression coverage minus removed Tips/Modifier Popularity tabs
provides:
  - Byte-correct Product Sales margin for weighted (loose-weight) products
  - Staff Performance revenue/void aggregation reading real order_items/orders columns
  - Fully green retained Reports E2E suite (26/26)
affects: [reports, staff-performance, product-sales]
actuals:
  tokens: 2645
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns:
    - "Historical cost aggregation applies the same weight_grams/1000 factor checkout applies to price"
    - "Staff/order aggregation queries join order_items to orders!inner(...) instead of selecting nonexistent order_items columns, mirroring useProductSalesReport's existing join shape"
key-files:
  created: []
  modified:
    - src/entities/tab/model/queries-reports.ts
    - src/entities/tab/model/product-sales-report.integration.test.ts
    - src/entities/staff/model/queries.ts
    - src/entities/staff/model/queries.staff-report.test.ts
    - e2e/07-reports.spec.ts
key-decisions:
  - "Applied weightFactor (weight_grams/1000, default 1) to the cost side only of useProductSalesReport's margin aggregation — revenue/unit_price was already correctly weight-adjusted at checkout time, so only costTotal needed the fix."
  - "useStaffMetrics's fetchOrderItemsInRange now selects quantity, unit_price, orders!inner(staff_id, status, tab_id) instead of 4 columns that never existed on order_items — root-caused a live 400 that StaffSalesPanel silently swallowed into an always-empty report."
  - "Fixed a 5th latent e2e bug beyond the plan's named 4 locators: 'shows empty state for year 2020 date range' assumed Staff Performance always renders EmptyState for a no-activity range, but useStaffMetrics seeds a zero-metric row for every active profile regardless of date range — once the query actually succeeds (Task 2's fix), the table legitimately renders populated all-$0.00 rows instead of EmptyState. Test now branches on hasRows like its sibling tests, accepting either EmptyState or an all-zero-revenue table as proof of no activity (Rule 1 — bug in a test assertion whose premise no longer held after the production fix)."
requirements-completed: [REP-02]
coverage:
  - id: D1
    description: Product Sales margin applies the checkout weight factor to historical cost for weighted/loose products.
    requirement: REP-02
    verification:
      - kind: unit
        ref: 'npx vitest run src/entities/tab/model/product-sales-report.integration.test.ts'
        status: pass
    human_judgment: false
  - id: D2
    description: Staff Performance revenue/void aggregation reads real order_items/orders columns instead of nonexistent ones.
    requirement: REP-02
    verification:
      - kind: unit
        ref: 'npx vitest run src/entities/staff/model/queries.staff-report.test.ts'
        status: pass
    human_judgment: false
  - id: D3
    description: The retained Reports E2E suite (excluding the documented pool-tables bartender-initiated test) is fully green.
    requirement: REP-02
    verification:
      - kind: e2e
        ref: 'npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0'
        status: pass
    human_judgment: false
status: complete
---

# Phase 4 Plan 5: Reports Hardening Gap Closure Summary

Closed the 2 remaining BLOCKER gaps from 04-VERIFICATION.md's re-verification: Product Sales margin now applies the checkout weight factor to historical cost for weighted/loose-weight products, and the retained `e2e/07-reports.spec.ts` suite is fully green (26/26, up from 22/26) after fixing a root-cause `order_items` column bug in `useStaffMetrics` and disambiguating 4 (plus 1 discovered) locator/assertion bugs.

## What Was Built

**Task 1 — Weighted margin cost fix.** `useProductSalesReport` now selects `weight_grams` alongside `cost_price_snapshot` and applies a `weightFactor` (`weight_grams / 1000`, defaulting to 1 for non-weighted lines) to the cost side of the aggregation only — `unit_price`/`revenue` were already correctly weight-adjusted at checkout time by `process_direct_sale_atomic`. A new live-DB regression test seeds a 500g weighted beer line (`unit_price: 5, cost_price_snapshot: 4`) on top of the existing AC-5 fixture and asserts `revenue=55, costTotal=10, margin=15` — distinguishing the fixed value from the buggy `costTotal=12` a full-unit-cost calculation would have produced.

**Task 2 — Root-cause fix for 3 of 4 Staff Performance e2e failures.** `useStaffMetrics`'s `fetchOrderItemsInRange` was selecting `order_items.created_by, price, tab_id, is_voided` — none of which exist on that table (confirmed against `supabase.types.ts`) — producing a live `400 Bad Request` on every real run, silently swallowed into `rows = []` by `StaffSalesPanel`. The query now selects `quantity, unit_price, orders!inner(staff_id, status, tab_id)`, mirroring the join pattern `useProductSalesReport` already uses. The aggregation loop reads `item.orders?.staff_id`, `item.orders?.status === 'voided'`, `item.unit_price`, and `item.orders?.tab_id` in place of the old flat fields. All 5 existing unit tests' fixtures were updated to the corrected nested shape with unchanged expected outputs.

**Task 3 — Locator disambiguation + full-suite verification.** Widened 4 ambiguous `getByText(/no voids or refunds/i)` / `getByText(/no staff activity/i)` locators to their longer paragraph-only phrasing (mirroring the existing line-452 precedent), since both regexes matched the `EmptyState`'s `<h3>` heading and `<p>` description, a Playwright strict-mode violation. Running the full retained suite after Tasks 1+2 exposed a 5th latent bug beyond the plan's named 4: "Staff Performance tab shows empty state for year 2020 date range" assumed the report always renders `EmptyState` for a no-activity range. Once Task 2's fix made the query actually succeed, `useStaffMetrics`'s profile-seeded aggregation map legitimately renders a populated table (one zero-metric row per active profile) instead of `EmptyState` for that range — this is correct production behavior (matches the pre-existing S10-01.3 unit test: "active staff with no items appear with zero metrics"), so the test's premise, not the app, was wrong. Fixed by branching on `hasRows` like its sibling tests: if rows are present, assert every row's revenue cell reads `$0.00` (proving no real activity, not fake data); otherwise assert the `EmptyState`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a 5th e2e assertion whose premise the production fix invalidated**
- **Found during:** Task 3, after running the full retained suite following Tasks 1+2
- **Issue:** "Sprint 10: Staff Performance tab shows empty state for year 2020 date range" unconditionally asserted `EmptyState` text, which only held previously because the broken query (Task 2's bug) always returned an error, forcing `rows = []`. With the query fixed, active staff profiles always seed a zero-metric row regardless of date range, so the table legitimately renders (with all-$0.00 rows) instead of showing `EmptyState`.
- **Fix:** Branch on `hasRows` (same pattern as the 3 sibling tests in this file); when rows are present, assert every visible row's Revenue column reads `$0.00`, proving no real staff activity occurred in the range.
- **Files modified:** `e2e/07-reports.spec.ts`
- **Commit:** `81079f9`

None of the other auto-fix rules (2, 3, 4) applied — no missing critical functionality, no blocking issues beyond the above, no architectural changes were needed.

## Verification

- `npx vitest run src/entities/tab/model/product-sales-report.integration.test.ts` — 6/6 passed (new weighted-line test included).
- `npx vitest run src/entities/staff/model/queries.staff-report.test.ts` — 6/6 passed (corrected fixtures).
- `npx playwright test e2e/07-reports.spec.ts --grep-invert "bartender-initiated" --retries=0` — 26/26 passed (up from 22/26 recorded in 04-04-SUMMARY.md).
- `npm run typecheck` — passed, no new errors.
- `npx eslint` on all 5 touched files — 0 new errors (the 30 pre-existing `e2e/07-reports.spec.ts` lint errors were confirmed unchanged before/after this plan's edits via `git stash` diff, all in unrelated lines 40-180; out of this plan's scope per the deviation-rules scope boundary).

## Known Stubs

None — no stubs introduced.

## Threat Flags

None — both threats in this plan's `<threat_model>` (T-04-09, T-04-10) were internal reporting-correctness fixes to already-authorized manager/admin-only report surfaces; no new attack surface was introduced.

## Self-Check: PASSED

- FOUND: `/mnt/ai/POS/supermarket-pos/src/entities/tab/model/queries-reports.ts`
- FOUND: `/mnt/ai/POS/supermarket-pos/src/entities/tab/model/product-sales-report.integration.test.ts`
- FOUND: `/mnt/ai/POS/supermarket-pos/src/entities/staff/model/queries.ts`
- FOUND: `/mnt/ai/POS/supermarket-pos/src/entities/staff/model/queries.staff-report.test.ts`
- FOUND: `/mnt/ai/POS/supermarket-pos/e2e/07-reports.spec.ts`
- FOUND commit `7d08ddf` (Task 1)
- FOUND commit `f674c23` (Task 2)
- FOUND commit `81079f9` (Task 3)
