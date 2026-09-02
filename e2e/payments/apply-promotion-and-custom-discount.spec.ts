import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 04 — PROMO-05.
 *
 * Proves the payment screen's two discount paths end to end, against a real
 * checkout (CLAUDE.md testing policy — no manual UAT):
 *  (a) selecting an "Apply Promotion" option requires no manager PIN and the
 *      total reflects the discount.
 *  (b) expanding the ad-hoc discount section requires a manager PIN; a wrong
 *      PIN leaves it collapsed and unsubmitted, a correct PIN reveals the
 *      fields and the completed sale records discount_scope='all'.
 *  (c) an applied promotion AND an ad-hoc discount coexist on the same sale
 *      (D-10) — both reductions land in the final total independently.
 */

let cajaSessionId = '';
const seededPromotionIds: string[] = [];
const seededProductIds: { productId: string; categoryId: string }[] = [];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function seedProduct(admin: SupabaseClient, basePrice: number): Promise<{
  productId: string;
  categoryId: string;
  name: string;
}> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `E2E Apply-Promo Product ${suffix}`;

  const { data: category, error: catErr } = await admin
    .from('categories')
    .insert({ name: `E2E Apply-Promo Category ${suffix}` })
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
      name: `E2E apply-promo ${randomUUID()}`,
      scope_type: 'product',
      product_id: productId,
      discount_type: 'percent',
      discount_value: discountValue,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id, name')
    .single();
  if (error || !data) throw new Error(`seedPromotion: insert failed - ${error?.message}`);
  seededPromotionIds.push(data.id as string);
  return data.name as string;
}

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    await page.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
  }
}

async function addProductToCart(page: Page, productName: string): Promise<void> {
  await page.getByRole('button', { name: /checkout/i }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByPlaceholder(/search products/i).fill(productName);
  await page
    .getByRole('button', { name: new RegExp(`select ${escapeRe(productName)}`, 'i') })
    .click();
}

async function openPaymentForm(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^process payment$/i })
    .first()
    .click();
}

