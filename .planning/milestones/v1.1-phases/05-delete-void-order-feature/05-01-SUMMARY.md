---
phase: 05-delete-void-order-feature
plan: 01
subsystem: auth
tags: [rbac, zod, feature-sliced-design, dead-code-removal, supabase-edge-functions]

# Dependency graph
requires:
  - phase: none
    provides: n/a — this is the first plan of Phase 5, no prior-phase dependency
provides:
  - "src/features/void-order/ folder deleted (zero live importers, proven by full-repo grep + green pipeline)"
  - "rbac.ts's StaffAction union no longer admits 'void_order' — client-side half of D-01's RBAC lockstep"
  - "edge-function-contracts.ts no longer exports VoidOrderRequestSchema/VoidOrderResponseSchema/callVoidOrder or registers a 'void-order' registry entry"
  - "audit-edge-coverage.test.ts's SENSITIVE_EDGE_FUNCTIONS allowlist no longer names 'void-order', unblocking 05-02-PLAN.md's supabase/functions/void-order/ directory deletion"
affects: [05-02-PLAN.md]

# Actuals (#2632)
actuals:
  tokens: 7953
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tracer-first deletion order: delete the zero-importer leaf (feature folder) and prove the full pipeline green before touching shared risk-bearing files (rbac.ts, edge-function-contracts.ts) that other code still imports from."

key-files:
  created: []
  modified:
    - src/features/void-order/ (deleted: model/useVoidOrder.ts, model/useVoidOrder.test.tsx, ui/VoidOrderDialog.tsx, ui/VoidOrderDialog.test.tsx, index.ts)
    - src/shared/lib/rbac.ts
    - src/shared/ui/ProtectedAction.test.tsx
    - src/shared/lib/rbac.test.ts
    - src/shared/lib/edge-function-contracts.ts
    - src/shared/lib/__tests__/audit-edge-coverage.test.ts

key-decisions:
  - "Re-ran the orphan-check grep independently before deleting (per Task 1's read_first instruction), not trusting CONTEXT.md's timestamp blindly — reconfirmed zero live importers of VoidOrderDialog/useVoidOrder outside their own folder."
  - "ProtectedAction.test.tsx's now-invalid 'void_order' literal swapped to 'process_refund' (a MANAGER_EXTRA member with the same 'manager-tier action denied to cashier' test intent), per plan instruction and RESEARCH.md's Pitfall 1 finding."
  - "edge-function-contracts.test.ts left unmodified per Task 3's explicit note — verified it has zero void-order references and doesn't iterate the registry generically, so no edit was needed despite CONTEXT.md/RESEARCH.md's stale claim otherwise."

patterns-established: []

requirements-completed: [SALE-01]

coverage:
  - id: D1
    description: "src/features/void-order/ deleted end-to-end (5 files) with zero regressions — the whole client feature folder is gone from the repo"
    requirement: "SALE-01"
    verification:
      - kind: unit
        ref: "npm run typecheck (exit 0) + npm run lint (exit 0) + npm run test (1103->1098 tests, all pass) after folder deletion"
        status: pass
    human_judgment: false
  - id: D2
    description: "rbac.ts's Action union no longer admits 'void_order' in either STAFF_ACTIONS or MANAGER_EXTRA; ProtectedAction.test.tsx and rbac.test.ts updated to match"
    requirement: "SALE-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/rbac.test.ts + src/shared/ui/ProtectedAction.test.tsx (83 tests pass), npm run typecheck exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "edge-function-contracts.ts no longer exports VoidOrderRequestSchema/VoidOrderResponseSchema/callVoidOrder or registers a 'void-order' registry entry; audit-edge-coverage.test.ts allowlist updated"
    requirement: "SALE-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/__tests__/audit-edge-coverage.test.ts + src/shared/lib/edge-function-contracts.test.ts (29 tests pass), npm run typecheck exit 0"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-17
status: complete
---

# Phase 5 Plan 1: Delete void-order client feature Summary

**Deleted the orphaned `src/features/void-order/` feature folder, dropped `void_order` from rbac.ts's client-side Action union, and removed its edge-function contract exports/registry entry and audit-coverage allowlist entry — the frontend/shared-lib half of SALE-01, with `npm run typecheck && npm run lint && npm run test` green after every task.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-17T05:16:00Z
- **Completed:** 2026-08-17T05:23:26Z
- **Tasks:** 3
- **Files modified:** 10 (5 deleted, 5 edited)

