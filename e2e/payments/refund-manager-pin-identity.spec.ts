/**
 * E2E spec: Phase 28 Plan 02 — folded todo
 * (.planning/todos/pending/audit-manager-pin-identity-in-remaining-rpcs.md)
 *
 * Proves the process_refund identity-re-key fix (mirrors G-27-13/T-28-04):
 * a cashier session that gets a REAL manager to type their own PIN into
 * ManagerPinDialog now succeeds — before this plan's migration, the RPC
 * re-checked the CALLER's own auth.uid() session role, so this exact
 * scenario failed with AUTH_FORBIDDEN despite the correct PIN being entered.
 *
 * Negative case: a PIN belonging to a non-eligible staff member (another
 * cashier) is rejected client-side by ManagerPinDialog's own eligibleStaff
 * filter (unchanged behavior) — the dialog shows an incorrect-PIN error and
 * the refund RPC never fires.
 *
 * Requires bar-pos/.env.local (or equivalent env) with E2E_*_PIN/NAME and
 * SUPABASE_SERVICE_ROLE_KEY.
 */
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  deleteTestStaff,
  getServiceClient,
  openCaja,
  resetTestState,
  seedNewStaffMember,
} from '../helpers/supabase';

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
  orderItemId: string;
}

async function seedPaidTab(
  db: ReturnType<typeof getServiceClient>,
  unitPrice: number
): Promise<SeededPaidTab> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  let shiftId: string;
  const { data: existingShift } = await db
    .from('shifts')
    .select('id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift } = await db
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    shiftId = newShift.id as string;
  }

  const { data: tab } = await db
    .from('tabs')
    .insert({
      customer_name: `E2E Refund Identity Test ${String(Date.now())}`,
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  const { data: order } = await db
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: profile.id, status: 'pending' })
    .select('id')
    .single();

  const { data: product } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  const { data: items } = await db
    .from('order_items')
    .insert({
      order_id: order.id,
      product_id: product.id,
      quantity: 1,
      unit_price: unitPrice,
      modifier_price_delta: 0,
    })
    .select('id');
  const orderItemId = (items as { id: string }[])[0]?.id as string;

  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPaidTab: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: unitPrice,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-seed-refund-identity-${(tab.id as string).slice(0, 8)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) {
    throw new Error(`seedPaidTab: payments insert failed: ${payErr?.message ?? 'no row'}`);
  }

  return { tabId: tab.id as string, paymentId: payment.id as string, orderItemId };
}

async function enterManagerPin(page: import('@playwright/test').Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    const btn = page.getByRole('button', { name: label });
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await btn.click();
    } else {
      await page.keyboard.type(ch);
    }
  }
}

test.beforeEach(async ({ page }) => {
  requireIntegrationEnv();
  await resetTestState();
  await openCaja(500);
  await page.goto('/');
});

test.afterEach(async ({ page }) => {
  await logout(page).catch(() => undefined);
});

test('cashier session + a genuine manager PIN succeeds on process_refund (folded todo, mirrors G-27-13)', async ({
  page,
}) => {
  test.setTimeout(90_000);

  const db = getServiceClient();
  const seeded = await seedPaidTab(db, 12.0);
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

  await loginAs(page, 'cashier');
  await gotoAuthed(page, '/payments');

  const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /refund|reembolso/i }).click();

  const refundDialog = page.getByRole('dialog', { name: /process refund|procesar reembolso/i });
  await expect(refundDialog).toBeVisible({ timeout: 10_000 });

  const checkbox = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i }).first();
  await expect(checkbox).toBeVisible({ timeout: 10_000 });
  await checkbox.check();

  const reasonTrigger = refundDialog.locator('#refund-reason');
  await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
  await reasonTrigger.click();
  await page.getByRole('option', { name: /wrong.*order/i }).click();

  await page.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });

  // The genuine manager's PIN — not the logged-in cashier's own identity.
  // Before Task 1's re-key fix, process_refund independently re-checked the
  // CALLER's own auth.uid() session role, so this exact flow failed with
  // AUTH_FORBIDDEN despite the correct PIN being entered.
  await enterManagerPin(page, managerPin);

  await expect(page.getByText(/refund.*processed|reembolso.*procesado/i)).toBeVisible({
    timeout: 15_000,
  });

  const { data: refund } = await db
    .from('refunds')
    .select('id, amount')
    .eq('original_payment_id', seeded.paymentId)
    .single();
  expect(refund).not.toBeNull();
  expect(Number((refund as { amount: number }).amount)).toBeCloseTo(12.0, 1);
});

test('a PIN belonging to a non-eligible staff member (another cashier) is rejected client-side — the refund never fires', async ({
  page,
}) => {
  test.setTimeout(60_000);

  const db = getServiceClient();
  const seeded = await seedPaidTab(db, 12.0);

  // profiles.pin has no UNIQUE constraint (documented in
  // 20260903090000_process_direct_sale_manager_pin_reverify.sql) — this
  // shared, long-lived local/dev DB accumulates fixtures across many test
  // runs and worktrees, so a fixed constant like E2E_BARTENDER_PIN risks
  // colliding with a stale manager/admin profile seeded by an unrelated
  // prior run. Seed a dedicated throwaway cashier with a freshly-generated
  // PIN and verify no manager/admin currently shares it before using it.
  const staffName = `E2E RefundIdentity Cashier ${String(Date.now())}`;
  let otherCashierPin = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = String(100000 + Math.floor(Math.random() * 900000));
    const { data: collision } = await db
      .from('profiles')
      .select('id')
      .eq('pin', candidate)
      .in('role', ['manager', 'admin'])
      .limit(1)
      .maybeSingle();
    if (!collision) {
      otherCashierPin = candidate;
      break;
    }
  }
  expect(otherCashierPin).not.toBe('');
  await seedNewStaffMember(staffName, otherCashierPin, 'cashier');

  try {
    await loginAs(page, 'cashier');
    await gotoAuthed(page, '/payments');

    const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /refund|reembolso/i }).click();

    const refundDialog = page.getByRole('dialog', { name: /process refund|procesar reembolso/i });
    await expect(refundDialog).toBeVisible({ timeout: 10_000 });

    const checkbox = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i }).first();
    await expect(checkbox).toBeVisible({ timeout: 10_000 });
    await checkbox.check();

    const reasonTrigger = refundDialog.locator('#refund-reason');
    await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
    await reasonTrigger.click();
    await page.getByRole('option', { name: /wrong.*order/i }).click();

    await page.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

    const pinDialog = page.getByRole('alertdialog');
    await expect(pinDialog).toBeVisible({ timeout: 8_000 });

    // A verified non-manager/admin PIN — ManagerPinDialog's eligibleStaff
    // filter (canAccess(role, 'process_refund')) excludes cashiers, so this
    // is rejected before the RPC is ever called.
    await enterManagerPin(page, otherCashierPin);

    await expect(pinDialog.getByText(/incorrect pin|pin incorrecto/i)).toBeVisible({ timeout: 8_000 });
    await expect(refundDialog).toBeVisible();
  } finally {
    await deleteTestStaff(staffName);
  }

  const { data: refund } = await db
    .from('refunds')
    .select('id')
    .eq('original_payment_id', seeded.paymentId)
    .maybeSingle();
  expect(refund).toBeNull();
});
