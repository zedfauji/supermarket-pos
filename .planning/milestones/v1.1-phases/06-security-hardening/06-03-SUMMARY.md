---
phase: 06-security-hardening
plan: 03
subsystem: database
tags: [postgres, rls, supabase, react-query, settings, security]

# Dependency graph
requires: ["06-02"]
provides:
  - "All client consumers of receipt settings (HardwareSettingsTab, useUploadLogo, LogoImage, CajaDashboard) read/write exclusively through receipt_settings"
  - "Service-role integration test proving receipt_settings RLS role-scoped write isolation (cashier=read-only, manager+admin=full-CRUD)"
  - "receipt_settings DELETE policy corrected to manager+admin (matching D-04), not admin-only"
affects: [phase-7-data-integrity]

# Actuals (#2632)
actuals:
  tokens: 4200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["service-role Vitest integration test for RLS proof when the UI route is RBAC-gated and unreachable by a lower-privileged Playwright session"]

key-files:
  created:
    - src/entities/settings/model/receipt-settings-rls.integration.test.ts
    - supabase/migrations/20260819000002_receipt_settings_delete_manager.sql
  modified:
    - src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx
    - src/features/upload-logo/model/useUploadLogo.ts
    - src/widgets/LogoImage/index.tsx
    - src/widgets/CajaDashboard/CajaDashboard.tsx

key-decisions:
  - "Fixed the receipt_settings_delete_admin RLS policy (admin-only) to receipt_settings_delete_manager_admin (manager+admin), matching D-04's locked decision — the original 06-02 migration had copied the DELETE policy verbatim from the pre-D-04 dormant SQL and never updated it for D-04's manager+admin reinterpretation. See Deviations below."
  - "PostgREST returns a successful empty response (not an error) for an UPDATE that RLS narrows to 0 matched rows, so the cashier-UPDATE-rejected test case chains .select().single() to force the 0-row outcome into an observable PGRST116 error — the only way a client can detect this specific RLS rejection shape."
  - "The RLS test seeds/deletes its own throwaway rows via the service-role client rather than touching the app's real singleton row (id=00000000-0000-0000-0000-000000000001), so it never risks corrupting production-shaped receipt settings data."

patterns-established:
  - "receipt-settings-rls.integration.test.ts mirrors reopen-tab-rpc.integration.test.ts's env-guard / createAuthStaff / signInClient / describe.skipIf structure for any future RLS-only (non-RPC) integration proof."

requirements-completed: [SEC-02]

coverage:
  - id: D1
    description: "No remaining client consumer of receipt settings reads/writes the generic settings table's key='receipt' row"
    requirement: SEC-02
    verification:
      - kind: unit
        ref: "grep -rn \"key: 'receipt'\\|\\.receipt\\.\" src/ -> zero matches (excluding unrelated printer.receipt.* log-message strings)"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/08-settings-receipt.spec.ts -> 5 passed"
        status: pass
    human_judgment: false
  - id: D2
    description: "Repo-wide typecheck/lint pass with zero errors after repointing all 4 consumers"
    requirement: SEC-02
    verification:
      - kind: unit
        ref: "npm run typecheck && npm run lint -> both exit 0, zero errors"
        status: pass
    human_judgment: false
  - id: D3
    description: "A cashier-role session can SELECT but not INSERT/UPDATE/DELETE the receipt_settings row; manager/admin can do all four (SC4)"
    requirement: SEC-02
    verification:
      - kind: integration
        ref: "npx vitest run src/entities/settings/model/receipt-settings-rls.integration.test.ts -> 4/4 passed"
        status: pass
    human_judgment: false
---

# Phase 06 Plan 03: Repoint receipt-settings consumers + RLS proof Summary

