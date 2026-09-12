/**
 * Settings → License → "Check for updates" (manual updater check).
 *
 * Playwright runs against the Vite dev server, not the Tauri shell, so
 * `@tauri-apps/plugin-updater`'s check() has no IPC bridge and rejects. The
 * button must surface that as a toast (not silently, unlike the background
 * poll) and must never open the install dialog. A found-update path is
 * covered by the unit tests (useAppUpdater.test.ts) — it needs a real Tauri
 * updater endpoint.
 */
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';

test.describe('Settings — check for updates', () => {
  test.beforeEach(() => {
    requireIntegrationEnv();
  });

  test('admin can trigger a manual check and gets an outcome toast', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: /^(Licencia|License)$/ }).click();

    const button = page.getByTestId('check-updates-button');
    await expect(button).toBeVisible();
    await button.click();

    // Outside Tauri check() rejects → "could not check" toast; inside Tauri
    // with no release it would be the "latest version" toast. Either way an
    // outcome is reported and no install dialog appears.
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: /(Could not check for updates|latest version|No se pudieron buscar|versión más reciente)/ })
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="update-dialog-state"]')).toHaveCount(0);
    await expect(button).toBeEnabled();
  });
});
