---
phase: 17-e2e-suite-overhaul
plan: 07
subsystem: testing
tags: [playwright, supabase, inventory, open-units, loose-weight, rbac]

requires:
  - phase: 17-e2e-suite-overhaul
    provides: "17-02's Indian grocery E2E catalog (scripts/seed-dev-data.ts), 17-04's checkout-folder verification-report classification"
provides:
  - "e2e/inventory/ — 5 rewritten spec files (inventory-management, inventory-intelligence, near-expiry-alerts, open-units, loose-weight-hold-sale), zero bar-pos references, zero test.skip escape hatches"
  - "src/pages/inventory/index.tsx — LowStockBadge gated behind adjust_inventory (was ungated for every role)"
affects: [e2e-suite-overhaul, inventory-e2e, future-phases-relying-on-low-stock-badge]

actuals:
  tokens: 42000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Idempotent update-if-exists fixture helpers for spec-local generic products (E2E Loose Weight A/B), mirroring seed-dev-data.ts's upsert-by-natural-key contract."
    - "Scope getByText(PRODUCT) assertions to a specific container (.locator('aside')) whenever the product name can also match a still-visible search-filtered grid card or button label — an unscoped getByText is a strict-mode-violation trap once fixtures use descriptive, substring-colliding names."

key-files:
  created:
    - e2e/inventory/inventory-management.spec.ts
    - e2e/inventory/inventory-intelligence.spec.ts
    - e2e/inventory/near-expiry-alerts.spec.ts
    - e2e/inventory/open-units.spec.ts
    - e2e/inventory/loose-weight-hold-sale.spec.ts
  modified:
    - src/pages/inventory/index.tsx

key-decisions:
  - "widgets/LowStockAlert confirmed orphaned (zero callers in src/pages, src/widgets, src/app) — the 2 permanently-skipped low-stock-alert tests were resurrected against the REAL current surface instead (entities/inventory's LowStockBadge on /inventory), not the dead widget."
  - "LowStockBadge had no RBAC gate at all before this plan (visible to every authenticated role) — gated it behind the same adjust_inventory check already used for Physical Count, per the plan's own threat register (T-17-12) requiring both 'visible to manager' and 'hidden from cashier' to be real, not merely restated test assertions."
  - "49-open-units.spec.ts's monolithic test.skip'd checklist (steps 6-8: sell-through-exhaustion + D-05 negative-stock override via /pos) was deleted, not restored, after confirming its own two premises are BOTH now false in a new way: current /pos is a scan/search/cart checkout with no tab-based 'Select product' UI to click, AND the D-05 override feature it exercised (features/override-negative-stock) has zero callers anywhere in the app — orphaned dead code from the same pre-rebuild era as widgets/LowStockAlert."
  - "52-loose-weight-hold-sale.spec.ts's Budweiser/Corona fixtures no longer exist post-17-02's Indian-catalog rewrite — replaced with two small generic fixture products (E2E Loose Weight A/B) created idempotently in the spec itself, per D-05's carve-out (this file doesn't need to use the Indian catalog)."

patterns-established:
  - "Any new E2E fixture product name reused across a search-filter + product-grid + cart-aside UI flow needs its visibility assertions scoped to a specific container, or it hits Playwright's strict-mode multiple-match error."

requirements-completed: [TEST-01, TEST-02]

coverage:
  - id: D1
    description: "e2e/inventory/inventory-management.spec.ts: low-stock-alert coverage resurrected against the real LowStockBadge surface (visible to manager, hidden from cashier via the new RBAC gate), Indian-catalog fixture, no test.skip"
    requirement: TEST-01
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/inventory/inventory-management.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "e2e/inventory/inventory-intelligence.spec.ts + near-expiry-alerts.spec.ts: Indian-catalog fixture swap, stale skip guards removed, folder move with import fixes"
    requirement: TEST-01
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/inventory/inventory-intelligence.spec.ts e2e/inventory/near-expiry-alerts.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "e2e/inventory/open-units.spec.ts: D-05 generic fixtures kept, monolithic dead skip resolved with documented reasoning (deleted, not restored)"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/inventory/open-units.spec.ts"
        status: flaky
    human_judgment: false
  - id: D4
    description: "e2e/inventory/loose-weight-hold-sale.spec.ts: D-05 generic fixtures created (Budweiser/Corona no longer exist), a genuine strict-mode locator bug and an under-priced fixture bug found and fixed during verification"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/inventory/loose-weight-hold-sale.spec.ts"
        status: flaky
    human_judgment: false

