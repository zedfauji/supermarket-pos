---
phase: 9
slug: reopen-and-edit-a-completed-sale
status: validated
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-18
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4 (unit/integration) + Playwright v1.59 (E2E) |
| **Config file** | `supermarket-pos/vitest.config.ts`, `supermarket-pos/playwright.config.ts` |
| **Quick run command** | `npx vitest run src/features/add-item-to-tab/model/useAddItemToTab.test.ts` |
| **Full suite command** | `npm run test` (unit), `npm run test:e2e` (E2E, requires dev server + `.env.local` E2E credentials) |
| **Estimated runtime** | ~30s unit, ~5-10 min E2E full suite |

---

## Sampling Rate

- **After every task commit:** Run targeted `npx vitest run <file>` / `npx playwright test <file>`
- **After every plan wave:** Run `npm run test` (full unit suite) + `npm run typecheck` + `npm run lint`
- **Before `/gsd-verify-work`:** `npm run test:e2e` full suite (or at minimum every spec touching `tabs`/`payments`/`order_items`) must be green, per CLAUDE.md's automated-only verification mandate
- **Max feedback latency:** 30 seconds (unit), 5-10 minutes (E2E wave gate)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-xx | 01 | 0 | SALE-03 / SC-2 | — | N/A | unit | `npx vitest run src/features/add-item-to-tab/model/useAddItemToTab.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-xx | 01 | 0 | SALE-03 / SC-4 | — | N/A | E2E fixture | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts` | ❌ W0 | ⬜ pending |
| 09-01-xx | 01 | 1 | SALE-03 / SC-1 | — | N/A | E2E | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-1"` | ✅ (existing, unmodified) | ⬜ pending |
| 09-01-xx | 01 | 1 | SALE-03 / SC-2 | — | N/A | E2E | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-2"` | ❌ W0 | ⬜ pending |
| 09-01-xx | 01 | 1 | SALE-03 / SC-3 | — | N/A | E2E | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-3"` | ❌ W0 | ⬜ pending |
| 09-01-xx | 01 | 1 | SALE-03 / SC-5 | — | `edit_paid_tab` still rejects `status='open'` | integration | `npx vitest run src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` | ❌ W0 (new `it()` case) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/features/add-item-to-tab/model/useAddItemToTab.ts` + `.test.ts` — new thin wrapper hook and its unit test (mirror `useReopenTab.test.ts`'s shape)
- [ ] `e2e/48-reopen-closed-ticket.spec.ts` — extend with SC-2/SC-3 test blocks; replace `seedPaidTab` with a `process_direct_sale_atomic`-based helper (SC-4)
- [ ] `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` — add one new `it()` asserting the guard rejects a `status='open'` tab (SC-5, Pitfall 2)

---

## Manual-Only Verifications

*All phase behaviors have automated verification — this project mandates automated Playwright E2E for all UAT (CLAUDE.md, no manual/human checkpoints).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 600s (E2E wave gate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-18 (gsd-plan-checker verification passed, checks 8a-8d green)
