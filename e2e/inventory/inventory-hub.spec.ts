/**
 * E2E spec: inventory hub — filter tiles, Movements, and the Catalog RBAC gate.
 *
 * Counter UX pass 2, Task 12 (addendum §C). `/inventory` (InventoryPagePanel)
 * gained a 5-tab layout (Stock/Catalog/Open Units/Near Expiry/Movements) with
 * Stock's own filter tiles (All SKUs/Low stock/Out of stock/Near expiry) —
 * this project's mandatory-automated-testing policy requires that new surface
 * area ship with real Playwright coverage, not a manual-verification note.
 *
 * Covers:
 *  1. Manager sees all 5 tabs; the "Low stock" tile toggles a real filter
 *     (aria-pressed + row count matching the tile's own number, or the
 *     documented empty-filter message) and un-toggles on a second click.
 *  2. Manager: Movements tab renders the 5 documented column headers, and a
 *     fresh manual adjustment (via the existing Adjust dialog) appears as the
 *     newest row with the product's NAME (not its UUID) and a "+1" delta.
 *  3. Cashier lacks `manage_products`, so the Catalog tab is not rendered at
 *     all (not just disabled) — Stock stays visible.
 */

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { resetTestState } from '../helpers/supabase';

test.beforeEach(async () => {
  requireIntegrationEnv();
  await resetTestState();
});

test.describe('Inventory hub (/inventory)', () => {
  test('manager: all 5 tabs visible; Low stock tile filters rows and un-filters on a second click', async ({
    page,
  }) => {
    await loginAs(page, 'manager');
    await gotoAuthed(page, '/inventory');

    await expect(page.getByRole('tab', { name: 'Stock' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Catalog' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Open Units' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Near Expiry' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Movements' })).toBeVisible();

    const lowStockTile = page.getByRole('button', { name: /low stock/i });
    await expect(lowStockTile).toBeVisible();
    const lowStockCount = Number(await lowStockTile.locator('span').nth(1).textContent());
    await expect(lowStockTile).toHaveAttribute('aria-pressed', 'false');

    await lowStockTile.click();
    await expect(lowStockTile).toHaveAttribute('aria-pressed', 'true');

    if (lowStockCount === 0) {
      await expect(page.getByText('No products match these filters.')).toBeVisible();
    } else {
      await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(lowStockCount);
    }

    await lowStockTile.click();
    await expect(lowStockTile).toHaveAttribute('aria-pressed', 'false');
  });

  test('manager: Movements tab shows the documented headers and a fresh manual adjustment as its newest row', async ({
    page,
  }) => {
    await loginAs(page, 'manager');
    await gotoAuthed(page, '/inventory');

    const adjustBtn = page.getByRole('button', { name: 'Adjust', exact: true });
    await expect(adjustBtn).toBeVisible({ timeout: 20_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog', { name: /batch adjustment/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const productSelect = page.locator('#batch-product');
    // Index 0 is the "Select…" placeholder — pick the first real product,
    // whichever it is, then read its label back to cross-check the
    // Movements row later.
    await productSelect.selectOption({ index: 1 });
    const productName = (await productSelect.locator('option:checked').textContent())?.trim();
    expect(productName).toBeTruthy();

    await page.getByLabel(/quantity delta/i).fill('1');
    await page.getByLabel(/^Reason$/).selectOption('correction');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: 'Movements' }).click();

    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 15_000 });
    await expect(table.getByRole('columnheader', { name: 'When' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Product' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Delta' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Reason' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Staff' })).toBeVisible();

    const firstRow = table.locator('tbody tr').first();
    await expect(firstRow).toContainText(productName ?? '');
    await expect(firstRow).toContainText('+1');
    // The product's UUID never appears where its name should — this is the
    // regression this spec exists to catch (MovementsTab falls back to a
    // shortened UUID only when the id→name lookup misses).
    await expect(firstRow.getByRole('cell').nth(1)).not.toHaveText(/^[0-9a-f]{8}$/i);
  });

  test('cashier: Catalog tab is not rendered at all; Stock tab stays visible', async ({ page }) => {
    await loginAs(page, 'cashier');
    await gotoAuthed(page, '/inventory');

    await expect(page.getByRole('tab', { name: 'Stock' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Catalog' })).toHaveCount(0);
  });
});
