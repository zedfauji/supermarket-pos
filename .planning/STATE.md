---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Receipt Designer + Inventory Management Expansion
current_phase: 26
current_phase_name: Multi-Customer Deployment
status: executing
stopped_at: Phase 27 UI-SPEC approved
last_updated: "2026-09-02T05:55:08.049Z"
last_activity: 2026-09-01
last_activity_desc: Phase 26 execution started
state_head: 2c6da979f1dcce303965f12947fb98e8cb2291c0
progress:
  total_phases: 10
  completed_phases: 6
  total_plans: 37
  completed_plans: 24
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-01)

**Core value:** Fast, reliable checkout (barcode scan → cart → pay) backed by inventory that's always accurate — what's on the shelf, what's expiring, and what needs reordering — without the owner doing manual data entry for every supplier delivery.
**Current focus:** Phase 26 — Multi-Customer Deployment

## Current Position

Phase: 26 (Multi-Customer Deployment) — EXECUTING
Plan: 1 of 6
Status: Executing Phase 26
Last activity: 2026-09-01 — Phase 26 execution started

## Performance Metrics

**Velocity:**

- Total plans completed: 81 (all v1.0, Phases 1-4)
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 13 | - | - |
| 02 | 9 | - | - |
| 03 | 2 | - | - |
| 04 | 6 | - | - |
| 05 | 3 | - | - |
| 08 | 6 | - | - |
| 09 | 3 | - | - |
| 10 | 7 | - | - |
| 6 | 3 | - | - |
| 14 | 4 | - | - |
| 15 | 4 | - | - |
| 16 | 4 | - | - |
| 13 | 3 | - | - |
| 18 | 3 | - | - |
| 21 | 2 | - | - |
| 23 | 5 | - | - |
| 24 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics (v1.0, Phases 1-4 — archived, see `.planning/milestones/v1.0-phases/`):**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 35 | 2 tasks | 4 files |
| Phase 01 P02 | 6 | 2 tasks | 7 files |
| Phase 01 P03 | 50 | 3 tasks | 61 files |
| Phase 01 P04 | 0 | 3 tasks | 7 files |
| Phase 01 P05 | 55 | 2 tasks | 36 files |
| Phase 01 P06 | 65 | 2 tasks | 81 files |
| Phase 01 P07 | 25 | 2 tasks | 3 files |
| Phase 01 P08 | 20 | 2 tasks | 39 files |
| Phase 01 P09 | 50 | 2 tasks | 81 files |
| Phase 01 P10 | 55 | 2 tasks | 27 files |
| Phase 01 P11 | 70 | 2 tasks | 46 files |
| Phase 01 P12 | 35 | 2 tasks | 12 files |
| Phase 01 P13 | 540 | 3 tasks + 19 spec fixes | ~40 files |
| Phase 02-core-direct-sale-checkout P01 | 28m | 2 tasks | 18 files |
| Phase 02 P02 | 8 | 2 tasks | 8 files |
| Phase 02 P03 | 35 | 3 tasks | 33 files |
| Phase 02-core-direct-sale-checkout P04 | 10m | 3 tasks | 4 files |
| Phase 02-core-direct-sale-checkout P05 | 12m | 3 tasks | 16 files |
| Phase 02 P06 | 145m | 3 tasks | 3 files |
| Phase 02 P08 | 45m | 2 tasks | 7 files |
| Phase 02 P07 | 30m | 2 tasks | 8 files |
| Phase 02 P09 | 35m | 2 tasks | 3 files |
| Phase 03 P01 | 39m | 3 tasks | 32 files |
| Phase 03 P02 | 28m | 2 tasks | 18 files |
| Phase 04-reports-hardening P01 | 9min | 2 tasks | 27 files |
| Phase 04-reports-hardening P02 | 14min | 2 tasks | 20 files |
| Phase 04 P05 | 25min | 3 tasks | 5 files |
| Phase 04 P06 | 25min | 2 tasks | 1 files |
| Phase 17 P01 | 3 | 2 tasks | 3 files |
| Phase 17-e2e-suite-overhaul P02 | 6min | 2 tasks | 2 files |
| Phase 17-e2e-suite-overhaul P03 | 12min | 3 tasks | 4 files |
| Phase 17 P04 | 28m | 2 tasks | 5 files |
| Phase 24 P01 | 55min | 2 tasks | 15 files |
| Phase 24 P02 | 20min | 2 tasks | 4 files |
| Phase 24 P03 | 30min+25min | 2 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

