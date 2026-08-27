---
phase: 17-e2e-suite-overhaul
plan: 13
subsystem: testing
tags: [playwright, audit-log, tabs, optimistic-concurrency, e2e]
requires:
  - phase: 17-04
    provides: checkout-folder E2E split pattern (folder-based Playwright report grouping)
provides:
  - e2e/audit/ folder (audit-logs.spec.ts, entity-id-crosslink.spec.ts)
  - e2e/tabs/ folder (edit-paid-tab.spec.ts, reopen-closed-ticket.spec.ts, concurrent-edits.spec.ts)
  - Restored, real (non-skipped) optimistic-concurrency coverage on a live version-guarded tabs mutation
affects: [e2e, audit, payments, verification-report]
tech-stack:
  added: []
  patterns:
    - Locale-agnostic (en-US/es-MX) UI-text selectors for shared, concurrently-used E2E fixture accounts
key-files:
  created:
    - e2e/audit/audit-logs.spec.ts
    - e2e/audit/entity-id-crosslink.spec.ts
    - e2e/tabs/edit-paid-tab.spec.ts
    - e2e/tabs/reopen-closed-ticket.spec.ts
    - e2e/tabs/concurrent-edits.spec.ts
  modified: []
key-decisions:
  - "Retargeted 39-concurrent-edits.spec.ts's bumpTabVersion()/page.route() race-simulation mechanism at EditPaidTabDialog's save action (edit_paid_tab RPC) instead of leaving it permanently test.skip'd against deleted TabDrawer/TabCard — confirmed via source read that edit_paid_tab is genuinely version-guarded (p_expected_version vs tabs.version, SQLSTATE P0V01) before committing to the retarget."
  - "Made e2e/tabs/reopen-closed-ticket.spec.ts's UI-text selectors locale-agnostic (en-US/es-MX) after reproducing a real failure caused by the pinned E2E manager account's locale drifting under concurrent wave-3 worktree load."
patterns-established:
  - Version-guarded RPC race tests intercept the RPC POST via page.route() and bump the row's version via the service-role client before releasing the request, rather than relying on a specific now-deleted UI surface.
requirements-completed: [TEST-01, TEST-02]
coverage:
  - id: D1
    description: "39-concurrent-edits.spec.ts's tabs.version optimistic-concurrency race coverage is retargeted to a live UI surface (EditPaidTabDialog save) that guards tabs.version, not left permanently skipped against deleted TabDrawer/TabCard."
    requirement: TEST-01
    verification:
      - kind: e2e
        ref: npx playwright test e2e/tabs/concurrent-edits.spec.ts
        status: pass
    human_judgment: false
  - id: D2
    description: "e2e/audit/ and e2e/tabs/ folders exist with the 5 moved/retargeted specs; all 5 original root files are deleted."
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: npx playwright test e2e/audit/ (isolated) and npx playwright test e2e/tabs/ (isolated)
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-08-25
status: complete
actuals:
  tokens: 8950
  tasks: 2
  commits: 2
---

# Phase 17 Plan 13: Audit + Tabs E2E Split, Concurrent-Edits Retarget Summary

**Moved audit-logs/entity-id-crosslink into `e2e/audit/`, moved edit-paid-tab/reopen-closed-ticket into `e2e/tabs/`, and rewrote the permanently-skipped concurrent-edits test to retarget its optimistic-concurrency race simulation at EditPaidTabDialog's live, version-guarded save action.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2/2
- **Files modified:** 6 (2 created in e2e/audit/, 3 created in e2e/tabs/, 5 deleted from e2e/ root)

## Accomplishments

- `e2e/38-audit-logs.spec.ts` → `e2e/audit/audit-logs.spec.ts` and `e2e/58-entity-id-crosslink.spec.ts` → `e2e/audit/entity-id-crosslink.spec.ts`, both plain moves with import-path fixes.
- `e2e/47-edit-paid-tab.spec.ts` → `e2e/tabs/edit-paid-tab.spec.ts` and `e2e/48-reopen-closed-ticket.spec.ts` → `e2e/tabs/reopen-closed-ticket.spec.ts`, plain moves with import-path fixes; `reopen-closed-ticket.spec.ts`'s selectors were additionally made locale-agnostic (see Deviations).
- `e2e/39-concurrent-edits.spec.ts`'s sole test — permanently `test.skip`'d against the deleted `TabDrawer`/`TabCard` "Close Tab" flow — rewritten and un-skipped as `e2e/tabs/concurrent-edits.spec.ts`, retargeting the same `bumpTabVersion()`/`page.route()` race-simulation mechanism at `EditPaidTabDialog`'s save action (`useEditPaidTab` → `edit_paid_tab` RPC). Confirmed via source read (`src/features/edit-paid-tab/`, `supabase/migrations/20260719000001_edit_paid_tab_rpc.sql`) that this RPC is genuinely version-guarded (`p_expected_version` vs `tabs.version`, raising `STALE_VERSION`/SQLSTATE `P0V01` on mismatch) before committing to the retarget, satisfying the plan's `must_haves.truths` requirement.
- All 5 original root files deleted.

