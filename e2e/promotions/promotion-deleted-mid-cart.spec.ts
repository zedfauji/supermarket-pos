import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { computeAuthoritativeTotal, getBillingTaxConfig } from '../helpers/tax';

/**
 * Phase 27 (Promotions & Discount Management), Plan 07 — PROMO-09
 * promotion-deleted-mid-cart scenario, ONLINE case. Plan 06's own
 * e2e/infra/offline-promotion-conflict.spec.ts already covers the same
 * underlying risk for the offline->reconnect path; this spec is the
 * live-online-the-whole-time equivalent named explicitly by PROMO-09.
 *
 * A cashier adds a promoted product to the cart; while it sits there, an
 * admin deletes the promotion via the real /promotions UI, in a genuinely
 * separate browser session (own context, own auth) — mirroring two staff
 * members working concurrently. usePromotions() has a 5-minute staleTime and
 * no realtime subscription (Plan 01/02 as built), so the cashier's cart keeps
 * displaying the now-deleted discount. process_direct_sale_atomic is still
 * the sole checkout-time price authority (Plan 03): it recomputes the sale
 * total server-side from the live promotions table and rejects a payment
 * amount that no longer matches (AMOUNT_MISMATCH) rather than ever silently
 * completing the sale at the stale discounted price. A fresh page load
 * re-fetches promotions and recovers to the correct, undiscounted total.
 */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ProductRow {
  id: string;
  name: string;
  base_price: number;
}

async function findScopedProduct(admin: SupabaseClient): Promise<ProductRow> {
  const { data, error } = await admin
    .from('products')
    .select('id, name, base_price')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Product not found');
  return data as unknown as ProductRow;
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
      name: `E2E deleted-mid-cart promo ${randomUUID()}`,
      scope_type: 'product',
      product_id: productId,
      discount_type: 'percent',
      discount_value: 20,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'promotion insert failed');
  return data.id as string;
}

test.describe('Promotion deleted mid-cart, online (PROMO-09)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('the server rejects a stale discounted payment amount instead of silently completing the sale; a reload recovers to the correct undiscounted price', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);
    const promotionId = await seedPromotion(admin, adminStaffId, product.id);

    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
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

    const { count: paymentsBefore } = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true });

    // Admin deletes the promotion in a genuinely separate session (own
    // browser context, own auth) — a real delete via the real UI, not a
    // same-tab mock.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/');
    await loginAs(adminPage, 'admin');
    await adminPage.goto('/promotions');
    const promoRow = adminPage.getByRole('row', { name: new RegExp(escapeRe(product.name)) });
    await expect(promoRow).toBeVisible({ timeout: 15_000 });
    await promoRow.getByRole('button', { name: 'Delete' }).click();
    await adminPage.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(promoRow).not.toBeVisible({ timeout: 10_000 });
    await adminContext.close();

    const { data: stillThere } = await admin
      .from('promotions')
      .select('id')
      .eq('id', promotionId)
      .maybeSingle();
    expect(stillThere).toBeNull();

    // Cashier's cart still shows the stale discount (no realtime subscription,
    // 5-minute query staleTime, Plan 01/02) — attempting to pay now submits a
    // payment amount the server no longer agrees with.
    await expect(cartLine.getByText('20% off')).toBeVisible();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();

    // Blocked: no receipt/Done step reached, no completed sale, and the
    // error surfaces inline (PaymentForm's role="alert" error banner).
    await expect(page.getByRole('button', { name: /done/i })).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('payment-error-alert')).toBeVisible({ timeout: 15_000 });
    const { count: paymentsAfterBlocked } = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true });
    expect(paymentsAfterBlocked).toBe(paymentsBefore);

    // Recovery: a fresh document load re-fetches promotions (none active
    // now, in-memory QueryClient with no persistence) — re-adding the same
    // item and checking out completes at the correct, undiscounted price.
    // The discount never silently survives past the promotion's deletion.
    await page.reload();
    await gotoAuthed(page, '/pos');
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder(/search products/i).fill(product.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(product.name)}`, 'i') })
      .click();
    const freshCartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${product.id}`) });
    await expect(freshCartLine.getByText(/% off/)).toHaveCount(0);

    const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
    const expectedTotal = computeAuthoritativeTotal(
      Number(product.base_price),
      taxRatePercent,
      taxInclusive
    );

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
