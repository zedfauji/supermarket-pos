---
phase: 16
slug: purchase-orders-reordering
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-23
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (TS unit) + Playwright (E2E) + Supabase pgTAP/SQL assertions for RLS |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npx vitest run <changed test file>` |
| **Full suite command** | `npm run test && npm run typecheck && npm run lint` |
| **Estimated runtime** | Per-task: 5-40s (typecheck/lint/vitest unit); 16-01's integration tests + migration apply: ~2-3min; 16-04 Task 2's Playwright spec: ~2-4min. Full suite (`npm run test && npm run typecheck && npm run lint`): ~2-3min. |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` command
- **After every plan wave:** Run the full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npx playwright test e2e/56-purchase-orders.spec.ts`
- **Max feedback latency:** ~4 minutes (16-04 Task 2's Playwright spec is the slowest single verify command in this phase)

---

## Per-Task Verification Map

| Plan | Wave | Task | Type | Automated Verify |
|------|------|------|------|-------------------|
| 16-01 | 1 | Task 1: [BLOCKING] Tracer — schema/RLS + receive_shipment PO extension | tracer, tdd | `npx vitest run src/features/receive-shipment/model/receive-po-shipment.integration.test.ts` |
| 16-01 | 1 | Task 2: RLS integration test (cashier zero-rows, manager real-row) | auto, tdd | `npx vitest run src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts` |
| 16-01 | 1 | Task 3: Wire poId through Edge Function + client contract | auto | `npm run typecheck` |
| 16-02 | 2 | Task 1: computeReorderQuantity (D-07/D-08, TDD) | auto, tdd | `npx vitest run src/entities/purchase-order/model/reorder-quantity.test.ts` |
| 16-02 | 2 | Task 2: PurchaseOrder domain schemas + entities/purchase-order queries + StatusBadge | auto | `npm run typecheck` |
| 16-02 | 2 | Task 3: suggest-reorder supplier-scoped query | auto | `npm run typecheck` |
| 16-03 | 3 | Task 1: PurchaseOrderForm (create+edit+suggest-reorder) | auto | `npm run lint && npm run typecheck` |
| 16-03 | 3 | Task 2: PurchaseOrderListPanel + PurchaseOrderDetailPanel | auto | `npm run lint && npm run typecheck` |
| 16-03 | 3 | Task 3: Route guard + router + HomeDashboard tile + page | auto | `npm run lint && npm run typecheck && npm run build` |
| 16-04 | 4 | Task 1: ReceiveShipmentForm poId pre-fill + DetailPanel Receive CTA | auto | `npm run lint && npm run typecheck` |
| 16-04 | 4 | Task 2: e2e/56-purchase-orders.spec.ts (SC 1-4) | auto | `npx playwright test e2e/56-purchase-orders.spec.ts` |

No 3-consecutive-task gap without an automated verify — every task above has one.

---

## Wave 0 Requirements

RESEARCH.md's "Phase Requirements -> Test Map" flagged two test files as not-yet-existing (`e2e/56-purchase-orders.spec.ts`, `src/entities/purchase-order/model/reorder-quantity.test.ts`). Both are created directly by the tasks that need them (16-02 Task 1's TDD RED-then-GREEN cycle; 16-04 Task 2's fresh spec authoring) — no separate Wave 0 scaffolding plan is required, since Nyquist compliance only requires that no task references a test file that some *other*, later task must first create. The two integration test files created ad hoc in 16-01 (`receive-po-shipment.integration.test.ts`, `purchase-orders-rls.integration.test.ts`) are likewise authored and run within their own owning task, RED-first per the tdd="true" contract.

---

## Manual-Only Verifications

All phase behaviors have automated verification. Per CLAUDE.md's non-negotiable testing policy, no `checkpoint:human-verify` or manual UAT scenario is permitted in any plan for this phase.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency acceptable
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated (gsd-planner, 2026-08-23)
