import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

test.describe('Settings Backup / Restore', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(540);
    await page.goto('/');
  });

  test('Create a manual backup then restore it end-to-end', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Backup' }).click();

    await page.getByRole('button', { name: 'Create Manual Backup' }).click();
    await expect(page.getByText('Backup created.')).toBeVisible({ timeout: 20_000 });

    const backupRow = page
      .locator('div.rounded-md.border')
      .filter({ hasText: 'Manual backup' })
      .first();
    await backupRow.getByRole('button', { name: 'Restore' }).click();
    await page.getByRole('button', { name: 'Restore backup' }).click();
    await expect(page.getByText('Backup restored.')).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });
});
