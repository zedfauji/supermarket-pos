# Deferred Items — Phase 18

## Out-of-scope test failures observed during 18-01 full-suite verification

`npm run test` (full unit suite) run after Plan 18-01's changes shows 5 pre-existing
failures unrelated to any file this plan touches:

- `src/entities/staff/model/queries.clock.test.ts` (3 failures — clock-in/out
  optimistic-update and order-count assertions)
- `src/features/close-tab/tests/useCloseTab.test.ts` (1 failure — closes tab)

These are real-DB integration tests (they explicitly `vi.unmock('@shared/lib/supabase')`)
that depend on seeded staff/shift/tab fixture data in the local Supabase stack. This
worktree's local Supabase instance was started fresh for this execution (Docker Desktop
was not running; brought up during Task 1 verification) and has not been seeded via
`npm run setup:dev`. None of Plan 18-01's files (`WeightEntryDialog.tsx`,
`useProductPeekWindow.ts`, `CheckoutPanel.tsx`, capability/i18n JSON) are imported by or
related to these two test files — confirmed no shared code path.

Per the executor's scope-boundary rule, this is logged rather than fixed. Resolution:
run `npm run setup:dev` against this worktree's local Supabase stack (or point
`.env.local` at an already-seeded instance) before relying on these two test files'
results.
