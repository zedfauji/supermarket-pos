---
phase: 17-e2e-suite-overhaul
plan: 03
subsystem: testing
tags: [playwright, supabase, rls, e2e]
requires:
  - phase: 17-02
    provides: Indian-grocery E2E seed catalog
provides:
  - Schema-safe shared E2E reset helper
  - Signed-in role-scoped Supabase client for RLS-denial assertions
  - Folder-based Playwright verification report grouping
affects: [17-04, 17-05, 17-06, rls-boundary, e2e-reporting]
actuals:
  tokens: 7309
  tasks: 3
  commits: 4
tech-stack:
  added: []
  patterns: [anon-key signed-in RLS test client, folder-derived report labels]
key-files:
  created: [e2e/helpers/rls-clients.ts, e2e/helpers/rls-clients.test.ts]
  modified: [e2e/helpers/supabase.ts, e2e/global-teardown.ts]
key-decisions:
  - "RLS-denial clients always use an anon-key sign-in and isolated storage key."
  - "Playwright report grouping is derived from spec folders, not filename prefixes."
patterns-established:
  - "Use createRoleScopedClient() and cleanup() for E2E RLS-boundary assertions."
requirements-completed: [TEST-01, TEST-02]
coverage:
  - id: D1
    description: Shared reset helper removes dropped schema references.
    requirement: TEST-01
    verification:
      - kind: other
        ref: npm run typecheck and required grep gates
        status: pass
    human_judgment: false
  - id: D2
    description: Role-scoped anon client signs in and exposes cleanup.
    requirement: TEST-02
    verification:
      - kind: unit
        ref: e2e/helpers/rls-clients.test.ts#createRoleScopedClient
        status: pass
    human_judgment: false
  - id: D3
    description: Verification reports classify specs from folder paths.
    verification:
      - kind: other
        ref: e2e/global-teardown.ts missing-results fallback invocation
        status: pass
    human_judgment: false
duration: 12min
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 03: E2E shared-helper cleanup Summary

**Schema-safe E2E resets, real role-bound RLS clients, and folder-based Playwright report groups.**

## Performance

- **Duration:** 12 min
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- Removed obsolete pool, KDS, Rappi, and prep-schema operations from the shared reset helper.
- Added a disposable anon-key authenticated client for genuine RLS-denial assertions.
- Replaced filename-prefix report grouping with future-proof folder labels.

## Task Commits

1. **Task 1: strip dead bar-pos code** — `4c44f44` (fix)
2. **Task 2: role-scoped client helper (RED)** — `a6b34ce` (test)
3. **Task 2: role-scoped client helper (GREEN)** — `9075d8f` (feat)
4. **Task 3: folder-path teardown grouping** — `7572478` (fix)

## Files Created/Modified

- `e2e/helpers/supabase.ts` — removes dropped-schema queries and legacy product defaults.
- `e2e/helpers/rls-clients.ts` — creates and cleans up signed-in temporary role clients.
- `e2e/helpers/rls-clients.test.ts` — verifies the helper's isolated anon-client contract.
- `e2e/global-teardown.ts` — groups results from each spec's folder path.

## Decisions Made

- RLS assertions receive only a freshly signed-in anon-key client; service-role remains setup/teardown only.
- Product reset defaults apply to all products rather than historical named fixtures.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

`requirements.mark-complete TEST-01 TEST-02` could not update the requirement registry because those IDs are absent there; the plan's declared IDs remain recorded in this summary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 2 can move specs into domain folders, use Indian-grocery fixtures, and import the RLS helper for denial tests.

## Self-Check: PASSED

- All four task commits exist and all created files are present.
- `npm run typecheck` passes.
