---
schema_version: 1
open_count: 40
waived_count: 0
fixed_count: 16
total_count: 56
last_updated: 2026-09-04T04:48:35.281Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | e2e/02-caja.spec.ts |  | Manager closes caja test flakes (timeout waiting for success toast) - likely test-ordering issue with preceding open-tabs test; close_caja_session RPC verified functional via direct SQL call | open |  | 2026-08-10T22:16:08.228Z |  |
| 2 | 01 | deviation | src/widgets/PINLoginForm/PINLoginForm.test.tsx |  | 5 pre-existing unit test failures (forced_pin_change phase + clock-in-fails), fully mocked Supabase client, UI copy/locale text-matching mismatches unrelated to backend | open |  | 2026-08-10T22:16:08.278Z |  |
| 3 | 01 | unrun-verify | e2e/18-modifier-notes-kds.spec.ts |  | T1/T2 could not be verified end-to-end after this plan's T3 trim — local supabase-edge-functions container's get-server-time function fails to boot (pre-existing Docker infra fault, not caused by this plan), test fails at the New Tab click step before reaching modifier-sheet interaction | fixed |  | 2026-08-11T04:26:22.709Z | 2026-08-25T19:47:00.175Z |
| 4 | 02 | unrun-verify | e2e/51-barcode-scan-search.spec.ts |  | Live barcode/category Playwright run times out in shared beforeEach before plan assertions execute. | open |  | 2026-08-12T17:40:44.514Z |  |
| 5 | 02 | lint-warning | src/features/checkout-sale/model/useCheckoutSale.ts |  | Full lint remains blocked by 12 pre-existing Plan 02-01 errors outside 02-02 scope. | open |  | 2026-08-12T17:40:44.564Z |  |
| 6 | 02 | unrun-verify | e2e/52-loose-weight-hold-sale.spec.ts |  | Loose-weight and held-sale Playwright coverage could not reach assertions because local Supabase global setup stalled. | open |  | 2026-08-12T18:15:28.583Z |  |
| 7 | 02 | unrun-verify | src/entities/tab/model/cartStore.test.ts |  | Weighted cart unit tests could not reach assertions because Vitest global setup stalled on local Supabase. | open |  | 2026-08-12T18:15:28.633Z |  |
| 8 | 02 | unrun-verify | e2e/52-loose-weight-hold-sale.spec.ts |  | Combined Phase-02 Playwright run lost Vite during later e2e/52 UI cases; focused new cart-swap E2E passes. | open |  | 2026-08-12T20:23:19.816Z |  |
| 9 | 03 | unrun-verify | e2e/10-inventory.spec.ts |  | Plan-level inventory regression run stopped at the pre-existing manual-adjustment test after local Realtime returned HTTP 503. | open |  | 2026-08-14T19:40:03.667Z |  |
| 10 | 03 | unrun-verify | e2e/54-near-expiry-alerts.spec.ts |  | Targeted Playwright test is blocked by existing full-page-reload session restoration failure after reaching the near-expiry settings UI. | open |  | 2026-08-14T19:53:06.239Z |  |
| 11 | 04 | unrun-verify | package.json |  | Repository-wide npm run lint hangs after the existing boundaries-plugin warning; focused lint for all plan-owned files passed. | open |  | 2026-08-15T05:56:02.772Z |  |
| 12 | 05 | deviation | e2e/09-rbac.spec.ts |  | T-RP-05 (process_refund blocked for bartender) fails pre-existing: clicking Refund now opens the RefundSheet reason/approval dialog instead of an immediate RPC call, so the test's expected forbidden-toast text never appears. Unrelated to void-order deletion (process-refund feature last touched Phase 1, commit a3d5fe1). | open |  | 2026-08-17T06:59:39.608Z |  |
| 13 | 05 | deviation | e2e/07-reports.spec.ts | 935 | Phase 24 'bartender-initiated reason-required removal' test fails pre-existing: seedRemovableItem helper queries table 'public.pool_tables', dropped in Phase 1's strip-and-rebrand. Unrelated to void-order deletion. | open |  | 2026-08-17T06:59:46.237Z |  |
| 14 | 05 | unrun-verify | package.json |  | Full npm run test:e2e (44 specs, single worker, ~1h) hit 40 failures spread across unrelated files (staff-mgmt, caja-entries, payment-edge-cases, categories, audit-logs, i18n, edit-paid-tab, reopen-ticket, direct-sale-checkout, barcode-scan, loose-weight, full-day-soak) with no thematic link to void-order/RBAC/edge-function changes -- consistent with this env's documented long-run E2E flakiness (see ledger #1,3,4,6-11). Individually: e2e/09-rbac.spec.ts, e2e/07-reports.spec.ts, e2e/02-caja.spec.ts, e2e/35-refund.spec.ts (the phase's SC1/SC4/SC5 gates) all pass except the two pre-existing unrelated failures logged separately. | open |  | 2026-08-17T06:59:53.165Z |  |
| 15 | 08 | deviation | e2e/helpers/supabase.ts |  | seedNewStaffMember sets Auth password to Test<PIN>! but SM3/loginAsNamed sign in with the raw PIN — pre-existing mismatch, unrelated to 08-06's scope, confirmed independently reproducible | fixed |  | 2026-08-18T15:17:00.838Z | 2026-08-25T20:23:37.034Z |
| 16 | 10 | deviation | e2e/38-audit-logs.spec.ts |  | Diff viewer > should open diff sheet on row click is a pre-existing flake, unrelated to plan 10-07 (unscoped 'first diff button on page' row selector); logged in deferred-items.md, not fixed | open |  | 2026-08-19T02:20:17.581Z |  |
| 17 | 17 | deviation | .planning/REQUIREMENTS.md |  | Plan requirements TEST-02, TEST-03, and TEST-04 are absent from the current requirements register. | fixed |  | 2026-08-25T05:36:06.412Z | 2026-08-26T00:52:52.820Z |
| 18 | 17 | deviation | e2e/products/categories.spec.ts |  | Full-file run shows T1/T2/T3/T4/T5/T8 failing on Spanish (es-MX) UI text — the shared local Supabase's pinned E2E accounts are flipped to en-US, but a concurrently-running sibling worktree's locale-switch test appears to leave the shared DB mid-flight in es-MX before resetTestState's per-account reset catches up. T1 verified passing in isolation (13.5s, no failures) — this is shared-DB cross-worktree flakiness (see ledger #1,3,4,6-11,14), not a defect in the verbatim-moved file. | open |  | 2026-08-25T19:47:10.467Z |  |
| 19 | 17 | deviation | e2e/products/product-management.spec.ts | 392 | PM8 (cashier navigating to /inventory — button absent or PIN gate shown) fails pre-existing: /inventory now renders fully for a cashier (no redirect to /home, no 'manager access required' text) — RBAC gating for this route/page appears to have changed since the test was written. Test logic unchanged from the pre-move file (only docstring wording updated for the bartender->cashier rename); unrelated to this plan's PM4/PM7 rewrite. | fixed |  | 2026-08-25T19:47:19.271Z | 2026-08-26T03:00:00.419Z |
| 20 | 17 | deviation | e2e/inventory/open-units.spec.ts |  | Confirmed features/override-negative-stock (D-05 negative-stock manager-PIN override) has zero callers anywhere in the app -- orphaned dead code from the pre-rebuild tab-based ordering UI. Direct-sale checkout's process_direct_sale_atomic has no equivalent override path. Not fixed (out of E2E-rewrite scope), flagged for a future phase to decide whether checkout needs its own negative-stock override. | open |  | 2026-08-25T20:07:05.208Z |  |
| 21 | 17 | unrun-verify | e2e/inventory/loose-weight-hold-sale.spec.ts |  | 3 of 6 tests and open-units.spec.ts's single monolithic test intermittently fail under this session's heavy concurrent-worktree load (many wave-3 executors sharing one local Supabase instance + one dev server) -- confirmed via distinct error signatures (CAJA_CLOSED RPC rejection, caja_sessions_one_open duplicate-key violation, Realtime WebSocket 500/503, products.sold_by_weight flipped mid-test) that another agent's own resetTestState/openCaja call raced this spec's DB state, not a logic defect in the rewrite. Isolated single-file reruns during lower-contention windows passed cleanly; typecheck and lint are clean. Two genuine bugs found and fixed during this same investigation: a strict-mode getByText(PRODUCT) locator collision, and fixture base_price too high for the 100-tendered UI flow. | open |  | 2026-08-25T20:07:40.724Z |  |
| 22 | 17 | unrun-verify | e2e/receipts/category-grouping.spec.ts |  | SC-2b logic verified correct via direct DB inspection (seeded tab shift_id exactly matched the logged-in manager's session) but a clean full run was not captured this session: the parallel wave-execution setup runs many worktree agents against one shared, non-namespaced local Supabase DB (live polling showed continuous external tab/shift mutation) and a shared :1520 dev server (5 concurrent npm run dev processes, intermittent ERR_CONNECTION_REFUSED across unrelated sibling specs too). Retry hardening added; not a defect in this plan's code. | fixed |  | 2026-08-25T20:12:00.000Z | 2026-08-26T00:27:14.016Z |
| 23 | 17 | unmet-truth | supermarket-pos/e2e/rbac/staff-management.spec.ts |  | SM6 asserts view_all_shifts RBAC enforcement (bartender sees only own shifts) but StaffDashboard renders the full roster to every role -- pre-existing, already-documented gap (D-03, prior phase), not introduced by 17-11, not fixed per SCOPE BOUNDARY. | fixed |  | 2026-08-25T20:22:52.106Z | 2026-08-26T03:00:00.482Z |
| 24 | 17 | deviation | src/shared/lib/edge-function-contracts.ts |  | DIRECT_SALE_FAILED (out-of-stock plain-product sale) leaks a raw Postgres constraint message to the checkout UI via mapProcessPaymentEdgeError's default case — no genericError-style translated fallback exists for this path (see 17-14 deferred-items.md) | open |  | 2026-08-25T20:44:10.337Z |  |
| 25 | 17 | lint-warning | e2e/infra/offline.spec.ts,e2e/soak/full-day-soak.spec.ts |  | npm run lint fails with ~80 pre-existing @typescript-eslint errors (no-unsafe-assignment, no-unnecessary-condition on RPC-result destructuring) inherited unchanged from the original 55-full-day-soak.spec.ts and the still-flat 48-reopen-closed-ticket.spec.ts's shared seed-helper pattern; confirmed pre-existing via git show of the pre-move file, not introduced by 17-15's move | open |  | 2026-08-25T20:59:55.845Z |  |
| 26 | 17 | unrun-verify | e2e/inventory/inventory-intelligence.spec.ts | 131 | T5 (physical count submit adjusts stock and writes stock_movements) intermittently fails with a quantity_delta far outside the seeded expectation (e.g. -30 instead of -5) -- reproduced twice, self-heals on retry every time. Verbatim-unchanged logic (17-07 only swapped the Indian-catalog fixture); root cause is the shared, non-namespaced local Supabase instance under concurrent worktree/session load racing setInventoryQty's write against the physical-count RPC's read of "before" quantity -- same class as ledger #21/#22, not a defect in the test or the physical-count RPC. | open |  | 2026-08-25T22:54:48.537Z |  |
| 27 | 17 | unmet-truth | e2e/reports/report-tabs.spec.ts | 1611 | "Turnover row shows units sold and a non-null turnover ratio" reproduced twice with a consistent, non-random -3-unit gap between the test's own service-role recompute (24, then 28) and the UI's rendered units-sold cell (21, then 25) for the same product/date-range -- at the same instant a follow-up service-role query confirms the higher (true) total persists with no further external writes. Both the test's manual query and the UI's useProductSalesReport share byte-identical filter logic (neq status voided, tabs.created_at range), ruling out a selector/timing race -- the gap is real and reproducible, not flaky noise, but isolating the exact mechanism (RLS visibility scoping for the 'admin' authenticated role vs the service-role client bypassing RLS entirely, or a date-range boundary fixed at component-mount-time) needs a deeper report-correctness investigation than this post-merge regression pass covers. Verbatim-unchanged test (byte-identical to the pre-wave-3 e2e/07-reports.spec.ts), so not introduced by 17-09's move. | fixed |  | 2026-08-25T22:54:48.537Z | 2026-08-26T03:00:00.542Z |
| 28 | 17 | deviation | src/entities/tab/model/queries-reports.ts |  | useRefundsRegister selected profiles!created_by(full_name) but profiles has no full_name column (real column is name) -- every RefundsRegister query has failed with Postgres 42703 since Phase 8, silently caught into an empty-result Ok() and rendered as the widget's own no-refunds empty state. Found and fixed while closing a genuine e2e-coverage gap (report-tabs.spec.ts's refunds-reg tab had zero prior coverage). | fixed |  | 2026-08-26T00:27:24.746Z | 2026-08-26T00:27:33.536Z |
| 29 | 17 | deviation | playwright.config.ts |  | npm run test:e2e (bare 'playwright test', no path filter) crashed at discovery with zero tests found -- Playwright's default testMatch also picked up e2e/helpers/*.test.ts (real Vitest unit tests for the helpers, added in Plan 17-03/17-11, never run by any vitest project which all exclude e2e/**), and loading a file importing 'vitest' inside Playwright's runner throws Cannot redefine property Symbol($$jest-matchers-object), aborting the whole run. Every prior wave-3 plan verified with an explicit folder/file path, which bypasses full-tree discovery, so this was never triggered until this plan's own npm run test:e2e verification requirement. Fixed via testIgnore: /\\.test\\.ts$/. | fixed |  | 2026-08-26T00:27:45.702Z | 2026-08-26T00:27:53.675Z |
| 30 | 17 | deviation | src/features/upload-logo |  | upload-logo / RCPD-02's GS v 0 thermal-raster print path has no Playwright e2e coverage -- only a Vitest unit test (pos-printer.test.ts, asserts logoDataUrl/paperWidthChars are passed to the Tauri invoke call). Playwright drives a real browser, not the native Tauri shell + physical printer, so asserting the actual raster bytes end-to-end isn't reachable from e2e/; documented as an accepted gap during Plan 17-17's src/features-to-e2e cross-reference audit rather than silently left unmentioned. | open |  | 2026-08-26T00:28:04.817Z |  |
| 31 | 17 | deviation | src/features/force-pin-change |  | force-pin-change (forced PIN-change-on-first-login flow) has zero e2e coverage found anywhere in the rewritten suite. A pre-existing unit-test ledger entry (#2, PINLoginForm.test.tsx forced_pin_change phase failures) already documents unit-level gaps in this same flow. Documented during Plan 17-17's src/features-to-e2e cross-reference audit as a genuine, not-yet-closed gap -- not fixed in this plan (out of its agent-chat-focused scope), left for a future small e2e addition. | open |  | 2026-08-26T00:28:14.447Z |  |
| 32 | 17 | deviation | e2e/infra/updater.spec.ts |  | app boots without console errors when updater plugin is registered fails intermittently (both attempts in one full-suite run): useCurrentCaja's caja.current.fetch_failed logger.error fires with message 'Record not found.' when this test's beforeEach (no resetTestState/openCaja of its own) happens to run against ambient no-caja-open state left by whichever spec ran immediately before it in serial execution order -- a pre-existing test-isolation gap in this file (relies on ambient state, unlike every other spec that seeds/opens its own caja), not something Plan 17-17 introduced or touched. Passed cleanly in this same session's earlier isolated single-file run. | open |  | 2026-08-26T00:30:30.417Z |  |
| 33 | 17 | deviation | e2e/rbac/rbac.spec.ts |  | T-RP-01..05 (5 tests) failed in the full-suite run asserting zero console errors, all with the identical received array: 7x 'Failed to load resource: 403 (Forbidden)' for @fontsource asset paths. Root-caused to this dispatch's own environment workaround, not app/test code: this worktree shipped without node_modules, so node_modules was symlinked from the sibling checkout at /mnt/ai/POS/supermarket-pos, which sits OUTSIDE this worktree's root -- Vite's server.fs.allow security boundary then blocks @fs/... requests for font files resolved through that out-of-root symlink. Would not reproduce with an in-tree node_modules (npm ci inside the worktree). | open |  | 2026-08-26T00:51:36.433Z |  |
| 34 | 17 | unrun-verify | e2e/reports/report-tabs.spec.ts |  | Product Sales: Margin column has no layout breakage at desktop and narrow viewports failed only in the full 285-test combined run (not seen in any prior isolated-file verification): the fixture-seeded 'otherRow' (a real, confirmed-present order_item, verified via direct DB query) timed out at 20s waiting to render. This local dev Supabase DB has accumulated many days of unpruned E2E order_items across every prior wave-3 dispatch (dozens of rows for the same product observed on direct query) -- most likely a client-side render/aggregation slowdown at this accumulated data volume, not a logic regression. Verbatim-unchanged test. | open |  | 2026-08-26T00:51:46.908Z |  |
| 35 | 17 | deviation | e2e/soak/full-day-soak.spec.ts |  | runs a realistic day from opening to reconciled close failed only in the full-suite run: expiry_date assertion expected 2026-09-07, received 2026-09-06 -- a one-day-off boundary between the test's new Date()-plus-N-days computation and the server-stored expiry date, consistent with a UTC-vs-local-midnight rounding edge case rather than a logic defect. Not reproduced in this plan's own prior isolated verification; verbatim-unchanged test, not touched by this plan. | open |  | 2026-08-26T00:51:54.894Z |  |
| 36 | 18 | deviation | e2e/checkout/barcode-scan-search.spec.ts |  | 9 tests fail pre-existing (confirmed via main branch diff, not introduced by 18-03): Phase 18's already-merged 18-01 CheckoutPanel change made scan populate only the search box (never mutate cart directly) since add-to-cart now flows through the peek window; this spec's tests still assert the pre-Phase-18 direct scan-to-cart UX. Covered instead by e2e/checkout/peek-window.spec.ts. Follow-up plan should retire/rewrite these assertions. | open |  | 2026-08-27T02:44:37.654Z |  |
| 37 | 18 | deviation | e2e/checkout/atomic-rpc-guards.spec.ts | 400 | 2 tests (rejects a forged zero modifier delta, rejects a modifier not linked to the item product) fail pre-existing with 'Margarita not found' -- a bar-pos-era product name absent from Phase 17's Indian-grocery seed catalog. Unrelated to barcode scanning or the peek window; a stale fixture reference. | open |  | 2026-08-27T02:44:45.971Z |  |
| 38 | 19 | unrun-verify | broker/src/delivery.rs |  | must_haves.truths #6 (ambiguous-handoff 'unknown', never auto-resubmitted) is a verbatim port of the spike's real-hardware-validated branch but has no independent automated test in this plan's suite — exercising GetJobW returning None deterministically requires a live Windows printer object with unpredictable RAW-datatype behavior, which this plan's own verification note allows skipping when unavailable. | open |  | 2026-08-27T16:35:25.923Z |  |
| 39 | 20 | deviation | e2e/remote-smoke/remote-backend-smoke.spec.ts |  | Remote checkout (process-direct-sale) fails for every real sale on the live remote backend: payments.tip_amount is NOT NULL but the deployed edge function never sends p_tip_amount (remote DB is one migration behind deployed code, 20260828000001_drop_tip_amount.sql unapplied). Fix requires human-authorized supabase migration repair + db push. | fixed |  | 2026-08-30T19:06:17.354Z | 2026-08-30T19:46:50.627Z |
| 40 | 20 | deviation | supabase/functions/settings-backup/index.ts,supabase/functions/settings-restore/index.ts,supabase/functions/settings-test-email/index.ts,supabase/functions/settings-email-status/index.ts,supabase/functions/send-receipt-email/index.ts |  | 5 of 12 edge functions have zero CORS handling (no Access-Control-Allow-Origin, no OPTIONS handler) -- same bug class fixed in create-staff/index.ts this plan. Every real browser call to these (settings backup/restore/test-email, receipt email) likely fails at CORS preflight. Out of scope for 20-03 (not exercised by its E2E spec) -- not fixed, flagged for a follow-up phase. | fixed |  | 2026-08-30T19:43:36.034Z | 2026-08-30T19:58:39.820Z |
| 41 | 20 | deviation | supabase/functions/create-staff/index.ts |  | create-staff has no CORS handling on the live deployed function (fixed in source this session, commit eb6c8ee) -- every real browser call to the app's Add Staff dialog fails at CORS preflight until 'supabase functions deploy create-staff' is run. Deploy blocked by the auto-mode permission classifier; awaiting human authorization. | fixed |  | 2026-08-30T19:47:17.160Z | 2026-08-30T19:58:31.176Z |
| 42 | 20 | deviation | auth.users (mkvinyekkyennyegfoxq), supabase/migrations/20260830000001_auth_users_token_defaults.sql |  | Vinty Owner (the one real production admin account) could not log in, recover password, or receive a magic link -- GoTrue 500 "Scan error ... converting NULL to string is unsupported" on confirmation_token/email_change. Root cause: the account was seeded via a raw SQL INSERT into auth.users (not GoTrue's Admin API), and 4 of that table's token columns have no schema-level DEFAULT ''. Fixed live via COALESCE backfill (confirmed real login succeeded); root-caused and backfill captured in a migration for all environments. Schema-level DEFAULT '' is NOT achievable -- ALTER TABLE auth.users is blocked platform-wide with "must be owner of table users" even via supabase db push and set role supabase_auth_admin. Prevention is procedural: never raw-INSERT into auth.users again, always use the Admin API (as every seed script in this repo already does). | fixed |  | 2026-08-30T23:26:11.780Z | 2026-08-30T23:28:16.369Z |
| 43 | 23 | lint-warning | src/widgets/HomeDashboard/ui/HomeDashboard.tsx |  | Pre-existing @typescript-eslint/no-floating-promises errors (lines 112,120,200), unrelated to 23-03's diff | open |  | 2026-08-31T20:23:37.796Z |  |
| 44 | 23 | lint-warning | src/widgets/PINLoginForm/PINLoginForm.tsx |  | Pre-existing @typescript-eslint/no-floating-promises errors (lines 66,175), unrelated to 23-03's diff | open |  | 2026-08-31T20:23:40.839Z |  |
| 45 | 27 | deviation | src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx | 150 | gated buttons lock-icon count assertion expects 8, actual 9 since 27-02 added the /promotions nav tile (pre-existing, not fixed by 27-03 per scope boundary) | open |  | 2026-09-02T16:36:31.595Z |  |
| 46 | 27 | unrun-verify | e2e/receipts/category-grouping.spec.ts |  | SC-2b intermittently fails due to shared-catalog fixture pollution (pickTwoCategoryProducts picks any real category with routing NONE); root cause (Plan 27-05 afterEach leak) fixed in 27-07, but the test's own fixture-selection strategy remains fragile against any other spec's throwaway categories | open |  | 2026-09-02T23:45:56.927Z |  |
| 47 | 27 | unrun-verify | e2e/products/categories.spec.ts |  | T8 bartender-locale test expects Spanish 'Idioma' tab but the pinned cashier E2E account is documented elsewhere as pinned to en-US; reproduces in full isolation, predates Phase 27, unrelated to promotions | open |  | 2026-09-02T23:46:01.842Z |  |
| 48 | 27 | unrun-verify | e2e/inventory/near-expiry-alerts.spec.ts |  | admin-saves-threshold-persists-after-reload test reloads immediately after Save with no wait for the write to settle (save/reload race), unrelated to promotions, predates Phase 27 | open |  | 2026-09-02T23:46:02.163Z |  |
| 49 | 26 | deviation | .github/workflows/release.yml |  | When read-manifest's active_customers output is `[]`, sync-customers's job-level `if:` correctly skips the job entirely (no check-run for it, confirmed via GH REST /actions/runs/{id}/jobs on 2 real dispatches — one pre-existing on main before Task 3, one after) — but the overall workflow run's conclusion is still reported "failure" even though every job that actually ran (read-manifest, publish-tauri) succeeded. Reproduced on 2 real runs (33684977414 pre-Task-3 on main, 33708080677 post-Task-3 on this branch), both with the identical signature, so this is a pre-existing GitHub Actions platform quirk with matrix jobs gated to zero elements, not something Task 3 introduced. Not fixed (out of Task 3's scope per SCOPE BOUNDARY — pre-existing); operators dispatching a release with all customers suspended should expect a red X on the run despite nothing being broken. | open |  | 2026-09-03T02:35:00.000Z |  |
| 50 | 26 | deviation | .github/workflows/release.yml |  | Real workflow_dispatch run 33771536782 (sync-customers, taj-house-of-spices): git push --mirror pushed a STALE local main ref (7a0b8c7, an ancestor of but far behind core's real main 4239f0b) to zedfauji/supermarket-pos-taj's main branch. Root cause: the self-hosted runner's persistent workspace (C:\\actions-runner\\_work\\supermarket-pos\\supermarket-pos) never refreshes refs/heads/main because actions/checkout only updates the ref it explicitly checks out (github.ref for this workflow_dispatch was the dispatched branch, not main) -- refs/remotes/origin/main in that same workspace was correctly fresh (4239f0b) but git push --mirror mirrors local refs/heads/*, not refs/remotes/*. The dispatched branch itself mirrored byte-identical (worktree-agent-aa7fe12c0c8086762: cebbd1d on both core and the taj mirror, confirmed via gh api .../git/refs/heads/...), and the installer built in this same job used the correct checked-out content (Check 4's baked remote-ref match confirmed via a real run of the now-6-check verify-installer-integrity.ps1). Only the customer repo's main-branch POINTER is stale, not the build artifact. Not fixed: the correct fix (an explicit git fetch origin main:main --force or equivalent before the mirror-push) requires modifying release.yml's sync-customers job, which Plan 26-04's own D-17 zero-diff gate on release.yml explicitly forbids touching this task. | open |  | 2026-09-03T15:35:00.000Z |  |
| 51 | 26 | deviation | .github/workflows/release.yml | 162 | sync-customers job's tauri-action GitHub-release step publishes to CORE's own repo (zedfauji/supermarket-pos), not the matrix customer's mirror repo -- reproduced 3x in real workflow_dispatch runs (33774546478, 33775917967, 33777389640): after each run, gh api repos/zedfauji/supermarket-pos-taj/releases returned []. Root cause: tauri-action resolves the target repo from GITHUB_TOKEN/GITHUB_REPOSITORY (always core's repo context for any job in this workflow run), not from matrix.customer.repo -- git push --mirror correctly reaches the customer repo's git history, but the actual GitHub Release + installer/latest.json assets never do. Consequence found live: when publish-tauri and sync-customers both target the same tag on core's shared release object, whichever job's upload runs second silently overwrites the first's assets. Fix requires editing release.yml (out of 26-05's file scope). Not fixed in 26-05; worked around for the D-17 hop-2 proof via a manual gh release create --repo zedfauji/supermarket-pos-taj using the real, signature-verified artifact (see 26-05-SUMMARY.md). Blocks a truly-automatic new-path release for any future customer until fixed. | fixed |  | 2026-09-03T16:30:00.000Z | 2026-09-03T21:10:44.503Z |
| 52 | 26 | deviation | customers/customers.json | 1 | zedfauji/supermarket-pos-taj (created gh repo create --private in Plan 26-04) is a PRIVATE repo, but Tauri's updater plugin makes a plain unauthenticated HTTP GET to plugins.updater.endpoints (no auth header configured anywhere in tauri.conf.json/tauri.override.json). Reproduced live: curl -sL https://github.com/zedfauji/supermarket-pos-taj/releases/latest/download/latest.json returned 404 both with and without a valid PAT bearer Authorization header (GitHub's /releases/latest/download/ redirect shortcut does not accept token auth the way api.github.com does for private repos) -- only gh CLI's own authenticated API calls could reach the asset. This meant a real installed Taj till, once migrated to Taj's own endpoint, could not actually complete an automatic update check against a private mirror repo. Fixed by the orchestrator at the Plan 26-06 pre-flight checkpoint: `gh repo edit zedfauji/supermarket-pos-taj --visibility public --accept-visibility-change-consequences` -- re-verified live, curl now returns 200. Accepted per 26-04's own T-26-10 threat disposition (medium/non-blocking exposure of identity strings, not credentials). | fixed |  | 2026-09-03T16:30:00.000Z | 2026-09-03T16:40:00.000Z |
| 53 | 26 | deviation | scripts/onboard-customer.ps1 |  | scripts/onboard-customer.ps1 (Plan 26-03) hardcodes `gh repo create $fullRepo --private` for every new customer repo. Ledger #52 found that a private customer mirror 404s against Tauri's unauthenticated updater GET; #52 was fixed one-off for zedfauji/supermarket-pos-taj by flipping it public, but onboard-customer.ps1 itself was not changed -- customer #2 onward, onboarded via this script exactly as documented in docs/onboarding-new-customer.md, will reproduce the identical 404 unless the script defaults to --public or an authenticated-fetch updater mechanism is added first. Not fixed: discovered after Plan 26-03 already shipped; fixing requires either changing onboard-customer.ps1's default (and re-confirming with the operator that customer identity/branding in a public repo is acceptable, per the T-26-10 disposition already accepted for Taj) or a separate updater-auth mechanism. | open |  | 2026-09-03T16:40:00.000Z |  |
| 54 | 26 | deviation | .github/workflows/release.yml | 162 | After fixing WINDOWS.md #51's repo-routing bug (GITHUB_REPOSITORY now correctly shadowed to matrix.customer.repo), a real workflow_dispatch run (33805295067, worktree-agent-a5fe98c9788387d07, v1.2.4) confirms tauri-action's release step now correctly targets zedfauji/supermarket-pos-taj (log: Looking for a draft release with tag v1.2.4... against the taj repo, not core) -- but the release creation call itself then fails: 403 Resource not accessible by personal access token on POST /repos/zedfauji/supermarket-pos-taj/releases. CUSTOMER_MIRROR_PAT has enough scope for git push --mirror (an earlier step in the same job succeeds) but not for the Releases REST API on the same public, user-owned (non-org, so not an SSO issue) repo. Root cause is the PAT's own granted scope/permission set (a stored GitHub secret this agent cannot inspect or regenerate), not release.yml's code. Not fixed: requires a human to regenerate CUSTOMER_MIRROR_PAT with Contents: Read and write (fine-grained) or full repo scope (classic) and confirm it covers Releases, then re-dispatch to confirm. Until resolved, sync-customers still cannot complete a fully-automatic release with zero manual gh release create workaround. | open |  | 2026-09-03T21:10:54.633Z |  |
| 55 | 26 | deviation | .github/workflows/release.yml | 162 | CUSTOMER_MIRROR_PAT rotated to a classic PAT with repo scope (fixing #54's 403). Real workflow_dispatch (33823523719, worktree-agent-a02e68602df65c889, v1.2.5): the 403 is gone -- but sync-customers's tauri-action release step now silently uploads/overwrites assets on CORE's own v1.2.5 draft release (id 382413906, asset updated_at timestamps exactly match this job's upload timestamps) instead of creating anything on zedfauji/supermarket-pos-taj. Confirmed via API: taj repo's release list still only has v1.2.3, zero v1.2.5 release exists there in any state (draft or published). GITHUB_REPOSITORY is correctly logged as zedfauji/supermarket-pos-taj in the step's env dump, so the shadow env var IS being set, but tauri-action's internal find-or-create-draft-release call is not honoring it for this PAT/scope combination -- root cause not yet isolated (untested whether classic PAT vs @actions/github's own context resolution is the culprit). Not fixed: requires debugging tauri-action's actual octokit target repo resolution (e.g. explicit owner/repo action inputs if v0.6.2 supports them, or an alternate release-creation step) before sync-customers can land a real release on the customer mirror. Fixed: stopped relying on tauri-action's own release call entirely -- added an explicit `gh release create`/`upload --clobber` step (GH_TOKEN=CUSTOMER_MIRROR_PAT) that locates the just-built nsis/msi artifacts on disk, builds latest.json matching a real prior release's schema, and publishes directly to matrix.customer.repo. Real workflow_dispatch verification (33824675553, v1.2.6, worktree-agent-a4fb1499065df1463): `gh release view v1.2.6 --repo zedfauji/supermarket-pos-taj` confirms tag v1.2.6 with all 5 expected assets (installer, .sig, msi, .sig, latest.json); latest.json's platform url fields all point at zedfauji/supermarket-pos-taj/releases/download/v1.2.6/...; signtool.exe verify //pa //v on the downloaded installer confirms the real Authenticode chain (SHA1 86F3E828B1815AC72AA339B3046B3FE6B690AF62, self-signed root reported untrusted -- expected, matches this repo's own verify-installer-integrity.ps1 pattern); core's own v1.2.6 release (published by the untouched publish-tauri job) is unaffected, still draft=true with its own 5 assets. | fixed |  | 2026-09-04T01:03:00.927Z | 2026-09-04T01:20:44.000Z |
| 56 | 27 | unrun-verify | e2e/payments/apply-promotion-and-custom-discount.spec.ts |  | Tests (b)/(c) edited correctly per Plan 27-08 Task 3 (cashier login + distinct manager PIN) but not executable in this sandboxed worktree — shared port-1520 dev server bound to main checkout's stale/crashed esbuild instance | open |  | 2026-09-04T04:48:35.281Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "e2e/02-caja.spec.ts",
    "line": null,
    "description": "Manager closes caja test flakes (timeout waiting for success toast) - likely test-ordering issue with preceding open-tabs test; close_caja_session RPC verified functional via direct SQL call",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-10T22:16:08.228Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "01",
    "file": "src/widgets/PINLoginForm/PINLoginForm.test.tsx",
    "line": null,
    "description": "5 pre-existing unit test failures (forced_pin_change phase + clock-in-fails), fully mocked Supabase client, UI copy/locale text-matching mismatches unrelated to backend",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-10T22:16:08.278Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "e2e/18-modifier-notes-kds.spec.ts",
    "line": null,
    "description": "T1/T2 could not be verified end-to-end after this plan's T3 trim — local supabase-edge-functions container's get-server-time function fails to boot (pre-existing Docker infra fault, not caused by this plan), test fails at the New Tab click step before reaching modifier-sheet interaction",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-11T04:26:22.709Z",
    "resolved_at": "2026-08-25T19:47:00.175Z"
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "e2e/51-barcode-scan-search.spec.ts",
    "line": null,
    "description": "Live barcode/category Playwright run times out in shared beforeEach before plan assertions execute.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T17:40:44.514Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "lint-warning",
    "phase": "02",
    "file": "src/features/checkout-sale/model/useCheckoutSale.ts",
    "line": null,
    "description": "Full lint remains blocked by 12 pre-existing Plan 02-01 errors outside 02-02 scope.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T17:40:44.564Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "e2e/52-loose-weight-hold-sale.spec.ts",
    "line": null,
    "description": "Loose-weight and held-sale Playwright coverage could not reach assertions because local Supabase global setup stalled.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T18:15:28.583Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "src/entities/tab/model/cartStore.test.ts",
    "line": null,
    "description": "Weighted cart unit tests could not reach assertions because Vitest global setup stalled on local Supabase.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T18:15:28.633Z",
    "resolved_at": null
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "e2e/52-loose-weight-hold-sale.spec.ts",
    "line": null,
    "description": "Combined Phase-02 Playwright run lost Vite during later e2e/52 UI cases; focused new cart-swap E2E passes.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-12T20:23:19.816Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "e2e/10-inventory.spec.ts",
    "line": null,
    "description": "Plan-level inventory regression run stopped at the pre-existing manual-adjustment test after local Realtime returned HTTP 503.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-14T19:40:03.667Z",
    "resolved_at": null
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "e2e/54-near-expiry-alerts.spec.ts",
    "line": null,
    "description": "Targeted Playwright test is blocked by existing full-page-reload session restoration failure after reaching the near-expiry settings UI.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-14T19:53:06.239Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "package.json",
    "line": null,
    "description": "Repository-wide npm run lint hangs after the existing boundaries-plugin warning; focused lint for all plan-owned files passed.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-15T05:56:02.772Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "deviation",
    "phase": "05",
    "file": "e2e/09-rbac.spec.ts",
    "line": null,
    "description": "T-RP-05 (process_refund blocked for bartender) fails pre-existing: clicking Refund now opens the RefundSheet reason/approval dialog instead of an immediate RPC call, so the test's expected forbidden-toast text never appears. Unrelated to void-order deletion (process-refund feature last touched Phase 1, commit a3d5fe1).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T06:59:39.608Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "deviation",
    "phase": "05",
    "file": "e2e/07-reports.spec.ts",
    "line": 935,
    "description": "Phase 24 'bartender-initiated reason-required removal' test fails pre-existing: seedRemovableItem helper queries table 'public.pool_tables', dropped in Phase 1's strip-and-rebrand. Unrelated to void-order deletion.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T06:59:46.237Z",
    "resolved_at": null
  },
  {
    "id": 14,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "package.json",
    "line": null,
    "description": "Full npm run test:e2e (44 specs, single worker, ~1h) hit 40 failures spread across unrelated files (staff-mgmt, caja-entries, payment-edge-cases, categories, audit-logs, i18n, edit-paid-tab, reopen-ticket, direct-sale-checkout, barcode-scan, loose-weight, full-day-soak) with no thematic link to void-order/RBAC/edge-function changes -- consistent with this env's documented long-run E2E flakiness (see ledger #1,3,4,6-11). Individually: e2e/09-rbac.spec.ts, e2e/07-reports.spec.ts, e2e/02-caja.spec.ts, e2e/35-refund.spec.ts (the phase's SC1/SC4/SC5 gates) all pass except the two pre-existing unrelated failures logged separately.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-17T06:59:53.165Z",
    "resolved_at": null
  },
  {
    "id": 15,
    "kind": "deviation",
    "phase": "08",
    "file": "e2e/helpers/supabase.ts",
    "line": null,
    "description": "seedNewStaffMember sets Auth password to Test<PIN>! but SM3/loginAsNamed sign in with the raw PIN — pre-existing mismatch, unrelated to 08-06's scope, confirmed independently reproducible",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-18T15:17:00.838Z",
    "resolved_at": "2026-08-25T20:23:37.034Z"
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "10",
    "file": "e2e/38-audit-logs.spec.ts",
    "line": null,
    "description": "Diff viewer > should open diff sheet on row click is a pre-existing flake, unrelated to plan 10-07 (unscoped 'first diff button on page' row selector); logged in deferred-items.md, not fixed",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-19T02:20:17.581Z",
    "resolved_at": null
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "17",
    "file": ".planning/REQUIREMENTS.md",
    "line": null,
    "description": "Plan requirements TEST-02, TEST-03, and TEST-04 are absent from the current requirements register.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-25T05:36:06.412Z",
    "resolved_at": "2026-08-26T00:52:52.820Z"
  },
  {
    "id": 18,
    "kind": "deviation",
    "phase": "17",
    "file": "e2e/products/categories.spec.ts",
    "line": null,
    "description": "Full-file run shows T1/T2/T3/T4/T5/T8 failing on Spanish (es-MX) UI text — the shared local Supabase's pinned E2E accounts are flipped to en-US, but a concurrently-running sibling worktree's locale-switch test appears to leave the shared DB mid-flight in es-MX before resetTestState's per-account reset catches up. T1 verified passing in isolation (13.5s, no failures) — this is shared-DB cross-worktree flakiness (see ledger #1,3,4,6-11,14), not a defect in the verbatim-moved file.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T19:47:10.467Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "deviation",
    "phase": "17",
    "file": "e2e/products/product-management.spec.ts",
    "line": 392,
    "description": "PM8 (cashier navigating to /inventory — button absent or PIN gate shown) fails pre-existing: /inventory now renders fully for a cashier (no redirect to /home, no 'manager access required' text) — RBAC gating for this route/page appears to have changed since the test was written. Test logic unchanged from the pre-move file (only docstring wording updated for the bartender->cashier rename); unrelated to this plan's PM4/PM7 rewrite.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-25T19:47:19.271Z",
    "resolved_at": "2026-08-26T03:00:00.419Z"
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "17",
    "file": "e2e/inventory/open-units.spec.ts",
    "line": null,
    "description": "Confirmed features/override-negative-stock (D-05 negative-stock manager-PIN override) has zero callers anywhere in the app -- orphaned dead code from the pre-rebuild tab-based ordering UI. Direct-sale checkout's process_direct_sale_atomic has no equivalent override path. Not fixed (out of E2E-rewrite scope), flagged for a future phase to decide whether checkout needs its own negative-stock override.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T20:07:05.208Z",
    "resolved_at": null
  },
  {
    "id": 21,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "e2e/inventory/loose-weight-hold-sale.spec.ts",
    "line": null,
    "description": "3 of 6 tests and open-units.spec.ts's single monolithic test intermittently fail under this session's heavy concurrent-worktree load (many wave-3 executors sharing one local Supabase instance + one dev server) -- confirmed via distinct error signatures (CAJA_CLOSED RPC rejection, caja_sessions_one_open duplicate-key violation, Realtime WebSocket 500/503, products.sold_by_weight flipped mid-test) that another agent's own resetTestState/openCaja call raced this spec's DB state, not a logic defect in the rewrite. Isolated single-file reruns during lower-contention windows passed cleanly; typecheck and lint are clean. Two genuine bugs found and fixed during this same investigation: a strict-mode getByText(PRODUCT) locator collision, and fixture base_price too high for the 100-tendered UI flow.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T20:07:40.724Z",
    "resolved_at": null
  },
  {
    "id": 22,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "e2e/receipts/category-grouping.spec.ts",
    "line": null,
    "description": "SC-2b logic verified correct via direct DB inspection (seeded tab shift_id exactly matched the logged-in manager's session) but a clean full run was not captured this session: the parallel wave-execution setup runs many worktree agents against one shared, non-namespaced local Supabase DB (live polling showed continuous external tab/shift mutation) and a shared :1520 dev server (5 concurrent npm run dev processes, intermittent ERR_CONNECTION_REFUSED across unrelated sibling specs too). Retry hardening added; not a defect in this plan's code.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-25T20:12:00.000Z",
    "resolved_at": "2026-08-26T00:27:14.016Z"
  },
  {
    "id": 23,
    "kind": "unmet-truth",
    "phase": "17",
    "file": "supermarket-pos/e2e/rbac/staff-management.spec.ts",
    "line": null,
    "description": "SM6 asserts view_all_shifts RBAC enforcement (bartender sees only own shifts) but StaffDashboard renders the full roster to every role -- pre-existing, already-documented gap (D-03, prior phase), not introduced by 17-11, not fixed per SCOPE BOUNDARY.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-25T20:22:52.106Z",
    "resolved_at": "2026-08-26T03:00:00.482Z"
  },
  {
    "id": 24,
    "kind": "deviation",
    "phase": "17",
    "file": "src/shared/lib/edge-function-contracts.ts",
    "line": null,
    "description": "DIRECT_SALE_FAILED (out-of-stock plain-product sale) leaks a raw Postgres constraint message to the checkout UI via mapProcessPaymentEdgeError's default case — no genericError-style translated fallback exists for this path (see 17-14 deferred-items.md)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T20:44:10.337Z",
    "resolved_at": null
  },
  {
    "id": 25,
    "kind": "lint-warning",
    "phase": "17",
    "file": "e2e/infra/offline.spec.ts,e2e/soak/full-day-soak.spec.ts",
    "line": null,
    "description": "npm run lint fails with ~80 pre-existing @typescript-eslint errors (no-unsafe-assignment, no-unnecessary-condition on RPC-result destructuring) inherited unchanged from the original 55-full-day-soak.spec.ts and the still-flat 48-reopen-closed-ticket.spec.ts's shared seed-helper pattern; confirmed pre-existing via git show of the pre-move file, not introduced by 17-15's move",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T20:59:55.845Z",
    "resolved_at": null
  },
  {
    "id": 26,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "e2e/inventory/inventory-intelligence.spec.ts",
    "line": 131,
    "description": "T5 (physical count submit adjusts stock and writes stock_movements) intermittently fails with a quantity_delta far outside the seeded expectation (e.g. -30 instead of -5) -- reproduced twice, self-heals on retry every time. Verbatim-unchanged logic (17-07 only swapped the Indian-catalog fixture); root cause is the shared, non-namespaced local Supabase instance under concurrent worktree/session load racing setInventoryQty's write against the physical-count RPC's read of \"before\" quantity -- same class as ledger #21/#22, not a defect in the test or the physical-count RPC.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-25T22:54:48.537Z",
    "resolved_at": null
  },
  {
    "id": 27,
    "kind": "unmet-truth",
    "phase": "17",
    "file": "e2e/reports/report-tabs.spec.ts",
    "line": 1611,
    "description": "\"Turnover row shows units sold and a non-null turnover ratio\" reproduced twice with a consistent, non-random -3-unit gap between the test's own service-role recompute (24, then 28) and the UI's rendered units-sold cell (21, then 25) for the same product/date-range -- at the same instant a follow-up service-role query confirms the higher (true) total persists with no further external writes. Both the test's manual query and the UI's useProductSalesReport share byte-identical filter logic (neq status voided, tabs.created_at range), ruling out a selector/timing race -- the gap is real and reproducible, not flaky noise, but isolating the exact mechanism (RLS visibility scoping for the 'admin' authenticated role vs the service-role client bypassing RLS entirely, or a date-range boundary fixed at component-mount-time) needs a deeper report-correctness investigation than this post-merge regression pass covers. Verbatim-unchanged test (byte-identical to the pre-wave-3 e2e/07-reports.spec.ts), so not introduced by 17-09's move.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-25T22:54:48.537Z",
    "resolved_at": "2026-08-26T03:00:00.542Z"
  },
  {
    "id": 28,
    "kind": "deviation",
    "phase": "17",
    "file": "src/entities/tab/model/queries-reports.ts",
    "line": null,
    "description": "useRefundsRegister selected profiles!created_by(full_name) but profiles has no full_name column (real column is name) -- every RefundsRegister query has failed with Postgres 42703 since Phase 8, silently caught into an empty-result Ok() and rendered as the widget's own no-refunds empty state. Found and fixed while closing a genuine e2e-coverage gap (report-tabs.spec.ts's refunds-reg tab had zero prior coverage).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T00:27:24.746Z",
    "resolved_at": "2026-08-26T00:27:33.536Z"
  },
  {
    "id": 29,
    "kind": "deviation",
    "phase": "17",
    "file": "playwright.config.ts",
    "line": null,
    "description": "npm run test:e2e (bare 'playwright test', no path filter) crashed at discovery with zero tests found -- Playwright's default testMatch also picked up e2e/helpers/*.test.ts (real Vitest unit tests for the helpers, added in Plan 17-03/17-11, never run by any vitest project which all exclude e2e/**), and loading a file importing 'vitest' inside Playwright's runner throws Cannot redefine property Symbol($$jest-matchers-object), aborting the whole run. Every prior wave-3 plan verified with an explicit folder/file path, which bypasses full-tree discovery, so this was never triggered until this plan's own npm run test:e2e verification requirement. Fixed via testIgnore: /\\.test\\.ts$/.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-26T00:27:45.702Z",
    "resolved_at": "2026-08-26T00:27:53.675Z"
  },
  {
    "id": 30,
    "kind": "deviation",
    "phase": "17",
    "file": "src/features/upload-logo",
    "line": null,
    "description": "upload-logo / RCPD-02's GS v 0 thermal-raster print path has no Playwright e2e coverage -- only a Vitest unit test (pos-printer.test.ts, asserts logoDataUrl/paperWidthChars are passed to the Tauri invoke call). Playwright drives a real browser, not the native Tauri shell + physical printer, so asserting the actual raster bytes end-to-end isn't reachable from e2e/; documented as an accepted gap during Plan 17-17's src/features-to-e2e cross-reference audit rather than silently left unmentioned.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T00:28:04.817Z",
    "resolved_at": null
  },
  {
    "id": 31,
    "kind": "deviation",
    "phase": "17",
    "file": "src/features/force-pin-change",
    "line": null,
    "description": "force-pin-change (forced PIN-change-on-first-login flow) has zero e2e coverage found anywhere in the rewritten suite. A pre-existing unit-test ledger entry (#2, PINLoginForm.test.tsx forced_pin_change phase failures) already documents unit-level gaps in this same flow. Documented during Plan 17-17's src/features-to-e2e cross-reference audit as a genuine, not-yet-closed gap -- not fixed in this plan (out of its agent-chat-focused scope), left for a future small e2e addition.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T00:28:14.447Z",
    "resolved_at": null
  },
  {
    "id": 32,
    "kind": "deviation",
    "phase": "17",
    "file": "e2e/infra/updater.spec.ts",
    "line": null,
    "description": "app boots without console errors when updater plugin is registered fails intermittently (both attempts in one full-suite run): useCurrentCaja's caja.current.fetch_failed logger.error fires with message 'Record not found.' when this test's beforeEach (no resetTestState/openCaja of its own) happens to run against ambient no-caja-open state left by whichever spec ran immediately before it in serial execution order -- a pre-existing test-isolation gap in this file (relies on ambient state, unlike every other spec that seeds/opens its own caja), not something Plan 17-17 introduced or touched. Passed cleanly in this same session's earlier isolated single-file run.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T00:30:30.417Z",
    "resolved_at": null
  },
  {
    "id": 33,
    "kind": "deviation",
    "phase": "17",
    "file": "e2e/rbac/rbac.spec.ts",
    "line": null,
    "description": "T-RP-01..05 (5 tests) failed in the full-suite run asserting zero console errors, all with the identical received array: 7x 'Failed to load resource: 403 (Forbidden)' for @fontsource asset paths. Root-caused to this dispatch's own environment workaround, not app/test code: this worktree shipped without node_modules, so node_modules was symlinked from the sibling checkout at /mnt/ai/POS/supermarket-pos, which sits OUTSIDE this worktree's root -- Vite's server.fs.allow security boundary then blocks @fs/... requests for font files resolved through that out-of-root symlink. Would not reproduce with an in-tree node_modules (npm ci inside the worktree).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T00:51:36.433Z",
    "resolved_at": null
  },
  {
    "id": 34,
    "kind": "unrun-verify",
    "phase": "17",
    "file": "e2e/reports/report-tabs.spec.ts",
    "line": null,
    "description": "Product Sales: Margin column has no layout breakage at desktop and narrow viewports failed only in the full 285-test combined run (not seen in any prior isolated-file verification): the fixture-seeded 'otherRow' (a real, confirmed-present order_item, verified via direct DB query) timed out at 20s waiting to render. This local dev Supabase DB has accumulated many days of unpruned E2E order_items across every prior wave-3 dispatch (dozens of rows for the same product observed on direct query) -- most likely a client-side render/aggregation slowdown at this accumulated data volume, not a logic regression. Verbatim-unchanged test.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T00:51:46.908Z",
    "resolved_at": null
  },
  {
    "id": 35,
    "kind": "deviation",
    "phase": "17",
    "file": "e2e/soak/full-day-soak.spec.ts",
    "line": null,
    "description": "runs a realistic day from opening to reconciled close failed only in the full-suite run: expiry_date assertion expected 2026-09-07, received 2026-09-06 -- a one-day-off boundary between the test's new Date()-plus-N-days computation and the server-stored expiry date, consistent with a UTC-vs-local-midnight rounding edge case rather than a logic defect. Not reproduced in this plan's own prior isolated verification; verbatim-unchanged test, not touched by this plan.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-26T00:51:54.894Z",
    "resolved_at": null
  },
  {
    "id": 36,
    "kind": "deviation",
    "phase": "18",
    "file": "e2e/checkout/barcode-scan-search.spec.ts",
    "line": null,
    "description": "9 tests fail pre-existing (confirmed via main branch diff, not introduced by 18-03): Phase 18's already-merged 18-01 CheckoutPanel change made scan populate only the search box (never mutate cart directly) since add-to-cart now flows through the peek window; this spec's tests still assert the pre-Phase-18 direct scan-to-cart UX. Covered instead by e2e/checkout/peek-window.spec.ts. Follow-up plan should retire/rewrite these assertions.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T02:44:37.654Z",
    "resolved_at": null
  },
  {
    "id": 37,
    "kind": "deviation",
    "phase": "18",
    "file": "e2e/checkout/atomic-rpc-guards.spec.ts",
    "line": 400,
    "description": "2 tests (rejects a forged zero modifier delta, rejects a modifier not linked to the item product) fail pre-existing with 'Margarita not found' -- a bar-pos-era product name absent from Phase 17's Indian-grocery seed catalog. Unrelated to barcode scanning or the peek window; a stale fixture reference.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T02:44:45.971Z",
    "resolved_at": null
  },
  {
    "id": 38,
    "kind": "unrun-verify",
    "phase": "19",
    "file": "broker/src/delivery.rs",
    "line": null,
    "description": "must_haves.truths #6 (ambiguous-handoff 'unknown', never auto-resubmitted) is a verbatim port of the spike's real-hardware-validated branch but has no independent automated test in this plan's suite — exercising GetJobW returning None deterministically requires a live Windows printer object with unpredictable RAW-datatype behavior, which this plan's own verification note allows skipping when unavailable.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T16:35:25.923Z",
    "resolved_at": null
  },
  {
    "id": 39,
    "kind": "deviation",
    "phase": "20",
    "file": "e2e/remote-smoke/remote-backend-smoke.spec.ts",
    "line": null,
    "description": "Remote checkout (process-direct-sale) fails for every real sale on the live remote backend: payments.tip_amount is NOT NULL but the deployed edge function never sends p_tip_amount (remote DB is one migration behind deployed code, 20260828000001_drop_tip_amount.sql unapplied). Fix requires human-authorized supabase migration repair + db push.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T19:06:17.354Z",
    "resolved_at": "2026-08-30T19:46:50.627Z"
  },
  {
    "id": 40,
    "kind": "deviation",
    "phase": "20",
    "file": "supabase/functions/settings-backup/index.ts,supabase/functions/settings-restore/index.ts,supabase/functions/settings-test-email/index.ts,supabase/functions/settings-email-status/index.ts,supabase/functions/send-receipt-email/index.ts",
    "line": null,
    "description": "5 of 12 edge functions have zero CORS handling (no Access-Control-Allow-Origin, no OPTIONS handler) -- same bug class fixed in create-staff/index.ts this plan. Every real browser call to these (settings backup/restore/test-email, receipt email) likely fails at CORS preflight. Out of scope for 20-03 (not exercised by its E2E spec) -- not fixed, flagged for a follow-up phase.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T19:43:36.034Z",
    "resolved_at": "2026-08-30T19:58:39.820Z"
  },
  {
    "id": 41,
    "kind": "deviation",
    "phase": "20",
    "file": "supabase/functions/create-staff/index.ts",
    "line": null,
    "description": "create-staff has no CORS handling on the live deployed function (fixed in source this session, commit eb6c8ee) -- every real browser call to the app's Add Staff dialog fails at CORS preflight until 'supabase functions deploy create-staff' is run. Deploy blocked by the auto-mode permission classifier; awaiting human authorization.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T19:47:17.160Z",
    "resolved_at": "2026-08-30T19:58:31.176Z"
  },
  {
    "id": 42,
    "kind": "deviation",
    "phase": "20",
    "file": "auth.users (mkvinyekkyennyegfoxq), supabase/migrations/20260830000001_auth_users_token_defaults.sql",
    "line": null,
    "description": "Vinty Owner (the one real production admin account) could not log in, recover password, or receive a magic link -- GoTrue 500 \"Scan error ... converting NULL to string is unsupported\" on confirmation_token/email_change. Root cause: the account was seeded via a raw SQL INSERT into auth.users (not GoTrue's Admin API), and 4 of that table's token columns have no schema-level DEFAULT ''. Fixed live via COALESCE backfill (confirmed real login succeeded); root-caused and backfill captured in a migration for all environments. Schema-level DEFAULT '' is NOT achievable -- ALTER TABLE auth.users is blocked platform-wide with \"must be owner of table users\" even via supabase db push and set role supabase_auth_admin. Prevention is procedural: never raw-INSERT into auth.users again, always use the Admin API (as every seed script in this repo already does).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-30T23:26:11.780Z",
    "resolved_at": "2026-08-30T23:28:16.369Z"
  },
  {
    "id": 43,
    "kind": "lint-warning",
    "phase": "23",
    "file": "src/widgets/HomeDashboard/ui/HomeDashboard.tsx",
    "line": null,
    "description": "Pre-existing @typescript-eslint/no-floating-promises errors (lines 112,120,200), unrelated to 23-03's diff",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-31T20:23:37.796Z",
    "resolved_at": null
  },
  {
    "id": 44,
    "kind": "lint-warning",
    "phase": "23",
    "file": "src/widgets/PINLoginForm/PINLoginForm.tsx",
    "line": null,
    "description": "Pre-existing @typescript-eslint/no-floating-promises errors (lines 66,175), unrelated to 23-03's diff",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-31T20:23:40.839Z",
    "resolved_at": null
  },
  {
    "id": 45,
    "kind": "deviation",
    "phase": "27",
    "file": "src/widgets/HomeDashboard/ui/HomeDashboard.test.tsx",
    "line": 150,
    "description": "gated buttons lock-icon count assertion expects 8, actual 9 since 27-02 added the /promotions nav tile (pre-existing, not fixed by 27-03 per scope boundary)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-02T16:36:31.595Z",
    "resolved_at": null
  },
  {
    "id": 46,
    "kind": "unrun-verify",
    "phase": "27",
    "file": "e2e/receipts/category-grouping.spec.ts",
    "line": null,
    "description": "SC-2b intermittently fails due to shared-catalog fixture pollution (pickTwoCategoryProducts picks any real category with routing NONE); root cause (Plan 27-05 afterEach leak) fixed in 27-07, but the test's own fixture-selection strategy remains fragile against any other spec's throwaway categories",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-02T23:45:56.927Z",
    "resolved_at": null
  },
  {
    "id": 47,
    "kind": "unrun-verify",
    "phase": "27",
    "file": "e2e/products/categories.spec.ts",
    "line": null,
    "description": "T8 bartender-locale test expects Spanish 'Idioma' tab but the pinned cashier E2E account is documented elsewhere as pinned to en-US; reproduces in full isolation, predates Phase 27, unrelated to promotions",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-02T23:46:01.842Z",
    "resolved_at": null
  },
  {
    "id": 48,
    "kind": "unrun-verify",
    "phase": "27",
    "file": "e2e/inventory/near-expiry-alerts.spec.ts",
    "line": null,
    "description": "admin-saves-threshold-persists-after-reload test reloads immediately after Save with no wait for the write to settle (save/reload race), unrelated to promotions, predates Phase 27",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-02T23:46:02.163Z",
    "resolved_at": null
  },
  {
    "id": 49,
    "kind": "deviation",
    "phase": "26",
    "file": ".github/workflows/release.yml",
    "line": null,
    "description": "When read-manifest's active_customers output is `[]`, sync-customers's job-level `if:` correctly skips the job entirely (no check-run for it, confirmed via GH REST /actions/runs/{id}/jobs on 2 real dispatches — one pre-existing on main before Task 3, one after) — but the overall workflow run's conclusion is still reported \"failure\" even though every job that actually ran (read-manifest, publish-tauri) succeeded. Reproduced on 2 real runs (33684977414 pre-Task-3 on main, 33708080677 post-Task-3 on this branch), both with the identical signature, so this is a pre-existing GitHub Actions platform quirk with matrix jobs gated to zero elements, not something Task 3 introduced. Not fixed (out of Task 3's scope per SCOPE BOUNDARY — pre-existing); operators dispatching a release with all customers suspended should expect a red X on the run despite nothing being broken.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-03T02:35:00.000Z",
    "resolved_at": null
  },
  {
    "id": 50,
    "kind": "deviation",
    "phase": "26",
    "file": ".github/workflows/release.yml",
    "line": null,
    "description": "Real workflow_dispatch run 33771536782 (sync-customers, taj-house-of-spices): git push --mirror pushed a STALE local main ref (7a0b8c7, an ancestor of but far behind core's real main 4239f0b) to zedfauji/supermarket-pos-taj's main branch. Root cause: the self-hosted runner's persistent workspace (C:\\actions-runner\\_work\\supermarket-pos\\supermarket-pos) never refreshes refs/heads/main because actions/checkout only updates the ref it explicitly checks out (github.ref for this workflow_dispatch was the dispatched branch, not main) -- refs/remotes/origin/main in that same workspace was correctly fresh (4239f0b) but git push --mirror mirrors local refs/heads/*, not refs/remotes/*. The dispatched branch itself mirrored byte-identical (worktree-agent-aa7fe12c0c8086762: cebbd1d on both core and the taj mirror, confirmed via gh api .../git/refs/heads/...), and the installer built in this same job used the correct checked-out content (Check 4's baked remote-ref match confirmed via a real run of the now-6-check verify-installer-integrity.ps1). Only the customer repo's main-branch POINTER is stale, not the build artifact. Not fixed: the correct fix (an explicit git fetch origin main:main --force or equivalent before the mirror-push) requires modifying release.yml's sync-customers job, which Plan 26-04's own D-17 zero-diff gate on release.yml explicitly forbids touching this task.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-03T15:35:00.000Z",
    "resolved_at": null
  },
  {
    "id": 51,
    "kind": "deviation",
    "phase": "26",
    "file": ".github/workflows/release.yml",
    "line": 162,
    "description": "sync-customers job's tauri-action GitHub-release step publishes to CORE's own repo (zedfauji/supermarket-pos), not the matrix customer's mirror repo -- reproduced 3x in real workflow_dispatch runs (33774546478, 33775917967, 33777389640): after each run, gh api repos/zedfauji/supermarket-pos-taj/releases returned []. Root cause: tauri-action resolves the target repo from GITHUB_TOKEN/GITHUB_REPOSITORY (always core's repo context for any job in this workflow run), not from matrix.customer.repo -- git push --mirror correctly reaches the customer repo's git history, but the actual GitHub Release + installer/latest.json assets never do. Consequence found live: when publish-tauri and sync-customers both target the same tag on core's shared release object, whichever job's upload runs second silently overwrites the first's assets. Fix requires editing release.yml (out of 26-05's file scope). Not fixed in 26-05; worked around for the D-17 hop-2 proof via a manual gh release create --repo zedfauji/supermarket-pos-taj using the real, signature-verified artifact (see 26-05-SUMMARY.md). Blocks a truly-automatic new-path release for any future customer until fixed.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T16:30:00.000Z",
    "resolved_at": "2026-09-03T21:10:44.503Z"
  },
  {
    "id": 52,
    "kind": "deviation",
    "phase": "26",
    "file": "customers/customers.json",
    "line": 1,
    "description": "zedfauji/supermarket-pos-taj (created gh repo create --private in Plan 26-04) is a PRIVATE repo, but Tauri's updater plugin makes a plain unauthenticated HTTP GET to plugins.updater.endpoints (no auth header configured anywhere in tauri.conf.json/tauri.override.json). Reproduced live: curl -sL https://github.com/zedfauji/supermarket-pos-taj/releases/latest/download/latest.json returned 404 both with and without a valid PAT bearer Authorization header (GitHub's /releases/latest/download/ redirect shortcut does not accept token auth the way api.github.com does for private repos) -- only gh CLI's own authenticated API calls could reach the asset. This meant a real installed Taj till, once migrated to Taj's own endpoint, could not actually complete an automatic update check against a private mirror repo. Fixed by the orchestrator at the Plan 26-06 pre-flight checkpoint: `gh repo edit zedfauji/supermarket-pos-taj --visibility public --accept-visibility-change-consequences` -- re-verified live, curl now returns 200. Accepted per 26-04's own T-26-10 threat disposition (medium/non-blocking exposure of identity strings, not credentials).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-03T16:30:00.000Z",
    "resolved_at": "2026-09-03T16:40:00.000Z"
  },
  {
    "id": 53,
    "kind": "deviation",
    "phase": "26",
    "file": "scripts/onboard-customer.ps1",
    "line": null,
    "description": "scripts/onboard-customer.ps1 (Plan 26-03) hardcodes `gh repo create $fullRepo --private` for every new customer repo. Ledger #52 found that a private customer mirror 404s against Tauri's unauthenticated updater GET; #52 was fixed one-off for zedfauji/supermarket-pos-taj by flipping it public, but onboard-customer.ps1 itself was not changed -- customer #2 onward, onboarded via this script exactly as documented in docs/onboarding-new-customer.md, will reproduce the identical 404 unless the script defaults to --public or an authenticated-fetch updater mechanism is added first. Not fixed: discovered after Plan 26-03 already shipped; fixing requires either changing onboard-customer.ps1's default (and re-confirming with the operator that customer identity/branding in a public repo is acceptable, per the T-26-10 disposition already accepted for Taj) or a separate updater-auth mechanism.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-03T16:40:00.000Z",
    "resolved_at": null
  },
  {
    "id": 54,
    "kind": "deviation",
    "phase": "26",
    "file": ".github/workflows/release.yml",
    "line": 162,
    "description": "After fixing WINDOWS.md #51's repo-routing bug (GITHUB_REPOSITORY now correctly shadowed to matrix.customer.repo), a real workflow_dispatch run (33805295067, worktree-agent-a5fe98c9788387d07, v1.2.4) confirms tauri-action's release step now correctly targets zedfauji/supermarket-pos-taj (log: Looking for a draft release with tag v1.2.4... against the taj repo, not core) -- but the release creation call itself then fails: 403 Resource not accessible by personal access token on POST /repos/zedfauji/supermarket-pos-taj/releases. CUSTOMER_MIRROR_PAT has enough scope for git push --mirror (an earlier step in the same job succeeds) but not for the Releases REST API on the same public, user-owned (non-org, so not an SSO issue) repo. Root cause is the PAT's own granted scope/permission set (a stored GitHub secret this agent cannot inspect or regenerate), not release.yml's code. Not fixed: requires a human to regenerate CUSTOMER_MIRROR_PAT with Contents: Read and write (fine-grained) or full repo scope (classic) and confirm it covers Releases, then re-dispatch to confirm. Until resolved, sync-customers still cannot complete a fully-automatic release with zero manual gh release create workaround.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-03T21:10:54.633Z",
    "resolved_at": null
  },
  {
    "id": 55,
    "kind": "deviation",
    "phase": "26",
    "file": ".github/workflows/release.yml",
    "line": 162,
    "description": "CUSTOMER_MIRROR_PAT rotated to a classic PAT with repo scope (fixing #54's 403). Real workflow_dispatch (33823523719, worktree-agent-a02e68602df65c889, v1.2.5): the 403 is gone -- but sync-customers's tauri-action release step now silently uploads/overwrites assets on CORE's own v1.2.5 draft release (id 382413906, asset updated_at timestamps exactly match this job's upload timestamps) instead of creating anything on zedfauji/supermarket-pos-taj. Confirmed via API: taj repo's release list still only has v1.2.3, zero v1.2.5 release exists there in any state (draft or published). GITHUB_REPOSITORY is correctly logged as zedfauji/supermarket-pos-taj in the step's env dump, so the shadow env var IS being set, but tauri-action's internal find-or-create-draft-release call is not honoring it for this PAT/scope combination -- root cause not yet isolated (untested whether classic PAT vs @actions/github's own context resolution is the culprit). Not fixed: requires debugging tauri-action's actual octokit target repo resolution (e.g. explicit owner/repo action inputs if v0.6.2 supports them, or an alternate release-creation step) before sync-customers can land a real release on the customer mirror. Fixed: stopped relying on tauri-action's own release call entirely -- added an explicit `gh release create`/`upload --clobber` step (GH_TOKEN=CUSTOMER_MIRROR_PAT) that locates the just-built nsis/msi artifacts on disk, builds latest.json matching a real prior release's schema, and publishes directly to matrix.customer.repo. Real workflow_dispatch verification (33824675553, v1.2.6, worktree-agent-a4fb1499065df1463): `gh release view v1.2.6 --repo zedfauji/supermarket-pos-taj` confirms tag v1.2.6 with all 5 expected assets (installer, .sig, msi, .sig, latest.json); latest.json's platform url fields all point at zedfauji/supermarket-pos-taj/releases/download/v1.2.6/...; signtool.exe verify //pa //v on the downloaded installer confirms the real Authenticode chain (SHA1 86F3E828B1815AC72AA339B3046B3FE6B690AF62, self-signed root reported untrusted -- expected, matches this repo's own verify-installer-integrity.ps1 pattern); core's own v1.2.6 release (published by the untouched publish-tauri job) is unaffected, still draft=true with its own 5 assets.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-04T01:03:00.927Z",
    "resolved_at": "2026-09-04T01:20:44.000Z"
  },
  {
    "id": 56,
    "kind": "unrun-verify",
    "phase": "27",
    "file": "e2e/payments/apply-promotion-and-custom-discount.spec.ts",
    "line": null,
    "description": "Tests (b)/(c) edited correctly per Plan 27-08 Task 3 (cashier login + distinct manager PIN) but not executable in this sandboxed worktree — shared port-1520 dev server bound to main checkout's stale/crashed esbuild instance",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-04T04:48:35.281Z",
    "resolved_at": null
  }
]
````
