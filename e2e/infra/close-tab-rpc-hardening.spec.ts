/**
 * E2E spec: Phase 28 Plan 02 — folded todo
 * (.planning/todos/pending/audit-manager-pin-identity-in-remaining-rpcs.md, T-28-05)
 *
 * close_tab is a live `GRANT EXECUTE ... TO authenticated` PostgREST endpoint
 * with zero authorization check of any kind, despite having no UI caller
 * today (28-RESEARCH.md Pitfall 4) — any authenticated staff member,
 * cashier included, could call it directly and force a tab's status. This
 * proves Task 1's hardening: a direct RPC call from a non-manager/admin
 * session is rejected with AUTH_FORBIDDEN, and a manager/admin session
 * succeeds.
 *
 * Uses createRoleScopedClient (Plan 17-03) — a real signed-in
 * Postgres/PostgREST client, never a service-role client (which would
 * bypass the check entirely and produce a false-negative pass).
 *
 * Requires bar-pos/.env.local (or equivalent env) with VITE_SUPABASE_URL,
 * VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
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
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'close-tab-hardening-admin' },
  });
}

async function seedOpenTab(): Promise<{ tabId: string; version: number }> {
  const admin = adminClient();

  const { data: profile } = await admin.from('profiles').select('id').eq('role', 'admin').limit(1).single();

  let shiftId: string;
  const { data: existingShift } = await admin
    .from('shifts')
    .select('id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift } = await admin
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: `E2E close_tab hardening ${String(Date.now())}`,
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id, version')
    .single();
  if (tabErr || !tab) throw new Error(`seedOpenTab: tab insert failed - ${tabErr?.message}`);

  return { tabId: tab.id as string, version: tab.version as number };
}

test.describe('close_tab RPC hardening (T-28-05, folded todo)', () => {
  test.beforeAll(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('a direct close_tab RPC call from a cashier (non-manager/admin) session is rejected with AUTH_FORBIDDEN', async () => {
    const cashier = await createRoleScopedClient('cashier', 'close-tab-hardening-cashier');
    const seeded = await seedOpenTab();

    try {
      const { data, error } = await cashier.client.rpc('close_tab', {
        p_tab_id: seeded.tabId,
        p_status: 'closed',
        p_expected_version: seeded.version,
      });

      expect(error).not.toBeNull();
      expect(error?.message ?? '').toContain('AUTH_FORBIDDEN');
      expect(data).toBeNull();

      // Verify the tab was NOT mutated by the rejected call.
      const admin = adminClient();
      const { data: tabRow } = await admin.from('tabs').select('status').eq('id', seeded.tabId).single();
      expect((tabRow as { status: string }).status).toBe('open');
    } finally {
      await cashier.cleanup();
      const admin = adminClient();
      await admin.from('tabs').delete().eq('id', seeded.tabId);
    }
  });

  test('a direct close_tab RPC call from a manager/admin session succeeds', async () => {
    const manager = await createRoleScopedClient('manager', 'close-tab-hardening-manager');
    const seeded = await seedOpenTab();

    try {
      const { data, error } = await manager.client.rpc('close_tab', {
        p_tab_id: seeded.tabId,
        p_status: 'closed',
        p_expected_version: seeded.version,
      });

      expect(error).toBeNull();
      expect((data as { ok: boolean } | null)?.ok).toBe(true);

      const admin = adminClient();
      const { data: tabRow } = await admin
        .from('tabs')
        .select('status, closed_at')
        .eq('id', seeded.tabId)
        .single();
      expect((tabRow as { status: string }).status).toBe('closed');
      expect((tabRow as { closed_at: string | null }).closed_at).not.toBeNull();
    } finally {
      await manager.cleanup();
      const admin = adminClient();
      await admin.from('tabs').delete().eq('id', seeded.tabId);
    }
  });
});
