# Phase 5: Delete void-order feature - Research

**Researched:** 2026-08-16
**Domain:** Dead-code/feature deletion across client, edge function, RBAC, i18n, DB migration, and E2E surfaces in a Feature-Sliced Design + Supabase codebase
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RBAC removal**
- **D-01:** `void_order` is removed in two places, not one: (1) a new forward migration `DELETE`s the `('manager', 'void_order')` / `('admin', 'void_order')` rows from `role_permissions` (the seeding migration, `20260510000001_rls_rewrite_phase13.sql`, is in the past and must not be edited); (2) `'void_order'` is dropped entirely from the `Action` type/`ACTIONS` array in `src/shared/lib/rbac.ts` — not kept as a reserved/unused value. — **Reversibility:** costly — re-adding requires a new migration re-inserting the seed rows plus reverting the type change; no data loss risk since it's a pure permission grant, not user data.

**Edge function**
- **D-02:** `supabase/functions/void-order/` is deleted outright — no live callers remain after the client-side removal, no stub kept.

**Test cleanup — full sweep**
- **D-03:** Delete the feature's own tests with the feature folder: `src/features/void-order/model/useVoidOrder.test.tsx`, `src/features/void-order/ui/VoidOrderDialog.test.tsx`.
- **D-04:** Update every incidental reference so the suite is green with void-order fully removed, not left for CI to discover:
  - `src/shared/lib/edge-function-contracts.test.ts` — remove assertions covering the `void-order` registry entry, `VoidOrderRequestSchema`/`VoidOrderResponseSchema`, `callVoidOrder`.
  - `src/shared/lib/__tests__/audit-edge-coverage.test.ts` — remove `void-order` from whatever coverage list/table it audits.
  - `src/shared/lib/rbac.test.ts` — remove `void_order`-action assertions.
  - `e2e/helpers/supabase.ts` — delete the `seedVoidableOrder` helper (used only by the spec being deleted; confirmed via grep, no other spec references it).
  - Full sweep also includes: `src/shared/lib/edge-function-contracts.ts` (remove `VoidOrderRequestSchema`/`VoidOrderResponseSchema`/`callVoidOrder`/registry entry), `src/features/void-order/` (whole folder, including `index.ts`), `src/shared/lib/i18n/locales/{es-MX,en-US}/featOrders.json` (remove the `voidOrder` key block in both).
  - Re-run `npm run test` and `npm run typecheck` after the sweep to confirm nothing else breaks.

> **Research addendum (this document):** the D-04 sweep list above was compiled before a full-repo grep pass. This research found four additional in-scope references not on that list — `src/shared/ui/ProtectedAction.test.tsx` (compile-breaking), `e2e/09-rbac.spec.ts` T8/T9, `e2e/global-teardown.ts`'s `SUITE_MAP` label, and a comment in `src/entities/tab/model/queries.concurrent.test.ts` — see Architecture Patterns and Common Pitfalls below. It also found one thing that must explicitly stay despite matching a naive keyword sweep: `src/shared/lib/audit-actions.ts`'s `'order.void'` enum entry.

### Claude's Discretion
- The exact form of the "automated grep/lint check returns zero matches" required by the phase's Success Criteria #2 (e.g. a one-off grep run during verification vs. a persisted script) — planner/executor decides based on what's cheapest to verify and doesn't need to persist as a new script unless reuse is likely.
- Commit granularity (single commit vs. split by area: RBAC/migration, edge function, client feature+i18n, test cleanup).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep suggestions came up.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SALE-01 | The orphaned `void-order` feature is deleted end-to-end — component, edge function, RBAC `void_order` seed rows, i18n keys, and its E2E spec — while `orders.status='voided'` and any report RPCs (`get_voids_report`, `close_caja_session`) that still read that status live are left untouched. | Full file/line inventory in Runtime State Inventory and the Recommended Task Grouping (Architecture Patterns); DB migration pattern and code in Code Examples; must-not-touch boundary (including the newly-found `audit-actions.ts` case) documented in Summary, Anti-Patterns, and Pitfall 2; SC1-SC5 mapped to concrete automated commands in Validation Architecture. |
</phase_requirements>

## Summary

