---
phase: 09-reopen-and-edit-a-completed-sale
plan: 02
subsystem: testing
tags: [vitest, integration-test, supabase-rpc, edit_paid_tab, optimistic-concurrency]

requires:
  - phase: 22 (bar-pos era, v1.0)
    provides: edit_paid_tab RPC and its existing integration test suite (edit-paid-tab-rpc.integration.test.ts)
provides:
  - Automated regression proof that edit_paid_tab's TAB_NOT_EDITABLE guard already excludes status='open' (reopened) tabs
affects: [09-01, 09-03]

actuals:
  tokens: 650
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Direct tabs status flip in an integration test seed must also bump `version` by exactly +1 (Phase 15 bump_version_on_update trigger) and clear closed_at (closed_at_requires_closed_status check constraint) — a naive single-column status update fails both guards."

key-files:
  created: []
  modified:
    - src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts

key-decisions:
  - "Reused the file's existing seedPaidTab helper, then flipped status via a direct db.from('tabs').update(...) call rather than routing through reopen_tab — avoids pulling in reopen_tab's caja/reason/audit side effects that are irrelevant to this guard, per plan's explicit instruction."

patterns-established: []

requirements-completed: [SALE-03]

coverage:
  - id: D1
    description: "edit_paid_tab's TAB_NOT_EDITABLE guard is proven (not just read) to reject a status='open' (reopened) tab"
    requirement: "SALE-03"
    verification:
      - kind: integration
        ref: "src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts#SC-5: TAB_NOT_EDITABLE is returned when the tab is status=open (a reopened sale, not paid/closed)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-18
status: complete
---

# Phase 9 Plan 2: SC-5 edit_paid_tab regression coverage Summary

**Added one integration test proving `edit_paid_tab`'s existing `TAB_NOT_EDITABLE` guard already rejects a reopened (`status='open'`) sale — zero production code changed.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-18T17:41:00Z
- **Completed:** 2026-08-18T17:43:34Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- New `it('SC-5: TAB_NOT_EDITABLE is returned when the tab is status=open (a reopened sale, not paid/closed)', ...)` test case added to the existing `edit_paid_tab RPC (integration)` describe block.
- Confirmed via a real Supabase call (not source inspection) that `edit_paid_tab`'s `v_status NOT IN ('paid', 'closed')` guard already structurally excludes `status='open'` reopened sales, returning `{ ok: false, code: 'TAB_NOT_EDITABLE' }`.
- All 10 tests in the file (9 pre-existing + 1 new) pass; `npm run typecheck` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the SC-5 TAB_NOT_EDITABLE(status='open') regression test** - `c306803` (test)

**Plan metadata:** SUMMARY.md commit (this file) — pending, see below.

## Files Created/Modified
- `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` - Added SC-5 regression test case (26 lines), no other changes.

## Decisions Made
- Seed the reopened-tab state with a direct service-role `tabs` update (status='open') rather than calling `reopen_tab`, per the plan's explicit guidance to avoid pulling in `reopen_tab`'s caja/reason/audit side effects, which are irrelevant to `edit_paid_tab`'s guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Direct `tabs` status-only update violated two existing DB guards not called out in the plan's action text**
- **Found during:** Task 1 (first `npx vitest run` attempt)
- **Issue:** The plan's action described `db.from('tabs').update({ status: 'open' }).eq('id', seed.tabId)`. Running this failed with `STALE_VERSION` (Phase 15's `bump_version_on_update` trigger requires every `tabs` UPDATE to advance `version` by exactly +1, not just updates that intend to change version) and, after fixing that, with `new row for relation "tabs" violates check constraint "closed_at_requires_closed_status"` (the seeded row has `closed_at` set from `seedPaidTab`'s `status: 'paid'` insert; a `status='open'` row must have `closed_at` null).
- **Fix:** Updated the seed statement to `db.from('tabs').update({ status: 'open', version: seed.version + 1, closed_at: null }).eq('id', seed.tabId)`, and used `seed.version + 1` as `p_expected_version` in the subsequent `edit_paid_tab` RPC call (the RPC's version guard runs before its status guard, so the expected-version value must match the post-update row or the test would fail on `STALE_VERSION` instead of exercising `TAB_NOT_EDITABLE`).
- **Files modified:** src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts (same file, same task)
- **Verification:** `npx vitest run src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` — 10/10 tests pass.
- **Committed in:** c306803 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test seed, not production code)
**Impact on plan:** Necessary correctness fix to make the test actually exercise the `TAB_NOT_EDITABLE` path instead of failing earlier on unrelated DB guards. No scope creep — no production code touched.

## Issues Encountered
- This worktree had no `node_modules` and no `.env.local`. Ran `npm ci --prefer-offline --no-audit --no-fund` (fast, served from local npm cache) and copied `.env.local` from the main checkout (`/mnt/ai/POS/supermarket-pos/.env.local`) so the integration test's `global-setup.ts` (which requires `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` unconditionally, even under `describe.skipIf`) could connect to the local Supabase instance. Both are gitignored and not part of this plan's commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SC-5 from ROADMAP.md Phase 9 is now satisfied by automated test coverage, independent of and parallel-safe with Plans 09-01/09-03's UI work (different file, no overlap).
- No blockers for the rest of Phase 9.

---
*Phase: 09-reopen-and-edit-a-completed-sale*
*Completed: 2026-08-18*
