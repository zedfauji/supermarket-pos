---
phase: 05-delete-void-order-feature
reviewed: 2026-08-17T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - supermarket-pos/e2e/09-rbac.spec.ts
  - supermarket-pos/e2e/global-teardown.ts
  - supermarket-pos/e2e/helpers/supabase.ts
  - supermarket-pos/src/shared/lib/__tests__/audit-edge-coverage.test.ts
  - supermarket-pos/src/shared/lib/edge-function-contracts.ts
  - supermarket-pos/src/shared/lib/i18n/locales/en-US/featOrders.json
  - supermarket-pos/src/shared/lib/i18n/locales/es-MX/featOrders.json
  - supermarket-pos/src/shared/lib/rbac.test.ts
  - supermarket-pos/src/shared/lib/rbac.ts
  - supermarket-pos/src/shared/ui/ProtectedAction.test.tsx
  - supermarket-pos/supabase/migrations/20260818000006_drop_void_order_permissions.sql
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 05: Code Review Report

**Reviewed:** 2026-08-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** clean

## Summary

Phase 05 is a deletion-only phase removing the orphaned `void-order` feature end-to-end: `rbac.ts`'s `STAFF_ACTIONS`/`MANAGER_EXTRA` entries, the `edge-function-contracts.ts` `VoidOrder*` schemas/caller/registry entry, the `voidOrder` i18n namespace in both locales, the `seedVoidableOrder` E2E helper, the two dead T8/T9 E2E void-order tests (replaced by a single absence-proving test), and the corresponding DB-side `role_permissions` grant rows via a new forward migration.

I traced every deletion for dangling references using both the diff (`git diff 1ea6f24..HEAD`) and repo-wide greps for `void_order`/`void-order`/`voidOrder`/`callVoidOrder`/`seedVoidableOrder`/`VoidOrderRequestSchema` across `.ts`/`.tsx`/`.sql`/`.json`. All hits outside this phase's files are either historical migration content (correctly left in place per the repo's "never rewrite history" convention) or comments in files outside this phase's scope (`e2e/07-reports.spec.ts`, `e2e/38-audit-logs.spec.ts`, `queries.concurrent.test.ts`) that pre-date this phase and reference an already-defunct `/pos`-era component (`TableStatusPanel`), not this phase's deletions.

Verified independently:
- `npm run typecheck` — clean.
- `npx vitest run` on all 4 touched/adjacent test files (`rbac.test.ts`, `ProtectedAction.test.tsx`, `audit-edge-coverage.test.ts`, `PermissionMatrix.test.tsx`) — 90/90 passing, including the dynamically-derived `STAFF_ACTIONS.length * STAFF_ROLES.length` switch-count assertion (no hardcoded `76`/`72` left stale anywhere except the already-updated E2E comment/assertion).
- `npx eslint` on the touched `src/` files — clean (0 errors under the project's actual `npm run lint` scope, which targets `src` only; `e2e/helpers/supabase.ts` has 81 pre-existing `no-unsafe-*`/`no-unnecessary-condition` lint errors unrelated to this diff and outside the `npm run lint` glob — confirmed pre-existing via `git stash` before/after comparison).
- JSON key-parity check between `en-US/featOrders.json` and `es-MX/featOrders.json` — identical key sets, `voidOrder` block cleanly removed from both with no orphaned sibling keys.
- Migration safety: `role_permissions.action` is a plain `text` column (no CHECK/enum constraint to also update), the only two `('manager'|'admin', 'void_order')` rows ever inserted were in `20260510000001_rls_rewrite_phase13.sql` and never re-seeded by any later migration, so the `DELETE ... WHERE role IN ('manager','admin') AND action = 'void_order'` is exactly scoped, idempotent, and complete. No RLS policy or Postgres function embeds `'void_order'` as a literal (confirmed via repo-wide grep), so no other DB-side authorization logic silently depended on these rows.
- No live TSX/TS file passes `requiredAction="void_order"` (would fail `tsc` since it's no longer part of the `StaffAction` union) — confirmed via grep of all `requiredAction=` usages.

All reviewed files meet quality standards. No blocking or warning-level issues found.

## Info

### IN-01: New E2E absence-test has no explicit timeout on a manager-gated flow

**File:** `supermarket-pos/e2e/09-rbac.spec.ts:156-164`
**Issue:** The replacement test `'void-order control is absent from every screen it could plausibly appear on'` calls `page.goto('/pos')` then `page.goto('/payments')` and asserts `toHaveCount(0)` on both a button and an alertdialog role, but unlike its sibling tests in the same file (e.g. `T-RBAC-page`, T10, T7) it sets no `test.setTimeout(...)` and relies entirely on Playwright's default 30s test timeout plus each assertion's own default timeout. This is low-risk (asserting an absence rarely times out — a missing element resolves `toHaveCount(0)` immediately), but if `/pos` or `/payments` ever gets slow to mount (e.g. a future data-heavy widget), the two sequential `page.goto()` navigations plus PIN-gated login in `beforeEach` are more likely to blow past the default 30s window than the neighboring tests that already budget extra time for similar multi-page-load flows.
**Fix:** Optional — add `test.setTimeout(60_000)` for consistency with sibling multi-navigation tests in this file, e.g.:
```ts
test('void-order control is absent from every screen it could plausibly appear on', async ({ page }) => {
  test.setTimeout(60_000);
  await loginAs(page, 'manager');
  ...
```

---

_Reviewed: 2026-08-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
