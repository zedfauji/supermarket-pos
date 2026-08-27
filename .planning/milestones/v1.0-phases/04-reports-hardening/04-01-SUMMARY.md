---
phase: 04-reports-hardening
plan: 01
subsystem: reports-ui-and-database
tags: [react, typescript, supabase, postgres, vitest, playwright]
requires:
  - phase: 02-core-direct-sale-checkout
    provides: retained checkout and Caja flows covered by regression tests
  - phase: 03-supplier-receiving-expiry-tracking
    provides: retained product-report coverage
provides:
  - Reports UI reduced to supermarket-relevant tabs
  - Obsolete modifier popularity RPC removed from the live local database
affects: [04-reports-hardening, reports, export-report]
actuals:
  tokens: 16893
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - Full-stack report removal deletes UI, query, schema, exports, translations, tests, generated RPC types, and database function together.
key-files:
  created:
    - supabase/migrations/20260818000001_drop_modifier_popularity_report_rpc.sql
  modified:
    - src/pages/reports/index.tsx
    - src/entities/staff/model/queries.ts
    - src/features/export-report/model/useExportReport.ts
    - src/shared/lib/domain.ts
key-decisions:
  - Removed direct test and generated Supabase-type consumers discovered by the required zero-reference scan.
  - Preserved fetchActiveProfiles and useStaffMetrics while removing only Tips-specific query plumbing.
requirements-completed: [REP-02]
coverage:
  - id: D1
    description: Modifier Popularity is removed from the Reports UI, export path, client schema, and live database.
    requirement: REP-02
    verification:
      - kind: unit
        ref: npm run typecheck && npx vitest run src/features/export-report/ui/ExportButtons.test.tsx src/entities/staff/model/queries.staff-report.test.ts
        status: pass
      - kind: other
        ref: docker pg_proc query for get_modifier_popularity_report
        status: pass
    human_judgment: false
  - id: D2
    description: Tips is removed without breaking retained Caja, Staff, and report flows.
    requirement: REP-02
    verification:
      - kind: e2e
        ref: npx playwright test e2e/02-caja.spec.ts e2e/22-staff-management.spec.ts e2e/07-reports.spec.ts e2e/19-product-sales-report.spec.ts e2e/37-analytics-reports.spec.ts
        status: pass
      - kind: unit
        ref: npm run typecheck && npm run lint && npx vitest run src/entities/staff/model/queries.staff-report.test.ts src/features/export-report/ui/ExportButtons.test.tsx
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-08-15
status: complete
---

# Phase 04 Plan 01: Remove obsolete Tips and Modifier Popularity reports Summary

**Removed the restaurant-specific Tips and Modifier Popularity report stacks, including exports, translations, client schemas, tests, and the authenticated modifier RPC.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-15T05:30:00Z
- **Completed:** 2026-08-15T05:39:08Z
- **Tasks:** 2/2
- **Files modified:** 27

## Accomplishments

- Removed both tabs and their content from Reports, leaving the 10 retained supermarket report tabs across Sales, Staff, and Operations.
- Removed both reports' hooks, Zod schemas, generic export plumbing, translations, and tests without touching Staff Sales' shared active-profile query.
- Dropped `get_modifier_popularity_report(timestamptz, timestamptz)` from the local Supabase database and registered the drop migration.

## Task Commits

1. **Task 1: Delete Modifier Popularity end-to-end** — `487c92b` (feat)
2. **Task 2: Delete Tips end-to-end** — `88d2bcd` (feat)

## Files Created/Modified

- `src/pages/reports/index.tsx` — removes both obsolete report triggers, content blocks, and the empty Menu & Promos group.
- `src/entities/staff/model/queries.ts` — preserves Staff Metrics while deleting the Tips-only query path.
- `src/features/export-report/` — removes report-type branches and test fixtures for both removed reports.
- `src/shared/lib/domain.ts` and exporters — removes dead report schemas and Excel/PDF serializers.
- `supabase/migrations/20260818000001_drop_modifier_popularity_report_rpc.sql` — drops the unused RPC and reloads PostgREST schema metadata.

## Decisions Made

- Removed `domain.test.ts` and generated `supabase.types.ts` Modifier Popularity consumers found by the zero-reference scan; they are direct remnants of the deleted report.
- Removed `fetchPaymentsWithTipsInRange` after confirming `useStaffTips` was its sole caller; `fetchActiveProfiles` remains for `useStaffMetrics`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Removed direct schema-test and generated-type consumers**
- **Found during:** Task 1
- **Issue:** `ModifierPopularityRow` still had direct consumers outside the initial task file list, preventing complete removal.
- **Fix:** Deleted the orphaned schema test and generated RPC declaration.
- **Files modified:** `src/shared/lib/domain.test.ts`, `src/shared/lib/supabase.types.ts`
- **Verification:** Typecheck and zero-reference scan passed.
- **Committed in:** `487c92b`

**2. [Rule 3 - Blocking issue] Applied the migration through Docker stdin**
- **Found during:** Task 1
- **Issue:** The initial container invocation registered the migration but did not stream its SQL, leaving the RPC live.
- **Fix:** Applied the planned SQL through `docker exec -i ... psql`; the `pg_proc` query returned zero rows.
- **Verification:** Live database function lookup passed.
- **Committed in:** `487c92b`

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 3). No scope creep.

## Issues Encountered

- The required Playwright suites passed headlessly. Existing updater and initial Caja lookup console warnings remained non-failing and unrelated to these deletions.
- `STATE.md` already contained uncommitted Phase 04 transition edits before execution. Its required plan-progress updates were applied in the working tree but are intentionally excluded from this metadata commit to preserve those pre-existing changes.

## User Setup Required

None.

## Next Phase Readiness

- The Reports page is trimmed to the retained supermarket report set; later Phase 04 plans can add Product Sales margin and hardening coverage without these removed paths.

## Self-Check: PASSED

- Created migration exists and task commits `487c92b` and `88d2bcd` exist.
- Typecheck, lint, focused Vitest tests, retained Playwright suites, symbol scans, and live RPC lookup passed.