This phase is a well-scoped deletion, and CONTEXT.md's code_context inventory is accurate but **not exhaustive**. Direct `grep -rl` of `void.order|void_order|voidOrder|VoidOrder` across the whole repo (excluding `node_modules`/`.git`) surfaces six additional live-code hits CONTEXT.md's D-03/D-04 sweep list does not name: `e2e/global-teardown.ts` (a stale suite-label entry), `e2e/09-rbac.spec.ts` (two already-`test.skip()`'d tests, T8/T9, that drive the same orphaned `VoidOrderDialog` via the long-gone `/pos` tab-based page), `e2e/38-audit-logs.spec.ts` (comment-only references, safe to leave or trivially reword), `src/entities/tab/model/queries.concurrent.test.ts` (a comment-only example, harmless), and — the one **compile-breaking** omission — `src/shared/ui/ProtectedAction.test.tsx:21`, which passes the literal string `action="void_order"` into a component typed `action: StaffAction`. Once `'void_order'` is removed from `STAFF_ACTIONS`, this test file fails `npm run typecheck` unless its literal is swapped to a different manager-only action (e.g. `process_refund`). This gap must be added to the plan's sweep list.

The most important **must-not-touch** finding beyond what CONTEXT.md already flagged (`orders.status='voided'`, `get_voids_report`, `close_caja_session`): `src/shared/lib/audit-actions.ts`'s `AuditActionSchema` Zod enum contains `'order.void'` (line 37), which is written *only* by `supabase/functions/void-order/index.ts:106` today. This is the exact same "historical value with no future writer" pattern as `orders.status='voided'` — and it is not decorative: `e2e/38-audit-logs.spec.ts` has a live, unskipped test (`'should display audit entry after voiding an order (order.void filter)'`) that opens the `/audit` page, selects `order.void` from the action-filter dropdown, and asserts the option is selectable. **`'order.void'` must stay in `AuditActionSchema` and must not be deleted alongside the feature** — deleting it would both break that E2E test and silently orphan any historical `audit_logs` rows already carrying `action='order.void'`.

RBAC removal (`role_permissions` DELETE) has a direct precedent already in the migration history — `20260703000006_role_permissions_view_audit_log.sql` — which INSERTs new seed rows with a `-- DOWN:` comment block showing the mirror-image `DELETE`. This phase's new migration is the same pattern in reverse: `DELETE FROM role_permissions WHERE role IN ('manager','admin') AND action = 'void_order'`, wrapped in `BEGIN`/`COMMIT`, with a `DOWN:` comment showing the re-INSERT. `role_permissions.action` is a plain `text` column (no FK/CHECK constraint against an enum), so this DELETE is schema-safe and has zero blast radius beyond the two rows.

**Primary recommendation:** Treat this as a single cross-cutting sweep task (or a small ordered set of tasks: DB migration → RBAC/contracts/i18n → feature folder → E2E), verify with `npm run typecheck && npm run lint && npm run test` after every file group, and finish with the case-insensitive repo-wide grep from this research (scoped to exclude `.planning/`, which is append-only historical record) as the literal SC2 "zero matches" gate. Do not delete `orders.status='voided'`, `get_voids_report`, `close_caja_session`, or `AuditActionSchema`'s `'order.void'` entry.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Remove RBAC action + permission grants | API / Backend (DB migration) + shared lib (`rbac.ts`) | — | `role_permissions` is DB-owned state; `StaffAction`/`STAFF_ACTIONS` is the client-side mirror in `shared/lib` — both must move together per CONTEXT.md D-01 |
| Remove edge function | API / Backend | — | `supabase/functions/void-order/` is a Supabase Edge Function; deleting the directory is a backend-tier change with no client-tier dependency once callers are gone |
| Remove client feature + contracts | Frontend (Browser/SPA) | shared lib (`edge-function-contracts.ts`) | `src/features/void-order/` is FSD `features/` tier; its request/response schemas and `callVoidOrder` live in `shared/lib`, one layer down |
| Remove i18n copy | Frontend (Browser/SPA) | — | `featOrders.json` catalogs are bundled client-side per CLAUDE.md i18n section — no server tier involved |
| Remove/repair E2E coverage | Test tooling (Playwright, outside FSD tiers) | — | `e2e/` is not part of the FSD import graph; treated as its own tier for this map |
| Preserve `orders.status='voided'` + report RPCs | Database / Storage (Postgres) | API / Backend (RPC) | Enum value and `get_voids_report`/`close_caja_session` RPCs are DB-tier; explicitly out of scope for deletion |
| Preserve `AuditActionSchema`'s `'order.void'` | shared lib (Zod schema, single source of truth) | Database / Storage (historical `audit_logs` rows) | Same "historical value, no future writer" pattern as the enum above — client-tier schema, DB-tier data |

## Standard Stack

Not applicable — this phase adds no new dependency, library, or package. It is a subtractive change against an existing stack (React 19 / TypeScript / Supabase / Zod / Playwright / Vitest), already governed by this project's CLAUDE.md.

## Package Legitimacy Audit

Not applicable — no packages are installed, upgraded, or removed from `package.json` in this phase. `@anthropic-ai/sdk` removal is SEC-01 (Phase 6), not this phase.

## Project Constraints (from CLAUDE.md)

- **No manual/human verification anywhere.** Every one of this phase's Success Criteria (button absence, grep-zero-matches, spec deletion, report-RPC survival, refund-still-works) must be proven by an automated Playwright E2E or Vitest run — no `checkpoint:human-verify`, no `human_needed` terminal state.
- **FSD import boundaries enforced by ESLint** (`app → pages → widgets → features → entities → shared`). `src/features/void-order/` deletion does not violate this since it has zero live importers — confirmed by the grep in this research and in CONTEXT.md.
- **Types:** `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, no `any` without a same-line justification comment — applies to any edited (not just deleted) file, e.g. `ProtectedAction.test.tsx`'s literal swap.
- **Migrations lack DOWN scripts project-wide** (per CLAUDE.md "Migration DOWN scripts" note) — but the precedent migration this phase should mirror (`20260703000006_role_permissions_view_audit_log.sql`) *does* include a commented-out `-- DOWN:` block for documentation purposes even though it's not executable. Follow that convention: a real `-- UP:`/`COMMIT` plus a commented `-- DOWN:` block, not an executable rollback.
- **Commit convention:** Conventional Commits, `<type>(<ticket-id>): <description>` — this phase's SALE-01 requirement ID is the natural ticket reference.
- **`npm run typecheck` and `npm run lint` (max-warnings 0) must pass before commit** — the `ProtectedAction.test.tsx` gap in this research will fail `typecheck` if missed.

## Architecture Patterns

### System Architecture Diagram

```
[Client: any screen that could plausibly host a reversal action]
        |
        |  (E2E asserts: no "void order" button/role rendered here)
        v
  /pos , /payments  ---->  PaymentPane (refund flow only, unchanged)
        |
        |  (deleted this phase)
        X   src/features/void-order/ (VoidOrderDialog + useVoidOrder)
        X   -> calls callVoidOrder() in shared/lib/edge-function-contracts.ts
        X      -> POST /functions/v1/void-order  (Supabase Edge Function, deleted)
        X         -> would have written audit_logs.action = 'order.void'

[Surviving reversal path]
  PaymentPane -> process-refund edge function -> payment.refund audit row
        (e2e/35-refund.spec.ts asserts this end-to-end, unchanged)

[Surviving report/schema path — NOT touched by this deletion]
  orders.status = 'voided'  (enum value, DB column)
        <- read by -> get_voids_report RPC       (VoidRefundPanel widget, e2e/07-reports.spec.ts)
        <- read by -> close_caja_session RPC      (caja close flow)
        <- filtered by -> AuditActionSchema['order.void']  (Audit Log page, e2e/38-audit-logs.spec.ts)

[RBAC / permission plane]
  role_permissions (DB table, plain `text` action column)
        DELETE ('manager'|'admin', 'void_order')  <- new forward migration
  src/shared/lib/rbac.ts
        STAFF_ACTIONS array + MANAGER_EXTRA set   <- both must drop 'void_order' (lines 20 & 48)
```

### Recommended Task Grouping (not new architecture — a deletion order that keeps every intermediate state green)

1. **DB migration** — new forward migration deleting the two `role_permissions` rows. Independent of everything else; safest to land first or last, doesn't block client changes either way since `role_permissions` is read at runtime, not at build time.
2. **`rbac.ts` + `edge-function-contracts.ts` + `ProtectedAction.test.tsx`** — these three must land together: removing `'void_order'` from `STAFF_ACTIONS`/`MANAGER_EXTRA` breaks `ProtectedAction.test.tsx`'s literal at compile time unless it's swapped in the same change.
3. **`src/features/void-order/` folder deletion** (component + both `.test.tsx` files + `index.ts`) — safe once nothing imports `callVoidOrder`'s types it might reference (it doesn't; the feature imports *from* `edge-function-contracts.ts`, not the reverse).
4. **`supabase/functions/void-order/` deletion** — independent; no client code calls it once step 2/3 land, but order doesn't strictly matter since it's a separate deploy artifact.
5. **i18n key removal** (`featOrders.json` × 2 locales) — independent, but do after step 3 so there's no window where the (dead, unimported) component references a missing key (moot for typecheck, but tidy).
6. **Test-file sweep**: `edge-function-contracts.test.ts`, `audit-edge-coverage.test.ts` (remove `'void-order'` from `SENSITIVE_EDGE_FUNCTIONS`), `rbac.test.ts`.
7. **E2E sweep**: delete `e2e/18-void-order.spec.ts`, delete `seedVoidableOrder` from `e2e/helpers/supabase.ts`, remove/rewrite T8 and T9 in `e2e/09-rbac.spec.ts` (both currently `test.skip()`'d and drive the same dead `/pos` void flow — leaving them means stale `void order`/`void_order` string literals survive the SC2 grep gate), optionally prune the `18-void-order` label row from `e2e/global-teardown.ts`'s `SUITE_MAP` (cosmetic; other bar-pos-era dead entries already exist there unmaintained, so this is low-risk either way — see Common Pitfalls).
8. **New E2E: assert absence** — add the actual SC1-proving test(s). See Code Examples below.
9. **Final verification**: `npm run typecheck && npm run lint && npm run test`, then the repo-wide grep gate for SC2, then full `npm run test:e2e`.

### Anti-Patterns to Avoid

- **Deleting `AuditActionSchema`'s `'order.void'` entry "because its only writer is gone."** Wrong — it's a historical-value enum member exactly like `orders.status='voided'`, actively exercised by `e2e/38-audit-logs.spec.ts`. Removing it breaks that test and orphans historical audit rows' displayability.
- **Scoping the grep-verification pass to only the files CONTEXT.md's D-03/D-04 list names.** That list is accurate but was written before this research's full-repo grep; it misses `ProtectedAction.test.tsx` (compile-breaking), `e2e/09-rbac.spec.ts` T8/T9, and the `e2e/global-teardown.ts` label. Use the full-repo grep command in this research as the actual completeness check, not the CONTEXT.md list alone.
- **Editing `20260510000001_rls_rewrite_phase13.sql` in place.** Historical migration — already correctly forbidden by CONTEXT.md D-01; reinforced here since it's the single highest-risk mistake in this phase (a rewritten historical migration desyncs any environment that already applied the original).
- **Writing an executable `DOWN:` migration block that actually runs.** This project's convention (per `20260703000006`) is a commented-out `-- DOWN:` block for human reference only — do not make it a live, applied statement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Assert this control never appears anywhere" | A new custom DOM-scanning utility or a bespoke grep-in-CI script from scratch | Playwright's existing `page.getByRole(...)` + `.isVisible().catch(() => false)` idiom already used throughout `e2e/09-rbac.spec.ts` and `e2e/18-void-order.spec.ts` (V3's pattern) | The codebase already has a proven, repo-consistent idiom for "visible-or-absent" assertions; inventing a new one adds a second pattern to maintain |
| "Confirm zero remaining references after deletion" | A persisted new npm script / CI job for this one-off check | A one-off `grep -rn` command run during verification (per CONTEXT.md's own Claude's Discretion note — a persisted script is optional, not required) | This is a single-phase, single-use verification; a shell one-liner satisfies SC2 without adding a maintenance-burden script nobody else will run again |

**Key insight:** Nothing in this phase needs new tooling — every verification mechanism (grep, Playwright role queries, Vitest, `npm run typecheck`) already exists in this codebase and is exercised routinely.

## Runtime State Inventory

**Trigger:** This is a deletion/refactor phase (removing a feature end-to-end including a DB-side RBAC grant), so this section is required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `role_permissions` rows `('manager','void_order')` and `('admin','void_order')` [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:304, 322 — `('manager', 'void_order'),` / `('admin', 'void_order'),`]. Any pre-existing `audit_logs` rows with `action='order.void'` (real production/dev data, cannot be enumerated statically). | New forward migration DELETEs the two `role_permissions` rows (code-owned, safe). `audit_logs` rows are historical and must NOT be touched or deleted — they remain valid, filterable audit history. |
| Live service config | None found. `supabase/config.toml` has no `void-order` reference (confirmed by CONTEXT.md's prior grep and re-confirmed by this session's full-repo grep — it does not appear in the six additional hit files either). | None. |
| OS-registered state | None — this is a web/Tauri app feature with no OS-level task/service registration tied to `void-order`. | None. |
| Secrets/env vars | None — `void-order` edge function uses the same ambient Supabase auth pattern as other functions (Bearer token from the client), no dedicated secret key found in `supabase/functions/void-order/index.ts` (116 lines, checked for `role`/`auth`/`permission` references — only a CORS header string matched). | None. |
| Build artifacts | None found — no compiled/generated artifact carries the `void-order` name outside source (no `supabase.types.ts` entry, since `role_permissions.action` is a plain `text` column with no generated union type). | None. |

**Nothing found in categories:** Live service config, OS-registered state, secrets/env vars, build artifacts — all verified via full-repo grep in this session (see Sources) plus targeted checks against `supabase/config.toml`, the edge function's own auth code, and `supabase.types.ts`'s generation source (plain-text column, no enum to regenerate).

## Common Pitfalls

### Pitfall 1: Removing `'void_order'` from `STAFF_ACTIONS` without also fixing `ProtectedAction.test.tsx`
**What goes wrong:** `npm run typecheck` fails. `ProtectedAction.test.tsx:21` passes `action="void_order"` where the component prop is typed `action: StaffAction` [VERIFIED: src/shared/ui/ProtectedAction.tsx:6 — `action: StaffAction;`]. Once `'void_order'` is removed from the `StaffAction` union (derived from `STAFF_ACTIONS`), this literal no longer type-checks.
**Why it happens:** CONTEXT.md's D-04 sweep list was compiled before a full-repo grep; this file uses `void_order` only as a manager-only-action *example* in a component test, not as feature-specific logic, so it's easy to miss when scoping the sweep to "files that mention void-order feature."
**How to avoid:** Include `src/shared/ui/ProtectedAction.test.tsx` in the sweep. Swap `action="void_order"` for another existing manager-only, non-admin-only action already in `MANAGER_EXTRA`, e.g. `process_refund` or `adjust_inventory` (either preserves the test's intent: "manager-tier action denied to cashier").
**Warning signs:** `npm run typecheck` reports an error in `ProtectedAction.test.tsx` referencing `StaffAction` after the RBAC change lands.

### Pitfall 2: Deleting `AuditActionSchema`'s `'order.void'` entry as part of the "full sweep"
**What goes wrong:** `e2e/38-audit-logs.spec.ts`'s unskipped test `'should display audit entry after voiding an order (order.void filter)'` fails — the `#audit-filter-action` dropdown option `'order.void'` disappears, so `page.getByRole('option', { name: 'order.void' })` times out.
**Why it happens:** `'order.void'` string-matches the feature name being deleted, making it look like an in-scope reference during a keyword sweep, but it's a Zod enum member in `src/shared/lib/audit-actions.ts` [VERIFIED: src/shared/lib/audit-actions.ts:36-37 — `// Orders` / `'order.create',` / `'order.void',`] representing historical audit-trail data, analogous to `orders.status='voided'`.
**How to avoid:** Explicitly exclude `src/shared/lib/audit-actions.ts` from the deletion sweep. Confirm this in the plan as a "must not touch" alongside `orders.status='voided'`.
**Warning signs:** `e2e/38-audit-logs.spec.ts` fails on the `order.void filter` test after the sweep; the `/audit` page's action-filter dropdown is missing the `order.void` option.

### Pitfall 3: Leaving `e2e/09-rbac.spec.ts` T8/T9 in place "because they're already skipped"
**What goes wrong:** SC2's "zero matches" grep gate fails — `void order`/`void_order` string literals remain live in the file (test names, `getByRole` selectors, a comment noting "bartender doesn't have void_order RBAC"). The tests are also fully dead: both drive `/pos`'s tab-based flow that no longer exists post-Phase-2 (direct-sale checkout replaced it), and `VoidOrderDialog` has zero live importers.
**Why it happens:** `test.skip()`'d tests are easy to overlook during a "delete what's referenced" sweep since they don't fail CI today — but they are still source-code references that fail a literal grep-for-zero-matches check.
**How to avoid:** Delete T8 and T9 from `e2e/09-rbac.spec.ts` (or the whole describe block if they're isolated) as part of the E2E sweep, same as `e2e/18-void-order.spec.ts`.
**Warning signs:** SC2's grep command still returns hits in `e2e/09-rbac.spec.ts` after the "full sweep" is believed complete.

### Pitfall 4: Treating `e2e/global-teardown.ts`'s `SUITE_MAP` stale entry as blocking
**What goes wrong:** None functionally — `SUITE_MAP` is a regex-to-label lookup for a post-run report generator; an unmatched regex (for a spec file that no longer exists) is silently ignored, not an error. This is confirmed by the file already containing several other stale entries for specs deleted in Phase 1 (`03-tab-order`, `04-pool-timer`, `06-transfer`, `16-table-status`, `24-pool-advanced`, `25-rappi-orders`) [VERIFIED: e2e/global-teardown.ts:31-57, `const SUITE_MAP: { match: RegExp; label: string }[] = [` through the `24-pool-advanced`/`25-rappi-orders` lines] that were never cleaned up and cause no test failures today.
**Why it happens:** Easy to either over-invest in "must clean this file" or to miss it in the SC2 grep entirely.
**How to avoid:** Remove the `{ match: /^18-void-order/, label: 'Void Order' }` line (line 49) for a genuinely clean SC2 grep result, but treat it as low-priority cosmetic cleanup, not a blocking correctness fix — it will never cause a test to fail either way.
**Warning signs:** None — this is purely a "does the grep gate report zero matches" concern, not a functional one.

### Pitfall 5: Assuming the SC1 "assert absence" E2E needs to seed a voidable order first
**What goes wrong:** Wasted effort porting `seedTabWithOrder`/`seedVoidableOrder`-style setup into a new spec, when the actual assertion needed is much simpler.
**Why it happens:** The old `e2e/18-void-order.spec.ts` seeded orders because it was testing the *dialog's behavior* (reason validation, inventory restore, subtotal update) — those flows no longer exist. SC1 only requires proving the *trigger control* is absent from every screen, which needs no seeded order at all — just navigating to `/pos` and `/payments` as a role that would have had permission (manager/admin) and asserting `page.getByRole('button', { name: /void order/i })` has count 0.
**How to avoid:** Write the absence assertion as a lightweight navigation + `toHaveCount(0)` check (see Code Examples), not a full order-lifecycle E2E.
**Warning signs:** A new E2E spec for this phase re-implements `seedTabWithOrder`/`openCaja`/order-seeding scaffolding that has nothing to do with proving absence.

## Code Examples

### New forward migration — DELETE the role_permissions seed rows
```sql
-- Source: pattern mirrored from supabase/migrations/20260703000006_role_permissions_view_audit_log.sql
-- (that migration INSERTs seed rows with a commented DOWN: DELETE; this migration
-- is the same shape in reverse.)
--
-- Phase 5 (SALE-01): remove the void_order RBAC grants. The seeding migration
-- (20260510000001_rls_rewrite_phase13.sql) is historical and is not edited —
-- this is a new forward migration per D-01.

-- UP:
BEGIN;

DELETE FROM role_permissions
WHERE role IN ('manager', 'admin') AND action = 'void_order';

COMMIT;

-- =============================================================================
-- DOWN (rollback not applied automatically — documented for reference only):
-- BEGIN;
-- INSERT INTO role_permissions (role, action) VALUES
--   ('manager', 'void_order'),
--   ('admin', 'void_order')
-- ON CONFLICT (role, action) DO NOTHING;
-- COMMIT;
-- =============================================================================
```
Suggested filename: continue the existing date-stamped sequence in `supabase/migrations/` (latest at research time: `20260818000005_close_caja_session_authoritative_closed_by.sql` [VERIFIED: `ls supabase/migrations/` output, this session] — pick a filename lexicographically after it, e.g. `20260818000006_drop_void_order_permissions.sql`, since Postgres/Supabase migrations apply in filename order).

### RBAC change — `src/shared/lib/rbac.ts`
```typescript
// Source: src/shared/lib/rbac.ts (read this session, lines 13-33 and 46-57)
// BEFORE (STAFF_ACTIONS, lines 13-33) included 'void_order' at line 20:
export const STAFF_ACTIONS = [
  'create_order',
  'view_own_tabs',
  'view_all_tabs',
  'clock_in',
  'clock_out',
  'close_tab',
  'void_order',        // <-- REMOVE this line
  'view_reports',
  // ...unchanged...
] as const;

// BEFORE (MANAGER_EXTRA, lines 46-57) included 'void_order' at line 48:
const MANAGER_EXTRA: ReadonlySet<StaffAction> = new Set([
  'close_tab',
  'void_order',        // <-- REMOVE this line too (both must change together)
  'view_reports',
  // ...unchanged...
]);
```
Both removals are required — `STAFF_ACTIONS` is the type source (`StaffAction = (typeof STAFF_ACTIONS)[number]`), and `MANAGER_EXTRA` is a `ReadonlySet<StaffAction>` literal that would otherwise contain a value no longer assignable to the (now-narrower) type, which is itself a second, independent reason `npm run typecheck` would fail if only one of the two lines were removed.

### SC1 — Playwright: assert the control is absent everywhere
```typescript
// New test, e.g. added to e2e/18-void-order.spec.ts's replacement location,
// or folded into an existing RBAC/regression spec per planner's commit-
// granularity discretion (CONTEXT.md Claude's Discretion).
// Pattern source: existing idiom already used in e2e/18-void-order.spec.ts V3
// and e2e/09-rbac.spec.ts T8/T9 (`.isVisible({ timeout }).catch(() => false)`),
// generalized here to toHaveCount(0) since no seeded order is needed (Pitfall 5).

test('void-order control is absent from every screen it could plausibly appear on', async ({ page }) => {
  await loginAs(page, 'manager'); // manager/admin previously had the void_order grant
  for (const path of ['/pos', '/payments']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: /void order/i })).toHaveCount(0);
    await expect(page.getByRole('alertdialog', { name: /void order/i })).toHaveCount(0);
  }
  await logout(page);
});
```

### SC2 — grep-for-zero-matches verification command
```bash
# Run from repo root after the sweep. Scope excludes .planning/ (append-only
# historical record — CONTEXT.md/DISCUSSION-LOG.md/REQUIREMENTS.md/STATE.md/
# ROADMAP.md/research/*/milestones/* legitimately still narrate the deleted
# feature's history and are not "the codebase").
grep -rln -i "void.order\|void_order\|voidOrder\|VoidOrder" \
  --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.git .
# Expected: no output (except any residual `-- DOWN:` comment text inside the
# new migration itself, which is expected/intentional and should be excluded
# from a strict pass/fail count, or the grep scoped to exclude that one file).
```

## State of the Art

Not applicable — no external library/API version drift is relevant to a pure deletion phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Suggested next migration filename (`20260818000006_drop_void_order_permissions.sql`) is a naming *suggestion* only — the actual date prefix at plan/execute time should use whatever is lexicographically after the latest migration present in `supabase/migrations/` at that time, since more migrations may land between research and execution. | Code Examples | Low — if a lower/colliding timestamp is used, Supabase's migration runner would apply out of order or reject on conflict; trivially caught at `supabase db push`/CI time. |
| A2 | The recommended replacement action for `ProtectedAction.test.tsx`'s literal (`process_refund` or `adjust_inventory`) is a suggestion, not a locked decision — any other existing `MANAGER_EXTRA` member preserves the test's "manager-tier action denied to cashier" intent equally. | Common Pitfalls / Code Examples | Very low — purely a test-fixture literal choice with no behavioral consequence either way. |

## Open Questions (RESOLVED)

None — CONTEXT.md's decisions (D-01 through D-04) plus this session's full-repo grep fully specify the deletion boundary. The gaps found (ProtectedAction.test.tsx, e2e/09-rbac.spec.ts T8/T9, global-teardown.ts label, audit-actions.ts boundary) are additions to the known sweep list, not open uncertainties.

## Environment Availability

Skipped — this phase has no new external tool/service dependency. All tooling used (Playwright, Vitest, Supabase CLI/migrations, grep) is already established and working in this repo per `CLAUDE.md`'s Commands section.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit) + Playwright v1.59 (E2E) — both already configured |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E, `testDir: './e2e'`) |
| Quick run command | `npx vitest run src/shared/lib/rbac.test.ts src/shared/ui/ProtectedAction.test.tsx src/shared/lib/edge-function-contracts.test.ts src/shared/lib/__tests__/audit-edge-coverage.test.ts` |
| Full suite command | `npm run test` (unit) and `npm run test:e2e` (E2E) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SALE-01 (SC1) | No void-order control reachable from any screen | E2E | `npx playwright test -g "void-order control is absent"` | ❌ Wave 0 — new test to add |
| SALE-01 (SC2) | Edge fn/RBAC rows/i18n keys gone; report RPCs untouched | grep (manual verification step) + existing E2E for `get_voids_report`/`close_caja_session` | `grep` command in Code Examples; `npx playwright test e2e/07-reports.spec.ts` | ✅ report E2E exists; grep is a one-off command, not a persisted test file |
| SALE-01 (SC3) | `18-void-order.spec.ts` deleted, suite passes without it | E2E (absence of file + full suite green) | `npm run test:e2e` | N/A — deletion, not a new file |
| SALE-01 (SC4) | Voids report / caja close still pass unchanged | E2E | `npx playwright test e2e/07-reports.spec.ts e2e/02-caja.spec.ts` | ✅ exists |
| SALE-01 (SC5) | Refund remains sole reversal path | E2E | `npx playwright test e2e/35-refund.spec.ts` | ✅ exists, must pass unchanged |

### Sampling Rate
- **Per task commit:** `npm run typecheck && npm run lint && npx vitest run <touched test files>`
- **Per wave merge:** `npm run test` (full unit suite)
- **Phase gate:** `npm run test:e2e` full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New Playwright test proving SC1 (absence assertion) — no existing file covers this; either add to a renamed/rewritten spec or a new small spec (planner's discretion per CONTEXT.md commit-granularity note).
- [ ] `src/shared/ui/ProtectedAction.test.tsx` literal fix (`action="void_order"` → another `MANAGER_EXTRA` action) — required for `npm run typecheck` to stay green, not itself a new test.

*(No framework install needed — Vitest and Playwright are already fully configured in this repo.)*

## Security Domain

Per `.planning/config.json` inspection intent: this phase performs no new authentication, session, input-validation, or cryptography work — it is a permission-grant *removal*. The one security-relevant property to verify:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged by this phase |
| V3 Session Management | No | Unchanged by this phase |
| V4 Access Control | Yes | `role_permissions` DELETE removes a stale grant (fail-closed direction — reduces attack surface, does not add any). Verify via SC1's E2E that no cashier/manager/admin can reach a void action anymore (the control doesn't exist at all, so there's no bypass surface to test beyond "the button is gone"). |
| V5 Input Validation | No | The deleted edge function's Zod schemas (`VoidOrderRequestSchema`) are removed, not weakened elsewhere |
| V6 Cryptography | No | Unchanged by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale/orphaned RBAC grant surviving after its UI is removed (privilege creep) | Elevation of Privilege | This phase's exact fix: remove the `role_permissions` rows and the `StaffAction` union member together (D-01), not just the UI, so no dormant server-trusted grant remains reachable if a future direct API/RPC call ever checked `role_permissions` for `'void_order'` (confirmed via this session's migration grep that no RPC currently does — but removing the grant is still the correct defense-in-depth move since it costs nothing). |

## Sources

### Primary (HIGH confidence)
- `src/shared/lib/rbac.ts` (Read, full file, this session) — `StaffAction`/`STAFF_ACTIONS`/`MANAGER_EXTRA` exact structure and line numbers
- `src/shared/lib/audit-actions.ts` (Read, lines 1-60, this session) — `AuditActionSchema` enum contents, `'order.void'` at line 37
- `src/shared/ui/ProtectedAction.tsx` (grepped for `action`, this session) — prop typed `action: StaffAction`
- `src/shared/ui/ProtectedAction.test.tsx` (Read, full file, this session) — the compile-breaking `void_order` literal at line 21
- `e2e/09-rbac.spec.ts` (Read, lines 140-210 and grepped for `void`, this session) — T8/T9 skip status and content
- `e2e/38-audit-logs.spec.ts` (grepped + Read lines 195-240, this session) — the live `order.void filter` test
- `e2e/global-teardown.ts` (Read, lines 1-30 + 31-57, this session) — `SUITE_MAP` stale-entry pattern already present for other deleted specs
- `e2e/18-void-order.spec.ts` (Read, full file, this session) — confirms self-skipping, only V1/V4/V6 unskipped and all three degrade to `test.skip()` at runtime when the UI isn't found
- `supabase/migrations/20260703000006_role_permissions_view_audit_log.sql` (Read, full file, this session) — direct precedent for the new DELETE migration's shape
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (grepped for `role_permissions`/`void_order`, this session) — confirms `role_permissions.action` is a plain `text` column, seed row line numbers (304, 322)
- Full-repo `grep -rln` (this session) across all file types — the authoritative reference list for SC2's completeness, superseding CONTEXT.md's code_context list where it differs

### Secondary (MEDIUM confidence)
- `.planning/phases/05-delete-void-order-feature/05-CONTEXT.md` and `05-UI-SPEC.md` — user-approved decisions and confirmed-orphaned-component finding, treated as authoritative for scope/decisions but supplemented (not contradicted) by this session's direct code verification

### Tertiary (LOW confidence)
- None used

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new stack introduced
- Architecture: HIGH — every file reference in this document was read or grepped directly this session, not inferred from training data
- Pitfalls: HIGH — all five pitfalls trace to a specific line/file verified this session, not speculative

**Research date:** 2026-08-16
**Valid until:** Effectively indefinite for this specific deletion (not time-sensitive/version-dependent) — but re-verify the full-repo grep at plan/execute time if significant time passes, since new code could theoretically add fresh `void_order` references in the interim.
