# Phase 7: Backend data integrity - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 5 (modified) + 1 new migration
**Analogs found:** 5 / 5 (all in-repo, prior-commit self-analogs — this phase is a direct evolution of existing files, not new territory)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/202608XX..._receive_shipment_weighted_avg_cost.sql` (new) | migration (SQL RPC) | CRUD (upsert merge) | `supabase/migrations/20260817000002_receive_shipment_atomicity.sql` | exact (same function, prior revision) |
| `supabase/functions/settings-backup/index.ts` | route/edge-function | request-response | itself (prior revision) — sibling `settings-restore/index.ts` | exact |
| `supabase/functions/settings-restore/index.ts` | route/edge-function | request-response | itself (prior revision) — sibling `settings-backup/index.ts` | exact |
| `src/shared/lib/supabase.types.ts` | config (generated) | n/a | itself — regenerate via CLI, no hand pattern needed | exact (generated, not authored) |
| `src/entities/settings/model/queries.ts` (remove `as any`) | service/query hook | CRUD | itself, once types regenerated — cast removal only | exact |
| `src/entities/tab/model/product-sales-report.integration.test.ts` (extend, D-06) | test (integration) | CRUD/regression | `src/entities/settings/model/receipt-settings-rls.integration.test.ts` for service-role harness shape; itself for report-query assertions | role-match |

## Pattern Assignments

### `supabase/migrations/202608XX..._receive_shipment_weighted_avg_cost.sql` (migration, CRUD)

**Analog:** `supabase/migrations/20260817000002_receive_shipment_atomicity.sql` (full body read — 63 lines)

This is a `CREATE OR REPLACE FUNCTION` patch of the same RPC again — copy the file's structure wholesale and only change the per-item inner block (lines 37-50).

**Function signature + guard pattern (lines 1-24, unchanged, keep as-is):**
```sql
CREATE OR REPLACE FUNCTION receive_shipment(p_staff_id uuid, p_supplier_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shipment_id uuid;
  v_elem jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_cost_price numeric(10,2);
  v_expiry_date date;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS', 'message', 'At least one line item is required');
  END IF;
  PERFORM 1 FROM profiles p JOIN role_permissions rp ON rp.role = p.role
    WHERE p.id = p_staff_id AND rp.action = 'adjust_inventory';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to receive shipments');
  END IF;
```

**The exact bug (lines 42-47) — replace this block:**
```sql
    INSERT INTO inventory (product_id, quantity_on_hand, cost_price, expiry_date)
      VALUES (v_product_id, v_quantity, v_cost_price, v_expiry_date)
      ON CONFLICT (product_id) DO UPDATE SET
        quantity_on_hand = inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
        cost_price = EXCLUDED.cost_price,
        expiry_date = EXCLUDED.expiry_date;
```

**New per-item loop shape** (per D-01/D-02/D-03; add new DECLAREs `v_old_qty integer`, `v_old_cost numeric(10,2)`, `v_old_expiry date`, `v_new_qty integer`, `v_new_cost numeric(10,2)`, `v_new_expiry date`):
```sql
    -- Lock and read the existing row first (EXCLUDED only exposes new values,
    -- can't reference old row inside ON CONFLICT DO UPDATE's SET expressions
    -- against itself for a conditional branch).
    SELECT quantity_on_hand, cost_price, expiry_date
      INTO v_old_qty, v_old_cost, v_old_expiry
      FROM inventory WHERE product_id = v_product_id FOR UPDATE;

    IF NOT FOUND OR v_old_qty = 0 THEN
      -- D-02: zero-stock (or no row yet) — replace outright, no averaging.
      v_new_qty := v_quantity;
      v_new_cost := v_cost_price;
      v_new_expiry := v_expiry_date;
    ELSE
      -- D-01: weighted-average cost, rounded to numeric(10,2).
      v_new_cost := ROUND(
        (v_old_qty * v_old_cost + v_quantity * v_cost_price) / (v_old_qty + v_quantity),
        2
      );
      -- D-03: COALESCE-style "real date wins over NULL"; LEAST if both present.
      v_new_expiry := LEAST(
        COALESCE(v_old_expiry, v_expiry_date),
        COALESCE(v_expiry_date, v_old_expiry)
      );
    END IF;

    INSERT INTO inventory (product_id, quantity_on_hand, cost_price, expiry_date)
      VALUES (v_product_id, v_quantity, v_new_cost, v_new_expiry)
      ON CONFLICT (product_id) DO UPDATE SET
        quantity_on_hand = inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
        cost_price = v_new_cost,
        expiry_date = v_new_expiry;
```
Note: `LEAST(COALESCE(a,b), COALESCE(b,a))` gives "real date wins over NULL, earliest wins if both real, NULL only if both NULL" in one expression — verify against D-03's truth table during planning/testing.

**REVOKE/GRANT footer (lines 61-62, unchanged, keep as-is):**
```sql
REVOKE ALL ON FUNCTION public.receive_shipment(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_shipment(uuid, uuid, jsonb) TO service_role;
```

**Error handling (lines 54-57, unchanged, keep as-is):**
```sql
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'code', SQLERRM, 'message', SQLERRM);
WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'RECEIVE_SHIPMENT_FAILED', 'message', SQLERRM);
END;
$$;
```

---

### `supabase/functions/settings-backup/index.ts` (edge function, request-response)

**Analog:** itself (prior revision, same file) — pure deletion, no new pattern.

**Delete the `pool_tables` SELECT** (currently part of the `Promise.all` at lines 68-76):
```typescript
// DELETE this array element and its destructured name:
serviceClient.from('pool_tables').select('*').order('number'),
```
Also remove `poolTablesRes` from the destructuring, from the `.error ||` chain (line 80), and from the `snapshot` object's `pool_tables: poolTablesRes.data,` field (line 91).

**Everything else in the file (auth split, `json()` helper, admin-role check, `BodySchema`) is untouched** — same shared pattern as `settings-restore/index.ts` below; both files share this shape and should stay structurally identical after the edit.

---

### `supabase/functions/settings-restore/index.ts` (edge function, request-response)

**Analog:** itself (prior revision, same file) — pure deletion, no new pattern.

**Delete `pool_tables` from the `Snapshot` type** (lines 19-24):
```typescript
// DELETE this field from the Snapshot type:
pool_tables?: Array<{
  id: string;
  number: number;
  label: string;
  rate_per_hour: number;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
}>;
```

**Delete the read** (line 100): `const poolTables = snapshot.pool_tables ?? [];`

**Delete the upsert block** (lines 124-132):
```typescript
if (poolTables.length > 0) {
  const sanitizedPoolTables = poolTables.map(table => ({
    ...table,
    status: 'available' as const,
    current_session_id: null,
  }));
  const { error } = await serviceClient.from('pool_tables').upsert(sanitizedPoolTables, { onConflict: 'id' });
  if (error) return json({ ok: false, error: { code: 'RESTORE_FAILED', message: error.message } }, 500);
}
```

**Everything else — the `categories`/`modifiers`/`products`/`product_modifiers`/`settings` upsert blocks (lines 103-142), `recordAudit` call at the end — is untouched** and is the pattern to follow if any future restore field is added (per-array `.length > 0` guard, `onConflict` key, immediate error-return).

---

### `src/entities/settings/model/queries.ts` (service/query hook, CRUD — DATA-03)

**Analog:** itself, once `supabase.types.ts` is regenerated. No new code pattern — removal only.

**Current cast to remove** (lines 327-333 read pattern, repeats at 370-373 for the upsert):
```typescript
// `as any` cast + immediate re-cast to a known shape, per CLAUDE.md's
// "Missing generated types workaround"
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
const { data, error } = (await (supabase as any).from('receipt_settings').select('*').maybeSingle()) as { data: ReceiptSettingsRow | null; error: PostgrestError | null };
```
Once `receipt_settings` exists in generated types, replace with the plain typed call: `await supabase.from('receipt_settings').select('*').maybeSingle();` and drop both the cast and the `eslint-disable-next-line` comment (same for the `upsert` at line 373).

**Regen command** (from CLAUDE.md "Missing generated types workaround"):
```bash
npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts
```
Per D-05, confirm at plan time which access path Phase 6 actually used (local vs. live project — no `project_id` link exists per `supabase/config.toml`).

**Scope check:** grep confirmed only this file currently casts for `receipt_settings`; re-grep for `suppliers`/`shipments`/`receive_shipment` `as any` usages at plan time (none found in this pass, but re-verify — DATA-03 covers all four).

---

### `src/entities/tab/model/product-sales-report.integration.test.ts` (test, regression — D-06)

**Analog for report-query assertions:** itself — extend the existing test file rather than creating a new one; it already covers `useProductSalesReport` (`src/entities/tab/model/queries-reports.ts`) with deterministic `IT_*` fixture IDs and a live `testDb` client (`@shared/lib/supabase-test-client`).

**Imports/fixture pattern** (from file top, non-overlapping read):
```typescript
vi.unmock('@shared/lib/supabase');

