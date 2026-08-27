/**
 * E2E: D-13 representative RLS-boundary coverage.
 *
 * A cashier-role signed-in client (Plan 17-03's `createRoleScopedClient`)
 * is denied 2 manager+-gated mutations, proven with a real signed-in
 * Postgres/PostgREST response -- never a service-role client, which would
 * bypass RLS entirely and produce a false-negative pass (the exact threat
 * this file exists to prevent, per the phase's threat register T-17-01).
 *
 * Setup/cleanup needs *some* admin-level access (seed a supplier, seed a
 * caja session, verify DB state, delete test rows). Rather than the
 * project's usual service-role helper in e2e/helpers/supabase.ts, this
 * constructs its own service-role client the same way
 * src/entities/purchase-order/model/purchase-orders-rls.integration.test.ts
 * does (raw `createClient` + `SUPABASE_SERVICE_ROLE_KEY`) -- the
 * client-construction shape that file's pattern doc calls out as the
 * reusable part. This keeps every "was this denied?" assertion visibly
 * scoped to the two role-scoped clients below, with no shared helper that
 * could be reached for by a future denial assertion by mistake.
 */
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { createRoleScopedClient } from '../helpers/rls-clients';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { resetTestState } from '../helpers/supabase';

function adminClient() {
  const url = process.env['VITE_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rls-boundary-admin' },
  });
}

test.describe('RLS boundary — cashier denied, manager allowed (D-13)', () => {
  let cashier: Awaited<ReturnType<typeof createRoleScopedClient>>;
  let manager: Awaited<ReturnType<typeof createRoleScopedClient>>;
  let supplierId: string;
  let cajaSessionId: string;
  const createdPurchaseOrderIds: string[] = [];

  test.beforeAll(async () => {
    requireIntegrationEnv();
    // Closes any caja_sessions row left open by another spec's run so this
    // file's own single-open-caja insert below doesn't collide with
    // caja_sessions_one_open.
    await resetTestState();

    cashier = await createRoleScopedClient('cashier', 'rls-boundary-cashier');
    manager = await createRoleScopedClient('manager', 'rls-boundary-manager');

    const admin = adminClient();

    const { data: supplier, error: supplierErr } = await admin
      .from('suppliers')
      .insert({ name: `__e2e_rls_boundary_supplier_${Date.now()}__` })
      .select('id')
      .single();
    if (supplierErr || !supplier) throw new Error(supplierErr?.message ?? 'supplier seed failed');
    supplierId = (supplier as { id: string }).id;

    const { data: mgrProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'manager')
      .limit(1)
      .maybeSingle();
    if (!mgrProfile) throw new Error('rls-boundary setup: no manager profile found (run npm run setup:dev)');

    const { data: cajaRow, error: cajaErr } = await admin
      .from('caja_sessions')
      .insert({ opened_by: (mgrProfile as { id: string }).id, opening_cash: 100, status: 'open' })
      .select('id')
      .single();
    if (cajaErr || !cajaRow) throw new Error(cajaErr?.message ?? 'caja_sessions seed failed');
    cajaSessionId = (cajaRow as { id: string }).id;
  });

  test.afterAll(async () => {
    const admin = adminClient();
    for (const id of createdPurchaseOrderIds) {
      await admin.from('purchase_orders').delete().eq('id', id);
    }
    if (cajaSessionId) await admin.from('caja_sessions').delete().eq('id', cajaSessionId);
    if (supplierId) await admin.from('suppliers').delete().eq('id', supplierId);
    await cashier?.cleanup();
    await manager?.cleanup();
  });

  test('Test 1: cashier INSERT into purchase_orders is denied by RLS', async () => {
    const { data, error } = await cashier.client
      .from('purchase_orders')
      .insert({ supplier_id: supplierId, status: 'draft' })
      .select();

    // purchase_orders_manage's WITH CHECK fails for a role lacking
    // manage_products -> PostgREST/Postgres reports a real RLS-shaped
    // error (42501), it never silently no-ops on INSERT.
    expect(error).not.toBeNull();
    expect(error?.code ?? error?.message ?? '').toMatch(/42501|row-level security/i);
    expect(data).toBeNull();

    const admin = adminClient();
    const { data: rows, error: rowsErr } = await admin
      .from('purchase_orders')
      .select('id')
      .eq('supplier_id', supplierId);
    expect(rowsErr).toBeNull();
    expect((rows ?? []) as unknown[]).toHaveLength(0);
  });

  test('Test 2: cashier UPDATE on caja_sessions is denied by RLS (row left untouched)', async () => {
    const { data, error } = await cashier.client
      .from('caja_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: cashier.userId,
        closing_cash: 100,
      })
      .eq('id', cajaSessionId)
      .select();

    // caja_sessions_update_manager_admin's USING clause filters the row out
    // entirely for a cashier before WITH CHECK is ever evaluated -> 0 rows
    // matched, not a thrown error (unlike Test 1's INSERT denial).
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect((data ?? []) as unknown[]).toHaveLength(0);
    }

    const admin = adminClient();
    const { data: row, error: rowErr } = await admin
      .from('caja_sessions')
      .select('status')
      .eq('id', cajaSessionId)
      .single();
    expect(rowErr).toBeNull();
    expect((row as { status: string } | null)?.status).toBe('open');
  });

  test('Test 3 (sanity): a manager client performing the SAME purchase_orders insert as Test 1 succeeds', async () => {
    const { data, error } = await manager.client
      .from('purchase_orders')
      .insert({ supplier_id: supplierId, status: 'draft' })
      .select('id')
      .single();

    expect(error).toBeNull();
    const id = (data as { id: string } | null)?.id;
    expect(id).toBeTruthy();
    if (id) createdPurchaseOrderIds.push(id);
  });
});
