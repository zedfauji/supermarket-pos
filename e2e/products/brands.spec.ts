/**
 * E2E: Brand Entity — Inventory → Catalog → Brands
 *
 * Covers BRND-01/02/05 (Phase 32 Plan 01): brand create/edit/delete round-trip,
 * `manage_products` RBAC denial for cashiers, case-insensitive duplicate-name
 * rejection (D-03), and delete blocked while a product still references the
 * brand (D-02, ON DELETE RESTRICT).
 */

import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const TEST_BRAND = 'TestBrand-E2E';
const TEST_BRAND_RENAMED = 'TestBrand-E2E-Renamed';
const TEST_BRAND_LOWER = 'testbrand-e2e';
const TEST_PRODUCT_FOR_BRAND = 'TestProductForBrand-E2E';

async function cleanupTestData(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('products').delete().eq('name', TEST_PRODUCT_FOR_BRAND);
  await admin.from('brands').delete().in('name', [
    TEST_BRAND,
    TEST_BRAND_RENAMED,
    TEST_BRAND_LOWER,
  ]);
}

/**
 * The Brand create/edit dialog, scoped to exclude the always-mounted
 * AgentPanel (see e2e/products/categories.spec.ts's `categoryDialog` for the
 * full rationale — AgentPanel is the only `role="dialog"` element that ever
 * carries a literal `aria-modal="false"` attribute).
 */
function brandDialog(page: Page) {
  return page.locator('[role="dialog"]:not([aria-modal="false"])');
}

/** Navigates to Inventory → Catalog → Brands, mirroring product-management.spec.ts's
 * navigateToProductsSettingsTab but clicking the "Brands" sub-tab instead of "Products". */
async function navigateToBrandsTab(page: Parameters<typeof loginAs>[0]): Promise<boolean> {
  await page.goto('/inventory');
  const catalogTab = page.getByRole('tab', { name: 'Catalog' });
  const catalogTabVisible = await catalogTab
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!catalogTabVisible) return false;
  await catalogTab.click();

  const brandsSubTab = page.getByRole('tab', { name: 'Brands' });
  const visible = await brandsSubTab
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;
  await brandsSubTab.click();
  return true;
}

function nameField(container: Page | Locator): Locator {
  return container.getByRole('textbox', { name: /^Name/i });
}

