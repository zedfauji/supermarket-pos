---
phase: 08-sale-payment-workflow-wiring-cleanup
plan: 03
subsystem: payments
tags: [i18n, error-handling, result, supabase, react-i18next]

# Dependency graph
requires:
  - phase: 08-sale-payment-workflow-wiring-cleanup
    provides: D-09 (raw error never reaches UI), D-10 (featOrders/wPanels sweep boundary), RESEARCH.md's project-wide grep locating the toast.error(result.error.message) pattern
provides:
  - useRemoveTabItem, useReopenTab, useEditPaidTab, useMutationCreateCajaEntry (entities/caja) each translate their unmapped-error fallback instead of surfacing raw Postgres/RPC error text
  - New unit test coverage for useReopenTab and useEditPaidTab (previously only live-DB integration tests existed)
affects: [08-04 (useProcessRefund's own raw-leak fix, sequenced after 08-02 due to shared-file conflict), any future featOrders mutation-hook audit]

# Actuals (#2632)
actuals:
  tokens: 4800
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unmapped-error interception: check `error.code === 'SUPABASE_ERROR'` (or the hook's local equivalent) before falling back to a translated genericError, leaving every other already-mapped AppErrorCode branch untouched"

key-files:
  created:
    - src/features/reopen-tab/model/useReopenTab.test.ts
    - src/features/edit-paid-tab/model/useEditPaidTab.test.ts
  modified:
    - src/features/remove-tab-item/useRemoveTabItem.ts
    - src/features/remove-tab-item/useRemoveTabItem.test.ts
    - src/features/reopen-tab/model/useReopenTab.ts
    - src/features/edit-paid-tab/model/useEditPaidTab.ts
    - src/entities/caja/model/queries.ts
    - src/entities/caja/model/queries.test.ts
    - src/shared/lib/i18n/locales/en-US/featOrders.json
    - src/shared/lib/i18n/locales/es-MX/featOrders.json

key-decisions:
  - "useReopenTab/useEditPaidTab's exception-path fix only intercepts when rpcRes.error.code === 'SUPABASE_ERROR' (the default/unmapped branch from parseSupabaseError), leaving STALE_VERSION/NOT_FOUND_VERSIONED/NO_OPEN_CAJA/AUTH_FORBIDDEN passthrough exactly as before — matches plan's acceptance criteria that mapped codes stay byte-identical"
  - "Payload-path fix drops `result?.message ??` entirely rather than keeping it as a lower-priority fallback, since the RPC's own message field was found to be the raw leak source per plan's D-09 finding"
  - "useMutationCreateCajaEntry's fix lives in entities/caja/model/queries.ts (the actual leak origin), not in features/register-caja-entry/model/useRegisterCajaEntry.ts, which only forwards the mutation result untouched"

patterns-established:
  - "Pattern 1: unmapped-error interception guard — `code === 'SUPABASE_ERROR' ? translated : passthrough` — reusable for any future featOrders/wPanels hook found leaking raw Postgres text"

requirements-completed: [SALE-05]

coverage:
  - id: D1
    description: "useRemoveTabItem's RPC-exception fallback returns a translated genericError instead of the raw Postgres error.message"
    requirement: "SALE-05"
    verification:
      - kind: unit
        ref: "src/features/remove-tab-item/useRemoveTabItem.test.ts#returns SUPABASE_ERROR when the RPC call itself errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "useReopenTab and useEditPaidTab each fix both raw-leak sites (exception-path passthrough and payload-path message priority bug) while leaving all already-mapped error codes untouched"
    requirement: "SALE-05"
    verification:
      - kind: unit
        ref: "src/features/reopen-tab/model/useReopenTab.test.ts (3 cases: unmapped exception, unmapped payload code, REOPEN_CAP_EXCEEDED regression)"
        status: pass
      - kind: unit
        ref: "src/features/edit-paid-tab/model/useEditPaidTab.test.ts (3 cases: unmapped exception, unmapped payload code, TAB_NOT_EDITABLE regression)"
        status: pass
    human_judgment: false
  - id: D3
    description: "useMutationCreateCajaEntry translates the caja_entries insert's unmapped-error fallback while leaving duplicate/FK/not-null/RLS mapped codes unchanged"
    requirement: "SALE-05"
    verification:
      - kind: unit
        ref: "src/entities/caja/model/queries.test.ts#useMutationCreateCajaEntry (2 cases: unmapped Postgres error, DUPLICATE_ENTRY regression)"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-08-18
status: complete
---

# Phase 08 Plan 03: featOrders raw-Postgres-error-leak sweep Summary

**Translated the unmapped-error fallback in useRemoveTabItem, useReopenTab, useEditPaidTab, and useMutationCreateCajaEntry so a cashier/manager never sees raw `relation "..." does not exist`-shaped Postgres text in a toast — only the already-actionable, already-mapped error codes (NOT_FOUND, TAB_NOT_OPEN, CAJA_CLOSED, AUTH_FORBIDDEN, REOPEN_CAP_EXCEEDED, TAB_NOT_EDITABLE, STALE_VERSION, duplicate/FK/RLS, etc.) were left untouched.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-18T08:45:00-06:00
- **Completed:** 2026-08-18T08:49:16-06:00
- **Tasks:** 3
- **Files modified:** 10 (2 new test files, 8 modified)

## Accomplishments
- `useRemoveTabItem.ts` line 50's `err(supabaseError(error.message, ...))` now uses `i18n.t('featOrders:removeTabItem.genericError')`; existing test strengthened to assert the translated message, not the raw mock.
- `useReopenTab.ts` and `useEditPaidTab.ts` each had two raw-leak sites fixed: the exception-path `return err(rpcRes.error)` now intercepts only the `SUPABASE_ERROR` default branch (STALE_VERSION/NOT_FOUND_VERSIONED/NO_OPEN_CAJA/AUTH_FORBIDDEN untouched), and the payload-path `message: result?.message ?? i18n.t(...)` now always uses the translated message (the `result?.message ??` priority bug is gone).
- `entities/caja/model/queries.ts`'s `useMutationCreateCajaEntry` now intercepts the `SUPABASE_ERROR` default branch from `parseSupabaseError` and returns a translated `registerCajaEntry.genericError` message; already-mapped codes (23505 duplicate, 23503 FK, 23502 not-null, 42501 RLS) pass through `res as Result<CajaEntry>` unchanged.
- New unit test files for `useReopenTab` and `useEditPaidTab` (previously only live-DB integration coverage existed) — 3 cases each proving the fix plus a regression case proving an already-mapped code (`REOPEN_CAP_EXCEEDED`, `TAB_NOT_EDITABLE`) is unaffected.
- New i18n keys added to both `en-US` and `es-MX` `featOrders.json`: `removeTabItem.genericError`, `registerCajaEntry.genericError`. `reopenTab.genericError`/`editPaidTab.genericError` already existed and were reused verbatim.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix useRemoveTabItem's raw-message leak** - `4e52cd5` (fix)
2. **Task 2: Fix useReopenTab and useEditPaidTab's two-branch raw-message leak** - `ba65c05` (fix)
3. **Task 3: Fix useMutationCreateCajaEntry's raw-message leak** - `134f51c` (fix)

_Note: tasks were type="tracer" tdd="true", but each was executed with the fix + strengthened/new test landing in the same commit — the plan's `<action>` blocks specified test changes as part of each task's single deliverable, not a separate RED commit._

## Files Created/Modified
- `src/features/remove-tab-item/useRemoveTabItem.ts` - translates RPC-exception fallback message
- `src/features/remove-tab-item/useRemoveTabItem.test.ts` - strengthened existing SUPABASE_ERROR test to assert translated message
- `src/features/reopen-tab/model/useReopenTab.ts` - fixes both exception-path and payload-path raw-leak sites
- `src/features/reopen-tab/model/useReopenTab.test.ts` - new file, 3 cases
- `src/features/edit-paid-tab/model/useEditPaidTab.ts` - fixes both exception-path and payload-path raw-leak sites
- `src/features/edit-paid-tab/model/useEditPaidTab.test.ts` - new file, 3 cases
- `src/entities/caja/model/queries.ts` - `useMutationCreateCajaEntry` intercepts unmapped SUPABASE_ERROR branch
- `src/entities/caja/model/queries.test.ts` - new `describe('useMutationCreateCajaEntry')` block, 2 cases
- `src/shared/lib/i18n/locales/en-US/featOrders.json` - added `removeTabItem.genericError`, `registerCajaEntry.genericError`
- `src/shared/lib/i18n/locales/es-MX/featOrders.json` - added `removeTabItem.genericError`, `registerCajaEntry.genericError`

## Decisions Made
- Followed the plan's exact interception pattern (`code === 'SUPABASE_ERROR' ? translated : passthrough`) rather than a broader rewrite of each hook's error-mapping surface — keeps the diff minimal and every already-actionable error code byte-identical, per the plan's explicit prohibition.
- `useMutationCreateCajaEntry`'s fix landed in `entities/caja/model/queries.ts` (confirmed as the actual leak origin per plan's `<read_first>`), not in `features/register-caja-entry/model/useRegisterCajaEntry.ts`, which only forwards the result untouched.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- This worktree had no `node_modules` and no `.env.local` (both gitignored, not checked out into a fresh worktree). Symlinked `node_modules` from the sibling main checkout (`/home/widowsvail/ai/POS/supermarket-pos/node_modules`) to run tests/typecheck/lint without a slow `npm ci`, and exported `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` inline from the main checkout's `.env.local` (local self-hosted Supabase stack at `localhost:8000`, not production) for the vitest run's `global-setup.ts` connectivity check. Neither the symlink nor the env values were written into any tracked or untracked file in the worktree — this is a within-worktree test-execution workaround, not a plan file change.
- Full unit suite (`npm run test`) confirmed green after all three commits: 118 test files passed, 1115 tests passed, 15 todo (pre-existing), 2 skipped (pre-existing) — no other test asserted on the old raw-message behavior.

## Next Phase Readiness
- `useProcessRefund.ts`'s own raw-leak fix is out of scope for this plan (handled by 08-02/08-04) and was not touched, per the parallel-execution scope note.
- All four featOrders mutation hooks named in D-10's boundary (`remove-tab-item`, `reopen-tab`, `edit-paid-tab`, `register-caja-entry`) now conform to the "raw error never reaches UI" invariant; no further featOrders sweep work remains from this plan's scope.

---
*Phase: 08-sale-payment-workflow-wiring-cleanup*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: src/features/reopen-tab/model/useReopenTab.test.ts
- FOUND: src/features/edit-paid-tab/model/useEditPaidTab.test.ts
- FOUND: .planning/phases/08-sale-payment-workflow-wiring-cleanup/08-03-SUMMARY.md
- FOUND: commit 4e52cd5
- FOUND: commit ba65c05
- FOUND: commit 134f51c
