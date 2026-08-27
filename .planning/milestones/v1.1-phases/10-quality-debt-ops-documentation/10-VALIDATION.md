---
phase: 10
slug: quality-debt-ops-documentation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-18
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (unit) + Playwright 1.59 (E2E) + Storybook 10 test-runner (component render check) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` — `.storybook/main.ts` + `.storybook/preview.ts` do not exist yet, Wave 0 creates them (Research finding: Storybook was never initialized despite scripts assuming it) |
| **Quick run command** | `npx vitest run src/path/to.test.ts` (unit) / `npx playwright test e2e/<spec>.spec.ts` (E2E) |
| **Full suite command** | `npm run test` (unit) + `npm run test:e2e` (E2E, headless per CLAUDE.md policy) + `npm run storybook` build/test-runner for QA-02 |
| **Estimated runtime** | ~30s unit, ~3-5 min E2E subset, ~1 min Storybook build |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the file(s) touched
- **After every plan wave:** Run `npm run typecheck && npm run lint && npm run test`
- **Before `/gsd-verify-work`:** Full unit suite green + relevant E2E specs green + Storybook build succeeds
- **Max feedback latency:** ~300 seconds (E2E suite is the long pole)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-0X-0X | TBD | 0 | QA-02 | — | N/A | infra | `npm run storybook` builds without error | ❌ W0 | ⬜ pending |
| 10-0X-0X | TBD | 1 | QA-01 | — | N/A | e2e | `npx playwright test e2e/53-supplier-receiving.spec.ts` (or new spec) | ✅ | ⬜ pending |
| 10-0X-0X | TBD | 1 | QA-03 | — | N/A | e2e | `npx playwright test e2e/38-audit-logs.spec.ts` (or new spec covering copy/link) | ✅ | ⬜ pending |
| 10-0X-0X | TBD | 1 | QA-04 | — | N/A | unit | `npx vitest run src/features/checkout-sale/model/useCheckoutSale.test.ts` | ❌ W0 (new file) | ⬜ pending |
| 10-0X-0X | TBD | 1 | QA-02 | — | N/A | component | Storybook test-runner renders all 6 new stories without error | ❌ W0 (new files) | ⬜ pending |
| 10-0X-0X | TBD | 1 | OPS-02 | — | N/A | doc | `test -f docs/db-backup-disaster-recovery.md` (or equivalent doc path) + `test -x scripts/backup-db.sh` | ❌ W0 (new files) | ⬜ pending |

*Exact task IDs/paths finalized by the planner; this table's rows are the requirement→verification-command contract the plan must satisfy.*

---

## Wave 0 Requirements

- [ ] `.storybook/main.ts` + `.storybook/preview.ts` — Storybook was never initialized in this repo (confirmed absent on disk, gitignored); QA-02 cannot render/build without this
- [ ] `src/features/checkout-sale/model/useCheckoutSale.test.ts` — does not exist yet, required for QA-04
- [ ] 6 new `*.stories.tsx` files for EmptyState, ConfirmDialog, POSButton, DataTable, MoneyDisplay, MoneyInput — required for QA-02
- [ ] `docs/db-backup-disaster-recovery.md` (or planner-chosen path) + `scripts/backup-db.sh` — required for OPS-02

---

## Manual-Only Verifications

*None. Per CLAUDE.md's mandatory-automated-testing policy, every phase behavior in this project must have an automated Playwright/Vitest/Storybook-test-runner verification — no `<human-check>` or manual UAT scenarios are permitted. OPS-02's doc content is verified by direct file-existence/content assertion (grep/test -f), not human review.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Storybook init, new test files, new doc/script files)
- [x] No watch-mode flags
- [x] Feedback latency < 300s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-18
