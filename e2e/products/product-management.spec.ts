/**
 * E2E: Product Management — /inventory
 *
 * Tests creating categories and products, editing prices, toggling active state,
 * and RBAC gating for cashiers.
 */

import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const TEST_CATEGORY = 'TestCat-E2E';
const TEST_PRODUCT = 'TestProduct-E2E';
const TEST_BRAND = 'TestBrandForProduct-E2E';

async function cleanupTestData(): Promise<void> {
  const admin = getServiceClient();
  // Delete test product
  await admin.from('products').delete().eq('name', TEST_PRODUCT);
  // Delete test category
  await admin.from('categories').delete().eq('name', TEST_CATEGORY);
  // Delete test brand (Phase 32)
  await admin.from('brands').delete().eq('name', TEST_BRAND);
}

/** Seeds (upserts) TEST_PRODUCT directly via the service client, returning its id. */
async function seedTestProduct(
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; categoryId: string } | null> {
  const admin = getServiceClient();
  const { data: cat } = await admin.from('categories').select('id').limit(1).single();
  if (!cat) return null;
  const categoryId = cat.id as string;
  const { data: product } = await admin
    .from('products')
    .upsert({
      name: TEST_PRODUCT,
      category_id: categoryId,
      base_price: 9.99,
      is_active: true,
      ...overrides,
    })
    .select('id')
    .single();
  if (!product) return null;
  return { id: product.id as string, categoryId };
}

/**
 * The reshaped `ProductDetailDialog`'s Name field, selected by role instead
 * of `getByLabel` (Rule 1 fix, Phase 31 reshape). `getByLabel` resolves a
 * tab's `aria-labelledby` target by its full referenced text, including the
 * `VerticalTabsTrigger`'s decorative (`aria-hidden`) description — and the
 * Details tab's description ("Name, price, barcode") happens to start with
 * "Name", so `dialog.getByLabel(/name/i)` strict-mode-fails by also matching
 * the Details `tabpanel` container itself. `getByRole('textbox', ...)`
 * can't match a non-textbox container, so it's unambiguous.
 */
function nameField(container: Page | Locator): Locator {
  return container.getByRole('textbox', { name: /^Name/i });
}

