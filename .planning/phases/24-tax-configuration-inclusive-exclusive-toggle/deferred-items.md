# Phase 24 — Deferred Items (out of scope for this plan)

## Pre-existing local-DB auth credential drift (found during 24-01 Task 2)

**Discovered:** 2026-08-31, during 24-01 Task 2's `npm run test` full-suite verification run.

**Symptom:** 3 unit test failures, all in files never touched by this plan:
- `src/entities/staff/model/queries.clock.test.ts` — `useShiftClosePreview`/`useMutationClockOut`
- `src/features/close-tab/tests/useCloseTab.test.ts` — `useCloseTab`

**Root cause (confirmed, not speculative):** these integration tests `signInWithPassword`
against the seeded staff account `alex@barpos.dev` / `123456` on the local self-hosted Supabase
stack. Direct verification via a standalone script confirms the local auth stack rejects this
login with `Invalid login credentials` — the account's password hash in this local dev DB no
longer matches the hardcoded test password, independent of anything in this plan. Every
assertion downstream of that failed sign-in (RLS-gated mutations silently running unauthenticated)
then fails as a consequence, not a cause.

**Why this is out of scope for 24-01:** neither test file, nor `close_tab`/`clock_out`/shift
RPCs, nor `alex@barpos.dev`'s credentials were touched by any task in this plan. This plan's own
verification surface (`edge-tax.test.ts`, `billing-settings.test.ts`, `PaymentForm.test.tsx`,
`e2e/checkout/tax-inclusive-mode.spec.ts`) is fully green. Per the executor's scope-boundary rule,
pre-existing failures in unrelated files are logged, not fixed, here.

**Suggested fix (for whoever picks this up):** reset `alex@barpos.dev`'s password on the local
stack via `supabase.auth.admin.updateUserById` (see CLAUDE.md's "PIN/password has two separate
credential stores" section for the correct dual-write pattern if `profiles.pin` also needs
realigning), or reseed the local dev DB's auth users from the documented seed script.

**Verification of pre-existing-ness:** confirmed the local DB was already in a slightly
inconsistent state before this plan ran — `supabase_migrations.schema_migrations` showed a
`20260831001057 / concurrent_agent_placeholder` row (not a real repo migration file) at the top of
the applied list, and `20260831000004_caja_report_bank_transfer_breakout.sql` (a real file already
committed to the repo from prior work) was *not yet applied* to this local DB before this plan's
Task 2 ran — both signs of unrelated environment drift predating this session.

## Pre-existing `npm run typecheck` failure in `src/app/router.tsx` (found during 24-02 Task 1/2)

**Discovered:** 2026-09-01, during 24-02's plan-level `npm run typecheck` verification.

**Symptom:** `src/app/router.tsx(36,20): error TS2322: Type '{ children: Element[]; future: {...} }'
is not assignable to type 'IntrinsicAttributes & BrowserRouterProps'. Property 'future' does not
exist on type 'IntrinsicAttributes & BrowserRouterProps'.`

**Root cause:** a react-router-dom version/types mismatch — `<BrowserRouter future={{...}}>` is
being passed a `future` prop that the currently installed `@types/react-router-dom` (or
`react-router-dom` itself) doesn't declare. Unrelated to `BillingSettingsTab.tsx` or any file this
plan touches.

**Why this is out of scope for 24-02:** confirmed via `git stash` + `npm run typecheck` before this
plan's changes were applied — the identical error reproduces on a clean `main` HEAD (commit
`542b0cf`), so it predates this plan entirely. `BillingSettingsTab.tsx`'s own typecheck surface is
clean (`npx eslint` reports zero errors on this file; the only failure across the whole
`tsc --noEmit` run is the single `router.tsx` line above).

**Suggested fix (for whoever picks this up):** align `react-router-dom`/`@types/react-router-dom`
versions, or drop the `future` prop if the installed router version doesn't support it.