## Task Commits

1. **Task 1: e2e/audit/audit-logs.spec.ts + entity-id-crosslink.spec.ts** — `82f7bdd` (test)
2. **Task 2: e2e/tabs/ — edit-paid-tab, reopen-closed-ticket, concurrent-edits (retargeted)** — `8476c12` (test)

## Files Created/Modified

- `e2e/audit/audit-logs.spec.ts` — moved; fixed a pre-existing `seedOpenTab()` call missing the now-required `productName` arg (see Deviations).
- `e2e/audit/entity-id-crosslink.spec.ts` — plain move, import paths only.
- `e2e/tabs/edit-paid-tab.spec.ts` — plain move, import paths only.
- `e2e/tabs/reopen-closed-ticket.spec.ts` — moved; UI-text selectors made locale-agnostic (see Deviations).
- `e2e/tabs/concurrent-edits.spec.ts` — new content, retargeted at `EditPaidTabDialog`'s save action; un-skipped.
- `e2e/38-audit-logs.spec.ts`, `e2e/58-entity-id-crosslink.spec.ts`, `e2e/47-edit-paid-tab.spec.ts`, `e2e/48-reopen-closed-ticket.spec.ts`, `e2e/39-concurrent-edits.spec.ts` — deleted.

## Decisions Made

- Retargeted the concurrent-edits race-simulation mechanism at `EditPaidTabDialog`'s save action rather than `ReopenTabDialog`'s — confirmed via source read that `edit_paid_tab`'s RPC signature and `handleSubmit`'s `expectedVersion: tab.version` argument make it the more directly analogous replacement for the original `useCloseTab`-guarded flow (both are a Sheet → PIN-gated save with a version-guarded RPC).
- Kept the race-simulation intercept scoped to the RPC POST (`**/rest/v1/rpc/edit_paid_tab*`) rather than a `tabs` PATCH, since `useEditPaidTab` calls `supabase.rpc()` directly (no separate PATCH request exists for this mutation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a pre-existing `seedOpenTab()` call missing the now-required `productName` argument**
- **Found during:** Task 1 verification
- **Issue:** `e2e/helpers/supabase.ts`'s `seedOpenTab()` signature had `productName: string` made a required field in a prior wave-3 plan (17-03, commit `4c44f44`). The original `e2e/38-audit-logs.spec.ts` (moved verbatim per the plan) still called `seedOpenTab({ customerName, role, withItem: true })` without it, which threw at runtime (`seedOpenTab: product "undefined" not found`) rather than a typecheck error, since `npm run typecheck`'s root tsconfig does not include `e2e/`.
- **Fix:** Resolved a real active product's name from the DB at test-run time (mirroring the pattern already used in `e2e/checkout/` and `e2e/tabs/`'s own seed helpers) instead of hardcoding a bar-pos-era fixture name.
- **Files modified:** `e2e/audit/audit-logs.spec.ts`
- **Verification:** `npx playwright test e2e/audit/audit-logs.spec.ts` — the previously-erroring test now passes.
- **Committed in:** `82f7bdd`

**2. [Rule 1 - Bug] Made `e2e/tabs/reopen-closed-ticket.spec.ts`'s UI-text selectors locale-agnostic**
- **Found during:** Task 2 verification
- **Issue:** The moved file's SC-1/SC-2/SC-3 selectors matched English-only button/dialog/toast text (`'Reopen ticket'`, `'Request approval'`, `'Edit items'`, etc.). A real, reproduced failure (screenshot showed the page rendering in es-MX — "Reabrir cuenta", "Editar ticket") proved the pinned `E2E_MANAGER_NAME` account's `profiles.locale` is not reliably en-US in this shared remote-Supabase environment, most likely because concurrently-running wave-3 worktree-agent E2E suites (locale-switch tests among them) share the same fixed named accounts and can flip that field mid-run.
- **Fix:** Every locale-sensitive selector (button names, dialog/alertdialog names, toast text) now matches both the en-US and es-MX strings from `src/shared/lib/i18n/locales/{en-US,es-MX}/featOrders.json` and `wPanels.json`, matching the convention `e2e/tabs/edit-paid-tab.spec.ts` already used. Updated the file's stale header comment accordingly.
- **Files modified:** `e2e/tabs/reopen-closed-ticket.spec.ts`
- **Verification:** Re-run of the full file in isolation passed 7/7 tests (confirmed twice).
- **Committed in:** `8476c12`