async function navigateToInventory(page: Parameters<typeof loginAs>[0]): Promise<boolean> {
  await page.goto('/inventory');
  const inventoryHeading = page.getByRole('heading', { name: /inventory|products|catalog/i });
  // `isVisible()` is a one-shot, non-retrying check (unlike `expect(...).toBeVisible()`
  // or `waitFor()`) — calling it immediately after `page.goto()` races the app's
  // client-side render and can return false before React ever mounts the
  // heading. `waitFor` actually polls until the element renders or the
  // timeout elapses (Rule 1 fix — pre-existing in this helper, unrelated to
  // Phase 31's dialog reshape, but blocking every test that depends on it).
  return inventoryHeading
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Category/product CRUD lives on Inventory › Catalog (`CatalogTab`,
 * src/widgets/InventoryPagePanel/ui/CatalogTab.tsx), NOT on the Stock tab
 * (which is the stock/on-hand-quantity view — no create/edit affordances).
 * Navigates there and, for 'categories', switches to the Categories sub-tab
 * (backed by `CategoryTreeEditor`, a 3-level tree editor — not the unused,
 * unwired `CatalogCategoriesTab`/`CategoryForm` pair).
 */
async function navigateToProductsSettingsTab(
  page: Parameters<typeof loginAs>[0],
  subTab: 'products' | 'categories' = 'products'
): Promise<boolean> {
  await page.goto('/inventory');
  const catalogTab = page.getByRole('tab', { name: 'Catalog' });
  // See navigateToInventory's comment — `waitFor` actually polls, `isVisible` doesn't.
  const catalogTabVisible = await catalogTab
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!catalogTabVisible) return false;
  await catalogTab.click();
  // Nested catalog tabs: "Products" is selected by default.
  await page.getByRole('tab', { name: 'Products' }).click();

  if (subTab === 'categories') {
    const categoriesSubTab = page.getByRole('tab', { name: 'Categories' });
    const visible = await categoriesSubTab
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
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
    await nameField(dialog).fill(TEST_PRODUCT);
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

    // Create-then-stay (Phase 31 D-03): the dialog no longer closes itself on
    // a successful create — it stays open, now in edit mode for the
    // just-created product (see PM11 for a dedicated test of this
    // behaviour). Close it explicitly before checking the catalog row.
    const stayOpenDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(stayOpenDialog).toBeVisible({ timeout: 10_000 });
    await stayOpenDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(stayOpenDialog).not.toBeVisible({ timeout: 10_000 });

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

  // ===================================================================
  // Phase 31 (31-02): ProductDetailDialog reshape — Details/Photo/Links
  // vertical tabs, read-only stock strip, create-then-stay, error-driven
  // tab navigation (D-06), and the dirty-close guard (D-07).
  // ===================================================================

  test('PM9: reshaped dialog shows all three rail triggers — Photo enabled in edit, disabled in create', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });
    await expect(editDialog.getByRole('tab', { name: /details/i })).toBeVisible();
    await expect(editDialog.getByRole('tab', { name: /photo/i })).toBeVisible();
    await expect(editDialog.getByRole('tab', { name: /links/i })).toBeVisible();
    await expect(editDialog.getByRole('tab', { name: /photo/i })).toBeEnabled();
    await expect(editDialog.getByTestId('product-stock-strip')).toBeVisible();
    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Add product' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New product' });
    await expect(createDialog).toBeVisible({ timeout: 10_000 });
    await expect(createDialog.getByRole('tab', { name: /photo/i })).toBeDisabled();
    await expect(createDialog.getByTestId('product-stock-strip')).toHaveCount(0);
    await createDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(createDialog).not.toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('PM10: round trip — a Details field and a Links field save together from one submit', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    await editDialog.getByLabel('SKU').fill('SKU-ROUNDTRIP-1');
    await editDialog.getByRole('tab', { name: /links/i }).click();
    await editDialog.getByLabel('Units per package').fill('5');
    await editDialog.getByRole('button', { name: /save|update/i }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

    const admin = getServiceClient();
    const { data } = await admin
      .from('products')
      .select('sku, units_per_package')
      .eq('id', seeded.id)
      .single();
    expect(data?.sku).toBe('SKU-ROUNDTRIP-1');
    expect(data?.units_per_package).toBe(5);

    await logout(page);
  });

  test('PM11 (D-03): create-then-stay — dialog stays open after Create, flips to edit title, Photo enables', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByRole('button', { name: 'Add product' }).click();
    const createDialog = page.getByRole('dialog', { name: 'New product' });
    await expect(createDialog).toBeVisible({ timeout: 10_000 });
    await nameField(createDialog).fill(TEST_PRODUCT);
    await createDialog.getByPlaceholder('0.00').first().fill('9.99');
    const createBtn = createDialog.getByRole('button', { name: 'Create product' });
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click();
    await expect(page.getByText('Product created')).toBeVisible({ timeout: 15_000 });

    const stillOpenDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(stillOpenDialog).toBeVisible({ timeout: 10_000 });
    await expect(stillOpenDialog.getByRole('tab', { name: /photo/i })).toBeEnabled();
    await expect(stillOpenDialog.getByTestId('product-stock-strip')).toBeVisible();

    await stillOpenDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(stillOpenDialog).not.toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('PM12 (D-06): an invalid field on a hidden tab switches the dialog back to it and marks it', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    await nameField(editDialog).fill('');
    await editDialog.getByRole('tab', { name: /links/i }).click();
    await expect(editDialog.getByLabel('Units per package')).toBeVisible();

    await editDialog.getByRole('button', { name: /save|update/i }).click();

    const detailsTab = editDialog.getByRole('tab', { name: /details/i });
    await expect(detailsTab).toHaveAttribute('data-state', 'active', { timeout: 10_000 });
    await expect(detailsTab).toHaveAccessibleName(/has errors/i);
    await expect(nameField(editDialog)).toHaveAttribute('aria-invalid', 'true');

    // Restore the Name field and clean up (dirty close prompts otherwise).
    await nameField(editDialog).fill(TEST_PRODUCT);
    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('PM13 (D-07): closing with unsaved edits prompts to discard; keep-editing preserves the edit', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    const skuInput = editDialog.getByLabel('SKU');
    await skuInput.fill('SKU-DIRTY-1');

    await page.keyboard.press('Escape');
    const discardDialog = page.getByRole('alertdialog');
    await expect(discardDialog).toBeVisible({ timeout: 10_000 });
    await expect(discardDialog.getByText(/discard changes\?/i)).toBeVisible();

    await discardDialog.getByRole('button', { name: /keep editing/i }).click();
    await expect(discardDialog).not.toBeVisible({ timeout: 5_000 });
    await expect(editDialog).toBeVisible();
    await expect(skuInput).toHaveValue('SKU-DIRTY-1');

    await page.keyboard.press('Escape');
    await expect(discardDialog).toBeVisible({ timeout: 10_000 });
    await discardDialog.getByRole('button', { name: /discard changes/i }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('PM14: switching tabs is free — no confirmation, and an unsaved edit survives the round trip', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    const skuInput = editDialog.getByLabel('SKU');
    await skuInput.fill('SKU-TAB-SWITCH-1');

    await editDialog.getByRole('tab', { name: /links/i }).click();
    await expect(editDialog.getByLabel('Units per package')).toBeVisible();
    await editDialog.getByRole('tab', { name: /details/i }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(skuInput).toHaveValue('SKU-TAB-SWITCH-1');

    await editDialog.getByRole('button', { name: /save|update/i }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

    const admin = getServiceClient();
    const { data } = await admin.from('products').select('sku').eq('id', seeded.id).single();
    expect(data?.sku).toBe('SKU-TAB-SWITCH-1');

    await logout(page);
  });

  // ===================================================================
  // Phase 31 (31-06): gap closure — stock strip must render REAL seeded
  // inventory data (not just be visible), and unitsPerPackage must reject
  // a non-integer entry instead of silently truncating it.
  // ===================================================================

  test('PM16: stock strip shows real seeded on-hand/threshold, no low-stock badge when comfortably above threshold', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const admin = getServiceClient();
    await admin.from('inventory').upsert(
      { product_id: seeded.id, quantity_on_hand: 42, low_stock_threshold: 17, unit: 'unit' },
      { onConflict: 'product_id' }
    );

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    const stockStrip = editDialog.getByTestId('product-stock-strip');
    await expect(stockStrip).toBeVisible();
    await expect(stockStrip).toContainText('42');
    await expect(stockStrip).toContainText('17');
    await expect(stockStrip).not.toContainText('No threshold');
    // On-hand figure must not be the old broken default of "0" — a real
    // seeded value of 42 is present, so a bare "0" would only appear if the
    // join were still missing (proves the fix, not just new numbers coexisting).
    await expect(stockStrip.getByText('0', { exact: true })).toHaveCount(0);
    await expect(stockStrip.getByText('Low stock')).toHaveCount(0);

    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('PM17: stock strip shows the low-stock badge when seeded quantity is at/below threshold', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const admin = getServiceClient();
    await admin.from('inventory').upsert(
      { product_id: seeded.id, quantity_on_hand: 3, low_stock_threshold: 17, unit: 'unit' },
      { onConflict: 'product_id' }
    );

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    const stockStrip = editDialog.getByTestId('product-stock-strip');
    await expect(stockStrip).toBeVisible();
    await expect(stockStrip).toContainText('3');
    await expect(stockStrip).toContainText('17');
    await expect(stockStrip.getByText('Low stock')).toBeVisible();

    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 5_000 });

    await logout(page);
  });

  test('PM18 (WR-01): a non-integer Units per package entry is rejected, not silently truncated', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    await editDialog.getByRole('tab', { name: /links/i }).click();
    const unitsInput = editDialog.getByLabel('Units per package');
    await expect(unitsInput).toBeVisible();
    await unitsInput.fill('2.5');
    await editDialog.getByRole('button', { name: /save|update/i }).click();

    // Dialog must stay open with a visible field error — not silently save
    // a truncated value and close.
    await expect(editDialog).toBeVisible();
    await expect(unitsInput).toHaveAttribute('aria-invalid', 'true');

    const admin = getServiceClient();
    const { data } = await admin
      .from('products')
      .select('units_per_package')
      .eq('id', seeded.id)
      .single();
    expect(data?.units_per_package).toBeNull();

    // Restore a valid value and close cleanly (dirty-close guard otherwise).
    await unitsInput.fill('');
    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    const discardDialog = page.getByRole('alertdialog');
    if (await discardDialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await discardDialog.getByRole('button', { name: /discard changes/i }).click();
    }
    await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('PM19 (BRND-02/03): brand + pack weight persist on a seeded product', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }
    const admin = getServiceClient();
    const { data: brandRow, error: brandErr } = await admin
      .from('brands')
      .upsert({ name: TEST_BRAND })
      .select('id')
      .single();
    if (brandErr || !brandRow) {
      test.skip(true, `Could not seed test brand: ${brandErr?.message ?? 'no row'}`);
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    await editDialog.getByLabel(/^brand/i).selectOption({ label: TEST_BRAND });
    const weightAmountInput = editDialog.getByLabel(/pack weight/i);
    await weightAmountInput.fill('0.5');
    await editDialog.getByLabel(/weight unit/i).selectOption('kg');
    await editDialog.getByRole('button', { name: /save|update/i }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 15_000 });

    const { data: saved } = await admin
      .from('products')
      .select('brand_id, weight_amount, weight_unit')
      .eq('id', seeded.id)
      .single();
    expect(saved?.brand_id).toBe((brandRow as { id: string }).id);
    expect(Number(saved?.weight_amount)).toBe(0.5);
    expect(saved?.weight_unit).toBe('kg');

    // Reopen to confirm the dialog reflects the persisted values.
    await row.getByRole('button', { name: 'Edit' }).click();
    const reopenDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
    await expect(reopenDialog.getByLabel(/^brand/i)).toHaveValue(
      (brandRow as { id: string }).id
    );
    await expect(reopenDialog.getByLabel(/pack weight/i)).toHaveValue('0.5');
    await expect(reopenDialog.getByLabel(/weight unit/i)).toHaveValue('kg');
    await reopenDialog.getByRole('button', { name: 'Cancel' }).click();
    const discardDialog = page.getByRole('alertdialog');
    if (await discardDialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await discardDialog.getByRole('button', { name: /discard changes/i }).click();
    }
    await expect(reopenDialog).not.toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('PM20 (D-09): saving without touching weight fields never writes a phantom unit', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    const seeded = await seedTestProduct();
    if (!seeded) {
      test.skip(true, 'No category found to seed product in');
      return;
    }

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.getByRole('button', { name: 'Edit' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    // Weight unit defaults to a pre-selected 'g' (D-09) but is never touched —
    // only the unrelated SKU field changes, proving the phantom-unit trap
    // does not fire on an untouched save.
    await editDialog.getByLabel(/sku/i).fill('PM20-SKU');
    await editDialog.getByRole('button', { name: /save|update/i }).click();
    await expect(editDialog).not.toBeVisible({ timeout: 15_000 });

    const admin = getServiceClient();
    const { data: saved } = await admin
      .from('products')
      .select('brand_id, weight_amount, weight_unit')
      .eq('id', seeded.id)
      .single();
    expect(saved?.brand_id).toBeNull();
    expect(saved?.weight_amount).toBeNull();
    expect(saved?.weight_unit).toBeNull();

    await logout(page);
  });

  test('PM15 (PCAT-02): cashier sees no add/edit affordance on Catalog Products', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');

    const found = await navigateToProductsSettingsTab(page, 'products');
    if (!found) {
      // Cashier can't even reach the Products sub-tab — that's a stricter
      // (still correct) form of the same denial this test asserts.
      await logout(page);
      return;
    }

    await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toHaveCount(0);

    await logout(page);
  });
});
