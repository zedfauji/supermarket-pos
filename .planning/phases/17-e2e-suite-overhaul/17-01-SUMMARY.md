---
phase: 17-e2e-suite-overhaul
plan: 01
subsystem: testing
tags: [playwright, e2e, supabase]
requires: []
provides:
  - Agent-browser Chrome-for-Testing discovery with a bundled-Chromium fallback
  - Failure-only Playwright artifacts and an opt-in UI-mode runner
  - Shared service-role database assertion helpers for E2E specs
affects: [phase-17-e2e-suite-overhaul, playwright-config, e2e-helpers]
tech-stack:
  added: []
  patterns:
    - Reuse getServiceClient() for privileged E2E ground-truth assertions
    - Keep role-scoped RLS denial checks separate from service-role reads
key-files:
  created:
    - e2e/helpers/db-assertions.ts
  modified:
    - playwright.config.ts
    - package.json
key-decisions:
  - "Use agent-browser's highest installed Chrome-for-Testing binary when available, otherwise leave browser selection to Playwright."
  - "Capture debugging artifacts only for failed E2E runs."
requirements-completed: [TEST-02, TEST-03, TEST-04]
actuals:
  tokens: 1638
  tasks: 2
  commits: 3
coverage:
  - id: D1
    description: Playwright discovers the configured E2E suite with the new browser target and failure-only artifact policy.
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: npx playwright test --list
        status: pass
    human_judgment: false
  - id: D2
    description: Shared service-role database assertion helpers are typed and ready for downstream E2E specifications.
    requirement: TEST-03
    verification:
      - kind: other
        ref: npm run typecheck
        status: pass
    human_judgment: false
  - id: D3
    description: Playwright UI mode is available as an opt-in npm script.
    requirement: TEST-04
    verification:
      - kind: other
        ref: package.json test:e2e:ui script check
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 01: E2E Infrastructure Summary

**Agent-browser Chrome selection, failure-only artifacts, UI-mode monitoring, and reusable Supabase DB assertions for the rewritten E2E suite.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-25T05:32:30Z
- **Completed:** 2026-08-25T05:35:03Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Configured Playwright to prefer the highest agent-browser Chrome-for-Testing binary while retaining its bundled Chromium fallback.
- Retained traces, videos, and screenshots only after failures, while keeping headless serial execution unchanged.
- Added the `test:e2e:ui` runner and five service-role DB assertion helpers for stock, payments, audit logs, caja entries, and purchase orders.

## Task Commits

1. **Task 1: playwright.config.ts browser target + artifact policy + UI-mode script** — `5a62a6c` (chore)
2. **Task 2: shared DB-assertion module** — `0f05704` (test)
3. **Formatting follow-up** — `6219dfe` (style)

## Files Created/Modified

- `playwright.config.ts` — resolves agent-browser Chrome safely and retains artifacts only on failure.
- `package.json` — exposes `npm run test:e2e:ui`.
- `e2e/helpers/db-assertions.ts` — shared throw-to-fail committed-state assertions using `getServiceClient()`.

## Decisions Made

- Used `readdirSync` plus numeric `localeCompare` instead of a new semver dependency.
- Kept service-role assertions explicitly limited to post-action ground-truth reads; RLS-denial coverage belongs to role-scoped clients.

## Deviations from Plan

### Documented Constraints

- Task 2's TDD marker did not add a standalone test because the existing Vitest projects exclude `e2e/**` and the plan explicitly defines static verification for this service-role helper.
- `requirements.mark-complete` could not locate `TEST-02`, `TEST-03`, or `TEST-04` in the current requirements register, so no requirement checkbox was changed.

## Issues Encountered

- `npx tsc --noEmit --project e2e/tsconfig.json` reports pre-existing type errors in legacy E2E specs and `e2e/helpers/supabase.ts`. The required `npm run typecheck` passes, and the new helper introduced no reported error.

## Known Stubs

None.

## Next Phase Readiness

- Later Phase 17 specs can import `e2e/helpers/db-assertions.ts` instead of duplicating service-role queries.
- The main E2E config now runs without a system Chrome dependency when agent-browser's Chrome-for-Testing is installed.

## Self-Check: PASSED

- Confirmed all three delivered files exist.
- Confirmed commits `5a62a6c`, `0f05704`, and `6219dfe` exist.
- `npx playwright test --list` passed with 317 tests; `npm run typecheck` passed.
