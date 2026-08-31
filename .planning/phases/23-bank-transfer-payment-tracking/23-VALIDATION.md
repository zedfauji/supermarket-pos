---
phase: 23
slug: bank-transfer-payment-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 (unit) + Playwright 1.59 (E2E) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| **Quick run command** | `npx vitest run <touched test file>` |
| **Full suite command** | `npm run test` (unit), `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~30s unit, ~5-10min full E2E suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test file>`
- **After every plan wave:** Run `npm run test` (full unit suite)
- **Before `/gsd-verify-work`:** `npm run test:e2e` full suite must be green — per CLAUDE.md's
  mandatory-automated-testing policy, no `human_needed` terminal state is valid for this phase.
- **Max feedback latency:** ~30s (unit tests give fast per-task signal; E2E is wave/phase-gate only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 0 | BTP-01 | — | Reference code Luhn generation/validation, ported from spike | unit | `npx vitest run src/shared/lib/bank-transfer-code.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-02 | 01 | 1 | BTP-02 | T-23-01 | `payment_method` enum + RPC whitelist accept `bank_transfer` only via server-side checkout path | RPC/integration | mirror `process-refund-rpc.integration.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-03 | 01 | 1 | BTP-03/04/05/09 | T-23-02 | `confirm_transfer_payment`/`dispute_transfer_payment` re-check `auth.uid()` role server-side; no auto-confirm path | RPC/integration | mirror `process-refund-rpc.integration.test.ts` | ❌ W0 | ⬜ pending |
| 23-01-04 | 01 | 1 | BTP-06 | — | New audit action strings registered in `AuditActionSchema` before use | unit (CI gate) | `npx vitest run src/shared/lib/__tests__/audit-actions.test.ts` | ✅ exists | ⬜ pending |
| 23-01-05 | 01 | 1 | BTP-07/12 | — | Bank Transfers tab renders list, stale flag, status badges | component + E2E | new `BankTransfersList.test.tsx` + `e2e/payments/bank-transfers-tab.spec.ts` | ❌ W0 | ⬜ pending |
| 23-01-06 | 01 | 1 | BTP-08 | T-23-03 | CSV export uses `rowsToCsv`/`sanitizeCsvCell` (CWE-1236 guard), Tauri-native save (not Blob) | unit | extend `src/shared/lib/exporters/csv.test.ts` | ✅ pattern exists | ⬜ pending |
| 23-01-07 | 01 | 1 | BTP-09 | T-23-01 | Cashier role denied `confirm_transfer_payment`/`dispute_transfer_payment` (RBAC + RLS) | unit + RPC integration | extend `src/shared/lib/rbac.test.ts` | ✅ pattern exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs above are placeholders pending the planner's actual wave/task breakdown — this table's Requirement/Test Type/Command columns are the binding contract; exact task numbering will be reconciled when PLAN.md is written.*

---

## Wave 0 Requirements

- [ ] `src/shared/lib/bank-transfer-code.test.ts` — ports the spike's Luhn self-check assertions (`.planning/spikes/003-reference-code-design/reference-code.cjs`) into a real Vitest file for BTP-01
- [ ] RPC integration test file(s) for `confirm_transfer_payment`/`dispute_transfer_payment` — mirror `src/features/process-refund/process-refund-rpc.integration.test.ts`'s structure (requires `.env.local` + remote Supabase, per that file's existing convention)
- [ ] `e2e/payments/bank-transfers-tab.spec.ts` — new spec file in the existing `e2e/payments/` folder, following `e2e/payments/refund.spec.ts`'s exact conventions (`getServiceClient()` seeding, `loginAs(page, role)`, PINKeypad button-clicking for `ManagerPinDialog`, `requireIntegrationEnv()` gate)
- [ ] No new test framework/config needed — both Vitest and Playwright are already fully configured for this project.

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (Playwright E2E or Vitest unit/integration), per this project's mandatory-automated-testing policy (CLAUDE.md: no `human_needed` terminal states, no manual UAT). The one project-wide manual-verification carve-out (native Tauri window chrome, physical USB-HID PIN keypad, local Supabase devtools UI) does not apply to any behavior in this phase.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit) / full E2E suite green before phase close
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
