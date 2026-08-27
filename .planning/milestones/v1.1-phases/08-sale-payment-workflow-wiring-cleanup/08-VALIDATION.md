---
phase: 08
slug: sale-payment-workflow-wiring-cleanup
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-17
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit) + Playwright 1.59 (E2E) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run <changed test file>` / `npx playwright test <spec file>` |
| **Full suite command** | `npm run test` / `npm run test:e2e` |
| **Estimated runtime** | ~30s (unit) / ~2-5min (targeted E2E specs) |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SALE-04 | T-08-04 | `isOnline()` fail-fast guard returns immediately instead of hanging on `fetch()` until browser network timeout | e2e | `npx playwright test e2e/50-direct-sale-checkout.spec.ts -g "offline before checkout submit shows blocking dialog instead of hanging"` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | SALE-04 | T-08-05 | Primary button stays disabled while isProcessing; Try Again re-invokes handlePrimary/handleSplitPrimary rather than a raw duplicate network call | e2e | `npx playwright test e2e/50-direct-sale-checkout.spec.ts -g "Try Again after reconnecting\|Cancel on offline dialog\|split.*offline"` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 1 | SALE-06 | T-08-06 / T-08-07 | `ProcessRefundInputSchema.safeParse()` fail-fast client-side (qty>0, amount>0, non-empty, no duplicate order_item_id) before any network call; `as any` cast removal restores compile-time type checking | unit (TDD) | `npx vitest run src/features/process-refund/model/useProcessRefund.test.ts` | ✅ W0 (test file created by task) | ⬜ pending |
| 08-03-01 | 03 | 1 | SALE-05 | T-08-08 | Raw Postgres/RPC error never reaches useRemoveTabItem's toast — translated generic message only, raw error stays in AppError.raw/logger | unit | `npx vitest run src/features/remove-tab-item/useRemoveTabItem.test.ts` | ✅ W0 (test file created by task) | ⬜ pending |
| 08-03-02 | 03 | 1 | SALE-05 | T-08-08 | Raw Postgres/RPC error never reaches useReopenTab/useEditPaidTab toasts | unit | `npx vitest run src/features/reopen-tab/model/useReopenTab.test.ts src/features/edit-paid-tab/model/useEditPaidTab.test.ts` | ✅ W0 (test files created by task) | ⬜ pending |
| 08-03-03 | 03 | 1 | SALE-05 | T-08-08 | Raw Postgres/RPC error never reaches useMutationCreateCajaEntry's toast | unit | `npx vitest run src/entities/caja/model/queries.test.ts` | ✅ W0 (test file created by task) | ⬜ pending |
| 08-04-01 | 04 | 2 | SALE-05 | T-08-09 | Confirmed `SUPABASE_ERROR` leak in `useProcessRefund.ts` replaced with translated generic message; raw error stays logger-only | e2e | `npx playwright test e2e/35-refund.spec.ts -g "generic"` | ✅ | ⬜ pending |
| 08-05-01 | 05 | 1 | OPS-01 | T-08-10 | Real reverse-DNS identifier avoids future app-identity collision with the generic placeholder | direct-inspection | `grep -c 'com.tajhouseofspices.supermarketpos' src-tauri/tauri.conf.json` | ✅ | ⬜ pending |
| 08-06-01 | 06 | 1 | SALE-02 | T-08-01 / T-08-02 | Bearer-JWT verify + service-role `profiles.role` lookup rejects non-admin/manager callers with 403 before any mutation; Zod schema validates request body shape | e2e | `npx playwright test e2e/22-staff-management.spec.ts -g "SM2"` | ✅ | ⬜ pending |
| 08-06-02 | 06 | 1 | SALE-02 | T-08-01 | Non-admin/manager caller (or anon key) is rejected by create-staff's new caller-role check | e2e | `npx playwright test e2e/22-staff-management.spec.ts -g "SM7"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Threat Refs (T-08-01 … T-08-10) are the actual IDs from each plan's `<threat_model>` block — see the relevant PLAN.md for the full ASVS L1 writeup (STRIDE category, asset, severity, mitigation).*

---

## Wave 0 Requirements

*If none: "Existing infrastructure covers all phase requirements."*

Existing infrastructure covers all phase requirements — Vitest and Playwright are already configured project-wide; no new framework/config install needed for SALE-02/04/05/06/OPS-01.

---

## Manual-Only Verifications

*If none: "All phase behaviors have automated verification."*

All phase behaviors have automated verification, per CLAUDE.md's mandatory-automated-testing policy — including OPS-01, which is verified by direct file inspection (a config-value fact, not a manual UAT step) rather than Playwright.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
