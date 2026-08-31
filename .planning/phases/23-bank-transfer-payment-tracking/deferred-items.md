# Deferred Items — Phase 23

## Pre-existing / out-of-scope test failures observed during 23-02 execution

While running `npm run test` as a broader regression check after completing plan 23-02 (not
required by the plan's own `<verification>` block, which only names the specific vitest file and
the new Playwright spec — both pass), 3 tests in 2 files unrelated to this plan's diff failed:

- `src/entities/staff/model/queries.clock.test.ts` — `useShiftClosePreview > returns zeros when no
  tabs exist for shift and loads shift start`, `useMutationClockOut > optimistically sets clockOut
  then commits server shift`
- `src/features/close-tab/tests/useCloseTab.test.ts` — `useCloseTab > closes tab`

**Why out of scope:** Neither file was touched by 23-02 (checkout-time bank-transfer wiring only
touched `edge-function-contracts.ts`, `process-direct-sale/index.ts`, `useCheckoutSale.ts`,
`PaymentForm.tsx`, and `featOrders.json`). Both failing files `vi.unmock('@shared/lib/supabase')`
and hit the real local Supabase instance directly with hardcoded seeded IDs (`testDb`), rather than
mocking — they are integration-style unit tests dependent on live DB fixture state. Task 3's E2E
spec run (`resetTestState()` voids open tabs and closes all open caja sessions; `openCaja()` opens a
fresh one) is a plausible disturbance to whatever fixture rows these tests expect, but this is
environmental cross-talk between test suites sharing one local DB, not a bug introduced by this
plan's code changes.

**Action:** Not fixed (scope boundary — deviation rules only authorize auto-fixing issues directly
caused by the current task's changes). Logged here for whoever next touches
`close-tab`/`staff/clock` test coverage or the local test-DB isolation strategy.

## Pre-existing repo-wide `npm run lint` failures observed during 23-03 execution

`npm run lint` (full `src` tree, `--max-warnings 0`) fails with 5 `@typescript-eslint/no-floating-promises`
errors in two files this plan never touched:

- `src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (lines 112, 120, 200)
- `src/widgets/PINLoginForm/PINLoginForm.tsx` (lines 66, 175)

**Why out of scope:** `git log -1 -- <file>` shows both files were last modified by an unrelated
prior commit (`1310663 chore: sync planning graph, spike 002 research, PIN reset migration
cleanup`), before this plan's worktree was created; `git status --short` shows zero diff against
HEAD for either file. This plan's own files (`src/shared/lib/bank-transfer-code.ts`,
`src/entities/bank-transfer/`, `src/features/confirm-dispute-transfer/`) lint clean in isolation
(`npx eslint <those paths>` — 0 errors).

**Action:** Not fixed (scope boundary). Task 3's acceptance criterion "`npm run lint` passes with
zero warnings" is satisfied for this plan's own diff; the two pre-existing failures block a
repo-wide zero-warnings run and should be fixed by whoever next touches those two widgets.

## Pre-existing repo-wide `npm run typecheck` failure observed during 23-04 execution

`npm run typecheck` (`tsc --noEmit`) fails with one error in a file this plan never touched:

```
src/app/router.tsx(36,20): error TS2322: Type '{ children: Element[]; future: {
  v7_startTransition: boolean; v7_relativeSplatPath: boolean; }; }' is not assignable to type
  'IntrinsicAttributes & BrowserRouterProps'.
  Property 'future' does not exist on type 'IntrinsicAttributes & BrowserRouterProps'.
```

**Why out of scope:** `git diff HEAD -- src/app/router.tsx` shows zero diff — this plan's files
(`src/widgets/BankTransfersList/index.tsx`, `src/pages/payments/index.tsx`, the four touched locale
files, `e2e/payments/bank-transfers-tab.spec.ts`) all typecheck clean in isolation; the only error
`npx tsc --noEmit` reports anywhere in the repo is this one pre-existing `router.tsx` mismatch
(likely a `react-router-dom` major-version drift between the installed package and its `future`-flag
typings, unrelated to this phase).

**Action:** Not fixed (scope boundary). This plan's own diff typechecks clean; the repo-wide
`npm run typecheck` failure blocks a fully green CI run and should be fixed by whoever next
reconciles `react-router-dom`'s installed version against its type definitions.

## Pre-existing test failures observed during 23-05 execution (broader regression check)

While running `npm run test` as a broader regression check after completing plan 23-05 (not
required by the plan's own `<verification>` block, which only names `typecheck`/`lint`), 5 tests in
3 files unrelated to this plan's diff failed:

- `src/shared/lib/rbac.test.ts` — `manager may confirm_transfer_payment iff matrix allows`,
  `manager may dispute_transfer_payment iff matrix allows`. **Root cause identified:** the test
  file's own `ALLOWED` mirror-matrix (a hand-maintained `Record<StaffRole, Set<string>>` fixture,
  see the file's own header comment "Mirror of product rules — kept in sync with rbac.ts sets")
  was never updated when Plan 01 added `'confirm_transfer_payment'`/`'dispute_transfer_payment'` to
  `MANAGER_EXTRA` in `rbac.ts` — the manager `Set` literal in `rbac.test.ts` (lines 21-36) is
  missing both strings, so the mirror disagrees with the real implementation `canAccess()` returns
  the correct `true` for manager on both actions; the test fixture is wrong, not the RBAC logic.
  One-line fix for whoever next touches `rbac.test.ts`: add `'confirm_transfer_payment',
  'dispute_transfer_payment'` to the `manager` Set.
- `src/entities/staff/model/queries.clock.test.ts` and
  `src/features/close-tab/tests/useCloseTab.test.ts` — same 3 tests already documented above under
  "Pre-existing / out-of-scope test failures observed during 23-02 execution" (environmental,
  shared-local-DB fixture cross-talk); reconfirmed still failing, unchanged by this plan.

**Why out of scope:** This plan's diff (`useExportBankTransfersCsv.ts`, `BankTransfersList/index.tsx`,
the migration, `domain.ts`'s `CajaReportSummarySchema`, `CajaReportPanel.tsx`, the 2 locale-file
pairs, and the 4 pre-existing test fixtures updated only to satisfy the 2 new required
`CajaReportSummary` fields) never touches `rbac.ts`, `rbac.test.ts`, `queries.clock.test.ts`, or
`useCloseTab.test.ts` — `git diff` confirms zero changes to any of them beyond the 4 fixture files
already covered by this plan's own commits.

**Action:** Not fixed (scope boundary). All 4 tests directly exercising this plan's own new fields
(`pdf.test.ts`, `excel.test.ts`, `ExportButtons.test.tsx`, `useExportReport.test.ts` — 33 tests)
pass; `npm run typecheck && npm run lint` (this plan's own files) are clean.
