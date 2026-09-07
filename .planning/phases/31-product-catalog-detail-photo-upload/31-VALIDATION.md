---
phase: "31"
slug: "product-catalog-detail-photo-upload"
status: approved
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-07"
updated: "2026-09-07"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconciled against the final 5-plan / 15-task breakdown on 2026-09-07.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright v1.59 (E2E) + Vitest v4 (unit) |
| **Config file** | `playwright.config.ts` · `playwright.visual.config.ts` (visual) · `vitest.config.ts` |
| **Quick run command** | `npx playwright test e2e/products/` |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~90 seconds (quick) / full suite per repo baseline |

---

## Sampling Rate

- **After every task commit:** the task's own `<automated>` command (every task below carries one, except the single decision checkpoint, which is N/A by category)
- **After every task commit touching `e2e/products/`:** `npx playwright test e2e/products/`
- **After every plan wave:** `npm run test:e2e`
- **Before `/gsd-verify-work`:** full suite green, plus `npm run test:e2e:visual`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

15 tasks across 5 plans. Requirement attribution matches each plan's `requirements` frontmatter:
01 → PCAT-03 · 02 → PCAT-01/02/04 · 03 → PCAT-01/04 · 04 → PCAT-03/04 · 05 → PCAT-04.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-T1 — Confirm the two one-way-door storage decisions | 01 | 1 | PCAT-03 | T-31-04 | Column semantics and Storage SELECT scope are chosen deliberately before the migration is written; `anon` gets nothing under either option | checkpoint:decision — N/A for verify by category | — (no runnable command; answer recorded in `31-01-SUMMARY.md` and consumed by Task 2) | n/a | ⬜ pending |
| 31-01-T2 — End-to-end "upload one product photo" (tracer) | 01 | 1 | PCAT-03 | T-31-01, T-31-02, T-31-03, T-31-04, T-31-SC | Private bucket, `manage_products` predicate on INSERT/UPDATE/DELETE, app-minted uuid object keys, server-side MIME + size caps | unit + e2e | `npx vitest run src/features/manage-products/model/photo-file.test.ts src/entities/product/model/resolveProductImage.test.ts` · `npm run typecheck` · `npm run lint` · `npx playwright test e2e/products/product-photo-upload.spec.ts` | ❌ → all three test files are authored by this task, tests-first per its `<behavior>` block | ⬜ pending |
| 31-01-T3 — Partial-failure and boundary hardening | 01 | 1 | PCAT-03 | T-31-02, T-31-05 | Every upload-sequence branch has a named error; a failed link write leaves the column untouched; replace never leaves two referenced objects | unit + e2e | `npx vitest run src/features/manage-products/model/photo-file.test.ts` · `npm run typecheck` · `npx playwright test e2e/products/product-photo-upload.spec.ts` | ✅ (extends the files created in 31-01-T2) | ⬜ pending |
| 31-02-T1 — One dialog, three vertical tabs, one footer | 02 | 2 | PCAT-01, PCAT-02 | T-31-08 | Layout-only reshape; the write path stays the existing `useMutationCreateProduct`/`useMutationUpdateProduct` pair behind `manage_products` RLS | static | `npm run typecheck` · `npm run lint` | n/a (no new test file; proven by 31-02-T3) | ⬜ pending |
| 31-02-T2 — Error-driven tab navigation and the dirty-close guard | 02 | 2 | PCAT-02 | T-31-09, T-31-10 | One `handleSubmit` parses the whole payload with `ProductUpdateSchema` regardless of visible tab; unsaved edits require an explicit discard | unit | `npx vitest run src/features/manage-products/model/productDialogTabs.test.ts` · `npm run typecheck` · `npm run lint` | ❌ → `productDialogTabs.test.ts` authored by this task, tests-first | ⬜ pending |
| 31-02-T3 — Re-point the two existing dialog E2E specs and prove the reshape | 02 | 2 | PCAT-01, PCAT-02, PCAT-04 | T-31-08 | Cashier-denial coverage kept and extended so a layout change cannot silently widen access | e2e | `npx playwright test e2e/products/product-management.spec.ts` · `npx playwright test e2e/inventory/open-units.spec.ts` · `npx playwright test e2e/products/ e2e/inventory/` | ✅ both specs exist today | ⬜ pending |
| 31-03-T1 — Batch signed-URL resolution for list surfaces | 03 | 3 | PCAT-04 | T-31-11, T-31-12 | Signed paths come only from RLS-filtered `Product.photoPath` values, never a caller-supplied string; one batch request per page | unit | `npx vitest run src/entities/product/model/resolveProductImage.test.ts` · `npm run typecheck` · `npm run lint` | ✅ (created in 31-01-T2, extended here) | ⬜ pending |
| 31-03-T2 — Photo column, row-click open, propagation stops | 03 | 3 | PCAT-01 | T-31-13 | Row click opens only the dialog the Edit button already opened — no new write path, no RBAC change | e2e | `npm run typecheck` · `npm run lint` · `npx playwright test e2e/products/product-management.spec.ts` | ✅ spec exists today | ⬜ pending |
| 31-03-T3 — Prove row-click, inline-edit isolation, one-request signing | 03 | 3 | PCAT-01, PCAT-04 | T-31-12 | Exact request count of 1 per page asserted, so a per-row signing regression fails the build | e2e | `npx playwright test e2e/products/catalog-row-and-thumbnails.spec.ts e2e/products/product-management.spec.ts` | ❌ → `catalog-row-and-thumbnails.spec.ts` authored by this task | ⬜ pending |
| 31-04-T1 — Drag-and-drop and clipboard paste as first-class entry paths | 04 | 3 | PCAT-03 | T-31-14 | Drop and paste converge on the same `validatePhotoFile`/`resizePhoto` pipeline as the picker — no second unvalidated path | unit | `npx vitest run src/features/manage-products/model/photo-file.test.ts` · `npm run typecheck` · `npm run lint` | ✅ (created in 31-01-T2, extended here) | ⬜ pending |
| 31-04-T2 — Replace, confirmed Remove, and the full state matrix | 04 | 3 | PCAT-03 | T-31-15, T-31-16, T-31-17 | Delete target is always the path read from the product row; inputs disabled while in flight; replace invalidates the old object | unit | `npm run typecheck` · `npm run lint` · `npx vitest run src/features/manage-products/model` | ✅ (extends 31-01-T2's test files) | ⬜ pending |
| 31-04-T3 — Drive drop, paste, replace, and remove in Playwright | 04 | 3 | PCAT-03, PCAT-04 | T-31-14, T-31-17 | The old object is asserted gone from the bucket after a replace | e2e | `npx playwright test e2e/products/product-photo-upload.spec.ts` | ✅ (created in 31-01-T2, extended here) | ⬜ pending |
| 31-05-T1 — Prove the Storage RLS boundary from a real non-privileged client | 05 | 4 | PCAT-04 | T-31-01, T-31-04 | Cashier-role and unauthenticated clients denied upload/update/delete and denied signed-URL minting, each paired with a service-client ground truth and an admin positive control | e2e | `npx playwright test e2e/products/product-photo-rls.spec.ts` | ❌ → `product-photo-rls.spec.ts` authored by this task | ⬜ pending |
| 31-05-T2 — Prove Phase 18's peek window is unaffected | 05 | 4 | PCAT-04 | T-31-18 | Any working-tree change under the peek-window widget fails the task by command, not by intent | e2e | `npx playwright test e2e/checkout/peek-window.spec.ts` · `git status --porcelain -- src/widgets/ProductPeekWindow` | ✅ spec exists today | ⬜ pending |
| 31-05-T3 — Wire the four visual backstops into one visual-regression spec | 05 | 4 | PCAT-04 | T-31-19 | Every snapshot is paired with a deterministic measurement assertion, so a stale or auto-written baseline cannot carry the claim alone | visual e2e | `npm run test:e2e:visual` | ❌ → `e2e/visual/46-product-dialog-baseline.spec.ts` authored by this task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every test file this phase relies on is either already in the repo or is authored tests-first by the
task that owns it — no task's `<verify>` points at a file nothing creates, and no task carries a
`MISSING` verify token.

- [x] `e2e/products/product-photo-upload.spec.ts` — created by **31-01-T2** (the tracer's own proof), extended by 31-01-T3 and 31-04-T3
- [x] `src/features/manage-products/model/photo-file.test.ts` — created RED-first by **31-01-T2** per its `<behavior>` block, extended by 31-01-T3, 31-04-T1, 31-04-T2
- [x] `src/entities/product/model/resolveProductImage.test.ts` — created RED-first by **31-01-T2**, extended by 31-03-T1
- [x] `src/features/manage-products/model/productDialogTabs.test.ts` — created RED-first by **31-02-T2**
- [x] `e2e/products/catalog-row-and-thumbnails.spec.ts` — created by **31-03-T3**
- [x] `e2e/products/product-photo-rls.spec.ts` — created by **31-05-T1**
- [x] `e2e/visual/46-product-dialog-baseline.spec.ts` — created by **31-05-T3** (alongside the existing `e2e/visual/45-visual-baseline.spec.ts`)
- [x] Already present, re-pointed rather than created: `e2e/products/product-management.spec.ts`, `e2e/inventory/open-units.spec.ts`, `e2e/checkout/peek-window.spec.ts`
- [x] Framework install: none — Playwright and Vitest are already fully configured in this repo

---

## Manual-Only Verifications

*None — project policy (`CLAUDE.md` § Testing & Verification Policy) requires every scenario be
automated Playwright E2E. All phase behaviors have automated verification; no `human_needed`
carve-outs apply to this phase.*

`31-01-T1` is a `checkpoint:decision`, not a verification: it asks the developer for an
irreversible architectural choice **before** the code exists. It is not a human check of finished
work and therefore does not fall under the manual-verification ban. It intentionally carries no
`<verify>` block, since there is nothing yet to run.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are N/A by category (the one decision checkpoint)
- [x] Every `<automated>` command has a `<fails_when>` sibling
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (the single checkpoint is followed immediately by the tracer's four commands)
- [x] Wave 0 covers all referenced test files — none is `MISSING`, each is created by the task that owns it
- [x] No watch-mode flags (all Vitest runs use `vitest run`)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-07 (reconciled with the final 15-task breakdown during plan revision).
