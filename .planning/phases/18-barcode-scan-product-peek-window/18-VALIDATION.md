---
phase: 18
slug: barcode-scan-product-peek-window
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-26
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright v1.59 (E2E, primary) / Vitest v4 (unit) |
| **Config file** | `playwright.config.ts` (E2E — drives Chromium against `npm run dev` on port 1520, NOT the packaged Tauri binary); `vitest.config.ts` (unit) |
| **Quick run command** | `npx playwright test e2e/checkout/peek-window.spec.ts` |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~10-15s quick (single spec) / full suite per existing `e2e_run.log` baseline |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test e2e/checkout/peek-window.spec.ts`
- **After every plan wave:** Run `npm run test:e2e` (full suite — a new capability grant or event-mock could regress other windowed/Tauri-mocked specs, e.g. `e2e/receipts/*.spec.ts`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PEEK-01 | T-18-01 | Scan opens peek window with full product detail via same parameterized `useLookupProductByBarcode` lookup main uses | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "opens a second window"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PEEK-02 | T-18-03 | Qty/weight input bounds + risky-add guard reused unchanged (no new validation surface) | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "risky.*guard"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PEEK-03 | — | Add to Cart / Close behavior; no direct write path from peek window (cart mutation stays in main window) | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "Add to Cart|Close"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PEEK-04 | T-18-02 | Rescan replaces content (no duplicate window); main scan-to-search listener still fires on same scan | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "rescan"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | `WeightEntryDialog` `onConfirm` override | — | Existing default-behavior callers unaffected by new optional override | Unit | `npx vitest run src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` | ❌ W0 (no existing test file — confirm before assuming coverage) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/helpers/tauriPeekMock.ts` — new `BroadcastChannel`-backed IPC/event mock extending the existing `window.__TAURI_INTERNALS__.invoke` pattern from `e2e/receipts/reprint.spec.ts` / `e2e/receipts/pdf-delivery.spec.ts`
- [ ] `e2e/checkout/peek-window.spec.ts` — new spec file covering PEEK-01..04, using a second Playwright `page` (`context.newPage()`) to stand in for the second OS window
- [ ] `src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` — confirm zero existing unit tests today; if so, add coverage for the new `onConfirm` override alongside the default-behavior regression check
- [ ] One-time `npm run tauri dev` smoke check of cross-window Supabase session/`localStorage` sharing (RESEARCH.md Pitfall 6 / Assumption A1) before building the full flow

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (per project CLAUDE.md testing policy: no manual UAT/human-verify steps are permitted in this project).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
