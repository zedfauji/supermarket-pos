import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { getBillingTaxConfig, computeAuthoritativeTotal } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 03.
 *
 * Proves PROMO-03's client display end to end: a qualifying product/category
 * promotion shows its discounted price live in the cart the moment it's
 * added, checkout charges the discounted total (not list price), and a
 * non-promoted product on the same cart stays unaffected — all against a
 * real checkout, not mocked (this project's CLAUDE.md testing policy).
 */

let cajaSessionId = '';
const seededPromotionIds: string[] = [];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      name: `E2E promo ${randomUUID()}`,
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

interface ProductRow {
  id: string;
  name: string;
  base_price: number;
  category_id: string;
}

async function findTwoCategoryDistinctProducts(
  admin: SupabaseClient
): Promise<{ productA: ProductRow; productB: ProductRow }> {
  const { data: productA, error: aErr } = await admin
    .from('products')
    .select('id, name, base_price, category_id')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .single();
  if (aErr || !productA) throw new Error(aErr?.message ?? 'Product A not found');

  // Excludes a near-expiry inventory row (28-05 fix): process_direct_sale_atomic's
  // PROMO-02 expiry-proximity auto-discount (Phase 27, unrelated to this test)
  // would otherwise silently apply to whatever arbitrary product gets picked as
  // "productB" (the control, expected to show NO discount at all), tripping a
  // false failure on the "unrelated product stays full price" assertion.
  const nearExpiryCutoff = new Date();
  nearExpiryCutoff.setDate(nearExpiryCutoff.getDate() + 14);
  const nearExpiryCutoffStr = nearExpiryCutoff.toISOString().slice(0, 10);

  const { data: candidates, error: bErr } = await admin
    .from('products')
    .select('id, name, base_price, category_id, inventory(expiry_date)')
    .eq('is_active', true)
    .eq('sold_by_weight', false)
    .neq('id', productA.id)
    .limit(20);
  if (bErr) throw new Error(bErr.message);
  const productB = (candidates ?? []).find(p => {
    if (p.category_id === productA.category_id) return false;
    const inv = p.inventory as { expiry_date: string | null } | { expiry_date: string | null }[] | null;
    const invRow = Array.isArray(inv) ? inv[0] : inv;
    const expiryDate = invRow?.expiry_date;
    return !expiryDate || expiryDate > nearExpiryCutoffStr;
  });
  if (!productB) throw new Error('No second product in a different category found for the control case');

  return {
    productA: productA as unknown as ProductRow,
    productB: productB as unknown as ProductRow,
  };
}

test.describe('Live promotion price display (PROMO-03)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test.afterEach(async () => {
    if (seededPromotionIds.length === 0) return;
    const admin = getServiceClient();
    await admin.from('promotions').delete().in('id', seededPromotionIds);
    seededPromotionIds.length = 0;
  });

  test('product-scoped promotion shows a live discount and charges the discounted total; unrelated product stays full price', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { productA: promoProduct, productB: controlProduct } =
      await findTwoCategoryDistinctProducts(admin);

    await seedPromotion(admin, adminStaffId, { productId: promoProduct.id, discountValue: 20 });

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(Number(promoProduct.base_price) * 0.8 * 100) / 100;
    const expectedTotal = computeAuthoritativeTotal(discountedPrice, taxRatePercent, taxInclusive);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(promoProduct.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(promoProduct.name)}`, 'i') })
      .click();

    // (a) cart line reflects the discount: Zap indicator + rounded "X% off" badge.
    const promoLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${promoProduct.id}`) });
    await expect(promoLine.locator('[aria-label="Promotion applied"]')).toBeVisible();
    await expect(promoLine.getByText('20% off')).toBeVisible();

    // control product: same cart, no discount indicator, full list price.
    await page.getByPlaceholder(/search products/i).fill(controlProduct.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(controlProduct.name)}`, 'i') })
      .click();
    const controlLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${controlProduct.id}`) });
    await expect(controlLine.locator('[aria-label="Promotion applied"]')).toHaveCount(0);
    await expect(controlLine.getByText(/% off/)).toHaveCount(0);

    // Remove the control item so the checkout total below isolates the
    // promoted line's discounted price.
    await controlLine.getByRole('button', { name: /remove/i }).click();

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

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('amount')
      .order('processed_at', { ascending: false })
      .limit(1);
    if (paymentsError || !payments?.[0]) throw new Error(paymentsError?.message ?? 'Payment not found');
    expect(Number(payments[0].amount)).toBeCloseTo(expectedTotal, 2);
  });

  test('category-scoped promotion applies via category_id alone, with no product-level promotion row', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { productB: categoryProduct } = await findTwoCategoryDistinctProducts(admin);

    await seedPromotion(admin, adminStaffId, {
      categoryId: categoryProduct.category_id,
      discountValue: 10,
    });

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(categoryProduct.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(categoryProduct.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${categoryProduct.id}`) });
    await expect(cartLine.locator('[aria-label="Promotion applied"]')).toBeVisible();
    await expect(cartLine.getByText('10% off')).toBeVisible();
  });
});