- Phase 21 added: Idle Screen Lock — configurable per-terminal inactivity timeout (default 60s)
  locks every screen for every role incl. admin, no transaction exemption; unlocks on any valid
  staff PIN with session identity unchanged; lock+unlock both audit-logged. Requirements LCK-01..04
  captured via `/gsd-explore` 2026-08-30.

- Phase 22 added: Admin PIN Reset (Server-Side Recovery Path) — Edge Function-backed admin PIN
  reset for a staff member who has genuinely forgotten their PIN (no in-app recovery exists today;
  `force_pin_change` requires knowing the current PIN to log in first). Independent of Phase 21.

- Phase 24 added: Tax Configuration (Inclusive/Exclusive Toggle) — global `taxInclusive` toggle in
  Billing settings, fixing a live bug where checkout and the server-side
  `process_direct_sale_atomic` RPC always apply tax additively even though store prices already
  include tax (every sale currently overcharged by the tax amount). Requirements TAX-01..05

- Phase 26 added: Multi-Customer Deployment — ship this codebase to multiple customers, each with
  an isolated Supabase project and their own release/updater channel. Scoped from spikes 007–010
  (`.planning/spikes/MANIFEST.md`, idea key `multi-customer-deployment`), triggered by CI run
  33587195680 failing with leftover `bar-pos v1.2.0` branding and the discovery that
  `tauri.conf.json`/`.env.production` hardcode one customer (Taj House of Spices) today. Branching
  decision (user-confirmed): core repo stays the single source of truth; each customer gets a thin
  repo for Actions+Releases only, synced from core — a shared repo's `/releases/latest` is proven
  repo-wide, not per-customer (Spike 007), which breaks Tauri's updater across customers. Depends on
  two filed todos: `fix-ci-tauri-build-broker-order.md` (unrelated CI bug blocking `tauri-build`
  today) and `migrate-env-production-to-github-environment.md` (interim Environment-secret migration
  for the existing customer, ahead of the full N-customer machinery). Captured via `/gsd-explore`
  2026-09-01.
  captured via `/gsd-explore` 2026-08-31. Grey areas deferred to discuss-phase.

- Phase 23 added: Bank Transfer Payment Tracking — cashier marks a sale awaiting bank transfer
  with a system-generated reference code, admin/manager manually confirms/disputes on `/payments`,
  no auto-confirm path. Independent of Phase 22. Design validated via spikes 002-005
  (`.planning/spikes/`, idea key `bank-transfer-payment-tracking`) 2026-08-31.
  Captured via `/gsd-explore` 2026-08-31 after live-debugging two real PIN-sync production
  incidents on the Vinty Owner account — see `.planning/notes/vinty-owner-login-outage-rca.md`.

- Phase 19 added: Store-Local Durable Printing Service — LAN/VPN-only Windows broker, durable
  acceptance before workflow success, restart-surviving queue, named-printer routing, correlated
  error propagation, and auditable command/event history.

- Phase 20 added: Store Deployment: Signed Elevated Installer — self-signed cert generation +
  Trusted-Root import wired into the NSIS pipeline, installer integrity-check script, real
  `tauri build` + install verification. Remote Supabase bootstrap (180 migrations, real admin
  seed) and the `installMode`/updater-endpoint config fixes were done directly via `/gsd-explore`
  2026-08-27, ahead of this phase's planning.

