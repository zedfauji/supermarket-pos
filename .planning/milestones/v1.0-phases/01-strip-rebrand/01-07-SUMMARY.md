---
phase: 01-strip-rebrand
plan: 07
subsystem: infra
tags: [supabase, postgres, rbac, kds, prep-production]

# Dependency graph
requires:
  - phase: 01-strip-rebrand (Plan 04)
    provides: /kds, /kds-bar, /kitchen-prep routes and nav tiles already severed from the router, HomeDashboard, SettingsTabsPanel
provides:
  - Kitchen Display System (KDS + KDS-bar boards) and batch chef prep production fully removed from code (2 entities, 2 features, 2 widgets, 3 pages, 3 pure-domain E2E specs) and the database (order_items.kds_status column + enum, kds_enabled settings key, prep_productions table + trigger, produce_prep_batch RPC)
affects: [Phase 1 Plan 09 (combos/recipes strip) — recipes.prep_ingredient_id extension column deliberately left untouched by this plan, must be resolved against 01-09's own scope, Phase 1 Plan 13 (final sweep) — kitchen StaffRole and its RLS policies/role_permissions rows for produce_prep_batch/view_kds/view_kds_bar deliberately left untouched, an RBAC/RLS audit out of this plan's scope]

# Actuals (#2632)
actuals:
  tokens: 31400
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "kds_enabled is not its own settings row — it's a nested key inside the 'receipt' row's JSONB value blob, removed via jsonb `-` key-delete (UPDATE ... SET value = value - 'kds_enabled'), not a row DELETE"
    - "caja_open and produce_prep_batch were created by the same migration file (20260703000003_caja_open_prep_batch_rpcs.sql) but only produce_prep_batch is prep-domain — caja_open is core, retained caja-session-open functionality still called by src/entities/caja/model/queries.ts and must never be dropped by a filename-based migration audit"
    - "A migration-filename-based deletion audit misses orphaned dead code left behind by an earlier route-severing plan (01-04) — src/app/kds-route.tsx and kds-bar-route.tsx had zero remaining importers but weren't in this plan's <files> list; found via a manual grep sweep, not the plan's own read_first list"

key-files:
  created:
    - supabase/migrations/20260810000004_drop_kds_and_prep.sql
  modified: []

key-decisions:
  - "Deleted src/app/kds-route.tsx and src/app/kds-bar-route.tsx even though they weren't in the plan's <files> list — orphaned route-guard components left over from 01-04's route severing, zero importers anywhere in src/, directly within this plan's 'no KDS code remains' objective, zero risk (tsc/lint clean before and after)"
  - "Left recipes.prep_ingredient_id (added by 20260429000002_recipes_prep_extension.sql) untouched per the plan's own explicit deferral to Plan 01-09 — cross-checked the migration's DDL directly to confirm it only extends the shared recipes table, no prep-exclusive table/logic beyond that column"
  - "Left the kitchen StaffRole, its RLS policies, and role_permissions rows for produce_prep_batch/view_kds/view_kds_bar untouched — RBAC/RLS action-vocabulary cleanup is a distinct audit out of this plan's scope (matches the plan's own threat_model note that the kitchen role remains valid regardless of KDS removal)"
  - "Ran the full unit suite (not just tsc) post-DB-push and diffed the 11 pre-existing failures against 01-05/01-06's documented deferred-items.md baseline — confirmed 0 new failures (one extra FAIL line for a fast-check property test in groupOrderItemsForReceipt.test.ts was flaky, reproduced clean 14/14 in isolation, unrelated to this plan's files)"
  - "E2E verification of the trimmed e2e/18-modifier-notes-kds.spec.ts (T1/T2) could not complete — local edge-functions Docker container's get-server-time function fails to boot ('could not find an appropriate entrypoint'), a pre-existing local-stack infra issue confirmed via `docker logs supabase-edge-functions`, unrelated to this plan's code changes. Logged as unrun-verify rather than silently skipped."

requirements-completed: []

