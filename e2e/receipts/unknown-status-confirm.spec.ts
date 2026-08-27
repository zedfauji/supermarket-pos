/**
 * E2E test for Phase 19 Plan 08 — the "Did this print?" unknown-status
 * confirm flow, driven end-to-end through ReprintButton on /payments'
 * PaymentPane (D-05/D-06/D-07/D-08). Previously only unit/component-tested
 * (Plan 19-06's ReprintButton.test.tsx) — this spec drives the real UI.
 *
 * Strategy: the same dual-global Tauri IPC mock every other broker spec in
 * this phase uses (never page.route() — the broker HTTP call is Rust-side
 * reqwest, not a browser fetch()). `print_receipt` resolves a job_id;
 * `get_print_job` resolves status='unknown' for that same job_id.
 */
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState, seedClosedTab } from '../helpers/supabase';

const UNKNOWN_JOB_ID = 'e2e-unknown-job-1';

/**
 * `print_receipt` always resolves the same durable job id; `get_print_job`
 * always resolves status='unknown' for that id — the ambiguous-handoff case
 * (PRN-07) neither the broker nor the UI may ever auto-resolve.
 * `window.__printReceiptCallCount` lets the test assert exactly how many
 * times `print_receipt` was invoked (the "No, print again" call-count proof).
 */
async function injectUnknownStatusMock(page: Page): Promise<void> {
  await page.addInitScript(jobId => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    (window as unknown as Record<string, unknown>)['__printReceiptCallCount'] = 0;
    const callbacks = new Map<number, (arg: unknown) => void>();

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string, args: unknown): Promise<unknown> {
        if (cmd === 'print_receipt') {
          const counts = window as unknown as Record<string, number>;
          counts['__printReceiptCallCount'] = (counts['__printReceiptCallCount'] ?? 0) + 1;
          return Promise.resolve({ job_id: jobId, status: 'accepted' });
        }
        if (cmd === 'get_print_job') {
          const requestedId = (args as { jobId?: string } | undefined)?.jobId;
          if (requestedId === jobId) {
            return Promise.resolve({
              job_id: jobId,
              status: 'unknown',
              origin: 'receipt',
              printer_name: 'RECEIPT_PRINTER',
              attempts: 1,
              win32_job_id: null,
              last_error: 'spooler no longer reports this job id',
              created_at: String(Date.now()),
              updated_at: String(Date.now()),
              events: [],
            });
          }
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
  }, UNKNOWN_JOB_ID);
}

async function printReceiptCallCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__printReceiptCallCount'] as number
  );
}

/** Seeds a closed/paid tab, navigates straight to its /payments row, and clicks Reprint. */
async function seedAndClickReprint(page: Page): Promise<void> {
  const tabId = await seedClosedTab();
  const admin = getServiceClient();
  const { data: payment, error } = await admin
    .from('payments')
    .select('id')
    .eq('tab_id', tabId)
    .single();
  if (error || !payment) throw new Error(error?.message ?? 'Seeded payment not found');
  const paymentId = payment.id as string;

  await page.goto(`/payments?id=${paymentId}`);
  const row = page.getByTestId(`payment-row-${paymentId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: /reprint/i }).click();
}

test.describe('Unknown-status "Did this print?" confirm flow (Plan 19-08, D-05/D-06/D-07/D-08)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await injectUnknownStatusMock(page);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test('clicking the unknown badge opens "Did this print?"; "Yes, it printed" dismisses without a second print_receipt call', async ({
    page,
  }) => {
    await seedAndClickReprint(page);

    // The amber "Needs confirmation" badge (status="status" role, per
    // PrintJobStatusBadge) renders once usePrintJob resolves 'unknown'.
    const badge = page.getByRole('status', { name: /needs confirmation/i });
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => printReceiptCallCount(page), { timeout: 10_000 })
      .toBe(1);

    await badge.click();
    await expect(page.getByText('Did this print?')).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByText(
        "We couldn't confirm this job reached the printer. Check the physical receipt or paper before answering."
      )
    ).toBeVisible();

    await page.getByRole('button', { name: 'Yes, it printed' }).click();
    await expect(page.getByText('Did this print?')).not.toBeVisible({ timeout: 5_000 });

    // No second print_receipt call — "Yes" is a pure dismiss, never a reprint.
    expect(await printReceiptCallCount(page)).toBe(1);
  });

  test('"No, print again" triggers exactly one fresh print_receipt call, then dismisses', async ({
    page,
  }) => {
    await seedAndClickReprint(page);

    const badge = page.getByRole('status', { name: /needs confirmation/i });
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => printReceiptCallCount(page), { timeout: 10_000 })
      .toBe(1);

    await badge.click();
    await expect(page.getByText('Did this print?')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'No, print again' }).click();

    await expect
      .poll(async () => printReceiptCallCount(page), { timeout: 10_000 })
      .toBe(2);
    await expect(page.getByText('Did this print?')).not.toBeVisible({ timeout: 5_000 });
  });
});
