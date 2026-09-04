---
phase: "28"
slug: "promotion-management-redesign"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-04"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright ^1.59 (E2E) + Vitest ^4 (unit) — both already configured [VERIFIED: package.json, CLAUDE.md commands section] |
| **Config file** | `playwright.config.ts` / `vitest.config.ts` (existing, unchanged) |
| **Quick run command** | `npx playwright test e2e/promotions/<file>.spec.ts` (per-spec, existing convention) |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~90s unit tier; ~8-12min full E2E suite (Phase 27 baseline) |

---

## Sampling Rate

- **After every task commit:** Run the relevant new/modified spec file only (`npx playwright test e2e/promotions/<file>.spec.ts` or `npx vitest run <changed test file>`)
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm run test`
- **Before `/gsd-verify-work`:** `npm run test:e2e` full suite must be green — per this repo's CLAUDE.md mandatory-automated-testing policy, `human_needed`/manual UAT is not a valid terminal state for this phase
- **Max feedback latency:** 90 seconds (unit tier); Playwright spec runs are the outer bound at task-commit granularity

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | D-01/D-02 | — | Multi-target junction table: 0 rows = store-wide, N product + M category rows = applies to all | unit + E2E | `npx playwright test e2e/promotions/multi-target-scope.spec.ts` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | D-03..D-06 | — | Recurrence window evaluated in store-local time, correct across UTC day-boundary crossing | unit + E2E | `npx playwright test e2e/promotions/recurrence-timezone.spec.ts` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 2 | D-07/D-08 | — | Wizard forward navigation blocked on invalid current step, unblocked once valid | E2E | `npx playwright test e2e/promotions/wizard-step-validation.spec.ts` | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 2 | D-09 | — | Review step's live computed price example matches `evaluateBestPromotion`'s real output | E2E | same spec as above, additional assertion | ❌ W0 | ⬜ pending |
| 28-02-03 | 02 | 2 | D-10 | — | Edit mode: all 4 wizard steps clickable/navigable immediately, no forward-gating | E2E | same spec as above | ❌ W0 | ⬜ pending |
| 28-02-04 | 02 | 2 | D-12 | — | Migrated (pre-existing) promotion shows review-needed indicator; newly-created one does not | E2E | `npx playwright test e2e/promotions/migrated-review-flag.spec.ts` | ❌ W0 | ⬜ pending |
| 28-03-01 | 03 | 3 | Manager-PIN audit (folded todo) | T-27-10 (extended) | Refund/reopen/edit-paid-tab RPCs re-derive authorizing identity from `profiles.pin = p_manager_pin`, never trust caller's own session | E2E | `npx playwright test e2e/payments/refund-manager-pin-identity.spec.ts e2e/tabs/reopen-manager-pin-identity.spec.ts e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts` | ❌ W0 | ⬜ pending |
| 28-04-01 | 04 | 4 | `close_tab` disposition | — | Either role-check hardened (non-manager direct RPC call fails) or unused `EXECUTE` grant revoked and confirmed | integration or E2E | new spec, exact shape depends on disposition decision (RESEARCH.md Open Question 2) | ❌ W0 | ⬜ pending |
| 28-05-01 | 05 | 5 | Full matrix | — | Full `e2e/promotions/` scenario matrix green, no regressions in existing suite | E2E | `npx playwright test e2e/promotions/` then `npm run test:e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs above are provisional — the planner assigns final plan/wave numbers; this table is a coverage map per decision-ID, not a lock on plan structure.*

---

## Wave 0 Requirements

- [ ] `e2e/promotions/multi-target-scope.spec.ts` — new spec
- [ ] `e2e/promotions/recurrence-timezone.spec.ts` — new spec, mirror `e2e/promotions/timezone-boundary.spec.ts`'s existing `Intl.DateTimeFormat`-based expected-value computation
- [ ] `e2e/promotions/wizard-step-validation.spec.ts` — new spec
- [ ] `e2e/promotions/migrated-review-flag.spec.ts` — new spec
- [ ] `e2e/payments/refund-manager-pin-identity.spec.ts` — new spec, copy the login-as-cashier-with-a-different-manager's-PIN pattern from `e2e/payments/apply-promotion-and-custom-discount.spec.ts`
- [ ] `e2e/tabs/reopen-manager-pin-identity.spec.ts` — new spec, same pattern
- [ ] `e2e/tabs/edit-paid-tab-manager-pin-identity.spec.ts` — new spec, same pattern
- [ ] `close_tab` disposition test — shape TBD per Open Question 2 (harden vs. revoke)
- [ ] `src/entities/promotion/model/promotion-pricing.test.ts` extension — unit-test the new `getStoreLocalDowAndTime` helper and multi-target matching logic in isolation

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification. Per this repo's CLAUDE.md, `human_needed`/manual UAT is not a valid terminal state for this phase; the sole documented carve-out (native Tauri window shell, physical USB-HID PIN keypad, Supabase local devtools UI) does not apply to any Phase 28 behavior.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (unit tier)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
