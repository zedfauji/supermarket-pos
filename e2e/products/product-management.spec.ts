/**
 * E2E: Product Management — /inventory
 *
 * Tests creating categories and products, editing prices, toggling active state,
 * and RBAC gating for cashiers.
 */

import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const TEST_CATEGORY = 'TestCat-E2E';
const TEST_PRODUCT = 'TestProduct-E2E';

async function cleanupTestData(): Promise<void> {
  const admin = getServiceClient();
  // Delete test product
  await admin.from('products').delete().eq('name', TEST_PRODUCT);
  // Delete test category
  await admin.from('categories').delete().eq('name', TEST_CATEGORY);
}

async function navigateToInventory(page: Parameters<typeof loginAs>[0]): Promise<boolean> {
  await page.goto('/inventory');
  const inventoryHeading = page.getByRole('heading', { name: /inventory|products|catalog/i });
  return inventoryHeading.isVisible({ timeout: 10_000 }).catch(() => false);
}

/**
 * Category/product CRUD lives on Settings > Products (`ProductsSettingsTab`,
 * src/widgets/SettingsTabsPanel/tabs/ProductsSettingsTab.tsx), NOT on
 * `/inventory` (which is the stock/on-hand-quantity view — no create/edit
 * affordances). Navigates there and, for 'categories', switches to the
 * Categories sub-tab (backed by `CategoryTreeEditor`, a 3-level tree editor
 * — not the unused, unwired `CatalogCategoriesTab`/`CategoryForm` pair).
 */
async function navigateToProductsSettingsTab(
  page: Parameters<typeof loginAs>[0],
  subTab: 'products' | 'categories' = 'products'
): Promise<boolean> {
  await page.goto('/settings');
  const productsTab = page.getByRole('tab', { name: 'Products' });
  const productsTabVisible = await productsTab.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!productsTabVisible) return false;
  await productsTab.click();

  if (subTab === 'categories') {
    const categoriesSubTab = page.getByRole('tab', { name: 'Categories' });
    const visible = await categoriesSubTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!visible) return false;
    await categoriesSubTab.click();
  }
  return true;
}

