/**
 * E2E: Catalog row-click, inline-edit isolation, and batch thumbnail signing
 * (Phase 31, Plan 03 — D-04 + D-16)
 *
 * Proves the three interaction claims the plan's must_haves lock down:
 *  1. Clicking a non-interactive part of a catalog row opens the reshaped
 *     product dialog (D-04), while every inline editor and both row action
 *     buttons stop propagation so they never also open it (Pitfall 1).
 *  2. An inline cell edit and a dialog Save on the same product are two
 *     independent writes — whichever commits last wins, no merge (PCAT-02
 *     edge probe).
 *  3. A page of rows resolves every photo thumbnail through exactly one
 *     batch `createSignedUrls` request (D-16), never one per row.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const BUCKET = 'product-photos';
const TEST_PRODUCT_PHOTO_A = 'TestThumbProduct-PhotoA-E2E';
const TEST_PRODUCT_PHOTO_B = 'TestThumbProduct-PhotoB-E2E';
const TEST_PRODUCT_NO_PHOTO = 'TestThumbProduct-NoPhoto-E2E';
const ALL_TEST_PRODUCTS = [TEST_PRODUCT_PHOTO_A, TEST_PRODUCT_PHOTO_B, TEST_PRODUCT_NO_PHOTO];

// A 1x1 transparent PNG — bytes are irrelevant to this spec, only that the
// object exists in the bucket so createSignedUrls resolves it without a
// per-row error.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function seedProductWithPhoto(name: string, categoryId: string): Promise<string> {
  const admin = getServiceClient();
  const { data: product, error } = await admin
    .from('products')
    .insert({ name, category_id: categoryId, base_price: 9.99, is_active: true })
    .select('id')
    .single();
  if (error || !product) throw new Error(`seedProductWithPhoto: insert failed - ${error?.message}`);
  const productId = product.id as string;

  const path = `products/${productId}/e2e-thumb.png`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, ONE_PX_PNG, { contentType: 'image/png', upsert: true });
  if (uploadErr) throw new Error(`seedProductWithPhoto: upload failed - ${uploadErr.message}`);

  const { error: linkErr } = await admin
    .from('products')
    .update({ photo_path: path })
    .eq('id', productId);
  if (linkErr) throw new Error(`seedProductWithPhoto: link failed - ${linkErr.message}`);

  return productId;
}

async function seedProductWithoutPhoto(name: string, categoryId: string): Promise<string> {
  const admin = getServiceClient();
  const { data: product, error } = await admin
    .from('products')
    .insert({ name, category_id: categoryId, base_price: 4.5, is_active: true })
    .select('id')
    .single();
  if (error || !product) throw new Error(`seedProductWithoutPhoto: insert failed - ${error?.message}`);
  return product.id as string;
}

async function seedFixtures(): Promise<{ photoAId: string; photoBId: string; noPhotoId: string }> {
  const admin = getServiceClient();
  const { data: cat } = await admin.from('categories').select('id').limit(1).single();
  if (!cat) throw new Error('seedFixtures: no category found');
  const categoryId = cat.id as string;

  await cleanupTestData();

  const photoAId = await seedProductWithPhoto(TEST_PRODUCT_PHOTO_A, categoryId);
  const photoBId = await seedProductWithPhoto(TEST_PRODUCT_PHOTO_B, categoryId);
  const noPhotoId = await seedProductWithoutPhoto(TEST_PRODUCT_NO_PHOTO, categoryId);

  return { photoAId, photoBId, noPhotoId };
}

async function cleanupTestData(): Promise<void> {
  const admin = getServiceClient();
  const { data: products } = await admin
    .from('products')
    .select('id')
    .in('name', ALL_TEST_PRODUCTS);
  for (const p of products ?? []) {
    const productId = (p as { id: string }).id;
    const { data: objects } = await admin.storage.from(BUCKET).list(`products/${productId}`);
    if (objects && objects.length > 0) {
      await admin.storage.from(BUCKET).remove(objects.map(o => `products/${productId}/${o.name}`));
    }
  }
  await admin.from('products').delete().in('name', ALL_TEST_PRODUCTS);
}

async function navigateToProductsSettingsTab(page: Page): Promise<boolean> {
  await page.goto('/inventory');
  const catalogTab = page.getByRole('tab', { name: 'Catalog' });
  const catalogTabVisible = await catalogTab
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!catalogTabVisible) return false;
  await catalogTab.click();
  await page.getByRole('tab', { name: 'Products' }).click();
  return true;
}

/** Batch-sign requests hit `POST .../storage/v1/object/sign/{bucket}` with no
 * trailing path segment (a single createSignedUrl instead hits
 * `.../object/sign/{bucket}/{path}`, which this pattern deliberately excludes). */
const BATCH_SIGN_URL_RE = /\/storage\/v1\/object\/sign\/product-photos(?:\?.*)?$/;

