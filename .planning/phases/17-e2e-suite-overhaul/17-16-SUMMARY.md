---
phase: 17-e2e-suite-overhaul
plan: 16
subsystem: testing
tags: [e2e, playwright, visual-regression, rbac, route-audit]
dependency-graph:
  requires:
    - phase: 17-04
      provides: E2E rewrite conventions established across the main suite
  provides:
    - Visual regression baseline rebuilt against the live src/app/router.tsx registration
  affects:
    - e2e/visual/45-visual-baseline.spec.ts
tech-stack:
  added: []
  patterns:
    - "Route × role visual matrix derived directly from each route's actual gate component (ReportsRoute/RbacRoute/AuditRoute/EditHistoryRoute/PurchaseOrdersRoute), not from CLAUDE.md's page-level RBAC prose"
    - "Mask/cap live-content regions (employee picker, audit/edit-history DataTables) that a shared, concurrently-mutated Supabase instance makes non-deterministic, rather than asserting on their exact pixel content"
key-files:
  created: []
  modified:
    - e2e/visual/45-visual-baseline.spec.ts
decisions:
  - "Route/role matrix: CASHIER_ROUTES = home/pos/inventory/suppliers/staff/settings/payments (ProtectedRoute-only, no route-level gate); MANAGER_ROUTES adds reports/edit-history/purchase-orders/audit; ADMIN_ROUTES adds rbac. Confirmed by reading each *-route.tsx gate component directly, not assumed from CLAUDE.md's RBAC prose (which describes in-page feature gates on /inventory/etc., not route redirects)."
  - "Deleted seedOccupiedTableDirect() and the pool-tables idle-grid test outright (dropped pool_tables/pool_sessions tables) rather than adapting them — there is no current-app equivalent."
  - "Fixed the login test's WHO_ARE_YOU_RE locale bug (English-only regex against an es-MX-cold-start app) using the shared regex already exported from e2e/helpers/auth.ts, instead of adding a second, duplicate bilingual pattern."
  - "Masked/height-capped the login employee-picker list and the whole /audit and /edit-history DataTables, rather than leaving them fullPage-unmasked, because they render live profiles/audit-log rows from a Supabase instance shared by every concurrently-running worktree agent's own E2E fixtures — asserting on their exact row count/content would be asserting on other suites' timing, not a route regression."
metrics:
  duration: 55min
  completed: 2026-08-25
status: complete
actuals:
  tokens: 4427
  tasks: 2
  commits: 2
---

# Phase 17 Plan 16: Visual Baseline Route Rewrite Summary

**Rebuilt `e2e/visual/45-visual-baseline.spec.ts`'s entire route/role matrix against the current `src/app/router.tsx` registration, fixed a pre-existing locale bug the rewrite exposed, and generated fresh baseline screenshots that pass a real two-run comparison.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2/2
- **Files modified:** 1 (`e2e/visual/45-visual-baseline.spec.ts`)
- **Commits:** 2

## Accomplishments

- Deleted every bar-pos-era route/fixture reference from this file: `seedOccupiedTableDirect()` (queried the dropped `pool_tables`/`pool_sessions` tables), its one call site (the "pool-tables idle grid" test), and the already-removed `seedKdsFoodOrder` import.
- Rebuilt `CASHIER_ROUTES`/`MANAGER_ROUTES`/`ADMIN_ROUTES` from a direct read of `src/app/router.tsx` and each route's actual gate component (`ReportsRoute`, `RbacRoute`, `AuditRoute`, `EditHistoryRoute`, `PurchaseOrdersRoute`), not from CLAUDE.md's page-level RBAC prose — confirmed `/inventory`, `/suppliers`, `/staff`, `/settings`, `/payments` have no route-level gate (`ProtectedRoute` is auth-only; any RBAC restriction there is an in-page control).
- Simplified `masksFor()` to drop masks for elements that no longer render anywhere (`active-promotions-banner` — promotions feature removed in Phase 1; `liveClock`/`LiveTimeDisplay` — currently unused in the whole `src/` tree).
- Generated fresh baseline PNGs for all 4 tests (login + admin/cashier/manager route matrices) and confirmed a clean, zero-failure second run against them.

## Task Commits

1. **Task 1: Rebuild the route/screenshot list against the current router** - `cc09f9d` (test)
2. **Task 2: Generate new baseline screenshots and verify the suite passes** - `9701688` (test)

## Files Created/Modified

- `e2e/visual/45-visual-baseline.spec.ts` - Route/role matrix rebuilt against the live router; login-locale bug fixed; audit/edit-history/login live-content masking added.
- `e2e/visual/45-visual-baseline.spec.ts-snapshots/*.png` - Fresh baseline images (31 files, gitignored per `e2e/visual/**/*-snapshots/` — not committed, regenerate locally with `npm run test:e2e:visual -- --update-snapshots`).

## Decisions Made

