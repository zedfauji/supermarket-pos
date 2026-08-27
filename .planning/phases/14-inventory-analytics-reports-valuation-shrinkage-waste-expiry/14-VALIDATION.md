---
phase: 14
slug: inventory-analytics-reports-valuation-shrinkage-waste-expiry
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-19
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4 (unit) + React Testing Library v16 + Playwright v1.59 (E2E) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (E2E, `channel: 'chrome'`, `headless: true`) |
| **Quick run command** | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts` |
| **Full suite command** | `npm run test` (unit), `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~10 seconds (unit), ~5 minutes (full E2E suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/entities/inventory/model/queries-analytics.test.ts`
- **After every plan wave:** Run `npm run test` (full unit suite) + `npm run typecheck` + `npm run lint`
- **Before `/gsd-verify-work`:** `npm run test:e2e` (or targeted spec files) must be green — no `human_needed` terminal states, per this repo's CLAUDE.md mandatory-automated-testing policy
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-TBD | TBD | 0 | INVR-01 | — | `computeInventoryValueAsOf` reconstructs qty × current cost correctly against fixture movements | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t valuation` | ❌ W0 | ⬜ pending |
| 14-01-TBD | TBD | 0 | INVR-02 | — | `groupShrinkageByReason` buckets waste/correction correctly, excludes sale/refund, buckets pre-feature `manual_adjustment` as unclassified (D-02) | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t shrinkage` | ❌ W0 | ⬜ pending |
| 14-01-TBD | TBD | 0 | INVR-03 | — | Expiry-loss filter isolates `reason='expired'` rows only, once `expired` reason exists | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t expiry` | ❌ W0 | ⬜ pending |
| 14-01-TBD | TBD | 0 | INVR-04 | — | Turnover combines `useProductSalesReport` units with valuation-reconstruction average correctly | unit | `npx vitest run src/entities/inventory/model/queries-analytics.test.ts -t turnover` | ❌ W0 | ⬜ pending |
| 14-01-TBD | TBD | 0 | Success criterion 5 (formulas auditable/reconcile) | — | Formula string renders in each report's UI; report totals reconcile with tagged `stock_movements` sums for known fixture data | E2E + unit | `npx playwright test e2e/<new-or-extended-spec>.spec.ts` (seed known movements via `getServiceClient`/`resetTestState` helpers per `e2e/07-reports.spec.ts` pattern) + fixture-pinned unit assertions | ❌ W0 | ⬜ pending |
| 14-01-TBD | TBD | 0 | D-01 (reason picker) | — | Picker exposes exactly 6 values, excludes bar-pos-era reasons, `expired` persists and reads back correctly | E2E | `npx playwright test e2e/10-inventory.spec.ts` (extend existing spec) or new spec | Verify during planning whether `e2e/10-inventory.spec.ts` already covers the batch-adjust dialog | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs finalize once the planner assigns plan/task numbers — this table is a requirement→test map, not yet task-anchored.*

---

## Wave 0 Requirements

- [ ] `src/entities/inventory/model/queries-analytics.ts` — the 4 report queries + shared `computeInventoryValueAsOf` helper (does not exist yet)
- [ ] `src/entities/inventory/model/queries-analytics.test.ts` — fixture-pinned unit tests for all 4 formulas, mirroring the existing pure-function-extraction pattern in `src/entities/tab/model/queries-reports.test.ts` (`computePctTotals`, `fillMissingHours`, etc.)
- [ ] `supabase/migrations/<timestamp>_add_expired_reason.sql` — new CHECK constraint migration adding `expired` to `stock_movements_reason_check` AND to both `InventoryAdjustReasonSchema`/`StockMovementReasonSchema` in `domain.ts`
- [ ] E2E coverage for the reason picker (D-01) and the new report tab (D-06) — check whether `e2e/10-inventory.spec.ts` and/or `e2e/07-reports.spec.ts` are the right extension points before creating new spec files (this repo's convention favors extending existing numbered specs over new files when the surface is closely related)

---

## Manual-Only Verifications

*None. All phase behaviors have automated verification — per this repo's CLAUDE.md mandatory-automated-testing policy, `human_needed` is not a valid terminal state.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
