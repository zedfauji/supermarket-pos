/**
 * E2E tests for Phase 19 Plan 01 — durable test_print tracer (PRN-01/02/03, D-12).
 *
 * Test 4: invoke('test_print') mocked to resolve {job_id, status:'accepted'} —
 * clicking "Test Print" on /settings' Hardware tab shows the existing success
 * toast and does not throw.
 * Test 8: invoke('test_print') mocked to reject with a "broker unreachable"
 * error — HardwareSettingsTab shows a toast.error. The exact AppErrorCode
 * mapping ('PRINT_BROKER_UNREACHABLE') is unit-tested directly in
 * pos-printer.test.ts; this spec proves the UI-visible consequence.
 *
 * Mirrors print-retry-resilience.spec.ts's dual-global Tauri IPC mock
 * (`window.__TAURI__` + `window.__TAURI_INTERNALS__.invoke`) — the broker
 * HTTP call happens Rust-side via reqwest inside the Tauri command, not as a
 * browser fetch(), so page.route() cannot intercept it; only the
 * invoke('test_print') boundary is interceptable from Playwright.
 */

import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

type TestPrintMockMode = 'success' | 'broker_unreachable';

async function injectTestPrintMock(page: Page, mode: TestPrintMockMode): Promise<void> {
  await page.addInitScript(m => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};

    const callbacks = new Map<number, (arg: unknown) => void>();

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string): Promise<unknown> {
        if (cmd === 'test_print') {
          if (m === 'success') {
            return Promise.resolve({ job_id: 'mock-job-1', status: 'accepted' });
          }
          return Promise.reject(new Error('broker unreachable: connection refused (mock)'));
        }
        return Promise.resolve(null);
      },
      transformCallback(callback: (arg: unknown) => void, _once: boolean): number {
        const id = Math.floor(Math.random() * 1_000_000);
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number): void {
        callbacks.delete(id);
      },
    };
  }, mode);
}

async function gotoHardwareSettings(page: Page): Promise<void> {
  await loginAs(page, 'admin');
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Hardware' }).click();
  await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible({ timeout: 20_000 });
}

test.describe('Broker-backed test_print (Phase 19 Plan 01 tracer)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
  });

  test('Test Print round-trips through the broker and shows the existing success toast (Test 4)', async ({
    page,
  }) => {
    await injectTestPrintMock(page, 'success');
    await page.goto('/');
    await gotoHardwareSettings(page);

    await page.getByRole('button', { name: /test print/i }).click();

    await expect(page.getByText(/test print sent/i)).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('An unreachable broker shows a toast.error mentioning the broker (Test 8)', async ({ page }) => {
    await injectTestPrintMock(page, 'broker_unreachable');
    await page.goto('/');
    await gotoHardwareSettings(page);

    await page.getByRole('button', { name: /test print/i }).click();

    await expect(page.getByText(/broker unreachable/i)).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });
});
