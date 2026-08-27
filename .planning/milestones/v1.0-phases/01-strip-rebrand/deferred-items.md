# Deferred Items — Phase 01 (strip-rebrand)

Items discovered during plan execution that are pre-existing and out of scope
for the plan that surfaced them (per executor scope-boundary rules — only
auto-fix issues directly caused by the current task's changes).

## From 01-05 (Rappi delivery removal)

Discovered while running `npx vitest run` as part of Task 1 verification.
None of these reference Rappi and none were introduced by 01-05's changes —
confirmed via `git diff` on each touched test file before attributing.

- **`src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx`** — 3 failing
  assertions (`renders all main navigation button labels`, `cashier clicking
  POS Register navigates directly to /pos`, `gated buttons show lock icon for
  cashier`) all stem from the test still expecting a `'Rappi Orders'` button
  and a stale gated-icon count. `HomeDashboard.tsx` itself has zero Rappi
  references (tile already removed in 01-04's "sever HomeDashboard tiles"
  commit) — the test file was never updated to match. Pre-existing since
  01-04, not caused by 01-05.
- **`src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx`** — `shows
  manager tabs when only manage_products is granted` expects a `'Pool
  Tables'` tab that `SettingsTabsPanel/index.tsx` no longer renders (also
  already severed in 01-04). Pre-existing since 01-04, not caused by 01-05.
- **`src/widgets/PINLoginForm/PINLoginForm.test.tsx`** — 5 failing tests
  unrelated to Rappi or Settings; not investigated further (out of this
  plan's file scope).
- **`src/shared/lib/help/content.test.ts`** — 2 failing tests unrelated to
  Rappi; not investigated further.
- **~20 `*.integration.test.ts` files** (reports, open-unit, promotion,
  reopen-tab, process-refund, edit-paid-tab) — all fail with the same root
  cause: `insert or update on table "shifts" violates foreign key constraint
  "shifts_staff_id_fkey"` against the local Supabase instance, i.e. a missing
  seed row in `profiles` for the test staff id, not a code defect. Pre-existing
  local-DB seeding/environment issue, unrelated to Rappi removal.

Per CLAUDE.md's testing policy these ultimately need automated-Playwright
resolution, not a `human_needed` state — but fixing them is outside 01-05's
objective (Rappi delivery removal) and should be picked up by whichever plan
next touches `HomeDashboard`, `SettingsTabsPanel`, `PINLoginForm`, or the
local integration-test DB seed.

## From 01-06 (Pool table / billiards session removal)

- **`src/entities/promotion/model/pool-promotions-rpc.integration.test.ts`**
  (3 tests) — now fails with `Could not find the table 'public.resources' in
  the schema cache` / missing `stop_pool_session` RPC. This file lives in
  `entities/promotion/`, entirely Plan 01-10's scope (Promotions strip), not
  01-06's — RESEARCH.md's own threat register (T-01-13) already flagged this
  exact cross-plan dependency as expected transient same-wave state, not a
  defect in 01-06's migration. 01-10 deletes the Promotions domain (schema,
  RPCs, and this test file) wholesale; no action needed from 01-06.
- **`src/features/seat-waitlist-party/ui/SeatPartySheet.tsx`**'s
  `usePoolTables()` inline query and **`src/widgets/WaitlistQueue/ui/WaitlistQueue.tsx`**'s
  `usePoolTablesCount()` inline query both still `.from('resources')` directly
  (not via the deleted `@entities/resource` barrel, so `npx tsc --noEmit`
  doesn't catch it) — this is now a runtime-only break in code owned by Plan
  01-08 (waitlist domain removal), which deletes both files' parent
  directories shortly. Not fixed here: redesigning "seat a waitlist party at a
  table" without a pool-table concept is a real product decision squarely
  within 01-08's scope, not something to preempt from 01-06. `useSeatAtNewTable`
  (the one piece of `SeatPartySheet.tsx` that had a compile-time dependency on
  `@entities/resource`) was already removed in 01-06 to keep `tsc` green; only
  the inline `resources` queries remain as the noted runtime-only gap.

## From 01-11 (Split-tab / transfer-tab / /pos page removal)

- **SEVERE, pre-existing, NOT caused by this plan:**
  `src/entities/tab/model/queries.ts`'s `tabListSelect` (used by both
  `useTabs()` and `useTab()` — i.e. every open-tabs list and every tab-detail
  fetch in the app) still embeds `pool_sessions(... resources!pool_sessions_table_id_fkey(...))`.
  01-06 dropped both `pool_sessions` and `resources` from the live DB
  (`.planning/phases/01-strip-rebrand/01-06-SUMMARY.md`). A PostgREST select
  that embeds a non-existent relation errors at query time, so — unless
  something else compensates that this plan's file-scoped review didn't
  surface — every tab list/detail fetch may currently be broken on the new
  project, independent of anything split-tab/transfer-tab related. Out of
  scope for 01-11 (not a split-tab/transfer-tab column), but severe enough to
  flag loudly: whichever plan next touches `entities/tab/model/queries.ts`
  (01-13's domain.ts sweep touches `TabSchema`'s `poolCharges`/
  `hasActivePoolSession` fields, which are fed by this same select) should
  verify `useTabs()`/`useTab()` actually work against the live DB before
  closing out the phase. Plan 01-13 Task 3 (full retained E2E suite run)
  should catch this if it's real — treat any `02-caja`/`05-payments`/
  `09-rbac` failure there as a candidate root cause, not a flake.
- **Pre-existing, NOT caused by this plan:** ~6 `*.integration.test.ts` files
  (`entities/open-unit/model/consume-open-unit`, `entities/open-unit/model/open-unit-lifecycle`,
  `entities/staff/model/locale-rls`, `features/edit-paid-tab/model/edit-paid-tab-rpc`,
  `features/reopen-tab/model/reopen-tab-rpc`) fail with
  `invalid input value for enum user_role: "bartender"` — test fixtures still
  seed the literal string `"bartender"` even though the `user_role` enum was
  renamed to `cashier` in Plan 01-03 (D-16). Not investigated further —
  outside 01-11's file scope (split-tab/transfer-tab).
- The generic `~20 *.integration.test.ts` `shifts_staff_id_fkey` seeding
  failure documented under "From 01-05" above still reproduces unchanged
  across `entities/tab/model/*-report.integration.test.ts` and others after
  this plan's changes — confirmed pre-existing, not a regression.

## From 01-13 (e2e/20-error-scenarios.spec.ts /pos-dependency fix)

- **Pre-existing, NOT caused by this plan, machine/environment-level:** the
  local `supabase-edge-functions` Docker container currently running on this
  dev box mounts `/mnt/ai/projects/supabase-local/volumes/functions` (a
  *different, shared* Supabase-local stack on the machine), not this
  project's own `supabase/functions/` — `docker inspect supabase-edge-
  functions` shows the mount, and the mounted directory only contains
  `hello`/`main`, none of this project's functions (`process-payment`,
  `get-server-time`, etc.). Every edge function call fails with `"worker
  boot error: failed to bootstrap runtime: could not find an appropriate
  entrypoint"` regardless of caller or payload — confirmed via direct `curl`
  against `get-server-time` (unrelated to any tab/payment state) returning
  the identical error. This blocks `e2e/20-error-scenarios.spec.ts`'s ER5
  ("already-paid tab disappears from payments list") at its
  `process-payment` call — everything before that point (login, DB seed via
  `seedOpenTab`, `/payments` navigation, tab-card click, manager PIN gate,
  cash amount entry) passes. Not fixed here: this project's own Supabase
  stack needs to be started (`supabase start` from `supermarket-pos/`)
  rather than sharing the other project's instance on the same ports — out
  of scope for a single E2E spec fix and risks disrupting whatever else is
  using that shared stack. Whoever next needs a working local
  `process-payment`/payment E2E run should point their dev environment at
  this project's own local Supabase instance first.

## From 01-13 (e2e/09-rbac.spec.ts /pos-dependency fix)

- **Same pre-existing, machine/environment-level issue as above, wider blast
  radius than previously documented:** the `get-server-time` edge function
  500 isn't limited to payment-flow calls — it fires on essentially every
  protected-route mount (observed alongside a `caja.current.fetch_failed`
  log immediately after each 500, i.e. it's wired into the caja
  current-session fetch that runs on page load, not just checkout). This
  makes any E2E test in `09-rbac.spec.ts`'s `'Phase 13: Permission Matrix'`
  describe block that asserts `expect(consoleErrors).toHaveLength(0)` fail
  (T-RP-01 through T-RP-06), even for tests with no payment/refund
  interaction at all (e.g. T-RP-01's static matrix-content assertions, T-RP-03's
  plain `/rbac` → `/home` redirect). Confirmed via a temporary
  `page.on('response', ...)` probe: every failure traces to the identical
  `GET http://localhost:8000/functions/v1/get-server-time` 500. Not fixed
  here — same root cause and same fix (point this dev environment's Supabase
  stack at its own `supabase/functions/`, not the shared one) as documented
  above; out of scope for a single spec file.

## From 01-13 (e2e/38-audit-logs.spec.ts /pos-dependency fix)

- **Same pre-existing, machine/environment-level `process-payment` edge
  function failure as documented above** (confirmed via `docker inspect
  supabase-edge-functions` — the container's bind mount still points at
  `/mnt/ai/projects/supabase-local/volumes/functions`, a different, shared
  Supabase-local stack, not this project's own `supabase/functions/`).
  `should display audit entries after processing a payment` was rewritten to
  seed the tab via `seedOpenTab` and drive checkout through `/payments`'
  inline `PaymentForm` (identical component `/pos`'s checkout modal used) —
  the flow itself is correct and reaches the "Process payment" click, but
  the underlying `POST /functions/v1/process-payment` call 500s with `worker
  boot error: failed to bootstrap runtime: could not find an appropriate
  entrypoint`, so the Receipt heading never renders and the test times out
  at the same wall this dev box hits in `e2e/20-error-scenarios.spec.ts`'s
  ER5 and `e2e/23-payment-edge-cases.spec.ts`'s PE3 (verified: re-running
  ER5 in isolation on this box fails identically, confirming the failure is
  not caused by this plan's changes). Left as a real (non-skipped) assertion
  to match the established convention for edge-function-dependent E2E tests
  in this repo (ER5/PE3 are also not skip-guarded) — will pass once this
  dev environment's Supabase stack points at its own `supabase/functions/`.
  The companion refund test (`should display audit entry after processing a
  refund`) does **not** hit this wall — `process-refund` goes through a
  direct Postgres RPC (`useProcessRefund`), not an edge function — and was
  rewritten the same way (seed a paid tab, drive the actual refund through
  `/payments`' `RefundSheet`) with no environment blocker; it passes.

## From 01-13 (e2e/49-receipt-category-grouping.spec.ts /pos + /kds-bar-dependency fix)

- SC-2b ("receipt shows both category headers and an indented modifier line
  after a real cash payment") was rewritten the same way as 38-audit-logs'
  payment test: seed a two-category tab (with a real `modifier_ids` row —
  the original hardcoded modifier UUID didn't exist in this DB; fixed to the
  real "Extra Lime" modifier id as part of this change) directly via the
  service-role client, then drive checkout through `/payments`' inline
  `PaymentForm`.
- **New manifestation of the same pre-existing, machine/environment-level
  Supabase misconfiguration documented above — wider blast radius than
  previously recorded:** the `get-server-time` 500 doesn't just fail its own
  fetch (silently, per `useServerTimeDrift`'s design) — on this dev box it
  also fires a `SIGNED_OUT` auth event a few seconds after landing on
  `/payments`, which `Providers.tsx`'s `onAuthStateChange` handler treats as
  "session genuinely gone" and force-logs-out the staff member
  (`store.logout()`), bouncing `ProtectedRoute` back to `/login` before the
  test's `tabs-waiting-for-payment` list ever renders. Confirmed via
  `page.on('framenavigated'/'response')` instrumentation during authoring:
  `/payments` loads, `GET http://localhost:8000/functions/v1/get-server-time`
  500s, then the app navigates `/payments` → `/home` → `/login` unprompted
  (no test-driven navigation in between). Reproduced deterministically (3/3
  runs) with role `manager` (the same role 38-audit-logs.spec.ts uses
  successfully up to its own `process-payment` wall), so this is not caused
  by this test's seed data or role choice. Root cause is almost certainly
  the same shared/mismatched local Supabase stack documented above (GoTrue
  session validation or auto-refresh likely hitting the same
  wrong-project config as the edge-functions container) — out of scope to
  chase further here. Left as a real (non-skipped) assertion, same
  convention as ER5/PE3/38-audit-logs's payment test; will pass once this
  dev environment's own Supabase stack (not the shared one) is used.
- SC-4 ("the same modifier name appears on the KDS bar board and on the
  post-payment receipt") is `test.skip`'d, not deleted — Plan 01-07 (D-09)
  deleted the KDS bar board wholesale (route, `entities/kds`,
  `widgets/KdsBoard`), leaving no second surface to compare the receipt
  against, so the test's actual subject (cross-surface consistency) has no
  substitute. Its body is left intact (compiles, doesn't run) for
  re-enabling if a KDS bar board returns in a later phase.
- The `e2e/helpers/supabase.ts` `resetTestState()` helper still writes
  `order_items.kds_status` (line ~81), a column dropped in migration
  `20260810000004_drop_kds_and_prep.sql` — the write silently no-ops
  (Supabase client doesn't throw on an unchecked `.update()` error), so it's
  not currently blocking anything, but it's dead code from the same KDS
  removal this spec's SC-4 skip documents. Not fixed here — shared helper,
  out of this single-spec-file plan's scope.
