/**
 * E2E: Payment Edge Cases — /payments
 *
 * Tests exact-change calculation, insufficient cash validation,
 * tip field (optional), and discount field (optional).
 */

import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Shared helpers (mirrors 17-payment-pane.spec.ts)
// ---------------------------------------------------------------------------

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    await page.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
  }
}

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
  if (!mgr) throw new Error('ensureOpenShift: no manager found');

  const { data: shift, error } = await admin
    .from('shifts')
    .insert({ staff_id: mgr.id, clock_in: new Date().toISOString() })
    .select('id, staff_id')
    .single();
  if (error || !shift) throw new Error(`ensureOpenShift failed – ${error?.message}`);
  return shift as { id: string; staff_id: string };
}

async function seedTabWithProduct(customerName: string): Promise<string> {
  const admin = getServiceClient();
  const shift = await ensureOpenShift(admin);

  const { data: caja } = await admin
    .from('caja_sessions')
    .select('id')
    .eq('status', 'open')
    .maybeSingle();
  if (!caja) throw new Error('seedTabWithProduct: no open caja');

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
  if (tabErr || !tab) throw new Error(`tab insert failed – ${tabErr?.message}`);

  const { data: product } = await admin
    .from('products')
    .select('id, base_price')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .maybeSingle();
  if (product) {
    const { data: order } = await admin
      .from('orders')
      .insert({ tab_id: tab.id, staff_id: shift.staff_id, status: 'served' })
      .select('id')
      .single();
    if (order) {
      await admin.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        quantity: 1,
        unit_price: product.base_price,
        modifier_price_delta: 0,
      });
    }
  }
  return tab.id as string;
}

async function unlockPaymentForm(page: Page, customerName: string): Promise<void> {
  await page.goto('/payments');
  const list = page.getByTestId('tabs-waiting-for-payment');
  await expect(list).toBeVisible({ timeout: 20_000 });
  const tabCard = list.getByRole('button', { name: new RegExp(`tab ${customerName}`, 'i') });
  // Previously a boolean-returning probe that fed a `test.skip('Tab not
  // found in payments list')` escape hatch at every call site. That guard
  // never actually fired (seedTabWithProduct's shift/manager pairing always
  // matches useTabs()'s currentShift filter), so it was dead code masking a
  // real regression path — assert directly instead: if the tab genuinely
  // isn't there, this is a failure, not a skip.
  await expect(tabCard).toBeVisible({ timeout: 15_000 });
  await tabCard.click();
  await page.getByRole('button', { name: /verify pin to process payment/i }).click();
  const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
  await expect(pinDialog).toBeVisible({ timeout: 10_000 });
  const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
  await enterPin(page, managerPin);
  await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Payment Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test('PE1: enter exact cash = subtotal — change shows $0.00 or no change', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'manager');
    await seedTabWithProduct('PE1 Exact Cash');

    await unlockPaymentForm(page, 'PE1 Exact Cash');

    await page.getByTestId('payment-btn-cash').click();
    // Read subtotal from the form — find price display
    const subtotalText = await page
      .getByText(/\$\d+\.\d{2}/)
      .first()
      .textContent();
    const match = subtotalText?.match(/\$(\d+\.\d{2})/);
    const subtotal = match ? match[1] : '35.00';

    await page.getByLabel(/amount tendered/i).fill(subtotal ?? '35.00');
    // Change should show $0.00 or nothing
    const changeDue = page.getByText(/change due/i);
    const changeVisible = await changeDue.isVisible({ timeout: 5_000 }).catch(() => false);
    if (changeVisible) {
      await expect(page.getByText(/\$0\.00/)).toBeVisible({ timeout: 3_000 });
    }
    // No negative change shown
    await expect(page.getByText(/-\$\d/)).toHaveCount(0);
    await logout(page);
  });

  test('PE2: enter cash less than subtotal — validation error or submit blocked', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'manager');
    await seedTabWithProduct('PE2 Under Cash');

    await unlockPaymentForm(page, 'PE2 Under Cash');

    await page.getByTestId('payment-btn-cash').click();
    await page.getByLabel(/amount tendered/i).fill('1'); // clearly too low

    const processBtn = page.getByRole('button', { name: /process payment/i });
    const isDisabled = await processBtn.isDisabled().catch(() => false);

    if (!isDisabled) {
      await processBtn.click();
      // Should show validation error
      await expect(
        page.getByText(/insufficient|amount.*less|must.*at least|underpayment/i)
      ).toBeVisible({ timeout: 10_000 });
    } else {
      expect(isDisabled).toBe(true);
    }
    await logout(page);
  });

  test('PE3: tip field — enter $2 tip, receipt shows tip line', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'manager');
    await seedTabWithProduct('PE3 Tip Test');

    await unlockPaymentForm(page, 'PE3 Tip Test');

    await page.getByTestId('payment-btn-cash').click();
    // "Custom tip" (paymentForm.customTip) is the actual field label — a bare
    // /tip/i regex also matches the "Tip" summary-line MoneyDisplay elsewhere
    // in the form and the preset-percentage buttons' surrounding copy,
    // producing a strict-mode violation that `.catch(() => false)` silently
    // swallowed as "not visible", which is what made this test wrongly
    // believe tip UI wasn't implemented. It is — see PaymentForm.tsx's
    // customTip MoneyInput, rendered whenever method !== 'rappi'.
    const tipInput = page.getByLabel(/custom tip/i);
    await expect(tipInput).toBeVisible({ timeout: 10_000 });

    await tipInput.fill('2');
    await page.getByLabel(/amount tendered/i).fill('500');
    await page.getByRole('button', { name: /process payment/i }).click();

    await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });
    // A bare /tip/i also matches "PE3 Tip Test" in the tab-name heading above
    // the receipt (strict-mode violation) — scope to the receipt's own <pre>
    // block and assert the actual tip line with its $2.00 amount.
    const receiptText = page.locator('pre');
    await expect(receiptText).toContainText(/tip\s+\$2\.00/i, { timeout: 5_000 });
    await page.getByRole('button', { name: 'Done' }).click();
    await logout(page);
  });

  test('PE4: discount field — apply 10% discount', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'manager');
    await seedTabWithProduct('PE4 Discount');

    await unlockPaymentForm(page, 'PE4 Discount');

    // Discount is progressively disclosed — the toggle itself is always
    // rendered by PaymentForm.tsx (not conditionally mounted), so asserting
    // it's visible replaces what used to be a `test.skip('tip/discount UI
    // not implemented')` escape hatch — that reason was stale even before
    // this dispatch (the toggle has always been present); a genuine
    // regression here should fail the test, not silently skip it.
    const discountToggle = page.getByRole('switch', { name: 'Discount' });
    await expect(discountToggle).toBeVisible({ timeout: 10_000 });
    // Discount is progressively disclosed — expand it first
    await discountToggle.click();
    const discountInput = page.getByLabel(/discount %|discount amount/i);

    await discountInput.fill('10');
    await expect(page.getByTestId('discount-applied-label')).toBeVisible();
    await expect(page.getByTestId('discount-row')).toBeVisible();
    await logout(page);
  });
});
