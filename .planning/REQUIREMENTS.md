# Requirements: Supermarket POS

**Defined:** 2026-08-19 (v1.2)
**Core Value:** Fast, reliable checkout (barcode scan → cart → pay) backed by inventory that's always accurate — what's on the shelf, what's expiring, and what needs reordering — without the owner doing manual data entry for every supplier delivery.

## v1.2 Requirements — Verification & Hardware Hardening

Milestone goal: close the remaining verification gaps and security-hardening loose ends left after v1.1's pre-launch pass — checkout mismatch confirmation, receipt delivery coverage (including a new PDF path), and the second half of the client-secret-leak sweep started in v1.1 (SEC-01/SEC-02).

### Checkout Verification

- [x] **VER-01**: A barcode scan or manual-search product lookup that resolves ambiguously (multiple products for one barcode, or a product flagged inactive/zero-price) surfaces a non-blocking confirmation before the item is added to the cart. A clean, unambiguous match is added to the cart in a single action — no confirmation step is added to the happy path.
- [x] **VER-02**: When adding an item from manual search results, the cashier sees the resolved product's name, price, and barcode before it's added to the cart, so a wrong-row click is caught before commit.

### Receipt Delivery

- [x] **RCP-01**: A cashier can reprint the receipt for the most recently completed sale.
- [x] **RCP-02**: A receipt printer failure (offline, out of paper, disconnected) never blocks or rolls back a completed sale — the sale completes and is recorded regardless of print outcome, verified by an E2E test that simulates printer failure.
- [x] **RCP-03**: A completed sale's receipt can be delivered as a PDF — attached to the existing email-receipt path (Resend) and/or downloaded standalone — reusing the existing `receipt-format.ts` formatting logic rather than a second, divergent formatter.
- [x] **RCP-04**: A transient printer failure is automatically retried (2-3 attempts) before being surfaced to the cashier as a failure.

### Security Hardening

- [ ] **SEC-03**: The RAG-embeddings call in `src/shared/lib/agent/rag.ts` runs server-side through a Bearer-authenticated Supabase Edge Function, mirroring the `agent-proxy` pattern already shipped for the Anthropic API (v1.1 SEC-01). `VITE_OPENAI_API_KEY` and the client-side `openai` SDK dependency are removed; a build-output grep confirms no key or SDK reference remains in the shipped `dist/` bundle.
- [ ] **SEC-04**: The `agent-proxy` Edge Function enforces a `max_tokens` ceiling and a request-body-size cap in its existing `BodySchema`, calibrated against real `vision.ts`/`brain.ts` usage, closing the accepted-risk gap from Phase 6's threat model (T-06-04). An oversized or excessive request is rejected with an actionable error, not a generic failure.

## v1.3 Requirements — Receipt Designer + Inventory Management Expansion

Milestone goal: let the owner customize receipt layout/branding, and expand inventory management with purchase orders/reordering plus deeper reporting (valuation, shrinkage/waste, expiry-loss, turnover).

### Receipt Designer

