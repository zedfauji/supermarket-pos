# Phase 5: Delete void-order feature - Pattern Map

**Mapped:** 2026-08-16
**Files analyzed:** deletion-phase — no new files created; ~15 files deleted or edited
**Analogs found:** precedent-based (this is a subtractive phase; "analogs" below are precedent deletion/migration examples, not scaffolding templates)

## Phase Type Note

This phase creates zero new files. Every "pattern" needed is either (a) the exact reverse of an existing migration precedent, or (b) a small, mechanical edit (remove a line/array entry/schema/registry entry) to an existing file. The planner should treat this PATTERNS.md as a precedent index, not a role/data-flow classification of new files.

## File Classification (files touched this phase)

| File | Action | Role | Data Flow |
|------|--------|------|-----------|
| `supabase/migrations/<new>_drop_void_order_permissions.sql` | create (new migration) | migration | batch (DELETE rows) |
| `src/shared/lib/rbac.ts` | edit (remove 2 lines) | config/domain-constant | N/A |
| `src/shared/lib/edge-function-contracts.ts` | edit (remove schemas + registry entry) | service/contract | request-response |
| `src/shared/ui/ProtectedAction.test.tsx` | edit (swap literal) | test | N/A |
| `src/features/void-order/` (whole folder incl. `index.ts`, `.test.tsx`) | delete | feature (component+hook) | request-response |
| `supabase/functions/void-order/` | delete | edge function | request-response |
| `src/shared/lib/i18n/locales/{es-MX,en-US}/featOrders.json` | edit (remove `voidOrder` key block) | i18n catalog | N/A |
| `src/shared/lib/edge-function-contracts.test.ts` | edit (remove assertions) | test | N/A |
| `src/shared/lib/__tests__/audit-edge-coverage.test.ts` | edit (remove from coverage list) | test | N/A |
| `src/shared/lib/rbac.test.ts` | edit (remove assertions) | test | N/A |
| `e2e/helpers/supabase.ts` | edit (delete `seedVoidableOrder`) | test helper | N/A |
| `e2e/18-void-order.spec.ts` | delete | E2E spec | N/A |
| `e2e/09-rbac.spec.ts` | edit (delete T8/T9) | E2E spec | N/A |
| `e2e/global-teardown.ts` | edit (remove stale `SUITE_MAP` label, optional/cosmetic) | test tooling | N/A |
| new E2E assertion (SC1) — likely added to `e2e/09-rbac.spec.ts` or a small new spec | create | E2E spec | request-response |

## Pattern Assignments

### `supabase/migrations/<new-timestamp>_drop_void_order_permissions.sql` (migration)

**Analog:** `supabase/migrations/20260703000006_role_permissions_view_audit_log.sql` (full file read this session) — this is a direct, structurally-identical precedent: INSERT-with-commented-DOWN-DELETE. This phase's migration is the same shape in reverse (DELETE-with-commented-DOWN-INSERT).

**Full precedent file** (`20260703000006_role_permissions_view_audit_log.sql`):
```sql
-- UP:
BEGIN;

INSERT INTO role_permissions (role, action) VALUES
  ('manager', 'view_audit_log'),
  ('admin', 'view_audit_log')
ON CONFLICT (role, action) DO NOTHING;

COMMIT;

-- =============================================================================
-- DOWN:
-- BEGIN;
-- DELETE FROM role_permissions WHERE role IN ('manager', 'admin') AND action = 'view_audit_log';
-- COMMIT;
-- =============================================================================
```

**Apply as (mirror-image — DELETE forward, INSERT commented as DOWN):**
```sql
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

**Convention notes:**
- Do NOT edit `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (the historical seeding migration, rows at lines ~304/322) — always a new forward migration for removals in this codebase.
- Filename: pick a timestamp lexicographically after the latest file in `supabase/migrations/` at execution time (verify with `ls supabase/migrations/ | tail -5` — do not trust a stale "latest" value from research).
- The `-- DOWN:` block is documentation-only, never executable, per this precedent and per CLAUDE.md's "Migration DOWN scripts" note.
- `role_permissions.action` is a plain `text` column (no FK/enum constraint) — the DELETE is schema-safe with zero blast radius beyond the two target rows.

---

### `src/shared/lib/rbac.ts` (config/domain-constant edit)

