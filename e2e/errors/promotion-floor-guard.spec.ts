import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 04 — PROMO-07.
 *
 * Proves the below-cost floor guard end to end: a qualifying promotion that
 * would price a line below its inventory cost_price is blocked by
 * process_direct_sale_atomic (BELOW_COST_REQUIRES_OVERRIDE), surfaces the
 * exact UI-SPEC copy with no completed sale, and a manager PIN unblocks the
 * SAME payment attempt so it completes at the (allowed) below-cost price —
 * all against a real checkout, not mocked (CLAUDE.md testing policy).
 */

const BASE_PRICE = 100;
const COST_PRICE = 95; // 20% off -> 80, below the 95 cost.
const DISCOUNT_PERCENT = 20;
const DISCOUNTED_PRICE = Math.round(BASE_PRICE * (1 - DISCOUNT_PERCENT / 100) * 100) / 100; // 80

interface ProductFixture {
  categoryId: string;
  productId: string;
  name: string;
}

let seededProduct: ProductFixture | null = null;
let seededPromotionId: string | null = null;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Seeds an isolated category + product + inventory row with a below-cost margin. */
async function seedBelowCostProduct(admin: SupabaseClient): Promise<ProductFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `E2E Below-Cost Product ${suffix}`;

  const { data: category, error: catErr } = await admin
    .from('categories')
    .insert({ name: `E2E Floor-Guard Category ${suffix}` })
    .select('id')
    .single();
  if (catErr || !category) throw new Error(`seedBelowCostProduct: category insert failed - ${catErr?.message}`);

  const { data: product, error: prodErr } = await admin
    .from('products')
    .insert({
      name,
      category_id: category.id,
      base_price: BASE_PRICE,
      is_active: true,
      sold_by_weight: false,
    })
    .select('id')
    .single();
  if (prodErr || !product) throw new Error(`seedBelowCostProduct: product insert failed - ${prodErr?.message}`);

  const { error: invErr } = await admin
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: 100, cost_price: COST_PRICE });
  if (invErr) throw new Error(`seedBelowCostProduct: inventory insert failed - ${invErr.message}`);

  return { categoryId: category.id as string, productId: product.id as string, name };
}

async function seedPromotion(
  admin: SupabaseClient,
  createdBy: string,
  productId: string
): Promise<string> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E floor-guard promo ${randomUUID()}`,
      discount_type: 'percent',
      discount_value: DISCOUNT_PERCENT,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedPromotion: insert failed - ${error?.message}`);
  const promotionId = data.id as string;

  const { error: targetsError } = await admin
    .from('promotion_targets')
    .insert({ promotion_id: promotionId, product_id: productId });
  if (targetsError) throw new Error(`seedPromotion: targets insert failed - ${targetsError.message}`);

  return promotionId;
}

test.describe('Below-cost floor guard (PROMO-07)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    // Logged in as manager (mirrors e2e/reports/discount-and-revenue.spec.ts
    // and e2e/payments/edge-cases.spec.ts's manager-PIN-gated flows): the
    // RPC's server-side apply_custom_discount re-check is keyed off the
    // CURRENTLY LOGGED-IN staff's id (currentStaff), not the staff who
    // enters the PIN in ManagerPinDialog — a logged-in cashier submitting a
    // "manager approved this" attempt still fails FORBIDDEN server-side
    // because the payment's own p_staff_id is the cashier's, so every
    // existing manager-PIN-gated spec in this codebase logs in as manager.
    await loginAs(page, 'manager');
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    if (seededPromotionId) {
      await admin.from('promotions').delete().eq('id', seededPromotionId);
      seededPromotionId = null;
    }
    if (seededProduct) {
      await admin.from('inventory').delete().eq('product_id', seededProduct.productId);
      await admin.from('products').delete().eq('id', seededProduct.productId);
      await admin.from('categories').delete().eq('id', seededProduct.categoryId);
      seededProduct = null;
    }
  });

  test('a below-cost promotion blocks checkout with the UI-SPEC message and no completed sale, then a manager PIN completes the same attempt at the below-cost price', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');

    seededProduct = await seedBelowCostProduct(admin);
    seededPromotionId = await seedPromotion(admin, adminStaffId, seededProduct.productId);

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const expectedTotal = computeAuthoritativeTotal(DISCOUNTED_PRICE, taxRatePercent, taxInclusive);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(seededProduct.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(seededProduct.name)}`, 'i') })
      .click();

    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();

    // Blocked: exact UI-SPEC copy renders, sale is not completed.
    await expect(page.getByText(/this discount would sell below cost/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /done/i })).not.toBeVisible();

    // Manager PIN unblocks — the SAME payment attempt resubmits automatically.
    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    for (const ch of managerPin) {
      const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
      await pinDialog.getByRole('button', { name: label }).click();
    }
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

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
