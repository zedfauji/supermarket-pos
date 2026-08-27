---
phase: 01-strip-rebrand
plan: 04
subsystem: routing
tags: [react-router, react, e2e, playwright, feature-strip]

# Dependency graph
requires:
  - phase: 01-strip-rebrand (01-01)
    provides: self-hosted Supabase baseline the app boots against
provides:
  - "router.tsx with 8 fewer routes, 3 fewer guard imports, and a catch-all `<Route path=\"*\">` -> /home"
  - "providers.tsx with no PoolRealtimeListener/WaitlistRealtimeListener/RappiRealtimeBridge mounts"
  - "HomeDashboard.tsx ITEMS array reduced from 14 to 8 tiles (retained routes only)"
  - "SettingsTabsPanel/index.tsx registering only the 7 generic tabs"
  - "pages/reports/index.tsx registering only the 12 generic tabs"
  - "e2e/15-home-navigation.spec.ts proving all 8 removed routes redirect to /home (D-10 backstop), with 'bartender' literal replaced by 'cashier'"
affects: [01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13]

# Actuals (#2632)
actuals:
  tokens: 10700
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Registration files (router/providers/HomeDashboard/SettingsTabsPanel/reports index) are the single choke point for a feature strip — sever them once, up front, so later per-feature-directory plans in the same phase never collide on the same file"
    - "Client-side Realtime subscriptions removed BEFORE the SQL DROP that removes their target table, avoiding a dangling-channel console error"

key-files:
  created: []
  modified:
    - src/app/router.tsx
    - src/app/providers.tsx
    - src/shared/lib/help/content.ts
    - src/widgets/HomeDashboard/ui/HomeDashboard.tsx
    - src/widgets/SettingsTabsPanel/index.tsx
    - src/pages/reports/index.tsx
    - e2e/15-home-navigation.spec.ts

key-decisions:
  - "Deleted src/app/PoolRealtimeListener.tsx and src/app/WaitlistRealtimeListener.tsx as files rather than leaving them unmounted dead code, per plan action"
  - "modifier-popularity and tips report tabs, and the Language settings tab, were kept because they are generic (not bar/pool-specific) despite superficial name proximity to removed features"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "router.tsx severs 8 bar/pool routes and 3 guard imports, adds a catch-all redirecting unmatched paths to /home"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: e2e
        ref: "e2e/15-home-navigation.spec.ts > Removed route redirects (D-10) (8 tests, all removed paths)"
        status: pass
    human_judgment: false
  - id: D2
    description: "providers.tsx no longer mounts PoolRealtimeListener/WaitlistRealtimeListener/RappiRealtimeBridge; both listener files deleted"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "HomeDashboard shows exactly 8 tiles (retained routes only), no useWaitlistWaitingCount import"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D4
    description: "SettingsTabsPanel and reports page register only generic tabs (bar/pool-specific tabs removed)"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D5
    description: "e2e/15-home-navigation.spec.ts proves all 8 removed routes redirect to /home with the dashboard actually rendered, and has zero 'bartender' string literals (D-16)"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/15-home-navigation.spec.ts (19 passed, 3.5m)"
        status: pass
    human_judgment: false

duration: 0min (continuation — Tasks 1-3 were already implemented and committed in a prior session)
completed: 2026-08-11
status: complete
---

# Phase 01 Plan 04: Sever routes, nav tiles, settings/reports tabs Summary

**Router, providers, HomeDashboard, SettingsTabsPanel, and the Reports page all reduced to retained-only surface area, with a catch-all redirect and a real Playwright spec proving all 8 removed routes bounce to /home instead of erroring.**

## Performance

- **Duration:** 0min of new work this session — all 3 tasks' code changes were already present and committed from a prior session; this session verified, wrote the SUMMARY, and updated state
- **Tasks:** 3/3 complete
- **Files modified:** 7 (router.tsx, providers.tsx, help/content.ts, HomeDashboard.tsx, SettingsTabsPanel/index.tsx, pages/reports/index.tsx, e2e/15-home-navigation.spec.ts) plus 3 files deleted (PoolRealtimeListener.tsx, WaitlistRealtimeListener.tsx, e2e/30-help-manual.spec.ts) and 1 deleted (e2e/37-analytics-reports.spec.ts)

## Accomplishments

- Task 1: `router.tsx` has zero routes for `/pos`, `/pool-tables[/:tableId]`, `/kds`, `/kds-bar`, `/kitchen-prep`, `/waitlist`, `/rappi` and a single catch-all `<Route path="*" element={<Navigate to="/home" replace />} />`; `providers.tsx` no longer mounts the pool/waitlist realtime listeners or the Rappi realtime bridge; both listener files and their subscriptions are deleted; `HELP_BY_ROUTE` no longer has `/pos`/`/pool-tables`/`/rappi` entries; `e2e/30-help-manual.spec.ts` (entirely bar-domain) deleted.
- Task 2: `HomeDashboard.tsx`'s `ITEMS` array has exactly 8 entries (down from 14); `useWaitlistWaitingCount` import and its badge JSX removed; `SettingsTabsPanel/index.tsx` registers only the 7 generic tabs; `pages/reports/index.tsx` registers only its 12 generic tabs (including the retained, genuinely-generic `modifier-popularity` and `tips` tabs); `e2e/37-analytics-reports.spec.ts` (superseded by tab removal) deleted.
- Task 3: `e2e/15-home-navigation.spec.ts` extended with a `Removed route redirects (D-10)` describe block that logs in as admin and asserts, for each of the 8 removed paths, both `toHaveURL(/\/home$/)` and that the HomeDashboard's Payments tile is visible — proving the catch-all fires a real redirect rather than a blank/404 page. The file's one `'bartender'` role-string usage was already replaced with `'cashier'` (D-16); zero `'bartender'` literals remain.

