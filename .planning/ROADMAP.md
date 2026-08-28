# Roadmap: Supermarket POS

## Milestones

- ✅ **v1.0 Alpha** — Phases 1-4 (shipped 2026-08-16)
- ✅ **v1.1 Pre-Launch Hardening** — Phases 5-10 (shipped 2026-08-18)
- ⏸️ **v1.2 Verification & Hardware Hardening** — Phases 11-13 (paused after Phase 11 discussion; requirements/roadmap remain valid for resumption)
- 🚧 **v1.3 Receipt Designer + Inventory Management Expansion** — Phases 14-17 (in progress)
- 🔜 **v1.4 Barcode Scan Product Peek** — Phase 18 (proposed, not started — captured via `/gsd-explore`)
- ✅ **v1.5 Store-Local Durable Printing** — Phase 19 (8/8 plans complete 2026-08-27; Spike 001 validated)
- 🔜 **v1.6 Store Deployment: Signed Elevated Installer** — Phase 20 (proposed, not started — captured via `/gsd-explore`)

## Phases

<details>
<summary>✅ v1.0 Alpha (Phases 1-4) — SHIPPED 2026-08-16</summary>

- [x] Phase 1: Strip & Rebrand (13/13 plans) — completed 2026-08-16
- [x] Phase 2: Core Direct-Sale Checkout (9/9 plans) — completed 2026-08-16
- [x] Phase 3: Supplier, Receiving & Expiry Tracking (2/2 plans) — completed 2026-08-16
- [x] Phase 4: Reports & Hardening (6/6 plans) — completed 2026-08-16

Full phase details: `.planning/milestones/v1.0-phases/`

</details>

<details>
<summary>✅ v1.1 Pre-Launch Hardening (Phases 5-10) — SHIPPED 2026-08-18</summary>

- [x] Phase 5: Delete void-order feature (3/3 plans) — completed 2026-08-17
- [x] Phase 6: Security hardening (3/3 plans) — completed 2026-08-18
- [x] Phase 7: Backend data integrity (3/3 plans) — completed 2026-08-18
- [x] Phase 8: Sale/payment workflow wiring + cleanup (6/6 plans) — completed 2026-08-18
- [x] Phase 9: Reopen-and-edit a completed sale (3/3 plans) — completed 2026-08-18
- [x] Phase 10: Quality debt & ops documentation (7/7 plans) — completed 2026-08-18

Full phase details: `.planning/milestones/v1.1-ROADMAP.md` · Phase artifacts: `.planning/milestones/v1.1-phases/`

</details>

### ⏸️ v1.2 Verification & Hardware Hardening (Paused)

**Milestone Goal:** Close the remaining verification gaps and security-hardening loose ends left after v1.1's pre-launch pass — checkout mismatch confirmation, receipt delivery coverage (including a new PDF path), and the second half of the client-secret-leak sweep started in v1.1 (SEC-01/SEC-02).

**Status:** Only Phase 11 reached the discussion stage before v1.3 took priority. Requirements and phase structure below remain valid for resumption — nothing here is deprecated, it's queued behind v1.3. Discussion checkpoint archived at `.planning/milestones/v1.2-phases/`.

- [ ] **Phase 11: Security Hardening (Server-Side Secrets & Cost Guardrails)** - Move RAG-embeddings calls server-side and cap `agent-proxy` request size/`max_tokens`
- [ ] **Phase 12: Checkout Verification (Scan & Search Confirmation)** - Non-blocking confirmation only on ambiguous barcode/search matches, happy path unchanged
- [ ] **Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF)** - Reprint, printer-failure resilience with retry, and new PDF receipt delivery

### 🚧 v1.3 Receipt Designer + Inventory Management Expansion (In Progress)

**Milestone Goal:** Let the owner customize receipt layout/branding, and expand inventory management with purchase orders/reordering plus deeper reporting (valuation, shrinkage/waste, expiry-loss, turnover).

- [x] **Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover)** - Four read-only report tabs over existing inventory/stock-movement data, zero new schema (completed 2026-08-19)
- [x] **Phase 15: Receipt Designer (Layout, Branding & Logo Printing)** - Editable header/footer/toggles with print-accurate live preview, plus thermal logo printing via new Rust `GS v 0` support (completed 2026-08-23)
- [x] **Phase 16: Purchase Orders & Reordering** - PO creation, low-stock-seeded draft generation, and full receiving delegated to `receive_shipment` (completed 2026-08-24)

