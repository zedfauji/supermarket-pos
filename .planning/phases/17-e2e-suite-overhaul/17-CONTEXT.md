# Phase 17: E2E Suite Overhaul - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

The Playwright E2E suite (`e2e/*.spec.ts`, currently 50 files) is audited and rewritten so it: (1) contains zero references to stripped bar-pos domain concepts (pool tables, Rappi, KDS, waitlist, combos, recipes/ingredients, promotions, tip distribution — all removed from the app in Phase 1 but still present in at least 10 current spec files including `e2e/helpers/supabase.ts`), (2) gives comprehensive automated coverage of every current supermarket-pos feature/component/user flow/integration/DB transaction, seeded with realistic Indian grocery products, (3) runs headless by default and fast, against agent-browser's bundled Chrome-for-Testing binary instead of the unstable system Chrome, and (4) has an opt-in Playwright UI-mode dashboard for live monitoring.

This phase does not touch: the app's currency/locale system, RLS policy design (only adds representative E2E-level checks), the unit tests (`src/**/*.test.ts`), or `test:e2e:visual`'s separate config.

</domain>

<decisions>
## Implementation Decisions

### Indian Product Test Data
- **D-01:** Real seed data overhaul — replace the current Spanish bar-food seed data (`supabase/seed.sql`, `scripts/seed-dev-data.ts`) with Indian grocery products end to end, so dev environment, manual testing, and E2E all share one source of truth. — **Reversibility:** costly — touches every spec that queries products by name/category, plus any dev-environment manual testing habits built around the old catalog.
- **D-02:** Representative catalog, ~30-50 SKUs, covering every category from CLAUDE.md's product description (masalas, atta/rice/dals, snacks, pickles/papads, ghee/oil, tea/coffee, frozen, sweets), 3-6 realistic SKUs per category, realistic ₹-shaped naming/branding but **existing currency/locale formatting is unchanged** (D-03) — real-looking barcodes/EANs.
- **D-03:** Currency/locale untouched — fixtures get Indian product names/categories only; `MoneyDisplay`/`MoneyInput` and es-MX/en-US formatting are out of scope for this phase.
- **D-04:** Main catalog is packaged goods only (single barcoded unit) — no case→piece or loose-weight items in the general 30-50 SKU set.
- **D-05:** `e2e/49-open-units.spec.ts` (case→piece) and `e2e/52-loose-weight-hold-sale.spec.ts` (kg/g) keep using whatever non-Indian/generic fixtures they currently need for unit-type mechanics — not blocked on or required to use the Indian catalog.