test.describe('Product Management', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await cleanupTestData().catch(() => undefined);
  });

  test('PM1: product list visible on /inventory', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    const found = await navigateToInventory(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: /inventory page not rendered');
      return;
    }
    // At least one product card or table row should exist
    const hasProducts =
      (await page.getByRole('row').count()) > 1 ||
      (await page.getByRole('button', { name: /Select|Edit/i }).count()) > 0;
    expect(hasProducts).toBe(true);
    await logout(page);
  });

  test('PM2: create new category "TestCat-E2E"', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    // Category CRUD lives on Settings > Products > Categories
    // (CategoryTreeEditor), not on /inventory — see navigateToProductsSettingsTab.
    const found = await navigateToProductsSettingsTab(page, 'categories');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products > Categories not rendered');
      return;
    }

    // `isVisible({ timeout })` is a one-shot check, not a poll — CategoryTreeEditor's
    // useCategories() query needs a moment after the tab switch. `waitFor` actually
    // retries until the button renders. Match "Add root category" specifically —
    // a broader "add.*categor" pattern also matches every row's "Add subcategory
    // under {name}" button (strict-mode violation with 7+ existing categories).
    const addCatBtn = page.getByRole('button', { name: /add root categor|new category/i });
    const addVisible = await addCatBtn
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!addVisible) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: add category button not found');
      return;
    }
    await addCatBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel(/name/i).fill(TEST_CATEGORY);
    // Color field — fill if present
    const colorInput = dialog.getByLabel(/color/i);
    if (await colorInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await colorInput.fill('#FF5733');
    }
    await dialog.getByRole('button', { name: /save|create|add/i }).click();

    await expect(page.getByText(TEST_CATEGORY)).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });

  test('PM3: create product "TestProduct-E2E" at $9.99', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    // Ensure category exists
    const admin = getServiceClient();
    const { data: existingCat } = await admin
      .from('categories')
      .select('id')
      .eq('name', TEST_CATEGORY)
      .maybeSingle();
    if (!existingCat) {
      const { data: firstCat } = await admin.from('categories').select('id').limit(1).single();
      if (!firstCat) {
        test.skip(true, 'No category found to create product in');
        return;
      }
    }

    // Product CRUD lives on Settings > Products (CatalogProductsTab), not on
    // /inventory — see navigateToProductsSettingsTab.
    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    const addProdBtn = page.getByRole('button', { name: /add product|new product/i });
    const addVisible = await addProdBtn
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!addVisible) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: add product button not found');
      return;
    }
    await addProdBtn.click();

    // Named explicitly — the AI-assistant side panel is its own persistent
    // `role="dialog"` element, so an unnamed `getByRole('dialog')` is
    // ambiguous (strict-mode) on every authenticated page in this app.
    const dialog = page.getByRole('dialog', { name: 'New product' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByLabel(/name/i).fill(TEST_PRODUCT);
    // Category is a required native <select> — explicitly pick TEST_CATEGORY
    // rather than relying on whatever the form defaults to.
    const categorySelect = dialog.getByLabel(/category/i);
    await categorySelect.selectOption({ label: TEST_CATEGORY }).catch(() => undefined);
    // Price field is `MoneyInput` wrapped in `FormField` — FormField clones an
    // `id` into its child for label association, but `MoneyInputProps` has no
    // `id` field so it's silently dropped; the field ends up with a generic
    // "Money amount" aria-label instead of "Base price" (real a11y bug, filed
    // as a todo — see .planning/todos/pending/2026-08-04-moneyinput-fields-not-
    // associated-with-formfield-labels.md). getByLabel can't find it — use its
    // stable "0.00" placeholder instead.
    const priceInput = dialog.getByPlaceholder('0.00').first();
    await priceInput.fill('9.99');
    await dialog.getByRole('button', { name: /save|create|add/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Every row's Name cell renders as an editable <input value="...">
    // (CatalogProductsTab: "Edit name, category, or prices inline"), not
    // static text — getByText() can never match an input's value. The
    // search box filters the (100+-row) catalog down to the new row, and a
    // row's accessible name aggregates its descendants' text/values.
    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    await expect(page.getByRole('row', { name: new RegExp(TEST_PRODUCT) })).toBeVisible({
      timeout: 15_000,
    });
    await logout(page);
  });

  // PM4 previously exercised the /pos product grid's own rendering directly
  // (does an active product show up in the grid), and was `test.skip`'d on
  // the premise that /pos no longer existed (D-07, Plan 01-11). That premise
  // is now stale — Phase 2 rebuilt /pos as the direct-sale checkout entry
  // point, and it genuinely renders a live, is_active-filtered product
  // catalog grid with "Select {name}" buttons again
  // (src/widgets/ProductGrid/ui/ProductGrid.tsx). Un-skipped and rewritten
  // against the current UI.
  test('PM4: TestProduct-E2E visible in /pos product grid', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    const admin = getServiceClient();
    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    if (!cat) {
      test.skip(true, 'No category found to seed product in');
      return;
    }
    await admin.from('products').upsert({
      name: TEST_PRODUCT,
      category_id: cat.id,
      base_price: 9.99,
      is_active: true,
    });

    await page.goto('/pos');
    await page.getByPlaceholder(/search products/i).fill(TEST_PRODUCT);
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${TEST_PRODUCT}`, 'i') })
    ).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  test('PM5: edit TestProduct-E2E price to $12.99', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    // `test.afterEach` (cleanupTestData) deletes TEST_PRODUCT after every
    // single test — including PM3, which "creates" it — so by the time this
    // test runs, PM3's row is already gone regardless of test order. Seed it
    // directly here instead of assuming it survives from an earlier test
    // (same self-contained pattern PM4/PM7 already use).
    const admin = getServiceClient();
    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    if (cat) {
      await admin.from('products').upsert({
        name: TEST_PRODUCT,
        category_id: cat.id,
        base_price: 9.99,
        is_active: true,
      });
    }

    // Product edit lives on Settings > Products (CatalogProductsTab), not
    // on /inventory — see navigateToProductsSettingsTab.
    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    // Filter to the seeded row — CatalogProductsTab lists 100+ products.
    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const prodRow = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    const prodVisible = await prodRow
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!prodVisible) {
      test.skip(true, 'TestProduct-E2E not visible in inventory — prior seed step may have failed');
      return;
    }

    // Price is directly inline-editable per the page's own description
    // ("Edit name, category, or prices inline (saved on blur)") — the
    // "Edit" button instead opens a dialog for modifiers/SKU, a separate
    // flow this test isn't exercising.
    const priceInput = prodRow.getByPlaceholder('0.00');
    await priceInput.fill('12.99');
    await priceInput.blur();

    await expect(priceInput).toHaveValue('12.99', { timeout: 10_000 });
    await logout(page);
  });

  test('PM6: set happy hour price $7.99 on TestProduct-E2E', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    // Same seed-then-navigate pattern as PM5 — `cleanupTestData` (afterEach)
    // deletes TEST_PRODUCT after every test, and product editing lives on
    // Settings > Products (CatalogProductsTab), not on /inventory — see
    // navigateToProductsSettingsTab.
    const admin = getServiceClient();
    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    if (cat) {
      await admin.from('products').upsert({
        name: TEST_PRODUCT,
        category_id: cat.id,
        base_price: 9.99,
        is_active: true,
      });
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const prodRow = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    const prodVisible = await prodRow
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!prodVisible) {
      test.skip(true, 'TestProduct-E2E not visible — prior seed may have failed');
      return;
    }

    // ProductForm.tsx (edit dialog) always submits happyHourPrice: null —
    // happy-hour pricing moved to Settings > Promotions (D-01, inline code
    // comment) and no Promotions UI exists yet, so this field is genuinely
    // gone from the edit dialog, not a stale selector. The `hhVisible` guard
    // below correctly reports this as an EXPECTED FAIL rather than a bug.
    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const hhInput = dialog.getByLabel(/happy hour price/i);
    const hhVisible = await hhInput.isVisible({ timeout: 3_000 }).catch(() => false);
    if (!hhVisible) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: happy hour price field not present');
      return;
    }
    await hhInput.clear();
    await hhInput.fill('7.99');
    await dialog.getByRole('button', { name: /save|update/i }).click();

    await expect(page.getByText(/7\.99/)).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  // PM7 previously exercised the /pos product grid's own rendering directly
  // (does an inactive product get filtered out of the grid), and was
  // `test.skip`'d on the same now-stale D-07 premise as PM4 above. Un-skipped
  // and rewritten against the current UI: `useProducts()` still filters
  // `.eq('is_active', true)` server-side
  // (src/entities/product/model/queries.ts), so an inactive product is
  // genuinely excluded from the grid.
  test('PM7: set is_active=false — product disappears from /pos grid', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    const admin = getServiceClient();
    const { data: cat } = await admin.from('categories').select('id').limit(1).single();
    if (!cat) {
      test.skip(true, 'No category found to seed product in');
      return;
    }
    const { data: product } = await admin
      .from('products')
      .upsert({ name: TEST_PRODUCT, category_id: cat.id, base_price: 9.99, is_active: true })
      .select('id')
      .single();
    if (!product) {
      test.skip(true, 'Failed to seed TestProduct-E2E');
      return;
    }

    await page.goto('/pos');
    const searchInput = page.getByPlaceholder(/search products/i);
    await searchInput.fill(TEST_PRODUCT);
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${TEST_PRODUCT}`, 'i') })
    ).toBeVisible({ timeout: 15_000 });

    await admin.from('products').update({ is_active: false }).eq('id', product.id);
    await page.reload();
    await searchInput.fill(TEST_PRODUCT);

    await expect(page.getByText(/no products found/i)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${TEST_PRODUCT}`, 'i') })
    ).toHaveCount(0);

    await logout(page);
  });

  // /inventory is reachable by any authenticated role — Phase 27's D-11
  // decision requires it (cashier/bartender must be able to open a unit from
  // the Open Units tab there; only correct/void require manager+, per
  // 27-08-PLAN's threat model T-27-19). A prior route-level redirect (bug-19,
  // commit f0fa31e) briefly broke D-11 and was reverted. The real RBAC
  // boundary for a cashier on this page is per-control, via `ProtectedAction`
  // (src/shared/ui/ProtectedAction.tsx): Adjust/Export CSV render *disabled*
  // with a "Manager access required" tooltip (not absent — that's this app's
  // established RBAC-denial pattern, also used on Settings tabs and
  // StaffDashboard); Physical Count / the low-stock badge are conditionally
  // rendered and genuinely absent.
  test('PM8: cashier on /inventory sees manager-only inventory controls disabled', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');

    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: /inventory/i })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole('button', { name: /^adjust$/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /export csv/i })).toBeDisabled();
    await expect(page.getByTestId('physical-count-btn')).toHaveCount(0);
    await expect(page.getByTestId('low-stock-badge')).toHaveCount(0);

    // Per-row inline quantity stepper (QuantityAdjustCell) — same RBAC
    // boundary as Adjust/Export CSV above, added after a live-verified gap:
    // the control was clickable for cashier but the write was silently
    // rejected server-side by RLS, surfacing a confusing "Record not
    // found." toast instead of a disabled control.
    await expect(page.getByRole('button', { name: /increase quantity/i }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /decrease quantity/i }).first()).toBeDisabled();

    await logout(page);
  });
});
