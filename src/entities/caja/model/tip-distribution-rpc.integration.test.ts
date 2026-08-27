/* eslint-disable */
/**
 * Integration tests: close_caja_session RPC — tip distribution (Phase 19, Plan 02)
 *
 * Requires: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars
 * Auth tests also require: VITE_SUPABASE_ANON_KEY + E2E_MANAGER_NAME + E2E_MANAGER_PIN
 * Bartender-gated RLS test also requires: E2E_BARTENDER_NAME + E2E_BARTENDER_PIN
 * Run: cd bar-pos && npx vitest run src/entities/caja/model/tip-distribution-rpc.integration.test.ts
 *
 * NOTE (Phase 19, Plan 02 -> Plan 03 handoff): this scaffold is written and runs
 * (skipping gracefully) BEFORE the two migrations it exercises
 * (20260709000001_tip_distribution_entries_table.sql,
 * 20260709000002_close_caja_session_tip_distribution.sql) are pushed to the
 * live Supabase project. Plan 03 is the BLOCKING push. Until that push lands,
 * these tests will fail at runtime against a live env (missing table/RPC
 * columns) even though they parse and the env-guard skip path exits 0. They
 * become the SC-2 + regression behavioral gate once Plan 03 completes.
 *
 * close_caja_session uses auth.uid() in SECURITY DEFINER context, so the
 * close call itself must be made with an authenticated manager/admin JWT.
 * Service role client is used only for data seeding + cleanup (bypasses RLS).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ── Env guards ────────────────────────────────────────────────────────────────

const hasEnv =
  typeof process.env['VITE_SUPABASE_URL'] === 'string' &&
  process.env['VITE_SUPABASE_URL'] !== '' &&
  typeof process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'string' &&
  process.env['SUPABASE_SERVICE_ROLE_KEY'] !== '';

/** close_caja_session calls auth.uid() -> needs signed-in manager JWT + anon key */
const hasAuthEnv =
  hasEnv &&
  typeof process.env['VITE_SUPABASE_ANON_KEY'] === 'string' &&
  process.env['VITE_SUPABASE_ANON_KEY'] !== '' &&
  typeof process.env['E2E_MANAGER_NAME'] === 'string' &&
  process.env['E2E_MANAGER_NAME'] !== '' &&
  typeof process.env['E2E_MANAGER_PIN'] === 'string' &&
  process.env['E2E_MANAGER_PIN'] !== '';

const hasBartenderEnv =
  hasAuthEnv &&
  typeof process.env['E2E_BARTENDER_NAME'] === 'string' &&
  process.env['E2E_BARTENDER_NAME'] !== '' &&
  typeof process.env['E2E_BARTENDER_PIN'] === 'string' &&
  process.env['E2E_BARTENDER_PIN'] !== '';

/** Live-DB test using service role (for seeding + RLS-as-service-role checks) */
const itInt = hasEnv ? it : it.skip;
/** Live-DB test that calls close_caja_session as manager (needs auth env) */
const itAuth = hasAuthEnv ? it : it.skip;
/** Live-DB test that exercises RLS as bartender (needs bartender env) */
const itBartender = hasBartenderEnv ? it : it.skip;

// ── Client factories ──────────────────────────────────────────────────────────

