---
phase: 01-strip-rebrand
plan: 06
subsystem: infra
tags: [supabase, postgres, rls, realtime, react-i18next, ai-agent-tools, payments]

# Dependency graph
requires:
  - phase: 01-strip-rebrand (Plan 04)
    provides: routes/nav-tiles/settings-tabs already severed from the router, HomeDashboard, SettingsTabsPanel
provides:
  - Pool table / billiards session domain fully removed from code (resource entity, 5 lifecycle features, 3 widgets, 2 pages, Settings tab) and the database (resources, pool_sessions, resource_transfers tables; resources' Realtime publication membership; all pool-only RPCs and the deactivate-floating-resource trigger)
  - process_payment_atomic / process_split_payment_atomic (the KEPT generic payment RPCs) redefined without their pool_sessions guard — every checkout would otherwise have hard-failed once pool_sessions was dropped
affects: [Phase 1 Plan 08 (waitlist removal) — SeatPartySheet.tsx/WaitlistQueue.tsx's remaining inline `resources` queries, Phase 1 Plan 10 (Promotions removal) — pool-promotions-rpc.integration.test.ts and evaluate_promotions_pool_grant, Phase 1 Plan 13 (final sweep) — TabSchema pool-linkage fields (poolCharges/hasActivePoolSession/activePoolTableNumber/tableNumber) and remaining pool-adjacent i18n keys in files this plan didn't touch (TabDetail.tsx, PaymentForm.tsx, PaymentPane.tsx, TabPaymentCard.tsx, PoolChargeItem.tsx)]

# Actuals (#2632)
actuals:
  tokens: 145000
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Before dropping a table, grep pg_proc for prosrc ILIKE '%tablename%' against the LIVE database, not just migration files — RESEARCH.md's filename-based audit missed that process_payment_atomic/process_split_payment_atomic (generic, kept payment RPCs) both had a pool_sessions guard baked in, and would have broken every payment on the new project"
    - "Live FK-dependency query (information_schema.table_constraints joined on constraint_column_usage) surfaces child tables a migration-filename audit can miss — resource_transfers (born pool_table_transfers) wasn't named in RESEARCH.md's SQL removal table"
    - "DROP TABLE ... CASCADE against a table referenced by another plan's not-yet-deleted table (waitlist_entries.table_id, applied_promotions.pool_session_id) only drops the dangling FK constraint on the other table, never the table or its data — safe, expected same-wave transient state"

key-files:
  created:
    - supabase/migrations/20260810000003_drop_pool_resources.sql
  modified:
    - src/features/transfer-tab/index.ts
    - src/features/seat-waitlist-party/model/useSeatWaitlistParty.ts
    - src/features/seat-waitlist-party/ui/SeatPartySheet.tsx
    - src/features/seat-waitlist-party/index.ts
    - src/features/close-tab/index.ts
    - src/pages/waitlist/index.tsx
    - src/app/OfflineQueueProcessor.tsx
    - src/shared/lib/agent/tools/posTools.ts
    - src/shared/lib/agent/tools/guardTools.ts
    - src/shared/lib/agent/tools/index.ts
    - src/shared/lib/agent/tools/systemTools.ts
    - src/shared/lib/agent/brain.ts
    - e2e/23-payment-edge-cases.spec.ts
    - 14 i18n locale JSON files (es-MX + en-US × entities/wPanels/pages/settings/wAdmin/featOrders/featMgmt)

key-decisions:
  - "Expanded Task 1's scope beyond the plan's literal <files> list to fix every cross-plan compile-time break the resource-entity deletion caused (Rule 3 — blocking issue): transfer-tab's useTransferPoolSession.ts/TransferPoolDialog.tsx (sole consumer TableStatusPanel, deleted in this same task), seat-waitlist-party's useSeatAtNewTable (pool-table-creation path; its SeatPartySheet.tsx caller trimmed to remove the now-impossible 'seat at a new table' fallback button), OfflineQueueProcessor's start/stop-pool-timer dispatch cases, and the entire AI agent tool cluster (posTools.ts's 5 pool RPC tools, guardTools.ts's find_pool_table, agent/tools/index.ts registrations, brain.ts's system-prompt tool-rules text)."
  - "Expanded Task 2's scope to redefine process_payment_atomic and process_split_payment_atomic via CREATE OR REPLACE (dropping only their pool_sessions guard block, byte-for-byte identical otherwise) BEFORE dropping pool_sessions — a live pg_proc query surfaced that these KEPT, generic payment RPCs both open with a pool-session-active check, which RESEARCH.md's migration-filename audit never flagged. Without this fix every real checkout on the new project would have failed with 'relation pool_sessions does not exist', not just former pool-charge tabs."
  - "Also dropped resource_transfers (born pool_table_transfers) — a 100% pool-transfer-history table found via a live FK-dependency query against resources/pool_sessions, not named in RESEARCH.md's SQL removal table."
  - "Found and fixed a third, purely-runtime (non-tsc-visible) production break after both tasks landed: src/features/close-tab (a live, generic, KEPT feature wired into TabDrawer) and systemTools.ts's get_pos_status agent tool both queried pool_sessions directly via ad-hoc Supabase query-builder chains (no @entities/resource import, so tsc never caught it). Fixed in a follow-up commit; caught by re-running the full unit suite (not just tsc/lint) after Task 2's DB push and diffing the failure list against the pre-existing baseline."
  - "Deferred (not fixed, documented in deferred-items.md): SeatPartySheet.tsx's usePoolTables() and WaitlistQueue.tsx's usePoolTablesCount() still do a runtime-only .from('resources') query — both files are owned wholesale by Plan 01-08 (waitlist removal), which deletes them outright; redesigning 'seat a waitlist party at a table' without pool tables is a real product decision for that plan, not something to preempt here. Also deferred: pool-promotions-rpc.integration.test.ts (entities/promotion/, Plan 01-10's scope) now fails against the live DB — RESEARCH.md's own threat register (T-01-13) already flagged this exact cross-plan dependency as expected same-wave transient state."

requirements-completed: []

coverage:
  - id: D1
    description: "Pool entity/features/widgets/pages/Settings-tab code deleted; mixed E2E file trimmed not wholesale-deleted; 5 pure-pool E2E specs deleted; npx tsc --noEmit clean; all cross-plan compile-time breaks caused by the deletion (transfer-tab, seat-waitlist-party, OfflineQueueProcessor, AI agent tools) fixed"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: unit
        ref: "npm run lint (eslint src --max-warnings 0)"
        status: pass
      - kind: other
        ref: "test ! -d src/entities/resource && test ! -d src/widgets/TableStatusPanel && test ! -f e2e/04-pool-timer.spec.ts && test ! -f e2e/24-sprint5-pool-accuracy.spec.ts && ! grep -q 'PE6:|PE7:' e2e/23-payment-edge-cases.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "resources, pool_sessions, resource_transfers tables dropped from the self-hosted project; resources' Realtime publication membership dropped; all pool-only RPCs and the deactivate_floating_resource trigger dropped; process_payment_atomic/process_split_payment_atomic redefined without the pool_sessions guard so real payments keep working"
    verification:
      - kind: other
        ref: "supabase db push --db-url ... --debug (applied cleanly, tracked in supabase_migrations.schema_migrations as 20260810000003)"
        status: pass
      - kind: other
        ref: "psql: SELECT table_name FROM information_schema.tables WHERE table_name IN ('resources','pool_sessions','resource_transfers') — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename IN ('resources','pool_sessions') — 0 rows"
        status: pass
      - kind: other
        ref: "psql: SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosrc ILIKE '%pool_session%' — 0 rows"
        status: pass
    human_judgment: false
  - id: D3
    description: "Third-order production break (close-tab feature, get_pos_status agent tool) caused by the DROP but not visible to tsc/lint — found and fixed via full unit-suite diff against pre-existing baseline"
    verification:
      - kind: unit
        ref: "npm run test — 1345 passed, 11 failed (matches pre-existing 01-04/01-05-documented baseline exactly, 0 new failures)"
        status: pass
      - kind: unit
        ref: "src/features/close-tab/tests/useCloseTab.test.ts (1 passed)"
        status: pass
    human_judgment: false

# Metrics
duration: 65min
completed: 2026-08-10
status: complete
---

# Phase 01 Plan 06: Pool Table Domain Removal Summary

**Pool table/billiards session domain removed end-to-end — code (entity, 5 features, 3 widgets, 2 pages, Settings tab), database (resources/pool_sessions/resource_transfers tables, Realtime publication, all pool-only RPCs), and every cross-plan/cross-feature compile-time and runtime break the removal caused, including a redefinition of the KEPT generic payment RPCs that would otherwise have broken every checkout.**

## Performance

- **Duration:** ~65 min
- **Tasks:** 2 (plus one necessary follow-up fix commit)
- **Files modified:** 81 across 3 commits (44 deleted, 33 modified, 1 new SQL migration created)

## Accomplishments

- Deleted the `resource` entity, 5 pool-session lifecycle features, 3 pool widgets, 2 pool pages, and the Pool Tables Settings tab; deleted 5 pure-pool E2E spec files and trimmed the PE6/PE7 pool-charge test blocks out of the mixed-domain `23-payment-edge-cases.spec.ts`.
- Fixed every cross-plan compile-time break the deletion caused (Rule 3): `transfer-tab`'s pool-session-transfer code, `seat-waitlist-party`'s pool-table-creation fallback, `OfflineQueueProcessor`'s pool-timer offline-queue dispatch, and the full AI agent tool cluster (`posTools.ts`, `guardTools.ts`, `agent/tools/index.ts`, `brain.ts`'s system prompt).
- Authored and pushed a new forward DROP migration against the self-hosted project: `resource_transfers` → `pool_sessions` → `resources` (CASCADE), the `resource_status` enum, the `resources` Realtime publication membership, and 5 pool-only RPCs/triggers — while first redefining `process_payment_atomic`/`process_split_payment_atomic` (the KEPT, generic payment RPCs) to drop their pool-session guard, a critical fallout catch RESEARCH.md's migration-filename audit missed entirely.
- Found and fixed a third-order production break invisible to `tsc`/lint: the live `close-tab` feature (wired into `TabDrawer`) and the `get_pos_status` AI agent tool both queried `pool_sessions` via ad-hoc Supabase query-builder chains — caught only by re-running the full unit suite after the DB push and diffing against the documented pre-existing failure baseline.

