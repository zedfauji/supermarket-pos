/**
 * E2E: Discount UI (PaymentModal, reached via /payments)
 *
 * Tests the discount UI in PaymentForm without completing a payment.
 * Verifies: discount section visibility, Fixed-type discount-applied-label,
 * and percent-type discount-applied-label + discount-row with a negative sign.
 *
 * The old D2 (billiards-scoped discount toggle) and D5 (marketing banner on
 * the deleted checkout page) cases are genuinely dead bar-pos concepts (per
 * D-08) and are not carried forward — this file only covers D1/D3/D4,
 * rewritten to reach PaymentForm through the current /payments → PaymentPane
 * flow (the old direct-sale New-Ticket flow was deleted in Phase 1).
 *
 * Requires local Supabase + .env.local integration keys.
 */

import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve (or create) an open shift, mirroring e2e/payments/payment-pane.spec.ts's helper. */
async function ensureOpenShift(
  admin: ReturnType<typeof getServiceClient>
): Promise<{ id: string; staff_id: string }> {
  const { data: existing } = await admin
    .from('shifts')
    .select('id, staff_id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existing) return existing as { id: string; staff_id: string };

  const { data: mgr } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'manager')
    .limit(1)
    .maybeSingle();
  if (!mgr) throw new Error('ensureOpenShift: no manager profile found');

  const { data: shift, error } = await admin
    .from('shifts')
    .insert({ staff_id: mgr.id, clock_in: new Date().toISOString() })
    .select('id, staff_id')
    .single();
  if (error || !shift)
    throw new Error(`ensureOpenShift: failed to create shift — ${error?.message ?? 'no row'}`);
  return shift as { id: string; staff_id: string };
}

/**
 * Seed an open tab with one Indian-catalog item directly via the service-role
 * client (bypasses the deleted /pos New-Tab UI) — mirrors
 * e2e/payments/payment-pane.spec.ts's local seedOpenTab helper. Returns the
 * tab's customer_name so the test can find it in the "tabs awaiting payment"
 * left panel on /payments.
 */
async function seedOpenTabWithItem(customerName: string): Promise<void> {
  const admin = getServiceClient();
  const shift = await ensureOpenShift(admin);

  const { data: caja } = await admin
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();
  if (!caja) throw new Error('seedOpenTabWithItem: no open caja session — run openCaja first');

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: customerName,
      staff_id: shift.staff_id,
      shift_id: shift.id,
      caja_session_id: caja.id,
      status: 'open',
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedOpenTabWithItem: tab insert failed - ${tabErr?.message ?? 'no row'}`);

  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id, base_price')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .maybeSingle();
  if (pErr || !product) {
    throw new Error(`seedOpenTabWithItem: fixture product not found - ${pErr?.message ?? 'no row'}`);
  }

  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: shift.staff_id, status: 'served' })
    .select('id')
    .single();
  if (orderErr || !order) throw new Error(`seedOpenTabWithItem: order insert failed - ${orderErr?.message ?? 'no row'}`);

  const { error: itemErr } = await admin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: product.base_price,
    modifier_price_delta: 0,
  });
  if (itemErr) throw new Error(`seedOpenTabWithItem: order_item insert failed - ${itemErr.message}`);
}

/**
 * Seeds a tab, navigates to /payments, selects it, passes the manager-PIN
 * gate, and leaves PaymentForm mounted inline (not a dialog — PaymentPane
 * renders it directly, unlike the deleted /pos ProcessPayment modal).
 */
async function openPaymentFormWithItem(page: Page, customerName: string): Promise<void> {
  await seedOpenTabWithItem(customerName);

  await page.goto('/payments');
  const list = page.getByTestId('tabs-waiting-for-payment');
  await expect(list.getByText(customerName)).toBeVisible({ timeout: 20_000 });
  await list.getByRole('button', { name: new RegExp(`tab ${customerName}`, 'i') }).click();
  await page.getByRole('button', { name: /verify pin to process payment/i }).click();

  const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
  for (const ch of managerPin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    await page.getByRole('button', { name: label }).click();
  }
  await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

  await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });
}

/**
 * Phase 27 (PROMO-05/D-07): expanding the ad-hoc discount section now opens
 * a manager-PIN gate first (the "Discount" switch stays visually off until
 * a correct PIN is entered) — clicks the switch, clears the PIN dialog, and
 * leaves the discount fields expanded and ready for input.
 */
async function expandDiscountSection(page: Page): Promise<void> {
  await page.getByRole('switch', { name: 'Discount' }).click();
  const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
  for (const ch of managerPin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    await pinDialog.getByRole('button', { name: label }).click();
  }
  await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Discount UI (PaymentForm via /payments)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test('D1: discount section visible on cash tab in PaymentForm', async ({ page }) => {
    await loginAs(page, 'manager');
    await openPaymentFormWithItem(page, 'Discount D1');

    await expect(page.getByTestId('discount-section')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Cancel' }).click();
    await logout(page);
  });

  test('D3: switching to Fixed type and entering $5 shows discount-applied-label', async ({ page }) => {
    await loginAs(page, 'manager');
    await openPaymentFormWithItem(page, 'Discount D3');

    await expandDiscountSection(page);
    await page.getByTestId('discount-type-fixed').click();

    const discountInput = page.getByLabel('Discount amount');
    await expect(discountInput).toBeVisible({ timeout: 5_000 });
    await discountInput.fill('5');

    const appliedLabel = page.getByTestId('discount-applied-label');
    await expect(appliedLabel).toBeVisible({ timeout: 5_000 });
    await expect(appliedLabel).toHaveText(/5\.00/);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await logout(page);
  });

  test('D4: 10% percent discount shows applied label and discount-row with negative sign', async ({ page }) => {
    await loginAs(page, 'manager');
    await openPaymentFormWithItem(page, 'Discount D4');

    await expandDiscountSection(page);

    // Default type is percent — fill discount value
    const discountInput = page.getByLabel('Discount %');
    await expect(discountInput).toBeVisible({ timeout: 5_000 });
    await discountInput.fill('10');

    await expect(page.getByTestId('discount-applied-label')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('discount-row')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('discount-row')).toContainText('-');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await logout(page);
  });
});
