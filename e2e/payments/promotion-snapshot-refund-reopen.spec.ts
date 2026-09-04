import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { getBillingTaxConfig, computeAuthoritativeTotal } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 05 — PROMO-06.
 *
 * Proves a promotion's discount, once snapshotted onto `order_items` at sale
 * time (Plan 01: promotion_id/discount_rate/discount_amount), survives the
 * promotion's own deletion, a refund, and a reopen — exactly as recorded —
 * and that the existing product-sales margin report is automatically
 * correct against the discounted price with zero report-code changes. All
 * against a real checkout/refund/reopen flow (CLAUDE.md testing policy —
 * no manual UAT).
 */

let cajaSessionId = '';
const seededPromotionIds: string[] = [];
const seededProductIds: { productId: string; categoryId: string }[] = [];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedProduct(
  admin: SupabaseClient,
  basePrice: number,
  costPrice: number
): Promise<{ productId: string; categoryId: string; name: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `E2E Promo-Snapshot Product ${suffix}`;

  const { data: category, error: catErr } = await admin
    .from('categories')
    .insert({ name: `E2E Promo-Snapshot Category ${suffix}` })
    .select('id')
    .single();
  if (catErr || !category) throw new Error(`seedProduct: category insert failed - ${catErr?.message}`);

  const { data: product, error: prodErr } = await admin
    .from('products')
    .insert({ name, category_id: category.id, base_price: basePrice, is_active: true, sold_by_weight: false })
    .select('id')
    .single();
  if (prodErr || !product) throw new Error(`seedProduct: product insert failed - ${prodErr?.message}`);

  const { error: invErr } = await admin
    .from('inventory')
    .insert({ product_id: product.id, quantity_on_hand: 100, cost_price: costPrice });
  if (invErr) throw new Error(`seedProduct: inventory insert failed - ${invErr.message}`);

  seededProductIds.push({ productId: product.id as string, categoryId: category.id as string });
  return { productId: product.id as string, categoryId: category.id as string, name };
}

