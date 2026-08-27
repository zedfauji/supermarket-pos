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

- [ ] **PEEK-01**: Scanning a barcode on `/pos` opens a separate Tauri OS window (not a modal/overlay in the main window) showing the matched product's name, size/unit (kg/g/L/piece), photo, price, current inventory, SKU, and barcode.
- [x] **PEEK-02**: The peek window includes a quantity/weight input (matching the product's unit type — piece count or loose-weight amount) that the cashier sets before adding to cart, and reuses the existing out-of-stock and near-expiry checkout guards rather than a duplicate guard implementation.
- [x] **PEEK-03**: The peek window offers "Add to Cart" (adds the entered qty/weight to the active `/pos` cart and closes the window) and "Close" (dismisses without adding anything).
- [x] **PEEK-04**: While the peek window is open, scanning a different barcode replaces its content with the newly scanned product (no manual close needed first); the main `/pos` window's existing scan-to-search behavior continues to fire on the same scan independently.

Scope note: v1 is `/pos`-only. Rollout to other screens (global scan trigger) is deferred — see seed `barcode-peek-global-rollout`.

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

**Coverage:**

- v1.2 requirements (paused, Phase 11 discussion-only): 8 total, 8/8 mapped
- v1.3 requirements: 13 total, 13/13 mapped (Phase 14: INVR-01..04, Phase 15: RCPD-01/02, Phase 16: PO-01..03, Phase 17: TEST-01..04)

---
*Requirements defined: 2026-08-19 (v1.2), 2026-08-19 (v1.3)*
*Last updated: 2026-08-26 — Phase 17 (E2E Suite Overhaul) complete: TEST-01..04 all closed (17-01..17-17), traceability mapped 13/13*