## Task Commits

Tasks 1 and 2 were committed individually in a prior session on this same plan:

1. **Task 1: Sever routes, realtime-listener mounts, and route-scoped help content** - `a7bb8f0` (feat)
2. **Task 2: Sever HomeDashboard tiles, Settings tabs, and Reports tabs** - `906ff19` (feat)
3. **Task 3: Add the removed-route redirect E2E spec** - already present in the working tree; its content was folded into `f5d5516` ("chore: rename project directory bar-pos -> supermarket-pos") rather than landing as its own atomic commit (see Deviations below). No new commit was needed this session because the code was already correct and already in git history.

**Plan metadata:** committed at the end of this session (see final commit below).

## Files Created/Modified

- `src/app/router.tsx` - 8 fewer routes, 3 fewer guard imports, added catch-all redirect to /home
- `src/app/providers.tsx` - removed pool/waitlist realtime listener mounts and the inline Rappi realtime bridge
- `src/shared/lib/help/content.ts` - removed /pos, /pool-tables, /rappi entries from HELP_BY_ROUTE
- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` - ITEMS array 14 -> 8, removed useWaitlistWaitingCount
- `src/widgets/SettingsTabsPanel/index.tsx` - removed 6 bar/pool-specific tab registrations
- `src/pages/reports/index.tsx` - removed 5 bar/pool-specific tab registrations
- `e2e/15-home-navigation.spec.ts` - added the removed-route-redirect describe block (8 tests) and confirmed no remaining 'bartender' literal
- (deleted) `src/app/PoolRealtimeListener.tsx`, `src/app/WaitlistRealtimeListener.tsx`, `e2e/30-help-manual.spec.ts`, `e2e/37-analytics-reports.spec.ts`

## Decisions Made

- Kept `modifier-popularity` and `tips` report tabs, and the `Language` settings tab, because a direct code read confirmed they are generic (not bar/pool-domain), despite superficial naming proximity to removed tip-distribution/pool functionality.
- Deleted the two realtime-listener files outright rather than leaving unmounted dead code, since their subscription targets (`resources`/`waitlist_entries` tables) are dropped by later SQL plans in this phase — removing the client subscription first avoids a dangling-channel console error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Process deviation — not a Rule 1-4 code fix] Task 3's commit was folded into an unrelated commit**
- **Found during:** Continuation session for Task 3 / plan-level wrap-up
- **Issue:** When this executor resumed the plan, Task 1 and Task 2 were already committed individually (`a7bb8f0`, `906ff19`) from a prior session, but Task 3's code (the `Removed route redirects (D-10)` E2E block in `e2e/15-home-navigation.spec.ts`) was already present in the working tree with no dedicated commit — its content was carried into `f5d5516` ("chore: rename project directory bar-pos -> supermarket-pos"), a commit made after the two 01-04 task commits but before this session started, whose own message describes an unrelated directory-rename chore.
- **Fix:** No further code changes were needed — the content matched the plan's Task 3 spec exactly (all 8 removed paths covered, URL + dashboard-visibility assertions, zero `'bartender'` literals) and `npx playwright test e2e/15-home-navigation.spec.ts` passed 19/19. Re-committing identical content with no diff was not possible/meaningful, so this session left the existing commit as the historical record of that change and documented the discrepancy here for traceability.
- **Verification:** `npx tsc --noEmit` (zero errors), `npx playwright test e2e/15-home-navigation.spec.ts` (19 passed, 3.5m, headless chrome against localhost:1520 dev server + local Supabase)
- **Committed in:** `f5d5516` (pre-existing, not created this session)

---

**Total deviations:** 1 process deviation (no code changes required)
**Impact on plan:** None on functionality — all acceptance criteria for all 3 tasks are met and verified. The only impact is git-history hygiene: Task 3's diff is not isolated in its own commit.

## Issues Encountered

None — this session's work was verification and closure of already-implemented tasks. `npx tsc --noEmit` passed with zero errors; `npx playwright test e2e/15-home-navigation.spec.ts` passed all 19 tests (11 pre-existing navigation tests + 8 new removed-route-redirect tests) headless against a locally-started dev server and self-hosted Supabase stack, per CLAUDE.md's mandatory-automated-testing policy.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every registration file this plan owns (router, providers, HomeDashboard, SettingsTabsPanel, reports index) shows only retained surface area — later wave-3 plans in this phase can delete the underlying bar/pool pages/widgets/entities/SQL without needing to touch any of these shared files again.
- No blockers for 01-05 onward.

---
*Phase: 01-strip-rebrand*
*Completed: 2026-08-11*

## Self-Check: PASSED

- FOUND: .planning/phases/01-strip-rebrand/01-04-SUMMARY.md
- FOUND: a7bb8f0 (Task 1 commit)
- FOUND: 906ff19 (Task 2 commit)
- FOUND: f5d5516 (Task 3 content, folded into unrelated commit — documented in Deviations)
