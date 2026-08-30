---
phase: 21
slug: idle-screen-lock
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-30
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4 (unit/integration) + Playwright v1.59 (E2E) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) — both pre-existing, no changes needed |
| **Quick run command** | `npx vitest run src/features/idle-screen-lock` |
| **Full suite command** | `npm run test` (unit) and `npm run test:e2e` (E2E) |
| **Estimated runtime** | ~5s (unit quick run) / full suites unchanged from current baseline |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/features/idle-screen-lock` (and the relevant new integration test file for tasks touching RLS or audit writes)
- **After every plan wave:** Run `npm run test` (full unit suite)
- **Before `/gsd-verify-work`:** `npm run test:e2e` must be green, per this repo's no-manual-UAT policy
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-TBD | TBD | TBD | LCK-01 | — | Overlay engages after configured idle timeout, on every screen, no transaction exemption | E2E | `npx playwright test e2e/security/idle-lock.spec.ts` | ❌ W0 | ⬜ pending |
| 21-TBD | TBD | TBD | LCK-01 | — | `useIdleTimer` resets/fires correctly on activity vs. silence | unit | `npx vitest run src/features/idle-screen-lock/model/useIdleTimer.test.ts` | ❌ W0 | ⬜ pending |
| 21-TBD | TBD | TBD | LCK-02 | — | `terminal_lock_settings` RLS: admin can write, cashier/manager cannot | integration | `npx vitest run src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts` | ❌ W0 | ⬜ pending |
| 21-TBD | TBD | TBD | LCK-02 | — | Settings tab visible/editable only for `manage_settings` role | E2E | `npx playwright test e2e/settings/` (extend existing file) | ✅ folder exists | ⬜ pending |
| 21-TBD | TBD | TBD | LCK-03 | — | Unlock with a staff PIN different from the session owner leaves `currentStaff` unchanged | E2E | `npx playwright test e2e/security/idle-lock.spec.ts` | ❌ W0 | ⬜ pending |
| 21-TBD | TBD | TBD | LCK-04 | — | Lock and unlock both write correctly-attributed `audit_logs` rows | integration | `npx vitest run src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task/Plan/Wave IDs are filled in by gsd-planner once plans are written.*

---

## Wave 0 Requirements

- [ ] `e2e/security/idle-lock.spec.ts` — new folder+file, covers LCK-01/LCK-03 (seed a short `terminal_lock_settings.lock_timeout_seconds` via the service-role client in `e2e/helpers/supabase.ts` before the test, matching the existing service-role-seed precedent in `receipt-settings-rls.integration.test.ts`, so the test doesn't wait on the real 60s default)
- [ ] `src/features/idle-screen-lock/model/useIdleTimer.test.ts` — unit test using Vitest fake timers
- [ ] `src/entities/settings/model/terminal-lock-settings-rls.integration.test.ts` — mirrors `receipt-settings-rls.integration.test.ts`'s structure (temp auth users, service-role seed/cleanup)
- [ ] `src/features/idle-screen-lock/model/idle-lock-audit.integration.test.ts` — asserts `audit_logs` rows for both events carry the correct staff identities in `p_before`/`p_after`

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification per this repo's mandatory-automated-testing policy (see CLAUDE.md "Testing & Verification Policy").*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
