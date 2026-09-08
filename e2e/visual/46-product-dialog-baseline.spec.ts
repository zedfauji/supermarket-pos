/**
 * e2e/visual/46-product-dialog-baseline.spec.ts
 *
 * Phase 31 Plan 05 — wires the four UI-contract backstops from
 * 31-UI-SPEC.md's "UI Considerations" section (catalog long-name row · Details
 * tab with a long name/category · rail descriptions at 1280x800 · Photo tab
 * offline-error state) to a visual-regression baseline, each paired with a
 * deterministic measurement so a failure says which of the two broke. Also
 * captures the two recommended-but-not-gated dialog states (Photo tab empty
 * and populated).
 *
 * Mirrors 45-visual-baseline.spec.ts's structure, auth flow, and
 * `waitForPageReady` stabilisation helper rather than inventing a new
 * convention. Run in isolation via `npm run test:e2e:visual`
 * (playwright.visual.config.ts — headless, no slowMo).
 *
 * NOTE on baseline image storage: `.gitignore` has a project-wide rule
 * (`e2e/visual/**\/*-snapshots/`) excluding every visual-regression spec's
 * generated PNGs from version control — confirmed this is the established,
 * consistent convention by checking `45-visual-baseline.spec.ts-snapshots/`
 * (also untracked). Baselines are local, regenerated-on-first-run artifacts
 * per machine, not committed alongside the spec — this spec follows that
 * same precedent rather than introducing a one-off exception.
 *
 * NOTE on the catalog table's search box: `CatalogProductsTab`'s
 * `DataTable searchable` global filter does not actually narrow the row set
 * (its columns have no `accessorFn`/`accessorKey`, so TanStack Table's
 * default global-filter predicate has no value to match against — confirmed
 * empirically during this plan's own fixture work: an unmatchable search
 * string does not hide a non-matching row). This is a pre-existing,
 * out-of-scope defect (not caused by this plan's files) — logged here and in
 * 31-05-SUMMARY.md rather than fixed. This spec routes around it by locating
 * rows directly via `getByRole('row', { name })` (all rows are always
 * rendered — there is no pagination either) instead of relying on the search
 * box, and by screenshotting individual rows rather than the whole table so
 * the baseline stays deterministic regardless of total catalog row count.
 *
 * Also found and fixed a real, plan-blocking bug while seeding this spec's
 * own fixtures (see 31-05-SUMMARY.md Deviations): `ProductSchema.name` and
 * `CategorySchema.name` were capped tighter than their live DB columns
 * (VARCHAR(255)/VARCHAR(100)), and `useProductsForManagement`/`useCategories`
 * abort their ENTIRE fetch on the first row that fails to map — a DB-legal
 * long name crashed the whole Catalog page for every user, not just its own
 * row. Fixed in `src/shared/lib/domain.ts` (separate commit).
 */
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LONG_NAME = 'W'.repeat(120);
const LONG_CATEGORY_NAME = 'Q'.repeat(60);
const PHOTO_PRODUCT_NAME = 'E2E Visual Photo Product';
const NOPHOTO_PRODUCT_NAME = 'E2E Visual NoPhoto Product';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Box = { x: number; y: number; width: number; height: number };

/** Playwright's `boundingBox()` types as nullable (element could be detached
 * mid-call); every call site here has already asserted the element visible,
 * so a null result is a genuine failure worth a clear message rather than a
 * `!` assertion. */
function requireBox(box: Box | null): Box {
  if (!box) throw new Error('boundingBox() returned null — element not visible or not attached');
  return box;
}

