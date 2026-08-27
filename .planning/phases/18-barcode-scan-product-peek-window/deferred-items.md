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

## Pre-existing e2e/checkout/ failures found during 18-03's full-folder regression run

Running `npx playwright test e2e/checkout/` (required by 18-03 Task 2's own acceptance
criteria) surfaces 11 pre-existing failures, all confirmed unrelated to this plan's files
by diffing against `main` before any 18-03 changes were made:

**9 failures in `barcode-scan-search.spec.ts`** (`scan adds a catalog product to the
cart`, both zero-price scan tests, the low-stock scan test, the sold-by-weight scan test,
both weight/receipt-screen scan-discard tests, `unknown scan is shown and audited`, the
inactive-barcode test, and `category tabs compose with search`) — all assume the
pre-Phase-18 UX where `useBarcodeScanner`'s `onScan` directly mutated the cart or showed
inline "Product not found" text on the main page. Phase 18 (already merged via Plan
18-01) intentionally changed this: `CheckoutPanel`'s `onScan` now only populates the
search box (`// A scan only populates the product search box — it never adds to the cart
by itself`) and opens the peek window; the actual product-detail/guard/add-to-cart flow
this test suite describes now lives in the peek window, covered by this plan's own
`e2e/checkout/peek-window.spec.ts`. `useScanBarcodeToCart.ts` (the hook that implemented
the old direct-add behavior) is still in the tree but is no longer imported by
`CheckoutPanel` — confirmed via `grep -rn "useScanBarcodeToCart" src/` (only self-references
and one stale comment in `useConfirmRiskyAdd.ts`).

Verified pre-existing (not introduced by 18-03): `git show main:src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`
already has the search-only `onScan` behavior before this plan touched any file. The
`category tabs compose with search` failure (a `.focus()` timeout, unrelated to scanning)
was also already failing on the same baseline run.

**2 failures in `atomic-rpc-guards.spec.ts`** (`rejects a forged zero modifier delta`,
`rejects a modifier not linked to the item product`) — both throw `Margarita not found`,
a bar-pos-era product name that does not exist in this repo's Indian-grocery seed catalog
(Phase 17 migrated seed data away from bar/pool-parlour products). Unrelated to barcode
scanning or the peek window; a stale fixture reference in that spec file.

Per the executor's scope-boundary rule (pre-existing failures in files this plan does not
touch are out of scope, and this project's Phase 18 intentionally redesigned the scan UX
that `barcode-scan-search.spec.ts` was written against), these are logged rather than
fixed here. Resolution: a follow-up plan should update `barcode-scan-search.spec.ts` to
match the new scan-opens-peek-window UX (retiring or rewriting the 9 stale assertions) and
fix/replace the `Margarita` fixture reference in `atomic-rpc-guards.spec.ts` with a seeded
Indian-grocery product name.
