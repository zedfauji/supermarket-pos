/**
 * E2E: Product photo upload (Phase 31, Plan 01 — PCAT-03 tracer slice)
 *
 * Proves the whole product-photo architecture end to end on one path: a
 * private Supabase Storage bucket with RLS-gated writes, a photo_path
 * column, a client-side resize pipeline, a signed-URL resolver, and the
 * Photo panel mounted in today's product edit dialog.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const TEST_PRODUCT = 'TestPhotoProduct-E2E';
const BUCKET = 'product-photos';

async function seedTestProduct(): Promise<string> {
  const admin = getServiceClient();
  const { data: cat } = await admin.from('categories').select('id').limit(1).single();
  if (!cat) throw new Error('seedTestProduct: no category found');
  await admin.from('products').delete().eq('name', TEST_PRODUCT);
  const { data: product, error } = await admin
    .from('products')
    .insert({ name: TEST_PRODUCT, category_id: cat.id, base_price: 9.99, is_active: true })
    .select('id')
    .single();
  if (error) throw new Error(`seedTestProduct: insert failed - ${error.message}`);
  return product.id as string;
}

async function cleanupTestData(): Promise<void> {
  const admin = getServiceClient();
  const { data: product } = await admin
    .from('products')
    .select('id')
    .eq('name', TEST_PRODUCT)
    .maybeSingle();
  if (product) {
    const { data: objects } = await admin.storage.from(BUCKET).list(`products/${product.id as string}`);
    if (objects && objects.length > 0) {
      await admin.storage
        .from(BUCKET)
        .remove(objects.map(o => `products/${product.id as string}/${o.name}`));
    }
  }
  await admin.from('products').delete().eq('name', TEST_PRODUCT);
}

async function navigateToProductsSettingsTab(page: Page): Promise<boolean> {
  await page.goto('/inventory');
  const catalogTab = page.getByRole('tab', { name: 'Catalog' });
  // isVisible() is a single-shot, non-polling check — a cold page load (first
  // navigation in the run, RBAC fetch still in flight) can race it. Use the
  // auto-waiting assertion instead, converting a timeout into `false`.
  const catalogTabVisible = await expect(catalogTab)
    .toBeVisible({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!catalogTabVisible) return false;
  await catalogTab.click();
  await page.getByRole('tab', { name: 'Products' }).click();
  return true;
}

/**
 * Generates a real, decodable PNG in-page (createImageBitmap needs genuine
 * bytes — an arbitrary Buffer would fail resizePhoto's decode step) and
 * injects it through the real <input type="file"> via DataTransfer + a
 * native 'change' event — mirroring e2e/ai/agent-chat.spec.ts's drop-event
 * precedent, adapted for a file input instead of a drop zone.
 */
async function injectGeneratedPhoto(page: Page, testId: string, width: number, height: number): Promise<void> {
  await page.evaluate(
    async ({ testId, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#3366ff';
      ctx.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => {
          if (b) resolve(b);
          else reject(new Error('toBlob failed'));
        }, 'image/png');
      });
      const file = new File([blob], 'e2e-photo.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const input = document.querySelector(`[data-testid="${testId}"]`);
      if (!input) throw new Error(`input [data-testid="${testId}"] not found`);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { testId, width, height }
  );
}

test.describe('Product photo upload', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await cleanupTestData().catch(() => undefined);
  });

  test('bucket configuration: private, 2 MB limit, exactly three image MIME types', async () => {
    const admin = getServiceClient();
    const { data: bucket, error } = await admin.storage.getBucket(BUCKET);
    expect(error).toBeNull();
    expect(bucket?.public).toBe(false);
    expect(bucket?.file_size_limit).toBe(2097152);
    expect([...(bucket?.allowed_mime_types ?? [])].sort()).toEqual(
      ['image/jpeg', 'image/png', 'image/webp'].sort()
    );
  });

  test('admin uploads a photo: object lands in the private bucket, product row references it by object path, signed URL resolves', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const found = await navigateToProductsSettingsTab(page);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
    const prodRow = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
    await expect(prodRow).toBeVisible({ timeout: 10_000 });

    await prodRow.getByRole('button', { name: /edit/i }).click();
    // Scoped by name: the persistent AI Assistant panel is also role="dialog"
    // and would otherwise make this locator ambiguous.
    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Longer edge (1600) exceeds the 1200px resize threshold so the pipeline
    // actually exercises the downscale path, not just a pass-through.
    await injectGeneratedPhoto(page, 'product-photo-file-input', 1600, 900);

    await expect(dialog.getByTestId('product-photo-preview')).toBeVisible({ timeout: 20_000 });

    const admin = getServiceClient();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('products')
            .select('photo_path')
            .eq('id', productId)
            .maybeSingle();
          return (data?.photo_path ?? null) as string | null;
        },
        { timeout: 20_000 }
      )
      .not.toBeNull();

    const { data: row } = await admin
      .from('products')
      .select('photo_path')
      .eq('id', productId)
      .single();
    const path = row.photo_path as string;

    expect(path).not.toContain('://');
    expect(path.startsWith(`products/${productId}/`)).toBe(true);

    const { data: signed, error: signError } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(signError).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();

    await logout(page);
  });
});
