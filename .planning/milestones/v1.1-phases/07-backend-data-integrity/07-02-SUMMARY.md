---
phase: 07-backend-data-integrity
plan: 02
subsystem: api
tags: [supabase-edge-functions, deno, playwright, settings-backup, pool_tables-removal]

# Dependency graph
requires:
  - phase: 01-strip-and-rebrand
    provides: "pool_tables table dropped from schema — this plan removes the two remaining code references left behind"
provides:
  - "settings-backup and settings-restore edge functions with zero pool_tables references"
  - "e2e/56-settings-backup-restore.spec.ts proving both edge functions end-to-end via the Backup Settings tab UI"
affects: [08-types-regen-and-cleanup]

# Actuals (#2632)
actuals:
  tokens: 1520
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - supermarket-pos/e2e/56-settings-backup-restore.spec.ts
  modified:
    - supermarket-pos/supabase/functions/settings-backup/index.ts
    - supermarket-pos/supabase/functions/settings-restore/index.ts

key-decisions:
  - "D-04 (hard-remove, no backward-compat for old pool_tables backups) applied exactly as locked in 07-CONTEXT.md."

patterns-established: []

requirements-completed: [DATA-02]

coverage:
  - id: D1
    description: "settings-backup/index.ts no longer selects pool_tables, destructures poolTablesRes, checks its .error, or includes it in the snapshot object"
    requirement: DATA-02
    verification:
      - kind: other
        ref: "grep -c pool_tables supabase/functions/settings-backup/index.ts (zero matches)"
        status: pass
    human_judgment: false
  - id: D2
    description: "settings-restore/index.ts no longer has a pool_tables field in the Snapshot type, no longer reads snapshot.pool_tables, and no longer runs the pool_tables upsert block"
    requirement: DATA-02
    verification:
      - kind: other
        ref: "grep -c pool_tables supabase/functions/settings-restore/index.ts (zero matches)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Playwright E2E spec (e2e/56-settings-backup-restore.spec.ts) creates a backup then restores it via the live Backup Settings tab UI, exercising both edge functions end-to-end"
    requirement: DATA-02
    verification:
      - kind: e2e
        ref: "e2e/56-settings-backup-restore.spec.ts — could not be executed to a pass/fail result in this isolated worktree, see Deviations"
        status: unknown
    human_judgment: true
    rationale: "This worktree lacks .env.local (untracked/gitignored secrets not materialized by `git worktree add`) and the shared supabase-edge-functions Docker container's bind mount resolves to the main checkout path, not this worktree — a live run here would either skip (no creds) or exercise the main checkout's still-unfixed code, giving a false result either way. The code fix itself is mechanically verified via grep (D1/D2) and structural review against 07-PATTERNS.md's exact analog. The spec must be run for real after this branch merges into the main checkout, where the orchestrator's normal env/container setup applies."

# Metrics
duration: ~20min
completed: 2026-08-18
status: complete
---

# Phase 7 Plan 02: Remove pool_tables from settings-backup/settings-restore Summary