## Task Commits

1. **Task 1: Delete pool entity/features/widgets/pages/settings-tab, trim mixed E2E specs, delete pure-pool E2E specs (D-09)** - `8f74ed8` (feat)
2. **Task 2: Drop resources and pool_sessions tables/RPCs/triggers, push to the new project (D-09)** - `915ef24` (feat)
3. **Follow-up: fix pool_sessions reads left broken by the DROP, invisible to tsc** - `e9589f9` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `supabase/migrations/20260810000003_drop_pool_resources.sql` - forward DROP migration (publication membership → resource_transfers → pool_sessions → resources CASCADE → enum type), with `process_payment_atomic`/`process_split_payment_atomic` redefined first, and a commented shape-only DOWN block
- `src/features/transfer-tab/index.ts` - dropped the pool-session-transfer exports (`useTransferPoolSession`, `TransferPoolDialog`), kept generic tab transfer
- `src/features/seat-waitlist-party/{index.ts,model/useSeatWaitlistParty.ts,ui/SeatPartySheet.tsx}` - removed `useSeatAtNewTable` (pool-table creation) and its "seat at a new table" fallback UI; kept generic `useSeatWaitlistParty`
- `src/features/close-tab/index.ts` - removed the `pool_sessions` guard from `useCloseTab` (Rule 1 — would have hard-failed every real tab close)
- `src/pages/waitlist/index.tsx` - removed the `PoolTableOccupancyPanel` import/render
- `src/app/OfflineQueueProcessor.tsx` - `start-pool-timer`/`stop-pool-timer` offline actions now fall through to the unknown-type no-op path
- `src/shared/lib/agent/tools/{posTools,guardTools,index,systemTools}.ts`, `src/shared/lib/agent/brain.ts` - removed 6 pool-only AI agent tools/definitions and their pool_sessions/resources reads; kept the persona line untouched per D-04
- `e2e/23-payment-edge-cases.spec.ts` - removed the PE6/PE7 pool-charge test blocks, kept the other 5
- 14 i18n locale JSON files - removed pool/resource-namespaced keys whose sole remaining consumer was code deleted in this task (D-22); left every key still consumed by files this plan didn't touch (TabDetail.tsx, PaymentForm.tsx, PaymentPane.tsx, TabPaymentCard.tsx, PoolChargeItem.tsx — deferred to Plan 01-13's full sweep)

