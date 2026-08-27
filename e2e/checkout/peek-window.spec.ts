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

test.describe('Barcode scan product peek window (PEEK-01..04)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await injectPeekWindowMock(page);
    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
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

  test('an unmatched barcode shows Product not found, no Add to Cart rendered', async ({
    context,
  }) => {
    const peekPage = await context.newPage();
    await injectPeekWindowMock(peekPage);
    await peekPage.goto('/?window=peek&barcode=9999999999999');

    await expect(peekPage.getByText(/product not found/i)).toBeVisible();
    await expect(
      peekPage.getByText(/no product matches this barcode/i)
    ).toBeVisible();
    await expect(peekPage.getByRole('button', { name: /^add to cart$/i })).toHaveCount(0);
    await expect(peekPage.getByRole('button', { name: /^close$/i })).toBeVisible();
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
});
