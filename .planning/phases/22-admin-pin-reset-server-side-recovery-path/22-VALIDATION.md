---
phase: 22
slug: admin-pin-reset-server-side-recovery-path
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD-01 | 01 | 0 | PINRST-01 (D-01) | T-22-01 | Non-admin caller rejected 403; admin can target any staff incl. other admins | E2E | `npx playwright test e2e/rbac/staff-management.spec.ts` (new test, mirror SM7/SM8 direct-fetch-403 pattern) | ❌ W0 | ⬜ pending |
| TBD-02 | 01 | 0 | PINRST-02 (D-02) | — | Admin types a specific 6-digit PIN (not system-generated) | unit | `npx vitest run src/features/admin-reset-pin` | ❌ W0 | ⬜ pending |
| TBD-03 | 01 | 0 | PINRST-03 (D-03) | T-22-03 | Acting admin must re-enter own PIN via `ManagerPinDialog` before edge function fires | E2E | new Playwright spec, click-through | ❌ W0 | ⬜ pending |
| TBD-04 | 01 | 0 | PINRST-04 (D-04) | — | Reset always sets `must_change_pin=true`; next login forces change screen | E2E | mirror SM2 assertion pattern (`e2e/rbac/staff-management.spec.ts:104-136`) | ❌ W0 (new test, existing pattern) | ⬜ pending |
| TBD-05 | 01 | 0 | PINRST-05 (D-05) | — | "Force PIN Change" stays unmodified; "Reset PIN" is distinct additional action | unit + E2E | `ForcePinChangeDialog.test.tsx` remains green unmodified; new test for new button | ✅ (regression-only) | ⬜ pending |
| TBD-06 | 01 | 0 | PINRST-06 (D-06) | T-22-06 | Reset blocked server-side for `is_active=false` target | E2E (direct-fetch) | new Playwright spec using `getServiceClient()` to seed inactive profile then hit edge function directly | ❌ W0 | ⬜ pending |
| TBD-07 | 01 | 0 | PINRST-07 (D-07) | — | Non-blocking same-screen warning on PIN collision with another active staff member | unit (dialog) | Vitest test on new dialog component | ❌ W0 | ⬜ pending |
| TBD-08 | 01 | 0 | PINRST-08 (D-08) | T-22-08 | Admin can reset own PIN, no special-case block | E2E | new Playwright spec, admin resets own account, logs back in with new PIN | ❌ W0 | ⬜ pending |

*Task IDs are TBD-* placeholders — the planner replaces these with real plan/task IDs once PLAN.md is authored; the REQ-ID → behavior → test mapping above is locked from research and must carry through unchanged.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/functions/admin-reset-pin/index.ts` — new edge function (no existing file; clone `create-staff/index.ts` skeleton)
- [ ] `src/features/admin-reset-pin/` — new feature folder (hook + dialog + tests)
- [ ] New Playwright spec(s) under `e2e/rbac/` (extend `staff-management.spec.ts` or add `e2e/rbac/admin-reset-pin.spec.ts`) covering D-01/D-03/D-04/D-06/D-08
- [ ] Optional: extend `audit-actions.test.ts`'s pattern to also grep `supabase/functions/**/*.ts` for `recordAudit(...)` calls — closes the CI gap where the existing test only greps SQL migrations, not edge functions (flagged in research as a natural side-quest, not strictly required by CONTEXT.md)

---

## Manual-Only Verifications

*None. All phase behaviors have automated verification — per CLAUDE.md's mandatory-automated-testing policy, D-03's confirm-dialog flow and D-06's inactive-staff block are both fully driveable via Playwright + `getServiceClient()` seeding, mirroring `e2e/rbac/staff-management.spec.ts`'s existing SM7/SM8 direct-fetch pattern for privilege-boundary tests.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit), full E2E subset green before phase gate
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