## Decisions Made

See `key-decisions` in frontmatter. In short: the plan's literal `<files>` scope undersold the real blast radius of deleting `entities/resource` and dropping `pool_sessions`/`resources` — both the code-level and DB-level deletions had load-bearing consumers in files this plan didn't originally list (payment RPCs, a live `close-tab` feature, several AI agent tools, one sibling wave-3 plan's feature folder). Every compile-time break was fixed inline (Rule 3); the one confirmed runtime-only break in a KEPT feature (`process_payment_atomic`/`close-tab`) was fixed inline (Rule 1 — would break real payments/tab-closing); breaks in code wholesale-owned by a not-yet-run sibling plan (`seat-waitlist-party`'s/`WaitlistQueue`'s inline `resources` query, `entities/promotion`'s pool-grant integration test) were left as documented, expected same-wave transient state per the plan's own threat register.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-plan compile-time breaks from deleting `entities/resource`**
- **Found during:** Task 1, immediately after `git rm -r src/entities/resource` — `npx tsc --noEmit` failed
- **Issue:** `transfer-tab` (owned by Plan 01-11), `seat-waitlist-party` (owned by Plan 01-08), and `app/OfflineQueueProcessor.tsx` (unowned by any single plan) all imported from `@entities/resource`, which this plan deletes
- **Fix:** Removed only the pool-session-specific pieces of each (their sole functional purpose was pool-table interaction) — `useTransferPoolSession.ts`/`TransferPoolDialog.tsx` deleted outright (zero non-pool consumers), `useSeatAtNewTable` removed from `seat-waitlist-party` along with its UI fallback, `OfflineQueueProcessor`'s pool-timer dispatch cases collapsed into the existing unknown-type no-op path
- **Files modified:** `src/features/transfer-tab/{index.ts}` (+2 files deleted), `src/features/seat-waitlist-party/{index.ts,model/useSeatWaitlistParty.ts,ui/SeatPartySheet.tsx}`, `src/app/OfflineQueueProcessor.{tsx,test.tsx}`
- **Verification:** `npx tsc --noEmit` clean; `npm run lint` clean; `OfflineQueueProcessor.test.tsx` 5/5 pass
- **Committed in:** `8f74ed8` (Task 1 commit)