coverage:
  - id: D1
    description: "KDS and prep-production code deleted end-to-end: 2 entities, 2 features, 2 widgets, 3 pages, 3 pure-domain E2E specs deleted; the mixed e2e/18-modifier-notes-kds.spec.ts spec trimmed to remove only its T3 KDS-card test, keeping T1/T2/T4; 2 orphaned route-guard files (kds-route.tsx, kds-bar-route.tsx) found and deleted; KDS/prep i18n keys removed"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "npm run lint (eslint src --max-warnings 0)"
        status: pass
      - kind: other
        ref: "test ! -d src/entities/kds && test ! -d src/entities/prep && test ! -f e2e/28-kds.spec.ts && test ! -f e2e/21-prep.spec.ts && test ! -f e2e/40-kds-bar.spec.ts && test -f e2e/18-modifier-notes-kds.spec.ts && ! grep -q 'T3: KDS card' e2e/18-modifier-notes-kds.spec.ts && grep -q 'T1: modifier sheet opens' e2e/18-modifier-notes-kds.spec.ts"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/18-modifier-notes-kds.spec.ts (T1/T2)"
        status: fail
    human_judgment: true
    rationale: "The E2E run for the retained T1/T2 tests failed, but the failure reproduces at the 'New Tab' click step (before any modifier-sheet interaction is reached) and traces to a pre-existing local Docker infra fault (edge-functions container's get-server-time function: 'worker boot error: could not find an appropriate entrypoint', confirmed via docker logs, unrelated to any file this plan touched). A human (or a follow-up infra-fix task) needs to confirm the edge-functions container is repaired before this spec can be re-run and auto-classified as pass."
  - id: D2
    description: "KDS-core (order_items.kds_status column + enum), kds_enabled settings key, prep_productions table + trigger, and the produce_prep_batch RPC dropped from the self-hosted project; caja_open and recipes.prep_ingredient_id deliberately preserved"
    verification:
      - kind: other
        ref: "supabase db push --db-url ... --debug — 'Remote database is up to date', migration 20260810000004 applied"
        status: pass
      - kind: other
        ref: "psql: SELECT table_name FROM information_schema.tables WHERE table_name='prep_productions' — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT proname FROM pg_proc WHERE proname IN ('produce_prep_batch','fn_prep_production_insert') — 0 rows; SELECT proname FROM pg_proc WHERE proname='caja_open' — 1 row (preserved)"
        status: pass
      - kind: other
        ref: "psql: SELECT column_name FROM information_schema.columns WHERE table_name='order_items' AND column_name='kds_status' — 0 rows; SELECT typname FROM pg_type WHERE typname='kds_status' — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT value ? 'kds_enabled' FROM settings WHERE key='receipt' — false"
        status: pass
      - kind: other
        ref: "psql: SELECT column_name FROM information_schema.columns WHERE table_name='recipes' AND column_name='prep_ingredient_id' — 1 row (preserved for 01-09)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-08-10
status: complete
---

# Phase 01 Plan 07: KDS and Batch Prep Production Removal Summary

**Kitchen Display System (KDS + KDS-bar boards) and batch chef prep production removed end-to-end — code (2 entities, 2 features, 2 widgets, 3 pages, 3 pure-domain E2E specs, 2 orphaned route guards) and database (order_items.kds_status column/enum, kds_enabled settings key, prep_productions table + trigger, produce_prep_batch RPC) — while preserving the co-located caja_open RPC and the shared recipes.prep_ingredient_id column both plans' scope boundaries require.**

## Performance

- **Duration:** ~25 min (this session resumed mid-flight after a prior session/API-limit interruption; Task 1 was already committed)
- **Tasks:** 2
- **Files modified:** 3 in the final commit (2 orphaned files deleted, 1 migration created); Task 1's earlier commit touched 43 files

## Accomplishments