duration: ~2h (including extensive verification-environment investigation, see Issues Encountered)
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 07: Inventory E2E Rewrite — Low-Stock RBAC Gap + Monolithic Dead Skip Summary

**Rewrote `e2e/inventory/` (5 files), resurrected the low-stock-alert tests against the real `LowStockBadge` surface and closed a genuine RBAC gap that surface had (visible to every role, now manager+ only), and confirmed-then-deleted `open-units.spec.ts`'s monolithic dead skip after finding its subject (a tab-based sell-through-exhaustion flow plus an orphaned negative-stock-override feature) no longer exists in any reachable form.**

## Performance

- **Duration:** ~2h (see Issues Encountered — most of this was diagnosing shared-verification-environment contention across ~10-20 concurrently-running wave-3 worktree agents, not writing the specs themselves)
- **Completed:** 2026-08-25
- **Tasks:** 2/2
- **Files modified:** 7 (5 e2e/inventory/ specs + 1 src file + 5 original root files deleted)

## Accomplishments

- `e2e/inventory/inventory-management.spec.ts`, `inventory-intelligence.spec.ts`, `near-expiry-alerts.spec.ts`, `open-units.spec.ts`, `loose-weight-hold-sale.spec.ts` created; `e2e/10-inventory.spec.ts`, `27-inventory-intelligence.spec.ts`, `54-near-expiry-alerts.spec.ts`, `49-open-units.spec.ts`, `52-loose-weight-hold-sale.spec.ts` deleted.
- Confirmed `widgets/LowStockAlert` (what the 2 originally-skipped low-stock-alert tests targeted) is orphaned dead code (zero callers in `src/pages`, `src/widgets`, `src/app`) and identified the real current surface: `entities/inventory`'s `LowStockBadge`, rendered on `/inventory`.
- Found `LowStockBadge` had **no RBAC gate at all** — every authenticated role (including cashier) saw it. Gated it behind the same `adjust_inventory` check already computed for the Physical Count button (`src/pages/inventory/index.tsx`), so "hidden from cashier" is now a real, enforced boundary rather than an assertion with no backing behavior. This directly satisfies the plan's own threat register (T-17-12, Information Disclosure, disposition: mitigate).
- Confirmed `49-open-units.spec.ts`'s monolithic `test.skip`'d checklist (steps 6-8: sell loose pieces to exhaustion + the D-05 zero-stock manager-PIN override, both driven through the old tab-based `/pos`) is not restorable as originally intended: the current `/pos` is a completely different scan/search/cart direct-sale checkout with no "New Tab"/"Select product" UI to click, and the D-05 override feature it exercised (`features/override-negative-stock`, which calls the bar-pos-era `create_order_with_items` tab RPC) has zero callers anywhere in the app — also orphaned. Deleted the monolithic test with a documented finding rather than restoring or silently dropping it; the underlying `deplete_for_order_item` RPC logic (exhaustion, override, audit trail) remains covered by `src/entities/open-unit/model/consume-open-unit.integration.test.ts`.
- Replaced `52-loose-weight-hold-sale.spec.ts`'s `Budweiser`/`Corona` fixtures (no longer present in the DB after 17-02's Indian-catalog rewrite) with two small generic fixture products created idempotently in the spec itself, per D-05's explicit carve-out for this file.
- Found and fixed two genuine bugs surfaced only once the new fixtures made these specs runnable again (both were previously either untestable due to missing products, or exercising dead code): a Playwright strict-mode locator collision (`getByText(PRODUCT)` unscoped matched both a search-filtered grid card and the resumed cart), and a fixture price too high for the `$100`-tendered UI flow (4.5kg × old $45/kg price exceeded the tendered amount, leaving Process Payment permanently disabled).

## Task Commits

1. **Task 1: inventory-management.spec.ts + inventory-intelligence.spec.ts + near-expiry-alerts.spec.ts, LowStockBadge RBAC gate** — `fc6de97` (test)
2. **Task 2: open-units.spec.ts + loose-weight-hold-sale.spec.ts, monolithic dead skip resolved** — `6ad40f0` (test)

## Files Created/Modified

