import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { openCaja, resetTestState } from '../helpers/supabase';
import { requireIntegrationEnv } from '../helpers/requireEnv';

test.describe('Core payments', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test('cash tendered above the total shows a non-negative change due', async ({ page }) => {
    await page.getByRole('button', { name: /checkout/i }).click();
    await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
    await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');

    await expect(page.getByText(/change due/i)).toBeVisible();
    await expect(page.getByText(/-\s*\$/)).toHaveCount(0);
  });
});
