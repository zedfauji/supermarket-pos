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

## `process-split-payment`'s per-leg tax decomposition compounds the pre-existing "full basket, partial total" receipt mismatch (found during 24-REVIEW.md fix pass, WR-02)

**Discovered:** 2026-09-01, `/gsd-code-review --fix` pass over `24-REVIEW.md`.

**Symptom:** `process-split-payment/index.ts` renders the tab's *entire* `items[]` array on
every leg's receipt (pre-existing "D-09" quirk, predates Phase 24 — see the file's own header
comment), while `subtotal`/`taxAmount`/`total` are now decomposed from that single leg's amount
only (Phase 24's `decomposeTax` addition). Example: a $100 sale split 50/50 cash+card shows the
full $100 worth of item lines on *both* receipts, but each receipt's decomposed
subtotal+tax only adds up to $50 — the printed items and the printed subtotal/tax/total no
longer reconcile with each other on a per-leg receipt.

**Why this is deferred rather than fixed in this pass:** REVIEW.md's own two proposed fixes both
require a design decision beyond a mechanical fix:
- (a) scale `items[]` down to the leg's proportional share (changes what a customer sees printed
  as line items — a customer-facing behavior change, not a pure bug fix), or
- (b) keep the full item list but source `subtotal`/`taxAmount`/`total` from the tab's full
  charged amount and add a new, distinct "amount collected on this tender" field (a schema/contract
  change to `ReceiptData` and every receipt-rendering consumer: thermal print, PDF export, email).

Both are correctness-improving but neither is a same-shape, low-risk mechanical fix appropriate for
an automated fix pass — they change what's printed on a customer-facing receipt and/or the
`ReceiptData` contract. The underlying "full items, partial total" mismatch is pre-existing to
Phase 24 (documented in the file's own D-09 comment); Phase 24's tax-decomposition change made the
mismatch more visible (a plausible-looking Subtotal+Tax+Total block now sits next to it) but did
not introduce the root inconsistency.

**Suggested fix (for whoever picks this up):** pick option (a) or (b) above as a deliberate product
decision (probably (b), since it doesn't reprint different item lines depending on which tender the
customer is holding), then update `process-split-payment/index.ts`'s per-leg receipt construction,
the `ReceiptData` contract, and every renderer that reads `subtotal`/`total` off a split-payment
receipt.

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