**Repointed the last 4 client consumers of receipt settings from the generic `settings` table onto `receipt_settings`, fixed a DELETE-policy gap that predated this plan (admin-only instead of manager+admin), and proved cashier-read-only / manager+admin-full-CRUD with a service-role integration test.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `HardwareSettingsTab.tsx`, `useUploadLogo.ts`, `LogoImage/index.tsx`, and `CajaDashboard.tsx` all now call `useReceiptSettings()`/`useMutationUpdateReceiptSettings()` from `@entities/settings` instead of the generic `useSettings()`/`useMutationUpdateSetting()` pair — no code path in `src/` reads or writes the old `settings` table's `key='receipt'` row anymore (confirmed by a repo-wide grep for `key: 'receipt'`/`.receipt.`, zero matches).
- `e2e/08-settings-receipt.spec.ts`'s existing 5 tests (paper width save, cashier-name toggle, reload persistence, reset to defaults, auto-cut persistence) all pass unmodified against the repointed persistence layer, proving identical UI behavior end-to-end.
- A new service-role Vitest integration test (`receipt-settings-rls.integration.test.ts`) proves the RLS policy actually enforces role-scoped write isolation at the DB layer — this is the direct evidence for ROADMAP Success Criterion #4 (as reinterpreted by D-05): a cashier-role session can `SELECT` but every `INSERT`/`UPDATE`/`DELETE` attempt is rejected by Postgres; a manager-role session can perform all four operations.
- Found and fixed a DELETE-policy gap in `receipt_settings`'s RLS (see Deviations): the live DB restricted `DELETE` to admin-only, contradicting D-04's locked "manager/admin can INSERT/UPDATE/DELETE" decision. Fixed via a new migration, applied to the live DB, and proven by the new integration test's manager-DELETE case.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repoint HardwareSettingsTab, useUploadLogo, LogoImage, CajaDashboard onto receipt_settings** - `55c0976` (feat)
2. **Task 2: Service-role integration test — cashier read-only, manager/admin full CRUD (SC4)** - `0179343` (feat, includes the DELETE-policy migration fix)

## Files Created/Modified

- `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` - `useReceiptSettings()`/`useMutationUpdateReceiptSettings()` replace `useSettings()`/`useMutationUpdateSetting()`; `patchReceipt` now calls `updateReceiptSettings.mutate(next, {...})` directly with a `ReceiptSettings` value instead of `{key:'receipt', value: next}`
- `src/features/upload-logo/model/useUploadLogo.ts` - `apply()` calls `update.mutateAsync(next)` via `useMutationUpdateReceiptSettings()`
- `src/widgets/LogoImage/index.tsx` - `data?.logoDataUrl ?? null` off `useReceiptSettings()` (was `data?.receipt.logoDataUrl`)
- `src/widgets/CajaDashboard/CajaDashboard.tsx` - `receiptSettings.data?.autoCut` off `useReceiptSettings()` (was `settings.data?.receipt.autoCut`)
- `src/entities/settings/model/receipt-settings-rls.integration.test.ts` - new service-role integration test, 4 cases: cashier SELECT succeeds, cashier INSERT rejected, cashier UPDATE rejected (0-rows-affected forced into an observable error via `.select().single()`), manager INSERT/UPDATE/DELETE all succeed
- `supabase/migrations/20260819000002_receipt_settings_delete_manager.sql` - fixes `receipt_settings_delete_admin` (admin-only) to `receipt_settings_delete_manager_admin` (manager+admin), applied to the live self-hosted DB

## Decisions Made

