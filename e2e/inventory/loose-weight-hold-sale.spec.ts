import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { getInventoryQty, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import type { SupabaseClient } from '@supabase/supabase-js';

// D-05 (17-e2e-suite-overhaul): this spec's loose-weight/hold-sale mechanics
// don't need Indian-catalog fixtures — it needs two simple, always-present
// products it can freely flip sold_by_weight/quantity_on_hand on. The old
// bar-food seed's Budweiser/Corona (this spec's fixtures pre-Phase-17) no
// longer exist after 17-02's Indian grocery catalog rewrite, so two small
// generic fixture products are created here directly, mirroring
// scripts/seed-dev-data.ts's idempotent upsert-by-natural-key pattern.
const PRODUCT = 'E2E Loose Weight A';
const PRODUCT_B = 'E2E Loose Weight B';
const WEIGHT_GRAMS = 375;

/**
 * Idempotently creates a dedicated category plus the two fixture products
 * above (with an inventory row each) if they don't already exist. Safe to
 * call every test run — never touches products it didn't create.
 */
async function ensureLooseWeightFixtures(): Promise<void> {
  const admin = getServiceClient();

  let categoryId: string;
  const { data: existingCategory } = await admin
    .from('categories')
    .select('id')
    .eq('name', 'E2E Fixtures')
    .maybeSingle();
  if (existingCategory) {
    categoryId = existingCategory.id as string;
  } else {
    const { data: category, error: categoryError } = await admin
      .from('categories')
      .insert({ name: 'E2E Fixtures', sort_order: 999 })
      .select('id')
      .single();
    if (categoryError || !category) {
      throw new Error(`ensureLooseWeightFixtures: category create failed - ${categoryError?.message}`);
    }
    categoryId = category.id as string;
  }

  // Low per-kg prices: the UI-driven tests below sell up to ~4.5kg on a
  // fixed $100-tendered cash payment, so base_price must stay small enough
  // that weight x price + tax never exceeds the tendered amount.
  for (const [name, price] of [[PRODUCT, 10], [PRODUCT_B, 12]] as const) {
    const { data: existing } = await admin.from('products').select('id').eq('name', name).maybeSingle();
    if (existing) {
      // Keep base_price in sync in case a prior run created this fixture
      // with a stale price (e.g. before this file's own tests tuned it).
      const { error: updateError } = await admin
        .from('products')
        .update({ base_price: price })
        .eq('id', existing.id as string);
      if (updateError) {
        throw new Error(`ensureLooseWeightFixtures: price sync failed for "${name}" - ${updateError.message}`);
      }
      continue;
    }
    const { error } = await admin
      .from('products')
      .insert({ name, category_id: categoryId, base_price: price, is_active: true });
    if (error) {
      throw new Error(`ensureLooseWeightFixtures: product create failed for "${name}" - ${error.message}`);
    }
  }

  for (const name of [PRODUCT, PRODUCT_B]) {
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id')
      .eq('name', name)
      .single();
    if (productError || !product) {
      throw new Error(`ensureLooseWeightFixtures: "${name}" not found - ${productError?.message}`);
    }
    const { data: inv } = await admin
      .from('inventory')
      .select('id')
      .eq('product_id', product.id)
      .maybeSingle();
    if (!inv) {
      const { error: invError } = await admin
        .from('inventory')
        .insert({ product_id: product.id, quantity_on_hand: 10_000, low_stock_threshold: 10 });
      if (invError) {
        throw new Error(`ensureLooseWeightFixtures: inventory create failed for "${name}" - ${invError.message}`);
      }
    }
  }
}

/**
 * Reads the live `billing` settings row the same way
 * process_direct_sale_atomic does (`settings.value->>'taxRatePercent'`),
 * falling back to 16 to match the migration's own COALESCE default when no
 * row exists yet. Mirrors e2e/checkout/*.spec.ts's helper of the same name.
 */
async function getTaxRatePercent(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const rate = (data?.value as { taxRatePercent?: number } | null)?.taxRatePercent;
  return typeof rate === 'number' ? rate : 16;
}

/**
 * Mirrors process_direct_sale_atomic's two-step rounding (tax rounded
 * first, then added to the subtotal) so the tendered amount computed here
 * lands within the RPC's one-cent authority tolerance instead of drifting
 * from a single-step (subtotal * (1 + rate)) computation. As of 02-06, the
 * RPC rejects any p_amount that disagrees with the tax-inclusive derived
 * total by more than one cent — the pre-tax subtotal alone is no longer
 * accepted.
 */
function computeAuthoritativeTotal(subtotal: number, taxRatePercent: number): number {
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}

test.describe('Loose-weight checkout', () => {
  let cajaSessionId = '';

  test.beforeEach(async () => {
    requireIntegrationEnv();
    await ensureLooseWeightFixtures();
    await resetTestState();
    cajaSessionId = await openCaja(500);
    const admin = getServiceClient();
    const { data: cashier, error: cashierError } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'cashier')
      .limit(1)
      .single();
    if (cashierError || !cashier) {
      throw new Error(cashierError?.message ?? 'Cashier profile not found');
    }
    const { error: shiftError } = await admin.from('shifts').insert({
      staff_id: cashier.id,
      opening_cash: 0,
    });
    if (shiftError) throw new Error(shiftError.message);
    const { error: productError } = await admin
      .from('products')
      .update({ sold_by_weight: false })
      .in('name', [PRODUCT, PRODUCT_B]);
    if (productError) throw new Error(productError.message);
  });

  async function directSaleInput(weightGrams: number) {
    const admin = getServiceClient();
    const { data: shift, error: shiftError } = await admin
      .from('shifts')
      .select('id, staff_id')
      .is('clock_out', null)
      .limit(1)
      .single();
    if (shiftError || !shift) throw new Error(shiftError?.message ?? 'Open shift not found');

    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, base_price')
      .eq('name', PRODUCT)
      .single();
    if (productError || !product) throw new Error(productError?.message ?? 'Product not found');

    // Matches process_direct_sale_atomic's ROUND(catalog_price * (grams / 1000.0), 2)
    // line-price derivation exactly.
    const expectedPrice = Math.round(Number(product.base_price) * (weightGrams / 1000) * 100) / 100;
    const taxRatePercent = await getTaxRatePercent(admin);
    const total = computeAuthoritativeTotal(expectedPrice, taxRatePercent);

    return {
      admin,
      total,
      args: {
        p_staff_id: shift.staff_id,
        p_shift_id: shift.id,
        p_caja_session_id: cajaSessionId,
        p_items: [
          {
            product_id: product.id,
            quantity: 1,
            unit_price: expectedPrice,
            weight_grams: weightGrams,
          },
        ],
        p_idempotency_key: `weight-sale-${randomUUID()}`,
        p_method: 'cash',
        p_amount: total,
        p_tendered_amount: 100,
      },
    };
  }

  test('decrements and restores inventory by the exact grams sold', async () => {
    const admin = getServiceClient();
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id')
      .eq('name', PRODUCT)
      .single();
    if (productError || !product) throw new Error(productError?.message ?? 'Product not found');

    const productPatch: Record<string, unknown> = { sold_by_weight: true };
    const { error: updateError } = await admin
      .from('products')
      .update(productPatch as never)
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);
    const { error: inventoryError } = await admin
      .from('inventory')
      .update({ quantity_on_hand: 1_000 })
      .eq('product_id', product.id);
    if (inventoryError) throw new Error(inventoryError.message);

    const { args } = await directSaleInput(WEIGHT_GRAMS);
    const before = await getInventoryQty(PRODUCT);
    const sale = await admin.rpc('process_direct_sale_atomic', args);
    expect(sale.error).toBeNull();
    expect(sale.data).toMatchObject({ ok: true });
    expect(await getInventoryQty(PRODUCT)).toBe(before - WEIGHT_GRAMS);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id')
      .eq('tab_id', sale.data.tabId)
      .single();
    if (orderError || !order) throw new Error(orderError?.message ?? 'Weight order not found');
    const { data: item, error: itemError } = await admin
      .from('order_items')
      .select('id, weight_grams')
      .eq('order_id', order.id)
      .single();
    if (itemError || !item) throw new Error(itemError?.message ?? 'Weight order item not found');
    expect(item.weight_grams).toBe(WEIGHT_GRAMS);
    expect(before).toBe(1_000);
    expect(await getInventoryQty(PRODUCT)).toBe(625);

    // decrement_inventory_on_order_item (20260814000001_loose_weight_items.sql)
    // writes the same integer grams it subtracted from inventory as a
    // negative stock_movements row -- no stock-unit conversion or rounding.
    const { data: movement, error: movementError } = await admin
      .from('stock_movements')
      .select('quantity_delta')
      .eq('product_id', product.id)
      .eq('reason', 'sale')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (movementError || !movement)
      throw new Error(movementError?.message ?? 'Sale stock movement not found');
    expect(movement.quantity_delta).toBe(-WEIGHT_GRAMS);

    const { error: deleteError } = await admin.from('order_items').delete().eq('id', item.id);
    if (deleteError) throw new Error(deleteError.message);
    expect(await getInventoryQty(PRODUCT)).toBe(before);
  });

  test('rejects out-of-range weights before writing a sale', async () => {
    const admin = getServiceClient();
    const [{ count: tabsBefore }, { count: itemsBefore }] = await Promise.all([
      admin.from('tabs').select('id', { count: 'exact', head: true }),
      admin.from('order_items').select('id', { count: 'exact', head: true }),
    ]);

    for (const weightGrams of [0, -1, 60_000]) {
      const { args } = await directSaleInput(weightGrams);
      const result = await admin.rpc('process_direct_sale_atomic', args);
      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ ok: false, code: 'WEIGHT_OUT_OF_RANGE' });
    }

    const [{ count: tabsAfter }, { count: itemsAfter }] = await Promise.all([
      admin.from('tabs').select('id', { count: 'exact', head: true }),
      admin.from('order_items').select('id', { count: 'exact', head: true }),
    ]);
    expect(tabsAfter).toBe(tabsBefore);
    expect(itemsAfter).toBe(itemsBefore);
  });

  test('adds distinct weighted lines and edits one before checkout', async ({ page }) => {
    const admin = getServiceClient();
    const { data: product, error } = await admin
      .from('products')
      .select('id')
      .eq('name', PRODUCT)
      .single();
    if (error || !product) throw new Error(error?.message ?? 'Product not found');
    const { error: updateError } = await admin
      .from('products')
      .update({ sold_by_weight: true })
      .eq('id', product.id);
    if (updateError) throw new Error(updateError.message);
    await admin.from('inventory').update({ quantity_on_hand: 10_000 }).eq('product_id', product.id);

    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await page.getByPlaceholder(/search products/i).fill(PRODUCT);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await page.getByRole('button', { name: '1' }).click();
    // Exact match: the keypad's decimal key and the back button's
    // (currently untranslated, falls back to its raw i18n key
    // "actions.back") accessible name both contain a ".", so the default
    // substring match here resolves to two elements.
    await page.getByRole('button', { name: '.', exact: true }).click();
    await page.getByRole('button', { name: '5' }).click();
    await page.getByRole('button', { name: /add to cart/i }).click();

    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await page.getByRole('button', { name: '3' }).click();
    await page.getByRole('button', { name: /add to cart/i }).click();
    await expect(page.getByText(/weight: 1\.500 kg/i)).toBeVisible();
    await expect(page.getByText(/weight: 3\.000 kg/i)).toBeVisible();

    await page.getByRole('button', { name: /edit/i }).first().click();
    await page.getByRole('button', { name: '1' }).click();
    await page.getByRole('button', { name: /save weight/i }).click();
    await expect(page.getByText(/weight: 1\.510 kg/i)).toBeVisible();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => getInventoryQty(PRODUCT)).toBe(5_490);
  });

  test('holds, resumes, and discards one in-memory sale while another sale completes', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: product, error } = await admin
      .from('products')
      .select('id')
      .eq('name', PRODUCT)
      .single();
    if (error || !product) throw new Error(error?.message ?? 'Product not found');
    await admin.from('products').update({ sold_by_weight: false }).eq('id', product.id);

    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await page.getByPlaceholder(/search products/i).fill(PRODUCT);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await page.getByRole('button', { name: /^hold$/i }).click();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
    await expect(page.getByText(/sale held/i)).toBeVisible();

    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await page.getByRole('button', { name: /done/i }).click();
    await page.getByRole('button', { name: /^resume$/i }).click();
    // Scoped to the cart aside: PRODUCT's own name is a substring match
    // against the still-filtered product grid's "Select {PRODUCT}" button
    // as well as the resumed cart line, so an unscoped getByText resolves
    // to 2 elements (strict-mode violation) — the original 'Budweiser'
    // fixture never hit this because the old catalog was already gone by
    // the time this spec became runnable again post-17-02.
    await expect(page.locator('aside').getByText(PRODUCT, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^hold$/i }).click();
    await page.getByRole('button', { name: /^discard$/i }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText(/discard held sale/i)).toBeVisible();
    await expect(confirm.getByText(/nothing was charged/i)).toBeVisible();
    await expect(confirm.getByRole('button', { name: /^discard$/i })).not.toHaveClass(
      /bg-destructive/
    );
    await confirm.getByRole('button', { name: /^discard$/i }).click();
    await expect(page.getByText(/sale held/i)).not.toBeVisible();
  });

  test('resuming a held sale swaps instead of discarding a new active cart', async ({ page }) => {
    const admin = getServiceClient();
    await admin.from('products').update({ sold_by_weight: false }).in('name', [PRODUCT, PRODUCT_B]);

    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await page.getByPlaceholder(/search products/i).fill(PRODUCT);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await page.getByRole('button', { name: /^hold$/i }).click();

    await page.getByPlaceholder(/search products/i).fill(PRODUCT_B);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT_B}`, 'i') }).click();
    await page.getByRole('button', { name: /^resume$/i }).click();
    await expect(page.locator('aside').getByText(PRODUCT, { exact: true })).toBeVisible();
    await expect(page.locator('aside').getByText(PRODUCT_B, { exact: true })).not.toBeVisible();
    await expect(page.getByText(/sale held/i)).toBeVisible();

    await page.getByRole('button', { name: /^resume$/i }).click();
    await expect(page.locator('aside').getByText(PRODUCT_B, { exact: true })).toBeVisible();
    await expect(page.locator('aside').getByText(PRODUCT, { exact: true })).not.toBeVisible();
  });

  test('a weighted held sale survives a document reload, resists a second hold, and clears on discard', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: product, error } = await admin
      .from('products')
      .select('id')
      .eq('name', PRODUCT)
      .single();
    if (error || !product) throw new Error(error?.message ?? 'Product not found');
    await admin.from('products').update({ sold_by_weight: true }).eq('id', product.id);
    await admin.from('inventory').update({ quantity_on_hand: 10_000 }).eq('product_id', product.id);

    // D-04 baselines: hold/reload/resume/discard must produce none of these
    // before an actual payment — no order, payment, or stock-movement record.
    const inventoryBefore = await getInventoryQty(PRODUCT);
    const [{ count: ordersBefore }, { count: paymentsBefore }, { count: movementsBefore }] =
      await Promise.all([
        admin.from('orders').select('id', { count: 'exact', head: true }),
        admin.from('payments').select('id', { count: 'exact', head: true }),
        admin.from('stock_movements').select('id', { count: 'exact', head: true }),
      ]);

    // Captures the currently-rendered money text without hardcoding a
    // locale/currency-symbol format (cashier locale is not pinned to en-US
    // like the admin/manager/kitchen E2E accounts) — proves the exact same
    // price string survives reload/resume instead of just a recomputed
    // equal amount.
    const moneyText = () =>
      page
        .locator('aside')
        .getByText(/^(MX\$|\$)[\d,]*\d\.\d{2}$/)
        .first()
        .innerText();

    await page.goto('/');
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: /checkout/i }).click();
    await page.getByPlaceholder(/search products/i).fill(PRODUCT);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT}`, 'i') }).click();
    await page.getByRole('button', { name: '1' }).click();
    await page.getByRole('button', { name: '.', exact: true }).click();
    await page.getByRole('button', { name: '2' }).click();
    await page.getByRole('button', { name: '5' }).click();
    await page.getByRole('button', { name: /add to cart/i }).click();
    await expect(page.getByText(/weight: 1\.250 kg/i)).toBeVisible();
    const priceBeforeHold = await moneyText();

    await page.getByRole('button', { name: /^hold$/i }).click();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
    await expect(page.getByText(/sale held/i)).toBeVisible();

    // WebView document-restart boundary: a full reload tears down and
    // reinitializes the SPA document while native local storage survives.
    await page.reload();
    await expect(page.getByText(/sale held/i)).toBeVisible();
    await expect(page.getByText(/cart is empty/i)).toBeVisible();

    // A different active cart can be started after reload, but Hold stays
    // disabled while the rehydrated slot is occupied (D-01 one-slot guard).
    await page.getByPlaceholder(/search products/i).fill(PRODUCT_B);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT_B}`, 'i') }).click();
    await expect(page.getByRole('button', { name: /^hold$/i })).toBeDisabled();

    // Resume returns the ORIGINAL weighted cart to active — with its exact
    // weight and price intact — swapping the second (PRODUCT_B) cart into
    // the held slot instead of discarding it.
    await page.getByRole('button', { name: /^resume$/i }).click();
    await expect(page.locator('aside').getByText(PRODUCT, { exact: true })).toBeVisible();
    await expect(page.getByText(/weight: 1\.250 kg/i)).toBeVisible();
    expect(await moneyText()).toBe(priceBeforeHold);
    await expect(page.locator('aside').getByText(PRODUCT_B, { exact: true })).not.toBeVisible();
    await expect(page.getByText(/sale held/i)).toBeVisible();

    // Resume again so the original weighted cart is held once more, then
    // manually discard it — the only lifecycle transitions available.
    await page.getByRole('button', { name: /^resume$/i }).click();
    await expect(page.locator('aside').getByText(PRODUCT_B, { exact: true })).toBeVisible();
    await expect(page.locator('aside').getByText(PRODUCT, { exact: true })).not.toBeVisible();

    await page.getByRole('button', { name: /^discard$/i }).click();
    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: /^discard$/i }).click();
    await expect(page.getByText(/sale held/i)).not.toBeVisible();

    await page.reload();
    await expect(page.getByText(/sale held/i)).not.toBeVisible();

    expect(await getInventoryQty(PRODUCT)).toBe(inventoryBefore);
    const [{ count: ordersAfter }, { count: paymentsAfter }, { count: movementsAfter }] =
      await Promise.all([
        admin.from('orders').select('id', { count: 'exact', head: true }),
        admin.from('payments').select('id', { count: 'exact', head: true }),
        admin.from('stock_movements').select('id', { count: 'exact', head: true }),
      ]);
    expect(ordersAfter).toBe(ordersBefore);
    expect(paymentsAfter).toBe(paymentsBefore);
    expect(movementsAfter).toBe(movementsBefore);
  });
});