### 🔜 v1.4 Barcode Scan Product Peek (Proposed)

**Milestone Goal:** Scanning a barcode on `/pos` opens a separate detached Tauri window showing full product detail (name, size/unit, photo, price, inventory, SKU, barcode) with a qty/weight input, so a cashier can inspect an item before committing it to the cart.

**Status:** Requirements captured via `/gsd-explore` 2026-08-26. Not yet discussed/planned — run `/gsd-discuss-phase 18` when ready to pick this up.

- [ ] **Phase 18: Barcode Scan Product Peek Window** - Separate Tauri window triggered by `/pos` barcode scan, qty/weight entry, existing stock/expiry guards, replace-on-rescan behavior

### 🔜 v1.5 Store-Local Durable Printing (Proposed)

**Milestone Goal:** Route every print command from mobile, desktop, and POS clients through one
authenticated LAN/VPN-only broker that durably accepts, audits, retries, and delivers work to named
Windows printers after the originating application closes.

**Status:** Requirements and architecture captured via `/gsd-explore` 2026-08-26. Spike 001
(`.planning/spikes/001-windows-print-broker/`) VALIDATED the Windows Service + SQLite ledger + WinSpool
architecture against real hardware 2026-08-26. Phase 19 planned 2026-08-27 (8 plans across 6 waves) and
completed 2026-08-27 (8/8 plans; goal-backward verification passed with one gap closed post-verification
— firewall rule remoteip scoping, see 19-VERIFICATION.md). Cross-machine LAN/VPN reachability remains an
explicit backstop: `scripts/verify-lan-broker-reachability.ps1` exists but has not been run against real
second-machine hardware (no such hardware available in the planning/execution environment).

- [x] **Phase 19: Store-Local Durable Printing Service** (8/8 plans) - Harden every existing caller and
  add a durable, auditable Windows print broker with fail-fast acceptance and named-printer routing —
  completed 2026-08-27

### 🔜 v1.6 Store Deployment: Signed Elevated Installer (Proposed)

**Milestone Goal:** Ship a seamless, elevated, self-signed installer for the store machine, wired to
the remote Supabase project.

**Status:** Remote DB bootstrapped (180 migrations applied), real admin account seeded, NSIS
`installMode: perMachine` and updater endpoint already fixed via `/gsd-explore` 2026-08-27 — see
`.planning/notes/store-deployment-installer-decisions.md`. Remapped 2026-08-28 (local code/DB/edge
functions vs. remote): DB schema is current (180/180 migrations match, nothing new since the
2026-08-27 push), but **zero of the app's 12 edge functions are deployed to the remote project and
zero secrets are set** — this is now the phase's biggest gap, bigger than the installer packaging
work it was originally scoped for. Not yet planned — run `/gsd-plan-phase 20` when ready.

