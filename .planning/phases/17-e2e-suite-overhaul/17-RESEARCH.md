# Phase 17: E2E Suite Overhaul - Research

**Researched:** 2026-08-25
**Domain:** Playwright E2E test suite audit/rewrite, test-fixture data authoring, Playwright config (browser launch, artifact capture), CI/report tooling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Indian Product Test Data**
- **D-01:** Real seed data overhaul — replace the current Spanish bar-food seed data (`supabase/seed.sql`, `scripts/seed-dev-data.ts`) with Indian grocery products end to end, so dev environment, manual testing, and E2E all share one source of truth. — **Reversibility:** costly — touches every spec that queries products by name/category, plus any dev-environment manual testing habits built around the old catalog.
- **D-02:** Representative catalog, ~30-50 SKUs, covering every category from CLAUDE.md's product description (masalas, atta/rice/dals, snacks, pickles/papads, ghee/oil, tea/coffee, frozen, sweets), 3-6 realistic SKUs per category, realistic ₹-shaped naming/branding but existing currency/locale formatting is unchanged (D-03) — real-looking barcodes/EANs.
- **D-03:** Currency/locale untouched — fixtures get Indian product names/categories only; `MoneyDisplay`/`MoneyInput` and es-MX/en-US formatting are out of scope for this phase.
- **D-04:** Main catalog is packaged goods only (single barcoded unit) — no case→piece or loose-weight items in the general 30-50 SKU set.
- **D-05:** `e2e/49-open-units.spec.ts` (case→piece) and `e2e/52-loose-weight-hold-sale.spec.ts` (kg/g) keep using whatever non-Indian/generic fixtures they currently need for unit-type mechanics — not blocked on or required to use the Indian catalog.

