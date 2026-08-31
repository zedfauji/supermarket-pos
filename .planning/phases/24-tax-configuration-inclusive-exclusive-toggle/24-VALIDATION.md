---
phase: 24
slug: tax-configuration-inclusive-exclusive-toggle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (E2E) — both already configured |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| **Quick run command** | `npx vitest run <touched test file>` |
| **Full suite command** | `npm run test` (unit) / `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~30s unit / ~10min full E2E |

---

## Sampling Rate

- **After every task commit:** Run the specific test file(s) touched by that task
- **After every plan wave:** Run `npm run test` (full unit suite)
- **Before `/gsd-verify-work`:** `npm run test:e2e` full suite must be green (all 6 affected specs below, plus `e2e/checkout/*`, `e2e/receipts/*`, `e2e/payments/*`)
- **Max feedback latency:** 30s (unit) / 600s (E2E)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 0 | TAX-01..05 | — | Wave 0 fixture/helper updates land before mode-aware logic | unit | `npm run test` | ✅ W0 | ⬜ pending |
| 24-0X-0X | TBD | TBD | TAX-01 | — | `taxInclusive` persists via admin form | unit | `npx vitest run src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx` | ✅ | ⬜ pending |
| 24-0X-0X | TBD | TBD | TAX-02 | — | Inclusive mode: total unchanged, tax decomposed backward | unit + property | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` | ✅ (needs new fixture) | ⬜ pending |
| 24-0X-0X | TBD | TBD | TAX-03 | — | Exclusive mode: additive math unchanged | unit | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` | ✅ (needs nonzero-rate case) | ⬜ pending |
| 24-0X-0X | TBD | TBD | TAX-04 | T-24-01 | Anti-tamper RPC guard accepts/rejects totals per active mode | E2E | `npx playwright test e2e/checkout/atomic-rpc-guards.spec.ts` | ✅ (needs mode-aware helper) | ⬜ pending |
| 24-0X-0X | TBD | TBD | TAX-05 | — | Receipts show decomposed subtotal+tax+total in both modes | unit | `npx vitest run src/shared/lib/receipt-format.test.ts` | ✅ (needs fixture fields) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Planner fills in exact plan/wave/task IDs when PLAN.md is created.*

---

## Wave 0 Requirements

- [ ] `e2e/helpers/tax.ts` (recommended) — shared mode-aware `computeAuthoritativeTotal`/`getTaxRatePercent` helper, replacing the duplicated additive-only helper currently copy-pasted into 6 specs: `e2e/checkout/atomic-rpc-guards.spec.ts`, `e2e/soak/full-day-soak.spec.ts`, `e2e/tabs/reopen-closed-ticket.spec.ts`, `e2e/reports/report-tabs.spec.ts`, `e2e/inventory/loose-weight-hold-sale.spec.ts`, `e2e/infra/offline.spec.ts`. If the planner instead patches each spec independently, this file is skipped but all 6 still need updating for mode-awareness before D-01's `taxInclusive=true` default ships (otherwise all 6 assert the wrong expected total).
- [ ] Fixture updates (field additions, not new files) — `receipt-format.test.ts`, `receipt-pdf.test.ts`, `email-receipt.test.ts`, `ReceiptPreview.test.tsx`/`.stories.tsx`, `BillingSettingsTab.test.tsx`, `billing-settings.test.ts`, `PaymentForm.test.tsx` (existing cases all use `taxRatePercent: 0`, degenerate for both modes — add nonzero-rate inclusive AND exclusive cases).
- [ ] Property-based test for inclusive-mode rounding (`fast-check`) — no existing file covers this; add to `PaymentForm.test.tsx` or a new `src/shared/lib/tax.test.ts` if the formula is extracted into a shared client util.

---

## Manual-Only Verifications

*None — this project's CLAUDE.md testing policy prohibits manual/human verification as a terminal state. All phase behaviors above have automated (unit or Playwright E2E) coverage.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 600s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
