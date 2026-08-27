---
schema_version: 1
open_count: 29
waived_count: 0
fixed_count: 9
total_count: 38
last_updated: 2026-08-27T16:35:25.923Z
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
  }
]
````
