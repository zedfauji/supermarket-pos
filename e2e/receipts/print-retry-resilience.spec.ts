/**
 * E2E tests for Phase 13 Plan 01 — Receipt print retry resilience (RCP-02, RCP-04)
 *
 * Strategy: mirror 25-export-reports.spec.ts's dual-global Tauri IPC mock
 * (`window.__TAURI__` + `window.__TAURI_INTERNALS__.invoke`/`transformCallback`/
 * `unregisterCallback`) so `printReceipt()`'s `isTauri()` check and
 * `@tauri-apps/api/core`'s `invoke()` internals both resolve correctly — a mock
 * that only injects `__TAURI_INTERNALS__` silently falls through to the browser
 * print fallback and proves nothing (RESEARCH.md Pitfall 2).
 *
 * The injected `invoke` intercepts `print_receipt` specifically and tracks
 * attempt count on `window.__printMockState`, letting each test drive a real
 * cash checkout through the UI and assert on the retry/toast behavior that
 * lives once inside `printReceipt()`.
 */

import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

/**
 * Injects the dual-global Tauri mock before app scripts run. `print_receipt`
 * rejects while `attempts <= failUntilAttempt`, resolving from
 * `failUntilAttempt + 1` onward (or never, when `failUntilAttempt` is
 * `Number.MAX_SAFE_INTEGER` — `Infinity` does not survive `addInitScript`'s
 * JSON serialization, which turns it into `null`).
 * All other commands (e.g. `open_cash_drawer`) resolve immediately.
 */
async function injectPrinterMock(page: Page, failUntilAttempt: number): Promise<void> {
  await page.addInitScript(failUntil => {
    (window as unknown as Record<string, unknown>)['__printMockState'] = { attempts: 0 };
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};

    const callbacks = new Map<number, (arg: unknown) => void>();

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string): Promise<unknown> {
        if (cmd === 'print_receipt') {
          const state = (window as unknown as Record<string, unknown>)['__printMockState'] as {
            attempts: number;
          };
          state.attempts += 1;
          if (state.attempts <= failUntil) {
            return Promise.reject(new Error('Printer offline (mock)'));
          }
          return Promise.resolve(null);
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
  }, failUntilAttempt);
}

/** Mirrors e2e/checkout/happy-path.spec.ts's cash-sale flow with the Indian catalog. */
async function driveCashCheckout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /checkout/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
  await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
  await page
    .getByRole('button', { name: /^process payment$/i })
    .first()
    .click();
  await page.getByLabel(/amount tendered/i).fill('100');
  await page
    .getByRole('button', { name: /^process payment$/i })
    .last()
    .click();
}

test.describe('Receipt print retry resilience', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
  });

  test('a transient printer failure is retried and the sale still completes (RCP-04)', async ({
    page,
  }) => {
    await injectPrinterMock(page, 2);
    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);

    // Either retry toast ("(1/3)" or "(2/3)") proves the retry-in-progress indicator
    // fired — asserting on either (rather than only "(2/3)") avoids flaking on the
    // ~700ms window during which a single specific toast text is on screen.
    await expect(page.getByText(/\([12]\/3\)/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    // The retry/toast sequence is fire-and-forget relative to the sale UI (RCP-02) —
    // the 3rd (recovering) attempt happens ~700ms after the "(2/3)" toast above, so
    // poll rather than reading a single evaluate() snapshot.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __printMockState: { attempts: number } }).__printMockState
                .attempts
          ),
        { timeout: 10_000 }
      )
      .toBe(3);
  });

  test('a printer that stays offline through all retries never blocks the completed sale (RCP-02)', async ({
    page,
  }) => {
    await injectPrinterMock(page, Number.MAX_SAFE_INTEGER);
    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);

    // The sale completes regardless of print outcome (ROADMAP Success Criterion 2) —
    // "Done" becomes visible even though print_receipt never succeeds.
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    // All 3 attempts are exhausted (not abandoned early) before the final failure toast.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __printMockState: { attempts: number } }).__printMockState
                .attempts
          ),
        { timeout: 10_000 }
      )
      .toBe(3);

    await expect(page.getByText(/3.*(attempts|intentos)/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
