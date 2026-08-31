/**
 * E2E spec: Phase 21 — Idle Screen Lock, LockSettingsTab (LCK-02, D-02, D-03)
 * Plan: 21-01
 *
 * Admin can open Settings -> Auto-Lock Timeout, change and save the
 * per-terminal timeout, and the change persists after a reload. Manager
 * (not just cashier) cannot see the tab at all -- manage_settings is
 * admin-only in this codebase's RBAC (D-02's deviation from every other
 * Settings tab, which is manager+admin).
 *
 * Resets terminal_lock_settings back to the documented 60s default in
 * afterEach -- this table is real (not test-isolated like idle-lock.spec.ts's
 * short seeded timeout), and every other E2E spec in the suite runs against
 * this same shared local terminal_id row, so leaving a short timeout behind
 * could idle-lock an unrelated later spec mid-test.
 */
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

const TERMINAL_ID = process.env.VITE_TERMINAL_ID ?? 'POS-1';
const DEFAULT_LOCK_TIMEOUT_SECONDS = 60;

async function resetLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: DEFAULT_LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
}

test.describe('Lock Timeout Settings', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await resetLockTimeout();
  });

  test.afterEach(async () => {
    await resetLockTimeout();
  });

  test('admin configures and persists the auto-lock timeout; manager cannot see the tab (D-02)', async ({
    page,
  }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: /auto-lock timeout|bloqueo automático de pantalla/i }).click();

    const threshold = page.locator('#lock-timeout-threshold');
    await expect(threshold).toBeVisible({ timeout: 20_000 });

    const saveRequest = page.waitForResponse(resp => resp.url().includes('/rest/v1/terminal_lock_settings'));
    await threshold.fill('120');
    await page.getByRole('button', { name: /save timeout|guardar tiempo de bloqueo/i }).click();
    await saveRequest;

    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: /auto-lock timeout|bloqueo automático de pantalla/i }).click();
    await expect(page.locator('#lock-timeout-threshold')).toHaveValue('120', { timeout: 20_000 });

    await logout(page);

    // D-02: manage_settings is admin-only -- manager (not just cashier) must
    // NOT see this tab, unlike every other manage_settings-gated tab which is
    // manager+admin.
    await loginAs(page, 'manager');
    await page.goto('/settings');
    await expect(
      page.getByRole('tab', { name: /auto-lock timeout|bloqueo automático de pantalla/i })
    ).toHaveCount(0);
    await logout(page);
  });
});