- [ ] **Phase 20: Store Deployment: Signed Elevated Installer** (DEP-01..04) - Deploy all 12 Supabase
  Edge Functions the app depends on and set their required secrets (`ANTHROPIC_API_KEY`,
  `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, `BAR_NAME`/`BAR_ADDRESS`) on the remote project; wire
  self-signed cert generation + Trusted-Root import into the NSIS build pipeline
  (`windows/hooks.nsh`, `tauri.conf.json` signing config); write an installer integrity-check script
  (verifies broker.exe, cert, correct baked Supabase URL, printer hooks are all present in the built
  artifact); run a real `npm run tauri build` + full install test confirming a single UAC prompt and
  no permission failures end-to-end. Depends on Phase 19 (broker sidecar + hooks.nsh).

## Phase Details

### Phase 11: Security Hardening (Server-Side Secrets & Cost Guardrails)

**Goal**: Outbound AI API calls (Anthropic vision/chat and OpenAI RAG embeddings) run entirely server-side with enforced cost/size limits, closing the client-secret-exposure and unbounded-cost gaps left open after v1.1's SEC-01 migration.
**Depends on**: Nothing (independent of Phase 12/13; backend-only)
**Requirements**: SEC-03, SEC-04
**Success Criteria** (what must be TRUE):

  1. A production build's `dist/` bundle contains no `VITE_OPENAI_API_KEY` value and no `openai` client SDK reference — verified by an automated build-output grep, mirroring the acceptance check already used for SEC-01.
  2. RAG-embedding requests are issued through a new Bearer-authenticated Supabase Edge Function rather than directly from the client to OpenAI — verified by an automated test asserting no client-side network request reaches `api.openai.com`.
  3. An `agent-proxy` (and the new embeddings function) request exceeding the configured `max_tokens` ceiling or request-body-size cap is rejected with an actionable, non-generic error — verified by an automated test that posts an oversized payload and asserts the specific error.
  4. A normally-sized `vision.ts`/`brain.ts` request still succeeds end-to-end under the new caps — verified by an automated regression test, proving the guardrail doesn't break legitimate usage.

**Plans**: TBD

### Phase 12: Checkout Verification (Scan & Search Confirmation)

**Goal**: Cashiers get an automatic, non-blocking confirmation only when a barcode scan or manual-search lookup resolves ambiguously, catching mismatches without slowing down the fast-checkout happy path.
**Depends on**: Nothing (independent frontend work; no backend dependency)
**Requirements**: VER-01, VER-02
**Success Criteria** (what must be TRUE):

  1. Scanning or looking up a barcode that resolves to a single active, correctly-priced product adds it to the cart in one action with no confirmation step — verified by a Playwright assertion on cart state and absence of any confirmation UI.
  2. A barcode that resolves to multiple products, or a product flagged inactive/zero-price, surfaces a non-blocking confirmation UI before the item is added to the cart — verified by a Playwright test asserting the item is absent from the cart until confirmed.
  3. Selecting a manual-search result shows the resolved product's name, price, and barcode before it is committed to the cart — verified by a Playwright test asserting those fields render in the pre-commit UI.
  4. Confirming or dismissing the ambiguous-match confirmation correctly adds or rejects the item from the cart — verified end-to-end by Playwright for both outcomes.

**Plans**: 2/2 plans executed

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — Tracer: zero-price scan-confirm end-to-end (TDD predicate + shared useConfirmRiskyAdd hook + scan-path wiring), then low-stock flag via new inventory join

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — ProductCard barcode line (VER-02) + search-path risk-gate wiring (ProductGrid, shared hook reused)

**UI hint**: yes

### Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF)

**Goal**: Receipt delivery — print, reprint, retry, PDF, email — is resilient to printer failure and every delivery path has reproducible automated evidence, including the new PDF path.
**Depends on**: Nothing (sequenced last to reuse the print/email E2E mocking harness this phase builds, per research ordering rationale)
**Requirements**: RCP-01, RCP-02, RCP-03, RCP-04
**Success Criteria** (what must be TRUE):

  1. A cashier can reprint the receipt for the most recently completed sale — verified by an automated test that triggers reprint and asserts the correct receipt content is reissued.
  2. A simulated printer failure (offline/out-of-paper/disconnected) never blocks or rolls back a completed sale — the sale is recorded and the UI reflects success regardless of print outcome — verified by an automated test mocking the print IPC/invoke failure.
  3. A transient printer failure is automatically retried 2-3 times before being surfaced to the cashier as a failure — verified by an automated test asserting retry count and eventual failure state.
  4. A completed sale's receipt can be delivered as a PDF (email attachment and/or standalone download), built from the same `receipt-format.ts` content used for print/email text rather than a second, divergent formatter — verified by an automated test asserting the PDF-attachment/email payload and/or download trigger.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**

- [x] 13-01-PLAN.md — Tracer: bounded print retry (2-3 attempts) + stable-id toast inside printReceipt, proven end-to-end on one checkout (RCP-02, RCP-04)
- [x] 13-02-PLAN.md — Reprint: read-only ReceiptData reconstruction (fetchReceiptDataForPayment) + ReprintButton on PaymentPane (RCP-01)

**Wave 2** *(blocked on Wave 1 completion — 13-03 shares `i18n/locales/{en-US,es-MX}/featOrders.json` edits with 13-01; sequenced to avoid a concurrent-edit collision)*

- [x] 13-03-PLAN.md — PDF delivery: receiptToPdfBytes wraps buildThermalReceiptText verbatim, download button + Resend email attachment (RCP-03)

**UI hint**: yes

### Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover)

**Goal**: The owner can see where inventory value sits, what's being lost to shrinkage/waste and expiry, and how fast stock turns — all from read-only reports layered on existing inventory/stock-movement data, with zero new schema beyond the reports themselves.
**Depends on**: Nothing (independent read-only aggregation over `inventory`/`stock_movements`/`inventory_log`; sequenced first per research as lowest-risk)
**Requirements**: INVR-01, INVR-02, INVR-03, INVR-04
**Success Criteria** (what must be TRUE):

  1. Owner can view an inventory valuation report showing on-hand quantity × current weighted-average cost, broken down by product and category, plus a store-wide total.
  2. Owner can view a shrinkage/waste report showing the dollar value of non-sale stock loss, rolled up from existing `inventory_log` adjustment reason codes.
  3. Owner can view an expiry-loss report showing the dollar value of stock written off specifically due to expiry, filtered separately from other shrinkage reasons within the same underlying adjustment data.
  4. Owner can view a turnover/sell-through report at product or category level, combining units-sold data from the existing Product Sales report with average inventory value from the valuation report.
  5. Each report states its cost-basis formula directly in the UI so the numbers are auditable and reconcile with the existing Inventory page and Product Sales report — verified by automated tests pinning each formula's output against known fixture data.

**Plans**: 4/4 plans executed
**Wave 1**

- [x] 14-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-02-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-03-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 14-04-PLAN.md

**UI hint**: yes

### Phase 15: Receipt Designer (Layout, Branding & Logo Printing)

**Goal**: The owner can customize what prints on every receipt — header/footer text, optional fields, and their store logo — and trust that what they see in preview is exactly what prints on the physical thermal printer.
**Depends on**: Nothing (purely additive extension of the existing `receipt_settings` singleton; independent of Phase 14/16)
**Requirements**: RCPD-01, RCPD-02
**Success Criteria** (what must be TRUE):

  1. Owner can edit receipt header lines, footer text, and toggle optional line items (cashier name, customer name, receipt #, tax breakdown) from Settings.
  2. A live preview reflects the current unsaved edits before saving, rendered through the existing `ReceiptPreview.tsx` renderer rather than a second, divergent one.
  3. Saved `receipt_settings` changes (text, toggles, logo) take effect on the next printed, in-app, and PDF receipt.
  4. The store's uploaded logo (`receipt_settings.logoDataUrl`) prints on the physical 80mm ESC/POS thermal receipt as a monochrome raster image — verified end-to-end by a Playwright test asserting the `GS v 0` raster bytes are sent to the printer command.

**Plans:** 4/4 plans complete

Plans:

- [x] 15-01-PLAN.md — buildThermalReceiptText becomes settings-aware (paper width, show* toggles, headerLine2, footerText wrap)
- [x] 15-02-PLAN.md — Rust `encode_logo_raster`/GS v0 raster encoding + `print_receipt` logo wiring (TDD)
- [x] 15-03-PLAN.md — Thread ReceiptSettings/logoDataUrl through every print/preview/email call site
- [x] 15-04-PLAN.md — HardwareSettingsTab headerLine2/footerText inputs + live preview panel + e2e

**UI hint**: yes

### Phase 16: Purchase Orders & Reordering

**Goal**: A manager can create, auto-draft, and receive purchase orders against a supplier without duplicating the existing goods-receiving logic.
**Depends on**: Nothing (sequenced last per research risk-ordering — highest schema-design risk, and `receive_shipment` must stay unchanged and stable through Phases 14-15 for `receive_po_shipment` to build on)
**Requirements**: PO-01, PO-02, PO-03
**Success Criteria** (what must be TRUE):

  1. A manager+ can create a purchase order against a supplier with line items (product, quantity, cost), selecting products/default costs from the existing `suppliers`/`supplier_products` entities.
  2. A manager+ can generate a draft purchase order in one action, pre-filled from the current low-stock/reorder-point list for a chosen supplier, then edit line items before saving.
  3. A manager+ can receive a purchase order in full, which updates stock/cost/expiry via the existing `receive_shipment` RPC (extended with an optional PO reference) rather than a duplicate receiving code path.
  4. Receiving a purchase order marks it received/closed, and a cashier without manager+ role cannot create or receive purchase orders — verified by an automated RBAC/RLS test.

**Plans**: 4 plans

Plans:
**Wave 1**

- [x] 16-01-PLAN.md — Tracer: purchase_orders/purchase_order_items schema+RLS, receive_shipment extended (p_po_id, PO_ALREADY_RECEIVED/PO_SUPPLIER_MISMATCH guards, atomic close)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-02-PLAN.md — Domain schemas, entities/purchase-order CRUD hooks, computeReorderQuantity (D-07/D-08, TDD), suggest-reorder query

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 16-03-PLAN.md — PurchaseOrderForm (create/edit/suggest-reorder), List/Detail widgets, /purchase-orders route + nav

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 16-04-PLAN.md — Receive Shipment wiring (poId pre-fill), e2e/56-purchase-orders.spec.ts (ROADMAP success criteria 1-4)

**UI hint**: yes

### Phase 18: Barcode Scan Product Peek Window

**Goal**: Scanning a barcode on `/pos` opens a separate Tauri OS window showing full product detail with a qty/weight input, letting the cashier inspect and choose to add-or-skip before it touches the cart.
**Depends on**: Nothing identified yet (needs `/gsd-discuss-phase` — likely touches Tauri multi-window setup, an inter-window event channel, and the existing loose-weight/qty-input component)
**Requirements**: PEEK-01, PEEK-02, PEEK-03, PEEK-04
**Success Criteria** (what must be TRUE) — draft, to be firmed up in discussion:

  1. Scanning a barcode on `/pos` opens a separate Tauri window (verified via window-count/label assertion) showing name, size/unit, photo, price, inventory, SKU, barcode.
  2. The window has a qty/weight input matching the product's unit type, and reuses the existing out-of-stock/near-expiry guard components rather than new ones.
  3. "Add to Cart" adds the entered amount to the active `/pos` cart and closes the window; "Close" dismisses without any cart change.
  4. Scanning a second barcode while the window is open replaces its content with the new product, and the main `/pos` window's own scan-to-search listener still fires on that same scan.

**Plans**: 3/3 plans executed

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — Tracer: WeightEntryDialog onConfirm override (TDD) + ensurePeekWindowShown race-free open/reuse (TDD) + capability grant + CheckoutPanel scan/relay/add-to-cart wiring

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-02-PLAN.md — Peek window's own React tree: main.tsx ?window=peek branch, PeekApp.tsx shell, ProductPeekWindow.tsx widget (full UI-SPEC layout, guard reuse, piece/weight commit paths)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-03-PLAN.md — E2E proof: BroadcastChannel-backed multi-window Tauri IPC mock + peek-window.spec.ts covering PEEK-01..04 and cross-window session restore

**UI hint**: yes

### Phase 19: Store-Local Durable Printing Service

**Goal:** Every print command from a LAN/VPN client is either durably accepted by one store-local
broker with a stable job ID or fails immediately and loudly; accepted work survives application and
service restarts, routes to its named Windows printer, and remains auditable end to end.
**Depends on:** Nothing (independent hardware/service hardening; Spike 001 VALIDATED the service
installation and real printer/spooler boundary on real Windows Service infrastructure and real thermal-
printer hardware — see `.planning/spikes/001-windows-print-broker/README.md`)
**Requirements:** PRN-01, PRN-02, PRN-03, PRN-04, PRN-05, PRN-06, PRN-07
**Success Criteria:**

  1. An authenticated mobile or desktop client on LAN/VPN receives success only after the broker
     durably commits the command; unavailable or rejected submissions return a structured correlated
     error and produce an actionable toast in UI callers.

  2. An accepted command survives client exit and broker restart, then reaches the configured named
     Windows printer queue without requiring the Tauri POS process to remain open.

  3. Receipt, reprint, caja summary, test-print, and cash-drawer callers all use one submission
     contract; automated tests prove no failed `Result` is silently discarded.

  4. Audit queries return command counts and append-only attempts/transitions/errors by time range,
     origin, printer, and job ID while applying payload retention and access controls.

  5. Automated fault tests cover broker unavailable, authentication failure, invalid payload,
     persistence failure, stopped spooler, offline printer, retry exhaustion, duplicate idempotency
     key, ambiguous handoff, and restart recovery.

**Plans:** 8 plans

Plans:
**Wave 1**

- [ ] 19-01-PLAN.md — Tracer: durable test_print end-to-end (broker crate skeleton — ledger/http/delivery — through the real WinSpool call sequence), fault-hardened (restart recovery, ambiguous handoff, connect-timeout)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 19-02-PLAN.md — Windows Service SCM registration, NSIS post-install hook, LAN firewall rule, per-store secret generation (D-01..D-04)
- [ ] 19-03-PLAN.md — Expand the broker contract to print_receipt/print_raw_text (new)/open_cash_drawer, remove the silent-fallback-success anti-pattern (D-09)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 19-04-PLAN.md — Harden all five print-call-site files onto one shared error-copy-key contract; close the one confirmed silent-Result-discard violation (D-11)
- [ ] 19-05-PLAN.md — Per-failure-class retry/backoff config + payload retention purge, gated by a checkpoint:decision confirming the retention window (D-10, D-14 one-way)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 19-06-PLAN.md — entities/print-job + broker GET /jobs list endpoint + PrintJobStatusBadge + "Did this print?" confirm on ReprintButton + stuck-queue alert (D-05..D-08, D-15)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 19-07-PLAN.md — PrintJobsTable/PrintJobFilterBar/PrintJobDetailSheet + /audit Tabs wrapper (D-13, D-16)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 19-08-PLAN.md — Full E2E fault-test matrix, correlation-ID/unknown-confirm/audit-tab specs, broker fault-matrix gap audit, cross-machine LAN reachability script

**UI hint**: yes

## Progress

**Execution Order:**
v1.2 (paused) resumes at Phase 11 → 12 → 13 if picked back up; v1.3 (active) executes 14 → 15 → 16.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|-----------------|--------|-----------|
| 1. Strip & Rebrand | v1.0 | 13/13 | Complete | 2026-08-16 |
| 2. Core Direct-Sale Checkout | v1.0 | 9/9 | Complete | 2026-08-16 |
| 3. Supplier, Receiving & Expiry Tracking | v1.0 | 2/2 | Complete | 2026-08-16 |
| 4. Reports & Hardening | v1.0 | 6/6 | Complete | 2026-08-16 |
| 5. Delete void-order feature | v1.1 | 3/3 | Complete | 2026-08-17 |
| 6. Security hardening | v1.1 | 3/3 | Complete | 2026-08-18 |
| 7. Backend data integrity | v1.1 | 3/3 | Complete | 2026-08-18 |
| 8. Sale/payment workflow wiring + cleanup | v1.1 | 6/6 | Complete | 2026-08-18 |
| 9. Reopen-and-edit a completed sale | v1.1 | 3/3 | Complete | 2026-08-18 |
| 10. Quality debt & ops documentation | v1.1 | 7/7 | Complete | 2026-08-18 |
| 11. Security Hardening (Server-Side Secrets & Cost Guardrails) | v1.2 (paused) | 0/TBD | Not started | - |
| 12. Checkout Verification (Scan & Search Confirmation) | v1.2 (paused) | 2/2 | In Progress|  |
| 13. Receipt Delivery & Resilience (Print, Reprint, Retry, PDF) | v1.2 (paused) | 3/3 | Complete    | 2026-08-24 |
| 14. Inventory Analytics Reports | v1.3 | 4/4 | Complete    | 2026-08-19 |
| 15. Receipt Designer (Layout, Branding & Logo Printing) | v1.3 | 4/4 | Complete    | 2026-08-23 |
| 16. Purchase Orders & Reordering | v1.3 | 4/4 | Complete    | 2026-08-24 |
| 17. E2E Suite Overhaul | v1.3 | 17/17 | In Progress|  |
| 18. Barcode Scan Product Peek Window | v1.4 | 3/3 | In Progress|  |
| 19. Store-Local Durable Printing Service | v1.5 | 0/8 | Planned | - |

### Phase 17: E2E Suite Overhaul

**Goal:** The Playwright E2E suite (`e2e/*.spec.ts`) contains zero references to stripped bar-pos domain concepts (pool tables, Rappi, KDS, waitlist, combos, recipes/ingredients, promotions, tip distribution — all removed from the app in Phase 1) and instead gives comprehensive, current, automated coverage of every real supermarket-pos feature, component, user flow, cross-feature integration, and DB transaction, seeded with Indian grocery products, runnable headless by default (fast) against agent-browser's bundled Chrome-for-Testing binary instead of the unstable system Chrome, with an optional live-monitoring mode (Playwright UI mode) for watching a run in progress.
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04

  - TEST-01: Audit all 50 existing `e2e/*.spec.ts` files; delete/rewrite every test asserting against dropped bar-pos schema/routes/domain (confirmed present in `07-reports`, `09-rbac`, `15-home-navigation`, `17-payment-pane`, `18-modifier-notes-kds`, `20-error-scenarios`, `20-sprint2-revenue`, `23-payment-edge-cases`, `31-categories` (comment-only, no live remnant), `44-focus-tab-order`, `e2e/helpers/supabase.ts`, `e2e/visual/45-visual-baseline.spec.ts`)
  - TEST-02: Comprehensive coverage — every current feature/component/user workflow/integration/DB transaction in the live schema, using realistic Indian grocery product fixtures (masalas, atta/rice/dals, ghee/oil, tea/coffee, snacks, pickles/papads, frozen, ready-to-eat, sweets) with scenario + edge-case coverage
  - TEST-03: `playwright.config.ts` launches against agent-browser's bundled Chrome-for-Testing binary (`~/.agent-browser/browsers/chrome-<version>/chrome` via `launchOptions.executablePath`) instead of `channel: 'chrome'` — keeps `@playwright/test` as the runner (fixtures, parallelism, assertions, network mocking, reporting all preserved); agent-browser itself is not a Playwright-compatible runner and is not used to drive tests
  - TEST-04: Default `npm run test:e2e` stays headless and fast (matches existing `FAST_E2E` posture); add an opt-in script (e.g. `test:e2e:ui`) that launches Playwright UI mode for live pass/fail/timeline monitoring of a run

**Depends on:** Nothing (test-infrastructure work; independent of Phase 11's backend security hardening)
**Plans:** 17/17 plans executed

Plans:
**Wave 1** (foundation — no file conflicts)

- [x] 17-01-PLAN.md — Playwright config (agent-browser Chrome-for-Testing, D-15/D-16 artifact policy) + `test:e2e:ui` script (D-17) + `e2e/helpers/db-assertions.ts` (D-12)
- [x] 17-02-PLAN.md — Indian grocery seed data rewrite (D-01/D-02) — `supabase/seed.sql` + `scripts/seed-dev-data.ts`
- [x] 17-03-PLAN.md — `e2e/helpers/supabase.ts` dead-code strip (resetTestState + 7 dead functions) + `e2e/helpers/rls-clients.ts` (D-13) + `global-teardown.ts` folder-path classification (Pitfall 1)

**Wave 2** *(tracer — blocked on Wave 1)*

- [x] 17-04-PLAN.md — Tracer: `e2e/checkout/` fully rewritten end-to-end (happy-path, atomic-rpc-guards, barcode-scan-search), proving Wave 1's foundation on the app's core flow

**Wave 3** *(expansion — blocked on Wave 2, parallel across domains)*

- [x] 17-05-PLAN.md — `e2e/payments/` (core-payments/payment-pane/edge-cases/refund/split-payment — un-skips 05-payments + 41-split-payment policy violations)
- [x] 17-06-PLAN.md — `e2e/caja/` (session-management un-skip + entries, dedup vs. 19-caja-entries)
- [x] 17-07-PLAN.md — `e2e/inventory/` (management/intelligence/near-expiry/open-units/loose-weight, D-05 fixtures kept for the last two)
- [x] 17-08-PLAN.md — `e2e/suppliers/` + `e2e/purchase-orders/`
- [x] 17-09-PLAN.md — `e2e/reports/` (1557-line `07-reports` surgical fixes + product-sales/export/discount-and-revenue)
- [x] 17-10-PLAN.md — `e2e/receipts/` (settings/category-grouping split + print-retry/reprint/pdf-delivery)
- [x] 17-11-PLAN.md — `e2e/rbac/` (rbac + staff-management + new rls-boundary.spec.ts, D-13 deliverable)
- [x] 17-12-PLAN.md — `e2e/products/` + modifier-sheet hybrid split into `e2e/checkout/modifier-notes.spec.ts`
- [x] 17-13-PLAN.md — `e2e/audit/` + `e2e/tabs/` (concurrent-edits retargeted off deleted TabDrawer/TabCard)
- [x] 17-14-PLAN.md — `e2e/home/` + `e2e/a11y/` + `e2e/errors/` (Bucket-B skip resolution)
- [x] 17-15-PLAN.md — `e2e/settings/` + `e2e/infra/` + `e2e/soak/` (deletes `14-manual-stubs.spec.ts` policy violation, rewrites offline queue)
- [x] 17-16-PLAN.md — `e2e/visual/45-visual-baseline.spec.ts` content audit (heaviest bar-pos file, config untouched)

**Wave 4** *(wrap-up — blocked on all Wave 3 plans)*

- [x] 17-17-PLAN.md — TEST-02 gap audit (closes `agent-chat` coverage gap) + final TEST-01 grep gate + CLAUDE.md E2E section rewrite (D-09) + full suite green run

---
*Next: `/gsd-execute-phase 17` to execute.*
