/**
 * E2E tests for PEEK-01..04 — Barcode scan product peek window
 * (Phase 18-barcode-scan-product-peek-window).
 *
 * A real Playwright run drives two Pages in one BrowserContext (main + a
 * simulated peek window) bridged by tauriPeekMock.ts's BroadcastChannel —
 * the closest same-process analog to Tauri's real cross-window event relay
 * (18-RESEARCH.md's Validation Architecture). This is the automated
 * substitute for a human clicking through the app, per this project's
 * non-negotiable testing policy (CLAUDE.md).
 */
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { getPeekMockCalls, injectPeekWindowMock } from '../helpers/tauriPeekMock';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const PRIMARY_PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";
const SECONDARY_PRODUCT_NAME = 'Parle-G Biscuits 200g';
const CATEGORY_PRODUCT_NAME = 'MDH Garam Masala 100g';

// Phase 31 Plan 05: proves the peek window (Phase 18) is unaffected by this
// phase's photo-storage work. `ProductPeekWindow.tsx` reads `product.imageUrl`
// directly and is deliberately NOT routed through this phase's
// `resolveProductImage` resolver — see 31-RESEARCH.md Pitfall 4. Distinct
// barcodes/names from the fixture products above so this doesn't collide
// with any other test in this file's shared seed data.
const LEGACY_IMAGE_PRODUCT_NAME = 'E2E Peek Legacy Image-URL Product';
const LEGACY_IMAGE_BARCODE = '9000000000001';
const PHOTO_ONLY_PRODUCT_NAME = 'E2E Peek Photo-Only Product';
const PHOTO_ONLY_BARCODE = '9000000000002';