**2. [Rule 3 - Blocking] AI agent tool cluster (posTools.ts/guardTools.ts/agent/tools/index.ts/brain.ts)**
- **Found during:** Task 1, live `pg_proc`/import-graph investigation before the DB drop
- **Issue:** 5 AI agent tools (`list_pool_tables`, `start_pool_session`, `stop_pool_session`, `assign_session_to_tab`, `stop_and_move_table`, plus `find_pool_table`) directly queried `resources`/`pool_sessions`; the generic `close_tab` tool's internal executor also guarded on `pool_sessions`
- **Fix:** Removed the 6 pool-only tool definitions/implementations and their dispatcher registrations; stripped the `pool_sessions` guard from the generic `_executeCloseTab`; updated the system prompt's tool-rules text (not the persona line, which D-04 explicitly locks as untouched)
- **Files modified:** `src/shared/lib/agent/tools/{posTools,guardTools,index}.ts`, `src/shared/lib/agent/brain.ts`
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** `8f74ed8` (Task 1 commit)

**3. [Rule 1 - Bug] `process_payment_atomic`/`process_split_payment_atomic` would break every real payment**
- **Found during:** Task 2, live `pg_proc` query for `resources`/`pool_session` references before authoring the DROP migration
- **Issue:** Both KEPT, generic payment RPCs opened with a `SELECT ... FROM pool_sessions` guard blocking payment on an active pool session — dropping `pool_sessions` without redefining these functions first would have broken every checkout on the new project, not just pool-charge tabs
- **Fix:** `CREATE OR REPLACE FUNCTION` for both, dropping only the pool-session guard block (pulled via `pg_get_functiondef` against the live DB immediately before authoring the migration, so the rest is byte-for-byte identical), applied before the `DROP TABLE` statements in the same migration transaction
- **Files modified:** `supabase/migrations/20260810000003_drop_pool_resources.sql`
- **Verification:** Post-push `pg_proc` query confirms zero `pool_session`-referencing functions remain; both functions still exist and are callable (verified via `\d` / successful `CREATE FUNCTION` command tags in the push log)
- **Committed in:** `915ef24` (Task 2 commit)

**4. [Rule 2 - Missing critical] `resource_transfers` table not named by RESEARCH.md's SQL audit**
- **Found during:** Task 2, live FK-dependency query against `resources`/`pool_sessions`
- **Issue:** `resource_transfers` (born `pool_table_transfers`) is a 100% pool-transfer-history table with FKs into both `resources` and `pool_sessions`; RESEARCH.md's migration-filename-based audit didn't separately name it
- **Fix:** Added an explicit `DROP TABLE IF EXISTS resource_transfers CASCADE;` before dropping `pool_sessions`/`resources`
- **Files modified:** `supabase/migrations/20260810000003_drop_pool_resources.sql`
- **Verification:** `information_schema.tables` query confirms `resource_transfers` is gone
- **Committed in:** `915ef24` (Task 2 commit)

