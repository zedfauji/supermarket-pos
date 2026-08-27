---
phase: 13
slug: receipt-delivery-resilience-print-reprint-retry-pdf
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (unit), Playwright 1.59.1 (E2E) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run src/shared/lib/pos-printer.test.ts` |
| **Full suite command** | `npm run test` (unit) + `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~5s (quick unit) / full suite varies |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/shared/lib/pos-printer.test.ts`
- **After every plan wave:** Run `npm run test` (full Vitest suite) + `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts`
- **Before `/gsd-verify-work`:** `npm run test` + `npm run test:e2e` full green (CLAUDE.md's mandatory-automated-testing policy — no manual UAT for this project)
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-xx | TBD | 0 | RCP-01 | V4 | RLS-gated reconstruction of ReceiptData via cashier+ role reads | E2E (Playwright) | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts -g "reprint"` | ❌ Wave 0 — new spec file |
| 13-01-xx | TBD | 0 | RCP-01 | V4 | `useReceiptDataForPayment` reconstructs ReceiptData from DB fixture | unit/integration | `npx vitest run src/entities/payment/model/queries.test.ts` | ❌ Wave 0 — new test file |
| 13-02-xx | TBD | 0 | RCP-02 | — | Sale never blocked/rolled back by print failure | E2E (Playwright) | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts -g "never blocks"` | ❌ Wave 0 — new spec file |
| 13-03-xx | TBD | 0 | RCP-03 | V5 | PDF download triggers with correct sanitized content | E2E (Playwright) | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts -g "pdf download"` | ❌ Wave 0 |
| 13-03-xx | TBD | 0 | RCP-03 | V5 | PDF email attachment payload matches expected shape, size-capped | unit (edge function) | `npx vitest run supabase/functions/send-receipt-email/index.test.ts` | ❌ Wave 0 — no existing test file |
| 13-04-xx | TBD | 0 | RCP-04 | — | Transient failure retried 2-3 times, then surfaced as failure | unit (Vitest) | `npx vitest run src/shared/lib/pos-printer.test.ts -t "retries"` | ❌ Wave 0 — extends existing file |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/56-receipt-delivery-resilience.spec.ts` — new spec covering RCP-01/02/03; needs dual `window.__TAURI__` + `window.__TAURI_INTERNALS__` mock (Pitfall 2) — consider extracting shared `e2e/helpers/tauriMocks.ts`
- [ ] `src/shared/lib/pos-printer.test.ts` — extend with retry-count and retry-then-succeed cases (RCP-04); file and mocking scaffold already exist
- [ ] `src/entities/payment/model/queries.test.ts` — new test for `useReceiptDataForPayment` (RCP-01), likely integration-style against local Supabase stack (mirror `split-payment-rpc.integration.test.ts`)
- [ ] `supabase/functions/send-receipt-email/index.ts` has no existing test file — Wave 0 decides whether to add one or cover purely via Playwright E2E

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