---

**Total deviations:** 2 auto-fixed (Rule 1)
**Impact on plan:** Both fixes were required for the moved files' own `<verify>` commands to pass; no scope expansion beyond the files this plan's tasks already touch.

## Verification

Ran with the project's local Chrome-for-Testing browser (`FAST_E2E=1 node_modules/.bin/playwright test ...` — `npx playwright` resolved a mismatched globally-cached 1.62.1 CLI against this project's pinned `@playwright/test@1.59.1`, which failed to locate a compatible cached `ffmpeg` binary; the project's own `node_modules/.bin/playwright` was used instead).

- **Task 1 isolated:** `npx playwright test e2e/audit/` — **7 passed, 1 skipped** (the "Diff viewer" test's own `test.skip` fires when the table has no rows yet, which is expected/deterministic, not a failure).
- **Task 2 isolated:** `npx playwright test e2e/tabs/` — **7 passed** (0 failures) on a clean run; two earlier runs each hit exactly one transient failure that fully passed on Playwright's built-in retry (config `retries: 1`).
- **Combined `npx playwright test e2e/audit/ e2e/tabs/`** (the plan's overall `<verification>` line): flaked under heavy concurrent load — reproduced failures included `caja_sessions_one_open` unique-constraint violations, a shared dev-server `ERR_CONNECTION_REFUSED` at `http://localhost:1520`, and session/locale pollution on the shared fixed E2E accounts. `ps aux` at the time confirmed 3+ **other** worktree agents (`agent-add5dbbd85f4a8f5a`, `agent-aec27b3ddea39f8bc`, `agent-a5b23577ff40e4457`) were simultaneously running their own Playwright E2E suites against the same shared remote Supabase project and, in at least one case, the same `localhost:1520` dev server. This is a wave-3 cross-worktree infrastructure-contention artifact (shared remote DB, shared fixed-name E2E accounts, a global `caja_sessions` one-open-session-system-wide constraint, and a shared dev-server port), not a defect in this plan's files — every file's own scoped `<verify>` command passed cleanly and repeatably in isolation.
- `npm run typecheck` does not cover `e2e/` (root `tsconfig.json` only includes `src`/`scripts`) and `npm run lint` only lints `src` — both confirmed unaffected by this plan's `e2e/` changes.
- Acceptance-criteria greps: `test -f e2e/38-audit-logs.spec.ts` / `58-...` / `47-...` / `48-...` / `39-...` all fail (correctly absent); `grep -c "TabDrawer\|TabCard" e2e/tabs/concurrent-edits.spec.ts` → 0; `grep -c "test.skip(" e2e/tabs/concurrent-edits.spec.ts` → 0; `grep -c "bumpTabVersion" e2e/tabs/concurrent-edits.spec.ts` → 4.

## Known Stubs

None.

## Issues Encountered

- **Shared-environment E2E contention (wave-3):** documented in detail under Verification above. No code change addresses this — it is an inherent property of running many worktree-agent E2E suites concurrently against one shared remote Supabase project and one shared dev-server port. Not actionable within this plan's scope.
- **`npx playwright` CLI/package version mismatch:** `npx playwright` resolved a different globally npx-cached `playwright@1.62.1` CLI instead of this project's pinned `@playwright/test@1.59.1`, which attempted to use an incompatible cached `ffmpeg` browser revision. Worked around by invoking `node_modules/.bin/playwright` directly. Not a plan-file change; noted here for future executors in this worktree.

## Next Phase Readiness

`e2e/audit/` and `e2e/tabs/` are both now live, folder-organized, and locale-robust — later wave-3 plans touching payment/tab specs can follow the same locale-agnostic selector convention already established in `e2e/tabs/edit-paid-tab.spec.ts`.

## Self-Check: PASSED

- Confirmed `e2e/audit/audit-logs.spec.ts`, `e2e/audit/entity-id-crosslink.spec.ts`, `e2e/tabs/edit-paid-tab.spec.ts`, `e2e/tabs/reopen-closed-ticket.spec.ts`, `e2e/tabs/concurrent-edits.spec.ts` all exist on disk.
- Confirmed `e2e/38-audit-logs.spec.ts`, `e2e/58-entity-id-crosslink.spec.ts`, `e2e/47-edit-paid-tab.spec.ts`, `e2e/48-reopen-closed-ticket.spec.ts`, `e2e/39-concurrent-edits.spec.ts` are all absent.
- Confirmed commits `82f7bdd` and `8476c12` exist in `git log --oneline`.
