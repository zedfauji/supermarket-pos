---
phase: 06-security-hardening
plan: 02
subsystem: database
tags: [postgres, rls, supabase, react-query, settings]

# Dependency graph
requires: []
provides:
  - "receipt_settings table, migration-tracked, RLS-enforced (4 policies: select any authenticated, insert/update manager+admin, delete admin)"
  - "useReceiptSettings()/useMutationUpdateReceiptSettings() query/mutation pair in @entities/settings"
affects: [06-03-security-hardening, phase-7-data-integrity]

# Actuals (#2632)
actuals:
  tokens: 3312
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["fixed-sentinel-id upsert for a true one-row singleton table (no key/terminal dimension)"]

key-files:
  created:
    - supabase/migrations/20260819000001_receipt_settings.sql
  modified:
    - src/entities/settings/model/queries.ts
    - src/entities/settings/model/index.ts
    - src/entities/settings/index.ts

key-decisions:
  - "Old settings row (key='receipt') is DELETEd, not left orphaned — D-06 discretion, avoids a stale duplicate nothing reads anymore."
  - "receipt_settings enforced as a singleton via a fixed sentinel UUID (00000000-0000-0000-0000-000000000001) upserted with onConflict: 'id', not a DB-level uniqueness constraint — lowest-risk, most reversible way to satisfy D-04 without new schema machinery."
  - "useReceiptSettings() bypasses the shared supabaseQuery() helper and calls supabase directly — supabaseQuery() treats a null row as NOT_FOUND, but an empty receipt_settings table is the legitimate D-06 starting state."

patterns-established:
  - "receipt_settings stays untyped (supabase as any + scoped eslint-disable) until DATA-03 regenerates supabase.types.ts in Phase 8, matching CLAUDE.md's documented workaround and the useOverrideNegativeStock.ts precedent."

requirements-completed: [SEC-02]

coverage:
  - id: D1
    description: "receipt_settings exists as a migration-tracked table with RLS enabled and exactly 4 active policies on the live self-hosted DB"
    requirement: SEC-02
    verification:
      - kind: integration
        ref: "docker exec supabase-db psql -c \"select count(*) from pg_policies where tablename='receipt_settings'\" -> 4"
        status: pass
    human_judgment: false
  - id: D2
    description: "Old settings row (key='receipt') deleted after migration"
    requirement: SEC-02
    verification:
      - kind: integration
        ref: "docker exec supabase-db psql -c \"select count(*) from settings where key='receipt'\" -> 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "useReceiptSettings()/useMutationUpdateReceiptSettings() exist, are exported from @entities/settings, and correctly fall back to DEFAULT_RECEIPT on the D-06 empty-table state"
    requirement: SEC-02
    verification:
      - kind: unit
        ref: "npx eslint src/entities/settings/model/queries.ts src/entities/settings/model/index.ts src/entities/settings/index.ts --max-warnings 0 (clean)"
        status: pass
    human_judgment: true
    rationale: "No automated test exercises the fallback-to-DEFAULT_RECEIPT runtime behavior in this plan (deferred to 06-03's integration test per RESEARCH.md Pitfall 1) — typecheck/lint confirm the code compiles and is exported correctly, but the empty-table fallback path itself is unverified by an automated assertion in this plan."

duration: 25min
completed: 2026-08-17
status: complete
---

# Phase 06 Plan 02: receipt_settings table + RLS Summary

**Activated the long-dormant `receipt_settings` RLS policy SQL against a genuinely-created table, and added the client query/mutation pair the next plan repoints every consumer onto.**

## Performance

