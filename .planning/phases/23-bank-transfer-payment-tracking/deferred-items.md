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