function getServiceDb(): any {
  const url = process.env['VITE_SUPABASE_URL']!;
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns a Supabase client authenticated as the named staff member.
 * Looks up the profile email via service role, then signs in with anon key + PIN.
 */
async function getAuthClient(name: string, pin: string): Promise<SupabaseClient> {
  const url = process.env['VITE_SUPABASE_URL']!;
  const anonKey = process.env['VITE_SUPABASE_ANON_KEY']!;

  const svc = getServiceDb();
  const { data: profile, error: profileErr } = await svc
    .from('profiles')
    .select('email')
    .eq('name', name)
    .single();
  if (profileErr || !profile?.email) {
    throw new Error(
      `getAuthClient: profile "${name}" not found or missing email: ${profileErr?.message ?? 'no email'}`,
    );
  }

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email: profile.email as string,
    password: pin, // PIN is used as password for E2E accounts
  });
  if (authErr || !authData.session) {
    throw new Error(`getAuthClient: sign-in failed for "${name}": ${authErr?.message ?? 'no session'}`);
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function getManagerAndShift(svc: any): Promise<{ staffId: string; shiftId: string }> {
  const { data: staff } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['manager', 'admin'])
    .limit(1)
    .single();
  if (!staff) throw new Error('getManagerAndShift: no manager/admin profile found');
  const staffId = staff.id as string;

  const { data: existing } = await svc
    .from('shifts')
    .select('id')
    .eq('staff_id', staffId)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();

  if (existing) return { staffId, shiftId: existing.id as string };

  const { data: newShift, error: shiftErr } = await svc
    .from('shifts')
    .insert({ staff_id: staffId, opening_cash: 0 })
    .select('id')
    .single();
  if (shiftErr || !newShift) throw new Error(`getManagerAndShift: shift create failed: ${shiftErr?.message ?? 'no row'}`);
  return { staffId, shiftId: newShift.id as string };
}

interface CajaSeed {
  cajaId: string;
  tabId: string;
  paymentId: string;
  initialVersion: number;
}

/**
 * The DB enforces at most one OPEN caja_session at a time
 * (caja_sessions_one_open unique index). Close any pre-existing open
 * sessions before seeding a new one — same convention used by
 * pending-total.integration.test.ts against this shared live env.
 *
 * caja_sessions is a versioned row (Phase 15 trg_caja_sessions_version):
 * every UPDATE must bump version = version + 1 by exactly 1 or the trigger
 * raises STALE_VERSION. Fetch each open row's current version explicitly
 * (a blind .update({status:'closed', ...}) without version+1 would silently
 * fail against that trigger).
 */
async function closeOtherOpenCajas(svc: any): Promise<void> {
  const { data: openRows } = await svc.from('caja_sessions').select('id, version').eq('status', 'open');
  for (const row of (openRows ?? []) as { id: string; version: number }[]) {
    const { error } = await svc
      .from('caja_sessions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closing_cash: 0,
        version: row.version + 1,
      })
      .eq('id', row.id);
    if (error) throw new Error(`closeOtherOpenCajas: failed to close ${row.id}: ${error.message}`);
  }
}

/**
 * Seeds an OPEN caja_session, a 'paid' tab under it (paid tabs don't block
 * close_caja_session's open-tab guard), an order, and one payment row with
 * the given tip_amount.
 */
