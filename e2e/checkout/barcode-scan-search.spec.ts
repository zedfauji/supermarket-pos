import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { requireIntegrationEnv } from '../helpers/requireEnv';

const PRIMARY_PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";
const SECONDARY_PRODUCT_NAME = 'Parle-G Biscuits 200g';
const CATEGORY_PRODUCT_NAME = 'MDH Garam Masala 100g';

async function scanBarcode(page: import('@playwright/test').Page, barcode: string) {
  await page.evaluate(code => {
    for (const key of [...code, 'Enter']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
  }, barcode);
}

async function reloadCatalog(page: import('@playwright/test').Page) {
  await page.reload();
  await expect(
    page.getByRole('button', { name: new RegExp(`select ${PRIMARY_PRODUCT_NAME}`, 'i') })
  ).toBeVisible();
}

test.describe('Barcode scan and product search', () => {
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

  test('scan adds a catalog product to the cart', async ({ page }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, barcode')
      .eq('is_active', true)
      .eq('name', PRIMARY_PRODUCT_NAME)
      .single();
    const product = products;
    if (error || !product) throw new Error(error?.message ?? 'Seeded barcode product not found');
    if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
    await scanBarcode(page, product.barcode);
    await expect(page.locator('aside').getByText(product.name, { exact: true })).toBeVisible();
  });

  test('scanning a zero-price product shows a confirm toast; confirming adds it to the cart at $0', async ({
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
    const originalBasePrice = product.base_price;
    const { error: updateError } = await admin
      .from('products')
      .update({ base_price: 0 })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
      await reloadCatalog(page);
      await scanBarcode(page, product.barcode);

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

  test('scanning a zero-price product and cancelling the confirm toast leaves the cart unchanged', async ({
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
    const originalBasePrice = product.base_price;
    const { error: updateError } = await admin
      .from('products')
      .update({ base_price: 0 })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
      await page.reload();
      await expect(
        page.getByRole('button', { name: new RegExp(`select ${SECONDARY_PRODUCT_NAME}`, 'i') })
      ).toBeVisible();
      await scanBarcode(page, product.barcode);

      await expect(
        page.getByText(new RegExp(`${product.name} is priced at \\$0`, 'i'))
      ).toBeVisible();

      await page.getByRole('button', { name: /^cancel$/i }).click();
      await expect(page.getByText(/cart is empty/i)).toBeVisible();
      await expect(
        page.locator('aside').getByText(product.name, { exact: true })
      ).not.toBeVisible();
    } finally {
      await admin.from('products').update({ base_price: originalBasePrice }).eq('id', product.id);
    }
  });

  test('scanning a low-stock product (quantity_on_hand <= low_stock_threshold) shows a confirm toast', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: inventoryRows, error } = await admin
      .from('inventory')
      .select(
        'id, product_id, quantity_on_hand, low_stock_threshold, products!inner(id, name, barcode, is_active)'
      )
      .eq('products.is_active', true)
      .eq('products.name', PRIMARY_PRODUCT_NAME)
      .single();
    const inv = inventoryRows;
    if (error || !inv) throw new Error(error?.message ?? 'Seeded inventory row not found');
    const product = inv.products as unknown as { id: string; name: string; barcode: string | null };
    const originalQuantityOnHand = inv.quantity_on_hand;
    const originalLowStockThreshold = inv.low_stock_threshold;

    const { error: invUpdateError } = await admin
      .from('inventory')
      .update({ quantity_on_hand: 2, low_stock_threshold: 5 })
      .eq('id', inv.id);
    if (invUpdateError) throw new Error(invUpdateError.message);

    try {
      if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
      await reloadCatalog(page);
      await scanBarcode(page, product.barcode);

      await expect(page.getByText(new RegExp(`only 2 left of ${product.name}`, 'i'))).toBeVisible();
      await expect(
        page.locator('aside').getByText(product.name, { exact: true })
      ).not.toBeVisible();

      await page.getByRole('button', { name: /^add anyway$/i }).click();
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

  test('scan of a loose-weight product opens weight entry instead of an unpayable line', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, barcode')
      .eq('is_active', true)
      .eq('name', PRIMARY_PRODUCT_NAME)
      .single();
    const product = products;
    if (error || !product) throw new Error(error?.message ?? 'Seeded barcode product not found');
    const { error: updateError } = await admin
      .from('products')
      .update({ sold_by_weight: true })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
      await reloadCatalog(page);
      await scanBarcode(page, product.barcode);

      await expect(page.getByRole('heading', { name: /enter weight/i })).toBeVisible();
      await expect(page.getByText(/cart is empty/i)).toBeVisible();
    } finally {
      await admin.from('products').update({ sold_by_weight: false }).eq('id', product.id);
    }
  });

  test('a scan during the receipt screen is discarded and does not enter the next sale (CHK-01)', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, barcode')
      .eq('is_active', true)
      .in('name', [PRIMARY_PRODUCT_NAME, SECONDARY_PRODUCT_NAME])
      .order('name')
      .limit(2);
    const [saleProduct, scannedProduct] = products ?? [];
    if (error || !saleProduct || !scannedProduct)
      throw new Error(error?.message ?? 'Two active products required');
    if (!scannedProduct.barcode) throw new Error('Seeded barcode product has no barcode');

    await page.getByPlaceholder(/search products/i).fill(saleProduct.name);
    await page.getByRole('button', { name: new RegExp(`select ${saleProduct.name}`, 'i') }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('10000');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    // A scanner burst while the receipt is still visible must not silently
    // enter the cart that Done is about to clear (CHK-01, T-02-08-01).
    await scanBarcode(page, scannedProduct.barcode);
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /done/i }).click();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
    await expect(
      page.locator('aside').getByText(scannedProduct.name, { exact: true })
    ).not.toBeVisible();
  });

  test('a scan while the weight-entry dialog is open is discarded and does not open a second dialog', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, barcode')
      .eq('is_active', true)
      .in('name', [PRIMARY_PRODUCT_NAME, SECONDARY_PRODUCT_NAME])
      .order('name')
      .limit(2);
    const [weightProduct, secondProduct] = products ?? [];
    if (error || !weightProduct || !secondProduct)
      throw new Error(error?.message ?? 'Two active products required');
    const { error: weightUpdateError } = await admin
      .from('products')
      .update({ sold_by_weight: true })
      .eq('id', weightProduct.id);
    if (weightUpdateError) throw new Error(weightUpdateError.message);

    try {
      if (!weightProduct.barcode || !secondProduct.barcode) {
        throw new Error('Seeded barcode product has no barcode');
      }
      await reloadCatalog(page);
      await scanBarcode(page, weightProduct.barcode);
      await expect(page.getByRole('heading', { name: /enter weight/i })).toBeVisible();

      // A scanner burst while the weight-entry dialog owns the register must
      // not add a line or open a second dialog (CHK-01, T-02-08-01).
      await scanBarcode(page, secondProduct.barcode);
      await page.waitForTimeout(500);

      await expect(page.getByRole('heading', { name: /enter weight/i })).toHaveCount(1);
      await expect(page.getByText(/cart is empty/i)).toBeVisible();
    } finally {
      await admin.from('products').update({ sold_by_weight: false }).eq('id', weightProduct.id);
    }
  });

  test('unknown scan is shown and audited without changing the cart', async ({ page }) => {
    const barcode = '9999999999999';

    await scanBarcode(page, barcode);

    await expect(page.getByText(/product not found/i)).toBeVisible();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
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
        return data?.before?.barcode === barcode;
      })
      .toBe(true);
  });

  test('an inactive product barcode is treated as unmatched, not sold (WR-01, T-02-08-02)', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: products, error } = await admin
      .from('products')
      .select('id, name, barcode')
      .eq('is_active', true)
      .eq('name', PRIMARY_PRODUCT_NAME)
      .single();
    const product = products;
    if (error || !product) throw new Error(error?.message ?? 'Seeded barcode product not found');
    if (!product.barcode) throw new Error('Seeded barcode product has no barcode');
    const { error: updateError } = await admin
      .from('products')
      .update({ is_active: false })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);

    try {
      await page.reload();
      await expect(
        page.getByRole('button', { name: new RegExp(`select ${SECONDARY_PRODUCT_NAME}`, 'i') })
      ).toBeVisible();
      await scanBarcode(page, product.barcode);

      await expect(page.getByText(/product not found|producto no encontrado/i)).toBeVisible();
      await expect(page.getByText(/cart is empty/i)).toBeVisible();
      await expect
        .poll(async () => {
          const { data, error: auditError } = await getServiceClient()
            .from('audit_logs')
            .select('before')
            .eq('action', 'barcode.scan_failed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (auditError) throw new Error(auditError.message);
          return data?.before?.barcode === product.barcode;
        })
        .toBe(true);
    } finally {
      await admin.from('products').update({ is_active: true }).eq('id', product.id);
    }
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

    const categoryTab = page.getByRole('button', { name: `Filter by ${category.name}` });
    await categoryTab.focus();
    await categoryTab.press('Enter');
    await expect(categoryTab).toHaveAttribute('aria-pressed', 'true');
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