- [x] **RCPD-01**: The owner can edit receipt header lines, footer text, and toggle optional line items (cashier name, customer name, receipt #, tax breakdown) from Settings, with a live preview reflecting the current `receipt_settings` before saving — reusing/extending the existing `ReceiptPreview.tsx` renderer rather than building a second one.
- [x] **RCPD-02**: The store's uploaded logo (`receipt_settings.logoDataUrl`) prints on the physical 80mm ESC/POS thermal receipt, not just in-app/PDF — new Rust support in `printer.rs` converts the logo to a monochrome raster image and encodes it via the ESC/POS `GS v 0` command, verified end-to-end by a Playwright test asserting the raster bytes are sent to the printer command.

### Purchase Orders

- [x] **PO-01**: A manager+ can create a purchase order against a supplier with line items (product, quantity, cost), reusing the existing `suppliers`/`supplier_products` entities for selection and default cost.
- [x] **PO-02**: A manager+ can generate a draft purchase order pre-filled from the current low-stock/reorder-point list for a chosen supplier, in one action, then edit line items before saving.
- [x] **PO-03**: A manager+ can receive a purchase order in full, updating stock/cost/expiry via the existing `receive_shipment` RPC (extended with an optional PO reference) rather than a duplicate receiving code path, and marking the PO received/closed.

### Inventory Reporting

- [x] **INVR-01**: The owner can view an inventory valuation report (on-hand quantity × current weighted-average cost, by product/category, and store total).
- [x] **INVR-02**: The owner can view a shrinkage/waste report showing the value of non-sale stock loss, rolled up from existing `inventory_log` adjustment reason codes.
- [x] **INVR-03**: The owner can view an expiry-loss report showing the value of stock written off due to expiry, filtered from the same adjustment data as INVR-02.
- [x] **INVR-04**: The owner can view a turnover/sell-through report (product or category level) combining units-sold (existing Product Sales report data) with average inventory value (INVR-01).

### E2E Suite Overhaul

- [x] **TEST-01**: Every `e2e/*.spec.ts` file is audited; every test asserting against dropped bar-pos schema/routes/domain (pool tables, Rappi, KDS, waitlist, combos, recipes/ingredients, promotions, tip distribution) is deleted or rewritten, verified by a zero-match grep gate across `e2e/**/*.spec.ts` and `e2e/helpers/*.ts`.
- [x] **TEST-02**: The rewritten suite gives comprehensive, automated coverage of every current supermarket-pos feature/component/user workflow/integration/DB transaction, seeded with realistic Indian grocery product fixtures, cross-referenced against the current `src/features`/`src/widgets`/`src/entities` inventory.
- [x] **TEST-03**: `playwright.config.ts` launches against agent-browser's bundled Chrome-for-Testing binary via `launchOptions.executablePath`, auto-detected at config load time (not hardcoded), keeping `@playwright/test` as the runner.
- [x] **TEST-04**: Default `npm run test:e2e` stays headless and fast (unchanged); an opt-in `test:e2e:ui` script launches Playwright UI mode for live pass/fail/timeline monitoring of a run.

## v1.4 Requirements — Barcode Scan Product Peek (proposed, not yet roadmapped)

Milestone goal: scanning a barcode on `/pos` opens a separate detached Tauri window showing full product detail, so a cashier can verify/inspect an item before committing it to the cart.

### Product Peek Window

- [x] **PEEK-01**: Scanning a barcode on `/pos` opens a separate Tauri OS window (not a modal/overlay in the main window) showing the matched product's name, size/unit (kg/g/L/piece), photo, price, current inventory, SKU, and barcode.
- [x] **PEEK-02**: The peek window includes a quantity/weight input (matching the product's unit type — piece count or loose-weight amount) that the cashier sets before adding to cart, and reuses the existing out-of-stock and near-expiry checkout guards rather than a duplicate guard implementation.
- [x] **PEEK-03**: The peek window offers "Add to Cart" (adds the entered qty/weight to the active `/pos` cart and closes the window) and "Close" (dismisses without adding anything).
- [x] **PEEK-04**: While the peek window is open, scanning a different barcode replaces its content with the newly scanned product (no manual close needed first); the main `/pos` window's existing scan-to-search behavior continues to fire on the same scan independently.

Scope note: v1 is `/pos`-only. Rollout to other screens (global scan trigger) is deferred — see seed `barcode-peek-global-rollout`.

## v1.5 Requirements — Store-Local Durable Printing (proposed)

Milestone goal: make every print command fail fast at acceptance, survive application restarts after
acceptance, route through one store-local broker, and remain auditable without any internet service.

### Printing Broker

- [x] **PRN-01**: Mobile, desktop, and POS clients on the store LAN/VPN submit all receipt, reprint,
  report, test-print, and cash-drawer print commands to one authenticated store-local broker; the
  broker is not exposed to the public internet and has no cloud dependency.

- [x] **PRN-02**: A print-dependent workflow succeeds only after the broker durably records the job
  and returns its stable job/correlation ID. Unreachable broker, rejected payload, authentication,
  persistence, or routing failures fail immediately with a structured error and never report
  success.

- [x] **PRN-03**: An accepted job survives client, Tauri application, and broker process restart and
  is delivered asynchronously to its configured named Windows printer queue.

- [x] **PRN-04**: Every printing boundary propagates and logs normalized structured errors with the
  same job/correlation ID. UI-originated terminal failures show an actionable toast; background and
  non-UI callers explicitly handle and log failed results rather than discarding them.

- [x] **PRN-05**: The broker retains an auditable command and event history containing origin/actor,
  printer endpoint, payload hash/reference, timestamps, attempts, state transitions, Windows job ID,
  and normalized errors, with queryable command counts and retention controls.

- [x] **PRN-06**: Delivery uses finite retries only for classified transient failures and reconciles
  ambiguous Windows-spooler handoffs before resubmission. Stable idempotency keys prevent accidental
  duplicate jobs.

- [x] **PRN-07**: UI and audit states distinguish durable acceptance, submission to Windows,
  OS-reported completion, failure, cancellation, and unknown status; Windows status is never
  presented as proof of physical paper output.

## v1.6 Requirements — Store Deployment: Signed Elevated Installer (proposed)

Milestone goal: ship a seamless, elevated, self-signed installer for the store machine that boots
into a fully working app against the remote Supabase project — schema, edge functions, and secrets
included, not just the desktop binary. Remote DB schema (180 migrations) and one real admin account
were bootstrapped ahead of planning via `/gsd-explore` 2026-08-27; remapped 2026-08-28 and found the
remote project has **zero edge functions deployed** — this is now the largest gap, ahead of the
installer packaging work the phase was originally scoped for.

### Installer Packaging

- [x] **DEP-01**: The NSIS installer runs fully elevated (single UAC prompt covers Windows Service
  registration, firewall rule, and cert Trusted-Root import) and is code-signed with a self-signed
  certificate generated at build time and auto-trusted during install. The installer is distributed
  via the existing public GitHub Release download, which applies Mark-of-the-Web and means SmartScreen
  will still show once on first launch regardless of signing (a self-signed cert cannot suppress this
  for a browser-downloaded file) — a one-time "More info → Run anyway" click-through on first launch
  is accepted; no SmartScreen warning is expected on any subsequent run or update.

- [x] **DEP-02**: An installer integrity-check script verifies the built artifact actually contains
  the broker sidecar (`broker/broker.exe`), the signing certificate, the correct baked
  `VITE_SUPABASE_URL` (the remote project, never `127.0.0.1`), and the NSIS printer-broker hooks —
  before the installer ships to the store machine.

### Remote Backend Completeness

- [x] **DEP-03**: All 12 Supabase Edge Functions the app depends on
  (`process-payment`, `process-split-payment`, `create-staff`, `process-direct-sale`,
  `receive-shipment`, `send-receipt-email`, `settings-backup`, `settings-restore`,
  `settings-email-status`, `settings-test-email`, `get-server-time`, `agent-proxy`) are deployed to
  the remote project — checkout, staff creation, and shipment receiving are unusable without them.

- [x] **DEP-04**: Every edge-function secret the deployed functions read (`ANTHROPIC_API_KEY`,
  `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL`, and the store-identity vars currently named `BAR_NAME`/
  `BAR_ADDRESS` — a bar-pos naming leftover, rename or just set correctly) is set on the remote
  project via `supabase secrets set`, not left at Supabase's empty default.

## v1.7 Requirements — Idle Screen Lock (proposed, not yet roadmapped)

Milestone goal: any screen, any role (including admin), locks behind a PIN prompt after a period of
inactivity — a physically unattended till should never sit open. Captured via `/gsd-explore`
2026-08-30.

### Idle Lock

- [x] **LCK-01**: An idle-lock overlay engages after a configurable inactivity timeout (default 60s)
  on every screen, for every role including admin, with no exemption for in-progress transactions
  (open cart, payment modal, etc.) — the overlay blocks all interaction until unlocked.

- [x] **LCK-02**: The inactivity timeout is configurable per-terminal (same storage pattern as
  `receipt_settings` — one row per terminal, not a single global value), editable only by
  `manage_settings`-gated roles.

- [x] **LCK-03**: The overlay unlocks on any valid staff PIN — not necessarily the PIN of the staff
  member who was active before idling. The active session's identity does not change on unlock; this
  is a screen lock, not a re-login or role switch.

- [x] **LCK-04**: Both the lock event and the unlock event are written to `audit_logs`, each recording
  which staff member was the active session owner and, for unlock, which staff member's PIN unlocked
  it (may differ from the session owner).

## v1.8 Requirements — Admin PIN Reset (Server-Side Recovery Path)

Milestone goal: a manager/admin can reset a staff member's PIN from the Staff page even when that
staff member has genuinely forgotten it and cannot log in at all — closing a real recovery gap with
no in-app path today (`force_pin_change` requires the staff member to already know their current
PIN to log in first). Captured via `/gsd-explore` 2026-08-31 after two real PIN-sync production
incidents on the Vinty Owner account (see `.planning/notes/vinty-owner-login-outage-rca.md`).
Requirement IDs formalized from `.planning/phases/22-admin-pin-reset-server-side-recovery-path/22-CONTEXT.md`'s
locked decisions D-01..D-08 during `/gsd-plan-phase 22` — no formal SPEC.md exists for this phase.

### Admin PIN Reset

- [ ] **PINRST-01**: Only a staff member with role `admin` can call the PIN-reset edge function; the admin can target any staff member, including other admins. A non-admin caller (or an unauthenticated request) is rejected server-side before any credential write happens.
- [ ] **PINRST-02**: The admin enters a specific new 6-digit PIN for the target staff member in the reset dialog — the system never generates the PIN itself, matching the existing Add Staff flow's PIN-entry UX.
- [ ] **PINRST-03**: The acting admin must re-enter their own PIN (via the reused `ManagerPinDialog`) immediately before the reset fires, in addition to their existing admin session — a confirm-before-fire gate on this privileged cross-account write.
- [ ] **PINRST-04**: A successful reset always sets `profiles.must_change_pin = true`; the staff member logs in once with the admin-set PIN, then is forced through the existing forced-change screen to pick their own PIN, matching `create-staff`/`force-pin-change` precedent.
- [ ] **PINRST-05**: "Force PIN Change" stays an unmodified, separate action; "Reset PIN" is a new, additional action on the Staff page for the case where the staff member cannot log in at all.
- [ ] **PINRST-06**: Reset is rejected server-side for a target whose `profiles.is_active` is `false`, independent of whether the current UI can produce that row.
- [ ] **PINRST-07**: The reset dialog shows a non-blocking warning when the entered PIN matches another active staff member's current PIN — advisory only, never blocking submit.
- [ ] **PINRST-08**: An admin can use Reset PIN on their own staff row with no special-case block — the same code path applies whether the target is the caller or any other staff member.

## v2 Requirements

Deferred to future release. Tracked but not in the v1.2 roadmap.

### Receipt Delivery

- **RCP-05**: Full outbound transactional email service beyond the existing Resend integration (templates, delivery-status tracking, bounce handling) — only if the store owner explicitly asks for more than PDF/print/existing-email coverage.

### AI Invoice Intake (v2/Beta, carried over from v1.1)

- **AI-01..05**: Extend the existing vision pipeline from name+price extraction to full invoice line items (qty/cost/supplier/expiry). Still v2/Beta scope, unchanged from Alpha.

### Receipt Designer + Inventory Expansion (deferred pieces from v1.3)

- Partial PO receiving / backorder remainder tracking — add once the full-receive PO flow (PO-03) is proven in daily use and short-shipments are observed often enough to justify it.
- Category-level shrinkage/turnover breakdown — cheap add once the store-level reports (INVR-02..04) exist and the owner asks for it.
- Locale-aware custom receipt field labels beyond the existing `receipt` i18n namespace — defer until a genuine bilingual-printing need surfaces.
- Trend view (week-over-week/month-over-month) for valuation/shrinkage/turnover — defer until the point-in-time reports have been used for at least a month.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Confirmation dialog on every scanned item | Directly regresses the stated "fast checkout" core value — doubles clicks per item on a multi-item basket; scope is mismatch-only (VER-01) |
| Barcode-scanner checksum re-validation in software | HID scanners already validate checksums (EAN-13/UPC-A) in firmware — re-implementing in the app solves an already-solved problem |
| Per-user rate limiting / cost dashboard for `agent-proxy` | Enterprise/multi-tenant scope; a static `max_tokens`/body-size cap (SEC-04) is sufficient for a 1-2 terminal single store |
| New outbound transactional email service beyond existing Resend integration | Would be a new external dependency/API surface; the existing `send-receipt-email` (Resend) path already covers email, PDF (RCP-03) extends it rather than replacing it |
| Counter/hanging scale hardware integration | Explicitly deferred to a future milestone if loose-weight items prove significant after Alpha usage (unchanged from v1.0/v1.1) |
| Multi-location/multi-warehouse support | Single store only — unchanged from prior milestones |
| Freeform drag-and-drop/pixel-canvas receipt builder | An 80mm thermal receipt is a fixed-width linear text/bitmap surface — a 2D canvas engine solves a problem that doesn't exist here; field toggles + live preview (RCPD-01) gets 95% of the value at a fraction of the maintenance cost |
| Custom fonts / rich typography on receipts | ESC/POS thermal printers only support built-in bitmap fonts + bold/double-height/width toggles; true custom fonts require rendering every line as an image |
| Multiple receipt templates per terminal/register | v1.1 (D-04) already made `receipt_settings` a deliberate store-wide singleton for this 1-2 terminal store; reopening that is scope creep with no real user behind it |
| Auto-PO generation / demand forecasting | Explicitly out of scope per PROJECT.md — forecasting accuracy on one store's noisy sales data is unreliable; PO-02's low-stock-seeded, manually-triggered draft gives the automation feeling without unattended ordering |
| Multi-level PO approval workflow | No organizational hierarchy to approve against (one owner/admin, maybe one manager) — an approval gate with no approver is dead UI |
| Multi-supplier price comparison / auto-routing | Requires maintaining live cross-supplier pricing and a comparison engine — real complexity the project's own scope discipline (no supplier scorecards) already rules out |
| EDI / API integration to auto-send POs to suppliers | This store's suppliers (small Indian grocery importers) don't run EDI-capable systems — building integration plumbing for a non-existent recipient is pure waste |
| FIFO/weighted-average COGS valuation engine | PROJECT.md explicitly excludes FIFO/FEFO costing engines; INVR-01 uses the product's existing weighted-average cost, which is sufficient for a single-store valuation report |
| AI/ML-driven shrinkage root-cause classification | Speculative machinery with no training data for this store; INVR-02's manual-reason-code rollup already gives 90% of the diagnostic value |
| Live/real-time-subscribed valuation & shrinkage dashboards | These are backward-looking, load-on-open reports (same pattern as the existing Reports page), not operational screens — Realtime subscriptions add complexity for no behavioral benefit |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-03 | Phase 11 (v1.2, paused) | Pending |
| SEC-04 | Phase 11 (v1.2, paused) | Pending |
| VER-01 | Phase 12 (v1.2, paused) | Complete |
| VER-02 | Phase 12 (v1.2, paused) | Complete |
| RCP-01 | Phase 13 (v1.2, paused) | Complete |
| RCP-02 | Phase 13 (v1.2, paused) | Complete |
| RCP-03 | Phase 13 (v1.2, paused) | Complete |
| RCP-04 | Phase 13 (v1.2, paused) | Complete |
| RCPD-01 | Phase 15 (v1.3) | Complete |
| RCPD-02 | Phase 15 (v1.3) | Complete |
| PO-01 | Phase 16 (v1.3) | Complete |
| PO-02 | Phase 16 (v1.3) | Complete |
| PO-03 | Phase 16 (v1.3) | Complete |
| INVR-01 | Phase 14 (v1.3) | Complete |
| INVR-02 | Phase 14 (v1.3) | Complete |
| INVR-03 | Phase 14 (v1.3) | Complete |
| INVR-04 | Phase 14 (v1.3) | Complete |
| TEST-01 | Phase 17 (v1.3) | Complete |
| TEST-02 | Phase 17 (v1.3) | Complete |
| TEST-03 | Phase 17 (v1.3) | Complete |
| TEST-04 | Phase 17 (v1.3) | Complete |
| PEEK-01 | Phase 18 (v1.4) | Complete |
| PEEK-02 | Phase 18 (v1.4) | Complete |
| PEEK-03 | Phase 18 (v1.4) | Complete |
| PEEK-04 | Phase 18 (v1.4) | Complete |
| PRN-01 | Phase 19 (v1.5, proposed) | Complete |
| PRN-02 | Phase 19 (v1.5, proposed) | Complete |
| PRN-03 | Phase 19 (v1.5, proposed) | Complete |
| PRN-04 | Phase 19 (v1.5, proposed) | Complete |
| PRN-05 | Phase 19 (v1.5, proposed) | Complete |
| PRN-06 | Phase 19 (v1.5, proposed) | Complete |
| PRN-07 | Phase 19 (v1.5, proposed) | Complete |
| DEP-01 | Phase 20 (v1.6) | Complete |
| DEP-02 | Phase 20 (v1.6) | Complete |
| DEP-03 | Phase 20 (v1.6) | Complete |
| DEP-04 | Phase 20 (v1.6) | Complete |
| LCK-01 | Not yet roadmapped (v1.7) | Complete |
| LCK-02 | Not yet roadmapped (v1.7) | Complete |
| LCK-03 | Not yet roadmapped (v1.7) | Complete |
| LCK-04 | Not yet roadmapped (v1.7) | Complete |
| PINRST-01 | Phase 22 (v1.8) | Gaps Found |
| PINRST-02 | Phase 22 (v1.8) | Gaps Found |
| PINRST-03 | Phase 22 (v1.8) | Gaps Found |
| PINRST-04 | Phase 22 (v1.8) | Gaps Found |
| PINRST-05 | Phase 22 (v1.8) | Gaps Found |
| PINRST-06 | Phase 22 (v1.8) | Gaps Found |
| PINRST-07 | Phase 22 (v1.8) | Gaps Found |
| PINRST-08 | Phase 22 (v1.8) | Gaps Found |

**Coverage:**

- v1.2 requirements (paused, Phase 11 discussion-only): 8 total, 8/8 mapped
- v1.3 requirements: 13 total, 13/13 mapped (Phase 14: INVR-01..04, Phase 15: RCPD-01/02, Phase 16: PO-01..03, Phase 17: TEST-01..04)
- v1.4 requirements: 4 total, 4/4 mapped (Phase 18: PEEK-01..04)
- v1.5 proposed requirements: 7 total, 7/7 mapped to Phase 19
- v1.6 proposed requirements: 4 total, 4/4 mapped to Phase 20
- v1.7 proposed requirements: 4 total, 0/4 mapped (not yet roadmapped)
- v1.8 requirements: 8 total, 8/8 mapped to Phase 22 (PINRST-01..08)

---
*Requirements defined: 2026-08-19 (v1.2), 2026-08-19 (v1.3)*
*Last updated: 2026-08-31 — Phase 22 (Admin PIN Reset) requirements formalized during `/gsd-plan-phase 22` from CONTEXT.md D-01..D-08 (no formal SPEC.md for this phase); PINRST-01..08 added, traceability mapped 8/8*