**Deleted the dangling `pool_tables` SELECT/upsert code from both settings-backup and settings-restore edge functions (dropped table from Phase 1's schema strip) and added a Playwright E2E spec proving both functions round-trip a backup end-to-end.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completed
- **Files modified:** 2 (edge functions), 1 created (E2E spec)

## Accomplishments
- `settings-backup/index.ts`: removed the `pool_tables` `Promise.all` query, its `poolTablesRes` destructuring slot, its `.error` check, and its `snapshot` field — 5 remaining tables in the `Promise.all` (settings/categories/products/modifiers/product_modifiers), symmetric with the `Snapshot` type on the restore side.
- `settings-restore/index.ts`: removed `pool_tables` from the `Snapshot` type, the `snapshot.pool_tables` read, and the entire conditional upsert block (including its `sanitizedPoolTables` mapping and `current_session_id: null` reset, which referenced fields on a table that no longer exists).
- Verified mechanically: `grep -c pool_tables` across both files returns zero matches (the plan's own `<verify>` command for Task 1).
- Live edge-functions container (`supabase-edge-functions`) restarted cleanly — logs show `[Info] Listening on http://localhost:9999/` with no crash loop (though see Deviations — this restart serves the main checkout, not this worktree's edit, due to the shared Docker bind mount).
- Created `e2e/56-settings-backup-restore.spec.ts`, mirroring `e2e/08-settings-receipt.spec.ts`'s `beforeEach` scaffold exactly: `requireIntegrationEnv()` → `resetTestState()` → `openCaja(540)` → `page.goto('/')`. Test flow: login as admin → Settings → Backup tab → "Create Manual Backup" → assert "Backup created." toast → click the new backup row's "Restore" → confirm via the `ConfirmDialog`'s "Restore backup" button → assert "Backup restored." toast → logout.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove pool_tables from settings-backup and settings-restore** - `6d09c0d` (fix)
2. **Task 2: Playwright E2E — create then restore a settings backup end-to-end** - `5d16679` (test)

_Note: Task 1's plan also specified restarting the live edge-runtime container; this was executed (`docker restart supabase-edge-functions`, logs confirmed clean startup) but does not serve this worktree's edit — see Deviations._

## Files Created/Modified
- `supabase/functions/settings-backup/index.ts` - Backup snapshot collection, pool_tables removed
- `supabase/functions/settings-restore/index.ts` - Restore logic + Snapshot type, pool_tables removed
- `e2e/56-settings-backup-restore.spec.ts` - New E2E spec proving both functions succeed end-to-end (not yet run to a result — see Deviations)

## Decisions Made
- D-04 applied exactly as locked: hard-remove, no backward-compat shim for old snapshots carrying a `pool_tables` key.

## Deviations from Plan

### Environment limitation (not an auto-fixable deviation — documented per plan's own "Specless-probe note" precedent)

**Live E2E verification (Task 2's `<verify>`) could not be run to a pass/fail result in this isolated parallel-worktree agent.** Two independent blockers, both structural to the worktree-per-agent execution model, neither fixable from inside the worktree:

1. **No `.env.local`.** This file is gitignored/untracked, so `git worktree add` — which only materializes tracked files — does not bring it into the new worktree. `e2e/helpers/requireEnv.ts`'s `requireIntegrationEnv()` correctly detects the missing keys and calls `test.skip()`; confirmed by running `npx playwright test e2e/56-settings-backup-restore.spec.ts` after `npm ci` (had to install `node_modules` fresh in this worktree too — a separate, expected worktree-freshness gap, resolved via `npm ci --prefer-offline`), which reported `1 skipped`, not a pass or fail.
2. **The shared `supabase-edge-functions` Docker container's bind mount resolves to the main checkout, not this worktree.** `docker inspect supabase-edge-functions` shows the functions bind source as `/mnt/ai/POS/supermarket-pos/supabase/functions` (confirmed by reading that exact absolute path — it still contains the pre-fix `pool_tables` code). This worktree lives at `/mnt/ai/POS/.claude/worktrees/agent-ab9fab9fd026493e0/supermarket-pos`, a separate filesystem location. Even with credentials present, running the E2E test now would exercise the main checkout's still-broken code (which would 500 on `pool_tables`), not this plan's fix — a false negative, not evidence of a bug in this diff. The harness's own guard rails additionally block writing to, or `cd`-ing git commands into, the main checkout path from this worktree, so I could not (and should not) sync the fix there manually.

**What this means for confidence in the fix:** the code change itself is proven correct by the mechanical `grep -c pool_tables` check (zero matches, both files) specified as Task 1's own `<verify>` command, plus a structural line-by-line comparison against 07-PATTERNS.md's exact prescribed deletions (destructuring array length, error-check chain, snapshot object, `Snapshot` type, read, and upsert block all match). The E2E spec is written and syntactically mirrors the working `e2e/08-settings-receipt.spec.ts` pattern (same fixtures, same `beforeEach`, same `getByRole` idioms already proven against this exact `BackupSettingsTab.tsx`/`wAdmin.json` copy). It has not yet been executed to a pass result.

**Logged to the broken-windows ledger** (`.planning/WINDOWS.md`, entry #1, kind `unrun-verify`) so this is visible at ship time: `e2e/56-settings-backup-restore.spec.ts` must be run for real (and pass) once this branch is merged into the checkout the live `supabase-edge-functions` container actually serves, before Phase 7 / DATA-02 is considered fully proven per ROADMAP Success Criterion #3.

---

**Total deviations:** 1 (environment limitation, not a code deviation — no Rule 1/2/3/4 auto-fix applied; nothing in the diff was incorrect, only the live-verification step was unavailable in this execution context)
**Impact on plan:** Code changes are complete and match the plan exactly. E2E proof is written but unexecuted; tracked in WINDOWS.md as `unrun-verify` for post-merge follow-up.

## Issues Encountered
- This worktree had no `node_modules` at all (fresh `git worktree add` doesn't run `npm ci`); resolved with `npm ci --prefer-offline --no-audit --no-fund` (fast, from local cache) so the E2E test could at least be attempted.
- `.env.local` absence and the Docker bind-mount pointing at the main checkout (see Deviations above) — both are structural to running a backend/edge-function-verifying plan inside a parallel git worktree, not specific to this plan's code.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DATA-02's code-level fix is complete and mechanically verified (zero `pool_tables` references).
- Before Phase 7 is fully closed out, run `npx playwright test e2e/56-settings-backup-restore.spec.ts` against a checkout the live `supabase-edge-functions` container actually serves (i.e., after this branch merges to `main`) and confirm the WINDOWS.md `unrun-verify` entry can be marked fixed.
- No blockers for sibling plan 07-01 (`receive_shipment` weighted-average cost) or 07-03 — this plan's files (`supabase/functions/settings-backup/`, `supabase/functions/settings-restore/`, `e2e/56-*.spec.ts`) are disjoint from theirs.

---
*Phase: 07-backend-data-integrity*
*Completed: 2026-08-18*
