---
phase: 17-e2e-suite-overhaul
plan: 14
subsystem: testing
tags: [playwright, e2e, i18n, locale, checkout, refund, inventory]

requires:
  - phase: 17-04
    provides: Checkout E2E foundation (e2e/checkout/*.spec.ts, Indian catalog fixture pattern, db-assertions helpers)
  - phase: 17-05
    provides: Payments/refund E2E split-out pattern (e2e/payments/refund.spec.ts's seedPaidTab/enterManagerPin shape)
provides:
  - e2e/home/home-navigation.spec.ts — genericized removed-route fixtures, locale-agnostic throughout
  - e2e/a11y/focus-tab-order.spec.ts — Surface (a) (ManagerPinDialog Tab order) restored via RefundSheet's live PIN gate
  - e2e/errors/error-scenarios-and-validation.spec.ts — merged, every /pos-deletion-era Bucket-B skip resolved
  - A fixed e2e/helpers/supabase.ts:seedOpenTab — deterministic staff lookup instead of "any profile with this role"
affects: [phase-17-wave-3-e2e, e2e-suite, checkout-tests, home-navigation-tests, a11y-tests]

actuals:
  tokens: 22345
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Locale-agnostic (es-MX/en-US) regex constants for every UI string a spec authors or touches, not just the ones the plan's own read_first flagged — every E2E fixture account's locale is now confirmed unreliable, not just admin/manager."
    - "Shared-fixture stock mutations in E2E specs restore original state via try/finally, never a tail statement, so a mid-test assertion failure can't leave a shared product (or any other cross-file fixture) corrupted for the rest of the suite."

key-files:
  created:
    - e2e/home/home-navigation.spec.ts
    - e2e/a11y/focus-tab-order.spec.ts
    - e2e/errors/error-scenarios-and-validation.spec.ts
    - .planning/phases/17-e2e-suite-overhaul/deferred-items.md
  modified:
    - e2e/helpers/supabase.ts

key-decisions:
  - "ER6 (out-of-stock ordering) rewritten against the real current UX — useConfirmRiskyAdd's add-to-cart-time 'Only N left' confirm toast — not the checkout-submit-time raw-Postgres-message path the plan's own read_first anticipated; the latter is real but narrower (only reachable after explicitly confirming the risky add) and is logged to deferred-items.md instead of silently assumed away."
  - "ER4 and FV1-FV3 deleted (confirmed obsolete/redundant) rather than force-retargeted: direct-sale checkout has no tab-switching UI and no user-typed customer-name field at all in the current app, so there is no live UI affordance left to rewrite these against."
  - "seedOpenTab's staff lookup fixed to prefer the pinned E2E_*_NAME fixture account over 'any profile with this role' — the DB now carries dozens of profiles per role from other phases' seed data, making the old lookup non-deterministic against whichever staff member loginAs() actually authenticates as."

requirements-completed: [TEST-01, TEST-02]

coverage:
  - id: D1
    description: "15-home-navigation.spec.ts's removed-route redirect test no longer names specific bar-pos routes as fixture data; /pos correctly dropped from the removed-routes list since it's a live route."
    requirement: TEST-01
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/home/home-navigation.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "44-focus-tab-order.spec.ts's permanently-gone Surface (a) replaced with a real test driving ManagerPinDialog's Tab order through RefundSheet's live PIN gate."
    requirement: TEST-01
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/a11y/focus-tab-order.spec.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "20-error-scenarios.spec.ts's ER1 deleted, ER3/ER6 rewritten against current /pos UI, ER4 deleted as confirmed-redundant with e2e/47-edit-paid-tab.spec.ts."
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/errors/error-scenarios-and-validation.spec.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "26-field-validation.spec.ts's FV1-FV3 deleted as confirmed-obsolete (no customer-name field in current checkout), FV4/FV5 retargeted at CartItem's real per-item notes field (maxLength=200)."
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/errors/error-scenarios-and-validation.spec.ts"
        status: pass
    human_judgment: false

duration: 90min
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 14: Cross-Cutting Bucket-B Skip Resolution Summary

**Resolved every remaining /pos-deletion-era `test.skip` across 4 files by rewriting against the current UI (or confirming redundant/obsolete), and — as a direct consequence of actually running these files end-to-end for the first time — fixed a real, reproducible locale-contamination and stale-fixture pattern affecting the whole E2E suite's shared account/product state.**

## Performance

- **Duration:** ~90 min (includes extensive live-verification iteration against the shared self-hosted Supabase stack and dev server)
- **Tasks:** 3/3
- **Files modified:** 8 (3 created specs, 4 deleted root specs, 1 helper fix, 1 new deferred-items log)

## Accomplishments

- `e2e/home/home-navigation.spec.ts`: removed-route fixture list genericized (no more bar-pos route names as fixture data, `/pos` correctly dropped since it's a live route), and every button/text assertion in the file hardened to be locale-agnostic (es-MX/en-US) after reproducing a real failure caused by the shared admin/cashier E2E fixture accounts not reliably rendering en-US.
- `e2e/a11y/focus-tab-order.spec.ts`: Surface (a)'s permanently-skipped placeholder replaced with a real ManagerPinDialog Tab-order test driven through RefundSheet's still-live "Request approval" PIN gate. Along the way, actually running Surfaces (b)/(c) for the first time in a long while surfaced two real staleness bugs in the pre-existing test bodies (Backspace-disabled-while-PIN-empty ordering, and a Reason `<select>` added to the Batch Adjustment dialog since this test was last authored) — both fixed.
- `e2e/errors/error-scenarios-and-validation.spec.ts`: merged from the two source files; ER1 deleted (pool-session domain, D-08), ER3 and ER6 rewritten against the current `/pos` checkout flow (ER6 against the real `useConfirmRiskyAdd` low-stock confirm-toast gate, not the raw-Postgres-message DB-constraint path originally assumed), ER4 and FV1-FV3 deleted as confirmed-obsolete/redundant, FV4/FV5 retargeted at `CartItem`'s real per-item notes field. ER2/ER5/ER7/ER8 and FV6-FV9 preserved verbatim.
- `e2e/helpers/supabase.ts`: fixed `seedOpenTab`'s non-deterministic "any profile with this role" staff lookup (root cause of ER5's first real run failing) — now prefers the pinned `E2E_*_NAME` fixture account, benefiting every other caller of this shared helper too.
- Logged one confirmed, out-of-scope production bug (`DIRECT_SALE_FAILED` leaking a raw Postgres constraint message) to `deferred-items.md` and the cross-phase `WINDOWS.md` ledger (#18) instead of fixing it — outside this plan's `files_modified` (e2e-only).

## Task Commits

1. **Task 1: e2e/home/home-navigation.spec.ts — genericize the removed-route fixture list** — `a0fdd31` (test), locale-agnostic follow-up — `b704fea` (fix)
2. **Task 2: e2e/a11y/focus-tab-order.spec.ts — resolve Surface (a)** — `288c47c` (test)
3. **Task 3: e2e/errors/error-scenarios-and-validation.spec.ts — merge and resolve remaining Bucket-B skips** — `e2702b1` (test)

## Files Created/Modified

- `e2e/home/home-navigation.spec.ts` (new) / `e2e/15-home-navigation.spec.ts` (deleted)
- `e2e/a11y/focus-tab-order.spec.ts` (new) / `e2e/44-focus-tab-order.spec.ts` (deleted)
- `e2e/errors/error-scenarios-and-validation.spec.ts` (new) / `e2e/20-error-scenarios.spec.ts`, `e2e/26-field-validation.spec.ts` (deleted)
- `e2e/helpers/supabase.ts` — `seedOpenTab` staff-lookup fix
- `.planning/phases/17-e2e-suite-overhaul/deferred-items.md` (new)
- `.planning/WINDOWS.md` — ledger entry #18 (DIRECT_SALE_FAILED raw-message leak)

## Decisions Made

- ER6 targets the real, already-shipped out-of-stock UX (add-to-cart-time confirm toast) rather than a checkout-submit-time DB-constraint path that turned out to leak raw Postgres text — a real gap, but narrower and out of this plan's file scope, so logged rather than silently ignored or silently fixed outside scope.
- ER4 and FV1-FV3 deleted rather than force-retargeted, since the current app genuinely has no UI affordance left for either premise (tab-switching on `/pos`, or a user-typed customer name).
- Every `/pos`-touching assertion this plan authored (and every string in `e2e/home/home-navigation.spec.ts` this plan touched) is locale-agnostic — this repo's shared E2E fixture accounts (cashier/manager/admin) are not reliably any one locale at test time, confirmed via reproduced failures during this plan's own verification, not assumed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `seedOpenTab`'s non-deterministic staff lookup**
- **Found during:** Task 3, verifying ER5 for the first time (it never compiled before this plan added the missing required `productName` param)
- **Issue:** `seedOpenTab` picked "any profile with role X" via `.limit(1).single()`, which can differ from the staff member `loginAs(page, role)` actually authenticates as once the DB carries many profiles per role (other phases seed dozens over a full suite run) — the seeded tab's shift then belongs to a different staff member than the logged-in session, so it never appears in that session's tab list.
- **Fix:** Added `findRoleStaffId`, preferring the pinned `E2E_*_NAME` env-var-matched profile, falling back to the old "first profile with this role" behavior — backward compatible for every other caller.
- **Files modified:** `e2e/helpers/supabase.ts`
- **Verification:** ER5 passes reliably across multiple clean runs.
- **Committed in:** `e2702b1`

**2. [Rule 1 - Bug] Locale-agnostic hardening across all 3 rewritten/touched files**
- **Found during:** Tasks 1-3, reproduced via failed-run screenshots (es-MX "Buscar productos" placeholder, "Ajustes"/"Reportes" tile labels, "Se requiere acceso de gerente" dialog title, "Tecla 0" PIN button)
- **Issue:** Every hardcoded English-only UI-text/button-label assertion this plan authored or touched was silently coupled to one locale, despite this repo's own documented house style (17-PATTERNS.md) mandating locale-agnostic matching everywhere.
- **Fix:** Added locale-agnostic regex constants (es-MX/en-US) for every such string; kept UNTOUCHED tests (ER2, ER5, ER7, ER8, FV6-FV9, Surfaces already covered) as their original hardcoded-English form per the plan's "preserve verbatim" instruction — this is a suite-wide latent issue, not something this one plan can or should fix wholesale.
- **Files modified:** `e2e/home/home-navigation.spec.ts`, `e2e/a11y/focus-tab-order.spec.ts`, `e2e/errors/error-scenarios-and-validation.spec.ts`
- **Verification:** Repeated full runs of the combined `e2e/home/ e2e/a11y/ e2e/errors/` suite (29 tests) came back clean (24 passed, 5 expected skips, 0 failed) after the fix.
- **Committed in:** `a0fdd31`, `288c47c`, `b704fea`, `e2702b1`

**3. [Rule 1 - Bug] Pre-existing staleness in focus-tab-order.spec.ts Surfaces (b)/(c)**
- **Found during:** Task 2, running Surface (c) for the first time since a Reason `<select>` was added to the Batch Adjustment dialog
- **Issue:** Surface (a)'s new Tab-order walk didn't account for PINKeypad's Backspace button being `disabled` while the PIN is empty (a disabled button is skipped as a Tab stop); Surface (c)'s walk didn't account for the Reason `<select>` now sitting between the quantity-delta input and the dialog's footer buttons.
- **Fix:** Enter one digit before starting Surface (a)'s walk; add the Reason-select Tab stop to Surface (c)'s walk.
- **Files modified:** `e2e/a11y/focus-tab-order.spec.ts`
- **Verification:** All 3 surfaces pass.
- **Committed in:** `288c47c`

**Total deviations:** 3 auto-fixed (1x Rule 3, 2x Rule 1)

### Out-of-scope discoveries (not fixed, logged)

**DIRECT_SALE_FAILED leaks a raw Postgres constraint message** — confirmed via a direct RPC call that selling the last unit of a plain (non-open-unit) product returns `{code: 'DIRECT_SALE_FAILED', message: 'new row for relation "inventory" violates check constraint...'}`, which reaches the checkout UI verbatim (no `processRefund.genericError`-style translated fallback exists for this path). Out of this plan's `e2e/*.spec.ts`-only file scope. Logged to `.planning/phases/17-e2e-suite-overhaul/deferred-items.md` and `.planning/WINDOWS.md` (#18).

## Verification

- `npx playwright test e2e/home/home-navigation.spec.ts` — 14/14 pass
- `npx playwright test e2e/a11y/focus-tab-order.spec.ts` — 3/3 pass
- `npx playwright test e2e/errors/error-scenarios-and-validation.spec.ts` — 7/7 real assertions pass (ER8/FV6/FV7/FV9 pre-existing intentional/EXPECTED-FAIL runtime skips)
- `npx playwright test e2e/home/ e2e/a11y/ e2e/errors/` (combined, 29 tests) — 24 passed, 5 skipped, 0 failed (repeated clean run after all fixes)
- Acceptance-criteria greps: `grep -icE "pool_tables|pool-tables|pool session"` → 0; `grep -c "test.skip('"` → 0; both original root files confirmed deleted

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. T-17-20 (out-of-stock/closed-caja guard coverage) is mitigated per the plan's threat model: ER3/ER6's resolution ensures this domain's coverage is real, not silently absent.

## Self-Check: PASSED

- `e2e/home/home-navigation.spec.ts`, `e2e/a11y/focus-tab-order.spec.ts`, `e2e/errors/error-scenarios-and-validation.spec.ts` all confirmed present.
- `e2e/15-home-navigation.spec.ts`, `e2e/44-focus-tab-order.spec.ts`, `e2e/20-error-scenarios.spec.ts`, `e2e/26-field-validation.spec.ts` all confirmed deleted.
- All 4 commit hashes (`a0fdd31`, `288c47c`, `b704fea`, `e2702b1`) confirmed present in `git log`.
