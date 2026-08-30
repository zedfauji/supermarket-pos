/**
 * E2E tests for Phase 19 Plan 08 — broker-submission fault matrix across
 * every UI-triggered caller, plus the correlation-ID propagation proof
 * (PRN-02/PRN-04).
 *
 * Strategy: the same dual-global Tauri IPC mock (`window.__TAURI__` +
 * `window.__TAURI_INTERNALS__.invoke`) every other broker spec in this phase
 * uses (e2e/receipts/print-retry-resilience.spec.ts,
 * e2e/receipts/broker-test-print.spec.ts) — the broker HTTP call happens
 * Rust-side via reqwest inside the Tauri command, never as a browser
 * fetch(), so `page.route()` cannot intercept it; only the invoke()
 * boundary is interceptable from Playwright. `page.route()` must never
 * appear in this file.
 *
 * Covers, per this plan's must_haves:
 *  1. Cash checkout (PaymentForm): a durably-accepted job_id shows no toast
 *     (no-success-toast rule) and the SAME job_id later renders in the
 *     Print Jobs table (correlation-ID propagation, PRN-04).
 *  2-3. PaymentForm: broker-unreachable vs. job-rejected failure-class copy.
 *  4-5. CajaDashboard's Print Summary: broker-unreachable vs. rejected.
 *  6-7. HardwareSettingsTab's Test Print: broker-unreachable vs. rejected.
 */
import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

type InvokeOutcome =
  | { kind: 'success'; jobId: string }
  | { kind: 'unreachable' }
  | { kind: 'rejected' };

/**
 * Injects the dual-global Tauri IPC mock. `commandOutcomes` maps a Tauri
 * command name (e.g. `print_receipt`, `print_raw_text`, `test_print`,
 * `open_cash_drawer`) to how it should resolve/reject. When
 * `printJobsFixtureId` is set, `get_print_jobs`/`get_print_job` are also
 * mocked to return a single row for that exact job id — the correlation-ID
 * proof for Test 1. Every resolved/rejected `print_receipt`/`print_raw_text`/
 * `test_print`/`open_cash_drawer` call increments
 * `window.__invokeCallCounts[cmd]`, letting tests assert on call counts.
 */
