/**
 * E2E coverage for the Hardware Settings printer-select control (bug fix:
 * `receipt_printer_name()` in src-tauri/src/commands/printer.rs sent a
 * hardcoded "RECEIPT_PRINTER" placeholder for every print job, and there was
 * no Settings UI to configure/select a real printer at all).
 *
 * Mirrors broker-test-print.spec.ts's dual-global Tauri IPC mock
 * (`window.__TAURI__` + `window.__TAURI_INTERNALS__.invoke`) — the new
 * `list_printers` Tauri command proxies the broker's `GET /printers` over
 * reqwest Rust-side, so page.route() cannot intercept it; only the
 * invoke('list_printers') boundary is interceptable from Playwright.
 */

import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

async function injectListPrintersMock(
  page: Page,
  printers: string[],
  defaultPrinter: string | null
): Promise<void> {
  await page.addInitScript(
    ([mockPrinters, mockDefault]) => {
      (window as unknown as Record<string, unknown>)['__TAURI__'] = {};

      const callbacks = new Map<number, (arg: unknown) => void>();

      (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
        invoke(cmd: string): Promise<unknown> {
          if (cmd === 'list_printers') {
            return Promise.resolve({ printers: mockPrinters, default: mockDefault });
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
    },
    [printers, defaultPrinter] as const
  );
}

async function gotoHardwareSettings(page: Page): Promise<void> {
  await loginAs(page, 'admin');
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Hardware' }).click();
  await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible({ timeout: 20_000 });
}

test.describe('Hardware Settings printer selection', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
  });

  test('lists installed printers and persists the selected one', async ({ page }) => {
    await injectListPrintersMock(page, ['EPSON TM-T88V Receipt', 'Microsoft Print to PDF'], 'Microsoft Print to PDF');
    await page.goto('/');
    await gotoHardwareSettings(page);

    const select = page.locator('#printer-name');
    await expect(select).toBeVisible({ timeout: 20_000 });
    await expect(select.locator('option')).toContainText([
      /not configured/i,
      'EPSON TM-T88V Receipt',
      'Microsoft Print to PDF',
    ]);
    await expect(page.getByText(/Windows default printer: Microsoft Print to PDF/i)).toBeVisible();

    const save = page.waitForResponse(resp => resp.url().includes('/rest/v1/receipt_settings'));
    await select.selectOption('EPSON TM-T88V Receipt');
    await save;
    await expect(select).toHaveValue('EPSON TM-T88V Receipt');

    await page.reload();
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.locator('#printer-name')).toHaveValue('EPSON TM-T88V Receipt', { timeout: 20_000 });

    await logout(page);
  });

  test('shows an error message when the broker is unreachable', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
      (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
        invoke(cmd: string): Promise<unknown> {
          if (cmd === 'list_printers') {
            return Promise.reject(new Error('broker unreachable: connection refused (mock)'));
          }
          return Promise.resolve(null);
        },
        transformCallback(): number {
          return 0;
        },
        unregisterCallback(): void {},
      };
    });
    await page.goto('/');
    await gotoHardwareSettings(page);

    await expect(page.locator('#printer-name')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/could not list installed printers/i)).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });
});
