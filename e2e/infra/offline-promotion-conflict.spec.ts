import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 06 — PROMO-08.
 *
 * Proves a discount computed while offline is never silently trusted or
 * silently re-priced once the terminal reconnects: a cashier adds a
 * promotion-discounted product to the cart while offline (from cached
 * TanStack Query data), the promotion is then changed server-side
 * (simulating a change that happened elsewhere while this terminal was
 * offline), and on reconnect the affected cart line is flagged for review
 * rather than either keeping the stale price or silently jumping to the new
 * one — checkout stays blocked until the cashier explicitly reviews it.
 */

let cajaSessionId = '';
const seededPromotionIds: string[] = [];
const seededProductIds: { productId: string; categoryId: string }[] = [];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedProduct(
  admin: SupabaseClient,
  basePrice: number
): Promise<{ productId: string; categoryId: string; name: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `E2E Offline-Promo Product ${suffix}`;

  const { data: category, error: catErr } = await admin
    .from('categories')
    .insert({ name: `E2E Offline-Promo Category ${suffix}` })
    .select('id')
    .single();
  if (catErr || !category) throw new Error(`seedProduct: category insert failed - ${catErr?.message}`);

  const { data: product, error: prodErr } = await admin
    .from('products')
    .insert({
      name,
      category_id: category.id,
      base_price: basePrice,
      is_active: true,
      sold_by_weight: false,
    })
    .select('id')
    .single();
  if (prodErr || !product) throw new Error(`seedProduct: product insert failed - ${prodErr?.message}`);

  const { error: invErr } = await admin
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: 100, cost_price: 1 });
  if (invErr) throw new Error(`seedProduct: inventory insert failed - ${invErr.message}`);

  seededProductIds.push({ productId: product.id as string, categoryId: category.id as string });
  return { productId: product.id as string, categoryId: category.id as string, name };
}

async function seedPromotion(
  admin: SupabaseClient,
  createdBy: string,
  productId: string,
  discountValue: number
): Promise<string> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E offline-promo ${Date.now()}`,
      scope_type: 'product',
      product_id: productId,
      discount_type: 'percent',
      discount_value: discountValue,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedPromotion: insert failed - ${error?.message}`);
  seededPromotionIds.push(data.id as string);
  return data.id as string;
}

async function addProductToCart(page: Page, productName: string): Promise<void> {
  await page.getByPlaceholder(/search products/i).fill(productName);
  await page
    .getByRole('button', { name: new RegExp(`select ${escapeRe(productName)}`, 'i') })
    .click();
}

test.describe('Offline promotion conflict on reconnect (PROMO-08)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test.afterEach(async ({ page }) => {
    // Belt-and-suspenders: make sure a failed assertion mid-test doesn't
    // leave the browser context offline for a later test in the same worker.
    await page.context().setOffline(false).catch(() => undefined);
    const admin = getServiceClient();
    if (seededPromotionIds.length > 0) {
      await admin.from('promotions').delete().in('id', seededPromotionIds);
      seededPromotionIds.length = 0;
    }
    for (const { productId, categoryId } of seededProductIds) {
      await admin.from('inventory').delete().eq('product_id', productId);
      await admin.from('products').delete().eq('id', productId);
      await admin.from('categories').delete().eq('id', categoryId);
    }
    seededProductIds.length = 0;
    void cajaSessionId;
  });

  test('a promotion changed while offline flags the cart line on reconnect instead of silently re-pricing it', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { productId, name } = await seedProduct(admin, 50);
    await seedPromotion(admin, adminStaffId, productId, 20); // 50 -> 40.00

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);

    // Let the promoted product's discounted price resolve into TanStack
    // Query's cache while still online — this is the "cached data" the cart
    // line will rely on once offline.
    await page.getByPlaceholder(/search products/i).fill(name);
    await expect(
      page.getByRole('button', { name: new RegExp(`select ${escapeRe(name)}`, 'i') })
    ).toBeVisible({ timeout: 15_000 });

    await page.context().setOffline(true);

    await addProductToCart(page, name);

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${productId}`) });
    // (a) the discounted price still displays from cached data while offline.
    await expect(cartLine.locator('[aria-label="Promotion applied"]')).toBeVisible();
    await expect(cartLine.getByText('20% off')).toBeVisible();
    await expect(cartLine).toContainText('40.00');

    const processPaymentButton = page.getByRole('button', { name: /^process payment$/i });
    await expect(processPaymentButton).toBeEnabled();

    // Simulate the promotion changing elsewhere while this terminal was
    // offline — discount drops from 20% to 10% (50 -> 45.00).
    await admin.from('promotions').update({ discount_value: 10 }).eq('product_id', productId);

    await page.context().setOffline(false);

    // (b) the line is flagged for review rather than silently jumping to the
    // fresh price or silently keeping the stale one.
    const conflictIndicator = cartLine.getByRole('button', { name: /price changed/i });
    await expect(conflictIndicator).toBeVisible({ timeout: 30_000 });
    await expect(cartLine).toContainText('40.00');

    // (c) checkout is blocked while the conflict is unresolved.
    await expect(processPaymentButton).toBeDisabled();

    // (d) tapping the indicator resolves it to the fresh price and re-enables checkout.
    await conflictIndicator.click();
    await expect(conflictIndicator).not.toBeVisible();
    await expect(cartLine).toContainText('45.00');
    await expect(processPaymentButton).toBeEnabled();

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const expectedTotal = computeAuthoritativeTotal(45, taxRatePercent, taxInclusive);

    await processPaymentButton.click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('amount')
      .order('processed_at', { ascending: false })
      .limit(1);
    if (paymentsError || !payments?.[0]) throw new Error(paymentsError?.message ?? 'Payment not found');
    expect(Number(payments[0].amount)).toBeCloseTo(expectedTotal, 2);
  });
});