- Phase 17 added: E2E Suite Overhaul — audit and rewrite `e2e/*.spec.ts` to remove residual bar-pos-domain assertions (pool_tables, rappi, KDS, waitlist, combos, ingredients/recipes, promotions — confirmed still present in 10 files including `e2e/helpers/supabase.ts`), add comprehensive coverage of every current supermarket-pos feature/flow/integration/DB transaction with Indian grocery product fixtures, and switch the browser target from `channel: 'chrome'` to agent-browser's bundled Chrome-for-Testing binary (keeping `@playwright/test` as the runner) with an opt-in Playwright UI-mode dashboard.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap, 2026-08-19]: v1.3 phase structure set to 3 phases (14-16), following research SUMMARY.md's suggested order (Inventory Analytics Reports → Receipt Designer → Purchase Orders) and matching `granularity: coarse` config (2-4 phases). Phase 14 (INVR-01..04) is zero-new-schema read aggregation, sequenced first as lowest risk. Phase 15 (RCPD-01/02) is a purely additive `receipt_settings` extension carrying the milestone's one genuinely new Rust engineering surface (`GS v 0` thermal logo raster). Phase 16 (PO-01..03) carries the highest schema-design risk (new `purchase_orders`/`purchase_order_items` tables, new RBAC decision) and is sequenced last so `receive_shipment` — which `receive_po_shipment` must delegate to, not duplicate — stays stable and unchanged through the other two phases.
- [Roadmap, 2026-08-19]: v1.2 (Phases 11-13) is paused, not abandoned — only Phase 11 reached the discussion stage before v1.3 took priority. Its ROADMAP.md phase details and REQUIREMENTS.md entries (SEC-03/04, VER-01/02, RCP-01..04) are left intact and resumable; phase numbering for v1.3 continues from 14 rather than reusing 11-13.
- [Roadmap, 2026-08-19]: All v1.3 success criteria are phrased as automatable (Playwright/Vitest assertions, RBAC/RLS tests, fixture-pinned formula tests) per this repo's CLAUDE.md mandatory-automated-testing policy — no `human_needed` terminal states planned for any v1.3 phase.
- [Roadmap, 2026-08-19]: v1.2 phase structure set to 3 phases (11-13), compressed from research SUMMARY.md's 5-phase suggestion per `granularity: coarse` config — Phase 11 merges the guardrail (SEC-04) and RAG-embeddings migration (SEC-03) research phases into one Security Hardening phase (they share `supabase/functions/` and the guardrail-sizing discipline should be applied fresh to the new function), Phase 12 keeps checkout re-confirmation (VER-01/VER-02) as its own frontend-only phase, Phase 13 merges receipt print/email E2E coverage and PDF delivery (RCP-01..04) into one Receipt Delivery & Resilience phase since they share the same files (`receipt-format.ts`, `pos-printer.ts`, `send-receipt-email`) and E2E mocking harness.
- [Roadmap, 2026-08-19]: All 8 v1.2 success criteria are phrased as automatable (Playwright/Vitest assertions, network interception, build-output grep) per this repo's CLAUDE.md mandatory-automated-testing policy — no `human_needed` terminal states planned for any v1.2 phase.
- [Roadmap, 2026-08-16]: v1.1 phase structure set to 6 phases (5-10), following the exact breakdown proposed by research (SUMMARY.md) plus the 8 requirements added after research (SEC-02, DATA-02, SALE-05, QA-01..04, OPS-02): Phase 5 void-order deletion (shrinks shared-file diff surface first), Phase 6 security hardening, Phase 7 backend data integrity, Phase 8 sale/payment wiring + cleanup bundle, Phase 9 reopen-and-edit (sequenced last of the functional work — open wiring question on `RemoveTabItemDialog`/`useRemoveTabItem` may change its own scope), Phase 10 quality debt + ops docs (nothing depends on it).
- [Roadmap, 2026-08-16]: OPS-01 (Tauri identifier) and OPS-02 (backup/DR doc) are the only v1.1 success criteria not verified via Playwright/Vitest — both are inherently config-value/document facts, confirmed by direct inspection, consistent with this project's automated-verification-only policy for actual app behavior.
- [Init]: Pivot in-place (this repo, no fork) — bar-pos maintained separately elsewhere
- [Init]: Reuse generic retail infra (auth/RBAC/caja/payments/barcode/AI vision), strip bar/pool domain layers only
- [Init]: Fold supplier/PO/expiry tracking into Alpha, not deferred to Beta — inventory is the product's core strength
- [Init]: AI invoice intake deferred to Beta — extraction accuracy on real supplier sheets is unproven, shouldn't block Alpha's checkout
- [v1.0 archive]: Full v1.0 decision log (Phases 1-4, D-01 through tip-distribution/margin fixes) preserved in `.planning/milestones/v1.0-phases/` — see those phase directories for the complete record, summarized here only where it affects v1.1 work.
- [v1.0 archive]: tauri.conf.json identifier (`com.yourcompany.barpos`) was explicitly left untouched during Phase 1's rebrand pass (OS-level, out of scope at the time) — now OPS-01 in v1.1, real value decided by the user: `com.tajhouseofspices.supermarketpos`.
- [Phase ?]: E2E tests prefer agent-browser Chrome-for-Testing with Playwright fallback.
- [Phase ?]: Service-role DB helpers are ground-truth reads, not RLS-denial clients.
- [Phase ?]: Phase 17 seed data uses 27 packaged Indian grocery SKUs mirrored between remote and local Supabase seeds.
- [Phase ?]: RLS-denial clients always use an anon-key sign-in and isolated storage key.
- [Phase ?]: Playwright report grouping is derived from spec folders, not filename prefixes.
- [Phase ?]: Checkout E2E uses the Indian catalog and keeps category filtering keyboard-safe.
- [Phase 24]: Fixed a zero-row COALESCE gap in process_direct_sale_atomic's v_tax_inclusive read (Rule 1) so a missing settings row defaults to taxInclusive=true per D-01, matching the pre-existing v_tax_rate fallback pattern
- [Phase 24]: PaymentForm.test.tsx's static useSettings mock converted to a vi.hoisted mutable object for per-test tax-mode overrides; reusable pattern for Plan 02/03
- [Phase 24]: Billing Settings taxInclusive toggle placed inside the same grid cell as the tax-rate input, stacked below it
- [Phase 24]: [Phase 24] process-payment/process-split-payment receipts now decompose tax via shared decomposeTax(), closing the receipt-consistency gap for reopened/split-payment sales
- [Phase 24]: PaymentSchema.method now reuses domain.ts's PaymentMethodSchema instead of a hand-rolled enum, fixing a bank_transfer-triggered /payments page blank-out bug
- [Phase 24]: Phase-close code review (24-REVIEW.md) found a real gap the phase's own plans missed — the `/payments` reprint path (`fetchReceiptDataForPayment`) never got the tax-decompose treatment, contradicting TAX-05 and shipping untested. Fixed in-phase (929406c) rather than deferred, plus a Rappi-tax fix (WR-01, shared `decomposeTaxForMethod` helper) and a taxInclusive-toggle confirmation dialog (WR-03). One item (split-payment per-leg receipts vs. full item list, WR-02) deliberately deferred — pre-existing to Phase 24, needs a receipt-contract design decision.