test.describe('Apply Promotion + custom discount (PROMO-05)', () => {
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
      await admin.from('inventory').delete().eq('product_id', productId);
      await admin.from('products').delete().eq('id', productId);
      await admin.from('categories').delete().eq('id', categoryId);
    }
    seededProductIds.length = 0;
    void cajaSessionId;
  });

  test('(a) selecting an active promotion requires no manager PIN and the total reflects the discount', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'cashier');

    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { productId, name } = await seedProduct(admin, 50);
    const promoName = await seedPromotion(admin, adminStaffId, productId, 15);

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const discountedPrice = Math.round(50 * 0.85 * 100) / 100; // 42.50
    const expectedTotal = computeAuthoritativeTotal(discountedPrice, taxRatePercent, taxInclusive);

    await addProductToCart(page, name);
    await openPaymentForm(page);

    // No PIN dialog anywhere in this flow — applying an existing promotion
    // is the non-ad-hoc path PROMO-05 explicitly distinguishes from the
    // custom-discount gate.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    const section = page.getByTestId('apply-promotion-section');
    await expect(section).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('apply-promotion-select').click();
    await page.getByRole('option', { name: promoName }).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByTestId('total-row')).toContainText(discountedPrice.toFixed(2));

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

  test('(b) the ad-hoc discount section requires a manager PIN — wrong PIN stays collapsed and unsubmitted, correct PIN reveals fields and completes with discount_scope=all', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Manager login: process_direct_sale_atomic's apply_custom_discount
    // re-check is keyed off the CURRENTLY LOGGED-IN staff (p_staff_id), not
    // the staff whose PIN is entered in ManagerPinDialog — mirrors every
    // other manager-PIN-gated E2E spec in this codebase
    // (e2e/reports/discount-and-revenue.spec.ts, e2e/payments/edge-cases.spec.ts).
    await loginAs(page, 'manager');

    const admin = getServiceClient();
    const { name } = await seedProduct(admin, 40);

    await addProductToCart(page, name);
    await openPaymentForm(page);

    // #discount-toggle (id selector) rather than getByRole('switch', {name})
    // — the accessible-name association via the Label's htmlFor briefly
    // doesn't resolve during PIN-dialog transitions in this real (non-mocked)
    // render, so a role+name query intermittently finds zero matches even
    // though the switch itself is always present in the DOM.
    const discountToggle = page.locator('#discount-toggle');
    await expect(discountToggle).toBeVisible({ timeout: 10_000 });

    // Wrong PIN — a non-existent 6-digit PIN never matches an eligible
    // manager/admin, so ManagerPinDialog rejects client-side and the section
    // stays collapsed/unsubmitted.
    await discountToggle.click();
    let pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    await enterPin(page, '000111');
    await expect(pinDialog.getByText(/incorrect pin/i)).toBeVisible({ timeout: 8_000 });
    // discountExpanded only flips to true in ManagerPinDialog's onSuccess —
    // never called on a wrong PIN — so the Switch stays unchecked (the
    // authoritative expansion-state signal; the collapsed fields' CSS
    // grid-row transition is not a reliable visibility check).
    await expect(discountToggle).not.toBeChecked();

    await pinDialog.getByRole('button', { name: /cancel/i }).click();
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    // Correct PIN — fields appear.
    await discountToggle.click();
    pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    const discountInput = page.getByLabel(/discount %|discount amount/i);
    await expect(discountInput).toBeVisible({ timeout: 5_000 });
    await discountInput.fill('10');
    await expect(page.getByTestId('discount-applied-label')).toBeVisible();

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const afterDiscount = Math.round(40 * 0.9 * 100) / 100; // 36.00
    const expectedTotal = computeAuthoritativeTotal(afterDiscount, taxRatePercent, taxInclusive);

    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('amount, discount_scope, discount_type, discount_value')
      .order('processed_at', { ascending: false })
      .limit(1);
    if (paymentsError || !payments?.[0]) throw new Error(paymentsError?.message ?? 'Payment not found');
    const payment = payments[0] as {
      amount: number;
      discount_scope: string | null;
      discount_type: string | null;
      discount_value: number | null;
    };
    expect(payment.discount_scope).toBe('all');
    expect(payment.discount_type).toBe('percent');
    expect(Number(payment.discount_value)).toBeCloseTo(10, 1);
    expect(Number(payment.amount)).toBeCloseTo(expectedTotal, 2);
  });

  test('(c) an applied promotion and an ad-hoc discount coexist on the same sale — both reductions land in the final total', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'manager');

    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const { productId, name } = await seedProduct(admin, 100);
    const promoName = await seedPromotion(admin, adminStaffId, productId, 20);

    await addProductToCart(page, name);
    await openPaymentForm(page);

    // Apply the existing promotion (no PIN).
    await page.getByTestId('apply-promotion-select').click();
    await page.getByRole('option', { name: promoName }).click();
    await expect(page.getByTestId('total-row')).toContainText('80.00');

    // Layer an ad-hoc 10% discount on top (manager PIN required).
    await page.getByRole('switch', { name: 'Discount' }).click();
    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    await enterPin(page, managerPin);
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    const discountInput = page.getByLabel(/discount %|discount amount/i);
    await expect(discountInput).toBeVisible({ timeout: 5_000 });
    await discountInput.fill('10');
    await expect(page.getByTestId('discount-applied-label')).toBeVisible();

    // 100 -(20% promo)-> 80 -(10% ad-hoc, on the promo-adjusted subtotal)-> 72.
    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const afterBothDiscounts = Math.round(80 * 0.9 * 100) / 100; // 72.00
    const expectedTotal = computeAuthoritativeTotal(afterBothDiscounts, taxRatePercent, taxInclusive);
    await expect(page.getByTestId('total-row')).toContainText(afterBothDiscounts.toFixed(2));

    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('amount, discount_scope')
      .order('processed_at', { ascending: false })
      .limit(1);
    if (paymentsError || !payments?.[0]) throw new Error(paymentsError?.message ?? 'Payment not found');
    const payment = payments[0] as { amount: number; discount_scope: string | null };
    expect(payment.discount_scope).toBe('all');
    expect(Number(payment.amount)).toBeCloseTo(expectedTotal, 2);

    // The order_items row snapshots the applied promotion independently of
    // the ad-hoc discount (D-10: coexist, never overwrite one another).
    const { data: orderItems, error: itemsError } = await admin
      .from('order_items')
      .select('promotion_id, unit_price')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (itemsError || !orderItems?.[0]) throw new Error(itemsError?.message ?? 'Order item not found');
    const orderItem = orderItems[0] as { promotion_id: string | null; unit_price: number };
    expect(orderItem.promotion_id).not.toBeNull();
    expect(Number(orderItem.unit_price)).toBeCloseTo(80, 2);
  });
});