async function seedFixtures(): Promise<void> {
  const admin = getServiceClient();
  const { data: defaultCat } = await admin.from('categories').select('id').limit(1).single();
  if (!defaultCat) throw new Error('seedFixtures: no category found');

  await admin.from('products').delete().eq('name', LONG_NAME);
  await admin.from('products').delete().in('name', [PHOTO_PRODUCT_NAME, NOPHOTO_PRODUCT_NAME]);
  await admin.from('categories').delete().eq('name', LONG_CATEGORY_NAME);

  const { data: longCategory, error: catError } = await admin
    .from('categories')
    .insert({ name: LONG_CATEGORY_NAME, color: '#6B7280', sort_order: 999 })
    .select('id')
    .single();
  if (catError) throw new Error(`seedFixtures: category insert failed - ${catError.message}`);

  const { error: longNameError } = await admin
    .from('products')
    .insert({ name: LONG_NAME, category_id: longCategory.id, base_price: 9.99, is_active: true });
  if (longNameError) throw new Error(`seedFixtures: long-name product insert failed - ${longNameError.message}`);

  const { error: photoProductError } = await admin
    .from('products')
    .insert({ name: PHOTO_PRODUCT_NAME, category_id: defaultCat.id, base_price: 5, is_active: true });
  if (photoProductError) throw new Error(`seedFixtures: photo product insert failed - ${photoProductError.message}`);

  const { error: noPhotoProductError } = await admin
    .from('products')
    .insert({ name: NOPHOTO_PRODUCT_NAME, category_id: defaultCat.id, base_price: 5, is_active: true });
  if (noPhotoProductError)
    throw new Error(`seedFixtures: no-photo product insert failed - ${noPhotoProductError.message}`);
}

async function cleanupFixtures(): Promise<void> {
  const admin = getServiceClient();
  const { data: photoProduct } = await admin
    .from('products')
    .select('id')
    .eq('name', PHOTO_PRODUCT_NAME)
    .maybeSingle();
  if (photoProduct) {
    const { data: objects } = await admin.storage
      .from('product-photos')
      .list(`products/${photoProduct.id as string}`);
    if (objects && objects.length > 0) {
      await admin.storage
        .from('product-photos')
        .remove(objects.map(o => `products/${photoProduct.id as string}/${o.name}`));
    }
  }
  await admin.from('products').delete().eq('name', LONG_NAME);
  await admin.from('products').delete().in('name', [PHOTO_PRODUCT_NAME, NOPHOTO_PRODUCT_NAME]);
  await admin.from('categories').delete().eq('name', LONG_CATEGORY_NAME);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toastMask(page: Page): Locator {
  return page.locator('[data-sonner-toaster]');
}

/**
 * Same polling-based stabilisation as 45-visual-baseline.spec.ts's
 * `waitForPageReady` — every route/dialog panel here is TanStack-Query-backed
 * and a screenshot taken immediately after navigation/open reliably races a
 * loading skeleton.
 */
async function waitForStable(page: Page): Promise<void> {
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  let previousLength = -1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const length = await page
      .evaluate(() => document.body.innerText.trim().length)
      .catch(() => 0);
    if (length > 0 && length === previousLength) break;
    previousLength = length;
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => document.fonts.ready);
}

async function openProductsCatalogTab(page: Page): Promise<void> {
  await gotoAuthed(page, '/inventory');
  await page.getByRole('tab', { name: 'Catalog' }).click();
  await page.getByRole('tab', { name: 'Products' }).click();
  await waitForStable(page);
}

/** Builds a real, decodable PNG in-page and injects it via the file input's
 * native `change` event — same technique as e2e/products/product-photo-upload.spec.ts
 * (Plan 01/04), reused here since a fake/undecodable byte string would fail
 * the pipeline's own decode step for the "populated" state capture. */
