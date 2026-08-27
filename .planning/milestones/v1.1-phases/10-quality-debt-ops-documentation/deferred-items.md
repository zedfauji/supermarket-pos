# Deferred Items — Phase 10 Plan 07

Out-of-scope discoveries logged per the executor's Scope Boundary rule
(fix only what the current task's changes directly caused).

## 1. `e2e/38-audit-logs.spec.ts` — "Diff viewer > should open diff sheet on row click" is flaky/broken, unrelated to plan 10-07

**Found during:** Task 3 verification (`npx playwright test e2e/38-audit-logs.spec.ts e2e/47-edit-paid-tab.spec.ts`).

**Symptom:** `firstRow.click()` (the sr-only "View diff" button on the
globally-first `payment.process`/`payment.refund` row across the whole
audit log) times out — Playwright reports `<td> intercepts pointer events`
across ~30 retries.

**Confirmed pre-existing and unrelated to plan 10-07:** reproduces even
when the test is run in isolation (`-g "should open diff sheet on row
click"`), against a `payment.refund` row seeded by an earlier, unrelated
test run — not a row created or touched by this plan's Task 1
(`AuditLogTable`'s new `entityId` column) or Task 3. The test selects
"the first diff button anywhere on the page" with no row scoping, so it is
inherently order/state-dependent on however much audit history has
accumulated in the shared local Supabase instance across all prior E2E
runs.

**Not fixed here** — out of scope per the executor's scope-boundary rule
(only fix issues directly caused by this task's changes). Root cause is
likely in the test's row-selection strategy (needs scoping to a
test-seeded row, e.g. via a stable testid or the same seeded action+entity
used elsewhere in this file), not in any production code this plan
touched.

**Suggested fix (for whoever picks this up):** scope `firstRow` to the
specific row seeded by the "Happy path" test immediately above it (or seed
its own row) instead of matching "any diff button on the page."