## Accomplishments
- `src/features/void-order/` (5 files: `model/useVoidOrder.ts` + `.test.tsx`, `ui/VoidOrderDialog.tsx` + `.test.tsx`, `index.ts`) deleted end-to-end after independently re-confirming zero live importers via full-repo grep.
- `rbac.ts`'s `STAFF_ACTIONS` and `MANAGER_EXTRA` both dropped `'void_order'` in the same task (D-01 lockstep), with `ProtectedAction.test.tsx` and `rbac.test.ts` updated so the suite stays green against the narrower `StaffAction` union.
- `edge-function-contracts.ts`'s `VoidOrderRequestSchema`/`VoidOrderResponseSchema`/`callVoidOrder`/registry entry removed; `audit-edge-coverage.test.ts`'s `SENSITIVE_EDGE_FUNCTIONS` allowlist and header JSDoc updated so it no longer names a directory 05-02-PLAN.md is about to delete.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Delete the void-order feature folder end-to-end** - `186f1fc` (feat)
2. **Task 2: Remove void_order from rbac.ts's Action union** - `2fc6d9f` (feat)
3. **Task 3: Remove edge-function contract exports and coverage-gate registration** - `c00c8c6` (feat)

_Note: all three tasks were `type="auto"`/`type="tracer"` (non-TDD), one commit per task._

## Files Created/Modified
- `src/features/void-order/model/useVoidOrder.ts` - deleted (client mutation hook, zero live importers)
- `src/features/void-order/model/useVoidOrder.test.tsx` - deleted (its own test)
- `src/features/void-order/ui/VoidOrderDialog.tsx` - deleted (orphaned dialog component)
- `src/features/void-order/ui/VoidOrderDialog.test.tsx` - deleted (its own test)
- `src/features/void-order/index.ts` - deleted (feature barrel export)
- `src/shared/lib/rbac.ts` - removed `'void_order'` from `STAFF_ACTIONS` and `MANAGER_EXTRA`
- `src/shared/ui/ProtectedAction.test.tsx` - swapped `action="void_order"` → `action="process_refund"` on the manager-denial test
- `src/shared/lib/rbac.test.ts` - removed `'void_order'` from the `ALLOWED.manager` mirror Set and its `rbacDenialMessage` assertion
- `src/shared/lib/edge-function-contracts.ts` - removed the VOID ORDER schema/type/caller block and the `'void-order'` registry entry
- `src/shared/lib/__tests__/audit-edge-coverage.test.ts` - removed `'void-order'` from `SENSITIVE_EDGE_FUNCTIONS`, rewrote header JSDoc to stop describing it as a pending coverage item

## Decisions Made
- Followed the plan's tracer-first task ordering exactly: lowest-risk zero-importer deletion first (Task 1), then the two shared-file edits (Tasks 2-3), verifying the full local pipeline (`typecheck`/`lint`/`test`) after each.
- Confirmed via `git diff` after each task that only the exact lines named in the plan's `<action>` were touched — no incidental edits to `CASHIER_ACTIONS`/`KITCHEN_ACTIONS` or to `edge-function-contracts.test.ts`.
- Auto mode is active (`workflow.auto_advance: true` in `.planning/config.json`), so the Task 1 tracer feedback gate was satisfied by re-running its `<verify>` command end-to-end (all green) and proceeding directly to Task 2/3 without a checkpoint, per the tracer feedback gate protocol.

## Deviations from Plan

None - plan executed exactly as written. All file/line targets named in each task's `<read_first>` and `<action>` matched the actual repo state exactly (rbac.ts's `void_order` sat between `close_tab` and `view_reports` in both `STAFF_ACTIONS` and `MANAGER_EXTRA` as documented; `edge-function-contracts.ts`'s VOID ORDER block and registry entry were exactly where described).

## Issues Encountered

**Worktree environment setup (not a plan deviation — environment-only, no source changes):** The git worktree this plan executed in had no `node_modules/` and no `.env.local` (both gitignored, not carried into a fresh worktree checkout). Symlinked both from the main repo checkout (`/home/widowsvail/ai/POS/supermarket-pos/`) — `node_modules` already built for this Linux platform, `.env.local` holding the Supabase test credentials `src/test/global-setup.ts` requires. Neither symlink is tracked by git (both paths are gitignored) and neither affected any committed file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend/shared-lib half of SALE-01 is complete: `src/features/void-order/` is gone, `rbac.ts` no longer admits `void_order`, and `edge-function-contracts.ts` no longer exports/registers its schemas or caller.
- 05-02-PLAN.md (the DB migration dropping `role_permissions` rows + `supabase/functions/void-order/` deletion + remaining D-03/D-04 sweep items: i18n keys, e2e spec, `e2e/09-rbac.spec.ts` T8/T9, `e2e/helpers/supabase.ts`'s `seedVoidableOrder`) is unblocked — `audit-edge-coverage.test.ts` no longer names the `void-order` directory, so that plan's edge-function deletion will not break this test.
- No blockers.

---
*Phase: 05-delete-void-order-feature*
*Completed: 2026-08-17*