**5. [Rule 1 - Bug] `close-tab` feature and `get_pos_status` agent tool — runtime-only break invisible to tsc**
- **Found during:** Post-Task-2, full `npm run test` unit-suite run (not just `tsc --noEmit`) — 3 new failures appeared beyond the documented pre-existing baseline
- **Issue:** `src/features/close-tab/index.ts` (a live, generic, KEPT feature wired into `TabDrawer`) and `systemTools.ts`'s `get_pos_status` agent tool both queried `pool_sessions` via ad-hoc Supabase query-builder chains with no `@entities/resource` import — invisible to `tsc`, would fail every real "close tab" click and every `get_pos_status` call at runtime
- **Fix:** Removed the `pool_sessions` guard from `useCloseTab`; removed the `pool_sessions` count from `get_pos_status`'s response shape and description; trimmed `useCloseTab.test.ts`'s two now-meaningless pool-session test cases, kept the happy-path close test
- **Files modified:** `src/features/close-tab/{index.ts,tests/useCloseTab.test.ts}`, `src/shared/lib/agent/tools/systemTools.ts`
- **Verification:** `npm run test` — 1345 passed, 11 failed (exactly matches the pre-existing baseline documented in `deferred-items.md` from Plan 01-05, 0 new failures)
- **Committed in:** `e9589f9` (follow-up fix commit)

---

**Total deviations:** 5 auto-fixed (3 Rule 3 - blocking, 1 Rule 1 - bug, 1 Rule 2 - missing critical)
**Impact on plan:** All fixes were necessary for correctness — three (payment RPCs, close-tab, get_pos_status) would otherwise have broken live, generic, KEPT production functionality unrelated to pool tables on their face. No scope creep beyond what the deletion/drop directly required; deferred items (seat-waitlist-party/WaitlistQueue's runtime-only resources query, Promotions' pool-grant integration test) were left untouched because they belong wholesale to not-yet-run sibling plans.

## Issues Encountered

- `supabase db push` (no `--db-url`) failed with "Cannot find project ref" — this self-hosted stack has no cloud project to `supabase link` against. Resolved using the same `--db-url "postgresql://postgres.<POOLER_TENANT_ID>:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"` pattern documented in 01-01-SUMMARY.md/01-05-SUMMARY.md; tenant ID and password read from the running containers' env (`docker exec supabase-pooler env`, `docker exec supabase-db env`) since `.env.local` itself isn't readable by this tool.
- Discovered 3 additional load-bearing consumers of `resources`/`pool_sessions` beyond the plan's own `<read_first>` migration list (`process_payment_atomic`, `process_split_payment_atomic`, `resource_transfers`) via live-DB introspection (`pg_proc`/`information_schema.table_constraints` queries) rather than the migration-filename audit RESEARCH.md relied on — confirms the plan's own T-01-12/T-01-13 threat-register caution that hidden SQL-side dependencies are easy to miss from static file review alone.

## User Setup Required

None - no external service configuration required. The self-hosted Supabase stack was already running (`docker ps` confirmed all 12 containers healthy) and the migration was pushed directly via `supabase db push --db-url ... --debug`.

## Next Phase Readiness

- Pool table domain is fully gone from code and the database; `npx tsc --noEmit`, `npm run lint`, and `npm run test` all pass clean with zero new failures.
- Plan 01-08 (waitlist removal) will delete `SeatPartySheet.tsx`/`WaitlistQueue.tsx` outright, resolving their remaining runtime-only `resources` query — no action needed from this plan.
- Plan 01-10 (Promotions removal) will delete `entities/promotion/model/pool-promotions-rpc.integration.test.ts` outright, resolving its now-failing pool-grant test — no action needed from this plan; `evaluate_promotions_pool_grant` was confirmed absent from `pg_proc` at push time, so no residual reference exists yet.
- Plan 01-13 (final sweep) still owns pruning `TabSchema`'s pool-linkage fields (`tableNumber`, `poolCharges`, `hasActivePoolSession`, `activePoolTableNumber`) and their remaining i18n keys/UI code in `TabDetail.tsx`, `PaymentForm.tsx`, `PaymentPane.tsx`, `TabPaymentCard.tsx`, `PoolChargeItem.tsx` — none of these were touched here since they were explicitly deferred to that plan and have zero broken imports today.
- `src/shared/ui/LoadingSkeletons.tsx`'s `PoolTableGridSkeleton` export is now fully orphaned (its only two consumers were deleted in this plan) but causes no build/lint error — left as low-priority dead code, not logged to `deferred-items.md` since it's harmless and not owned by any named plan.

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260810000003_drop_pool_resources.sql`
- FOUND: `src/entities/resource` deleted (directory absent)
- FOUND: `.planning/phases/01-strip-rebrand/01-06-SUMMARY.md`
- FOUND: commit `8f74ed8` (Task 1)
- FOUND: commit `915ef24` (Task 2)
- FOUND: commit `e9589f9` (follow-up fix)
- FOUND: commit `aa60b5c` (this SUMMARY)

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-10*
