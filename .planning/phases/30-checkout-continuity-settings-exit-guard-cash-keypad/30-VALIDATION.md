---
phase: 30
slug: checkout-continuity-settings-exit-guard-cash-keypad
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-08
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.0 (jsdom unit/integration) and Playwright 1.59.1 (Chromium E2E) |
| **Config file** | `vitest.config.ts`; `playwright.config.ts` |
| **Quick run command** | `npm test -- src/entities/tab/model/cartStore.test.ts src/features/checkout-sale/model/useCheckoutSale.test.ts src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx src/widgets/PaymentModal/ui/PaymentForm.test.tsx` |
| **Full suite command** | `npm run lint && npm run typecheck && npm test && npm run test:integration && npm run test:e2e` |
| **Estimated runtime** | Measure during Wave 0 and keep task-level feedback under 60 seconds |

## Sampling Rate

- **After every task commit:** Run the narrowest command listed for that task.
- **After every plan wave:** Run all Phase 30 unit/component tests plus the affected integration or E2E specs.
- **Before `$gsd-verify-work`:** The full suite command must be green.
- **Max feedback latency:** 60 seconds for task-level checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-TBD | TBD | 0 | CART-01, CART-03 | TBD | Persist only schema-validated non-sensitive recovery state | unit + E2E | `npm test -- src/entities/tab/model/cartStore.test.ts`; `npm run test:e2e -- e2e/payments/checkout-continuity.spec.ts --project=chromium` | unit ✅ / E2E ❌ W0 | ⬜ pending |
| 30-TBD | TBD | 0 | CART-02 | TBD | Serialized checkout draft excludes PIN, credential, and raw-card fields | unit + E2E | `npm test -- src/widgets/PaymentModal/ui/PaymentForm.test.tsx`; `npm run test:e2e -- e2e/payments/checkout-continuity.spec.ts --project=chromium` | unit ✅ / E2E ❌ W0 | ⬜ pending |
| 30-TBD | TBD | 0 | CART-04 | TBD | Retry is locked behind reconciliation under the original idempotency key | unit + integration + E2E | `npm test -- src/features/checkout-sale/model/useCheckoutSale.test.ts`; `npm exec vitest run --project integration src/features/checkout-sale/model/reconcileDirectSale.integration.test.ts --reporter=dot` | unit ✅ / integration ❌ W0 | ⬜ pending |
| 30-TBD | TBD | 0 | SET-01, SET-02 | TBD | Dirty settings cannot be lost through in-app navigation or Tauri close | component + E2E | `npm test -- src/features/guard-settings-exit/model/SettingsExitGuardProvider.test.tsx src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx`; `npm run test:e2e -- e2e/settings/settings-exit-guard.spec.ts --project=chromium` | panel ✅ / provider and E2E ❌ W0 | ⬜ pending |
| 30-TBD | TBD | 0 | KEYPAD-01 | TBD | Keypad is cash-only, keyboard-accessible, and inert during processing | unit + component + E2E | `npm test -- src/features/cash-tender-keypad/model/cashTenderBuffer.test.ts src/features/cash-tender-keypad/ui/CashTenderInput.test.tsx src/widgets/PaymentModal/ui/PaymentForm.test.tsx`; `npm run test:e2e -- e2e/payments/cash-tender-keypad.spec.ts --project=chromium` | PaymentForm ✅ / new tests ❌ W0 | ⬜ pending |

*Task IDs, plan numbers, waves, and threat references are finalized when PLAN.md files are created.*

## Wave 0 Requirements

- [ ] `e2e/payments/checkout-continuity.spec.ts` — restart, draft restore, reconciliation, and cleanup coverage for CART-01 through CART-04.
- [ ] `src/features/checkout-sale/model/reconcileDirectSale.integration.test.ts` — real-Supabase idempotency reconciliation for CART-04.
- [ ] `src/features/guard-settings-exit/model/SettingsExitGuardProvider.test.tsx` — shared dirty-form exit orchestration for SET-01 and SET-02.
- [ ] `e2e/settings/settings-exit-guard.spec.ts` — Save/Discard/Stay coverage for route, sign-out, and Tauri-close paths.
- [ ] `src/features/cash-tender-keypad/model/cashTenderBuffer.test.ts` — cash amount buffer transitions for KEYPAD-01.
- [ ] `src/features/cash-tender-keypad/ui/CashTenderInput.test.tsx` — pointer, keyboard, focus, labels, and processing-state coverage.
- [ ] `e2e/payments/cash-tender-keypad.spec.ts` — cash-only keypad behavior in primary and split tender flows.

## Manual-Only Verifications

All phase behaviors require automated verification; Tauri close behavior may use a mocked close-request event at component level plus Playwright coverage of the user-visible guard.

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Feedback latency is under 60 seconds.
- [ ] `nyquist_compliant: true` is set in frontmatter.

**Approval:** pending