- Deleted the `kds`/`prep` entities, `bump-kds-item`/`produce-prep-batch` features, `KdsBoard`/`KitchenPrepDashboard` widgets, and `kds`/`kds-bar`/`kitchen-prep` pages; deleted `e2e/28-kds.spec.ts`, `e2e/40-kds-bar.spec.ts`, `e2e/21-prep.spec.ts`; trimmed only the T3 KDS-card test out of the mixed `e2e/18-modifier-notes-kds.spec.ts`, keeping T1/T2/T4.
- Authored and pushed a new forward DROP migration (`20260810000004_drop_kds_and_prep.sql`) against the self-hosted project: dropped `produce_prep_batch` (the prep-only half of a two-RPC migration that also created the KEPT `caja_open`), `prep_productions` + its trigger/function, `order_items.kds_status` column + the `kds_status` enum type, and removed the `kds_enabled` key from the `receipt` settings row's JSONB blob via key-delete.
- Found and deleted 2 orphaned route-guard files (`src/app/kds-route.tsx`, `src/app/kds-bar-route.tsx`) left behind by 01-04's route severing — zero remaining importers, directly within this plan's KDS-removal objective, not caught by the plan's own `<files>` list.
- Verified via live-DB introspection (matching 01-06's `pg_proc`/`information_schema` pattern) that every target object is gone and both deliberately-preserved objects (`caja_open`, `recipes.prep_ingredient_id`) are intact.
- Ran the full unit suite post-push and confirmed the 11 pre-existing failures exactly match the 01-05/01-06-documented baseline (0 new failures); confirmed one extra flaky `FAIL` line (a fast-check property test) reproduces clean in isolation.

## Task Commits

1. **Task 1: Delete KDS/prep entities/features/widgets/pages, trim mixed spec, delete pure KDS/prep specs (D-Phase Boundary)** - `df3e725` (feat) — completed in the prior interrupted session
2. **Task 2: Drop KDS-core, kds_enabled setting, prep_productions, and caja_open_prep_batch RPCs, push to the new project** - `0a3e821` (feat) — completed this session, also includes the 2 orphaned route-guard file deletions

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `supabase/migrations/20260810000004_drop_kds_and_prep.sql` - forward DROP migration (produce_prep_batch RPC → prep_productions table+trigger → kds_enabled JSONB key-delete → order_items.kds_status column + enum), with a shape-only DOWN block
- `src/app/kds-route.tsx`, `src/app/kds-bar-route.tsx` - deleted; orphaned route guards from 01-04, zero importers
- (Task 1, prior session) `src/entities/kds/`, `src/entities/prep/`, `src/features/bump-kds-item/`, `src/features/produce-prep-batch/`, `src/widgets/KdsBoard/`, `src/widgets/KitchenPrepDashboard/`, `src/pages/kds/`, `src/pages/kds-bar/`, `src/pages/kitchen-prep/`, `e2e/28-kds.spec.ts`, `e2e/40-kds-bar.spec.ts`, `e2e/21-prep.spec.ts` - deleted wholesale; `e2e/18-modifier-notes-kds.spec.ts` trimmed to remove T3 only; KDS/prep-namespaced i18n keys removed from both locales

## Decisions Made

See `key-decisions` in frontmatter. In short: stayed within the plan's explicit scope boundaries (preserved `caja_open` and `recipes.prep_ingredient_id`, deferred `kitchen` role/RLS/role_permissions cleanup to a future RBAC audit) while extending cleanup to 2 orphaned dead files directly within this plan's "no KDS code remains" objective that the plan's own file inventory missed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Orphaned KDS route-guard files not in the plan's `<files>` list**
- **Found during:** Task 2 completion sweep, `grep -rn "kds"` across `src/`
- **Issue:** `src/app/kds-route.tsx` and `src/app/kds-bar-route.tsx` (route guard components gating `/kds`/`/kds-bar`) were left behind when 01-04 severed the routes from `router.tsx` — zero remaining importers anywhere in `src/`, confirmed via grep before deletion
- **Fix:** `git rm` both files
- **Files modified:** `src/app/kds-route.tsx`, `src/app/kds-bar-route.tsx`
- **Verification:** `npx tsc --noEmit` clean before and after; `npm run lint` clean
- **Committed in:** `0a3e821` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing cleanup within plan's own stated objective)
**Impact on plan:** Necessary for the plan's literal "no KDS code remains" truth criterion in spirit; zero risk (files had no consumers).

## Issues Encountered

- **Session/API-limit interruption:** A prior executor run was terminated mid-flight after completing and committing Task 1 (`df3e725`) and drafting (but not pushing or verifying) Task 2's migration file. This session resumed from that exact point per the resume context, verified the drafted migration against all 6 source migration files it targets (byte-accurate — correctly scoped `produce_prep_batch` vs. the retained `caja_open`, correctly used JSONB key-delete for `kds_enabled`, correctly deferred `recipes.prep_ingredient_id`), then pushed and verified it.
- **`supabase db push` (no `--db-url`) requires the same workaround as 01-01/01-05/01-06:** this self-hosted stack has no cloud project to `supabase link` against. Resolved using `--db-url "postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"`, credentials read from `docker exec supabase-pooler env` / `docker exec supabase-db env`.
- **E2E spec `e2e/18-modifier-notes-kds.spec.ts` (T1/T2) failed to run to completion:** the local `supabase-edge-functions` Docker container's `get-server-time` function fails to boot (`worker boot error: failed to bootstrap runtime: could not find an appropriate entrypoint`, confirmed via `docker logs supabase-edge-functions`). The test fails at the "New Tab" click step, before reaching any modifier-sheet interaction this plan's T3 removal touched. This is a pre-existing local dev-stack infra fault, not a regression caused by this plan's file changes — out of this plan's scope per the executor's scope-boundary rule, but logged here (not silently dropped) per CLAUDE.md's no-manual-verification policy, since it blocks a fully automated pass of the retained tests.
- **Unit-suite flake:** `src/shared/lib/groupOrderItemsForReceipt.test.ts`'s fast-check property test appeared in one full-suite `FAIL` listing but reproduced 14/14 clean when run in isolation twice — flaky, unrelated to any file this plan touched, not counted as a new failure.

## User Setup Required

None - no external service configuration required. The self-hosted Supabase stack was already running (12 containers) and the migration was pushed directly via `supabase db push --db-url ... --debug`. The `supabase-edge-functions` container's `get-server-time` boot failure (see Issues Encountered) is a pre-existing local-stack repair item, not new setup — flagged for whoever next needs a fully green E2E run, not blocking this plan's own deliverables.

## Next Phase Readiness

- KDS and prep production are fully gone from code and the database; `npx tsc --noEmit`, `npm run lint`, and `npm run test` (11 pre-existing failures, 0 new) all pass clean.
- Plan 01-09 (combos/recipes strip) still owns resolving `recipes.prep_ingredient_id` — deliberately left untouched here per the plan's own scope note; confirm against 01-09's own inventory before any further `recipes` table changes.
- Plan 01-13 (final sweep) still owns the `kitchen` StaffRole cleanup: its RLS policies (`get_user_role() = 'kitchen'` gates on `order_items`/`orders`/`tabs`/`products`/`categories`/`stock_movements`/`shifts`) and `role_permissions` rows for `produce_prep_batch`/`view_kds`/`view_kds_bar` remain in the RBAC action vocabulary (`src/shared/lib/rbac.ts`) — none of this was touched here, an explicit out-of-scope RBAC/RLS audit per this plan's own threat_model.
- The `supabase-edge-functions` container's `get-server-time` function needs a boot-failure fix (Deno entrypoint issue) before `e2e/18-modifier-notes-kds.spec.ts` T1/T2 can run to a clean pass locally — unrelated to this plan, worth flagging to whoever next runs the full local E2E suite.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260810000004_drop_kds_and_prep.sql`
- FOUND: `src/entities/kds` deleted (directory absent)
- FOUND: `src/entities/prep` deleted (directory absent)
- FOUND: `src/app/kds-route.tsx` deleted (file absent)
- FOUND: `src/app/kds-bar-route.tsx` deleted (file absent)
- FOUND: `.planning/phases/01-strip-rebrand/01-07-SUMMARY.md`
- FOUND: commit `df3e725` (Task 1)
- FOUND: commit `0a3e821` (Task 2)

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*
