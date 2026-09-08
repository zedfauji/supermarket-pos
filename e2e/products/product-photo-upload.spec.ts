/**
 * E2E: Product photo upload (Phase 31, Plan 01 — PCAT-03 tracer slice)
 *
 * Proves the whole product-photo architecture end to end on one path: a
 * private Supabase Storage bucket with RLS-gated writes, a photo_path
 * column, a client-side resize pipeline, a signed-URL resolver, and the
 * Photo panel mounted in today's product edit dialog.
 */
import type { Locator, Page } from '@playwright/test';
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
 * Navigates to Settings > Products, searches for TEST_PRODUCT, and opens its
 * edit dialog. Returns null when the UI isn't reachable (caller should
 * test.skip) so every test shares one "is this even rendered" guard.
 */
async function openEditDialogForTestProduct(page: Page) {
  const found = await navigateToProductsSettingsTab(page);
  if (!found) return null;

  await page.getByPlaceholder('Search products…').fill(TEST_PRODUCT);
  const prodRow = page.getByRole('row', { name: new RegExp(TEST_PRODUCT) });
  await expect(prodRow).toBeVisible({ timeout: 10_000 });

  await prodRow.getByRole('button', { name: /edit/i }).click();
  // Scoped by name: the persistent AI Assistant panel is also role="dialog"
  // and would otherwise make this locator ambiguous.
  const dialog = page.getByRole('dialog', { name: 'Edit product' });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // Phase 31 Plan 02 reshape: ProductPhotoTab now lives behind the Photo
  // rail trigger instead of being mounted directly under the form.
  await dialog.getByRole('tab', { name: /photo/i }).click();
  return dialog;
}

/**
 * Generates a real, decodable PNG in-page (createImageBitmap needs genuine
 * bytes — an arbitrary Buffer would fail resizePhoto's decode step) and
 * injects it through the real <input type="file"> via DataTransfer + a
 * native 'change' event — mirroring e2e/ai/agent-chat.spec.ts's drop-event
 * precedent, adapted for a file input instead of a drop zone. `mimeType`
 * overrides only the File's declared type (bytes stay real PNG), letting a
 * caller simulate a mislabeled/unsupported-type upload without needing real
 * bytes of that format — validatePhotoFile rejects on the declared type
 * before any decode is attempted.
 */
