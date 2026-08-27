import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { resetTestState } from '../helpers/supabase';

test.describe('Near-expiry settings', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('admin saves the threshold and it persists after reload', async ({ page }) => {
    await loginAs(page, 'admin');
    await gotoAuthed(page, '/settings');
    await page.getByRole('tab', { name: /near expiry|próxima caducidad/i }).click();
    const threshold = page.locator('#near-expiry-threshold');
    const savedValue = await threshold.inputValue();
    const updatedValue = savedValue === '22' ? '21' : '22';
    await threshold.fill(updatedValue);
    await page.getByRole('button', { name: /save alert window|guardar ventana/i }).click();
    await page.reload();
    await page.getByRole('tab', { name: /near expiry|próxima caducidad/i }).click();
    await expect(threshold).toHaveValue(updatedValue);
  });
});