- **Duration:** 25 min
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `receipt_settings` is now a real, migration-tracked table on the live self-hosted DB — `CREATE TABLE` + `ENABLE ROW LEVEL SECURITY` + the 4 policies that had sat inert (guarded by `IF EXISTS`) inside `20260510000001_rls_rewrite_phase13.sql` since that migration was written, closing a zero-access-control gap (the table never existed, so it had no security posture to audit).
- The superseded `settings` row (`key='receipt'`) is deleted (D-06 discretion), removing a stale duplicate nothing will read going forward.
- `useReceiptSettings()`/`useMutationUpdateReceiptSettings()` added to `src/entities/settings/model/queries.ts`, reading/writing the new table directly instead of the generic `settings` key/value table, and correctly falling back to `DEFAULT_RECEIPT` when the table is empty (D-06's intentional no-backfill starting state).

## Task Commits

Each task was committed atomically:

1. **Task 1: [BLOCKING] receipt_settings migration — CREATE TABLE, activate RLS, apply to the live DB** - `8cf4284` (feat)
2. **Task 2: useReceiptSettings()/useMutationUpdateReceiptSettings() query/mutation pair** - `154053f` (feat)

## Files Created/Modified

- `supabase/migrations/20260819000001_receipt_settings.sql` - CREATE TABLE receipt_settings (10 ReceiptSettingsSchema fields as snake_case columns + id/updated_at/updated_by), trigger, ENABLE RLS, 4 CREATE POLICY statements copied verbatim from the drafted-but-inert SQL, DELETE of the superseded settings row, commented DOWN block
- `src/entities/settings/model/queries.ts` - `RECEIPT_SETTINGS_SINGLETON_ID`, `mapReceiptRow`/`toReceiptPayload` snake_case↔camelCase mappers, `useReceiptSettings()`, `useMutationUpdateReceiptSettings()`; removed `receipt` from `SettingsSnapshot`/`toSnapshot`/`SETTINGS_KEYS`
- `src/entities/settings/model/index.ts` - export the two new hooks
- `src/entities/settings/index.ts` - export the two new hooks

## Decisions Made

- Old `settings` row for `key='receipt'` is **deleted**, not orphaned (D-06 Claude's Discretion) — it is superseded data that nothing reads anymore once the client moves to the new table; leaving it would only risk misleading a future engineer into thinking it's still authoritative.
- Singleton enforcement uses a **fixed sentinel UUID** (`00000000-0000-0000-0000-000000000001`) upserted with `onConflict: 'id'`, not a new DB constraint — matches the plan's stated rationale: lowest-risk, most reversible way to guarantee "exactly one row" for a store-wide singleton (D-04) without inventing new schema machinery.
- `useReceiptSettings()`'s `queryFn` calls `supabase.from('receipt_settings').select('*').maybeSingle()` directly rather than through the shared `supabaseQuery()` helper, because `supabaseQuery()` treats a `null` row as a `NOT_FOUND` error — an empty `receipt_settings` table is the legitimate D-06 starting state, not an error condition.

## Deviations from Plan

None — plan executed exactly as written. One minor authoring inconsistency in the plan text was resolved per its own more-authoritative `<verification>` section: Task 2's `<acceptance_criteria>` literally says "typecheck and lint both exit 0" in the same sentence that documents `HardwareSettingsTab.tsx`/`useUploadLogo.ts`/`LogoImage`/`CajaDashboard` as *expected* to fail typecheck at this point. The plan's `<verification>` section (bottom of file) resolves this explicitly: "typecheck/lint pass for queries.ts/index.ts changes (consumer files intentionally fail typecheck until 06-03-PLAN.md repoints them)." Verified accordingly — `npm run typecheck`/`npm run lint` scoped to the 3 files this task modified are clean; the full-repo run surfaces exactly the 4 pre-declared consumer-file typecheck errors (and their 14 cascading lint errors) in `CajaDashboard.tsx`, `LogoImage/index.tsx`, and `HardwareSettingsTab.tsx` — no new/unexpected errors. This is not a deviation requiring a rule — it's following the plan's own documented intent.

## Issues Encountered

- This worktree had no `node_modules` (fresh checkout via `git worktree add`, `node_modules` is gitignored). `package-lock.json` was byte-identical to the sibling main checkout (`/home/widowsvail/ai/POS/supermarket-pos`), so `node_modules` was symlinked from there rather than running a full `npm ci` — same OS/arch, no dependency changes in this plan. The symlink is itself gitignored and was not committed.
- No pooler container (`supabase-pooler`) was running locally, so `supabase db push` was skipped in favor of the plan's documented fallback: `docker exec -i supabase-db psql -U supabase_admin -d postgres < <migration file>`, followed by manually registering the migration in `supabase_migrations.schema_migrations`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`receipt_settings` and its query/mutation pair are ready for 06-03-PLAN.md to repoint `HardwareSettingsTab.tsx`, `LogoImage/index.tsx`, `useUploadLogo.ts`, and `CajaDashboard.tsx` onto the new hooks, and to add the role-scoped RLS integration test (cashier can SELECT but not write; manager/admin can do all four) per RESEARCH.md's Pitfall 1 guidance — no blockers.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260819000001_receipt_settings.sql
- FOUND: .planning/phases/06-security-hardening/06-02-SUMMARY.md
- FOUND commit: 8cf4284
- FOUND commit: 154053f
- FOUND commit: 316c43d

---
*Phase: 06-security-hardening*
*Completed: 2026-08-17*
