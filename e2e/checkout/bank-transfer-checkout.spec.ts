import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { assertStockMovement } from '../helpers/db-assertions';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getInventoryQty, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

test.describe('Bank-transfer checkout', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test('cashier completes a bank-transfer checkout end-to-end', async ({ page }) => {
    const quantityBefore = await getInventoryQty("Haldiram's Aloo Bhujia 200g");

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
    await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();

    await page.getByTestId('payment-btn-bank-transfer').click();
    await page.getByLabel(/customer name/i).fill('Ana Cliente');
    await page.getByTestId('bank-transfer-phone-input').fill('5512345678');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();

    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    const referenceCodeOnScreen = (
      await page.getByTestId('bank-transfer-reference-code').innerText()
    ).trim();
    expect(referenceCodeOnScreen).toMatch(/^\d{7}$/);

    await page.getByRole('button', { name: /done/i }).click();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
    await expect
      .poll(() => getInventoryQty("Haldiram's Aloo Bhujia 200g"))
      .toBe(quantityBefore - 1);

    const admin = getServiceClient();
    const { data: tabs, error: tabsError } = await admin
      .from('tabs')
      .select('id, status')
      .order('created_at', { ascending: false })
      .limit(1);
    if (tabsError || !tabs?.[0]) throw new Error(tabsError?.message ?? 'Tab not found');
    expect(tabs[0].status).toBe('paid');

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('id, method, reference_number')
      .eq('tab_id', tabs[0].id)
      .eq('is_deleted', false);
    if (paymentsError || !payments) throw new Error(paymentsError?.message ?? 'Payments not found');
    expect(payments).toHaveLength(1);
    const payment = payments[0];
    if (!payment) throw new Error('Payment row missing');
    expect(payment.method).toBe('bank_transfer');
    expect(payment.reference_number).toMatch(/^\d{7}$/);
    expect(payment.reference_number).toBe(referenceCodeOnScreen);

    const { data: transfer, error: transferError } = await admin
      .from('bank_transfers')
      .select('status, customer_phone')
      .eq('payment_id', payment.id)
      .maybeSingle();
    if (transferError || !transfer) throw new Error(transferError?.message ?? 'Transfer not found');
    expect(transfer.status).toBe('pending');
    expect(transfer.customer_phone).toBe('5512345678');

    const { data: productWithId, error: productIdError } = await admin
      .from('products')
      .select('id')
      .eq('name', "Haldiram's Aloo Bhujia 200g")
      .single();
    if (productIdError || !productWithId) {
      throw new Error(productIdError?.message ?? 'Product not found');
    }
    await assertStockMovement(productWithId.id, -1, 'sale');
  });
});
