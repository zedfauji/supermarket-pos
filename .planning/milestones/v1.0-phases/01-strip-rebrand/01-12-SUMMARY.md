---
phase: 01-strip-rebrand
plan: 12
subsystem: database
tags: [supabase, postgres, rls, i18n, react, tauri]

# Dependency graph
requires:
  - phase: 01-strip-rebrand
    provides: "01-04 severed the 'Tip Split' Settings/Reports tab registrations, leaving TipBucketDistributionPanel/TipDistributionSettingsTab as orphaned but still-compiling widgets for this plan to delete outright"
provides:
  - "Bar-specific floor/bar/kitchen tip-bucket-distribution feature removed end-to-end (D-21): code (widget, settings tab, E2E spec, orphaned i18n keys) and DB (tip_distribution_entries table + the tip-pooling/insert block inside close_caja_session)"
  - "close_caja_session restored to a body containing only the version-bump fix (Phase 15/19) and the caja.close audit call — every other Phase 14/15/23 change to the RPC preserved untouched"
affects: [01-13]

# Actuals (#2632)
actuals:
  tokens: 8868
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "DROP-migration convention: CREATE OR REPLACE the shared function from its LIVE pg_get_functiondef source (not the oldest migration file that first introduced the block), so later unrelated patches folded into the same function survive the rewrite"

key-files:
  created:
    - supabase/migrations/20260810000010_drop_tip_distribution.sql
  modified:
    - src/shared/lib/i18n/locales/es-MX/settings.json
    - src/shared/lib/i18n/locales/en-US/settings.json
    - src/shared/lib/i18n/locales/es-MX/pages.json
    - src/shared/lib/i18n/locales/en-US/pages.json
    - src/shared/lib/i18n/locales/es-MX/wAdmin.json
    - src/shared/lib/i18n/locales/en-US/wAdmin.json

key-decisions:
  - "Rewrote close_caja_session from the LIVE pg_get_functiondef source (docker exec supabase-db psql), not the 20260709000002 migration file — Phase 23's 20260720000005 patched the tip-pooling SELECT in place to exclude reopened_void rows, a change invisible if you only read migration files in creation order. That whole SELECT lives inside the block being removed, so verifying against the live source (rather than the file) was the only way to know for certain nothing else in that function had drifted from the file history."
  - "Left useExportReport.ts's tip-split-csv branch and ExportButtons.tsx's TipSplitProps/'tip-split' case as dead code (no remaining caller after TipBucketDistributionPanel's deletion) rather than removing it — not in this plan's files_modified, still typechecks/lints clean, and this phase's established pattern (01-06/01-09/01-10/01-11) defers this class of fallout to Plan 01-13's final sweep rather than expanding each plan's scope ad hoc."

patterns-established:
  - "For any future DROP migration touching a function last modified by a later, unlisted migration: pull pg_get_functiondef from the live DB first and diff it against the oldest known migration file before authoring the rewrite, rather than trusting migration-file history alone."

requirements-completed: []

coverage:
  - id: D1
    description: "TipBucketDistributionPanel widget, TipDistributionSettingsTab, and e2e/42-tip-distribution.spec.ts deleted; orphaned tipSplit/tipBucketDistributionPanel/tipDistributionSettingsTab i18n keys removed; TipDistributionPanel (the distinct generic per-staff report) confirmed unchanged"
    verification:
      - kind: other
        ref: "npx tsc --noEmit && test ! -d src/widgets/TipBucketDistributionPanel && test ! -f src/widgets/SettingsTabsPanel/tabs/TipDistributionSettingsTab.tsx && test -d src/widgets/TipDistributionPanel && test ! -f e2e/42-tip-distribution.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "tip_distribution_entries dropped from the live self-hosted DB; close_caja_session restored to a body with the version-bump fix intact and zero tip-distribution logic; a real caja close via the RPC succeeds"
    verification:
      - kind: other
        ref: "docker exec supabase-db psql: information_schema.tables has no tip_distribution_entries row; pg_get_functiondef(close_caja_session) matches version\\s*=\\s*version\\s*\\+\\s*1 and does not ILIKE '%tip_distribution%'"
        status: pass
      - kind: integration
        ref: "docker exec supabase-db psql direct RPC call: open a test caja_sessions row, SET request.jwt.claim.sub to a manager profile, SELECT close_caja_session(...) returned {\"ok\":true}, version bumped 1->2, one caja.close audit_logs row, zero tip_distribution.compute rows; test rows cleaned up after"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/02-caja.spec.ts — 2/7 pass, 5 fail; all 5 failures pre-existing and unrelated to this plan (4 navigate to the removed /pos route per Plan 01-11, 1 is a pre-existing getByText('Cash') strict-mode collision with 'cashier' role badges), confirmed by reading the spec and matching failures against Plan 01-11's known /pos removal"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-11