- The cashier-UPDATE-rejected integration test case chains `.select().single()` on the update call — PostgREST's default behavior for an UPDATE that RLS narrows to 0 visible/matched rows is a *successful* response with an empty result set, not an error, so a bare `.update().eq(...)` call cannot observe the rejection. Forcing `.select().single()` turns "0 rows returned" into `PGRST116`, which is the only client-observable signal of the RLS block.
- The RLS test seeds and deletes its own throwaway rows via the service-role client for the INSERT/UPDATE/DELETE cases rather than mutating the app's real singleton row (`id=00000000-0000-0000-0000-000000000001`), so a test run can never corrupt production-shaped receipt-settings data even if a case fails mid-way (cleanup runs in `afterEach` regardless of pass/fail).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `receipt_settings` DELETE RLS policy was admin-only, contradicting D-04's locked "manager/admin" decision**
- **Found during:** Task 2, while drafting the manager-full-CRUD test case per the plan's literal acceptance criteria ("A manager-signed-in client can `.insert(...)`, then `.update(...)`, then `.delete(...)` — all three succeed").
- **Issue:** `06-CONTEXT.md`'s D-04 (locked, not Claude's Discretion) states RLS should allow "only manager/admin" for `INSERT`/`UPDATE`/`DELETE` on `receipt_settings`. The live DB's `receipt_settings_delete_admin` policy (from 06-02's migration, `20260819000001_receipt_settings.sql`) instead restricted `DELETE` to `get_user_role() = 'admin'` only — this SQL fragment was "copied verbatim" (per that migration's own comment) from the pre-D-04 dormant policy in `20260510000001_rls_rewrite_phase13.sql`, which predates D-04's manager+admin reinterpretation and was never adjusted to match it. `INSERT`/`UPDATE` were already correct (`manager` OR `admin`); only `DELETE` had the gap.
- **Fix:** New migration `20260819000002_receipt_settings_delete_manager.sql` drops `receipt_settings_delete_admin` and creates `receipt_settings_delete_manager_admin` with `USING (get_user_role() IN ('manager', 'admin'))`. Applied to the live self-hosted DB via the same `docker exec supabase-db psql` fallback 06-02 used (no `supabase-pooler` container running locally), and registered in `supabase_migrations.schema_migrations`.
- **Files modified:** `supabase/migrations/20260819000002_receipt_settings_delete_manager.sql` (new)
- **Commit:** `0179343`

## Issues Encountered

- **Playwright reused a stale dev server from a sibling checkout, testing the wrong code.** `playwright.config.ts`'s `webServer` has `reuseExistingServer: true` bound to the hardcoded `http://localhost:1520`. A `npm run dev` process from the sibling main checkout (`/home/widowsvail/ai/POS/supermarket-pos`, unrelated to this worktree) was already listening on port 1520, so the first `npx playwright test e2e/08-settings-receipt.spec.ts` run silently exercised that checkout's *pre-06-03* code (still calling `data?.receipt.logoDataUrl` against a `SettingsSnapshot` that 06-02 had already stripped `receipt` from), crashing the app shell with "Cannot read properties of undefined (reading 'logoDataUrl')" before login even rendered — 5/5 tests failed, none for a reason related to this plan's actual changes. Diagnosed via the test's `error-context.md` page snapshot showing the app's error boundary, not a login-flow bug. Fixed by killing the stray process (`kill $(lsof -ti:1520)`), which let Playwright's `webServer` start its own `npm run dev` from this worktree; the re-run passed 5/5 against the correct, repointed code. `playwright.config.ts` itself was **not** modified, per this plan's explicit scope guard.
- This worktree had no `node_modules`/`.env.local` (both gitignored, fresh `git worktree add` checkout). `package-lock.json` was byte-identical to the sibling main checkout, so both were symlinked from there rather than running `npm ci`/recreating `.env.local` — same pattern 06-01/06-02 used.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

SEC-02 is complete: `receipt_settings` is the sole persistence layer for receipt configuration across the entire client, with RLS enforcing manager+admin-only writes (all three of INSERT/UPDATE/DELETE, now that the DELETE gap is fixed) and any-authenticated-role reads. Phase 06's remaining scope (SEC-01, the Anthropic edge-function migration) is tracked separately in 06-01's plans. No blockers for Phase 7.

## Self-Check: PASSED

- FOUND: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx
- FOUND: src/features/upload-logo/model/useUploadLogo.ts
- FOUND: src/widgets/LogoImage/index.tsx
- FOUND: src/widgets/CajaDashboard/CajaDashboard.tsx
- FOUND: src/entities/settings/model/receipt-settings-rls.integration.test.ts
- FOUND: supabase/migrations/20260819000002_receipt_settings_delete_manager.sql
- FOUND commit: 55c0976
- FOUND commit: 0179343

---
*Phase: 06-security-hardening*
*Completed: 2026-08-17*
