import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 28 (Promotion Management Redesign), Plan 01 — D-01/D-02: the
 * promotion_targets junction table replaces the old scope_type/product_id/
 * category_id XOR columns. A promotion with zero target rows is store-wide
 * (matches any product); a promotion with N product rows and M category
 * rows matches any product referenced by any one of those N+M targets, not
 * just the first row.
 *
 * Seeded directly into `promotions` + `promotion_targets` via the
 * service-role client, mirroring scope-overlap-resolution.spec.ts's
 * seed-helper shape, adjusted for the new junction table.
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

async function findProductByName(admin: SupabaseClient, name: string): Promise<ProductRow> {
  const { data, error } = await admin
    .from('products')
    .select('id, name, base_price, category_id')
    .eq('name', name)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ProductRow;
}

async function seedPromotion(
  admin: SupabaseClient,
  createdBy: string,
  opts: {
    discountValue: number;
    targets: { productId?: string; categoryId?: string }[];
  }
): Promise<string> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E multi-target promo ${randomUUID()}`,
      discount_type: 'percent',
      discount_value: opts.discountValue,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const promotionId = data.id as string;
  seededPromotionIds.push(promotionId);

  if (opts.targets.length > 0) {
    const { error: targetsError } = await admin.from('promotion_targets').insert(
      opts.targets.map(t => ({
        promotion_id: promotionId,
        product_id: t.productId ?? null,
        category_id: t.categoryId ?? null,
      }))
    );
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
  if (error) throw new Error(error.message);
  const payment = payments[0];
  if (!payment) throw new Error('Payment not found');
  return Number(payment.amount);
}

test.describe('Multi-target promotion scope (D-01/D-02): junction table replaces singular product_id/category_id', () => {
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
    // ON DELETE CASCADE on promotion_targets.promotion_id cleans up target rows too.
    await admin.from('promotions').delete().in('id', seededPromotionIds);
    seededPromotionIds.length = 0;
  });

  test('a promotion with zero target rows applies store-wide, discounting any product', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findProductByName(admin, "Haldiram's Aloo Bhujia 200g");

    await seedPromotion(admin, adminStaffId, { discountValue: 20, targets: [] });

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(product.base_price * 0.8 * 100) / 100;
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
    await expect(cartLine.getByText('20% off')).toBeVisible();

    const charged = await payAndGetLastAmount(page);
    expect(charged).toBeCloseTo(expectedTotal, 2);
  });

  test('a promotion with 2 product-target rows + 1 category-target row applies to a product matched only by the category target', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const alooBhujia = await findProductByName(admin, "Haldiram's Aloo Bhujia 200g");
    const navrattanMix = await findProductByName(admin, "Haldiram's Navrattan Mix 200g");
    // Matched ONLY via the category target below — never listed as a
    // product-target row itself, proving the candidate pool covers every
    // target row, not just the first match (must_have truth).
    const parleG = await findProductByName(admin, 'Parle-G Biscuits 200g');

    await seedPromotion(admin, adminStaffId, {
      discountValue: 30,
      targets: [
        { productId: alooBhujia.id },
        { productId: navrattanMix.id },
        { categoryId: parleG.category_id },
      ],
    });

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(parleG.base_price * 0.7 * 100) / 100;
    const expectedTotal = computeAuthoritativeTotal(discountedPrice, taxRatePercent, taxInclusive);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(parleG.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(parleG.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${parleG.id}`) });
    await expect(cartLine.getByText('30% off')).toBeVisible();

    const charged = await payAndGetLastAmount(page);
    expect(charged).toBeCloseTo(expectedTotal, 2);
  });
});
