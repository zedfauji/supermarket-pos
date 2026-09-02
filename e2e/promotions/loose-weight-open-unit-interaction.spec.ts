import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 07 — PROMO-09
 * loose-weight/open-unit interaction scenario.
 *
 * Part 1 (loose-weight): a promotion scoped to a sold-by-weight product must
 * discount the line's already weight-adjusted expected price (catalog
 * price-per-kg * kg), not the full per-kg list price —
 * process_direct_sale_atomic already computes it this way server-side
 * (v_expected_price is weight-adjusted BEFORE the promotion discount is
 * applied, 20260901000002_process_direct_sale_atomic_promotions.sql). This
 * spec also closes a real client-side gap found while writing it: selecting a
 * loose-weight product directly from the product grid (as opposed to via
 * barcode/Product-Peek) opens ProductGrid's own local WeightEntryDialog,
 * which — until this plan — never received a resolved promotion price
 * (flagged as a known gap in 27-03-SUMMARY.md). Fixed here (Rule 1/2): both
 * ProductGrid and CheckoutPanel now thread `resolvePromotionMatch` into that
 * dialog's `pricePerKgOverride`/`promotionId`, exactly like every other
 * add-to-cart path already does.
 *
 * Part 2 (open-unit): a promotion scoped to an open-unit LOOSE (child)
 * product must apply independently of whatever promotion (if any) targets
 * its parent BOX product — matching is by exact product_id, never by
 * parent/child relationship.
 */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CATEGORY_NAME = 'E2E Promo Interaction Fixtures';
const LOOSE_WEIGHT_PRODUCT = 'E2E Promo Loose Weight';
const LOOSE_WEIGHT_PRICE_PER_KG = 20;
const BOX_PRODUCT = 'E2E Promo OU Box';
const BOX_PRICE = 100;
const UNITS_PER_PACKAGE = 10;
const CHILD_PRODUCT = 'E2E Promo OU Loose';
const CHILD_PRICE = 8;

/** Idempotently creates the three fixture products (+ category + inventory) this file needs. */
async function ensureFixtures(): Promise<{ looseWeightId: string; boxId: string; childId: string }> {
  const admin = getServiceClient();

  let categoryId: string;
  const { data: existingCategory } = await admin
    .from('categories')
    .select('id')
    .eq('name', CATEGORY_NAME)
    .maybeSingle();
  if (existingCategory) {
    categoryId = existingCategory.id as string;
  } else {
    const { data: category, error } = await admin
      .from('categories')
      .insert({ name: CATEGORY_NAME, sort_order: 999 })
      .select('id')
      .single();
    if (error || !category) throw new Error(`ensureFixtures: category create failed - ${error?.message}`);
    categoryId = category.id as string;
  }

  // patch is typed loosely (Record) and cast at the call site (`as never`) —
  // mirrors e2e/inventory/open-units.spec.ts's own workaround for passing a
  // dynamic column subset through the strictly-typed Supabase client.
  async function upsertProduct(
    name: string,
    patch: Record<string, unknown>
  ): Promise<string> {
    const { data: existing } = await admin.from('products').select('id').eq('name', name).maybeSingle();
    if (existing) {
      const { error } = await admin
        .from('products')
        .update(patch as never)
        .eq('id', existing.id as string);
      if (error) throw new Error(`ensureFixtures: update failed for "${name}" - ${error.message}`);
      return existing.id as string;
    }
    const { data: created, error } = await admin
      .from('products')
      .insert({ name, category_id: categoryId, is_active: true, ...patch } as never)
      .select('id')
      .single();
    if (error || !created) throw new Error(`ensureFixtures: create failed for "${name}" - ${error?.message}`);
    return created.id as string;
  }

  const looseWeightId = await upsertProduct(LOOSE_WEIGHT_PRODUCT, {
    base_price: LOOSE_WEIGHT_PRICE_PER_KG,
    sold_by_weight: true,
  });
  const boxId = await upsertProduct(BOX_PRODUCT, {
    base_price: BOX_PRICE,
    sold_by_weight: false,
    units_per_package: UNITS_PER_PACKAGE,
  });
  const childId = await upsertProduct(CHILD_PRODUCT, {
    base_price: CHILD_PRICE,
    sold_by_weight: false,
    parent_product_id: boxId,
  });

  for (const productId of [looseWeightId, boxId, childId]) {
    const { data: inv } = await admin.from('inventory').select('id').eq('product_id', productId).maybeSingle();
    if (!inv) {
      const { error } = await admin
        .from('inventory')
        .insert({ product_id: productId, quantity_on_hand: 10_000, low_stock_threshold: 5 });
      if (error) throw new Error(`ensureFixtures: inventory create failed - ${error.message}`);
    } else {
      await admin.from('inventory').update({ quantity_on_hand: 10_000 }).eq('product_id', productId);
    }
  }

  return { looseWeightId, boxId, childId };
}