test.describe('Brand Entity', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await cleanupTestData();
    await page.goto('/');
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ===========================================================================
  // B1: admin creates a brand — appears in the list
  // ===========================================================================
  test('B1: admin creates a brand — visible in list', async ({ page }) => {
    await loginAs(page, 'admin');
    const found = await navigateToBrandsTab(page);
    expect(found).toBe(true);

    await page.getByRole('button', { name: /add brand/i }).click();
    await expect(brandDialog(page)).toBeVisible({ timeout: 10_000 });
    await nameField(brandDialog(page)).fill(TEST_BRAND);
    await brandDialog(page)
      .getByRole('button', { name: /^save$/i })
      .click();

    await expect(brandDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEST_BRAND, { exact: true })).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  // ===========================================================================
  // B2: admin edits a brand's name
  // ===========================================================================
  test('B2: admin renames a brand — updated name visible', async ({ page }) => {
    await loginAs(page, 'admin');
    const found = await navigateToBrandsTab(page);
    expect(found).toBe(true);

    await page.getByRole('button', { name: /add brand/i }).click();
    await expect(brandDialog(page)).toBeVisible({ timeout: 10_000 });
    await nameField(brandDialog(page)).fill(TEST_BRAND);
    await brandDialog(page)
      .getByRole('button', { name: /^save$/i })
      .click();
    await expect(brandDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEST_BRAND, { exact: true })).toBeVisible({ timeout: 15_000 });

    const row = page.getByText(TEST_BRAND, { exact: true }).locator('..').locator('..');
    await row.getByRole('button', { name: /edit/i }).click();
    await expect(brandDialog(page)).toBeVisible({ timeout: 10_000 });
    await nameField(brandDialog(page)).fill(TEST_BRAND_RENAMED);
    await brandDialog(page)
      .getByRole('button', { name: /^save$/i })
      .click();
    await expect(brandDialog(page)).not.toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(TEST_BRAND_RENAMED, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(TEST_BRAND, { exact: true })).toHaveCount(0);

    await logout(page);
  });

  // ===========================================================================
  // B3: admin deletes a brand — disappears from list
  // ===========================================================================
  test('B3: admin deletes a brand — removed from list', async ({ page }) => {
    await loginAs(page, 'admin');
    const found = await navigateToBrandsTab(page);
    expect(found).toBe(true);

    await page.getByRole('button', { name: /add brand/i }).click();
    await expect(brandDialog(page)).toBeVisible({ timeout: 10_000 });
    await nameField(brandDialog(page)).fill(TEST_BRAND);
    await brandDialog(page)
      .getByRole('button', { name: /^save$/i })
      .click();
    await expect(brandDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEST_BRAND, { exact: true })).toBeVisible({ timeout: 15_000 });

    const row = page.getByText(TEST_BRAND, { exact: true }).locator('..').locator('..');
    await row.getByRole('button', { name: /delete/i }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByRole('button', { name: /delete/i }).click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(TEST_BRAND, { exact: true })).toHaveCount(0);

    await logout(page);
  });

  // ===========================================================================
  // B4: case-insensitive duplicate name rejected (D-03)
  // ===========================================================================
  test('B4: case-variant duplicate brand name rejected', async ({ page }) => {
    await loginAs(page, 'admin');
    const found = await navigateToBrandsTab(page);
    expect(found).toBe(true);

    await page.getByRole('button', { name: /add brand/i }).click();
    await expect(brandDialog(page)).toBeVisible({ timeout: 10_000 });
    await nameField(brandDialog(page)).fill(TEST_BRAND);
    await brandDialog(page)
      .getByRole('button', { name: /^save$/i })
      .click();
    await expect(brandDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEST_BRAND, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /add brand/i }).click();
    await expect(brandDialog(page)).toBeVisible({ timeout: 10_000 });
    await nameField(brandDialog(page)).fill(TEST_BRAND_LOWER);
    await brandDialog(page)
      .getByRole('button', { name: /^save$/i })
      .click();

    // Rejected — dialog stays open, no second row appears.
    await expect(page.getByText(/could not|error|ya existe|no se pudo/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const admin = getServiceClient();
    const { data } = await admin
      .from('brands')
      .select('id')
      .ilike('name', TEST_BRAND_LOWER);
    expect((data ?? []).length).toBe(1);

    await logout(page);
  });

  // ===========================================================================
  // B5: cashier never sees the Brands tab (RBAC denial)
  // ===========================================================================
  test('B5: cashier sees no Brands tab on Inventory Catalog', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto('/inventory');
    const inventoryHeading = page.getByRole('heading', { name: /inventory|inventario/i });
    await expect(inventoryHeading).toBeVisible({ timeout: 15_000 });

    // Catalog management remains gated — no "Catalog" tab exists for a cashier,
    // so the nested "Brands" sub-tab is unreachable a fortiori (mirrors
    // categories.spec.ts T8's pattern).
    await expect(page.getByRole('tab', { name: /^(Catalog|Catálogo)$/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Brands' })).toHaveCount(0);

    await logout(page);
  });

  // ===========================================================================
  // B6: deleting a brand still referenced by a product is blocked (D-02)
  // ===========================================================================
  test('B6: delete blocked when a product references the brand', async ({ page }) => {
    const admin = getServiceClient();
    const { data: brand, error: brandErr } = await admin
      .from('brands')
      .insert({ name: TEST_BRAND })
      .select('id')
      .single();
    expect(brandErr).toBeNull();
    const brandId = (brand as { id: string }).id;

    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    await admin.from('products').insert({
      name: TEST_PRODUCT_FOR_BRAND,
      category_id: (cat as { id: string }).id,
      base_price: 5,
      is_active: true,
      brand_id: brandId,
    });

    await loginAs(page, 'admin');
    const found = await navigateToBrandsTab(page);
    expect(found).toBe(true);

    await expect(page.getByText(TEST_BRAND, { exact: true })).toBeVisible({ timeout: 15_000 });
    const row = page.getByText(TEST_BRAND, { exact: true }).locator('..').locator('..');
    await row.getByRole('button', { name: /delete/i }).click();

    const confirmDialog = page.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByRole('button', { name: /delete/i }).click();

    // Blocked by ON DELETE RESTRICT — error toast, brand row still present.
    await expect(page.getByText(/could not|error|no se pudo/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(TEST_BRAND, { exact: true })).toBeVisible();

    const { data: product } = await admin
      .from('products')
      .select('brand_id')
      .eq('name', TEST_PRODUCT_FOR_BRAND)
      .single();
    expect((product as { brand_id: string | null }).brand_id).toBe(brandId);

    await logout(page);
  });
});
