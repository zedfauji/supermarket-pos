---
phase: 17
slug: e2e-suite-overhaul
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright 1.59.1 [VERIFIED: npm ls] |
| **Config file** | `playwright.config.ts` (main suite) — `playwright.visual.config.ts` is separate/out-of-scope |
| **Quick run command** | `npm run test:e2e` (headless, `FAST_E2E=1` env toggle already exists and is preserved) |
| **Full suite command** | `npm run test:e2e` (same — no separate "full" mode; `test:e2e:visual` is the visual-regression suite, unaffected) |
| **Estimated runtime** | ~ full suite runtime unchanged from current baseline (no new slow paths introduced) |

---

## Sampling Rate

- **After every task commit:** Run targeted spec — `npx playwright test e2e/<folder>/<file>.spec.ts`
- **After every plan wave:** Run `npm run test:e2e` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, plus the TEST-01 grep gate below
- **Max feedback latency:** ~120 seconds (single-spec targeted run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | TEST-01 | — / — | N/A | grep-gate | `grep -rlE "pool_tables\|pool-tables\|/rappi\|rappi_orders\|/kitchen-prep\|/waitlist\|waitlist_entries\|combo_eligible\|is_combo\|kds_status" e2e/**/*.spec.ts` (empty/exit 1 = pass) | ✅ | ⬜ pending |
| 17-01-02 | 01 | 1 | TEST-02 | — / — | N/A | e2e | `npm run test:e2e` | ✅ | ⬜ pending |
| 17-01-03 | 01 | 1 | TEST-03 | — / T-17-01 | RLS-boundary checks use anon-key + signed-in client, never `getServiceClient()` | e2e | `npx playwright test --list` + smoke spec asserting CfT binary version | ✅ | ⬜ pending |
| 17-01-04 | 01 | 1 | TEST-04 | — / — | N/A | config-check | `grep -n "headless" playwright.config.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — the test framework itself is the subject of this phase; there is no separate "tests for the tests" infrastructure to stand up first. `e2e/helpers/db-assertions.ts` (new module, per Architecture Patterns Pattern 2) is Wave-0-shaped infrastructure that should land before the specs depending on it, but is scoped as an in-phase task rather than a pre-phase dependency.

---

## Manual-Only Verifications

*All phase behaviors have automated verification.* Per CLAUDE.md's non-negotiable testing policy, no `human_needed` or manual-UAT terminal state is valid for this phase — every criterion above (bar-pos-reference grep gate, coverage cross-reference, CfT binary launch, headless-default config check) resolves via `npm run test:e2e`, `npx playwright test --list`, or a deterministic grep/config assertion.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
