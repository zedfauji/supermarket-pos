---
phase: 17-e2e-suite-overhaul
plan: 04
subsystem: testing
tags: [playwright, supabase, checkout, direct-sale, barcode]
requires:
  - phase: 17-01
    provides: Playwright checkout foundation and database assertion helpers
  - phase: 17-02
    provides: Indian grocery E2E catalog fixtures
  - phase: 17-03
    provides: checkout-folder verification-report classification
provides:
  - Checkout E2E specs split into happy-path, atomic RPC guard, and barcode-search coverage
  - Indian catalog assertions for cashier checkout and product discovery
  - Preserved direct-sale adversarial coverage and folder-based report classification
affects: [phase-17-wave-3-e2e, checkout-tests, verification-report]
tech-stack:
  added: []
  patterns: [checkout folder E2E specs, keyboard-safe category selection]
key-files:
  created:
    - e2e/checkout/happy-path.spec.ts
    - e2e/checkout/atomic-rpc-guards.spec.ts
    - e2e/checkout/barcode-scan-search.spec.ts
  modified:
    - e2e/50-direct-sale-checkout.spec.ts (removed after split)
    - e2e/51-barcode-scan-search.spec.ts (removed after split)
key-decisions:
  - "Use Haldiram's Aloo Bhujia as the primary packaged checkout fixture with Parle-G and MDH products for multi-product coverage."
  - "Select the occluded category tab by its supported keyboard interaction and assert aria-pressed before checking filtered cards."
actuals:
  tokens: 14730
  tasks: 2
  commits: 2
requirements-completed: [TEST-01, TEST-02, TEST-03, TEST-04]
coverage:
  - id: D1
    description: Checkout cash, card, and split-payment flow records the corresponding sale data.
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: npx playwright test e2e/checkout/
        status: pass
    human_judgment: false
  - id: D2
    description: Atomic direct-sale RPC rejects tampering and replay attempts without weakening existing guards.
    requirement: TEST-03
    verification:
      - kind: e2e
        ref: e2e/checkout/atomic-rpc-guards.spec.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Barcode and search coverage uses active Indian catalog products, including inactive scans and category filtering.
    requirement: TEST-04
    verification:
      - kind: e2e
        ref: e2e/checkout/barcode-scan-search.spec.ts
        status: pass
    human_judgment: false
duration: 28min
completed: 2026-08-25
status: complete
---

# Phase 17 Plan 04: Checkout E2E Split Summary

**Checkout E2E coverage now uses Indian grocery fixtures across happy payments, atomic RPC guards, and barcode/search flows.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-08-25T15:13:30Z
- **Completed:** 2026-08-25T15:41:13Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Split the former root checkout specs into three focused `e2e/checkout/` files.
- Preserved all 25 direct-sale tests, including 10+ explicit rejection cases and idempotency/replay guards.
- Verified 37 checkout tests against local Supabase; the generated report classifies all 37 under Checkout.

## Task Commits

1. **Task 1: Checkout happy-path coverage** — `1388689` (test)
2. **Task 2: Atomic RPC guards and barcode/search coverage** — `d06d772` (test)

## Files Created/Modified

- `e2e/checkout/happy-path.spec.ts` — DB-verified cash, card, and split checkout flows.
- `e2e/checkout/atomic-rpc-guards.spec.ts` — direct-sale atomic RPC validation, idempotency, and replay tests.
- `e2e/checkout/barcode-scan-search.spec.ts` — Indian-catalog barcode, inactive product, manual search, and category filtering tests.
- `e2e/50-direct-sale-checkout.spec.ts` — removed after split.
- `e2e/51-barcode-scan-search.spec.ts` — removed after split.

## Decisions Made

- Reused the seeded packaged-goods catalog rather than adding fixtures or dependencies.
- Asserted category activation through `aria-pressed` before asserting filtered product cards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stabilized the category selector test when the category pill is covered by the search input.**
- **Found during:** Task 2
- **Issue:** Pointer clicks could not reach the category button; forced clicks did not prove the filter state.
- **Fix:** Focused the semantic button, pressed Enter through its supported keyboard handler, and asserted `aria-pressed` before checking results.
- **Files modified:** `e2e/checkout/barcode-scan-search.spec.ts`
- **Verification:** Focused category and inactive-product Playwright tests pass; full checkout suite passes.
- **Committed in:** `d06d772`

**Total deviations:** 1 auto-fixed (Rule 1)

## Verification

- `npm run typecheck` — pass
- `FAST_E2E=1 npx playwright test e2e/checkout/ --reporter=list` — 37 passed
- `FAST_E2E=1 npx playwright test e2e/checkout/` — 37 passed
- `VERIFICATION_REPORT.md` — Checkout: 37 total, 37 pass, 0 fail
- Original checkout test count: 25; happy-path + atomic guard count: 25

## Known Stubs

None.

## Next Phase Readiness

Wave 3 can use `e2e/checkout/` as the tested folder-layout and Indian-fixture reference.

## Self-Check: PASSED

- All three checkout spec files exist.
- Both task commits exist in git history.