async function scanBarcode(page: Page, barcode: string) {
  await page.evaluate(code => {
    for (const key of [...code, 'Enter']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
  }, barcode);
}

type SeedProduct = {
  id: string;
  name: string;
  base_price: number;
  sku: string | null;
  barcode: string | null;
};

/**
 * Seeds a product with a distinct barcode and a controlled combination of
 * legacy `image_url` / uploaded `photo_path` — used only by this phase's
 * "peek window unaffected" proof below. Deletes any stale row with the same
 * barcode first so the fixture is idempotent across reruns.
 */
async function seedPeekPhotoScopeProduct(opts: {
  name: string;
  barcode: string;
  imageUrl: string | null;
  photoPath: string | null;
}): Promise<void> {
  const admin = getServiceClient();
  const { data: cat } = await admin.from('categories').select('id').limit(1).single();
  if (!cat) throw new Error('seedPeekPhotoScopeProduct: no category found');
  await admin.from('products').delete().eq('barcode', opts.barcode);
  const { error } = await admin.from('products').insert({
    name: opts.name,
    category_id: cat.id,
    base_price: 4.5,
    is_active: true,
    barcode: opts.barcode,
    image_url: opts.imageUrl,
    photo_path: opts.photoPath,
  });
  if (error) throw new Error(`seedPeekPhotoScopeProduct: insert failed - ${error.message}`);
}

async function cleanupPeekPhotoScopeProduct(barcode: string): Promise<void> {
  const admin = getServiceClient();
  await admin.from('products').delete().eq('barcode', barcode);
}

async function fetchProduct(name: string): Promise<SeedProduct> {
  const admin = getServiceClient();
  const { data: product, error } = await admin
    .from('products')
    .select('id, name, base_price, sku, barcode')
    .eq('is_active', true)
    .eq('name', name)
    .single();
  if (error || !product) throw new Error(error?.message ?? `Seeded product not found: ${name}`);
  if (!product.barcode) throw new Error(`Seeded product has no barcode: ${name}`);
  return product;
}

// SECONDARY_PRODUCT_NAME's seeded inventory.expiry_date can fall inside the
// store's near_expiry threshold, silently triggering Phase 27's
// expiry-proximity auto-discount (PROMO-02) — several tests below assert
// this fixture's undiscounted list price. Cleared in beforeEach, BEFORE
// page.goto/login (the main page's near-expiry query is fetched at login
// time with a 5-minute staleTime, so a later per-test clear wouldn't be
// picked up by an already-fetched query), and restored in afterEach so this
// file doesn't leave a permanent side effect on shared seed data.
let secondaryProductOriginalExpiryDate: string | null | undefined;

test.describe('Barcode scan product peek window (PEEK-01..04)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    const admin = getServiceClient();
    const { data: secondaryProduct } = await admin
      .from('products')
      .select('id')
      .eq('name', SECONDARY_PRODUCT_NAME)
      .single();
    if (secondaryProduct) {
      const { data: inv } = await admin
        .from('inventory')
        .select('expiry_date')
        .eq('product_id', secondaryProduct.id)
        .maybeSingle();
      secondaryProductOriginalExpiryDate = inv?.expiry_date ?? null;
      await admin.from('inventory').update({ expiry_date: null }).eq('product_id', secondaryProduct.id);
    }
    await openCaja(500);
    await injectPeekWindowMock(page);
    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
  });

  test.afterEach(async () => {
    if (secondaryProductOriginalExpiryDate === undefined) return;
    const admin = getServiceClient();
    const { data: secondaryProduct } = await admin
      .from('products')
      .select('id')
      .eq('name', SECONDARY_PRODUCT_NAME)
      .single();
    if (secondaryProduct) {
      await admin
        .from('inventory')
        .update({ expiry_date: secondaryProductOriginalExpiryDate })
        .eq('product_id', secondaryProduct.id);
    }
    secondaryProductOriginalExpiryDate = undefined;
  });

  test('scanning a barcode and opening the peek window shows full product detail (PEEK-01)', async ({
    page,
    context,
  }) => {
    const product = await fetchProduct(PRIMARY_PRODUCT_NAME);
    await scanBarcode(page, product.barcode!);

    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);

    await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();
    await expect(peekPage.getByText(product.base_price.toFixed(2))).toBeVisible();
    if (product.sku) {
      await expect(peekPage.getByText(product.sku, { exact: true })).toBeVisible();
    }
    await expect(peekPage.getByText(product.barcode!, { exact: true })).toBeVisible();
    // Disambiguate from the reused StatusBadge pill's own "In stock" text —
    // the stockCount copy is always "{{count}} in stock" (digit prefix).
    await expect(peekPage.getByText(/\d+ in stock/i)).toBeVisible();
    expect(context.pages().length).toBe(2);
  });

  test('Add to Cart with an adjusted quantity relays to the real main-window cart (PEEK-02/PEEK-03)', async ({
    page,
    context,
  }) => {
    const admin = getServiceClient();
    const product = await fetchProduct(SECONDARY_PRODUCT_NAME);
    const { data: inv, error: invError } = await admin
      .from('inventory')
      .select('quantity_on_hand, low_stock_threshold')
      .eq('product_id', product.id)
      .single();
    if (invError || !inv) throw new Error(invError?.message ?? 'Seeded inventory row not found');
    if (product.base_price <= 0 || inv.quantity_on_hand <= inv.low_stock_threshold) {
      throw new Error(`${SECONDARY_PRODUCT_NAME} is not a clean (non-flagged) fixture right now`);
    }

    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);
    await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();

    const increase = peekPage.getByRole('button', { name: /increase quantity/i });
    await increase.click();
    await increase.click();
    await peekPage.getByRole('button', { name: /^add to cart$/i }).click();

    await expect
      .poll(async () => (await getPeekMockCalls(peekPage, 'plugin:window|hide')).length)
      .toBeGreaterThan(0);

    // Web-first assertions auto-retry until the BroadcastChannel relay (an
    // inherently async cross-page postMessage) has actually been applied to
    // the real cartStore by CheckoutPanel's listener — a single innerText()
    // snapshot would race ahead of that delivery.
    await expect(page.locator('aside')).toContainText(product.name);
    await expect(page.locator('aside')).toContainText((3 * product.base_price).toFixed(2));
  });

  test('a zero-price product still gates through the risky-add confirm toast (prohibition: no guard bypass)', async ({
    page,
    context,
  }) => {
    const admin = getServiceClient();
    const product = await fetchProduct(CATEGORY_PRODUCT_NAME);
    const originalBasePrice = product.base_price;
    const { error: updateError } = await admin
      .from('products')
      .update({ base_price: 0 })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      const peekPage = await context.newPage();
      await injectPeekWindowMock(peekPage);
      await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);
      await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();

      await peekPage.getByRole('button', { name: /^add to cart$/i }).click();

      await expect(
        peekPage.getByText(new RegExp(`${product.name} is priced at \\$0`, 'i'))
      ).toBeVisible();
      await expect(page.locator('aside').getByText(product.name, { exact: true })).not.toBeVisible();

      await peekPage.getByRole('button', { name: /^add anyway$/i }).click();
      await expect(page.locator('aside').getByText(product.name, { exact: true })).toBeVisible();
    } finally {
      await admin.from('products').update({ base_price: originalBasePrice }).eq('id', product.id);
    }
  });

  test('a low-stock product still gates through the risky-add confirm toast (prohibition: no guard bypass)', async ({
    page,
    context,
  }) => {
    const admin = getServiceClient();
    const product = await fetchProduct(CATEGORY_PRODUCT_NAME);
    const { data: inv, error: invError } = await admin
      .from('inventory')
      .select('id, quantity_on_hand, low_stock_threshold')
      .eq('product_id', product.id)
      .single();
    if (invError || !inv) throw new Error(invError?.message ?? 'Seeded inventory row not found');
    const originalQuantityOnHand = inv.quantity_on_hand;
    const originalLowStockThreshold = inv.low_stock_threshold;
    const { error: invUpdateError } = await admin
      .from('inventory')
      .update({ quantity_on_hand: 2, low_stock_threshold: 5 })
      .eq('id', inv.id);
    if (invUpdateError) throw new Error(invUpdateError.message);

    try {
      const peekPage = await context.newPage();
      await injectPeekWindowMock(peekPage);
      await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);
      await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();

      await peekPage.getByRole('button', { name: /^add to cart$/i }).click();

      await expect(peekPage.getByText(new RegExp(`only 2 left of ${product.name}`, 'i'))).toBeVisible();
      await expect(page.locator('aside').getByText(product.name, { exact: true })).not.toBeVisible();

      await peekPage.getByRole('button', { name: /^add anyway$/i }).click();
      await expect(page.locator('aside').getByText(product.name, { exact: true })).toBeVisible();
    } finally {
      await admin
        .from('inventory')
        .update({
          quantity_on_hand: originalQuantityOnHand,
          low_stock_threshold: originalLowStockThreshold,
        })
        .eq('id', inv.id);
    }
  });

  test('a sold-by-weight product opens WeightEntryDialog and relays a weighted line (PEEK-02 weight path)', async ({
    page,
    context,
  }) => {
    const admin = getServiceClient();
    const product = await fetchProduct(PRIMARY_PRODUCT_NAME);
    const { error: updateError } = await admin
      .from('products')
      .update({ sold_by_weight: true })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      const peekPage = await context.newPage();
      await injectPeekWindowMock(peekPage);
      await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);
      await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();
      await expect(peekPage.getByText(/sold by weight \(kg\)/i)).toBeVisible();

      await peekPage.getByRole('button', { name: /^add to cart$/i }).click();
      const dialog = peekPage.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: /enter weight/i })).toBeVisible();

      await dialog.getByRole('button', { name: '1', exact: true }).click();
      await dialog.getByRole('button', { name: '.', exact: true }).click();
      await dialog.getByRole('button', { name: '5', exact: true }).click();
      await dialog.getByRole('button', { name: /^add to cart$/i }).click();

      await expect(page.locator('aside')).toContainText(product.name);
      await expect(page.locator('aside')).toContainText((1.5 * product.base_price).toFixed(2));
    } finally {
      await admin.from('products').update({ sold_by_weight: false }).eq('id', product.id);
    }
  });

  test('an unmatched barcode shows Product not found, no Add to Cart rendered, and is audited', async ({
    context,
  }) => {
    const barcode = '9999999999999';
    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto(`/?window=peek&barcode=${barcode}`);

    await expect(peekPage.getByText(/product not found/i)).toBeVisible();
    await expect(
      peekPage.getByText(/no product matches this barcode/i)
    ).toBeVisible();
    await expect(peekPage.getByRole('button', { name: /^add to cart$/i })).toHaveCount(0);
    await expect(peekPage.getByRole('button', { name: /^close$/i })).toBeVisible();

    // useLookupProductByBarcode audits a genuine miss (ported from the
    // now-removed useScanBarcodeToCart.ts, which used to be the only path
    // that logged this — restored here so the peek window's lookup keeps
    // the same loss-prevention/traceability trail).
    await expect
      .poll(async () => {
        const { data, error } = await getServiceClient()
          .from('audit_logs')
          .select('before')
          .eq('action', 'barcode.scan_failed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data?.before as { barcode?: string } | null)?.barcode === barcode;
      })
      .toBe(true);
  });

  test("rescanning a different barcode replaces peek content and relays to main, while main's own independent scan still fires (PEEK-04)", async ({
    page,
    context,
  }) => {
    const primary = await fetchProduct(PRIMARY_PRODUCT_NAME);
    const secondary = await fetchProduct(SECONDARY_PRODUCT_NAME);
    const categoryProduct = await fetchProduct(CATEGORY_PRODUCT_NAME);

    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto(`/?window=peek&barcode=${primary.barcode}`);
    await expect(peekPage.getByRole('heading', { name: primary.name })).toBeVisible();

    await scanBarcode(peekPage, secondary.barcode!);
    await expect(peekPage.getByRole('heading', { name: secondary.name })).toBeVisible();
    await expect(peekPage.getByRole('heading', { name: primary.name })).toHaveCount(0);

    await expect(page.getByPlaceholder(/search products/i)).toHaveValue(secondary.barcode!);

    await scanBarcode(page, categoryProduct.barcode!);
    await expect(page.getByPlaceholder(/search products/i)).toHaveValue(categoryProduct.barcode!);
  });

  test('Close dismisses with zero cart mutation', async ({ page, context }) => {
    const product = await fetchProduct(SECONDARY_PRODUCT_NAME);

    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);
    await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();

    await peekPage.getByRole('button', { name: /^close$/i }).click();

    await expect
      .poll(async () => (await getPeekMockCalls(peekPage, 'plugin:window|hide')).length)
      .toBeGreaterThan(0);
    const emitCalls = await getPeekMockCalls(peekPage, 'plugin:event|emit');
    const addToCartEmitted = emitCalls.some(
      call => (call.args as { event?: string } | undefined)?.event === 'add-to-cart'
    );
    expect(addToCartEmitted).toBe(false);
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
  });

  test('a rescan relayed while the peek window is already open refreshes its displayed product (CR-01 regression)', async ({
    page,
    context,
  }) => {
    const primary = await fetchProduct(PRIMARY_PRODUCT_NAME);
    const secondary = await fetchProduct(SECONDARY_PRODUCT_NAME);

    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto(`/?window=peek&barcode=${primary.barcode}`);
    await expect(peekPage.getByRole('heading', { name: primary.name })).toBeVisible();

    // Simulates ensurePeekWindowShown's reuse branch (existing window found ->
    // show/setFocus/emit(PEEK_WINDOW_REFRESH_EVENT) instead of a fresh
    // navigation) firing from the main window. The mock's get_all_windows
    // always resolves [] (window count is driven by context.newPage(), not
    // the mock — see tauriPeekMock.ts), so ensurePeekWindowShown itself can't
    // be driven into its reuse branch from this harness; emitting the same
    // event it would have emitted proves the consuming end of the fix
    // (ProductPeekWindow's listener) instead.
    await page.evaluate(code => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      void internals.invoke('plugin:event|emit', {
        event: 'peek-window-refresh',
        payload: { code },
      });
    }, secondary.barcode);

    await expect(peekPage.getByRole('heading', { name: secondary.name })).toBeVisible();
    await expect(peekPage.getByRole('heading', { name: primary.name })).toHaveCount(0);
  });

  test('scanning while the weight-entry dialog is open does not swap the displayed product (CR-02 regression)', async ({
    context,
  }) => {
    const admin = getServiceClient();
    const product = await fetchProduct(PRIMARY_PRODUCT_NAME);
    const other = await fetchProduct(SECONDARY_PRODUCT_NAME);
    const { error: updateError } = await admin
      .from('products')
      .update({ sold_by_weight: true })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      const peekPage = await context.newPage();
      await injectPeekWindowMock(peekPage);
      await peekPage.goto(`/?window=peek&barcode=${product.barcode}`);
      await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();

      await peekPage.getByRole('button', { name: /^add to cart$/i }).click();
      const dialog = peekPage.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: /enter weight/i })).toBeVisible();

      await scanBarcode(peekPage, other.barcode!);

      // The scanner is disabled while the dialog owns entry (CR-02) -- the
      // dialog stays open, unaffected by the scan.
      await expect(dialog.getByRole('heading', { name: /enter weight/i })).toBeVisible();

      // Cancel rather than assert the underlying product heading while the
      // dialog is open: Radix Dialog marks background content aria-hidden
      // while a modal is open, so a role-based query on it would fail
      // regardless of which product is actually rendered underneath.
      await peekPage.getByRole('button', { name: /^cancel$/i }).click();
      await expect(peekPage.getByRole('heading', { name: product.name })).toBeVisible();
      await expect(peekPage.getByRole('heading', { name: other.name })).toHaveCount(0);
    } finally {
      await admin.from('products').update({ sold_by_weight: false }).eq('id', product.id);
    }
  });

  test('a second window in the same browser context restores the session without a fresh login (closes RESEARCH.md Assumption A1 / Pitfall 6)', async ({
    context,
  }) => {
    const product = await fetchProduct(PRIMARY_PRODUCT_NAME);

    const freshPeekPage = await context.newPage();
    await injectPeekWindowMock(freshPeekPage);
    await freshPeekPage.goto(`/?window=peek&barcode=${product.barcode}`);

    await expect(freshPeekPage.getByRole('heading', { name: product.name })).toBeVisible();
    await expect(freshPeekPage.getByText(/product not found/i)).toHaveCount(0);
    await expect(
      freshPeekPage.getByText(/couldn't load product details/i)
    ).toHaveCount(0);
  });

  // ---------------------------------------------------------------------
  // Phase 31 Plan 05: peek window unaffected by this phase's photo storage.
  // `src/widgets/ProductPeekWindow/` is deliberately NOT modified here — the
  // phase boundary is to prove it still works, not to change it
  // (31-RESEARCH.md Pitfall 4, must_haves prohibition).
  // ---------------------------------------------------------------------

  test('a product with a legacy image_url (no uploaded photo) still renders its image in the peek window (Phase 31 boundary)', async ({
    context,
  }) => {
    const legacyImageUrl = 'https://placehold.co/400x300.png';
    await seedPeekPhotoScopeProduct({
      name: LEGACY_IMAGE_PRODUCT_NAME,
      barcode: LEGACY_IMAGE_BARCODE,
      imageUrl: legacyImageUrl,
      photoPath: null,
    });

    try {
      const peekPage = await context.newPage();
      await injectPeekWindowMock(peekPage);
      await peekPage.goto(`/?window=peek&barcode=${LEGACY_IMAGE_BARCODE}`);

      await expect(
        peekPage.getByRole('heading', { name: LEGACY_IMAGE_PRODUCT_NAME })
      ).toBeVisible();

      // ProductPeekWindow.tsx:253-254 renders `product.imageUrl` directly via
      // a plain <img>, unaffected by this phase's photo_path/resolver work.
      const img = peekPage.getByRole('img', { name: LEGACY_IMAGE_PRODUCT_NAME });
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute('src', legacyImageUrl);

      // The rest of the peek content (price, stock) still renders normally —
      // this phase changed nothing about the peek window's other fields.
      await expect(peekPage.getByText('4.50')).toBeVisible();
      await expect(peekPage.getByText(/\d+ in stock/i)).toBeVisible();
    } finally {
      await cleanupPeekPhotoScopeProduct(LEGACY_IMAGE_BARCODE);
    }
  });

  test('a product with only an uploaded photo (no legacy image_url) shows the peek window no-image state (documented, scoped-as-acceptable — 31-RESEARCH.md Pitfall 4)', async ({
    context,
  }) => {
    // Deliberate, documented consequence of this phase's scope boundary: the
    // peek window is a direct `product.imageUrl` consumer, not wired to
    // resolveProductImage()/photo_path (D-14's consumer list explicitly
    // excludes it — 31-RESEARCH.md Pitfall 4, 31-01-SUMMARY.md Deferred). A
    // product that only has an uploaded photo shows the no-image placeholder
    // here even though the catalog dialog shows the real photo. This is NOT
    // a regression to fix — it is carried into STATE.md's Deferred Items at
    // phase close (see 31-05-SUMMARY.md).
    await seedPeekPhotoScopeProduct({
      name: PHOTO_ONLY_PRODUCT_NAME,
      barcode: PHOTO_ONLY_BARCODE,
      imageUrl: null,
      photoPath: `products/e2e-fixture/${PHOTO_ONLY_BARCODE}.webp`,
    });

    try {
      const peekPage = await context.newPage();
      await injectPeekWindowMock(peekPage);
      await peekPage.goto(`/?window=peek&barcode=${PHOTO_ONLY_BARCODE}`);

      await expect(
        peekPage.getByRole('heading', { name: PHOTO_ONLY_PRODUCT_NAME })
      ).toBeVisible();

      // No <img> element at all — the peek window never resolves photo_path.
      await expect(peekPage.getByRole('img')).toHaveCount(0);
      await expect(peekPage.getByText(/no photo available/i)).toBeVisible();

      // Every other field still renders correctly — only the image is affected.
      await expect(peekPage.getByText('4.50')).toBeVisible();
      await expect(peekPage.getByText(/\d+ in stock/i)).toBeVisible();
    } finally {
      await cleanupPeekPhotoScopeProduct(PHOTO_ONLY_BARCODE);
    }
  });
});
