/**
 * E2E test for Phase 19 Plan 08 — the "Print Jobs" tab on /audit, driven
 * end-to-end (PRN-05). Previously only unit/component-tested
 * (Plan 19-07's PrintJobsTable.test.tsx / PrintJobFilterBar.test.tsx /
 * PrintJobDetailSheet.test.tsx / audit/index.test.tsx) — this spec drives
 * the real UI through the actual /audit route.
 *
 * Strategy: the same dual-global Tauri IPC mock every other broker spec in
 * this phase uses (never page.route() — the broker HTTP call is Rust-side
 * reqwest via get_print_jobs/get_print_job, not a browser fetch()).
 */
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { resetTestState } from '../helpers/supabase';

type FixtureJob = {
  job_id: string;
  status: string;
  origin: string;
  printer_name: string;
  attempts: number;
  created_at: string;
  updated_at: string;
};

const FIXTURE_JOBS: FixtureJob[] = [
  {
    job_id: 'pj-unknown-1',
    status: 'unknown',
    origin: 'receipt',
    printer_name: 'RECEIPT_PRINTER',
    attempts: 1,
    created_at: '300',
    updated_at: '300',
  },
  {
    job_id: 'pj-failed-1',
    status: 'failed',
    origin: 'reprint',
    printer_name: 'RECEIPT_PRINTER',
    attempts: 5,
    created_at: '200',
    updated_at: '200',
  },
  {
    job_id: 'pj-printed-1',
    status: 'os_reported_printed',
    origin: 'caja_summary',
    printer_name: 'RECEIPT_PRINTER',
    attempts: 1,
    created_at: '100',
    updated_at: '100',
  },
];

/**
 * `get_print_jobs` returns the 3 fixture rows above regardless of filters
 * (every invoke call, including its `filters`/`pageParam` args, is recorded
 * onto `window.__getPrintJobsCalls` so the filter test can assert on the
 * exact args the last call carried). `get_print_job` returns a 3-event
 * timeline for `pj-unknown-1` only (the row this spec opens the detail
 * Sheet for).
 */
async function injectPrintJobsMock(page: Page): Promise<void> {
  await page.addInitScript(jobs => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    (window as unknown as Record<string, unknown>)['__getPrintJobsCalls'] = [];
    const callbacks = new Map<number, (arg: unknown) => void>();

    const events: Record<string, { ts: string; category: string; detail: string | null }[]> = {
      'pj-unknown-1': [
        { ts: '295', category: 'accepted', detail: 'origin=receipt printer=RECEIPT_PRINTER' },
        { ts: '298', category: 'submitted_to_os', detail: 'win32_job_id=42' },
        {
          ts: '300',
          category: 'ambiguous_handoff',
          detail: 'GetJob returned no data for this win32_job_id; marked unknown, will not auto-resubmit',
        },
      ],
    };

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string, args: unknown): Promise<unknown> {
        if (cmd === 'get_print_jobs') {
          const calls = (window as unknown as Record<string, unknown>)[
            '__getPrintJobsCalls'
          ] as unknown[];
          calls.push(args);
          return Promise.resolve({ jobs, total: jobs.length });
        }
        if (cmd === 'get_print_job') {
          const jobId = (args as { jobId?: string } | undefined)?.jobId;
          const job = jobs.find(j => j.job_id === jobId);
          if (job) {
            return Promise.resolve({
              ...job,
              win32_job_id: null,
              last_error: null,
              events: events[jobId ?? ''] ?? [],
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
  }, FIXTURE_JOBS);
}

async function lastGetPrintJobsCall(page: Page): Promise<{ filters?: { status?: string } } | undefined> {
  return page.evaluate(() => {
    const calls = (window as unknown as Record<string, unknown>)['__getPrintJobsCalls'] as
      | { filters?: { status?: string } }[]
      | undefined;
    return calls?.at(-1);
  });
}

test.describe('Print Jobs audit tab (Plan 19-08, PRN-05)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('manager: default tab is Audit Log; Print Jobs tab renders fixture rows with correct status badges, applies a filter, and opens the detail Sheet timeline', async ({
    page,
  }) => {
    await injectPrintJobsMock(page);
    await page.goto('/');
    await loginAs(page, 'manager');
    await page.goto('/audit');

    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: /audit log/i })).toHaveAttribute('data-state', 'active');

    await page.getByRole('tab', { name: /print jobs/i }).click();
    await expect(page.getByRole('tab', { name: /print jobs/i })).toHaveAttribute('data-state', 'active');

    // Badges: correct label + color-token per status (never destructive/
    // pos-danger for 'unknown' — UI-SPEC's amber-only rule).
    const unknownBadge = page.getByRole('status', { name: /needs confirmation/i });
    await expect(unknownBadge).toBeVisible({ timeout: 15_000 });
    await expect(unknownBadge).toHaveClass(/pos-warning/);
    await expect(unknownBadge).not.toHaveClass(/pos-danger/);

    const failedBadge = page.getByRole('status', { name: /^failed$/i });
    await expect(failedBadge).toBeVisible();
    await expect(failedBadge).toHaveClass(/pos-danger/);

    const printedBadge = page.getByRole('status', { name: /^printed$/i });
    await expect(printedBadge).toBeVisible();
    await expect(printedBadge).toHaveClass(/pos-accent/);

    // Apply a status filter — assert get_print_jobs was called with it.
    await page.getByRole('combobox', { name: /all statuses/i }).click();
    await page.getByRole('option', { name: 'failed', exact: true }).click();
    await page.getByRole('button', { name: /apply filters/i }).click();

    await expect
      .poll(async () => (await lastGetPrintJobsCall(page))?.filters?.status, { timeout: 10_000 })
      .toBe('failed');

    // Activate the row's sr-only accessible trigger via keyboard, not a mouse
    // click — a visually-hidden 1x1px element is reached by real users only
    // via Tab/AT, and clicking its clipped geometry is flaky (the row's own
    // onRowClick div sits visually on top of that same point and intercepts
    // the pointer event; audit-logs.spec.ts's identical sr-only-button
    // pattern shows the same latent flakiness).
    const viewJobTrigger = page.getByRole('button', { name: /view print job pj-unknown-1/i });
    await viewJobTrigger.focus();
    await viewJobTrigger.press('Enter');

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await expect(sheet.getByText('pj-unknown-1')).toBeVisible();
    await expect(sheet.getByRole('listitem')).toHaveCount(3);
    await expect(sheet.getByText('ambiguous_handoff')).toBeVisible();
  });

  test('cashier: navigating directly to /audit still redirects to /home (regression — Print Jobs tab must not weaken the existing view_audit_log gate)', async ({
    page,
  }) => {
    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.goto('/audit');

    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
    await expect(page.getByText(/restricted to managers and admins/i).first()).toBeVisible({
      timeout: 8_000,
    });
  });
});
