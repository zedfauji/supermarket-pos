---
phase: "27"
slug: "promotions-discount-management"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-01"
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.4 (unit, incl. `fast-check` property tests) + Playwright ^1.59.1 (E2E) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| **Quick run command** | `npx vitest run src/entities/promotion/model/promotion-pricing.test.ts` |
| **Full suite command** | `npm run test && npm run test:e2e` |
| **Estimated runtime** | ~90s unit, ~8-12min full E2E suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>` plus the single relevant Playwright spec
- **After every plan wave:** Run `npm run test` (full unit suite) and the new `e2e/promotions/` folder
- **Before `/gsd-verify-work`:** Full suite (`npm run test:e2e`) must be green — per this repo's CLAUDE.md mandatory-automated-testing policy, `human_needed`/manual UAT is not a valid terminal state for this phase
- **Max feedback latency:** 90 seconds (unit); Playwright spec runs are the outer bound at task-commit granularity

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | PROMO-01 | T-27-01 | `manage_promotions` RBAC enforced client + RLS server-side | unit + E2E | `npx playwright test e2e/promotions/promotion-crud.spec.ts` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | PROMO-02 | — | Expiry-proximity trigger reuses `near_expiry` threshold | unit | `npx vitest run src/entities/promotion/model/promotion-pricing.test.ts` | ❌ W0 | ⬜ pending |
| 27-02-01 | 02 | 2 | PROMO-03 | T-27-02 | Server RPC is sole price authority, client display only | E2E | `npx playwright test e2e/checkout/promotion-live-price.spec.ts` | ❌ W0 | ⬜ pending |
| 27-02-02 | 02 | 2 | PROMO-04 | — | Best-price-wins deterministic resolution across overlapping promotions | unit (property-based, `fast-check`) | `npx vitest run src/entities/promotion/model/promotion-pricing.test.ts` | ❌ W0 | ⬜ pending |
| 27-03-01 | 03 | 3 | PROMO-05 | T-27-03 | Ad-hoc discount requires manager PIN, mirrors refund-PIN pattern | E2E | `npx playwright test e2e/payments/apply-promotion-and-custom-discount.spec.ts` | ❌ W0 | ⬜ pending |
| 27-03-02 | 03 | 3 | PROMO-06 | — | Snapshot at sale time survives promotion edit/delete; refund/reopen restores it; margin report uses discounted price | E2E | `npx playwright test e2e/payments/promotion-snapshot-refund-reopen.spec.ts` | ❌ W0 | ⬜ pending |
| 27-04-01 | 04 | 4 | PROMO-07 | T-27-04 | Floor guard blocks below-cost combinations atomically in the RPC | E2E | `npx playwright test e2e/errors/promotion-floor-guard.spec.ts` | ❌ W0 | ⬜ pending |
| 27-04-02 | 04 | 4 | PROMO-08 | — | Offline snapshot + changed-promotion conflict flag on reconnect | E2E | `npx playwright test e2e/infra/offline-promotion-conflict.spec.ts` | ❌ W0 | ⬜ pending |
| 27-05-01 | 05 | 5 | PROMO-09 | — | Full scenario matrix incl. loose-weight/open-unit interaction, store-local timezone boundaries | E2E | `npx playwright test e2e/promotions/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs above are provisional — the planner assigns final plan/wave numbers; this table is a coverage map per REQ-ID, not a lock on plan structure.*

---

## Wave 0 Requirements

- [ ] New folder `e2e/promotions/` — no existing coverage for promotion CRUD, scope resolution, or the expiry-proximity trigger
- [ ] `src/entities/promotion/model/promotion-pricing.test.ts` — unit + `fast-check` property tests for `evaluateBestPromotion()` (best-price-wins, tie-break by creation date, floor-guard boundary at exactly cost)
- [ ] Extend `e2e/payments/` with the ad-hoc-discount-vs-applied-promotion coexistence scenario and the below-cost manager-override dialog
- [ ] Extend `e2e/infra/` with the offline-then-promotion-changed conflict flag (PROMO-08) — this repo's offline queue tests live under `e2e/infra/`
- [ ] A TS/plpgsql parity test asserting `evaluateBestPromotion()` matches the RPC's server-side computation for the same input matrix — imitate `edge-tax.test.ts`'s structure

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification. Per this repo's CLAUDE.md, `human_needed`/manual UAT is not a valid terminal state for this phase; the sole documented carve-out (native Tauri window shell, physical USB-HID PIN keypad, Supabase local devtools UI) does not apply to any Phase 27 behavior.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (unit tier)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