import { randomUUID } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@shared/lib/supabase';
import { testDb } from '@shared/lib/supabase-test-client';
import { useProductSalesReport } from './queries-reports';
```
Deterministic UUID constants (`IT_SHIFT_ID`, `IT_TAB_IN_RANGE`, etc.) — follow this naming convention for any new fixture rows the D-06 regression test needs (e.g., an `IT_INVENTORY_RESTOCK_PRODUCT`).

**Analog for service-role RPC-call harness (env-guard + skipIf + cleanup):** `src/entities/settings/model/receipt-settings-rls.integration.test.ts` (lines 1-70 read).
```typescript
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const skip = !url || !anonKey || !serviceKey;

async function safe(p: PromiseLike<unknown>): Promise<void> {
  try { await p; } catch { /* best-effort cleanup — ignore */ }
}

describe.skipIf(skip)('... (integration)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient(url!, serviceKey!) as any;
  // ... createAuthStaff(role), cleanup in afterEach/afterAll using `safe()`
});
```
D-06 test shape: snapshot `useProductSalesReport` result → call `receive_shipment` RPC (service-role) → snapshot again → assert prior rows' `cost_price`/margin fields unchanged. This does NOT need the `createAuthStaff`/RLS-denial parts of the analog (no RLS-boundary assertion needed here, per D-06) — only the env-guard/`skipIf`/service-role-client/cleanup skeleton.

## Shared Patterns

### Edge-function auth/response scaffold
**Source:** `supabase/functions/settings-backup/index.ts` lines 1-55 (identical in `settings-restore/index.ts`)
**Apply to:** Both `settings-backup` and `settings-restore` — this scaffold is NOT touched by DATA-02; only the `pool_tables` lines within it are deleted.

### SECURITY DEFINER RPC migration footer
**Source:** `supabase/migrations/20260817000002_receive_shipment_atomicity.sql` lines 61-62
**Apply to:** The new weighted-avg-cost migration — `CREATE OR REPLACE FUNCTION` + explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role`, copied verbatim (function signature unchanged, only body's per-item loop changes).

### `as any` types-workaround removal
**Source:** CLAUDE.md "Missing generated types workaround" section; instance in `src/entities/settings/model/queries.ts` lines 327-333, 370-373
**Apply to:** Any other file found (at plan time) casting `supabase as any` for `suppliers`/`shipments`/`receipt_settings`/`receive_shipment` — same two-line removal (drop cast + drop `eslint-disable-next-line`).

## No Analog Found

None — every file in this phase's scope is either a direct re-edit of a file that already exists (self-analog, prior revision) or a generated artifact (`supabase.types.ts`, regenerated via CLI, no hand-authored pattern to copy).

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/functions/settings-backup/`, `supabase/functions/settings-restore/`, `src/entities/settings/model/`, `src/entities/tab/model/`
**Files scanned:** 6 (all read in full or targeted, no re-reads)
**Pattern extraction date:** 2026-08-17