async function seedCajaWithTips(svc: any, tipAmount: number): Promise<CajaSeed> {
  const { staffId, shiftId } = await getManagerAndShift(svc);
  await closeOtherOpenCajas(svc);

  const { data: caja, error: cajaErr } = await svc
    .from('caja_sessions')
    .insert({ opened_by: staffId, opening_cash: 0, status: 'open' })
    .select('id, version')
    .single();
  if (cajaErr || !caja) throw new Error(`seedCajaWithTips: caja insert failed: ${cajaErr?.message ?? 'no row'}`);

  const { data: tab, error: tabErr } = await svc
    .from('tabs')
    .insert({
      customer_name: `Tip Distribution Integration Tab ${Date.now()}`,
      staff_id: staffId,
      shift_id: shiftId,
      caja_session_id: caja.id,
      status: 'paid',
      closed_at: new Date().toISOString(), // CHECK: paid requires closed_at IS NOT NULL
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedCajaWithTips: tab insert failed: ${tabErr?.message ?? 'no row'}`);

  const { error: orderErr } = await svc
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: staffId, status: 'served' });
  if (orderErr) throw new Error(`seedCajaWithTips: order insert failed: ${orderErr.message}`);

  const { data: payment, error: payErr } = await svc
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: 20.0,
      tip_amount: tipAmount,
      method: 'cash',
      processed_by: staffId,
      idempotency_key: `seed-tip-distribution-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) throw new Error(`seedCajaWithTips: payment insert failed: ${payErr?.message ?? 'no row'}`);

  return {
    cajaId: caja.id as string,
    tabId: tab.id as string,
    paymentId: payment.id as string,
    initialVersion: caja.version as number,
  };
}

/** Seeds a fresh OPEN caja_session with no tabs (for RLS FK-satisfying probes). */
async function seedBareOpenCaja(svc: any): Promise<string> {
  // NOTE: does NOT call closeOtherOpenCajas — callers must ensure any other
  // open session (e.g. one created by seedCajaWithTips) is already closed
  // via the RPC before calling this, or the one-open-caja index will collide.
  const { staffId } = await getManagerAndShift(svc);
  const { data: caja, error } = await svc
    .from('caja_sessions')
    .insert({ opened_by: staffId, opening_cash: 0, status: 'open' })
    .select('id')
    .single();
  if (error || !caja) throw new Error(`seedBareOpenCaja: insert failed: ${error?.message ?? 'no row'}`);
  return caja.id as string;
}

/**
 * Cleanup: payments (RESTRICT FK to tabs) -> tabs (CASCADE to orders/order_items)
 * -> caja_sessions (CASCADE to tip_distribution_entries).
 */
async function cleanupCaja(svc: any, cajaId: string): Promise<void> {
  const { data: tabs } = await svc.from('tabs').select('id').eq('caja_session_id', cajaId);
  for (const t of (tabs ?? []) as { id: string }[]) {
    await svc.from('payments').delete().eq('tab_id', t.id);
  }
  await svc.from('tabs').delete().eq('caja_session_id', cajaId);
  await svc.from('caja_sessions').delete().eq('id', cajaId);
}

async function getTipDistributionConfig(svc: any): Promise<{ value: unknown } | null> {
  const { data } = await svc.from('settings').select('value').eq('key', 'tip_distribution').maybeSingle();
  return data ?? null;
}

async function setTipDistributionConfig(svc: any, value: Record<string, number> | null): Promise<void> {
  if (value === null) {
    await svc.from('settings').delete().eq('key', 'tip_distribution');
    return;
  }
  await svc.from('settings').upsert({ key: 'tip_distribution', value }, { onConflict: 'key' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('close_caja_session RPC — tip distribution (integration)', () => {
  let svc: any;
  let cajaIds: string[];
  let originalConfig: { value: unknown } | null;

  beforeEach(async () => {
    svc = getServiceDb();
    cajaIds = [];
    originalConfig = hasEnv ? await getTipDistributionConfig(svc) : null;
  });

  afterEach(async () => {
    for (const id of cajaIds) {
      try {
        await cleanupCaja(svc, id);
      } catch {
        // best-effort cleanup — do not fail the test on cleanup errors
      }
    }
    if (hasEnv) {
      // Restore the pre-test 'tip_distribution' settings row so other tests
      // (and other Phase 19 plans) don't inherit test-mutated config.
      try {
        if (originalConfig) {
          await svc
            .from('settings')
            .upsert({ key: 'tip_distribution', value: originalConfig.value }, { onConflict: 'key' });
        } else {
          await svc.from('settings').delete().eq('key', 'tip_distribution');
        }
      } catch {
        // best-effort restore
      }
    }
  });

  itInt('seed sanity check: service-role seeding produces an open caja with a paid tab + payment', async () => {
    const { cajaId, tabId, paymentId } = await seedCajaWithTips(svc, 7.5);
    cajaIds.push(cajaId);

    const { data: caja } = await svc.from('caja_sessions').select('status').eq('id', cajaId).single();
    expect(caja.status).toBe('open');

    const { data: tab } = await svc.from('tabs').select('status, caja_session_id').eq('id', tabId).single();
    expect(tab.status).toBe('paid');
    expect(tab.caja_session_id).toBe(cajaId);

    const { data: payment } = await svc.from('payments').select('tip_amount').eq('id', paymentId).single();
    expect(Number(payment.tip_amount)).toBe(7.5);
  });

  itAuth('regression (Pitfall 1): close_caja_session succeeds, no STALE_VERSION, version increments by 1', async () => {
    const { cajaId, initialVersion } = await seedCajaWithTips(svc, 5.0);
    cajaIds.push(cajaId);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );

    const { data, error } = await (managerClient as any).rpc('close_caja_session', {
      p_caja_id: cajaId,
      p_closed_by: null,
      p_closing_cash: 0,
      p_notes: null,
    });

    expect(error).toBeNull();
    expect(data?.ok).toBe(true);
    expect(data?.error?.code).not.toBe('STALE_VERSION');

    const { data: after } = await svc.from('caja_sessions').select('version, status').eq('id', cajaId).single();
    expect(after.status).toBe('closed');
    expect(after.version).toBe(initialVersion + 1);
  });

  itAuth('SC-2: allocations sum to total tips per the configured split', async () => {
    await setTipDistributionConfig(svc, { floorPct: 50, barPct: 30, kitchenPct: 20 });
    const { cajaId } = await seedCajaWithTips(svc, 10.0);
    cajaIds.push(cajaId);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );
    const { data, error } = await (managerClient as any).rpc('close_caja_session', {
      p_caja_id: cajaId,
      p_closed_by: null,
      p_closing_cash: 0,
      p_notes: null,
    });
    expect(error).toBeNull();
    expect(data?.ok).toBe(true);

    const { data: entry } = await svc
      .from('tip_distribution_entries')
      .select('total_tips, floor_amount, bar_amount, kitchen_amount')
      .eq('caja_session_id', cajaId)
      .single();

    expect(Number(entry.total_tips)).toBe(10.0);
    expect(Number(entry.floor_amount)).toBe(5.0);
    expect(Number(entry.bar_amount)).toBe(3.0);
    expect(Number(entry.kitchen_amount)).toBe(2.0);
    expect(
      Number(entry.floor_amount) + Number(entry.bar_amount) + Number(entry.kitchen_amount),
    ).toBe(Number(entry.total_tips));
  });

  itAuth('Pitfall 4: missing tip_distribution config falls back to 34/33/33 without crashing the close', async () => {
    await setTipDistributionConfig(svc, null);
    const { cajaId } = await seedCajaWithTips(svc, 9.0);
    cajaIds.push(cajaId);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );
    const { data, error } = await (managerClient as any).rpc('close_caja_session', {
      p_caja_id: cajaId,
      p_closed_by: null,
      p_closing_cash: 0,
      p_notes: null,
    });
    expect(error).toBeNull();
    expect(data?.ok).toBe(true);

    const { data: entry } = await svc
      .from('tip_distribution_entries')
      .select('floor_pct, bar_pct, kitchen_pct, total_tips, floor_amount, bar_amount, kitchen_amount')
      .eq('caja_session_id', cajaId)
      .single();

    expect(Number(entry.floor_pct)).toBe(34);
    expect(Number(entry.bar_pct)).toBe(33);
    expect(Number(entry.kitchen_pct)).toBe(33);
    expect(
      Number(entry.floor_amount) + Number(entry.bar_amount) + Number(entry.kitchen_amount),
    ).toBe(Number(entry.total_tips));
  });

  itAuth('Pitfall 5: zero tips close cleanly with a 0/0/0 entry row', async () => {
    const { cajaId } = await seedCajaWithTips(svc, 0);
    cajaIds.push(cajaId);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );
    const { data, error } = await (managerClient as any).rpc('close_caja_session', {
      p_caja_id: cajaId,
      p_closed_by: null,
      p_closing_cash: 0,
      p_notes: null,
    });
    expect(error).toBeNull();
    expect(data?.ok).toBe(true);

    const { data: entry } = await svc
      .from('tip_distribution_entries')
      .select('total_tips, floor_amount, bar_amount, kitchen_amount')
      .eq('caja_session_id', cajaId)
      .single();

    expect(Number(entry.total_tips)).toBe(0);
    expect(Number(entry.floor_amount)).toBe(0);
    expect(Number(entry.bar_amount)).toBe(0);
    expect(Number(entry.kitchen_amount)).toBe(0);
  });

  itAuth('RLS append-only: manager can SELECT but INSERT/UPDATE/DELETE are denied', async () => {
    const { cajaId } = await seedCajaWithTips(svc, 4.0);
    cajaIds.push(cajaId);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );

    // Close via RPC to produce a real entry row. Must happen BEFORE seeding
    // the bare caja below — only one caja_session may be 'open' at a time.
    const { error: closeErr } = await (managerClient as any).rpc('close_caja_session', {
      p_caja_id: cajaId,
      p_closed_by: null,
      p_closing_cash: 0,
      p_notes: null,
    });
    expect(closeErr).toBeNull();

    // A distinct caja_session_id (satisfies the FK) with no entry row yet —
    // created AFTER the close above so it doesn't collide with the
    // one-open-caja index.
    const bareCajaId = await seedBareOpenCaja(svc);
    cajaIds.push(bareCajaId);

    // SELECT succeeds for manager+
    const { data: rows, error: selectErr } = await (managerClient as any)
      .from('tip_distribution_entries')
      .select('id')
      .eq('caja_session_id', cajaId);
    expect(selectErr).toBeNull();
    expect(rows?.length).toBe(1);
    const entryId = rows[0].id as string;

    // INSERT denied — no INSERT policy exists (append-only by omission).
    // Uses a distinct, un-closed caja_session_id so the FK/UNIQUE constraints
    // don't confound the RLS-denial assertion.
    const { error: insertErr } = await (managerClient as any).from('tip_distribution_entries').insert({
      caja_session_id: bareCajaId,
      floor_pct: 34,
      bar_pct: 33,
      kitchen_pct: 33,
      total_tips: 1,
      floor_amount: 1,
      bar_amount: 0,
      kitchen_amount: 0,
    });
    expect(insertErr).not.toBeNull();

    // UPDATE denied — no rows affected / policy error.
    const { data: updateData, error: updateErr } = await (managerClient as any)
      .from('tip_distribution_entries')
      .update({ total_tips: 999 })
      .eq('id', entryId)
      .select('id');
    expect((updateData ?? []).length === 0 || updateErr !== null).toBe(true);

    // DELETE denied — no rows affected / policy error.
    const { data: deleteData, error: deleteErr } = await (managerClient as any)
      .from('tip_distribution_entries')
      .delete()
      .eq('id', entryId)
      .select('id');
    expect((deleteData ?? []).length === 0 || deleteErr !== null).toBe(true);

    // Confirm the row is untouched via service role.
    const { data: unchanged } = await svc
      .from('tip_distribution_entries')
      .select('total_tips')
      .eq('id', entryId)
      .single();
    expect(Number(unchanged.total_tips)).toBe(4.0);
  });

  itBartender('RLS append-only: bartender cannot SELECT tip_distribution_entries (manager+ only)', async () => {
    const { cajaId } = await seedCajaWithTips(svc, 3.0);
    cajaIds.push(cajaId);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );
    const { error: closeErr } = await (managerClient as any).rpc('close_caja_session', {
      p_caja_id: cajaId,
      p_closed_by: null,
      p_closing_cash: 0,
      p_notes: null,
    });
    expect(closeErr).toBeNull();

    const bartenderClient = await getAuthClient(
      process.env['E2E_BARTENDER_NAME']!,
      process.env['E2E_BARTENDER_PIN']!,
    );
    const { data, error } = await (bartenderClient as any)
      .from('tip_distribution_entries')
      .select('id')
      .eq('caja_session_id', cajaId);

    // RLS silently filters (no error) or denies — either way, no rows visible.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});