**Current state (read this session, lines 13-59):**
```typescript
export const STAFF_ACTIONS = [
  'create_order',
  'view_own_tabs',
  'view_all_tabs',
  'clock_in',
  'clock_out',
  'close_tab',
  'void_order',        // line 20 — REMOVE
  'view_reports',
  'adjust_inventory',
  'manage_products',
  'manage_staff',
  'manage_settings',
  'delete_tab',
  'view_all_shifts',
  'manage_caja',
  'process_refund',
  'view_audit_log',
  'edit_paid_tab',
  'reopen_tab',
] as const;

export type StaffAction = (typeof STAFF_ACTIONS)[number];

const MANAGER_EXTRA: ReadonlySet<StaffAction> = new Set([
  'close_tab',
  'void_order',        // line 48 — REMOVE
  'view_reports',
  'adjust_inventory',
  'manage_products',
  'manage_caja',
  'process_refund',
  'view_audit_log',
  'edit_paid_tab',
  'reopen_tab',
]);
```

**Pattern:** Both `STAFF_ACTIONS` (the type source — `StaffAction = (typeof STAFF_ACTIONS)[number]`) and `MANAGER_EXTRA` (a `ReadonlySet<StaffAction>` literal) must drop `'void_order'` in the same change — removing only one leaves either a stale grant (`STAFF_ACTIONS` still has it) or a type error (`MANAGER_EXTRA` contains a value no longer assignable to the narrowed `StaffAction` union). `CASHIER_ACTIONS`/`KITCHEN_ACTIONS` (lines 37-44, 60) never contained `void_order` — no change needed there, but worth a quick re-grep before editing to confirm current line numbers haven't drifted since this read.

---

### `src/shared/lib/edge-function-contracts.ts` (service/contract edit)

**Analog / target for removal (per RESEARCH.md, lines ~708-787 request/response schemas, ~1224-1227 registry entry):** `VoidOrderRequestSchema`, `VoidOrderResponseSchema`, `callVoidOrder`, and the `'void-order'` registry entry. Not read fully this session (line numbers per RESEARCH.md's verified grep) — re-grep at execute time (`grep -n "VoidOrder\|void-order" src/shared/lib/edge-function-contracts.ts`) since exact offsets may have shifted.

**Pattern:** This file follows a "one registry object maps action names to Zod request/response schemas + a typed caller function" shape — removing a feature here means deleting the schema pair, the caller export, and its one line in the central registry object. Every other edge-function entry in the same file (e.g. `process-refund`, `receive-shipment`) is a same-shape sibling — use one of those as the structural template if the exact `void-order` block needs to be re-located precisely.

---

### `src/shared/ui/ProtectedAction.test.tsx` (test edit — compile-breaking gap found in research)

**Current state (line 21, per RESEARCH.md verified read):** passes literal `action="void_order"` into a component typed `action: StaffAction` (`src/shared/ui/ProtectedAction.tsx:6`).

**Required fix:** swap the literal to another existing `MANAGER_EXTRA` member that preserves the test's "manager-tier action denied to cashier" intent — e.g. `process_refund` or `adjust_inventory` (both still present in `MANAGER_EXTRA` per the rbac.ts excerpt above). This is not optional — `npm run typecheck` fails once `'void_order'` is removed from `StaffAction` unless this literal is swapped in the same change (must land together with the `rbac.ts` edit per RESEARCH.md's task grouping step 2).

---

### `src/features/void-order/` (feature folder — delete outright)

**No analog needed — straight deletion.** Confirmed zero live importers of `VoidOrderDialog`/`useVoidOrder` outside their own folder (CONTEXT.md + RESEARCH.md both verified via grep). Delete: `model/useVoidOrder.ts`, `model/useVoidOrder.test.tsx`, `ui/VoidOrderDialog.tsx`, `ui/VoidOrderDialog.test.tsx`, `index.ts`.

---

### `supabase/functions/void-order/` (edge function — delete outright)

**No analog needed — straight deletion**, independent deploy artifact, no live callers once the client feature and contracts are removed (D-02). ~116 lines, no dedicated secret/env var found (RESEARCH.md Runtime State Inventory).

---

### `src/shared/lib/i18n/locales/{es-MX,en-US}/featOrders.json` (i18n catalog edit)

**Pattern:** Remove the `voidOrder` key block (line ~85 per CONTEXT.md) from both locale files identically — this project's i18n convention (CLAUDE.md) requires es-MX/en-US catalogs to stay key-parity even during removals, so both files must be edited together in the same commit.

