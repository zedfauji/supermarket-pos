---
phase: 03-supplier-receiving-expiry-tracking
plan: 02
subsystem: inventory
tags: [react, tanstack-query, settings, expiry]
requires:
  - phase: 03-supplier-receiving-expiry-tracking
    provides: inventory.expiry_date
provides:
  - Configurable near-expiry query and advisory signals
affects: [inventory, dashboard, checkout, settings]
tech-stack:
  added: []
  patterns: [existing low-stock query and badge pattern, settings-table persistence]
key-files:
  created: [src/entities/inventory/ui/NearExpiryBadge.tsx, src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx]
  modified: [src/entities/inventory/model/queries.ts, src/widgets/InventoryPagePanel.tsx, src/entities/tab/ui/CartItem.tsx]
key-decisions:
  - "Near-expiry threshold is stored in the existing settings table with a default of 14 days."
  - "Near-expiry stays advisory amber and reuses one query across all surfaces."
actuals:
  tokens: 12800
  tasks: 2
  commits: 3
duration: 28min
completed: 2026-08-14
status: complete
---

# Phase 03 Plan 02: Near-Expiry Alerts Summary

**Configurable 14-day near-expiry alerts surfaced in inventory, dashboard, and checkout.**

## Accomplishments

- Added validated `near_expiry` settings and an admin-only threshold form without expanding the manager RLS allowlist.
- Added one cached expiry query, amber badge, inventory tab/empty state, dashboard count, cart-line signal, and toast.

## Task Commits

1. **Task 1: Near-expiry query and settings** — `d58ed5e`
2. **Task 2: Surface near-expiry alerts** — `5fd9763`
3. **Verification test update** — `ecbc42e`

## Verification

- Passed: `npm run typecheck`
- Passed: `npm run lint`
- Blocked: `npx playwright test e2e/54-near-expiry-alerts.spec.ts` reaches the new settings UI but fails on the pre-existing full-page-reload session restoration path; test evidence is retained in `e2e-results/` (ignored output).

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking issue] Used the generated-type compatibility cast for `inventory.expiry_date`.**
- **Found during:** Task 1
- **Issue:** Supabase generated types have not yet incorporated Plan 03-01's migration column.
- **Fix:** Kept the query type-safe at the domain boundary while casting the ungenerated select row.
- **Files modified:** `src/entities/inventory/model/queries.ts`

## Known Stubs

None.

## Self-Check: PASSED

- Task commits `d58ed5e` and `5fd9763` exist.
- Near-expiry query, badge, settings tab, and three display surfaces exist.
