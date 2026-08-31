---
phase: 22
slug: admin-pin-reset-server-side-recovery-path
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-30
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4 (unit) + Playwright v1.59 (E2E) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| **Quick run command** | `npx vitest run src/features/admin-reset-pin` |
| **Full suite command** | `npm run test` (unit), `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~10s (unit), ~5-10min (full E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/features/admin-reset-pin`
- **After every plan wave:** Run `npm run test` (full unit) + targeted `npx playwright test e2e/rbac/`
- **Before `/gsd-verify-work`:** Full `npm run test:e2e` (or the relevant `e2e/rbac/` + `e2e/staff`-adjacent subset) must be green
- **Max feedback latency:** 30 seconds (unit); E2E run is the phase-gate check, not per-task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-T1 | 01 | 1 | PINRST-01 (D-01) | T-22-01 | Non-admin caller rejected 403; admin can target any staff incl. other admins | E2E | `npx playwright test e2e/rbac/staff-management.spec.ts -g "SM10"` | ✅ (via Task 1 edge fn + Task 2 SM10) | ⬜ pending |
| 22-01-T1 | 01 | 1 | PINRST-02 (D-02) | — | Admin types a specific 6-digit PIN (not system-generated) | unit | `npx vitest run src/features/admin-reset-pin` | ✅ | ⬜ pending |
| 22-01-T1 | 01 | 1 | PINRST-03 (D-03) | T-22-06 | Acting admin must re-enter own PIN via `ManagerPinDialog` before edge function fires | E2E | `npx playwright test e2e/rbac/staff-management.spec.ts -g "SM9"` | ✅ | ⬜ pending |
| 22-01-T1 | 01 | 1 | PINRST-04 (D-04) | T-22-03 | Reset always sets `must_change_pin=true`; next login forces change screen | E2E | `npx playwright test e2e/rbac/staff-management.spec.ts -g "SM9"` (mirrors SM2) | ✅ | ⬜ pending |
| 22-01-T1 | 01 | 1 | PINRST-05 (D-05) | — | "Force PIN Change" stays unmodified; "Reset PIN" is distinct additional action | unit + E2E | `npx vitest run src/features/force-pin-change` (regression) + SM9 | ✅ (regression-only) | ⬜ pending |
| 22-01-T2 | 01 | 1 | PINRST-06 (D-06) | T-22-04 | Reset blocked server-side for `is_active=false` target | E2E (direct-fetch) | `npx playwright test e2e/rbac/staff-management.spec.ts -g "SM11"` | ✅ | ⬜ pending |
| 22-01-T1 | 01 | 1 | PINRST-07 (D-07) | T-22-09 | Non-blocking same-screen warning on PIN collision with another active staff member | unit (dialog) | `npx vitest run src/features/admin-reset-pin` (`AdminResetPinDialog.test.tsx`) | ✅ | ⬜ pending |
| 22-01-T3 | 01 | 1 | PINRST-08 (D-08) | — | Admin can reset own PIN, no special-case block | E2E | `npx playwright test e2e/rbac/staff-management.spec.ts -g "SM12"` | ✅ | ⬜ pending |

*Real task/plan IDs from `22-01-PLAN.md` (single plan, wave 1, 3 tasks: T1=tracer, T2=backend hardening, T3=self-target). Status column flips to ✅ green during/after `/gsd-execute-phase 22`.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/functions/admin-reset-pin/index.ts` — new edge function, authored in Task 1 (clones `create-staff/index.ts` skeleton)
- [x] `src/features/admin-reset-pin/` — new feature folder (hook + dialog + tests), authored in Task 1
- [x] New Playwright specs under `e2e/rbac/staff-management.spec.ts` — SM9 (D-01/03/04/05), SM10 (D-01), SM11 (D-06), SM12 (D-08)
- [x] `audit-actions.test.ts` extended (Task 1 step 5) to also grep `supabase/functions/**/*.ts` for `recordAudit(...)` calls — closes the CI gap where the existing test only greped SQL migrations, not edge functions (Pitfall 2)

---

## Manual-Only Verifications

*None. All phase behaviors have automated verification — per CLAUDE.md's mandatory-automated-testing policy, D-03's confirm-dialog flow and D-06's inactive-staff block are both fully driveable via Playwright + `getServiceClient()` seeding, mirroring `e2e/rbac/staff-management.spec.ts`'s existing SM7/SM8 direct-fetch pattern for privilege-boundary tests.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (all 3 tasks in `22-01-PLAN.md` carry a runnable `<automated>` command)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (3/3 tasks covered)
- [x] Wave 0 covers all MISSING references (no unresolved Wave-0 gaps — all listed files authored in Task 1)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (unit), full E2E subset green before phase gate
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-30 (plan-checker verified Nyquist Compliance dimension PASS on `22-01-PLAN.md`; this file synced post-planning per checker Warning 2)
