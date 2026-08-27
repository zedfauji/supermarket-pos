---
phase: 05-delete-void-order-feature
plan: 02
subsystem: backend
tags: [rbac, supabase-migration, supabase-edge-functions, i18n, dead-code-removal]

# Dependency graph
requires:
  - phase: 05-01
    provides: "Client-side void-order removal (feature folder, rbac.ts Action union, edge-function-contracts.ts exports/registry) — this plan's precondition for Task 1"
provides:
  - "role_permissions table no longer grants 'void_order' to 'manager'/'admin' — DB-side half of D-01's RBAC lockstep, via a new forward migration (historical seeding migration untouched)"
  - "supabase/functions/void-order/ deleted — the last network-reachable POST /functions/v1/void-order endpoint is gone (D-02)"
  - "Both featOrders.json locale catalogs (es-MX, en-US) have no voidOrder key block, remain valid JSON and key-parity-matched"
affects: [05-03-PLAN.md]

# Actuals (#2632)
actuals:
  tokens: 1800
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Forward-only migration for permission-grant removal: DELETE wrapped in BEGIN/COMMIT, mirror-image INSERT ON CONFLICT DO NOTHING as a commented-out (non-executable) DOWN block — same shape as 20260703000006_role_permissions_view_audit_log.sql in reverse."

key-files:
  created:
    - supabase/migrations/20260818000006_drop_void_order_permissions.sql
  modified:
    - supabase/functions/void-order/index.ts (deleted, whole directory)
    - src/shared/lib/i18n/locales/es-MX/featOrders.json
    - src/shared/lib/i18n/locales/en-US/featOrders.json

key-decisions:
  - "Applied the new migration directly via docker exec ... psql (the local pooler container was unreachable/absent), then registered it in supabase_migrations.schema_migrations manually — per the plan's documented fallback path."
  - "Confirmed via git diff --stat that the historical seeding migration (20260510000001_rls_rewrite_phase13.sql) is byte-for-byte unchanged — no output, confirming D-01's 'never edit history' constraint held."
  - "Left the full-repo void-order grep's remaining hits (e2e/*.spec.ts, e2e/global-teardown.ts, historical migrations, audit-edge-coverage.test.ts's documentation comment) untouched — those are explicitly 05-03-PLAN.md's scope (E2E sweep, SC1/SC2 gates) or historical/must-not-touch per RESEARCH.md (orders.status='voided' references in older migrations, the removal-notice comment in audit-edge-coverage.test.ts)."

patterns-established: []

requirements-completed: [SALE-01]

coverage:
  - id: D1
    description: "New forward migration DELETEs both role_permissions grant rows; historical seeding migration untouched; applied to local Supabase stack"
    requirement: "SALE-01"
    verification:
      - kind: integration
        ref: "docker exec supabase-db psql ... 'select role, action from role_permissions where action = void_order' returns zero rows post-migration (2 rows before, 0 after); git diff --stat on 20260510000001_rls_rewrite_phase13.sql produces no output"
        status: pass
    human_judgment: false
  - id: D2
    description: "supabase/functions/void-order/ directory deleted; no other edge function imports from it; audit-edge-coverage.test.ts still passes"
    requirement: "SALE-01"
    verification:
      - kind: unit
        ref: "test ! -d supabase/functions/void-order && npx vitest run src/shared/lib/__tests__/audit-edge-coverage.test.ts (3 tests pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "voidOrder key block removed from both es-MX and en-US featOrders.json; both remain valid JSON and key-parity-matched"
    requirement: "SALE-01"
    verification:
      - kind: unit
        ref: "node -e JSON.parse(...) on both files (valid) + key-set-equality check (parity ok); grep -n voidOrder on both files returns no matches"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-16
status: complete
---

# Phase 5 Plan 2: Delete void-order backend/DB surface Summary

**Removed the void-order feature's backend/DB surface: a new forward migration deletes its two `role_permissions` grant rows (historical seeding migration left untouched), the `supabase/functions/void-order/` edge function directory is gone, and both locale catalogs' `voidOrder` i18n key blocks are removed — the backend/DB half of SALE-01, with `npm run typecheck && npm run lint && npm run test` green (1098 passed) after all three tasks.**

## Performance

- **Duration:** 12 min
- **Tasks:** 3
- **Files modified:** 4 (1 created, 1 deleted, 2 edited)

