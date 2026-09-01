import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { requireIntegrationEnv } from '../helpers/requireEnv';

let cajaSessionId = '';

/**
 * Phase 24 (Tax Configuration — Inclusive/Exclusive Toggle), Plan 01.
 *
 * Proves TAX-02 end-to-end for the direct-sale checkout path: with
 * `taxInclusive=true` (D-01's post-migration default), the total charged is
 * exactly the catalog price sum (no `* 1.16` on top, unlike the pre-fix
 * `happy-path.spec.ts` assertion at line 49), and the receipt returned by
 * `process-direct-sale` shows a real decomposed subtotal/tax/total split.
 */
test.describe('Direct-sale checkout — tax-inclusive mode (Phase 24)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test('inclusive-mode checkout charges exactly the catalog price; receipt shows decomposed subtotal+tax', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const { data: product, error: productError } = await admin
      .from('products')
      .select('base_price')
      .eq('name', "Haldiram's Aloo Bhujia 200g")
      .single();
    if (productError || !product) throw new Error(productError?.message ?? 'Product not found');
    const basePrice = Number(product.base_price);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill("Haldiram's Aloo Bhujia 200g");
    await page.getByRole('button', { name: /select haldiram's aloo bhujia 200g/i }).click();
    await page
      .getByRole('button', { name: /^process payment$/i })
      .first()
      .click();
    await page.getByLabel(/amount tendered/i).fill('100');

    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes('/functions/v1/process-direct-sale')
    );
    await page
      .getByRole('button', { name: /^process payment$/i })
      .last()
      .click();
    const response = await responsePromise;
    const body = (await response.json()) as {
      receiptData?: { subtotal: number; taxAmount?: number; total: number };
    };
    const receiptData = body.receiptData;
    if (!receiptData) throw new Error('process-direct-sale response had no receiptData');

    // No addition on top of the catalog price (TAX-02) — this is the
    // assertion that fails RED against the pre-migration additive-only RPC
    // (total would be basePrice * 1.16 instead).
    expect(receiptData.total).toBeCloseTo(basePrice, 2);
    expect(receiptData.taxAmount).toBeDefined();
    expect(receiptData.taxAmount ?? 0).toBeGreaterThan(0);
    // subtotal + tax reconciles to total to the cent (Open Question 2).
    expect(Math.round((receiptData.subtotal + (receiptData.taxAmount ?? 0)) * 100)).toBe(
      Math.round(receiptData.total * 100)
    );

    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /done/i }).click();
  });
});
