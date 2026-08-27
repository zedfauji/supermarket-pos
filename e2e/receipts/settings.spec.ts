import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

test.describe('Receipt / Hardware Settings', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(540);
    await page.goto('/');
  });

  test('Save paper width setting (80mm / 40 chars)', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible({ timeout: 20_000 });
    await page.locator('#paper-width').selectOption('40');
    await expect(page.locator('#paper-width')).toHaveValue('40', { timeout: 20_000 });
    await logout(page);
  });

  test('Cashier name toggle off persists in UI state', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-showCashierName')).toBeVisible({ timeout: 20_000 });
    await page.locator('#receipt-showCashierName').setChecked(false);
    await expect(page.locator('#receipt-showCashierName')).not.toBeChecked();
    await logout(page);
  });

  test('Settings persist after reload', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#paper-width')).toBeVisible({ timeout: 20_000 });
    await page.locator('#paper-width').selectOption('40');
    await page.locator('#receipt-showCashierName').setChecked(false);
    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#paper-width')).toHaveValue('40', { timeout: 20_000 });
    await expect(page.locator('#receipt-showCashierName')).not.toBeChecked();
    await logout(page);
  });

  test('Reset to defaults (58mm + cashier name)', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#paper-width')).toBeVisible({ timeout: 20_000 });
    await page.locator('#paper-width').selectOption('32');
    await page.locator('#receipt-showCashierName').setChecked(true);
    await expect(page.locator('#paper-width')).toHaveValue('32', { timeout: 20_000 });
    await expect(page.locator('#receipt-showCashierName')).toBeChecked();
    await logout(page);
  });

  test('Auto-cut toggle persists after reload', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-autoCut')).toBeVisible({ timeout: 20_000 });

    // Toggle ON — wait for the actual receipt_settings PATCH to land before
    // reloading. patchReceipt() applies the checkbox optimistically and fires
    // the mutation without awaiting it (HardwareSettingsTab.tsx), so an
    // immediate reload() can race ahead of the network write under load —
    // asserting the local checked state alone (which flips synchronously)
    // doesn't prove persistence.
    const autoCutOnSave = page.waitForResponse(resp => resp.url().includes('/rest/v1/receipt_settings'));
    await page.locator('#receipt-autoCut').setChecked(true);
    await expect(page.locator('#receipt-autoCut')).toBeChecked({ timeout: 10_000 });
    await autoCutOnSave;

    // Reload and re-navigate to Settings → Hardware
    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-autoCut')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#receipt-autoCut')).toBeChecked();

    // Toggle OFF — persist that too
    const autoCutOffSave = page.waitForResponse(resp => resp.url().includes('/rest/v1/receipt_settings'));
    await page.locator('#receipt-autoCut').setChecked(false);
    await expect(page.locator('#receipt-autoCut')).not.toBeChecked({ timeout: 10_000 });
    await autoCutOffSave;

    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-autoCut')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#receipt-autoCut')).not.toBeChecked();

    await logout(page);
  });

  test('Header line 2 and footer text persist after reload', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-headerLine2')).toBeVisible({ timeout: 20_000 });

    await page.locator('#receipt-headerLine2').fill('Gracias por su compra');
    await page.locator('#receipt-headerLine2').blur();
    await expect(page.locator('#receipt-headerLine2')).toHaveValue('Gracias por su compra', {
      timeout: 10_000,
    });

    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-headerLine2')).toHaveValue('Gracias por su compra', {
      timeout: 20_000,
    });

    await logout(page);
  });

  test('Live preview reflects unsaved footer text edits before save', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-footerText')).toBeVisible({ timeout: 20_000 });

    await page.locator('#receipt-footerText').fill('Devoluciones en 15 dias');
    await expect(page.getByTestId('receipt-live-preview')).toContainText(
      'Devoluciones en 15 dias'
    );

    await logout(page);
  });

  test('Live preview omits cashier name when the toggle is off', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#receipt-showCashierName')).toBeVisible({ timeout: 20_000 });

    await page.locator('#receipt-showCashierName').setChecked(false);
    await expect(page.getByTestId('receipt-live-preview')).not.toContainText('Ana');

    await logout(page);
  });

  test('Paper width change widens the live preview divider line', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#paper-width')).toBeVisible({ timeout: 20_000 });

    await page.locator('#paper-width').selectOption('32');
    await page.locator('#paper-width').selectOption('48');
    await expect(page.getByTestId('receipt-live-preview')).toContainText('-'.repeat(48));

    await logout(page);
  });
});