## Accomplishments
- `supabase/migrations/20260818000006_drop_void_order_permissions.sql` created: a real executable `DELETE FROM role_permissions WHERE role IN ('manager','admin') AND action = 'void_order'` wrapped in `BEGIN`/`COMMIT`, followed by a commented-out (non-executable) mirror-image `INSERT ... ON CONFLICT DO NOTHING` DOWN block, matching the repo's `20260703000006` precedent. Applied to the local Supabase stack via `docker exec supabase-db psql` (pooler unreachable, used the documented fallback) and registered in `supabase_migrations.schema_migrations`.
- `supabase/functions/void-order/` (the whole directory, `index.ts`) deleted outright — the last network-reachable `POST /functions/v1/void-order` endpoint is gone.
- `voidOrder` key block removed from `src/shared/lib/i18n/locales/es-MX/featOrders.json` and `en-US/featOrders.json` in the same task, keeping the two catalogs in key-parity at every intermediate state.

## Task Commits

Each task was committed atomically:

1. **Task 1: New forward migration — DELETE the role_permissions grant rows** - `3465bba` (feat)
2. **Task 2: Delete the void-order Edge Function directory** - `cec6ded` (feat)
3. **Task 3: Remove the voidOrder i18n key block from both locale catalogs** - `34c8784` (feat)

_Note: all three tasks were `type="auto"` (non-TDD), one commit per task._

## Files Created/Modified
- `supabase/migrations/20260818000006_drop_void_order_permissions.sql` - created (new forward migration deleting the two role_permissions grant rows)
- `supabase/functions/void-order/index.ts` - deleted (whole directory removed; last network-reachable void-order endpoint)
- `src/shared/lib/i18n/locales/es-MX/featOrders.json` - removed `voidOrder` key block (12 lines)
- `src/shared/lib/i18n/locales/en-US/featOrders.json` - removed `voidOrder` key block (12 lines)

## Decisions Made
- Followed the plan's task order exactly: DB migration first, then edge function deletion, then i18n cleanup — each verified independently before moving to the next.
- Used the documented fallback for applying the migration (`docker exec -i supabase-db psql ... < migration.sql` plus a manual `schema_migrations` INSERT) since no `supabase-pooler` container was running in this environment; `supabase-db` was directly reachable via `docker exec`.
- Verified the historical seeding migration (`20260510000001_rls_rewrite_phase13.sql`) is byte-for-byte unchanged via `git diff --stat`, confirming D-01's "never edit history" constraint.
- Confirmed via `git rm -r` + grep that no other edge function imports from `supabase/functions/void-order/` before deleting it.

## Deviations from Plan

None — plan executed exactly as written. All three tasks' `<action>` steps, `<verify>` commands, and `<acceptance_criteria>` matched the actual repo/environment state (the pooler-unreachable fallback path was anticipated and documented in the plan's own Task 1 `<action>`, not an improvised deviation).

## Issues Encountered

**Worktree environment setup (not a plan deviation — environment-only, no source changes):** Same as 05-01 — this worktree had no `node_modules/` and no `.env.local` (both gitignored). Symlinked both from the main repo checkout (`/home/widowsvail/ai/POS/supermarket-pos/`). Neither symlink is tracked by git and neither affected any committed file.

## User Setup Required

None - no external service configuration required. The migration was already applied to the local Supabase stack as part of Task 1's execution.

## Next Phase Readiness
- Backend/DB half of SALE-01 is complete: the `role_permissions` DB grant is gone via a new forward migration (historical migration untouched), the edge function directory no longer exists, and both i18n catalogs are copy-clean and key-parity-matched.
- 05-03-PLAN.md (the E2E sweep — deleting `e2e/18-void-order.spec.ts`, removing `e2e/09-rbac.spec.ts` T8/T9, `e2e/helpers/supabase.ts`'s `seedVoidableOrder` helper, `e2e/global-teardown.ts`'s stale `SUITE_MAP` label — plus adding the SC1 absence-assertion E2E and running the final SC1-SC5 gates) is unblocked.
- A full-repo grep for `void.order|void_order|voidOrder|VoidOrder` (excluding `.planning/`) still surfaces expected residual hits, all out of this plan's scope and confirmed correct to leave: `e2e/*.spec.ts` and `e2e/global-teardown.ts` (05-03-PLAN.md's E2E sweep scope), historical migrations referencing `orders.status='voided'` (must-not-touch per RESEARCH.md), and a documentation-only removal-notice comment in `audit-edge-coverage.test.ts`.
- No blockers.

---
*Phase: 05-delete-void-order-feature*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260818000006_drop_void_order_permissions.sql
- FOUND: supabase/functions/void-order/ no longer exists
- FOUND: .planning/phases/05-delete-void-order-feature/05-02-SUMMARY.md
- FOUND: commit 3465bba
- FOUND: commit cec6ded
- FOUND: commit 34c8784