### Pending Todos

None yet.

### Blockers/Concerns

- Per project CLAUDE.md: all verification must be automated Playwright E2E/Vitest — no `human_needed` terminal states, no manual UAT checkpoints, for any v1.3 phase.
- Phase 14 planning must pin one documented cost-basis formula per report (valuation vs. historical-cost-snapshot margin in the existing Product Sales report) before implementation — research PITFALLS.md flags inconsistent cost bases as the top risk for these reports not reconciling with existing pages.
- Phase 14 planning must resolve the turnover-averaging-method gap (research Gaps to Address): no periodic-snapshot infrastructure exists yet for accurate period-average inventory value; compute from the movement log going forward and document the limitation for pre-feature periods.
- Phase 15 planning must confirm the `GS v 0` bit-image/raster ESC/POS command implementation approach (dithering, dot-width chunking) — genuinely new Rust code with no existing pattern in this codebase (research flagged for deeper research during planning).
- Phase 15 planning must keep preview and print on one shared formatter (`receipt-format.ts`) — research Pitfall 1 warns a CSS-rendered preview can silently diverge from the fixed-width monospace thermal output.
- Phase 16 planning must resolve two open decisions before implementation: PO write-access RBAC action (reuse `manage_products` vs. new `manage_purchase_orders`) and whether `create-purchase-order` needs its own Edge Function or a plain RLS-gated insert suffices (research Gaps to Address).
- Phase 16 planning must ensure the reorder-suggestion query rounds to `supplier_products` pack/case size (not base units) and flags products with missing pack-size data — research Pitfall 4.
- v1.2 (Phases 11-13) is paused after Phase 11 reached discussion stage — requirements/roadmap remain valid for resumption via a dedicated resume flow; see PROJECT.md Active section for full context.
- v1.0/v1.1 blockers/concerns log (Docker Compose stack switch, pool_tables strip fragility, idempotency gap, Phase 9 wiring question, etc.) archived — all resolved prior to their respective ships.
- Phase 25 (E2E Receipt Print-Mock Consolidation) not yet planned — 4 e2e/receipts/ specs each independently hand-roll a `__TAURI_INTERNALS__` mock missing `__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener`, causing a page-level uncaught-exception flake unrelated to tax/receipt content. Root-caused during Phase 24, fix scoped (extract shared `e2e/helpers/tauriPrintMock.ts` mirroring the Phase 18 `tauriPeekMock.ts` precedent) but not applied.
- `e2e/checkout/barcode-scan-search.spec.ts`'s "category tabs compose with search" test times out waiting for a category-filter button — confirmed pre-existing (untouched since Phase 18, zero Phase 24 file ownership), root cause not yet diagnosed, no phase assigned.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2/Beta requirement | AI-01..04 (AI invoice/sheet intake: PDF/Excel/photo → line items → receiving) | Deferred to a follow-up Beta roadmap/milestone | v1.0 roadmap creation, 2026-08-10 |
| v2 requirement | RCP-05 (full outbound transactional email service beyond existing Resend integration — templates, delivery-status tracking, bounce handling) | Deferred — only if store owner explicitly asks for more than PDF/print/existing-email coverage | v1.2 requirements definition, 2026-08-19 |
| v2 requirement (v1.3 deferred pieces) | Partial PO receiving/backorder tracking; category-level shrinkage/turnover breakdown; locale-aware custom receipt field labels; trend views (week/month-over-month) for valuation/shrinkage/turnover | Deferred until the corresponding v1.3 phase ships and daily use justifies the add — see REQUIREMENTS.md v2 Requirements | v1.3 requirements definition, 2026-08-19 |
| Milestone (paused) | v1.2 Verification & Hardware Hardening (Phases 11-13: SEC-03/04, VER-01/02, RCP-01..04) | Paused after Phase 11 discussion, requirements/roadmap valid for resumption | v1.3 milestone start, 2026-08-19 |
| Out of scope | Counter/hanging scale hardware integration | Revisit after Alpha usage data confirms loose-weight volume | v1.0 init, 2026-08-10 |
| Security hardening (future phase) | `create_order_with_items` and `remove_tab_item` have no server-side role check gating reopened-sale (`tabs.reopened_at IS NOT NULL`) edits — Phase 9's `ManagerPinDialog` gates are client-side UX only. Pre-existing condition (both RPCs predate Phase 9 unguarded), not a Phase 9 regression; accepted per `.planning/verification-overrides.md`. Fix shape: add a conditional `AUTH_FORBIDDEN` role check to both RPCs when the target tab was reopened. | Deferred — not yet scoped to a milestone | Phase 09 verification, 2026-08-18 |
| Out of scope | Batch-level FEFO auto-allocation at sale time | One active expiry/product sufficient for single store | v1.0 init, 2026-08-10 |
| Documentation gap | CLAUDE.md describes stripped bar/pool routes (stale post-pivot) | Route to `/gsd-docs-update` separately — not roadmap scope | v1.1 research, 2026-08-16 |
| Phase 06 checkpoint | 06-01 Task 4: set real `ANTHROPIC_API_KEY` server-only secret + deploy/restart `agent-proxy` | User will do this personally at the end of the project, immediately before shipping to the customer. Code-side SEC-01 work is complete (no client-exposed key/SDK reference); `agent-proxy` will 500 on real calls until this is done. Resume via `06-01-PLAN.md` Task 4. | Phase 06 execution, 2026-08-17 |

## Session Continuity

Last session: 2026-09-02T06:04:00.000Z
Stopped at: Phase 27 planned and verified (7 plans, 4 waves, commit cdc3ce1) — ready for `/gsd-execute-phase 27`
Resume file: .planning/phases/27-promotions-discount-management/27-01-PLAN.md

## Operator Next Steps

- Run `/gsd-execute-phase 27` to execute Phase 27 (Promotions & Discount Management), starting with Wave 1's tracer plan (27-01-PLAN.md).
- Run `/gsd-plan-phase 25` to plan E2E Receipt Print-Mock Consolidation (extract the shared `__TAURI_INTERNALS__` mock helper — see Blockers/Concerns above).
- Phase 26 (Multi-Customer Deployment) execution is in progress in a concurrent session — do not run `/gsd-plan-phase 26` or edit its plans without checking in there first.
