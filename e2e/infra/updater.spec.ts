/**
 * E2E Smoke: Updater plugin integration
 *
 * Verifies the app loads without panic/crash when tauri-plugin-updater is
 * registered. In test environment check() returns null (no update available)
 * so no dialog appears — the test confirms zero console errors and normal
 * app boot.
 *
 * UPD-01: startup check runs silently (no dialog shown = correct behavior when no update)
 * UPD-07: no error toast / crash on null return from check()
 */

import { expect, test } from '../fixtures';

import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';

test.describe('Updater — smoke', () => {
  test.beforeEach(() => {
    requireIntegrationEnv();
  });

  test('app boots without console errors when updater plugin is registered', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await loginAs(page, 'admin');
    await page.goto('/home');
    // HomePage (src/pages/home/index.tsx) has no `data-testid`, `<h1>`, or
    // `<main>` — its shell is `<div>`/`<header>` around `HomeDashboard`.
    // 'Checkout' (wPanels.json's `pos` key) is one of HomeDashboard's
    // always-present nav tiles — 'POS Register' (`posRegister`) is an
    // orphaned i18n key with no component reference.
    await expect(page.getByRole('button', { name: 'Checkout' })).toBeVisible({
      timeout: 10_000,
    });

    // No update dialog should be visible (no update available in test env)
    const dialog = page.locator('[data-testid="update-dialog-state"]');
    const dialogVisible = await dialog.isVisible().catch(() => false);
    expect(dialogVisible).toBe(false);

    // Zero console errors (per project memory NON-NEGOTIABLE requirement)
    const relevantErrors = consoleErrors.filter(
      (e) =>
        !e.includes('ResizeObserver loop') && // known benign browser warning
        !e.includes('Non-Error promise rejection'), // Playwright internal
    );
    expect(relevantErrors).toHaveLength(0);
  });

  test('update dialog does not render on startup when no update is available (UPD-07)', async ({
    page,
  }) => {
    await loginAs(page, 'admin');
    await page.goto('/home');

    // Wait for app to fully load
    await page.waitForTimeout(1000);

    // UpdateAvailableDialog renders as AlertDialog only when open=true
    // open=true only when state.phase !== 'idle'
    // In test env: check() returns null → state stays idle → no dialog
    const dialog = page.locator('[role="alertdialog"]').filter({
      hasText: 'Update Available',
    });
    await expect(dialog).not.toBeVisible();
  });
});