async function injectGeneratedPhoto(page: Page, testId: string): Promise<void> {
  await page.evaluate(async testId => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#3366ff';
    ctx.fillRect(0, 0, 800, 600);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => {
        if (b) resolve(b);
        else reject(new Error('toBlob failed'));
      }, 'image/png');
    });
    const file = new File([blob], 'e2e-visual-photo.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const input = document.querySelector(`[data-testid="${testId}"]`);
    if (!input) throw new Error(`input [data-testid="${testId}"] not found`);
    (input as HTMLInputElement).files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, testId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.serial('Product dialog visual baseline (Phase 31 Plan 05)', () => {
  test.beforeEach(() => {
    requireIntegrationEnv();
  });

  test.beforeAll(async () => {
    await resetTestState();
    await openCaja(300);
    await seedFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await resetTestState();
  });

  test('product dialog: Details tab long-text overflow, rail single-line descriptions + unclipped error suffix, Photo tab states', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginAs(page, 'admin');
    await openProductsCatalogTab(page);

    // --- Backstop 2: Details tab with a 120-char name / 60-char category ---
    const longRow = page.getByRole('row', { name: new RegExp(escapeRegex(LONG_NAME)) });
    await expect(longRow).toBeVisible({ timeout: 10_000 });
    await longRow.click();

    const dialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await waitForStable(page);

    // The tab panel (`min-h-0 overflow-y-auto` in ProductDetailDialog.tsx) is
    // the ONLY scroll region per D-08 — its own scrollWidth must never exceed
    // its clientWidth, proving the 120-char name / 60-char category don't
    // force horizontal overflow inside the dialog.
    const panel = dialog.locator('.overflow-y-auto').first();
    const panelScrollWidth = await panel.evaluate(el => el.scrollWidth);
    const panelClientWidth = await panel.evaluate(el => el.clientWidth);
    expect(panelScrollWidth).toBeLessThanOrEqual(panelClientWidth);

    await expect.soft(dialog).toHaveScreenshot('details-tab-long-text.png', {
      mask: [toastMask(page)],
    });

    // --- Backstop 3: rail descriptions stay on a single line at 1280x800 ---
    const railTabs = ['details', 'photo', 'links'] as const;
    for (const tabId of railTabs) {
      const trigger = dialog.getByRole('tab', { name: new RegExp(tabId, 'i') });
      const description = trigger.locator('span.text-xs.truncate');
      const box = requireBox(await description.boundingBox());
      const lineHeightPx = await description.evaluate(el => {
        const lh = getComputedStyle(el).lineHeight;
        return Number.parseFloat(lh);
      });
      // Single line: the element's own rendered height must not exceed one
      // computed line-height (a wrap onto 2+ lines would make it taller).
      expect(box.height).toBeLessThanOrEqual(lineHeightPx + 2);
    }
    await expect.soft(dialog).toHaveScreenshot('rail-descriptions.png', { mask: [toastMask(page)] });

    // Force a field error on the Details tab so its rail label carries the
    // "(has errors)" suffix, and assert that longer label text is not
    // silently ellipsis-clipped by the shared `truncate` class.
    const nameInput = dialog.getByRole('textbox', { name: /^Name/i });
    await nameInput.fill('');
    await dialog.getByRole('button', { name: /save|update/i }).click();

    const detailsTab = dialog.getByRole('tab', { name: /details/i });
    await expect(detailsTab).toHaveAccessibleName(/has errors/i, { timeout: 10_000 });

    const detailsLabel = detailsTab.locator('span.text-sm.font-medium');
    const labelScrollWidth = await detailsLabel.evaluate(el => el.scrollWidth);
    const labelClientWidth = await detailsLabel.evaluate(el => el.clientWidth);
    expect(labelScrollWidth).toBeLessThanOrEqual(labelClientWidth);

    await expect.soft(dialog).toHaveScreenshot('rail-descriptions-with-errors.png', {
      mask: [toastMask(page)],
    });

    // Restore the Name field so the dialog is no longer dirty (tab switching
    // itself is always free per D-07; only close needs this).
    await nameInput.fill(LONG_NAME);

    // --- Photo tab: empty state, then offline-error state ---
    await dialog.getByRole('tab', { name: /photo/i }).click();
    await expect(dialog.getByTestId('product-photo-dropzone')).toBeVisible();
    await expect.soft(dialog).toHaveScreenshot('photo-tab-empty.png', { mask: [toastMask(page)] });

    await page.context().setOffline(true);
    try {
      await injectGeneratedPhoto(page, 'product-photo-file-input');
      const offlineAlert = dialog.getByRole('alert').filter({ hasText: /offline/i });
      await expect(offlineAlert).toBeVisible({ timeout: 10_000 });

      // Backstop 4: the offline-error message must render fully inside the
      // dialog's bounds, not clipped past its edge.
      const alertBox = requireBox(await offlineAlert.boundingBox());
      const dialogBox = requireBox(await dialog.boundingBox());
      expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(dialogBox.y + dialogBox.height + 1);
      expect(alertBox.x).toBeGreaterThanOrEqual(dialogBox.x - 1);
      expect(alertBox.x + alertBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);

      await expect.soft(dialog).toHaveScreenshot('photo-tab-offline-error.png', {
        mask: [toastMask(page)],
      });
    } finally {
      await page.context().setOffline(false);
    }

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // --- Photo tab: populated state (recommended, not gated) — a second
    // product, uploaded online, so the catalog's later "mixed thumbnail"
    // backstop has a real resolved image to show. ---
    const photoRow = page.getByRole('row', { name: new RegExp(escapeRegex(PHOTO_PRODUCT_NAME)) });
    await expect(photoRow).toBeVisible({ timeout: 10_000 });
    await photoRow.click();
    const photoDialog = page.getByRole('dialog', { name: 'Edit product' });
    await expect(photoDialog).toBeVisible({ timeout: 10_000 });
    await photoDialog.getByRole('tab', { name: /photo/i }).click();

    await injectGeneratedPhoto(page, 'product-photo-file-input');
    await expect(photoDialog.getByTestId('product-photo-preview')).toBeVisible({ timeout: 20_000 });
    await waitForStable(page);
    await expect.soft(photoDialog).toHaveScreenshot('photo-tab-populated.png', {
      mask: [toastMask(page)],
    });

    await photoDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(photoDialog).not.toBeVisible({ timeout: 5_000 });
  });

  test('catalog: long-name row keeps the thumbnail column a fixed width, mixed thumbnail states, no page horizontal scroll', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');
    await openProductsCatalogTab(page);

    // Backstop 1a: the long name never forces the page itself to scroll
    // horizontally.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Backstop 1b: the thumbnail column's header cell stays at its
    // CSS-box-model-driven fixed width (size-10 content [40px] + px-4 cell
    // padding [32px] = 72px) — independent of any row's name length, since
    // the thumbnail cell holds no text of its own to grow the column.
    // 31-UI-SPEC.md's own figure (56px) undercounts the real px-4 padding;
    // this asserts the actual, structurally-fixed value with tolerance for
    // sub-pixel rendering rather than the incorrect literal (see
    // 31-05-SUMMARY.md Deviations).
    const headerCell = page.locator('table thead th').first();
    const headerBox = requireBox(await headerCell.boundingBox());
    expect(headerBox.width).toBeGreaterThanOrEqual(64);
    expect(headerBox.width).toBeLessThanOrEqual(80);

    const longRow = page.getByRole('row', { name: new RegExp(escapeRegex(LONG_NAME)) });
    await expect(longRow).toBeVisible({ timeout: 10_000 });
    await expect.soft(longRow).toHaveScreenshot('catalog-long-name-row.png');

    // Backstop 1c: mixed thumbnail states on the same page — a resolved
    // photo thumbnail next to a no-photo placeholder, at the identical
    // column width (fixed-size container per row, per 31-UI-SPEC.md).
    const photoRow = page.getByRole('row', { name: new RegExp(escapeRegex(PHOTO_PRODUCT_NAME)) });
    await expect(photoRow).toBeVisible({ timeout: 10_000 });
    await expect(photoRow.getByTestId('catalog-row-thumb').locator('img')).toBeVisible({
      timeout: 15_000,
    });
    await expect.soft(photoRow).toHaveScreenshot('catalog-photo-row.png');

    const noPhotoRow = page.getByRole('row', { name: new RegExp(escapeRegex(NOPHOTO_PRODUCT_NAME)) });
    await expect(noPhotoRow).toBeVisible({ timeout: 10_000 });
    await expect.soft(noPhotoRow).toHaveScreenshot('catalog-nophoto-row.png');
  });
});
