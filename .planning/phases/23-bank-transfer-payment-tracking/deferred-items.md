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