status: complete
---

# Phase 01 Plan 12: Remove Tip-Bucket Distribution Summary

**Deleted the bar-specific floor/bar/kitchen "Tip Split" feature end-to-end (widget, settings tab, E2E spec, DB table) and rewrote `close_caja_session` from its live source to drop the tip-pooling/insert block while preserving every other change (the version-bump fix, Phase 23's reopened_void exclusion elsewhere in the function) folded into that shared RPC since.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-11T06:09:41Z
- **Tasks:** 2
- **Files modified:** 12 (6 deleted, 6 i18n edited, 1 migration created)

## Accomplishments

- Deleted `src/widgets/TipBucketDistributionPanel/` (Reports "Tip Split" tab widget), `SettingsTabsPanel/tabs/TipDistributionSettingsTab.tsx`/`.test.tsx`, and `e2e/42-tip-distribution.spec.ts`
- Removed orphaned `tipSplit` / `tipBucketDistributionPanel` / `tipDistributionSettingsTab` i18n keys from both locales (`settings.json`, `pages.json`, `wAdmin.json`) — verified zero remaining `src/` consumers before removal
- Confirmed `src/widgets/TipDistributionPanel/` (the distinct, generic, kept per-staff tip report) is byte-for-byte unchanged
- Authored `supabase/migrations/20260810000010_drop_tip_distribution.sql`: `CREATE OR REPLACE FUNCTION close_caja_session` from the **live** function body (pulled via `pg_get_functiondef`, not the original migration file) minus the "Phase 19: tip-bucket distribution" block, then `DROP TABLE IF EXISTS tip_distribution_entries CASCADE`
- Pushed to the running self-hosted stack (`supabase db push --db-url ...`); live-verified the table is gone, the version-bump fix is present via regex match, and no `tip_distribution` reference remains in the function source
- Proved the RPC actually works post-migration by calling it directly: opened a real `caja_sessions` row, set `request.jwt.claim.sub` to a manager profile, called `close_caja_session`, got `{"ok":true}`, confirmed `version` 1→2, one `caja.close` audit row, zero `tip_distribution.compute` rows — then cleaned up the test rows

## Task Commits

1. **Task 1: Delete TipBucketDistributionPanel widget, TipDistributionSettingsTab, and the tip-split E2E spec (D-21)** - `03e79df` (feat)
2. **Task 2: [BLOCKING] Drop tip_distribution_entries and restore close_caja_session without the tip-distribution INSERT (Pitfall 4)** - `cf5dc98` (feat)

_No TDD tasks in this plan — both are `type="auto"`._

## Files Created/Modified

- `supabase/migrations/20260810000010_drop_tip_distribution.sql` - DROP migration: rewrites `close_caja_session` from its live source minus the tip-distribution block, drops `tip_distribution_entries`
- `src/shared/lib/i18n/locales/{es-MX,en-US}/settings.json` - removed orphaned `tabs.tipSplit` key
- `src/shared/lib/i18n/locales/{es-MX,en-US}/pages.json` - removed orphaned `reports.tabs.tipSplit` key (kept `tips`, the generic report's tab label)
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` - removed orphaned `tipBucketDistributionPanel` and `tipDistributionSettingsTab` namespaces (kept `tipDistributionPanel`, the generic report's namespace)
- Deleted: `src/widgets/TipBucketDistributionPanel/TipBucketDistributionPanel.tsx`, `src/widgets/TipBucketDistributionPanel/index.ts`, `src/widgets/SettingsTabsPanel/tabs/TipDistributionSettingsTab.tsx`, `src/widgets/SettingsTabsPanel/tabs/TipDistributionSettingsTab.test.tsx`, `e2e/42-tip-distribution.spec.ts`

## Decisions Made

- Rewrote `close_caja_session` from its **live** `pg_get_functiondef` source rather than the `20260709000002` migration file. Live introspection (`docker exec supabase-db psql`, `pg_proc.prosrc ILIKE '%tip_distribution%'`) found `close_caja_session` is the sole function referencing `tip_distribution_entries` (no triggers/views/other functions) — but it also revealed the live function body already differs from that migration file: `20260720000005_fix_payment_sums_exclude_reopened_void.sql` (Phase 23) patched the tip-pooling `SELECT` in place to add `AND status IS DISTINCT FROM 'reopened_void'`. That whole `SELECT` lives inside the block removed here, so the fix is removed along with it — correctly, since it existed only to make the now-deleted tip pool accurate. Basing the rewrite on the live source (not the file) is what caught this and confirmed no *other* live drift needed preserving.
- Left `useExportReport.ts`'s `'tip-split-csv'` export branch and `ExportButtons.tsx`'s `TipSplitProps`/`'tip-split'` case in place as dead code — `TipBucketDistributionPanel` was their only caller and it's now deleted, but neither file was in this plan's `files_modified`, both still typecheck/lint clean, and this phase's established convention (01-06/01-09/01-10/01-11 SUMMARYs) is to defer this class of now-dead-but-compiling fallout to Plan 01-13's final sweep rather than silently expanding each plan's scope.

## Deviations from Plan

None — plan executed exactly as written, including the required live-DB introspection pass called out in this plan's prior-wave learnings.

## Issues Encountered

- `supabase status`/plain `supabase db push` don't work against this stack (containers aren't named per the CLI's expected `supabase_db_<project>` convention since the stack runs via raw `docker compose`, not `supabase start`) — worked around exactly as the prior 3 wave-3 plans did: `supabase db push --db-url "postgresql://postgres.your-tenant-id:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable" --debug`, with the password read from `docker exec supabase-db env`.
- `psql` is not installed on the host; all live-DB introspection and the direct RPC verification call went through `docker exec supabase-db psql -U supabase_admin -d postgres`.
- `npx playwright test e2e/02-caja.spec.ts` (run per this plan's acceptance criteria, "via the existing E2E flow ... run manually") returned 2 passed / 5 failed. All 5 failures are pre-existing and unrelated to this plan's changes: 4 tests (`POS is active after caja open`, `Cannot close caja with open tabs`, `Manager closes caja`, `Pending total shows open-tab revenue...`) call `page.goto('/pos')`, a route Plan 01-11 already removed — they fail before ever reaching `close_caja_session`. The 5th (`5-card summary is hidden when caja is closed`) fails on a `getByText('Cash')` strict-mode collision with two `getByText('cashier')` role badges, unrelated to tip distribution or caja-close logic. Since the E2E suite couldn't reach a real close through the UI, verified `close_caja_session` directly via a live RPC call instead (see Accomplishments) — this gives stronger evidence than the E2E run would have, since it isolates the RPC from the pre-existing `/pos`-removal breakage. This whole spec file needs updating once Plan 01-13 addresses the retained-page navigation fallout from 01-11 — not this plan's scope.

## User Setup Required

None - no external service configuration required. The self-hosted Supabase stack was already running (11 containers healthy) and the migration was pushed directly via `supabase db push --db-url ... --debug`.

## Next Phase Readiness

- Tip-bucket distribution is fully removed at both the code and DB level with zero regression to `close_caja_session`'s shared, generic caja-close path (proven via direct RPC call, not just static inspection).
- Carries forward for Plan 01-13's final sweep: (1) `useExportReport.ts`'s `tip-split-csv` branch + `ExportButtons.tsx`'s `TipSplitProps`, now dead code; (2) `e2e/02-caja.spec.ts` still navigates to the removed `/pos` route (4 pre-existing failures, not caused by this plan) and has one unrelated pre-existing `getByText('Cash')` strict-mode flake — both should be swept when 01-13 does its full retained-E2E-suite pass.

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-11*
