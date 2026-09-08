/**
 * E2E: POS checkout grid — brand/weight-unit secondary filters (BRND-04/05, D-12)
 *
 * ProductGrid renders two dropdown filters (brand, weight unit) directly
 * below CategoryTabs, AND-composed with the active category tab — never
 * replacing it. This file proves that composition: a same-category,
 * different-brand sibling product disappears when the brand filter is
 * applied while the active category tab stays unchanged, and separately
 * that the weight-unit dropdown narrows independently of the brand dropdown.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const PRODUCT_A = 'GridFilterProductA-E2E';
const PRODUCT_B = 'GridFilterProductB-E2E';
const BRAND_A = 'GridFilterBrandA-E2E';
const BRAND_B = 'GridFilterBrandB-E2E';

async function cleanupFixtures(): Promise<void> {
  const admin = getServiceClient();
  // Products must be deleted before their referencing brand — D-02's
  // ON DELETE RESTRICT blocks the brand delete otherwise.
  await admin.from('products').delete().in('name', [PRODUCT_A, PRODUCT_B]);
  await admin.from('brands').delete().in('name', [BRAND_A, BRAND_B]);
}

/**
 * Seeds two same-category products, each with a different brand and a
 * different weight unit (A: 0.5 kg, B: 200 g), then navigates to /pos and
 * selects the shared category tab. Returns the category name (for the
 * caller to assert the tab stays selected) plus the two card locators.
 */
async function seedAndOpenSharedCategory(page: Page): Promise<{
  categoryName: string;
  cardA: ReturnType<Page['getByRole']>;
  cardB: ReturnType<Page['getByRole']>;
}> {
  const admin = getServiceClient();

  const { data: cat, error: catErr } = await admin.from('categories').select('id, name').limit(1).single();
  if (catErr || !cat) {
    test.skip(true, 'No category found to seed products in');
    throw new Error('unreachable — test.skip throws');
  }
  const categoryId = (cat as { id: string }).id;
  const categoryName = (cat as { name: string }).name;

  const { data: brandA, error: brandAErr } = await admin
    .from('brands')
    .insert({ name: BRAND_A })
    .select('id')
    .single();
  const { data: brandB, error: brandBErr } = await admin
    .from('brands')
    .insert({ name: BRAND_B })
    .select('id')
    .single();
  if (brandAErr || !brandA || brandBErr || !brandB) {
    test.skip(true, `Could not seed filter test brands: ${brandAErr?.message ?? brandBErr?.message ?? 'no row'}`);
    throw new Error('unreachable — test.skip throws');
  }

  const { error: prodAErr } = await admin.from('products').insert({
    name: PRODUCT_A,
    category_id: categoryId,
    base_price: 4.99,
    is_active: true,
    brand_id: (brandA as { id: string }).id,
    weight_amount: 0.5,
    weight_unit: 'kg',
  });
  const { error: prodBErr } = await admin.from('products').insert({
    name: PRODUCT_B,
    category_id: categoryId,
    base_price: 4.99,
    is_active: true,
    brand_id: (brandB as { id: string }).id,
    weight_amount: 200,
    weight_unit: 'g',
  });
  if (prodAErr || prodBErr) {
    throw new Error(`Could not seed filter test products: ${prodAErr?.message ?? prodBErr?.message}`);
  }

  const categoryTab = page.getByRole('tab', { name: `Filter by ${categoryName}` });
  await categoryTab.click();
  await expect(categoryTab).toHaveAttribute('aria-selected', 'true');

  const cardA = page.getByRole('button', { name: new RegExp(`select ${PRODUCT_A}`, 'i') });
  const cardB = page.getByRole('button', { name: new RegExp(`select ${PRODUCT_B}`, 'i') });
  await expect(cardA).toBeVisible({ timeout: 10_000 });
  await expect(cardB).toBeVisible({ timeout: 10_000 });

  return { categoryName, cardA, cardB };
}

test.describe('POS checkout grid — brand/weight-unit filters', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await cleanupFixtures();
    await openCaja(500);
    await loginAs(page, 'cashier');
    await page.goto('/pos');
  });

  test.afterEach(async () => {
    await cleanupFixtures().catch(() => undefined);
  });

  test('brand filter narrows within the active category, category tab stays selected (AND-composition, D-12)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { categoryName, cardA, cardB } = await seedAndOpenSharedCategory(page);
    const categoryTab = page.getByRole('tab', { name: `Filter by ${categoryName}` });

    await page.getByLabel(/filter by brand/i).selectOption({ label: BRAND_A });
    await expect(cardA).toBeVisible({ timeout: 10_000 });
    await expect(cardB).toHaveCount(0);
    await expect(categoryTab).toHaveAttribute('aria-selected', 'true');
  });

  test('weight-unit filter narrows independently of the brand filter', async ({ page }) => {
    test.setTimeout(90_000);
    const { cardA, cardB } = await seedAndOpenSharedCategory(page);

    // Brand filter left on "All brands" — only the weight-unit dropdown drives this assertion.
    await page.getByLabel(/filter by weight unit/i).selectOption('kg');
    await expect(cardA).toBeVisible({ timeout: 10_000 });
    await expect(cardB).toHaveCount(0);

    await page.getByLabel(/filter by weight unit/i).selectOption('g');
    await expect(cardA).toHaveCount(0);
    await expect(cardB).toBeVisible({ timeout: 10_000 });
  });
});
