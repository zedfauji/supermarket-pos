import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 07 — PROMO-09 scope-overlap scenario.
 *
 * Proves best-price-wins resolution (evaluateBestPromotion / process_direct_sale_atomic,
 * Plan 01) is driven purely by discount AMOUNT, never by scope specificity (D-05: no
 * "product-scoped beats category-scoped" override) — a product simultaneously matched
 * by an active product-scoped promotion AND an active category-scoped promotion always
 * resolves to whichever discounts more, regardless of which promotion type or which was
 * created first. Also proves the zero-promotions baseline: with no active promotions
 * store-wide, checkout charges undiscounted list price, matching
 * e2e/checkout/happy-path.spec.ts's own list-price assertions (cross-referenced here,
 * not duplicated).
 */

const seededPromotionIds: string[] = [];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ProductRow {
  id: string;
  name: string;
  base_price: number;
  category_id: string;
}

async function findScopedProduct(admin: SupabaseClient): Promise<ProductRow> {
  const { data, error } = await admin
    .from('products')
    .select('id, name, base_price, category_id')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Product not found');
  return data as unknown as ProductRow;
}

async function seedPromotion(
  admin: SupabaseClient,
  createdBy: string,
  opts: { productId?: string; categoryId?: string; discountValue: number }
): Promise<string> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E scope-overlap promo ${randomUUID()}`,
      discount_type: 'percent',
      discount_value: opts.discountValue,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'promotion insert failed');
  const promotionId = data.id as string;
  seededPromotionIds.push(promotionId);

  const { productId, categoryId } = opts;
  if (productId ?? categoryId) {
    const { error: targetsError } = await admin.from('promotion_targets').insert({
      promotion_id: promotionId,
      product_id: productId ?? null,
      category_id: categoryId ?? null,
    });
    if (targetsError) throw new Error(targetsError.message);
  }

  return promotionId;
}

async function payAndGetLastAmount(page: Page): Promise<number> {
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

  const admin = getServiceClient();
  const { data: payments, error } = await admin
    .from('payments')
    .select('amount')
    .order('processed_at', { ascending: false })
    .limit(1);
  if (error || !payments?.[0]) throw new Error(error?.message ?? 'Payment not found');
  return Number(payments[0].amount);
}

test.describe('Scope-overlap resolution: best-price-wins is discount-amount-driven (PROMO-09)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test.afterEach(async () => {
    if (seededPromotionIds.length === 0) return;
    const admin = getServiceClient();
    await admin.from('promotions').delete().in('id', seededPromotionIds);
    seededPromotionIds.length = 0;
  });

  test('category-scoped promotion wins when it discounts more than the overlapping product-scoped promotion', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);

    await seedPromotion(admin, adminStaffId, { productId: product.id, discountValue: 10 });
    await seedPromotion(admin, adminStaffId, { categoryId: product.category_id, discountValue: 25 });

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(Number(product.base_price) * 0.75 * 100) / 100;
    const expectedTotal = computeAuthoritativeTotal(discountedPrice, taxRatePercent, taxInclusive);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(product.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(product.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${product.id}`) });
    await expect(cartLine.getByText('25% off')).toBeVisible();
    await expect(cartLine.getByText('10% off')).toHaveCount(0);

    const charged = await payAndGetLastAmount(page);
    expect(charged).toBeCloseTo(expectedTotal, 2);
  });

  test('product-scoped promotion still wins when it discounts more, proving the winner is amount-driven not scope-type-driven', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);

    // Reversed relative to the test above: product-scoped now carries the LARGER discount.
    await seedPromotion(admin, adminStaffId, { productId: product.id, discountValue: 25 });
    await seedPromotion(admin, adminStaffId, { categoryId: product.category_id, discountValue: 10 });

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(Number(product.base_price) * 0.75 * 100) / 100;
    const expectedTotal = computeAuthoritativeTotal(discountedPrice, taxRatePercent, taxInclusive);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(product.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(product.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${product.id}`) });
    await expect(cartLine.getByText('25% off')).toBeVisible();
    await expect(cartLine.getByText('10% off')).toHaveCount(0);

    const charged = await payAndGetLastAmount(page);
    expect(charged).toBeCloseTo(expectedTotal, 2);
  });

  test('with zero active promotions store-wide, checkout charges undiscounted list price (matches e2e/checkout/happy-path.spec.ts baseline)', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const product = await findScopedProduct(admin);

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const expectedTotal = computeAuthoritativeTotal(
      Number(product.base_price),
      taxRatePercent,
      taxInclusive
    );

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(product.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(product.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${product.id}`) });
    await expect(cartLine.locator('[aria-label="Promotion applied"]')).toHaveCount(0);
    await expect(cartLine.getByText(/% off/)).toHaveCount(0);

    const charged = await payAndGetLastAmount(page);
    expect(charged).toBeCloseTo(expectedTotal, 2);
  });
});