async function injectBrokerMock(
  page: Page,
  commandOutcomes: Record<string, InvokeOutcome>,
  printJobsFixtureId?: string
): Promise<void> {
  await page.addInitScript(
    ({ outcomes, fixtureId }) => {
      (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
      (window as unknown as Record<string, unknown>)['__invokeCallCounts'] = {};
      const callbacks = new Map<number, (arg: unknown) => void>();

      // CheckoutPanel's isTauri()-guarded listen() effect mounts on /pos and
      // its cleanup synchronously reads this global before ever calling
      // invoke() (see e2e/helpers/tauriPeekMock.ts) — without it, unmount
      // throws "Cannot read properties of undefined (reading
      // 'unregisterListener')" as an uncaught page error.
      (window as unknown as Record<string, unknown>)['__TAURI_EVENT_PLUGIN_INTERNALS__'] = {
        unregisterListener: () => undefined,
      };

      (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
        invoke(cmd: string, args: unknown): Promise<unknown> {
          const counts = (window as unknown as Record<string, unknown>)[
            '__invokeCallCounts'
          ] as Record<string, number>;
          counts[cmd] = (counts[cmd] ?? 0) + 1;

          if (cmd === 'get_print_jobs' && fixtureId) {
            return Promise.resolve({
              jobs: [
                {
                  job_id: fixtureId,
                  status: 'accepted',
                  origin: 'receipt',
                  printer_name: 'RECEIPT_PRINTER',
                  attempts: 0,
                  created_at: '1',
                  updated_at: '1',
                },
              ],
              total: 1,
            });
          }
          if (cmd === 'get_print_job' && fixtureId) {
            const jobId = (args as { jobId?: string } | undefined)?.jobId;
            if (jobId === fixtureId) {
              return Promise.resolve({
                job_id: fixtureId,
                status: 'accepted',
                origin: 'receipt',
                printer_name: 'RECEIPT_PRINTER',
                attempts: 0,
                win32_job_id: null,
                last_error: null,
                created_at: '1',
                updated_at: '1',
                events: [],
              });
            }
          }

          const outcome = outcomes[cmd];
          if (!outcome) return Promise.resolve(null);
          if (outcome.kind === 'success') {
            return Promise.resolve({ job_id: outcome.jobId, status: 'accepted' });
          }
          if (outcome.kind === 'unreachable') {
            return Promise.reject(new Error('broker unreachable: connection refused (mock)'));
          }
          return Promise.reject(new Error('broker rejected request: HTTP 400 invalid_payload (mock)'));
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
    { outcomes: commandOutcomes, fixtureId: printJobsFixtureId }
  );
}

async function invokeCallCount(page: Page, cmd: string): Promise<number> {
  return page.evaluate(
    c =>
      ((window as unknown as Record<string, unknown>)['__invokeCallCounts'] as
        | Record<string, number>
        | undefined)?.[c] ?? 0,
    cmd
  );
}

/** Mirrors e2e/receipts/print-retry-resilience.spec.ts's cash-sale flow with the Indian catalog. */
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

const BROKER_UNREACHABLE_COPY = /print service unavailable.*print broker is running/i;
const REJECTED_COPY = /printer rejected this job/i;

test.describe('Broker-submission fault matrix across every UI-triggered caller (Plan 19-08)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
  });

  test('cash checkout (PaymentForm): a durably-accepted job_id shows no toast, and the SAME id renders in the Print Jobs table (PRN-04 correlation)', async ({
    page,
  }) => {
    const FIXTURE_JOB_ID = 'e2e-fixture-job-1';
    await injectBrokerMock(
      page,
      {
        print_receipt: { kind: 'success', jobId: FIXTURE_JOB_ID },
        open_cash_drawer: { kind: 'success', jobId: 'e2e-fixture-drawer-1' },
      },
      FIXTURE_JOB_ID
    );
    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    // Wait for the fire-and-forget post-payment print IIFE to resolve, then
    // assert no failure-class toast ever appeared (no-success-toast rule).
    await expect
      .poll(async () => invokeCallCount(page, 'print_receipt'), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(page.getByText(BROKER_UNREACHABLE_COPY)).not.toBeVisible();
    await expect(page.getByText(REJECTED_COPY)).not.toBeVisible();

    await logout(page);
    await loginAs(page, 'manager');
    await page.goto('/audit');
    await page.getByRole('tab', { name: /print jobs/i }).click();

    // Same job_id the mocked submission returned now renders in the audit
    // table — the correlation-ID propagation proof. The full id only exists
    // in this sr-only accessible-trigger's aria-label (EntityIdCell only
    // shows a truncated prefix visually), same pattern already proven by
    // e2e/audit/audit-logs.spec.ts's "View diff for..." row trigger.
    await expect(
      page.getByRole('button', { name: new RegExp(`view print job ${FIXTURE_JOB_ID}`, 'i') })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('cash checkout (PaymentForm): broker-unreachable print_receipt failure shows the brokerUnreachable copy', async ({
    page,
  }) => {
    await injectBrokerMock(page, {
      print_receipt: { kind: 'unreachable' },
      open_cash_drawer: { kind: 'success', jobId: 'e2e-drawer-ok' },
    });
    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(BROKER_UNREACHABLE_COPY)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('cash checkout (PaymentForm): a generic (non-"broker unreachable") print_receipt rejection shows the rejected copy', async ({
    page,
  }) => {
    await injectBrokerMock(page, {
      print_receipt: { kind: 'rejected' },
      open_cash_drawer: { kind: 'success', jobId: 'e2e-drawer-ok' },
    });
    await page.goto('/');
    await loginAs(page, 'cashier');

    await driveCashCheckout(page);
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(REJECTED_COPY)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('Caja Print Summary (CajaDashboard): broker-unreachable print_raw_text failure shows the brokerUnreachable copy', async ({
    page,
  }) => {
    await injectBrokerMock(page, { print_raw_text: { kind: 'unreachable' } });
    await page.goto('/');
    await loginAs(page, 'manager');
    await page.goto('/staff');

    const printBtn = page.getByRole('button', { name: /print summary/i });
    await expect(printBtn).toBeVisible({ timeout: 30_000 });
    await printBtn.click();

    await expect(page.getByText(BROKER_UNREACHABLE_COPY)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('Caja Print Summary (CajaDashboard): a generic print_raw_text rejection shows the rejected copy', async ({
    page,
  }) => {
    await injectBrokerMock(page, { print_raw_text: { kind: 'rejected' } });
    await page.goto('/');
    await loginAs(page, 'manager');
    await page.goto('/staff');

    const printBtn = page.getByRole('button', { name: /print summary/i });
    await expect(printBtn).toBeVisible({ timeout: 30_000 });
    await printBtn.click();

    await expect(page.getByText(REJECTED_COPY)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('Settings Hardware Test Print (HardwareSettingsTab): broker-unreachable test_print failure shows the brokerUnreachable copy', async ({
    page,
  }) => {
    await injectBrokerMock(page, { test_print: { kind: 'unreachable' } });
    await page.goto('/');
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /test print/i }).click();

    await expect(page.getByText(BROKER_UNREACHABLE_COPY)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('Settings Hardware Test Print (HardwareSettingsTab): a generic test_print rejection shows the rejected copy', async ({
    page,
  }) => {
    await injectBrokerMock(page, { test_print: { kind: 'rejected' } });
    await page.goto('/');
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Hardware' }).click();
    await expect(page.getByRole('heading', { name: 'Hardware' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /test print/i }).click();

    await expect(page.getByText(REJECTED_COPY)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });
});