- `e2e/inventory/inventory-management.spec.ts` — moved from `10-inventory.spec.ts`; Indian-catalog fixture (`MDH Garam Masala 100g`); the 2 permanently-skipped low-stock-alert tests rewritten to target `LowStockBadge`, both now green (visible to manager, hidden from cashier).
- `e2e/inventory/inventory-intelligence.spec.ts` — moved from `27-inventory-intelligence.spec.ts`; Indian-catalog fixture swap; dropped stale "UI not implemented" `test.skip` fallback guards (the UI has been real and stable since Phase 2).
- `e2e/inventory/near-expiry-alerts.spec.ts` — moved from `54-near-expiry-alerts.spec.ts`; import-path fix only, no product fixture to swap (pure settings-threshold persistence test).
- `e2e/inventory/open-units.spec.ts` — moved from `49-open-units.spec.ts`; kept its generic `E2E Open-Unit Box`/`E2E Open-Unit Loose` fixtures per D-05; monolithic `test.skip`'d checklist deleted with documented reasoning; unused `openCaja`/`placeOrderAndWaitForClear`/`getActiveOpenUnit` helpers removed (only referenced by the deleted test).
- `e2e/inventory/loose-weight-hold-sale.spec.ts` — moved from `52-loose-weight-hold-sale.spec.ts`; new `ensureLooseWeightFixtures()` idempotently creates `E2E Loose Weight A`/`B` (generic, non-Indian, per D-05); strict-mode locator fix; fixture price lowered from 45/55 to 10/12.
- `src/pages/inventory/index.tsx` — `LowStockBadge` now gated behind `canPhysicalCount` (`adjust_inventory`); `NearExpiryBadge` left ungated (CLAUDE.md documents it as visible everywhere, including checkout).

## Decisions Made

- **Low-stock-alert resurrection target:** `LowStockBadge`, not `widgets/LowStockAlert` — confirmed the latter is genuinely orphaned this session via `grep -rln "LowStockAlert" src/pages src/widgets src/app` (only its own file matches).
- **RBAC gate added, not just restated in the test:** the plan's threat register explicitly required both "visible to manager" and "hidden from cashier" to be real if resurrected against a live surface — since `LowStockBadge` had no gate, writing a "hidden from cashier" test against actual (ungated) behavior would have asserted something false. Applied Rule 2 (missing authorization) and added the one-line gate reusing the component's own existing `adjust_inventory` check, rather than inventing new RBAC infrastructure or relitigating whether `/inventory` itself should be manager-only (a separate, larger, out-of-scope question — the page-level `T6` cashier-read-only-access test is unchanged and still passes).
- **Monolithic open-units skip deleted, not restored:** confirmed both premises independently — the checklist's own comment claimed it was "blocked on /pos", but /pos now exists; investigation showed it's a *different* UI (checkout, not tab-based ordering) that can't run the old script, AND the specific feature (`useOverrideNegativeStock`) the skipped steps needed is itself dead code with zero callers. Restoring it would test nothing reachable; the file's own comment already documented that the RPC-level behavior is covered elsewhere.
- **loose-weight fixture prices:** 10/12 (not the original Budweiser-era pricing, unknown) — sized specifically so the existing 4.5kg-max UI flow stays under the fixed `$100` tendered amount used throughout the file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `LowStockBadge` had no RBAC gate anywhere**
- **Found during:** Task 1, rewriting the 2 low-stock-alert tests
- **Issue:** `/inventory`'s route only checks authentication (not role), and `LowStockBadge` rendered unconditionally for every visitor — so a cashier could see the same low-stock counts as a manager, contradicting the plan's threat register (T-17-12) and the original tests' intent.
- **Fix:** Gated `<LowStockBadge />` behind the existing `canPhysicalCount` (`adjust_inventory`) check in `src/pages/inventory/index.tsx`, reusing the same variable already computed for the Physical Count button rather than adding new RBAC plumbing.
- **Files modified:** `src/pages/inventory/index.tsx`
- **Verification:** `e2e/inventory/inventory-management.spec.ts`'s "Low stock alert hidden from cashier" test passes.
- **Committed in:** `fc6de97`

**2. [Rule 1 - Bug] `getByText(PRODUCT)` strict-mode collision in loose-weight-hold-sale.spec.ts**
- **Found during:** Task 2 verification
- **Issue:** An unscoped `page.getByText(PRODUCT)` resolved to 2 elements once the fixture used a descriptive name that also matched a still-search-filtered product-grid card, throwing a Playwright strict-mode error. The original `Budweiser` fixture likely never hit this because it was already absent from the seeded catalog (untested for some time).
- **Fix:** Scoped the assertion to `page.locator('aside').getByText(PRODUCT, { exact: true })`, matching the pattern already used elsewhere in the same file.
- **Files modified:** `e2e/inventory/loose-weight-hold-sale.spec.ts`
- **Verification:** Isolated single-file rerun passed this specific test.
- **Committed in:** `6ad40f0`