async function injectGeneratedPhoto(
  page: Page,
  testId: string,
  width: number,
  height: number,
  mimeType = 'image/png'
): Promise<void> {
  await page.evaluate(
    async ({ testId, width, height, mimeType }) => {
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
      const file = new File([blob], 'e2e-photo.png', { type: mimeType });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const input = document.querySelector(`[data-testid="${testId}"]`);
      if (!input) throw new Error(`input [data-testid="${testId}"] not found`);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { testId, width, height, mimeType }
  );
}

/**
 * Builds a real, decodable PNG in-page and returns a `DataTransfer` handle
 * carrying it — the same `page.evaluateHandle` + native-event-constructor
 * technique `e2e/ai/agent-chat.spec.ts`'s `dropFileOntoAgent` established for
 * FileDropZone, reused here for both the drop and paste entry paths so
 * Playwright wires the cross-context handle into its own event dispatch
 * rather than a manually `new`'d DragEvent/ClipboardEvent (which Chromium's
 * headless drag/clipboard sandboxing can silently drop). `mimeType` overrides
 * only the File's declared type (bytes stay real PNG), letting a caller
 * simulate an unsupported-type drop without needing real bytes of that
 * format.
 */
async function makeImageDataTransfer(page: Page, width: number, height: number, mimeType = 'image/png') {
  return page.evaluateHandle(
    async ({ width, height, mimeType }) => {
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
      const file = new File([blob], 'e2e-photo.png', { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt;
    },
    { width, height, mimeType }
  );
}

/** Dispatches a native 'drop' DragEvent carrying a generated image onto `target`. */
async function dropImageOnto(
  page: Page,
  target: Locator,
  width: number,
  height: number,
  mimeType = 'image/png'
): Promise<void> {
  const dataTransfer = await makeImageDataTransfer(page, width, height, mimeType);
  await target.dispatchEvent('drop', { dataTransfer });
}

/**
 * Dispatches a native 'paste' ClipboardEvent carrying a generated image onto
 * `target` — proves the clipboard entry path (D-09) independently of
 * drag-and-drop. Built and dispatched entirely inside `target.evaluate` (no
 * cross-context Playwright event-type mapping) — Playwright's `dispatchEvent`
 * helper does not recognize 'paste' as a `ClipboardEvent`-producing type the
 * way it does 'drop' for `DragEvent`, so the `clipboardData` init property
 * would otherwise be silently dropped.
 */
async function pasteImageOnto(target: Locator, width: number, height: number): Promise<void> {
  await target.evaluate(async (el, { width, height }) => {
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
    const file = new File([blob], 'e2e-paste-photo.png', { type: 'image/png' });
    const clipboardData = new DataTransfer();
    clipboardData.items.add(file);
    const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData });
    el.dispatchEvent(pasteEvent);
  }, { width, height });
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

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

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

  test('link failure: an intercepted PATCH leaves photo_path unchanged and shows the errorLink copy', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    // Storage upload succeeds; only the products-row PATCH (the "link" step)
    // fails — proves the Pitfall 6 partial-failure branch.
    await page.route('**/rest/v1/products*', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'simulated link failure' }),
        });
      } else {
        await route.continue();
      }
    });

    await injectGeneratedPhoto(page, 'product-photo-file-input', 1600, 900);

    await expect(dialog.getByRole('alert').filter({ hasText: /couldn.t be linked/i })).toBeVisible({
      timeout: 20_000,
    });

    const admin = getServiceClient();
    const { data: row } = await admin
      .from('products')
      .select('photo_path')
      .eq('id', productId)
      .single();
    expect(row.photo_path).toBeNull();

    await logout(page);
  });

  test('unsupported type: the inline alert names the offending declared type', async ({ page }) => {
    test.setTimeout(60_000);
    await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await injectGeneratedPhoto(page, 'product-photo-file-input', 800, 600, 'image/gif');

    await expect(dialog.getByRole('alert').filter({ hasText: /image\/gif/i })).toBeVisible({
      timeout: 10_000,
    });

    await logout(page);
  });

  test('double upload: the second upload writes a new object path and exactly one object remains under the product prefix', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    const admin = getServiceClient();

    await injectGeneratedPhoto(page, 'product-photo-file-input', 1600, 900);
    await expect(dialog.getByTestId('product-photo-preview')).toBeVisible({ timeout: 20_000 });
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
    const { data: firstRow } = await admin
      .from('products')
      .select('photo_path')
      .eq('id', productId)
      .single();
    const firstPath = firstRow.photo_path as string;

    // No Replace button in this plan — clicking the populated preview
    // re-opens the picker (see ProductPhotoTab's dropzone click handler).
    // injectGeneratedPhoto targets the input directly, so a second call is
    // all that's needed to drive the replace path.
    await injectGeneratedPhoto(page, 'product-photo-file-input', 1300, 1300);
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
      .not.toBe(firstPath);

    const { data: secondRow } = await admin
      .from('products')
      .select('photo_path')
      .eq('id', productId)
      .single();
    const secondPath = secondRow.photo_path as string;
    expect(secondPath).not.toBe(firstPath);

    const { data: objects } = await admin.storage.from(BUCKET).list(`products/${productId}`);
    expect(objects?.length).toBe(1);

    await logout(page);
  });

  test('drop: dropping an image onto the drop zone uploads it (D-09)', async ({ page }) => {
    test.setTimeout(90_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await dropImageOnto(page, dialog.getByTestId('product-photo-dropzone'), 1600, 900);
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

    await logout(page);
  });

  test('paste: pasting on the Photo tab uploads it; pasting on the Details tab does not (D-09)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    let storageRequests = 0;
    await page.route('**/storage/v1/object/**', async route => {
      storageRequests += 1;
      await route.continue();
    });

    await pasteImageOnto(dialog, 1600, 900);
    await expect(dialog.getByTestId('product-photo-preview')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => storageRequests, { timeout: 20_000 }).toBeGreaterThan(0);
    const requestsAfterPhotoTabPaste = storageRequests;

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

    // Negative case: a paste on the Details tab must never be intercepted —
    // the dialog-level listener is gated on the controlled activeTab.
    await dialog.getByRole('tab', { name: /details/i }).click();
    const nameInput = dialog.getByRole('textbox', { name: /^Name/i });
    await nameInput.click();
    await pasteImageOnto(nameInput, 400, 300);

    // No new Storage request should ever fire from the Details-tab paste —
    // give the (incorrect) pipeline a moment it would need to reach Storage,
    // then assert the count never moved.
    await page.waitForTimeout(500);
    expect(storageRequests).toBe(requestsAfterPhotoTabPaste);

    await logout(page);
  });

  test('replace: the second photo writes a new object key and the old object is gone from the bucket (D-12 discretion)', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    const admin = getServiceClient();

    await injectGeneratedPhoto(page, 'product-photo-file-input', 1600, 900);
    await expect(dialog.getByTestId('product-photo-preview')).toBeVisible({ timeout: 20_000 });
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
    const { data: firstRow } = await admin
      .from('products')
      .select('photo_path')
      .eq('id', productId)
      .single();
    const firstPath = firstRow.photo_path as string;

    await expect(dialog.getByTestId('product-photo-replace')).toBeVisible();
    await injectGeneratedPhoto(page, 'product-photo-file-input', 1300, 1300);

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
      .not.toBe(firstPath);

    const { data: secondRow } = await admin
      .from('products')
      .select('photo_path')
      .eq('id', productId)
      .single();
    const secondPath = secondRow.photo_path as string;
    expect(secondPath).not.toBe(firstPath);

    const { data: objects } = await admin.storage.from(BUCKET).list(`products/${productId}`);
    expect(objects?.length).toBe(1);
    expect(objects?.[0]?.name).not.toBe(firstPath.split('/').pop());

    // The old object is genuinely gone, not just unreferenced — a download
    // attempt errors when the object no longer exists.
    const { error: downloadOldError } = await admin.storage.from(BUCKET).download(firstPath);
    expect(downloadOldError).not.toBeNull();

    await logout(page);
  });

  test('remove: cancel keeps the photo; confirm clears the column and deletes the object (D-12)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    const admin = getServiceClient();

    await injectGeneratedPhoto(page, 'product-photo-file-input', 1600, 900);
    await expect(dialog.getByTestId('product-photo-preview')).toBeVisible({ timeout: 20_000 });
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

    await dialog.getByTestId('product-photo-remove').click();
    const confirmDialog = page.getByRole('alertdialog', { name: /remove the photo/i });
    await expect(confirmDialog).toBeVisible();

    // Cancel: the photo must still be there.
    await confirmDialog.getByRole('button', { name: /keep photo/i }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(dialog.getByTestId('product-photo-preview')).toBeVisible();

    // Confirm: the panel returns to the empty drop-zone state, the column is
    // cleared, and the object is deleted from the bucket.
    await dialog.getByTestId('product-photo-remove').click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /^remove photo$/i }).click();

    await expect(dialog.getByTestId('product-photo-preview')).toBeHidden({ timeout: 20_000 });
    await expect(dialog.getByTestId('product-photo-dropzone')).toBeVisible();

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
      .toBeNull();

    const { data: objects } = await admin.storage.from(BUCKET).list(`products/${productId}`);
    expect(objects?.length ?? 0).toBe(0);

    await logout(page);
  });

  test('unsupported type on drop: inline alert names the offending declared type, no object created (D-11)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const productId = await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    await dropImageOnto(page, dialog.getByTestId('product-photo-dropzone'), 800, 600, 'image/gif');

    await expect(dialog.getByRole('alert').filter({ hasText: /image\/gif/i })).toBeVisible({
      timeout: 10_000,
    });

    const admin = getServiceClient();
    const { data: objects } = await admin.storage.from(BUCKET).list(`products/${productId}`);
    expect(objects?.length ?? 0).toBe(0);

    await logout(page);
  });

  test('offline: upload is blocked before any file read, with no request reaching the Storage endpoint', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await seedTestProduct();
    await loginAs(page, 'admin');

    const dialog = await openEditDialogForTestProduct(page);
    if (!dialog) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: Settings > Products not rendered');
      return;
    }

    let storageRequestSeen = false;
    await page.route('**/storage/v1/object/**', async route => {
      storageRequestSeen = true;
      await route.continue();
    });

    await page.context().setOffline(true);
    try {
      await injectGeneratedPhoto(page, 'product-photo-file-input', 800, 600);

      await expect(dialog.getByRole('alert').filter({ hasText: /offline/i })).toBeVisible({
        timeout: 10_000,
      });
      expect(storageRequestSeen).toBe(false);
    } finally {
      await page.context().setOffline(false);
    }
  });
});