### Rewrite Scope & Organization
- **D-06:** Re-architect from the flat numbered convention (`e2e/01-*.spec.ts` … `e2e/61-*.spec.ts`) into feature/domain folders (e.g. `e2e/checkout/`, `e2e/inventory/`, `e2e/payments/`, `e2e/suppliers/`, `e2e/reports/`, `e2e/rbac/`, `e2e/receipts/`, `e2e/purchase-orders/`, etc. — exact folder boundaries are planner's call). — **Reversibility:** costly — every file path, CI reference, and doc mention changes at once; worth getting the folder taxonomy right before executing broadly.
- **D-07:** Within each folder, spec files use descriptive names with no numeric prefix (e.g. `e2e/checkout/happy-path.spec.ts`, `e2e/checkout/ambiguous-scan.spec.ts`).
- **D-08:** Spec files that test genuinely bar-pos-only surfaces (routes/tables that no longer exist in the app: `/pool-tables`, `/rappi`, `/kitchen-prep`, `/waitlist`, `pool_tables`/`resources`/`rappi_orders`/`ingredients`/`recipe_items` tables) are **deleted outright**, not skipped/quarantined. Git history preserves them if ever needed.
- **D-09:** CLAUDE.md's E2E Test Suite section (currently lists all 50 files flat) is rewritten to document the new folder structure as part of this phase — not deferred to a follow-up.

### DB-Transaction Verification Depth
- **D-10:** Every state-changing flow (checkout, refund, stock adjustment, PO receive/create, caja open/close/entry, supplier receiving, reopen/edit-paid-tab, staff clock-in/out) gets a direct DB assertion via service-role client (e.g. `inventory_log` row with correct delta/reason, order/payment row correctness, `audit_logs` entry present) **in addition to** the UI assertion. Read-only flows (reports, list views) stay UI-only.
- **D-11:** For the app's atomic RPCs (`process_direct_sale_atomic`, `receive_shipment`, `process_refund`, `close_caja_session`, and any others planning identifies), add at least one forced-failure test per RPC proving no partial writes land — happy-path end state alone is not sufficient coverage for these.
- **D-12:** DB-assertion helpers live in a shared module (extend `e2e/helpers/supabase.ts`, or a new `e2e/helpers/db-assertions.ts` — planner's call) rather than being written inline per spec, to avoid duplicating Supabase query boilerplate across the rewritten suite.
- **D-13:** Include representative RLS-boundary checks at the E2E layer too (e.g. a cashier-role client session blocked from a manager-only mutation), even though this overlaps with `src/**/*.integration.test.ts` coverage — belt-and-suspenders was the explicit choice over treating it as fully out-of-scope.

### Speed & Parallelization
- **D-14:** Keep serial execution (`workers: 1`, `fullyParallel: false`) — do NOT redesign fixtures for per-test isolation/parallel workers in this phase. Speed gains come from trimming individual specs, not from parallelizing the run. (If a future phase revisits this, `workers: undefined` (auto-detect) was the stated preference over a fixed count.)
- **D-15:** Switch `trace`/`video`/`screenshot` from unconditional `'on'` to failure-only (`trace: 'on-first-retry'` or `'retain-on-failure'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`) — standard Playwright speed practice, full debugging artifacts preserved exactly when a test fails.
- **D-16:** `playwright.config.ts`'s browser launch switches from `channel: 'chrome'` to `launchOptions.executablePath` pointed at agent-browser's bundled Chrome-for-Testing binary. Path is **auto-detected** at config load time (glob `~/.agent-browser/browsers/chrome-*/chrome`, pick the highest version) rather than hardcoded, so it stays correct as agent-browser upgrades itself. Note: `~` must resolve via `os.homedir()`, not a literal string, since this must work for any developer's home directory, not just the current machine's `/home/widowsvail`.
- **D-17:** Default `npm run test:e2e` stays headless (unchanged). Add an opt-in script (e.g. `test:e2e:ui`) that launches Playwright UI mode (`playwright test --ui`) for live pass/fail/timeline monitoring — this satisfies the "expose the dashboard to monitor execution" requirement without changing default behavior.

### Claude's Discretion
- Exact folder taxonomy under `e2e/` (D-06) — planner should propose a concrete folder list mapped against the current 50 files plus any new coverage gaps found during audit.
- Exact new spec files needed to close coverage gaps ("every feature/component/flow/integration/DB transaction") — this requires the planner/researcher to enumerate current FSD `features/`/`widgets/`/`entities/` against existing spec coverage and produce a gap list; not fully enumerable during discussion.
- Whether DB-assertion helpers extend `e2e/helpers/supabase.ts` or land in a new file (D-12).
- Precise Indian product SKU list (D-02) — names, categories, barcodes; planner/executor authors the actual fixture data.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & testing policy
- `CLAUDE.md` §"UAT / Verification: automate it, never ask the user to click through" — Playwright-only verification policy, headless-by-default mandate
- `CLAUDE.md` §"E2E Test Suite" — current (soon-to-be-stale) flat list of 50 spec files, needs rewriting per D-09
- `.planning/decisions/2026-08-07-mandatory-automated-testing-no-manual-verification.md` — full rationale for the no-manual-UAT policy this phase must keep honoring
- `.planning/PROJECT.md` — product description confirming the Indian grocery catalog categories used for D-02

### Existing E2E infrastructure (read before touching)
- `playwright.config.ts` — current config: `channel: 'chrome'` (to be replaced per D-16), `trace/video/screenshot: 'on'` (to be changed per D-15), `workers: 1`/`fullyParallel: false` (kept per D-14), `FAST_E2E` env toggle already exists and should be respected
- `e2e/fixtures.ts` — the `test`/`expect` wrapper every spec imports from `./fixtures` (or relative path after restructuring) — tails browser console/pageerror and fails on uncaught exceptions
- `e2e/helpers/auth.ts` — `loginAs`/`loginAsNamed`/`logout`, locale-aware (es-MX cold-start, matches both locales via regex) — reuse as-is
- `e2e/helpers/supabase.ts` — `resetTestState()`, `openCaja()`, and various seed/cleanup helpers; contains confirmed bar-pos remnants (`pool_tables` rename comment, `ingredients`/`recipe_items` cleanup, `rappi_orders` seeding) that must be removed per D-08's spirit even though this file itself isn't a `.spec.ts`
- `e2e/global-teardown.ts` — referenced by `playwright.config.ts`, check for bar-pos remnants too

### Confirmed bar-pos-domain files needing audit/deletion (D-08)
- `e2e/07-reports.spec.ts`, `e2e/09-rbac.spec.ts`, `e2e/15-home-navigation.spec.ts`, `e2e/17-payment-pane.spec.ts`, `e2e/18-modifier-notes-kds.spec.ts`, `e2e/20-error-scenarios.spec.ts`, `e2e/20-sprint2-revenue.spec.ts`, `e2e/23-payment-edge-cases.spec.ts`, `e2e/visual/45-visual-baseline.spec.ts` — each confirmed via grep to reference `pool_tables`, `/pool-tables`, `/rappi`, `/kitchen-prep`, `/waitlist`, `combo_eligible`, `is_combo`, or promotions banners
- Note: `e2e/visual/45-visual-baseline.spec.ts` runs under `playwright.visual.config.ts` (`npm run test:e2e:visual`), a separate config from the main suite — confirm with planner whether it's in this phase's scope or a companion follow-up

### agent-browser (D-16)
- `agent-browser skills get core --full` (CLI command, not a file) — agent-browser's own usage guide; confirmed installed at `~/.nvm/versions/node/v24.18.0/bin/agent-browser` v0.33.0, browsers at `~/.agent-browser/browsers/chrome-<version>/chrome`
- Confirmed: agent-browser is a standalone CDP-based CLI tool for AI agents driving a browser live ("no Playwright or Puppeteer dependency") — it is NOT used as the test runner. Only its bundled Chrome-for-Testing binary is reused, via `executablePath`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `e2e/fixtures.ts` — console/pageerror tailing wrapper, keep as the base `test` export regardless of folder restructuring
- `e2e/helpers/auth.ts` — role-based login helpers, locale-aware, no changes needed
- Existing atomic RPC pattern (`process_direct_sale_atomic`, `receive_shipment`, `process_refund`, `close_caja_session`) — DB-transaction tests (D-10/D-11) hook into these directly

### Established Patterns
- `page.route()` network interception already used extensively (e.g. `e2e/18-modifier-notes-kds.spec.ts`) for self-contained tests that don't need DB mutations — worth preserving where it doesn't conflict with the new DB-assertion requirement (D-10)
- Service-role Supabase client pattern already exists in `e2e/helpers/supabase.ts` for seed/cleanup — D-12's new DB-assertion helpers should follow the same client-construction pattern

### Integration Points
- `playwright.config.ts`'s `projects: [{ name: 'chromium', use: { channel: 'chrome', ... } }]` is the single point of change for D-16 (executablePath + auto-detect glob)
- `package.json`'s `test:e2e*` scripts are the point of change for D-17 (new `test:e2e:ui` script)

</code_context>

<specifics>
## Specific Ideas

No additional specific UI/behavior references beyond the decisions above — the user's original framing ("evaluate all specs, remove bar-pos ones, add comprehensive coverage with Indian products, headless+fast, agent-browser instead of chrome, optional dashboard") is fully captured in D-01 through D-17.

</specifics>

<deferred>
## Deferred Ideas

- Full i18n/currency support for INR (₹) formatting — considered during discussion, explicitly deferred (D-03); no phase scoped yet.
- Case→piece and loose-weight variants for the Indian product catalog itself (beyond the two specs that already need unit-type fixtures) — considered, explicitly deferred (D-04/D-05).
- Parallel-worker execution (`fullyParallel: true`) — considered as the biggest speed lever, explicitly deferred (D-14); would require a follow-up phase to redesign fixture isolation.
- Other bar-pos-era dead code discovered during codebase scan but outside this phase's `e2e/*.spec.ts` boundary: `scripts/seed-combos.ts`, `scripts/seed-prep.ts` (bar-pos combo/prep concepts, likely fully dead) — flagged for a future cleanup phase, not touched here except where `scripts/seed-dev-data.ts` itself is overhauled per D-01 (which may naturally obsolete these two if they're only invoked from it — planner to confirm).

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 17-e2e-suite-overhaul*
*Context gathered: 2026-08-25*
