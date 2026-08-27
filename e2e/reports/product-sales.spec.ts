import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

test.describe('Product Sales and Hourly Breakdown reports', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test('Reports page has 3 tabs', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await expect(page.getByRole('tab', { name: /session view/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /hourly breakdown/i })).toBeVisible();

    await logout(page);
  });

  test('Product Sales tab renders with date range inputs', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await page.getByRole('tab', { name: /product sales/i }).click();

    // Date range inputs should be visible
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 10_000 });

    // Wait for spinner to disappear (aria-label="Loading")
    await expect(page.getByRole('status', { name: 'Loading' })).not.toBeVisible({
      timeout: 20_000,
    });

    // Either a data table or the EmptyState heading must be visible
    const tableOrEmpty = page
      .locator('table')
      .or(page.getByRole('heading', { name: 'No sales data' }));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('Hourly Breakdown tab shows 24-hour table or empty state', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await page.getByRole('tab', { name: /hourly breakdown/i }).click();

    // Wait for loading to finish. LoadingSpinner's aria-label is
    // t('loading.simple') = "Loading" (no ellipsis) — matching 'Loading...'
    // here matched zero elements, so `.not.toBeVisible()` resolved
    // immediately as a no-op instead of actually waiting for the fetch,
    // racing the rows/empty-state read below.
    const spinner = page.getByRole('status', { name: 'Loading' });
    await expect(spinner).not.toBeVisible({ timeout: 20_000 });

    // Either rows in table or empty state
    const rows = page.locator('tbody tr');
    const emptyState = page.locator('text=No hourly data');

    const rowCount = await rows.count();
    const emptyVisible = await emptyState.isVisible();

    // One of the two must be true
    expect(rowCount > 0 || emptyVisible).toBe(true);

    // If there are rows, there should be exactly 24
    if (rowCount > 0) {
      expect(rowCount).toBe(24);
    }

    await logout(page);
  });
});