**3. [Rule 1 - Bug] loose-weight fixture price too high for the `$100`-tendered UI flow**
- **Found during:** Task 2 verification
- **Issue:** `ensureLooseWeightFixtures()` initially priced the fixtures at 45/55; the "adds distinct weighted lines" test sells ~4.5kg, whose total (well over $200 with tax) exceeded the test's fixed `$100` tendered amount, leaving "Process Payment" permanently disabled.
- **Fix:** Lowered fixture prices to 10/12, and changed the fixture-creation helper from insert-only to update-if-exists so a stale price from a prior run doesn't linger.
- **Files modified:** `e2e/inventory/loose-weight-hold-sale.spec.ts`
- **Verification:** Isolated single-file rerun passed this specific test (before contention-related environment noise, see Issues Encountered).
- **Committed in:** `6ad40f0`

---

**Total deviations:** 3 auto-fixed (1 Rule 2 security gap, 2 Rule 1 bugs). None expanded scope beyond `e2e/inventory/` and the one directly-implicated production file (`src/pages/inventory/index.tsx`).

## Issues Encountered

- **Shared verification environment under heavy concurrent load (environment, not code):** this dispatch ran as one of ~10-20 concurrently-executing wave-3 worktree agents, all sharing **one** local Supabase Docker stack (`localhost:8000`) and, via Playwright's `webServer: { reuseExistingServer: true }`, effectively **one** Vite dev server (`localhost:1520`) — whichever worktree's `npm run dev` bound the port first. `e2e/helpers/supabase.ts`'s `resetTestState()` performs **blanket, unscoped** updates (`inventory.quantity_on_hand = 100` for every row, close **all** open `caja_sessions`, void **all** open tabs, reset **all** `products.sold_by_weight`) — safe under this repo's documented serial-execution assumption (D-14: `workers: 1`, one runner) but not safe when multiple independent Playwright processes call it concurrently. Confirmed via distinct, unambiguous error signatures across multiple reruns: `CAJA_CLOSED` RPC rejection (another agent's `resetTestState()` closed the caja mid-test), `caja_sessions_one_open` duplicate-key violation (two agents' `openCaja()` racing), Realtime WebSocket `500`/`503` handshake failures, and one explicit `"[vite] server connection lost. Polling for restart..."` log line coinciding exactly with a test failure. This is the same class of issue independently documented in `17-05-SUMMARY.md`'s "Issues Encountered" and in `.planning/WINDOWS.md` ledger entries #1, #3, #4, #6-#11 (pre-dating this plan).
- **Net result:** `e2e/inventory/inventory-management.spec.ts` (9/9), `inventory-intelligence.spec.ts` (6/6, one retry-flake), and `near-expiry-alerts.spec.ts` (1/1) reached clean isolated passes. `open-units.spec.ts` (1 test) and `loose-weight-hold-sale.spec.ts` (up to 3 of 6 tests) intermittently fail under concurrent load but passed in lower-contention isolated reruns during this session, and every failure investigated traced to one of the contention signatures above, never to the rewritten spec logic itself. Logged as `.planning/WINDOWS.md` ledger entry #19 (`unrun-verify`) rather than left silently unresolved. `npm run typecheck` and `npm run lint` (scoped to `src/`, matching this repo's own `package.json` — `e2e/**` is not part of that script's glob and was never linted before or after this plan) are both clean.
- **Not a regression:** `npm run typecheck` passed after every change in this plan; the two real bugs found (Deviations #2/#3) were confirmed via clean single-file passes before the environment's contention made subsequent reruns noisy.

## Known Stubs

None — no hardcoded empty/placeholder UI data introduced by this plan.

## Threat Flags

None new beyond T-17-12 (already in the plan's own threat model and now mitigated, see Decisions Made).

## Next Phase Readiness

- `e2e/inventory/` is fully moved to the new folder layout with zero bar-pos references and zero `test.skip` escape hatches.
- The `LowStockBadge` RBAC fix is a small, self-contained production change (`src/pages/inventory/index.tsx`) — worth a note for the next phase touching `/inventory` or its role-visibility surfaces.
- The orphaned `features/override-negative-stock` finding (`.planning/WINDOWS.md` #18) and the shared-verification-environment contention finding (`.planning/WINDOWS.md` #19) are both recorded for future-phase awareness; neither blocks this plan's own completion.

## Self-Check: PASSED

- Confirmed all 5 new `e2e/inventory/*.spec.ts` files exist on disk.
- Confirmed all 5 original root spec files no longer exist.
- Confirmed commits `fc6de97` and `6ad40f0` exist in `git log`.
- `npm run typecheck` passes.
- `npm run lint` (scoped to `src/`, this repo's own convention) passes.
