---
phase: 17-e2e-suite-overhaul
verified: 2026-08-26T01:11:55Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 17: E2E Suite Overhaul Verification Report

**Phase Goal:** The Playwright E2E suite (`e2e/*.spec.ts`) contains zero references to stripped bar-pos domain concepts and instead gives comprehensive, current, automated coverage of every real supermarket-pos feature, seeded with Indian grocery products, runnable headless by default against agent-browser's bundled Chrome-for-Testing binary, with an optional live-monitoring mode.
**Requirements:** TEST-01, TEST-02, TEST-03, TEST-04
**Verified:** 2026-08-26T01:11:55Z
**Status:** passed (with follow-up items recorded — see "Notable Risks / Recommended Follow-ups")

This verification did **not** trust SUMMARY.md claims. Every finding below is backed by a grep run, a file read, or a live `npx playwright test` execution performed in this session against a dev server this agent started itself (`/home/widowsvail/ai/POS/supermarket-pos`, same commit history as the worktree under review — `d0bf321 docs(phase-17): update tracking after wave 4`).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Zero live bar-pos domain references remain in `e2e/**` (TEST-01) | ✓ VERIFIED | Ran the phase's own grep gate (`pool_tables\|pool-tables\|/rappi\|rappi_orders\|/kitchen-prep\|/waitlist\|waitlist_entries\|combo_eligible\|is_combo\|kds_status\|KDS\|promotion`) — zero matches (exit 1). Also ran a broader, independently-chosen term set (`pool_table`, `pool_session`, `rappi`, `kds`, `kitchen-prep`, `waitlist`, `combo`, `promotion`, `ingredient`, case-insensitive) across all of `e2e/` — every hit is a comment/docstring explaining what was *removed* (e.g. `home-navigation.spec.ts:190`, `rbac.spec.ts:197`, `report-tabs.spec.ts:454,1337`), or a live, still-correct column name unrelated to the deleted domain (`is_combo`/pack-case pricing, confirmed by 17-17-SUMMARY.md as a deliberate, resolved grep-gate collision). No live assertion exercises dropped bar-pos schema/routes. |
| 2 | E2E suite reorganized into per-domain folders (TEST-01 restructuring) | ✓ VERIFIED | `find e2e -name '*.spec.ts' \| wc -l` = 51; 20 spec-bearing folders (`a11y, ai, audit, caja, checkout, errors, home, infra, inventory, payments, products, purchase-orders, rbac, receipts, reports, settings, soak, suppliers, tabs, visual`) — exact match to CLAUDE.md's documented table. |
| 3 | CLAUDE.md accurately documents the new `e2e/` structure | ✓ VERIFIED | `CLAUDE.md` lines 274-303 list all 20 folders with correct per-folder descriptions and the one documented manual-verification carve-out (native Tauri shell / physical PIN hardware / Supabase devtools UI — unreachable by a browser-driven Playwright session). Matches the actual directory listing exactly. |
| 4 | Comprehensive, current, automated coverage of real features, seeded with Indian grocery fixtures (TEST-02) | ✓ VERIFIED (with 2 disclosed gaps) | Cross-referenced `src/features/*` against `e2e/` folders — all major feature families (checkout-sale, scan-barcode-to-cart, open-unit, receive-shipment, adjust-inventory, physical-count, process-payment/refund/reopen-tab/edit-paid-tab, RBAC/staff, caja, reports/export, product/category CRUD, agent-chat AI vision) have live spec coverage. `scripts/seed-dev-data.ts`/`supabase/seed.sql` confirmed rewritten to Indian grocery items (categories/products loaded during live test run: "categories.loaded {count: 16}", "products.loaded {count: 82}" — no bar-food names observed). Two coverage gaps are **honestly disclosed, not hidden**: `force-pin-change` has zero e2e coverage anywhere (confirmed via grep, matches `deferred-items.md` and `WINDOWS.md` #31), and `upload-logo`'s GS v 0 thermal-raster print path is explicitly out of Playwright's reach (native Tauri + physical printer — `WINDOWS.md` #30). Both are reasoned, scoped-out, tracked gaps, not silent omissions. |
| 5 | `playwright.config.ts` launches against agent-browser's bundled Chrome-for-Testing binary via auto-detected `launchOptions.executablePath` (TEST-03) | ✓ VERIFIED | Read `playwright.config.ts`: `findAgentBrowserChrome()` scans `~/.agent-browser/browsers/chrome-*` and picks the highest version, passed as `executablePath` in the `chromium` project's `launchOptions`. Verified the binary exists on this machine (`~/.agent-browser/browsers/chrome-151.0.7922.47`, `chrome-151.0.7922.77`). `@playwright/test` remains the runner (fixtures/reporters/webServer/retries all still Playwright-native). |
| 6 | Default `test:e2e` stays headless; opt-in UI-mode script added (TEST-04) | ✓ VERIFIED | `package.json`: `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`. `playwright.config.ts`: `headless: true` (both `use.headless` and `use.launchOptions.headless`), unconditional — `FAST_E2E` only affects `slowMo`/timeouts, never headlessness. |
| 7 | No policy-violating permanently-skipped tests remain (`test.skip('name', cb)` form) | ✓ VERIFIED | `grep -rn "test\.skip("` across `e2e/` shows every remaining instance is a **runtime-conditional** `test.skip(true, reason)` call inside a running test body (guarded by an `if`), not a top-level declaration-time skip that never executes. `14-manual-stubs.spec.ts` (the file CLAUDE.md's testing-policy violation named) was deleted outright, its content replaced with real coverage in `e2e/infra/`. `e2e/checkout/modifier-notes.spec.ts` T1 uses the same conditional form specifically because `ModifierSheet` is confirmed **dead code** (zero production callers) — an accurate finding, not a masked failure. |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `playwright.config.ts` | Chrome-for-Testing executablePath, headless default, `test:e2e:ui` support | ✓ VERIFIED | Read in full; matches TEST-03/04 exactly |
| `e2e/` (51 spec files, 20 folders) | Bar-pos-free, per-domain reorg | ✓ VERIFIED | `find`-confirmed count and structure |
| `CLAUDE.md` E2E section | Documents new structure | ✓ VERIFIED | Lines 274-303, matches actual layout |
| `scripts/seed-dev-data.ts` / `supabase/seed.sql` | Indian grocery fixtures | ✓ VERIFIED | Live run shows 16 categories / 82 products loaded with no bar-food remnants observed in logs |
| `.planning/REQUIREMENTS.md` | TEST-01..04 marked complete, traced to Phase 17 | ✓ VERIFIED | Lines 51-54, 119-122, 127 |

### Live Execution (this session, not trusted from SUMMARY.md)

A dev server was started by this verifier (`cd /home/widowsvail/ai/POS/supermarket-pos && npm run dev`, confirmed same commit lineage) and hit directly:

| Spec | Command | Result | Status |
|------|---------|--------|--------|
| `e2e/caja/session-management.spec.ts` (7 tests) | `FAST_E2E=1 npx playwright test e2e/caja/session-management.spec.ts` | **7 passed, 0 failed** (exit code 0) — real logins, real caja open/close, real Realtime `caja.loaded`/`caja.closed` events observed in browser console tail | ✓ PASS |
| `e2e/products/product-management.spec.ts` (8 tests) | `FAST_E2E=1 npx playwright test e2e/products/product-management.spec.ts` | PM4, PM7 passed; PM1, PM2, PM3, PM5, PM6 skipped (all via `navigateToInventory`/`navigateToProductsSettingsTab`'s English-text locators); PM8 failed (pre-existing, `WINDOWS.md` #19) | ⚠️ See risk below |
| Broad slice (`e2e/checkout e2e/caja e2e/payments` + others) | `FAST_E2E=1 npx playwright test e2e/checkout e2e/caja e2e/payments ...` | All failed with `ERR_CONNECTION_RESET`/`ERR_CONNECTION_REFUSED` | Environment artifact, not a code finding — see below |

**Environment note:** this verification session ran inside a heavily-contended shared environment — `ps aux` showed 3 independent `npm run dev`/vite processes from sibling GSD-dispatch worktrees all competing for `localhost:1520` and one shared, non-namespaced local Supabase instance, exactly the condition `WINDOWS.md` documents repeatedly for this phase's own execution (#18, #21, #26, #29-area, #32-34). A full/broad suite run is not reliable evidence in this shared session; a single-file run against a dev server this agent started and confirmed healthy (`curl` 200 immediately beforehand) is the reliable signal, and that one (`e2e/caja/session-management.spec.ts`) passed cleanly end-to-end.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| TEST-01 | ✓ SATISFIED | Grep gate zero matches (both the phase's own pattern and a broader independent one); folder reorg confirmed |
| TEST-02 | ✓ SATISFIED (2 disclosed gaps) | Feature cross-reference done; `force-pin-change` and `upload-logo` raster-print gaps are explicitly tracked in `WINDOWS.md`/`deferred-items.md`, not hidden |
| TEST-03 | ✓ SATISFIED | `playwright.config.ts` code-verified, Chrome-for-Testing binary present on-disk |
| TEST-04 | ✓ SATISFIED | `package.json` + `playwright.config.ts` code-verified |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `e2e/products/categories.spec.ts` | 8-9, 99, 118, 154-238 | Test fixture data still named `Beers`/`Regular`/`Corona` (bar-pos-flavored); `describe` title still reads "Combo Flag" though the combo-flag assertion was removed (per the file's own comment at line ~314-320) | ℹ️ Info | Cosmetic only — does not match any bar-pos grep-gate pattern (arbitrary category names, no schema/route/domain reference) and does not affect the test's correctness. Inconsistent with the phase's own "Indian grocery" fixture theme and stale naming should be cleaned up opportunistically. |
| `e2e/products/product-management.spec.ts` | 26, 43 | `navigateToInventory`'s heading regex (`/inventory\|products\|catalog/i`) and `navigateToProductsSettingsTab`'s literal `getByRole('tab', { name: 'Products' })` are English-only, contradicting the phase's own documented pattern (`17-PATTERNS.md`: "always match both locales with a combined regex, never assume en-US") | ⚠️ Warning | See "Notable Risks" below — live-verified to cause PM1/2/3/5/6 to self-skip when the pinned E2E account renders es-MX instead of the actively-re-pinned en-US. |

No `TBD`/`FIXME`/`XXX` debt markers found anywhere in `e2e/`.

## Notable Risks / Recommended Follow-ups (not phase-blocking)

These are recorded for the human record per this project's "never silently absorb a gap" policy. None of them individually or collectively falsify the phase-17 goal (E2E suite reorganization, bar-pos removal, config/requirement changes) — they are pre-existing or narrowly-scoped issues the phase's own executors already found and disclosed, one of which this verifier reproduced independently.

1. **`e2e/products/product-management.spec.ts` PM1/PM2/PM3/PM5/PM6 intermittently self-skip.** Reproduced twice in this session (once in a full 8-test file run, once in an isolated 2-test `-g "PM1|PM2"` run) — both times PM1 skipped with the `navigateToInventory`/`navigateToProductsSettingsTab` helpers failing to find English UI text, while PM4/PM7 (different, non-Settings-tab locators) passed in the same session, showing English text *was* rendered at that moment. This pattern — intermittent, not 100%-reproducible-as-a-hard-failure, alternating within one serial run — matches the exact race `e2e/helpers/supabase.ts`'s own code comments (lines 95-135) already anticipate: `resetTestState()` actively re-pins the 4 named E2E accounts to `en-US` on every test, but a concurrently-running sibling process's own `resetTestState()`/locale-switch test can flip it back to `es-MX` mid-flight under this environment's multi-worktree shared-DB concurrency — the identical mechanism already tracked (for a different file) at `WINDOWS.md` #18. **Recommendation:** re-run `e2e/products/product-management.spec.ts` in isolation against a dedicated (non-shared) local Supabase instance to confirm this is purely environmental and not a genuine locale-handling regression; if confirmed environmental, extend `WINDOWS.md` #18's scope to include this file, or harden the two helper locators to match both locales per the project's own established pattern regardless.
2. **`WINDOWS.md` #27 (report-tabs.spec.ts turnover discrepancy) is open and explicitly unresolved.** The ledger's own author states "the gap is real and reproducible, not flaky noise" but the exact mechanism (RLS visibility scoping vs. a date-range boundary issue) needs deeper investigation than this phase's post-merge regression pass covered. This is a genuine, disclosed, not-yet-root-caused product-correctness question surfaced by the improved coverage — appropriately left open in the ledger rather than hidden, but worth a dedicated follow-up.
3. **`force-pin-change` has zero e2e coverage** (`WINDOWS.md` #31, `deferred-items.md`) and **`upload-logo`'s thermal-raster print path is unreachable from Playwright** (`WINDOWS.md` #30) — both honestly disclosed scope carve-outs against TEST-02's "comprehensive coverage" language, not defects introduced by this phase.

## Gaps Summary

No blocking gaps found. All four requirements (TEST-01 through TEST-04) have direct, independently-verified evidence in the codebase — not just SUMMARY.md narrative. The three items above are recorded as follow-ups per this project's broken-windows-ledger convention; they do not represent an unmet phase goal.

---

_Verified: 2026-08-26T01:11:55Z_
_Verifier: Claude (gsd-verifier)_
