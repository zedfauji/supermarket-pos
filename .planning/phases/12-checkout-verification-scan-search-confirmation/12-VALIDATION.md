---
phase: 12
slug: checkout-verification-scan-search-confirmation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.59 (E2E) + Vitest 4 (unit) — both already configured |
| **Config file** | `supermarket-pos/playwright.config.ts` (E2E), `supermarket-pos/vitest.config.ts` (unit) |
| **Quick run command** | `npx playwright test e2e/51-barcode-scan-search.spec.ts` |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~90 seconds (single spec) / full suite varies |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test e2e/51-barcode-scan-search.spec.ts`
- **After every plan wave:** Run `npm run test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | VER-01 | — | Clean match adds to cart with no confirmation UI | E2E | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | ✅ existing test extends | ⬜ pending |
| 12-01-02 | 01 | 1 | VER-01 | — | Zero-price product surfaces confirm toast; item absent from cart until confirmed | E2E | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | VER-01 | — | Low-stock product (`quantity_on_hand <= low_stock_threshold`) surfaces confirm toast | E2E | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | VER-01 | — | Confirming adds the item; dismissing leaves cart unchanged (both branches) | E2E | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 1 | VER-02 | — | Manual-search tile/confirm shows name, price, barcode before commit | E2E | `npx playwright test e2e/51-barcode-scan-search.spec.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | VER-01/VER-02 | — | `getProductRiskFlag()` pure predicate correctness (multi-branch: clean/inactive/zero-price/low-stock) | unit | `npx vitest run src/entities/product/model/productRiskFlag.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/51-barcode-scan-search.spec.ts` — add new test cases for zero-price confirm, low-stock confirm, confirm/cancel outcomes (both scan and manual-search entry points), and the barcode-line-in-ProductCard/confirm-UI assertion. Use the file's existing `admin.from(...).update(...)` seed/restore pattern (via `getServiceClient()`) with a `finally` block restoring original values.
- [ ] `src/entities/product/model/productRiskFlag.test.ts` — new Vitest unit test co-located with the new `getProductRiskFlag()` pure function per CLAUDE.md's co-location convention.

*Existing infrastructure (Playwright config, Vitest config, seed/restore helpers) covers the rest of this phase's requirements — no new framework install needed.*

---

## Manual-Only Verifications

*None — per CLAUDE.md's Testing & Verification Policy, all verification in this project must be automated Playwright E2E (or Vitest unit for pure functions). `human_needed`/manual UAT is not a valid terminal state.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