async function seedPercentPromotion(
  admin: SupabaseClient,
  createdBy: string,
  productId: string,
  discountValue: number
): Promise<{ id: string; name: string }> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E promo-snapshot ${randomUUID()}`,
      discount_type: 'percent',
      discount_value: discountValue,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(`seedPercentPromotion: insert failed - ${error?.message}`);
  const promotionId = data.id as string;
  seededPromotionIds.push(promotionId);

  const { error: targetsError } = await admin
    .from('promotion_targets')
    .insert({ promotion_id: promotionId, product_id: productId });
  if (targetsError) throw new Error(`seedPercentPromotion: targets insert failed - ${targetsError.message}`);

  return { id: promotionId, name: data.name as string };
}

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    await page.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
  }
}

/** Buys one unit of `productName` via the direct-sale checkout, cash, and dismisses the receipt. */
async function checkoutOneUnit(page: Page, productName: string, tenderedAmount: string): Promise<void> {
  await page.getByRole('button', { name: /checkout/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByPlaceholder(/search products/i).fill(productName);
  await page
    .getByRole('button', { name: new RegExp(`select ${escapeRe(productName)}`, 'i') })
    .click();

  await page
    .getByRole('button', { name: /^process payment$/i })
    .first()
    .click();
  await page.getByLabel(/amount tendered/i).fill(tenderedAmount);
  await page
    .getByRole('button', { name: /^process payment$/i })
    .last()
    .click();
  await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /done/i }).click();
}

async function latestPaymentId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from('payments')
    .select('id')
    .order('processed_at', { ascending: false })
    .limit(1);
  if (error || !data?.[0]) throw new Error(error?.message ?? 'latestPaymentId: no payment found');
  return data[0].id as string;
}

/** Deletes a promotion via the admin-only /promotions page — the deletion path PROMO-06 must survive. */
async function deletePromotionViaAdminUI(page: Page, promoName: string): Promise<void> {
  await page.goto('/promotions');
  const row = page.locator('tbody tr').filter({ hasText: promoName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Delete' }).click();

  const confirmDialog = page.getByRole('alertdialog', { name: /delete this promotion/i });
  await expect(confirmDialog).toBeVisible({ timeout: 8_000 });
  await confirmDialog.getByRole('button', { name: 'Delete' }).click();
  await expect(row).not.toBeVisible({ timeout: 10_000 });
}

/** Reopens a paid sale from /payments, PIN-approved, and returns once the success toast is shown. */
async function reopenTicket(page: Page, paymentId: string, adminPin: string): Promise<void> {
  await gotoAuthed(page, '/payments');
  const row = page.getByTestId(`payment-row-${paymentId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i }).click();

  const dialog = page.getByRole('dialog', { name: /reopen ticket|reabrir cuenta/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.locator('#reopen-tab-reason').fill('E2E PROMO-06 reopen — promotion already deleted');
  await dialog.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

  const pinDialog = page.getByRole('alertdialog');
  await expect(pinDialog).toBeVisible({ timeout: 8_000 });
  await enterPin(page, adminPin);

  await expect(
    page.getByText(/ticket reopened successfully|cuenta reabierta correctamente/i)
  ).toBeVisible({ timeout: 15_000 });
}

/** Selects the (only) reopened tab from the waiting-for-payment list and clears the PIN gate. */
async function openReopenedTabPaymentForm(page: Page, adminPin: string): Promise<void> {
  const list = page.getByTestId('tabs-waiting-for-payment');
  await expect(list).toBeVisible({ timeout: 20_000 });
  await list.getByRole('button').first().click();
  await page
    .getByRole('button', { name: /verify pin to process payment|verificar pin/i })
    .click();

  const payPinDialog = page.getByRole('alertdialog', {
    name: /manager access required|se requiere acceso de gerente/i,
  });
  await expect(payPinDialog).toBeVisible({ timeout: 10_000 });
  await enterPin(page, adminPin);
  await expect(payPinDialog).not.toBeVisible({ timeout: 10_000 });
}

test.describe('Promotion discount snapshot survives deletion, refund, and reopen (PROMO-06)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(500);
    await page.goto('/');
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    if (seededPromotionIds.length > 0) {
      await admin.from('promotions').delete().in('id', seededPromotionIds);
      seededPromotionIds.length = 0;
    }
    for (const { productId, categoryId } of seededProductIds) {
      // Every test in this file completes a real sale (and test (b) a real
      // refund) against the seeded product, so order_items/refund_items rows
      // reference it — deleting products/categories without unwinding those
      // first previously failed silently on the FK constraint (23503,
      // products_category_id_fkey / order_items_product_id_fkey /
      // refund_items_order_item_id_fkey — no error check on any of the 3
      // deletes below let every prior run's fixtures leak permanently; found
      // via Plan 27-07's full-suite verification, which surfaced 14
      // accumulated leftover "E2E Promo-Snapshot Category/Product" rows
      // polluting the shared catalog and tripping an unrelated receipt spec
      // that picks "any real category" from the live catalog). Unwind in FK
      // order: refund_items -> order_items -> inventory -> products ->
      // categories, mirroring e2e/inventory/open-units.spec.ts's own
      // order_items-first cleanup precedent.
      const { data: orderItemRows } = await admin
        .from('order_items')
        .select('id')
        .eq('product_id', productId);
      const orderItemIds = (orderItemRows ?? []).map(row => row.id as string);
      if (orderItemIds.length > 0) {
        await admin.from('refund_items').delete().in('order_item_id', orderItemIds);
      }
      await admin.from('order_items').delete().eq('product_id', productId);
      await admin.from('inventory').delete().eq('product_id', productId);
      await admin.from('products').delete().eq('id', productId);
      await admin.from('categories').delete().eq('id', categoryId);
    }
    seededProductIds.length = 0;
    void cajaSessionId;
  });

  test('(a) a reopened sale still shows its historical discount after the promotion is deleted', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await loginAs(page, 'admin');

    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { productId, name } = await seedProduct(admin, 50, 5);
    const promo = await seedPercentPromotion(admin, adminStaffId, productId, 10);

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(50 * 0.9 * 100) / 100; // 45.00
    const expectedTotal = computeAuthoritativeTotal(discountedPrice, taxRatePercent, taxInclusive);

    await checkoutOneUnit(page, name, '100');
    const paymentId = await latestPaymentId(admin);

    const { data: chargedPayment } = await admin
      .from('payments')
      .select('amount')
      .eq('id', paymentId)
      .single();
    expect(Number(chargedPayment?.amount)).toBeCloseTo(expectedTotal, 2);

    // Order item snapshotted the discount server-side before any UI action.
    const { data: seededItem } = await admin
      .from('order_items')
      .select('discount_rate, discount_amount, unit_price')
      .eq('product_id', productId)
      .single();
    expect(Number(seededItem?.discount_rate)).toBeCloseTo(10, 1);
    expect(Number(seededItem?.discount_amount)).toBeCloseTo(5, 2);
    expect(Number(seededItem?.unit_price)).toBeCloseTo(discountedPrice, 2);

    // Delete the promotion the sale used — the snapshot must not depend on
    // the promotions row still existing (order_items.promotion_id is
    // ON DELETE SET NULL; discount_rate/discount_amount are independent
    // numeric columns that never re-derive from a live promotion lookup).
    await deletePromotionViaAdminUI(page, promo.name);

    const { data: postDeleteItem } = await admin
      .from('order_items')
      .select('promotion_id, discount_rate, discount_amount')
      .eq('product_id', productId)
      .single();
    expect(postDeleteItem?.promotion_id).toBeNull();
    expect(Number(postDeleteItem?.discount_rate)).toBeCloseTo(10, 1);
    expect(Number(postDeleteItem?.discount_amount)).toBeCloseTo(5, 2);

    const adminPin = process.env['E2E_ADMIN_PIN'] ?? '';
    await reopenTicket(page, paymentId, adminPin);
    await openReopenedTabPaymentForm(page, adminPin);

    // The historical discount badge (PROMO-06 UI surface, this plan's Task 1)
    // is sourced from the stored snapshot, not a live promotion lookup — it
    // must render even though the promotion row is gone.
    const badge = page.getByTestId('line-item-discount-badge');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText('10');
  });

  test('(b) a full refund reverses the exact discounted amount charged, not a re-derived list-price amount', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');

    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const basePrice = 40;
    const { productId, name } = await seedProduct(admin, basePrice, 4);
    await seedPercentPromotion(admin, adminStaffId, productId, 25);
    const discountedPrice = Math.round(basePrice * 0.75 * 100) / 100; // 30.00

    await checkoutOneUnit(page, name, '100');
    const paymentId = await latestPaymentId(admin);

    await gotoAuthed(page, '/payments');
    const row = page.getByTestId(`payment-row-${paymentId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Refund' }).click();

    const refundDialog = page.getByRole('dialog', { name: 'Process refund' });
    await expect(refundDialog).toBeVisible({ timeout: 10_000 });

    const itemRow = refundDialog.locator('div.rounded-lg.border.p-3').filter({ hasText: name });
    const checkbox = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i }).first();
    await expect(checkbox).toBeVisible({ timeout: 10_000 });

    // The refund line shows the discounted unit price actually charged, not
    // the product's list price — the same stored order_items.unit_price
    // PROMO-06 requires never to be re-derived. Scoped to the item row (not
    // the whole dialog) since once selected the refund total repeats the
    // same figure.
    await expect(itemRow.getByText(discountedPrice.toFixed(2))).toBeVisible();
    await expect(itemRow.getByText(basePrice.toFixed(2))).toHaveCount(0);

    await checkbox.check();

    const reasonTrigger = refundDialog.locator('#refund-reason');
    await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
    await reasonTrigger.click();
    await page.getByRole('option', { name: /wrong.*order/i }).click();

    await page.getByRole('button', { name: /request approval/i }).click();
    const pinDialog = page.getByRole('alertdialog');
    await expect(pinDialog).toBeVisible({ timeout: 8_000 });
    const adminPin = process.env['E2E_ADMIN_PIN'] ?? '';
    await enterPin(page, adminPin);

    await expect(page.getByText(/refund.*processed/i)).toBeVisible({ timeout: 15_000 });

    const { data: refund, error: refundError } = await admin
      .from('refunds')
      .select('id, amount')
      .eq('original_payment_id', paymentId)
      .single();
    if (refundError || !refund) throw new Error(refundError?.message ?? 'refund row not found');
    expect(Number(refund.amount)).toBeCloseTo(discountedPrice, 2);
    expect(Number(refund.amount)).not.toBeCloseTo(basePrice, 2);

    const { data: negPayment, error: negPaymentError } = await admin
      .from('payments')
      .select('amount, is_refund')
      .eq('refund_id', refund.id)
      .single();
    if (negPaymentError || !negPayment) throw new Error(negPaymentError?.message ?? 'refund payment row not found');
    expect(negPayment.is_refund).toBe(true);
    expect(Number(negPayment.amount)).toBeCloseTo(-discountedPrice, 2);
  });

  test('(c) the product-sales margin report reflects the discounted unit price against cost_price_snapshot', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');

    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const basePrice = 50;
    const costPrice = 10;
    const { productId, name } = await seedProduct(admin, basePrice, costPrice);
    await seedPercentPromotion(admin, adminStaffId, productId, 20);
    const discountedPrice = Math.round(basePrice * 0.8 * 100) / 100; // 40.00
    // margin = discounted unit_price - cost_price_snapshot (get_product_sales_report's
    // existing formula, unchanged by this plan) — asserting it against the
    // LIST price (40 vs 50 basis) is exactly the regression PROMO-06 guards.
    const expectedMargin = Math.round((discountedPrice - costPrice) * 100) / 100; // 30.00
    const listPriceMargin = Math.round((basePrice - costPrice) * 100) / 100; // 40.00

    await checkoutOneUnit(page, name, '100');

    await gotoAuthed(page, '/reports');
    await page.getByRole('tab', { name: /product sales/i }).click();
    await expect(page.getByRole('status', { name: 'Loading' })).not.toBeVisible({ timeout: 20_000 });

    const row = page.locator('tbody tr').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 20_000 });
    const marginCell = row.locator('td').last();
    await expect(marginCell).toContainText(expectedMargin.toFixed(2));
    await expect(marginCell).not.toContainText(listPriceMargin.toFixed(2));
  });
});
