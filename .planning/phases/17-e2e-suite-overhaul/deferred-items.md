# Phase 17 — Deferred Items

Out-of-scope discoveries surfaced during plan execution, logged per the
executor's scope-boundary rule (fix only what the current task's files
touch; log everything else here instead of fixing it inline).

## 17-12: Pre-existing lint errors in categories.spec.ts (moved verbatim from 31-categories.spec.ts)

`e2e/products/categories.spec.ts` (moved verbatim from `e2e/31-categories.spec.ts` per 17-12
Task 1's explicit "plain move, fixing imports only" instruction) fails `npx eslint` with 5
pre-existing errors, none introduced by the move:

- `no-non-null-assertion` x4 (lines ~31-32, 51, 86 — `process.env.VITE_SUPABASE_URL!` etc.)
- `consistent-type-imports` x1 (line ~112 — inline `import('@playwright/test').Page` type annotation)

Confirmed pre-existing by linting `git show HEAD:supermarket-pos/e2e/31-categories.spec.ts`
directly — same 5 errors, unrelated to this plan's changes. Out of scope per deviation rules'
SCOPE BOUNDARY (only auto-fix issues directly caused by the current task's changes). Left as-is;
a future lint-cleanup pass should fix these 5 findings across the whole `e2e/products/` file.

## 17-14 (Task 3 — error-scenarios-and-validation.spec.ts)

### DIRECT_SALE_FAILED leaks a raw Postgres constraint message to the checkout UI

**Resolved** 2026-08-25 — see fix(deferred): translate DIRECT_SALE_FAILED inventory-negative error.

**Discovered while designing ER6** (out-of-stock checkout). Confirmed via a
direct `process_direct_sale_atomic` RPC call against the local stack with a
product's `inventory.quantity_on_hand` set to 0:

```json
{
  "ok": false,
  "code": "DIRECT_SALE_FAILED",
  "message": "new row for relation \"inventory\" violates check constraint \"quantity_on_hand_non_negative\""
}
```

Root cause: `deplete_for_order_item` v6 (`supabase/migrations/20260810000007_deplete_for_order_item_v6.sql`)
only depletes open-unit (case→piece) products via `consume_open_unit` —
plain-product depletion still runs through the older
`decrement_inventory_on_order_item` trigger
(`supabase/migrations/20260814000001_loose_weight_items.sql`), which does a
raw `UPDATE inventory SET quantity_on_hand = quantity_on_hand - ...` with no
soft `INVENTORY_NEGATIVE` guard. Selling the last unit of a plain product hits
`inventory`'s hard `CHECK (quantity_on_hand >= 0)` constraint
(`supabase/migrations/20260414000007_inventory.sql`) instead, and that raw
Postgres text propagates unmapped through
`mapProcessPaymentEdgeError`'s default case
(`src/shared/lib/edge-function-contracts.ts`) all the way to
`PaymentForm.tsx`'s `setErrorMessage(result.error.message)` — no generic
translated fallback like `processRefund.genericError` exists for this path.

**Not fixed here** — this plan's `files_modified` is scoped to `e2e/*.spec.ts`
files only; the fix belongs in `src/shared/lib/edge-function-contracts.ts`
(map `DIRECT_SALE_FAILED` whose message matches the inventory constraint to a
translated `SALE-05`-style generic error) or in the DB layer (a soft
`INVENTORY_NEGATIVE` check ahead of the hard constraint, mirroring the
open-unit path's `p_allow_negative` pattern).

**Why ER6 doesn't hit this path:** the real, already-shipped UX for
low/zero-stock is a client-side gate one layer earlier —
`useConfirmRiskyAdd`/`getProductRiskFlag` flags any `quantityOnHand <=
lowStockThreshold` product at add-to-cart time with a translated "Only N
left of {product}" confirmation toast (`Add anyway` / `Cancel`), before the
item ever reaches the cart or the checkout RPC. ER6 was rewritten against
that real, working gate instead. The raw-Postgres-leak path above is only
reachable if a cashier explicitly confirms "Add anyway" on a stock=0 item and
then completes checkout — a narrower, still-real gap, but not what ER6's
"out-of-stock ordering" premise was actually testing for in the current app.

**Suggested follow-up:** a small hardening plan (or fold into a future
SALE-05-adjacent phase) that (1) adds a translated generic-error mapping for
`DIRECT_SALE_FAILED` mirroring `processRefund.genericError`'s pattern, and
(2) adds a Playwright test confirming a confirmed "Add anyway" + checkout
attempt against 0 stock shows a translated message, not raw Postgres text.

### `seedOpenTab`'s "any profile with this role" staff lookup was non-deterministic (fixed)

Not deferred — fixed directly in `e2e/helpers/supabase.ts` as part of this
plan (Rule 3, blocking issue) since ER5 (unchanged from the original file)
could not pass without it: the DB now carries many profiles per role
(other phases' staff-management specs seed dozens over a full suite run), so
`seedOpenTab`'s original `.eq('role', role).limit(1).single()` could pick a
different staff member than the one `loginAs(page, role)` actually
authenticates as (which is always the pinned `E2E_*_NAME` fixture account),
leaving the seeded tab attached to a shift the logged-in session never sees.
Fixed by preferring the pinned `E2E_*_NAME` profile when present, falling
back to the old "first profile with this role" behavior otherwise — backward
compatible for every other caller of `seedOpenTab`.

## 17-17 (Task 1/Task 2 — phase wrap-up)

### Genuine gaps found during the src/features-to-e2e cross-reference audit, not closed here

- `upload-logo` / RCPD-02's `GS v 0` thermal-raster print path has no Playwright e2e
  coverage — only a Vitest unit test (`pos-printer.test.ts`) asserting `logoDataUrl`/
  `paperWidthChars` reach the Tauri `invoke` call. A headless Chrome-for-Testing session
  can't drive the native Tauri shell or a physical printer, so the actual raster bytes
  can't be asserted end-to-end from `e2e/`. Logged to `WINDOWS.md` #30 as an accepted,
  reasoned gap rather than left silently unmentioned.
- `force-pin-change` has zero e2e coverage anywhere in the rewritten suite (a
  pre-existing unit-level gap already tracked at `WINDOWS.md` #2 for the same flow).
  Logged to `WINDOWS.md` #31; left for a future small e2e addition, out of this plan's
  agent-chat-focused scope.
- `manage-modifier-groups` has partial coverage only: `e2e/products/categories.spec.ts`
  confirms the "Modifier Groups" tab is visible to admin (T1) and RLS-denies a bartender
  write (T7), but there is no full-CRUD UI test (create/edit/delete a modifier group).
  Not logged as a separate ledger entry — narrower gap than the two above, RLS boundary is
  the security-relevant part and that is covered.

### Real bugs fixed while closing the agent-chat gap and running the full suite

- `confirmImport()` never actually executed `bulk_import_products` — it only staged the
  write-tool's two-step pending-confirmation and reported success without calling
  `confirm_action`. Every file-drop "Confirm Import" click had silently created zero
  products. Fixed in `src/features/agent-chat/model/useAgent.ts`.
- `addProduct`/`_executeBulkImportProducts` passed `category_id: null`, but
  `products.category_id` is `NOT NULL` — every agent-created product insert (chat-driven
  or file-drop import) failed with a raw Postgres 400. Fixed via a `resolveCategoryId()`
  fallback to a shared "Uncategorized" category in `src/shared/lib/agent/tools/menuTools.ts`.
- `useRefundsRegister` selected `profiles!created_by(full_name)` — `profiles` has no
  `full_name` column (the real column is `name`). Every RefundsRegister query has failed
  with Postgres `42703` since Phase 8, silently swallowed into an empty-result `Ok()` and
  rendered as the widget's own "No refunds" empty state. Found while adding the first e2e
  coverage for the `refunds-reg` report tab (a genuine gap the cross-reference audit
  surfaced). Fixed in `src/entities/tab/model/queries-reports.ts`. `WINDOWS.md` #28 (fixed).
- `npm run test:e2e` (bare `playwright test`, no path filter) crashed at discovery with
  zero tests found — Playwright's default `testMatch` also picks up `e2e/helpers/*.test.ts`
  (real Vitest unit tests for the helpers, never run by any Vitest project since all of them
  `exclude: ['e2e/**']`), and loading a file that imports from `'vitest'` inside Playwright's
  runner throws `Cannot redefine property: Symbol($$jest-matchers-object)`, aborting the
  whole run. Every prior wave-3 plan verified with an explicit folder/file path, bypassing
  full-tree discovery, so this was never triggered until this plan's own `npm run test:e2e`
  verification requirement. Fixed via `testIgnore: [/visual\//, /\.test\.ts$/]` in
  `playwright.config.ts`. `WINDOWS.md` #29 (fixed).
- `e2e/receipts/category-grouping.spec.ts`'s SC-2b (previously flaky, `WINDOWS.md` #22,
  "could not capture a clean full run") had a real, reproducible root cause once run without
  cross-worktree contention: `pickTwoCategoryProducts`'s "any `routing: 'NONE'` category"
  query could pick the newly-added "Uncategorized" fallback category (created by the
  `resolveCategoryId()` fix above, itself confirmed to have zero seeded products), and a
  Playwright `getByRole('heading', { name: 'Receipt' })` substring-matched a customer name
  containing the word "Receipt" instead of the real exact-text "Receipt" heading. Both fixed;
  `WINDOWS.md` #22 marked fixed.
- `e2e/infra/updater.spec.ts`'s console-error smoke test failed intermittently in the full
  suite run (not in isolation) — `useCurrentCaja`'s `caja.current.fetch_failed` logs at
  `logger.error` when this file's own `beforeEach` (no `resetTestState`/`openCaja` of its
  own) happens to run against ambient no-caja-open state left by whatever ran immediately
  before it. Pre-existing test-isolation gap, not touched by this plan. Logged to
  `WINDOWS.md` #32.