- Route/role matrix now: **cashier** — home, pos, inventory, suppliers, staff, settings, payments (7 routes, all `ProtectedRoute`-only). **manager** — cashier's routes + reports, edit-history, purchase-orders, audit (11 routes). **admin** — manager's routes + rbac (12 routes, everything except `/login`).
- No adaptation of the pool-tables idle-grid test was attempted — it tested a route/table pair that no longer exists in the app, so it was deleted outright along with its seed helper.
- The two-column mask on `/staff` (clock-in/duration) was kept as-is since StaffDashboard/CajaDashboard still render those exact volatile fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed login heading locator's English-only locale regex**
- **Found during:** Task 2, first `--update-snapshots` run — the login test timed out finding `getByRole('heading', { name: /who are you/i })`.
- **Issue:** The app's cold-start locale is es-MX with no English fallback (documented in `e2e/helpers/auth.ts`'s own comment on `WHO_ARE_YOU_RE`), so the actual rendered heading is "¿Quién eres?" — the English-only regex never matched. This bug predates this plan (same literal regex was in the original file) but was invisible until the route rewrite made this test the one actually exercised end-to-end again.
- **Fix:** Imported and used the shared `WHO_ARE_YOU_RE` bilingual regex already exported from `e2e/helpers/auth.ts` instead of the inline English-only pattern.
- **Files modified:** `e2e/visual/45-visual-baseline.spec.ts`
- **Verification:** `npm run test:e2e:visual` login test passes.
- **Committed in:** `9701688`

**2. [Rule 1 - Bug] Masked live-content regions causing false-positive visual diffs**
- **Found during:** Task 2 verification runs — `login.png` failed on image *dimensions* (employee-picker row count differs run to run), then `admin-audit.png`/`admin-edit-history.png` failed on pixel content (2% diff, DataTable rows reordered by another worktree's concurrent writes).
- **Issue:** This suite runs against a Supabase instance shared by every concurrently-running worktree agent's own E2E fixtures (profiles, audit log entries). The login employee-picker, `/audit`, and `/edit-history` all render live queries over tables other suites actively mutate mid-run, so their row count/order is not under this test's control.
- **Fix:** Capped the login employee-picker list's rendered height (`maxHeight`/`overflow: hidden`) and masked it; masked the entire `<table>` on `/audit` and `/edit-history` (superseding column-level masking there, since the whole table's content is inherently non-deterministic in this shared environment).
- **Files modified:** `e2e/visual/45-visual-baseline.spec.ts`
- **Verification:** Two consecutive full `npm run test:e2e:visual` runs (no `--update-snapshots`) passed with 0 failures after this fix.
- **Committed in:** `9701688`

---

**Total deviations:** 2 auto-fixed (Rule 1)
**Impact on plan:** Both fixes were required for Task 2's own acceptance criteria (a real, passing two-run comparison) — no scope expansion beyond the plan's stated file.

## Issues Encountered

- **Environment setup:** The worktree had no `node_modules` and no Playwright browser binaries installed; `npm ci` and `npx playwright install chromium` (with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, since this host's Ubuntu version is newer than Playwright's supported-platform list) were required before any verification could run. `.env.local` was also missing from the worktree checkout (gitignored, not copied by `git worktree`) and was copied in from the main checkout to satisfy `requireIntegrationEnv()`.
- **Shared dev-server port contention:** `playwright.visual.config.ts`'s `webServer` (port 1520, `strictPort: true`, `reuseExistingServer: true`) is shared across every concurrently-running worktree agent in this wave. Several early runs silently connected to a *different* worktree's `npm run dev` process (confirmed via `ss -ltnp` + `/proc/<pid>/cwd`), which produced spurious 403s on `@fs/...` asset paths. Worked around by polling until the port was free and then holding it with our own long-lived `npm run dev` process for the duration of verification — this is an environmental characteristic of the current heavily-parallel wave, not a defect in this plan's file, and required no change to `playwright.visual.config.ts` (left untouched per the plan's explicit constraint).
- **Residual flakiness under concurrent load:** One additional (non-required) third verification run, done purely for extra confidence beyond the plan's acceptance criteria, hit a similar transient diff on `/pos` (product-grid row count) from the same shared-DB concurrent-write pressure. The plan's actual acceptance criteria (`--update-snapshots` run + one clean second run) were already satisfied by that point; this is noted here as a known, inherent characteristic of running this suite while many sibling worktree agents are simultaneously mutating the same Supabase instance, not a defect introduced by this plan.

## User Setup Required

None — no external service configuration required. (`.env.local` already exists in the project; only needed to be present in this specific worktree checkout, which is a one-time per-worktree setup step, not a new requirement.)

## Next Phase Readiness

`e2e/visual/45-visual-baseline.spec.ts` now exercises only routes that exist in the current app. No further route-audit work is needed on this file for this phase.

## Self-Check: PASSED

- Confirmed `e2e/visual/45-visual-baseline.spec.ts` exists and contains the rebuilt route matrix (252 lines).
- Confirmed commits `cc09f9d` and `9701688` exist in `git log --oneline`.
- Confirmed `npm run typecheck` exits 0 and the targeted ESLint run reports no errors.
- Confirmed `grep -icE "pool_tables|pool-tables|/rappi|/kds|/kitchen-prep|/waitlist"` and `grep -c "seedKdsFoodOrder\|seedOccupiedTableDirect"` both return 0 against the final file.
- Confirmed `npm run test:e2e:visual -- --update-snapshots` and a subsequent `npm run test:e2e:visual` (no update flag) both completed with exit code 0, 4/4 passed.
