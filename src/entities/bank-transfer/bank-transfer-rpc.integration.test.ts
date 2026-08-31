/* eslint-disable */
/**
 * Integration tests: bank-transfer RPCs (Phase 23, Plan 01)
 *
 * Requires: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars
 * Auth tests also require: VITE_SUPABASE_ANON_KEY + E2E_MANAGER_NAME + E2E_MANAGER_PIN
 * RBAC-denial test also requires: E2E_BARTENDER_NAME + E2E_BARTENDER_PIN (legacy env-var
 * naming this codebase's integration tests already use — role itself is 'cashier').
 * Run: npx vitest run src/entities/bank-transfer/bank-transfer-rpc.integration.test.ts
 *
 * process_payment_atomic trusts p_staff_id directly (never calls auth.uid()), so Test 1
 * runs on the service-role client. confirm_transfer_payment/dispute_transfer_payment DO
 * call auth.uid() (mirrors process_refund), so Tests 2-6 need an authenticated JWT.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// ── Env guards ────────────────────────────────────────────────────────────────

const hasEnv =
  typeof process.env['VITE_SUPABASE_URL'] === 'string' &&
  process.env['VITE_SUPABASE_URL'] !== '' &&
  typeof process.env['SUPABASE_SERVICE_ROLE_KEY'] === 'string' &&
  process.env['SUPABASE_SERVICE_ROLE_KEY'] !== '';

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

const itPlain = hasEnv ? it : it.skip;
const itAuth = hasAuthEnv ? it : it.skip;
const itBartender = hasBartenderEnv ? it : it.skip;

// ── Client factories ──────────────────────────────────────────────────────────

function getServiceDb(): any {
  const url = process.env['VITE_SUPABASE_URL']!;
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
    password: pin,
  });
  if (authErr || !authData.session) {
    throw new Error(`getAuthClient: sign-in failed for "${name}": ${authErr?.message ?? 'no session'}`);
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
  });
}

// ── Luhn helpers (self-contained mirror of .planning/spikes/003-reference-code-design,
//    kept local to avoid importing across the src/ FSD boundary from .planning/) ────────

function luhnCheckDigit(payloadDigits: string): number {
  let sum = 0;
  const digits = payloadDigits.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

function isValidLuhnCode(code: string): boolean {
  if (!/^\d{7}$/.test(code)) return false;
  const payload = code.slice(0, 6);
  const check = Number(code[6]);
  return luhnCheckDigit(payload) === check;
}

/** A fresh Luhn-valid 7-digit code guaranteed to differ from `exclude`. */
function generateOtherValidCode(exclude: string): string {
  for (let attempts = 0; attempts < 1000; attempts++) {
    let payload = '';
    for (let i = 0; i < 6; i++) payload += Math.floor(Math.random() * 10);
    const code = payload + String(luhnCheckDigit(payload));
    if (code !== exclude) return code;
  }
  throw new Error('generateOtherValidCode: could not find a distinct code');
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function getStaffAndShift(svc: any): Promise<{ staffId: string; shiftId: string }> {
  const { data: staff } = await svc
    .from('profiles')
    .select('id')
    .in('role', ['manager', 'admin'])
    .limit(1)
    .single();
  if (!staff) throw new Error('getStaffAndShift: no manager/admin profile found');
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
  if (shiftErr || !newShift) throw new Error(`getStaffAndShift: shift create failed: ${shiftErr?.message ?? 'no row'}`);
  return { staffId, shiftId: newShift.id as string };
}

interface OpenTabSeed {
  tabId: string;
  staffId: string;
}

/** Seeds an OPEN tab + order + a single order_item summing to `amount`. */
async function seedOpenTabForTransfer(svc: any, amount: number): Promise<OpenTabSeed> {
  const { staffId, shiftId } = await getStaffAndShift(svc);

  const { data: product } = await svc
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (!product) throw new Error('seedOpenTabForTransfer: no active product found');

  const { data: tab, error: tabErr } = await svc
    .from('tabs')
    .insert({
      customer_name: `Bank Transfer Integration Tab ${Date.now()}`,
      staff_id: staffId,
      shift_id: shiftId,
      status: 'open',
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedOpenTabForTransfer: tab insert failed: ${tabErr?.message ?? 'no row'}`);

  const { data: order, error: orderErr } = await svc
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: staffId, status: 'served' })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(`seedOpenTabForTransfer: order insert failed: ${orderErr?.message ?? 'no row'}`);

  const { error: itemErr } = await svc.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: amount,
    modifier_price_delta: 0,
  });
  if (itemErr) throw new Error(`seedOpenTabForTransfer: item insert failed: ${itemErr.message}`);

  return { tabId: tab.id as string, staffId };
}

/** Marks the seeded open tab as a pending bank-transfer sale, returns the payment + code. */
async function markPendingTransfer(
  svc: any,
  tabId: string,
  staffId: string,
  amount: number,
  customerPhone: string | null,
): Promise<{ paymentId: string; referenceCode: string }> {
  const idKey = `bank-transfer-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const { data, error } = await svc.rpc('process_payment_atomic', {
    p_tab_id: tabId,
    p_staff_id: staffId,
    p_amount: amount,
    p_method: 'bank_transfer',
    p_idempotency_key: idKey,
    p_customer_phone: customerPhone,
  });
  if (error || !data?.ok) {
    throw new Error(`markPendingTransfer: process_payment_atomic failed: ${error?.message ?? JSON.stringify(data)}`);
  }
  const paymentId = data.paymentId as string;
  const { data: payment, error: payErr } = await svc
    .from('payments')
    .select('reference_number')
    .eq('id', paymentId)
    .single();
  if (payErr || !payment?.reference_number) {
    throw new Error(`markPendingTransfer: could not read reference_number: ${payErr?.message ?? 'missing'}`);
  }
  return { paymentId, referenceCode: payment.reference_number as string };
}

/** Cleanup: bank_transfers row (FK RESTRICT) must go before its payment row. */
async function cleanup(svc: any, tabId: string): Promise<void> {
  const { data: payments } = await svc.from('payments').select('id').eq('tab_id', tabId);
  for (const p of (payments ?? []) as { id: string }[]) {
    await svc.from('bank_transfers').delete().eq('payment_id', p.id);
  }
  await svc.from('payments').delete().eq('tab_id', tabId);
  await svc.from('tabs').delete().eq('id', tabId);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('bank-transfer RPCs (integration)', () => {
  let tabId: string;

  beforeEach(() => {
    tabId = '';
  });

  afterEach(async () => {
    if (tabId) {
      const svc = getServiceDb();
      await cleanup(svc, tabId).catch(() => undefined);
    }
  });

  itPlain(
    'process_payment_atomic(bank_transfer): generates a unique 7-digit Luhn code, creates a pending bank_transfers row, closes the tab',
    async () => {
      const svc = getServiceDb();
      const seed = await seedOpenTabForTransfer(svc, 450.0);
      tabId = seed.tabId;

      const { paymentId, referenceCode } = await markPendingTransfer(
        svc,
        seed.tabId,
        seed.staffId,
        450.0,
        '+52 55 1234 5678',
      );

      expect(referenceCode).toMatch(/^\d{7}$/);
      expect(isValidLuhnCode(referenceCode)).toBe(true);

      const { data: transfer } = await svc
        .from('bank_transfers')
        .select('status, customer_phone')
        .eq('payment_id', paymentId)
        .single();
      expect(transfer?.status).toBe('pending');
      expect(transfer?.customer_phone).toBe('+52 55 1234 5678');

      const { data: tab } = await svc.from('tabs').select('status').eq('id', seed.tabId).single();
      expect(tab?.status).toBe('paid');
    },
  );

  itAuth('confirm_transfer_payment: manager entering the real code confirms the transfer', async () => {
    const svc = getServiceDb();
    const seed = await seedOpenTabForTransfer(svc, 200.0);
    tabId = seed.tabId;
    const { paymentId, referenceCode } = await markPendingTransfer(svc, seed.tabId, seed.staffId, 200.0, null);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );

    const { data, error } = await (managerClient as any).rpc('confirm_transfer_payment', {
      p_payment_id: paymentId,
      p_entered_code: referenceCode,
    });

    expect(error).toBeNull();
    expect(data?.ok).toBe(true);

    const { data: transfer } = await svc
      .from('bank_transfers')
      .select('status, confirmed_by')
      .eq('payment_id', paymentId)
      .single();
    expect(transfer?.status).toBe('confirmed');
    expect(transfer?.confirmed_by).toBeTruthy();
  });

  itAuth('confirm_transfer_payment: Luhn-invalid code is rejected before ever comparing to the real code', async () => {
    const svc = getServiceDb();
    const seed = await seedOpenTabForTransfer(svc, 150.0);
    tabId = seed.tabId;
    const { paymentId, referenceCode } = await markPendingTransfer(svc, seed.tabId, seed.staffId, 150.0, null);

    // Flip the check digit's parity so it no longer matches its own payload.
    const mistyped = referenceCode.slice(0, 6) + String((Number(referenceCode[6]) + 1) % 10);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );
    const { error } = await (managerClient as any).rpc('confirm_transfer_payment', {
      p_payment_id: paymentId,
      p_entered_code: mistyped,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('VALIDATION_ERROR');

    const { data: transfer } = await svc.from('bank_transfers').select('status').eq('payment_id', paymentId).single();
    expect(transfer?.status).toBe('pending');
  });

  itAuth('confirm_transfer_payment: Luhn-valid but wrong code is rejected', async () => {
    const svc = getServiceDb();
    const seed = await seedOpenTabForTransfer(svc, 175.0);
    tabId = seed.tabId;
    const { paymentId, referenceCode } = await markPendingTransfer(svc, seed.tabId, seed.staffId, 175.0, null);

    const wrongButValid = generateOtherValidCode(referenceCode);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );
    const { error } = await (managerClient as any).rpc('confirm_transfer_payment', {
      p_payment_id: paymentId,
      p_entered_code: wrongButValid,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('VALIDATION_ERROR');

    const { data: transfer } = await svc.from('bank_transfers').select('status').eq('payment_id', paymentId).single();
    expect(transfer?.status).toBe('pending');
  });

  itBartender(
    'confirm_transfer_payment / dispute_transfer_payment: AUTH_FORBIDDEN blocks a cashier-role account',
    async () => {
      const svc = getServiceDb();
      const seed = await seedOpenTabForTransfer(svc, 90.0);
      tabId = seed.tabId;
      const { paymentId, referenceCode } = await markPendingTransfer(svc, seed.tabId, seed.staffId, 90.0, null);

      const cashierClient = await getAuthClient(
        process.env['E2E_BARTENDER_NAME']!,
        process.env['E2E_BARTENDER_PIN']!,
      );

      const { error: confirmErr } = await (cashierClient as any).rpc('confirm_transfer_payment', {
        p_payment_id: paymentId,
        p_entered_code: referenceCode,
      });
      expect(confirmErr).not.toBeNull();
      expect(confirmErr!.message).toContain('AUTH_FORBIDDEN');

      const { error: disputeErr } = await (cashierClient as any).rpc('dispute_transfer_payment', {
        p_payment_id: paymentId,
        p_reason: 'no matching transfer found',
      });
      expect(disputeErr).not.toBeNull();
      expect(disputeErr!.message).toContain('AUTH_FORBIDDEN');
    },
  );

  itAuth('dispute_transfer_payment: requires a non-empty reason', async () => {
    const svc = getServiceDb();
    const seed = await seedOpenTabForTransfer(svc, 60.0);
    tabId = seed.tabId;
    const { paymentId } = await markPendingTransfer(svc, seed.tabId, seed.staffId, 60.0, null);

    const managerClient = await getAuthClient(
      process.env['E2E_MANAGER_NAME']!,
      process.env['E2E_MANAGER_PIN']!,
    );

    const { error: emptyErr } = await (managerClient as any).rpc('dispute_transfer_payment', {
      p_payment_id: paymentId,
      p_reason: '',
    });
    expect(emptyErr).not.toBeNull();
    expect(emptyErr!.message).toContain('VALIDATION_ERROR');

    const { data, error } = await (managerClient as any).rpc('dispute_transfer_payment', {
      p_payment_id: paymentId,
      p_reason: 'no matching transfer found by end of day',
    });
    expect(error).toBeNull();
    expect(data?.ok).toBe(true);

    const { data: transfer } = await svc
      .from('bank_transfers')
      .select('status, dispute_reason, disputed_by')
      .eq('payment_id', paymentId)
      .single();
    expect(transfer?.status).toBe('disputed');
    expect(transfer?.dispute_reason).toBe('no matching transfer found by end of day');
    expect(transfer?.disputed_by).toBeTruthy();
  });
});