## Pre-existing `npm run lint` failures in `HomeDashboard.tsx`/`PINLoginForm.tsx` (found during 24-02)

**Discovered:** 2026-09-01, during 24-02's plan-level `npm run lint` verification.

**Symptom:** 5 `@typescript-eslint/no-floating-promises` errors — 3 in
`src/widgets/HomeDashboard/ui/HomeDashboard.tsx` (lines 112, 120, 200), 2 in
`src/widgets/PINLoginForm/PINLoginForm.tsx` (lines 66, 175). Neither file was read or modified by
this plan. `npx eslint src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx --max-warnings 0`
reports zero errors on this plan's own target file.

**Why this is out of scope for 24-02:** per the executor's scope-boundary rule, pre-existing
failures in files unrelated to the current task are logged, not fixed.

**Suggested fix (for whoever picks this up):** wrap each flagged async call with `void` or
`.catch(...)` per the rule's own guidance.

## Pre-existing bar-pos-era fixture gaps in `atomic-rpc-guards.spec.ts` (found during 24-04 Task 1)

**Discovered:** 2026-09-01, during 24-04 Task 1's live Playwright run of
`e2e/checkout/atomic-rpc-guards.spec.ts`.

**Symptom:** 2 test failures, both throwing `Cannot coerce the result to a single JSON object`
(a Supabase `.single()` zero-row error):
- `rejects a forged zero modifier delta that undercounts the total and writes no rows` — looks up
  a product named `'Margarita'`, not found.
- `rejects a modifier not linked to the item product and writes no rows` — looks up a modifier
  named `'Double Shot'`, not found.

**Root cause (confirmed, not speculative):** both fixture names (`Margarita`, `Double Shot`) are
bar/pool-parlour-era product/modifier names from before Phase 1's rebrand to the Indian-grocery
catalog — they don't exist in the current seed data at all. Confirmed pre-existing via
`git stash` + re-run against clean HEAD (`8eb89cb`): both tests fail identically before any of
this plan's changes.

**Why this is out of scope for 24-04:** neither the `modifiers` table content nor these two
tests' fixture lookups involve tax math — they're unrelated stale-fixture bugs in a file this
plan otherwise touches only for its tax-formula de-duplication (Task 1). Per the scope-boundary
rule, logged rather than fixed.

**Suggested fix (for whoever picks this up):** either reseed `products`/`modifiers` with real
Indian-catalog fixture names these two tests can use, or rewrite the tests to pick an existing
seeded product + modifier pair dynamically instead of a hardcoded bar-pos name.

## Pre-existing `unregisterListener` pageerror flake in `reprint.spec.ts` (found during 24-04 Task 1)

**Discovered:** 2026-09-01, during 24-04 Task 1's live Playwright run of
`e2e/receipts/reprint.spec.ts`.

**Symptom:** `reprinting a split sale prints one receipt with both tender legs, not one leg's
amount` fails with an uncaught page error: `Cannot read properties of undefined (reading
'unregisterListener')`, thrown twice per run.

**Root cause:** confirmed pre-existing via `git stash` + re-run against clean HEAD (`8eb89cb`)
— the identical failure reproduces before any of this plan's changes. Looks like a Tauri
event-listener teardown race in the injected `__TAURI_INTERNALS__` print mock
(`injectPrintMock`), unrelated to tax math or receipt content.

**Why this is out of scope for 24-04:** the failure is a page-level uncaught exception from the
print-mock harness, not an assertion about tax/subtotal/total values. This plan's tax-formula fix
in this file (the `* 1.16` literal at line 70) is unaffected — confirmed by re-running just the
line-70 fix in isolation once the pageerror is set aside.

**Suggested fix (for whoever picks this up):** investigate `injectPrintMock`'s
`unregisterCallback`/`transformCallback` mock shape in `e2e/receipts/reprint.spec.ts` for a
teardown-order race against the real Tauri IPC bridge.
