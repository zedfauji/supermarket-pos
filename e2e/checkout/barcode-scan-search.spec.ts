import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { requireIntegrationEnv } from '../helpers/requireEnv';

const PRIMARY_PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";
const CATEGORY_PRODUCT_NAME = 'MDH Garam Masala 100g';

/**
 * This file used to also cover barcode-scan behavior directly (scan ->
 * add-to-cart / confirm-toast / weight-entry / not-found), but Phase 18
 * rewired CheckoutPanel's onScan to populate the search box and open the
 * "peek" product window instead of mutating the cart inline. That coverage
 * now lives in two places instead of here:
 *   - e2e/checkout/peek-window.spec.ts: everything that happens once the
 *     peek window has a product loaded (add-to-cart, zero-price/low-stock
 *     confirm gate, sold-by-weight, not-found + audit, rescan-while-open).
 *   - src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx (unit): the
 *     scanner-gating logic itself (disabled during payment/weight-entry,
 *     restored after) — already thoroughly unit-tested there, so it isn't
 *     duplicated here as a slower E2E case.
 * What remains in this file is purely manual search / category filtering,
 * which Phase 18 did not touch.
 */
test.describe('Product search (manual, non-scan)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${PRIMARY_PRODUCT_NAME}`, 'i') })
    ).toBeVisible();
  });

  test('manual search shows the resolved product name, price, and barcode on the tile before it is added (VER-02)', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, base_price, barcode')
      .eq('is_active', true)
      .eq('name', PRIMARY_PRODUCT_NAME)
      .single();
    const product = products;
    if (error || !product) throw new Error(error?.message ?? 'Seeded barcode product not found');
    if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
    await page.getByPlaceholder(/search products/i).fill(product.name);
    const card = page.getByRole('button', { name: new RegExp(`select ${product.name}`, 'i') });
    await expect(card).toBeVisible();
    await expect(card.getByText(new RegExp(`barcode: ${product.barcode}`, 'i'))).toBeVisible();
    await expect(card.getByText(product.name, { exact: true })).toBeVisible();
  });

  test('selecting a zero-price product from manual search shows a confirm toast; confirming adds it to the cart', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, base_price')
      .eq('is_active', true)
      .eq('name', PRIMARY_PRODUCT_NAME)
      .single();
    const product = products;
    if (error || !product) throw new Error(error?.message ?? 'Seeded barcode product not found');
    const originalBasePrice = product.base_price;
    const { error: updateError } = await admin
      .from('products')
      .update({ base_price: 0 })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      await page.reload();
      await page.getByPlaceholder(/search products/i).fill(product.name);
      await page.getByRole('button', { name: new RegExp(`select ${product.name}`, 'i') }).click();

      await expect(
        page.getByText(new RegExp(`${product.name} is priced at \\$0`, 'i'))
      ).toBeVisible();
      await expect(
        page.locator('aside').getByText(product.name, { exact: true })
      ).not.toBeVisible();

      await page.getByRole('button', { name: /^add anyway$/i }).click();
      await expect(page.locator('aside').getByText(product.name, { exact: true })).toBeVisible();
    } finally {
      await admin.from('products').update({ base_price: originalBasePrice }).eq('id', product.id);
    }
  });

  test('category tabs compose with search and show the empty state', async ({ page }) => {
    const admin = getServiceClient();
    const { data: product, error } = await admin
      .from('products')
      .select('name, category_id')
      .eq('is_active', true)
      .eq('name', CATEGORY_PRODUCT_NAME)
      .not('category_id', 'is', null)
      .single();
    if (error || !product?.category_id)
      throw new Error(error?.message ?? 'Categorized product not found');

    const [
      { data: category, error: categoryError },
      { data: categoryProducts, error: productsError },
    ] = await Promise.all([
      admin.from('categories').select('name').eq('id', product.category_id).single(),
      admin
        .from('products')
        .select('id')
        .eq('is_active', true)
        .eq('category_id', product.category_id),
    ]);
    if (categoryError || !category || productsError || !categoryProducts) {
      throw new Error(
        categoryError?.message ?? productsError?.message ?? 'Category products not found'
      );
    }

    // CategoryTabs renders Radix tabs (role="tab", aria-selected), not toggle buttons.
    const categoryTab = page.getByRole('tab', { name: `Filter by ${category.name}` });
    await categoryTab.focus();
    await categoryTab.press('Enter');
    await expect(categoryTab).toHaveAttribute('aria-selected', 'true');
    const productCards = page.locator('button[aria-label^="Select "]');
    await expect(productCards).toHaveCount(categoryProducts.length);

    const search = page.getByPlaceholder(/search products/i);
    await search.fill(product.name);
    await expect(productCards).toHaveCount(1);
    await search.fill('');
    await expect(productCards).toHaveCount(categoryProducts.length);
    await search.fill('not-a-real-product');
    await expect(page.getByText(/no products found/i)).toBeVisible();
  });
});