**Rewrite Scope & Organization**
- **D-06:** Re-architect from the flat numbered convention (`e2e/01-*.spec.ts` … `e2e/61-*.spec.ts`) into feature/domain folders (e.g. `e2e/checkout/`, `e2e/inventory/`, `e2e/payments/`, `e2e/suppliers/`, `e2e/reports/`, `e2e/rbac/`, `e2e/receipts/`, `e2e/purchase-orders/`, etc. — exact folder boundaries are planner's call). — **Reversibility:** costly — every file path, CI reference, and doc mention changes at once; worth getting the folder taxonomy right before executing broadly.
- **D-07:** Within each folder, spec files use descriptive names with no numeric prefix (e.g. `e2e/checkout/happy-path.spec.ts`, `e2e/checkout/ambiguous-scan.spec.ts`).
- **D-08:** Spec files that test genuinely bar-pos-only surfaces (routes/tables that no longer exist in the app: `/pool-tables`, `/rappi`, `/kitchen-prep`, `/waitlist`, `pool_tables`/`resources`/`rappi_orders`/`ingredients`/`recipe_items` tables) are deleted outright, not skipped/quarantined. Git history preserves them if ever needed.
- **D-09:** CLAUDE.md's E2E Test Suite section (currently lists all 50 files flat) is rewritten to document the new folder structure as part of this phase — not deferred to a follow-up.

**DB-Transaction Verification Depth**
- **D-10:** Every state-changing flow (checkout, refund, stock adjustment, PO receive/create, caja open/close/entry, supplier receiving, reopen/edit-paid-tab, staff clock-in/out) gets a direct DB assertion via service-role client (e.g. a stock-movement row with correct delta/reason, order/payment row correctness, audit_logs entry present) in addition to the UI assertion. Read-only flows (reports, list views) stay UI-only.
- **D-11:** For the app's atomic RPCs (`process_direct_sale_atomic`, `receive_shipment`, `process_refund`, `close_caja_session`, and any others planning identifies), add at least one forced-failure test per RPC proving no partial writes land — happy-path end state alone is not sufficient coverage for these.
- **D-12:** DB-assertion helpers live in a shared module (extend `e2e/helpers/supabase.ts`, or a new `e2e/helpers/db-assertions.ts` — planner's call) rather than being written inline per spec, to avoid duplicating Supabase query boilerplate across the rewritten suite.
- **D-13:** Include representative RLS-boundary checks at the E2E layer too (e.g. a cashier-role client session blocked from a manager-only mutation), even though this overlaps with `src/**/*.integration.test.ts` coverage — belt-and-suspenders was the explicit choice over treating it as fully out-of-scope.

**Speed & Parallelization**
- **D-14:** Keep serial execution (`workers: 1`, `fullyParallel: false`) — do NOT redesign fixtures for per-test isolation/parallel workers in this phase. Speed gains come from trimming individual specs, not from parallelizing the run. (If a future phase revisits this, `workers: undefined` (auto-detect) was the stated preference over a fixed count.)
- **D-15:** Switch `trace`/`video`/`screenshot` from unconditional `'on'` to failure-only (`trace: 'on-first-retry'` or `'retain-on-failure'`, `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`) — standard Playwright speed practice, full debugging artifacts preserved exactly when a test fails.
- **D-16:** `playwright.config.ts`'s browser launch switches from `channel: 'chrome'` to `launchOptions.executablePath` pointed at agent-browser's bundled Chrome-for-Testing binary. Path is auto-detected at config load time (glob `~/.agent-browser/browsers/chrome-*/chrome`, pick the highest version) rather than hardcoded, so it stays correct as agent-browser upgrades itself. Note: `~` must resolve via `os.homedir()`, not a literal string.
- **D-17:** Default `npm run test:e2e` stays headless (unchanged). Add an opt-in script (e.g. `test:e2e:ui`) that launches Playwright UI mode (`playwright test --ui`) for live pass/fail/timeline monitoring — this satisfies the "expose the dashboard to monitor execution" requirement without changing default behavior.

### Claude's Discretion
- Exact folder taxonomy under `e2e/` (D-06) — planner should propose a concrete folder list mapped against the current 50 files plus any new coverage gaps found during audit.
- Exact new spec files needed to close coverage gaps ("every feature/component/flow/integration/DB transaction") — this requires the planner/researcher to enumerate current FSD `features/`/`widgets/`/`entities/` against existing spec coverage and produce a gap list; not fully enumerable during discussion.
- Whether DB-assertion helpers extend `e2e/helpers/supabase.ts` or land in a new file (D-12).
- Precise Indian product SKU list (D-02) — names, categories, barcodes; planner/executor authors the actual fixture data.

### Deferred Ideas (OUT OF SCOPE)
- Full i18n/currency support for INR (₹) formatting — considered during discussion, explicitly deferred (D-03); no phase scoped yet.
- Case→piece and loose-weight variants for the Indian product catalog itself (beyond the two specs that already need unit-type fixtures) — considered, explicitly deferred (D-04/D-05).
- Parallel-worker execution (`fullyParallel: true`) — considered as the biggest speed lever, explicitly deferred (D-14); would require a follow-up phase to redesign fixture isolation.
- Other bar-pos-era dead code discovered during codebase scan but outside this phase's `e2e/*.spec.ts` boundary: `scripts/seed-combos.ts`, `scripts/seed-prep.ts` — flagged for a future cleanup phase. **Research confirms these are orphaned, not called from `scripts/seed-dev-data.ts` or any `package.json` script** [VERIFIED: `grep -rln "seed-combos\|seed-prep" scripts/ package.json` returns only the two files themselves] — D-01's rewrite of `seed-dev-data.ts` will NOT obsolete them; they remain dead weight requiring separate deletion in a later phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

These IDs are new — not yet in REQUIREMENTS.md. Draft entries below for the planner/roadmap owner to place (v1.3 milestone, Phase 17).

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Audit all 50 existing `e2e/*.spec.ts` files (49 in `e2e/`, 1 in `e2e/visual/`); delete/rewrite every test asserting against dropped bar-pos schema/routes/domain | Fresh audit below supersedes CONTEXT.md's 9-file list with a verified 13-file + 2-helper-file list (Common Pitfalls, "Confirmed Bar-Pos Audit Findings") |
| TEST-02 | Comprehensive coverage — every current feature/component/user workflow/integration/DB transaction, using realistic Indian grocery product fixtures with scenario + edge-case coverage | FSD inventory (Architecture Patterns) enumerates 39 `features/`, 27 `widgets/`, 14 `entities/`, 13 `pages/` to cross-reference against the current 50 specs during planning |
| TEST-03 | `playwright.config.ts` launches against agent-browser's bundled Chrome-for-Testing binary via `launchOptions.executablePath`, auto-detected, not hardcoded | Confirmed binary layout + version-selection snippet (Code Examples) |
| TEST-04 | Default `npm run test:e2e` stays headless and fast; add opt-in `test:e2e:ui` for Playwright UI mode | Trivial `package.json` script addition (Code Examples) |
</phase_requirements>

## Summary

This phase has almost no new-library research surface — the stack (Playwright 1.59.1 [VERIFIED: `npm ls @playwright/test`], `@playwright/test` as runner, Supabase JS client for DB assertions) is already fully in place and does not change. The work is a large, mechanical **audit-and-rewrite** of existing test files plus one config change (browser launch target) and one script addition (UI-mode opt-in). The real research value here was reading the actual current-state files rather than trusting CONTEXT.md's discussion-time snapshot, which is 24h+ stale on two material points: (1) the confirmed bar-pos-file list is now 13 spec files + 2 non-spec helper files (`e2e/helpers/supabase.ts`, `e2e/global-teardown.ts`), not the 9 files CONTEXT.md names — three new specs shipped in Phases 15/16 (`56-purchase-orders`, `57-suppliers-loading-error`, `58-entity-id-crosslink`) plus files that existed at discussion time were not fully re-grepped; and (2) the app's stock-movement ledger table is actually named `stock_movements` in the live schema, not `inventory_log` as CLAUDE.md and CONTEXT.md's own D-10 phrasing assume — a name every new D-10 DB-assertion helper must get right or it 404s against a nonexistent table.

Three findings materially change the shape of the plan the planner should write: (1) `e2e/global-teardown.ts`'s `VERIFICATION_REPORT.md` generator keys its suite grouping off a hardcoded 26-entry regex map matching the *current* flat numeric filenames (`^01-ci`, `^02-caja`, …) — D-06's folder restructure will silently collapse every rewritten spec into an "Other" bucket unless this map is rewritten alongside the restructure. (2) `e2e/14-manual-stubs.spec.ts` is four `test.skip(true, 'Manual: ...')` stubs — a direct, in-repo violation of this project's own CLAUDE.md testing policy ("no manual/human execution tests"), sitting undetected in the suite; three of its four stubs already reference an automatable equivalent in their own skip message. (3) `e2e/18-modifier-notes-kds.spec.ts` and `e2e/49-receipt-category-grouping.spec.ts` are not simple "genuinely bar-pos-only" deletions per D-08's own criterion — both mix dead KDS-board assertions (delete) with still-live modifier-sheet/receipt-category-grouping coverage (real features, still wired into checkout) that needs Indian-grocery-appropriate fixtures, not deletion.

**Primary recommendation:** Treat this as an audit-first, then-restructure, then-fill-gaps sequence: (1) resolve the corrected bar-pos-file list and the modifier/KDS-hybrid-file split before touching folder structure; (2) do the D-06/D-07 file moves + `global-teardown.ts` SUITE_MAP rewrite as one atomic pass (renames are cheap to get right together, expensive to reconcile piecemeal); (3) land the Indian-grocery seed-data rewrite (D-01/D-02) before any spec that asserts on product names/categories, since nearly every rewritten spec depends on it; (4) add the `playwright.config.ts` changes (D-15/D-16/D-17) and `e2e/helpers/db-assertions.ts` (D-12) as an independent, parallelizable wave — neither touches spec content directly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spec file content (assertions, fixtures, flows) | Browser / Client (E2E test) | Database / Storage (DB assertions per D-10) | Playwright drives the real Tauri/Vite webview; DB assertions read/write Postgres directly via service-role client, bypassing the UI |
| Browser launch target (D-16) | Test runner config (`playwright.config.ts`) | — | Pure Playwright config concern — no app-tier code involved |
| Seed/fixture data (D-01/D-02) | Database / Storage | Browser / Client (consumed by every spec) | `scripts/seed-dev-data.ts` writes directly to Supabase via service-role client; specs read the resulting rows through the UI and through direct queries |
| DB-assertion helpers (D-12) | Database / Storage | — | Thin wrapper over `@supabase/supabase-js` service-role client, no app-tier dependency |
| RLS-boundary checks (D-13) | API / Backend (RLS policies under test) | Browser / Client (test harness) | The assertion target is Postgres RLS; the harness is either a raw Supabase client (mirroring existing `*.integration.test.ts` pattern) or a logged-in browser session |
| CI/report tooling (`global-teardown.ts`) | Build tool / Node script | — | Runs post-suite in Node, not the browser or the app |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@playwright/test` | 1.59.1 [VERIFIED: `npm ls @playwright/test` / `node_modules/@playwright/test/package.json`] | E2E test runner (unchanged — TEST-03 explicitly keeps this) | Already the project's runner; no reason to change |
| `@supabase/supabase-js` | already a dependency (used throughout `e2e/helpers/supabase.ts`, `scripts/seed-dev-data.ts`) | Service-role DB assertions/seeding (D-10/D-12) | Same client already used for every existing DB-touching helper — reuse, don't add a second client library |

### Supporting
No new supporting libraries are needed. `node:fs` (`readdirSync`) and `node:os` (`homedir`) — both stdlib — are sufficient for D-16's version-glob logic; the codebase already depends on `glob@^13.0.6` [VERIFIED: `package.json:125`] but stdlib `readdirSync` + string sort is simpler for this one flat-directory listing and avoids a glob-pattern dependency for a problem that's really "list two known directory names and pick the higher version string."

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `readdirSync` + manual version sort for D-16 | The already-installed `glob` package | `glob` is overkill for listing one flat directory's immediate children — stdlib wins per the project's own simplicity bar; only reach for `glob` if agent-browser's install layout gets deeper/less predictable |
| Playwright's native Chromium/`channel: 'chrome'` | agent-browser's bundled Chrome-for-Testing binary via `executablePath` (locked, D-16) | Locked by CONTEXT.md — system Chrome (`channel: 'chrome'`) has proven unstable in this environment; agent-browser's CfT binary is version-pinned and doesn't drift with OS Chrome auto-updates |

**Installation:** None — no new packages for this phase.

**Version verification:** `@playwright/test@1.59.1` confirmed installed via `npm ls @playwright/test` [VERIFIED: npm registry]. `playwright.visual.config.ts` (separate, out-of-scope config) already omits `channel` entirely and uses Playwright's own bundled Chromium via `projects: [{ name: 'chromium', use: {} }]` [VERIFIED: `playwright.visual.config.ts:36`] — confirms the main config's `channel: 'chrome'` (system Chrome) is the *only* place in this repo pointing at an unmanaged browser binary; D-16 fixes exactly that one spot.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new npm packages. All tooling (`@playwright/test`, `@supabase/supabase-js`, `node:fs`, `node:os`) is already installed and in active use elsewhere in the repo.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  npm run test:e2e        │        │  npm run test:e2e:ui (new)│
│  (headless, default)     │        │  --ui flag, opt-in        │
└────────────┬─────────────┘        └────────────┬──────────────┘
             │                                    │
             └──────────────┬─────────────────────┘
                             ▼
                  playwright.config.ts
                  (webServer: npm run dev → :1520)
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │ launchOptions.executablePath (D-16)      │
        │ = highest ~/.agent-browser/browsers/     │
        │   chrome-<ver>/chrome                     │
        └────────────────────┬───────────────────┘
                              ▼
                    Chrome-for-Testing binary
                              │
                              ▼
          ┌───────────────────────────────────────┐
          │  e2e/<domain>/<name>.spec.ts (D-06/D-07)│
          │  imports test/expect from ./fixtures    │
          │  (console/pageerror tail, unchanged)     │
          └───────────┬───────────────┬─────────────┘
                       │               │
        UI assertions  │               │  DB assertions (D-10/D-12)
   (getByRole, toHaveURL,│             │  via e2e/helpers/db-assertions.ts
    receipt text, etc.)  │             │  (or extended supabase.ts)
                       ▼               ▼
              Tauri/Vite webview   Supabase Postgres
              (localhost:1520)     (service-role client,
                                    bypasses RLS for setup;
                                    RLS-boundary checks D-13
                                    use an authenticated
                                    role-scoped client instead)
                       │
                       ▼
          e2e/global-teardown.ts → VERIFICATION_REPORT.md
          (SUITE_MAP must be rewritten for new folder paths — Pitfall 1)
```

### Recommended Project Structure

D-06 leaves exact folder boundaries to the planner. Based on the actual current 50-file inventory (grouped below), a folder set that maps cleanly onto existing coverage without arbitrary splitting:

```
e2e/
├── checkout/          # 50-direct-sale-checkout, 51-barcode-scan-search, 26-field-validation (item-add paths)
├── payments/          # 05-payments, 17-payment-pane*, 23-payment-edge-cases, 35-refund, 41-split-payment
├── caja/              # 02-caja, 19-caja-entries, 23-caja-entries
├── inventory/         # 10-inventory, 27-inventory-intelligence, 54-near-expiry-alerts, 49-open-units, 52-loose-weight-hold-sale
├── suppliers/         # 53-supplier-receiving, 57-suppliers-loading-error
├── purchase-orders/   # 56-purchase-orders
├── reports/           # 07-reports*, 19-product-sales-report, 25-export-reports, 20-sprint2-revenue*, 49-receipt-category-grouping* (hybrid, see Pitfall 3)
├── receipts/          # 08-settings-receipt, 59-receipt-print-retry-resilience, 60-reprint-receipt, 61-receipt-pdf-delivery*
├── rbac/              # 09-rbac*, 22-staff-management
├── products/          # 21-product-management, 31-categories*
├── audit/             # 38-audit-logs, 58-entity-id-crosslink
├── tabs/              # 47-edit-paid-tab, 48-reopen-closed-ticket, 39-concurrent-edits
├── home/              # 15-home-navigation*
├── settings/          # 56-settings-backup-restore, 46-i18n-locale-switch
├── infra/             # 01-ci, 12-infrastructure, 13-tauri-build, 18-updater, 11-offline
├── a11y/              # 44-focus-tab-order*
├── soak/              # 55-full-day-soak
├── helpers/           # fixtures.ts, auth.ts, requireEnv.ts, supabase.ts (+ new db-assertions.ts, D-12)
├── global-teardown.ts
└── visual/            # 45-visual-baseline* — separate config, confirm scope (Open Questions)
```
`*` = file confirmed to contain bar-pos remnants (see Common Pitfalls) and needs auditing before or during its move.

### Pattern 1: DB-assertion after UI action (D-10)
**What:** After a state-changing UI flow completes, query Postgres directly via the existing service-role client pattern to assert the row landed with the correct shape — not just that the UI showed a success toast.
**When to use:** Every state-changing flow named in D-10 (checkout, refund, stock adjustment, PO receive/create, caja open/close/entry, supplier receiving, reopen/edit-paid-tab, staff clock-in/out).
**Example (existing pattern this phase should extend, not replace):**
```typescript
// Source: e2e/helpers/supabase.ts:21-25 (existing getServiceClient, reused pattern)
export function getServiceClient(): SupabaseClient {
  return createClient(getUrl(), getServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```
D-12's new helper module should add typed assertion functions on top of this client, e.g. `assertStockMovement(productId, expectedDelta, expectedReason)` — see Code Examples for the exact table/column shape to query.

### Pattern 2: RLS-boundary check via role-scoped client (D-13)
**What:** A second Supabase client, signed in as a lower-privileged role, attempting a mutation gated to a higher role — assert it is denied (not silently no-op'd).
**When to use:** For D-13's representative RLS-boundary checks at the E2E layer.
**Example — already-proven pattern to mirror, from a Vitest integration test (not Playwright, but the client-construction shape is directly reusable):**
```typescript
// Source: src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts:38-49
const managerClient = createClient(url!, anonKey!, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'po-rls-test-manager' },
});
const cashierClient = createClient(url!, anonKey!, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'po-rls-test-cashier' },
});
```
The `storageKey` per client is load-bearing — `supabase-js`'s default localStorage auth key is project-scoped only, so two same-process signed-in clients without distinct `storageKey`s clobber each other's session.

### Anti-Patterns to Avoid
- **Skip-instead-of-delete for permanently-removed features:** `e2e/49-receipt-category-grouping.spec.ts`'s SC-4 test is `test.skip`'d (not deleted) with a comment explaining the `/kds-bar` route it tests was deleted wholesale in a prior phase [VERIFIED: `e2e/49-receipt-category-grouping.spec.ts:275-300`, comment: "Skipped, not deleted: re-enable ... if/when a KDS bar board returns in a later phase"]. This is exactly the pattern D-08 forbids ("deleted outright, not skipped/quarantined") — treat it as a worked example of what NOT to leave behind.
- **Numeric-prefix suite-map coupling:** Do not add a new spec-classification mechanism that re-derives grouping from filename patterns (as `global-teardown.ts` currently does) — after D-06/D-07, filenames carry no domain signal; classify by folder path instead (see Pitfall 1).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| EAN/barcode-shaped fixture values (D-02) | A checksum-computing barcode generator | Plain 13-digit literal strings (e.g. `'8901030895567'`) | The app does not validate barcode checksums in software — confirmed out of scope project-wide [CITED: `CLAUDE.md` Out of Scope table: "HID scanners already validate checksums (EAN-13/UPC-A) in firmware — re-implementing in the app solves an already-solved problem"]. A checksum library would be solving a problem the fixtures don't have. |
| Chrome-version selection for D-16 | A semver-parsing dependency | `readdirSync` + `localeCompare(..., { numeric: true })` on the two `chrome-<version>` directory names | Only two flat sibling directories to compare [VERIFIED: `ls ~/.agent-browser/browsers/` → `chrome-151.0.7922.47`, `chrome-151.0.7922.77`] — a full semver parser is solving a problem one string comparison already solves |
| Suite/report grouping after D-06 | A new classification config file | Group by the spec file's folder path (already known at test-collection time) instead of a maintained regex-to-label map | The existing `SUITE_MAP` approach (26 hand-maintained regexes) is exactly the brittleness D-06 is trying to get away from at the file-naming layer — don't reintroduce the same pattern one layer up in `global-teardown.ts` |

**Key insight:** Every "don't hand-roll" in this phase is really "don't build a new dependency-shaped mechanism to solve a problem that a stdlib one-liner or the file's own directory structure already answers" — consistent with this being a rewrite/audit phase, not a build-new-capability phase.

## Runtime State Inventory

This phase renames/moves ~50 files (D-06/D-07) and rewrites seed-data content (D-01). Checked against all 5 categories:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — spec filenames are not persisted anywhere in Postgres (no table/column stores an `e2e/*.spec.ts` path) | None |
| Live service config | None — no CI workflow references specific e2e file paths [VERIFIED: `grep -n "test:e2e\|playwright" .github/workflows/ci.yml .github/workflows/release.yml` returned no matches]; `npm run test:e2e` is documented as run manually, not from CI, per CLAUDE.md | None |
| OS-registered state | None — no Task Scheduler/pm2/launchd/systemd registrations reference E2E spec filenames | None |
| Secrets/env vars | `E2E_BARTENDER_NAME`/`E2E_BARTENDER_PIN`, `E2E_MANAGER_*`, `E2E_ADMIN_*`, `E2E_KITCHEN_*`, `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY` [VERIFIED: `e2e/helpers/requireEnv.ts:3-12`, `e2e/helpers/auth.ts:24-35`] — none are keyed to spec filenames or the flat/folder naming scheme; `E2E_BARTENDER_*` names are deliberately kept unchanged despite mapping to the renamed `cashier` role (documented in-file as intentional, avoids a CI secret-store rename) | None — no action, confirmed deliberate by existing in-file comment |
| Build artifacts | `e2e-results/`, `e2e-blob-reports/`, `playwright-report/` (all gitignored output dirs) regenerate fresh on next run; no stale artifact references old filenames persistently | None — these directories are ephemeral test output, not checked-in state |

**Genuine renamed-code-artifact requiring action (not "runtime state" but adjacent and load-bearing):** `e2e/global-teardown.ts`'s `SUITE_MAP` (26 regex→label entries, all anchored on the current flat numeric filenames, e.g. `{ match: /^02-caja/, label: 'Caja Management' }` [VERIFIED: `e2e/global-teardown.ts:33-58`]) classifies test results into `VERIFICATION_REPORT.md` sections by matching `path.basename(file)` against these regexes [VERIFIED: `e2e/global-teardown.ts:83-84, 119-124`]. After D-06/D-07 rename every current spec to a folder path with no numeric prefix, `path.basename()` still strips the folder, but none of the 26 regexes will match a descriptively-named file — every rewritten spec's results silently fall into the pre-existing `'Other'` bucket [VERIFIED: `e2e/global-teardown.ts:116, 124`: `counts.set('Other', ...)` / `return 'Other';`]. This does not crash the teardown script, but it destroys the per-domain breakdown in `VERIFICATION_REPORT.md`. **Must be rewritten to classify by folder path (`file.split('/')[0]` style) as part of the same commit that does the file moves.**

## Common Pitfalls

### Pitfall 1: `global-teardown.ts`'s SUITE_MAP silently collapses after the D-06 rename
**What goes wrong:** `VERIFICATION_REPORT.md` still generates without error, but every renamed spec reports into an undifferentiated "Other" bucket, losing the per-domain pass/fail breakdown the report exists to provide.
**Why it happens:** Classification is regex-matched against the filename basename, and D-07 explicitly removes the numeric prefixes the 26 regexes are anchored to.
**How to avoid:** Rewrite the `classify()` function (and `SUITE_MAP`) to key off folder path instead of filename, in the same commit/wave as the D-06 file moves.
**Warning signs:** A post-rewrite `VERIFICATION_REPORT.md` run shows nearly all tests under "Other" with the domain-labeled buckets all at 0.

### Pitfall 2: `inventory_log` vs `stock_movements` — the table CLAUDE.md/CONTEXT.md name doesn't exist
**What goes wrong:** A new D-10/D-12 DB-assertion helper written against `.from('inventory_log')` will fail — there is no `inventory_log` table in the live schema.
**Why it happens:** The table was renamed at some point in the project's history; the Postgres foreign-key *constraint names* were never renamed and still say `inventory_log_product_id_fkey` / `inventory_log_staff_id_fkey` [VERIFIED: `src/shared/lib/supabase.types.ts:1447-1459`], which is exactly what makes this an easy trap — grepping the generated types file for "inventory_log" finds real hits that look like table-name confirmation but are actually stale constraint names. The real, current table is `stock_movements` [VERIFIED: `src/shared/lib/supabase.types.ts:1409-1421`, columns: `created_at, id, ingredient_id, notes, product_id, quantity_delta, reason, ref_id, ref_type, staff_id`]. All current app code already uses the correct name [VERIFIED: `grep -rn "stock_movements" src/` — 10+ call sites in `src/entities/inventory/model/queries.ts`, `queries-analytics.ts`, `src/features/physical-count/model/usePhysicalCount.ts`].
**How to avoid:** Every D-10/D-12 helper and every spec asserting a "stock movement" or "inventory log" row must query `stock_movements`, using the `reason` column values from `StockMovementReasonSchema` [VERIFIED: `src/shared/lib/domain.ts:117-130`, quoted verbatim]: `'sale' | 'manual_adjustment' | 'waste' | 'delivery' | 'correction' | 'physical_count' | 'prep_production' | 'prep_consumption' | 'combo_component' | 'refund' | 'void' | 'expired'`. Note the last five of those twelve values (`prep_production`, `prep_consumption`, `combo_component`, `refund` collision aside, `void`) are bar-pos-era dead reason codes still present in the union but never written by current code paths — new specs should only assert against the seven values also present in the narrower `InventoryAdjustReasonSchema` [VERIFIED: `src/shared/lib/domain.ts:97-105`]: `'sale' | 'manual_adjustment' | 'waste' | 'delivery' | 'correction' | 'physical_count' | 'expired'`.
**Warning signs:** A DB-assertion helper's Supabase query returns a `PGRST205`/relation-not-found style error, or (worse) silently returns an empty result set that a loosely-written assertion treats as "no movement expected" instead of "wrong table name."

### Pitfall 3: Two "confirmed bar-pos" files are actually hybrids, not clean deletions
**What goes wrong:** Deleting `e2e/18-modifier-notes-kds.spec.ts` and `e2e/49-receipt-category-grouping.spec.ts` outright (per a literal reading of D-08's file list) throws away coverage of features that are still live.
**Why it happens:** D-08's own criterion is "genuinely bar-pos-only surfaces" — but both files mix dead assertions with live ones:
  - `18-modifier-notes-kds.spec.ts` tests the modifier sheet + per-item notes (still live: `order_items.notes` and `order_items.modifier_ids`/`modifier_price_delta` columns exist in the current schema [VERIFIED: `src/shared/lib/supabase.types.ts:486-502`]; `ModifierSheet.tsx` is still wired into checkout [VERIFIED: `grep -rln "modifier" src/features/add-item-to-tab` → `ui/ModifierSheet.tsx`, `model/useAddItemToTab.ts`]) **and** KDS display (fully dead — `order_items` has no `kds_status` column at all [VERIFIED: `src/shared/lib/supabase.types.ts:486-502`, full column list has no `kds_status`], meaning the file's own `.update({ kds_status: 'done' })` cleanup call in `e2e/helpers/supabase.ts:78-82` silently no-ops against a nonexistent column today).
  - `49-receipt-category-grouping.spec.ts`'s SC-2b (category/modifier names on the printed receipt) is live and receipt-relevant; its SC-4 (cross-check against the `/kds-bar` board) is already `test.skip`'d with an in-file admission that the KDS bar board "was deleted wholesale" [VERIFIED: `e2e/49-receipt-category-grouping.spec.ts:262-266`].
**How to avoid:** Split, don't delete-or-keep-whole: strip the KDS-board-specific assertions/skip blocks and rewrite the surviving modifier/receipt-grouping coverage against Indian-grocery-appropriate fixtures (real product/category names instead of the current `'Alitas E2E'`/cocktail-modifier fakes [VERIFIED: `e2e/18-modifier-notes-kds.spec.ts:33-34`, `MOCK_PRODUCT_NAME = 'Alitas E2E'`]).
**Warning signs:** A coverage gap review post-rewrite shows no test for "modifier sheet + per-item notes on checkout," even though the feature code obviously still exists.

### Pitfall 4: `e2e/14-manual-stubs.spec.ts` is a live policy violation
**What goes wrong:** This file's entire contents are four `test.skip(true, 'Manual: ...')` stubs [VERIFIED: `e2e/14-manual-stubs.spec.ts:1-31`, full file quoted] — a direct violation of this project's own CLAUDE.md "Testing & Verification Policy — NON-NEGOTIABLE" ("No `<human-check>` sub-blocks, no `checkpoint:human-verify` tasks... There is no case in this project where 'have a human click it' is an acceptable substitute"). This predates the mandatory-automated-testing decision (`.planning/decisions/2026-08-07-mandatory-automated-testing-no-manual-verification.md`) and was never retroactively closed.
**Why it happens:** The stub file was written before the no-manual-verification policy existed and nothing in this phase's audit trigger (bar-pos-domain grep) would surface it, since it contains no bar-pos references at all.
**How to avoid:** Address explicitly as part of TEST-01's "audit all 50 files" scope, even though it's outside the bar-pos-domain trigger. Three of its four stubs name an automatable equivalent in their own skip message ("Zustand store spot-check... covered in CI Checks" is redundant with `01-ci.spec.ts`; "Tauri production build" duplicates the already-automated `13-tauri-build.spec.ts` opt-in). The remaining one (native Tauri window + physical PIN keypad + Supabase console check) is the closest thing in this suite to a genuinely-hardware/manual-only check — if it truly cannot be automated, CLAUDE.md requires saying so explicitly with a reason, not leaving a silent `test.skip`.
**Warning signs:** None currently — this is exactly the kind of silent violation that only surfaces on an explicit full-suite audit, which is what TEST-01 is.

### Pitfall 5: `channel: 'chrome'` and `launchOptions.executablePath` should not both be set
**What goes wrong:** Leaving `projects: [{ name: 'chromium', use: { channel: 'chrome', ... } }]` in place while also adding `launchOptions.executablePath` produces a config with two conflicting browser-selection mechanisms.
**Why it happens:** D-16 is additive by nature (adding `executablePath`) — easy to forget to remove the now-superseded `channel: 'chrome'` [VERIFIED: `playwright.config.ts:62`, current: `projects: [{ name: 'chromium', use: { channel: 'chrome', headless: true } }]`].
**How to avoid:** Remove `channel: 'chrome'` from the `use` block entirely when adding `executablePath` — don't set both. [CITED: playwright.dev/docs/api/class-browsertype — `channel` selects an installed browser distribution, `executablePath` points at an explicit binary; they serve the same selection role and setting both is redundant/conflicting, not additive.]
**Warning signs:** Playwright launches a browser but agent-browser's Chrome-for-Testing binary is never actually invoked (system Chrome still wins), or an explicit Playwright error about conflicting launch options.

### Pitfall 6: `e2e/visual/45-visual-baseline.spec.ts` is the single most bar-pos-laden file in the suite, but its config is out-of-scope
**What goes wrong:** Planner scopes it out entirely because `playwright.visual.config.ts` is explicitly excluded from this phase's boundary, and misses that the *spec file's content* still needs the same D-08 audit as every other file.
**Why it happens:** The phase boundary text says "does not touch... `test:e2e:visual`'s separate config" (true — that's the config file, D-15/D-16/D-17 don't apply to it) but CONTEXT.md's own canonical_refs flags this exact ambiguity and defers it to the planner.
**How to avoid:** Confirm explicitly in planning whether TEST-01's file-content audit applies here. Research finding: this file has by far the heaviest bar-pos footprint of any spec — 30+ matches across `pool_tables`/`pool-tables` (13), `/rappi` (4), `kds` (8), `/kitchen-prep` (2), `/waitlist` (3), `promotions` (1) [VERIFIED: `grep -noE "pool_tables|pool-tables|/rappi[a-zA-Z-]*|...|kds|KDS|...|promotion[a-zA-Z_]*" e2e/visual/45-visual-baseline.spec.ts` — 33 total matches across those patterns]. Whatever the scope decision, it should be made explicitly, not by default-omission.
**Warning signs:** A `npm run test:e2e:visual` run takes screenshots of routes (`/pool-tables`, `/rappi`, `/kitchen-prep`, `/waitlist`) that 404 or render nothing, without anyone noticing because the file is outside the main suite's CI/manual-run habit.

## Code Examples

### D-16: Auto-detecting agent-browser's Chrome-for-Testing binary
```typescript
// New helper, e.g. e2e/helpers/agent-browser-chrome.ts or inline in playwright.config.ts.
// Confirmed binary layout: ~/.agent-browser/browsers/chrome-<version>/chrome
// [VERIFIED: `find ~/.agent-browser/browsers/chrome-151.0.7922.77 -maxdepth 3 -iname chrome -type f`
//  → /home/widowsvail/.agent-browser/browsers/chrome-151.0.7922.77/chrome]
// [VERIFIED: `ls ~/.agent-browser/browsers/` → chrome-151.0.7922.47, chrome-151.0.7922.77
//  (two versions present on this dev machine today — confirms "pick highest" is a real,
//  not hypothetical, requirement)]
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';
import path from 'node:path';

function findAgentBrowserChrome(): string | undefined {
  const browsersDir = path.join(homedir(), '.agent-browser', 'browsers');
  let entries: string[];
  try {
    entries = readdirSync(browsersDir);
  } catch {
    return undefined; // agent-browser not installed on this machine — caller must fall back
  }
  const versions = entries
    .filter((e) => e.startsWith('chrome-'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const highest = versions.at(-1);
  return highest ? path.join(browsersDir, highest, 'chrome') : undefined;
}
```
`readdirSync`/`homedir` chosen over `fs.globSync` (Node 22+, technically available on this dev machine's Node v24.18.0 [VERIFIED: `node --version`]) because `package.json` has no `engines` field [VERIFIED: `grep -n '"engines"' package.json` — no match] pinning a minimum Node version across every developer's machine; `readdirSync` has no version floor to worry about.

### D-16: Wiring it into `playwright.config.ts` (remove `channel`, per Pitfall 5)
```typescript
// Before (current, playwright.config.ts:62):
// projects: [{ name: 'chromium', use: { channel: 'chrome', headless: true } }],

// After:
const chromePath = findAgentBrowserChrome();
projects: [{
  name: 'chromium',
  use: {
    headless: true,
    launchOptions: chromePath ? { executablePath: chromePath } : {},
  },
}],
```

### D-12: `stock_movements` assertion helper (uses the correct table name — Pitfall 2)
```typescript
// e2e/helpers/db-assertions.ts (or extend e2e/helpers/supabase.ts)
// Column shape verified: src/shared/lib/supabase.types.ts:1409-1421
import { getServiceClient } from './supabase';

export async function assertStockMovement(
  productId: string,
  expectedDelta: number,
  expectedReason: 'sale' | 'manual_adjustment' | 'waste' | 'delivery' | 'correction' | 'physical_count' | 'expired',
): Promise<void> {
  const admin = getServiceClient();
  const { data, error } = await admin
    .from('stock_movements')
    .select('quantity_delta, reason')
    .eq('product_id', productId)
    .eq('reason', expectedReason)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.quantity_delta !== expectedDelta) {
    throw new Error(
      `Expected stock_movements row for product ${productId} with delta ${String(expectedDelta)}/reason ${expectedReason}, got ${JSON.stringify(data)}`,
    );
  }
}
```

### `package.json`: new `test:e2e:ui` script (D-17)
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```
[VERIFIED: current scripts confirmed at `package.json` — `"test:e2e": "playwright test"`, `"test:e2e:report": "playwright show-report"` already exist; `test:e2e:ui` is a net-new one-line addition.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `channel: 'chrome'` (Playwright's system-Chrome channel selector) | `launchOptions.executablePath` pinned to a specific Chrome-for-Testing build | This phase (D-16) | Removes dependency on OS-level Chrome install/auto-update stability; matches the version agent-browser itself uses |
| Unconditional `trace/video/screenshot: 'on'` | Failure-only capture (`retain-on-failure`/`only-on-failure`) | This phase (D-15) | Standard Playwright speed practice — full run time drops materially since most tests pass and skip artifact writes |

**Note (background context, not an action item for this phase):** [CITED: WebSearch result on Playwright 1.57 release notes] "As of 1.57, Playwright began using Chrome for Testing (CfT) for most Chromium-channel runs instead of its own custom-compiled open-source Chromium builds." This means Playwright's own `channel: 'chrome'`/bundled-Chromium distinction has been converging toward CfT industry-wide independent of this phase's D-16 change — D-16 is still correct and necessary (it pins to agent-browser's specific, already-installed CfT binary rather than whatever Playwright's own channel resolution would pull), but it's worth knowing the ecosystem direction agrees with this decision rather than fighting it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The `readdirSync` + `localeCompare(numeric: true)` version-sort in the D-16 code example correctly orders any two `chrome-<version>` directory names agent-browser might produce in the future (not just the two currently observed) | Code Examples | A future agent-browser version with a differently-shaped version string (e.g. a leading-zero or non-numeric segment) could sort incorrectly; low risk since Chrome-for-Testing versions are consistently dot-separated all-numeric strings, but not proven for all future values |
| A2 | `channel` and `executablePath` should not both be set on the same Playwright `use`/launch config (Pitfall 5) | Common Pitfalls, Code Examples | Based on a WebFetch of the official BrowserType docs page plus general Playwright API knowledge, not a reproduced error message from this exact Playwright version; if wrong, worst case is a harmless no-op (one option silently ignored) rather than a broken build — safe to proceed on this assumption but worth a quick smoke-check (`npx playwright test --list`) after making the change |
| A3 | The folder taxonomy proposed under "Recommended Project Structure" is a reasonable default, not the only valid one | Architecture Patterns | CONTEXT.md explicitly leaves this to the planner (D-06) — treat the proposed taxonomy as a strong starting point for planning discussion, not a locked decision |

## Open Questions

1. **Does `manage-modifier-groups`/`ModifierSheet` deserve full Indian-grocery-fixture coverage, or minimal smoke coverage?**
   - What we know: the feature is still live and wired into checkout [VERIFIED: `src/features/add-item-to-tab/ui/ModifierSheet.tsx`, `model/useAddItemToTab.ts`; `order_items.modifier_ids`/`modifier_price_delta`/`notes` columns still exist].
   - What's unclear: whether per-item modifiers (traditionally a restaurant/bar concept — "extra lime," "no ice") make product sense for packaged Indian grocery goods, or whether it's effectively vestigial for this store and only needs a thin smoke test.
   - Recommendation: planner should confirm with the user during plan review whether a realistic Indian-grocery modifier example exists (e.g., none — packaged goods typically have no per-item modifiers) before deciding how much new coverage to author here; this is a product-fit question, not a testing-technique one.

2. **Is `e2e/visual/45-visual-baseline.spec.ts` in scope for TEST-01's content audit?**
   - What we know: its *config* (`playwright.visual.config.ts`) is explicitly out of scope per the phase boundary; the *spec file's content* is the heaviest bar-pos offender in the whole suite (Pitfall 6).
   - What's unclear: CONTEXT.md itself flags this as unresolved ("confirm with planner whether it's in this phase's scope or a companion follow-up").
   - Recommendation: resolve explicitly during planning, don't let it fall through by omission — CLAUDE.md's E2E Test Suite list still includes `45-visual-baseline` as an active spec.

3. **Should the Indian grocery catalog (D-02) include a "ready-to-eat" category?**
   - What we know: CONTEXT.md's D-02 lists 8 categories (masalas, atta/rice/dals, snacks, pickles/papads, ghee/oil, tea/coffee, frozen, sweets); `.planning/PROJECT.md`'s product description lists 9, adding "ready-to-eat" [VERIFIED: `.planning/PROJECT.md:5`, quoted: "packaged spices/masalas, atta/rice/dals, snacks, pickles/papads, ghee/oil, tea/coffee, frozen items, ready-to-eat, sweets"].
   - What's unclear: whether this is a deliberate 8-vs-9 scope trim or an oversight during discussion.
   - Recommendation: low-stakes either way (one more/fewer category in a 30-50 SKU catalog); flag for a quick confirm rather than blocking planning.

4. **Disposition of `e2e/14-manual-stubs.spec.ts`'s one genuinely-hard-to-automate stub (native Tauri window + physical PIN)?**
   - What we know: 3 of 4 stubs have an already-automated equivalent named in their own skip message; the 4th (native window launch + physical PIN keypad + Supabase devtools console check under `npm run tauri dev`) has no obvious Playwright-against-browser-mode equivalent since it needs the actual Tauri shell, not the Vite dev server Playwright drives.
   - What's unclear: whether this is achievable via Playwright's Tauri/WebView automation support (out of this research's depth to fully resolve) or is a legitimate "genuinely impossible to automate" case per CLAUDE.md's own carve-out.
   - Recommendation: planner should explicitly decide and document this one (delete-with-reason, or find a Tauri-automation path) rather than leaving it silently skipped — CLAUDE.md requires an explicit stated reason for any accepted manual gap, not silence.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|-----------|
| `@playwright/test` | Test runner (unchanged) | ✓ | 1.59.1 [VERIFIED: npm ls] | — |
| agent-browser CLI | Confirms bundled-Chrome install exists (D-16 target) | ✓ | 0.33.0 [VERIFIED: `agent-browser --version`] | — |
| agent-browser Chrome-for-Testing binary | D-16 `executablePath` target | ✓ | Two builds present: `chrome-151.0.7922.47`, `chrome-151.0.7922.77` [VERIFIED: `ls ~/.agent-browser/browsers/`] | If absent on a given dev machine, `findAgentBrowserChrome()` returns `undefined` — config should fall back to Playwright's own bundled Chromium (no `executablePath` set) rather than hard-failing |
| Node.js | D-16 helper script runtime | ✓ | v24.18.0 [VERIFIED: `node --version`] | `readdirSync`/`homedir` require no minimum beyond what's already assumed elsewhere in the repo's Node scripts |
| `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `E2E_*` PIN/name vars | Every DB-touching spec (D-10/D-12/D-13), `requireIntegrationEnv()` | Not verified this session (secret values, not read) | — | `requireIntegrationEnv()` already skips gracefully (`test.skip`) when any are missing [VERIFIED: `e2e/helpers/requireEnv.ts:15-19`] — no new fallback needed, existing pattern covers this |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** agent-browser Chrome binary absence (falls back to Playwright's bundled Chromium via `undefined` `executablePath`); E2E env vars absence (existing graceful `test.skip`).

## Validation Architecture

This phase's "product" is the test suite itself, so the usual Req→Test map is closer to a Req→Audit-Criterion map.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright 1.59.1 [VERIFIED: npm ls] |
| Config file | `playwright.config.ts` (main suite) — `playwright.visual.config.ts` is separate/out-of-scope |
| Quick run command | `npm run test:e2e` (headless, `FAST_E2E=1` env toggle already exists and is preserved) |
| Full suite command | `npm run test:e2e` (same — no separate "full" mode; `test:e2e:visual` is the visual-regression suite, unaffected) |

### Phase Requirements → Verification Map
| Req ID | Behavior | Verification Method | Command |
|--------|----------|----------------------|---------|
| TEST-01 | Zero bar-pos-domain references remain in `e2e/*.spec.ts` | Automated grep gate: `grep -rE "pool_tables|pool-tables|/rappi|rappi_orders|/kitchen-prep|/waitlist|waitlist_entries|combo_eligible|is_combo|kds_status" e2e/**/*.spec.ts` should return zero matches (planner should decide whether `combo_slot_id`/`is_combo`/`comboEligible` on `ProductSchema` itself, which are schema-level dead fields outside this phase's file boundary, are excluded from the grep) | `grep -rlE "..." e2e/**/*.spec.ts` (exit 1 / empty = pass) |
| TEST-02 | Every current feature/widget/entity has E2E coverage | Manual cross-reference during planning: 39 `features/`, 27 `widgets/`, 14 `entities/` [VERIFIED: `ls src/features/ src/widgets/ src/entities/`] against the rewritten spec-to-folder map | N/A — planning-time gap analysis, not a single automatable command |
| TEST-03 | `playwright.config.ts` launches the agent-browser Chrome-for-Testing binary | `npx playwright test --list` succeeds and (optionally) a smoke spec asserts `page.context().browser()?.version()` matches the pinned CfT version string | `npx playwright test e2e/infra/ci.spec.ts` (or equivalent) |
| TEST-04 | `npm run test:e2e` stays headless; `test:e2e:ui` launches UI mode | Script existence + a CI-safe smoke check that `test:e2e` doesn't set `headless: false` anywhere reachable from the default config path | `grep -n "headless" playwright.config.ts` |

### Sampling Rate
- Per spec-file rewrite: `npx playwright test e2e/<folder>/<file>.spec.ts` (targeted run)
- Per wave (e.g. after a folder's worth of moves): full `npm run test:e2e`
- Phase gate: full `npm run test:e2e` green, plus the TEST-01 grep gate, before `/gsd-verify-work`

### Wave 0 Gaps
None — the test framework itself is the subject of this phase; there is no separate "tests for the tests" infrastructure to stand up first. The `e2e/helpers/db-assertions.ts` module (D-12) is itself Wave-0-shaped infrastructure work that should land before the specs that depend on it.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V4 Access Control | Yes | D-13's RLS-boundary E2E checks directly exercise this — mirror the existing role-scoped-client pattern from `*.integration.test.ts` files (Architecture Patterns, Pattern 2) rather than inventing a new authorization-test shape |
| V2/V3/V5/V6 | No | This phase adds no new authentication, session, input-validation, or cryptography surface — it is test-authoring against existing, already-hardened app code |

### Known Threat Patterns for this phase's surface

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Service-role key exposure in committed spec/helper files | Information Disclosure | Already mitigated project-wide — `SUPABASE_SERVICE_ROLE_KEY` is read from `process.env` only [VERIFIED: `e2e/helpers/supabase.ts:17-19`], never hardcoded; this phase's new `db-assertions.ts` must follow the same pattern, not inline a key |
| RLS-boundary test using the service-role client instead of a role-scoped client, silently "passing" because service-role bypasses RLS entirely | Elevation of Privilege (false negative in the test itself) | D-13 checks must use an anon-key + signed-in client (Pattern 2), never `getServiceClient()`, for the "should be denied" assertion — using the wrong client would make every RLS-boundary test pass regardless of whether RLS actually blocks the action |

## Sources

### Primary (HIGH confidence)
- Direct repository inspection via `Read`/`Bash`/`grep` this session: `playwright.config.ts`, `playwright.visual.config.ts`, `package.json`, `e2e/*.spec.ts` (all 50 files, via `wc -l` + targeted grep + full reads of 3 files), `e2e/helpers/{auth,requireEnv,supabase}.ts`, `e2e/fixtures.ts`, `e2e/global-teardown.ts`, `src/shared/lib/supabase.types.ts`, `src/shared/lib/domain.ts`, `src/shared/lib/rbac.ts`, `src/shared/lib/result.ts`, `scripts/seed-dev-data.ts`, `.planning/PROJECT.md`, `.planning/config.json`, `.github/workflows/*.yml`
- `npm ls @playwright/test`, `agent-browser --version`, `ls ~/.agent-browser/browsers/`, `find ... -iname chrome -type f`, `node --version` — direct tool verification of installed versions and file layout

### Secondary (MEDIUM confidence)
- [CITED: playwright.dev/docs/api/class-browsertype] — WebFetch summary of `channel` vs `executablePath` semantics (Pitfall 5, A2)
- [CITED: WebSearch, Playwright 1.57 release-notes discussion] — Chrome-for-Testing adoption timeline (State of the Art section)

### Tertiary (LOW confidence)
None — no unverified WebSearch-only claims were carried into a prescriptive recommendation in this document.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all versions directly verified via installed `node_modules`/CLI tools
- Architecture: HIGH — folder taxonomy and DB-assertion patterns derived directly from reading the actual current file inventory and existing integration-test patterns in this repo
- Pitfalls: HIGH — every pitfall in this document is grounded in a direct `Read`/`grep` finding with file:line citation, not inferred from training data

**Research date:** 2026-08-25
**Valid until:** ~14 days (this is an audit of live repo state, not external library docs — re-audit the bar-pos-file grep list if significant time passes before planning, since Phases 14-16 already added 3 new spec files between CONTEXT.md's discussion and this research pass)