---

## Shared / Cross-Cutting Patterns

### RBAC removal must move in lockstep (DB + type + test)
**Source:** `src/shared/lib/rbac.ts` + new migration + `src/shared/ui/ProtectedAction.test.tsx`
**Apply to:** All three files in the same task/commit — removing `void_order` from only one desyncs runtime DB grants from the client-side type, or breaks `npm run typecheck`.

### Registry-object contract pattern
**Source:** `src/shared/lib/edge-function-contracts.ts`
**Apply to:** Deletion of any edge-function entry = delete schema pair + caller export + one registry-object line, mirroring how every other edge function entry (e.g. `process-refund`) is structured.

### "Historical value, no future writer" — must NOT be touched
**Sources:**
- `orders.status = 'voided'` (DB enum) — still read by `get_voids_report`, `close_caja_session`.
- `src/shared/lib/audit-actions.ts` `AuditActionSchema` — `'order.void'` entry (line ~37) is a **historical enum member**, actively exercised by `e2e/38-audit-logs.spec.ts`'s unskipped `order.void filter` test. Its only writer (`supabase/functions/void-order/index.ts:106`) is being deleted, but the schema entry itself must stay — same pattern as `orders.status='voided'`.
- `src/widgets/VoidRefundPanel/` — separate read-only report widget, no import relationship to the deleted feature.
**Apply to:** Explicit "must not touch" list in the plan; do not let a keyword grep sweep delete these.

### Test-sweep completeness beyond CONTEXT.md's list
**Source:** RESEARCH.md's full-repo grep, four additional hits not in CONTEXT.md's D-03/D-04 list:
- `src/shared/ui/ProtectedAction.test.tsx` (compile-breaking, see above)
- `e2e/09-rbac.spec.ts` T8/T9 (already `test.skip()`'d but still literal-matching source, must delete for SC2 grep-zero gate)
- `e2e/global-teardown.ts` `SUITE_MAP` stale `18-void-order` label (cosmetic, low priority — other Phase-1-era stale entries already exist unmaintained)
- `e2e/38-audit-logs.spec.ts` (comment-only refs, safe to leave or reword) and `src/entities/tab/model/queries.concurrent.test.ts` (comment-only, harmless)

### SC1 E2E "assert absence" pattern
**Source:** existing idiom in `e2e/18-void-order.spec.ts` V3 and `e2e/09-rbac.spec.ts` T8/T9 (`.isVisible({ timeout }).catch(() => false)`), generalized to `toHaveCount(0)` since no seeded order is needed:
```typescript
test('void-order control is absent from every screen it could plausibly appear on', async ({ page }) => {
  await loginAs(page, 'manager');
  for (const path of ['/pos', '/payments']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: /void order/i })).toHaveCount(0);
    await expect(page.getByRole('alertdialog', { name: /void order/i })).toHaveCount(0);
  }
  await logout(page);
});
```

### SC2 verification (grep-zero-matches gate, one-off, not a persisted script)
```bash
grep -rln -i "void.order\|void_order\|voidOrder\|VoidOrder" \
  --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.git .
# Expected: no output (except the new migration's own intentional DOWN-comment text)
```

## No Analog Found

N/A — every file in this phase is either a mechanical edit to an existing file (rbac.ts, edge-function-contracts.ts, i18n JSON, test files) or a straight deletion; the one new artifact (the migration) has a direct, structurally-identical precedent (`20260703000006_role_permissions_view_audit_log.sql`).

## Metadata

**Analog search scope:** `supabase/migrations/`, `src/shared/lib/rbac.ts`, `src/shared/lib/edge-function-contracts.ts`, `src/shared/ui/ProtectedAction.test.tsx`, `src/features/void-order/`, `e2e/09-rbac.spec.ts`, `e2e/18-void-order.spec.ts`, `e2e/38-audit-logs.spec.ts`, `e2e/global-teardown.ts`, `src/shared/lib/audit-actions.ts` — all cross-checked against RESEARCH.md's session-verified line numbers plus this session's direct reads of `rbac.ts` and the migration precedent.
**Files scanned:** ~15 (all files touched by this phase, per CONTEXT.md + RESEARCH.md inventories)
**Pattern extraction date:** 2026-08-16
