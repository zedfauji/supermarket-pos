---
phase: "31"
slug: "product-catalog-detail-photo-upload"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-07"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright v1.59 |
| **Config file** | `supermarket-pos/playwright.config.ts` |
| **Quick run command** | `npx playwright test e2e/products/product-management.spec.ts` |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~90 seconds (quick) / full suite per repo baseline |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test e2e/products/`
- **After every plan wave:** Run `npm run test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-* | 01 | 1 | PCAT-01 | — | Row click opens reshaped dialog; existing Edit button still opens it too | e2e | `npx playwright test e2e/products/product-management.spec.ts` | ❌ W0 | ⬜ pending |
| 31-01-* | 01 | 1 | PCAT-02 | — | Every existing field still editable/saveable; cashier denied `manage_products` | e2e | `npx playwright test e2e/products/product-management.spec.ts` | ✅ (extend existing RBAC-denial coverage) | ⬜ pending |
| 31-02-* | 02 | 2 | PCAT-03 | T-31-01 | Upload/replace/remove photo; RLS denies non-`manage_products` write to `storage.objects` | e2e | `npx playwright test e2e/products/product-photo-upload.spec.ts` | ❌ W0 | ⬜ pending |
| 31-02-* | 02 | 2 | PCAT-04 | — | Full round-trip + `ProductPeekWindow` (Phase 18) unaffected proof | e2e | `npx playwright test e2e/products/ e2e/checkout/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/products/product-photo-upload.spec.ts` — new file: upload, replace (writes new key + deletes old), remove (clears column + object), RLS-denial for a cashier attempting a direct Storage API call
- [ ] Extend `e2e/products/product-management.spec.ts` — row-click open, tab navigation, error-tab auto-switch, dirty-close confirm
- [ ] Locate-and-extend the spec covering `ProductPeekWindow` (likely under `e2e/checkout/`) — proves PCAT-04's "peek window unaffected" claim
- [ ] Framework install: none — Playwright already fully configured in this repo

---

## Manual-Only Verifications

*None — project policy (`CLAUDE.md` Testing & Verification Policy) requires every scenario be automated Playwright E2E. All phase behaviors have automated verification; no `human_needed` carve-outs apply to this phase.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