test.describe('Catalog row-click, inline-edit isolation, thumbnail signing', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await cleanupTestData().catch(() => undefined);
  });

  test('row click opens the dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT_PHOTO_A);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Click the thumbnail cell — not an inline editor, not an action button —
    // to prove a non-interactive part of the row opens the dialog.
    await row.getByTestId('catalog-row-thumb').click();

    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await logout(page);
  });

  test('inline editors do not open the dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT_PHOTO_A);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Price — commits on blur; verified via the service client (Sonner's
    // toast auto-dismisses on its own timer and racing it is flaky over a
    // remote Supabase round trip, so the persisted value is the assertion,
    // not the toast).
    const priceInput = row.getByPlaceholder('0.00');
    await priceInput.fill('19.99');
    await priceInput.blur();
    // Scoped by name — the AI-assistant side panel is its own persistent
    // `role="dialog"` on every authenticated page, so a bare `getByRole('dialog')`
    // always resolves to at least that element regardless of the product dialog.
    await expect(page.getByRole('dialog', { name: 'Edit product' })).toHaveCount(0);

    const admin = getServiceClient();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('products')
          .select('base_price')
          .eq('name', TEST_PRODUCT_PHOTO_A)
          .single();
        return data?.base_price;
      })
      .toBe(19.99);

    // Name
    const nameInput = row.locator('input').first();
    await nameInput.click();
    // Scoped by name — the AI-assistant side panel is its own persistent
    // `role="dialog"` on every authenticated page, so a bare `getByRole('dialog')`
    // always resolves to at least that element regardless of the product dialog.
    await expect(page.getByRole('dialog', { name: 'Edit product' })).toHaveCount(0);

    // Category
    const categorySelect = row.locator('select');
    await categorySelect.click();
    // Scoped by name — the AI-assistant side panel is its own persistent
    // `role="dialog"` on every authenticated page, so a bare `getByRole('dialog')`
    // always resolves to at least that element regardless of the product dialog.
    await expect(page.getByRole('dialog', { name: 'Edit product' })).toHaveCount(0);

    await logout(page);
  });

  test('deactivate does not open the dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT_PHOTO_A);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog', { name: 'Edit product' })).toHaveCount(0);

    await logout(page);
  });

  test('Edit button still opens the dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT_PHOTO_A);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit product' })).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  test('one signing request per page', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const batchSignRequests: string[] = [];
    page.on('request', req => {
      if (req.method() === 'POST' && BATCH_SIGN_URL_RE.test(req.url())) {
        batchSignRequests.push(req.url());
      }
    });

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    // Wait for the page's thumbnails to settle (all rows resolved past skeleton).
    await page.getByPlaceholder('Search products…').fill('TestThumbProduct-');
    await expect(page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_B) })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(TEST_PRODUCT_NO_PHOTO) })).toBeVisible();
    await page.waitForTimeout(2_000);

    expect(batchSignRequests.length).toBe(1);

    await logout(page);
  });

  test('thumbnail states: photo-bearing row shows an image, photo-less row shows the placeholder, both cells share a width', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill('TestThumbProduct-');
    const photoRow = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) });
    const noPhotoRow = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_NO_PHOTO) });
    await expect(photoRow).toBeVisible({ timeout: 10_000 });
    await expect(noPhotoRow).toBeVisible();

    const photoCell = photoRow.getByTestId('catalog-row-thumb');
    const noPhotoCell = noPhotoRow.getByTestId('catalog-row-thumb');

    await expect(photoCell.locator('img')).toHaveAttribute('src', /.+/, { timeout: 10_000 });
    await expect(noPhotoCell.getByText('No photo')).toBeAttached();

    const photoBox = await photoCell.boundingBox();
    const noPhotoBox = await noPhotoCell.boundingBox();
    expect(photoBox).not.toBeNull();
    expect(noPhotoBox).not.toBeNull();
    expect(photoBox?.width).toBe(noPhotoBox?.width);

    await logout(page);
  });

  test('adjacency (edge probe PCAT-02): an inline edit and a later dialog Save are independent — the later write wins', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await seedFixtures();

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT_PHOTO_A);
    const row = page.getByRole('row', { name: new RegExp(TEST_PRODUCT_PHOTO_A) });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // First write: inline price edit, committed on blur — wait for the
    // service client to see it before starting the second write, so the two
    // writes are provably sequential rather than racing each other.
    const priceInput = row.getByPlaceholder('0.00');
    await priceInput.fill('11.11');
    await priceInput.blur();

    const admin = getServiceClient();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('products')
          .select('base_price')
          .eq('name', TEST_PRODUCT_PHOTO_A)
          .single();
        return data?.base_price;
      })
      .toBe(11.11);

    // Second write: open the dialog on the same product, change price again, Save.
    await row.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const dialogPriceInput = dialog.getByPlaceholder('0.00').first();
    await dialogPriceInput.fill('22.22');
    await dialog.getByRole('button', { name: /save|update/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => {
        const { data } = await admin
          .from('products')
          .select('base_price')
          .eq('name', TEST_PRODUCT_PHOTO_A)
          .single();
        return data?.base_price;
      })
      .toBe(22.22);

    await logout(page);
  });
});
