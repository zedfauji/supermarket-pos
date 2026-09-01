# Phase 24 — Deferred Items (out of scope for this plan)

## RESOLVED (2026-09-01, via /gsd-explore)

The following 4 items were fixed directly (each a one-line/mechanical fix, root cause already
confirmed pre-existing to Phase 24):

- **Auth credential drift (`alex@barpos.dev`)** — re-ran `scripts/setup-test-fixtures.ts`, which
  already existed to repair exactly this drift. `queries.clock.test.ts` and `useCloseTab.test.ts`
  now pass (7/7).
- **`router.tsx` typecheck failure** — removed the stale `future={{ v7_startTransition,
  v7_relativeSplatPath }}` prop from `<BrowserRouter>`; react-router-dom v7 dropped `future` because
  those v6-migration behaviors are now the default. `npm run typecheck` is clean.
- **`no-floating-promises` lint errors** — wrapped the 5 flagged `navigate(...)` calls in
  `HomeDashboard.tsx` (112, 120, 200) and `PINLoginForm.tsx` (66, 175) with `void`. `npm run lint` is
  clean.
- **Stale bar-pos fixture names in `atomic-rpc-guards.spec.ts`** — added a real seeded modifier
  ("Gift Wrap", price_delta 15, linked only to "MDH Garam Masala 100g") to `supabase/seed.sql` and
  the live local DB; repointed both tests off `Margarita`/`Extra Lime`/`Double Shot` to real
  Indian-catalog fixtures. Both tests pass in isolation.

## Not yet fixed — tracked as Phase 25

## Pre-existing `unregisterListener` pageerror flake, whole `e2e/receipts/` Tauri-mock harness (found during 24-04 Task 1 + Task 3)

**Discovered:** 2026-09-01, during 24-04 Task 1's live Playwright run of
`e2e/receipts/reprint.spec.ts`; blast radius confirmed wider during Task 3's full-folder
`e2e/receipts/` run.

**Symptom:** the same uncaught page error — `Cannot read properties of undefined (reading
'unregisterListener')`, thrown from `_unlisten` in the Tauri event-listener shim — fails 4 tests
across 3 spec files that each independently reimplement the same `window.__TAURI__` +
`window.__TAURI_INTERNALS__.invoke`/`transformCallback` mock pattern:
- `e2e/receipts/reprint.spec.ts` — `reprinting a split sale prints one receipt with both tender
  legs, not one leg's amount` (`injectPrintMock`)
- `e2e/receipts/pdf-delivery.spec.ts` — `Download PDF triggers the native save dialog with real
  receipt bytes`
- `e2e/receipts/print-retry-resilience.spec.ts` — `a transient printer failure is retried and the
  sale still completes (RCP-04)`, `a printer that stays offline through all retries never blocks
  the completed sale (RCP-02)`

**Root cause:** confirmed pre-existing — none of the 3 spec files were modified by any commit in
this plan except `reprint.spec.ts`'s single `* 1.16` tax-literal fix at line 70 (25ec052), which
this session re-verified in isolation does not touch the mock/teardown code path at all. All 3
files independently hand-roll the same `__TAURI_INTERNALS__` mock shape (no shared helper), so the
same Tauri event-listener teardown race exists in all three copies. Confirmed by running each spec
in isolation — the identical `unregisterListener` pageerror reproduces every time, unrelated to
tax math or receipt content. Confirmed 2026-09-01: none of the 3 files set
`__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` — the exact shim `e2e/helpers/tauriPeekMock.ts`
(Phase 18) and the broker-submission E2E mock both already carry to fix this identical crash.

**Why this is out of scope for 24-04:** the failure is a page-level uncaught exception from each
file's own duplicated print-mock harness, not an assertion about tax/subtotal/total values — none
of this plan's tax-formula/fixture changes touch any of these 3 files' mock setup.

**Fix, scoped as Phase 25 (E2E Receipt Print-Mock Consolidation):** extract the duplicated
`__TAURI_INTERNALS__` mock into one shared `e2e/helpers/tauriPrintMock.ts` (mirroring
`e2e/helpers/tauriPeekMock.ts`'s existing precedent) and add the missing
`__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` shim once, instead of hand-rolling (and
missing it) 3 times. Run `/gsd-plan-phase 25` to break it down.

## Pre-existing `barcode-scan-search.spec.ts` category-tab timeout (found during 24-04 Task 3)

**Discovered:** 2026-09-01, during 24-04 Task 3's full-folder `e2e/checkout/` run.

**Symptom:** `category tabs compose with search and show the empty state` fails with
`TimeoutError: locator.focus: Timeout 15000ms exceeded` waiting for
`getByRole('button', { name: 'Filter by Masalas' })` at `barcode-scan-search.spec.ts:127`.
Reproduces deterministically (re-run in isolation with `--retries=0`, failed identically).

**Root cause not diagnosed** — the "Masalas" category filter button never becomes available
within the timeout. Not investigated further because scope is confirmed out of bounds for this
plan (see below).

**Why this is out of scope for 24-04:** `git log` confirms `barcode-scan-search.spec.ts` was last
modified in Phase 18 (`eb840c7`) with zero commits from any Phase 24 plan; no Phase 24 plan's
`files_modified` references this spec, a category-filter component, or category seed data. The
failure is a UI focus-timeout on a category filter button — orthogonal to tax subtotal/total math,
this phase's entire surface area.

**Suggested fix (for whoever picks this up):** investigate why the "Masalas" category filter
button isn't appearing/interactive within 15s in this test's setup — likely a seed-data or
category-list render-timing issue unrelated to tax.