const seededPromotionIds: string[] = [];

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
      name: `E2E loose-weight/open-unit promo ${randomUUID()}`,
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
  if (error || !data) throw new Error(error?.message ?? 'promotion insert failed');
  seededPromotionIds.push(data.id as string);
  return data.id as string;
}

test.describe('Loose-weight and open-unit interaction with promotions (PROMO-09)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await ensureFixtures();
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

  test('a promotion on a loose-weight product discounts the weight-adjusted expected price, not the full per-kg list price', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { looseWeightId } = await ensureFixtures();
    // resetTestState() (this file's beforeEach, after ensureFixtures) blanket-resets
    // sold_by_weight=false on every product for test isolation — restore it for this
    // one fixture right before use, mirroring loose-weight-hold-sale.spec.ts's own
    // per-test re-assertion of the flag.
    await admin.from('products').update({ sold_by_weight: true }).eq('id', looseWeightId);
    await seedPromotion(admin, adminStaffId, looseWeightId, 20);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(LOOSE_WEIGHT_PRODUCT);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(LOOSE_WEIGHT_PRODUCT)}`, 'i') })
      .click();

    // 0.500 kg via the weight keypad (mirrors e2e/inventory/loose-weight-hold-sale.spec.ts).
    await page.getByRole('button', { name: '0', exact: true }).click();
    await page.getByRole('button', { name: '.', exact: true }).click();
    await page.getByRole('button', { name: '5', exact: true }).click();
    await page.getByRole('button', { name: /add to cart/i }).click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${looseWeightId}`) });
    await expect(cartLine.getByText('20% off')).toBeVisible();

    // Weight-adjusted expected price BEFORE discount: 20 * 0.5 = 10.00.
    // Discounted: 10.00 * 0.8 = 8.00 — never 20 * 0.8 = 16.00 (the
    // undiscounted-full-per-kg mistake this scenario guards against).
    const expectedLinePrice = Math.round(LOOSE_WEIGHT_PRICE_PER_KG * 0.5 * 100) / 100;
    const expectedDiscounted = Math.round(expectedLinePrice * 0.8 * 100) / 100;
    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const expectedTotal = computeAuthoritativeTotal(expectedDiscounted, taxRatePercent, taxInclusive);

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

  test("an open-unit loose (child) product's own promotion applies independently of a different promotion on its parent box product", async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { boxId, childId } = await ensureFixtures();

    // Deliberately different discounts and deliberately seed the PARENT's
    // promotion too — proves the child's line is unaffected by it.
    await seedPromotion(admin, adminStaffId, boxId, 40);
    await seedPromotion(admin, adminStaffId, childId, 15);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(CHILD_PRODUCT);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(CHILD_PRODUCT)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${childId}`) });
    await expect(cartLine.getByText('15% off')).toBeVisible();
    await expect(cartLine.getByText('40% off')).toHaveCount(0);

    const expectedDiscounted = Math.round(CHILD_PRICE * 0.85 * 100) / 100;
    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const expectedTotal = computeAuthoritativeTotal(expectedDiscounted, taxRatePercent, taxInclusive);

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
});
