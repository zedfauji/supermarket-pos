import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, resetTestState } from '../helpers/supabase';

/**
 * Phase 28 (Promotion Management Redesign), Plan 04 — D-07/D-08/D-09/D-10:
 * proves the full 4-step promotion wizard end to end against the real
 * running app (no mocks, per CLAUDE.md's mandatory-automated-testing
 * policy):
 *  - Basics/Scope/Validity all block forward navigation while invalid,
 *    unblock once valid (D-08, generalized from 28-03's Scope-only gate).
 *  - The Review step's live price preview shows a real, cross-checkable
 *    computed discount (D-09), and the final Create action persists.
 *  - Edit mode allows immediate navigation to any of the 4 steps with zero
 *    forward-gating (D-10).
 */

const seededProductIds: string[] = [];
const seededCategoryIds: string[] = [];
const seededPromotionIds: string[] = [];
const uiCreatedPromotionNames: string[] = [];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function seedProduct(
  admin: SupabaseClient,
  basePrice: number
): Promise<{ productId: string; categoryId: string; name: string }> {
  // ProductSchema/CategorySchema cap `name` at 50 chars — keep the prefix
  // short so the full randomized name never exceeds that.
  const suffix = Math.random().toString(36).slice(2, 8);
  const name = `E2E WizProd ${suffix}`;

  const { data: category, error: catErr } = await admin
    .from('categories')
    .insert({ name: `E2E WizCat ${suffix}` })
    .select('id')
    .single();
  if (catErr) throw new Error(catErr.message);
  seededCategoryIds.push(category.id as string);

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
  if (prodErr) throw new Error(prodErr.message);
  seededProductIds.push(product.id as string);

  return { productId: product.id as string, categoryId: category.id as string, name };
}

test.describe('Promotion wizard — forward-navigation gate + live preview (D-07/D-08/D-09/D-10)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    if (uiCreatedPromotionNames.length > 0) {
      await admin.from('promotions').delete().in('name', uiCreatedPromotionNames);
      uiCreatedPromotionNames.length = 0;
    }
    if (seededPromotionIds.length > 0) {
      await admin.from('promotions').delete().in('id', seededPromotionIds);
      seededPromotionIds.length = 0;
    }
    if (seededProductIds.length > 0) {
      await admin.from('products').delete().in('id', seededProductIds);
      seededProductIds.length = 0;
    }
    if (seededCategoryIds.length > 0) {
      await admin.from('categories').delete().in('id', seededCategoryIds);
      seededCategoryIds.length = 0;
    }
  });

  test('blocks forward navigation on every gated step, shows the live preview, and creates the promotion', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const basePrice = 100;
    const product = await seedProduct(admin, basePrice);
    const name = `E2E wizard-validation promo ${randomUUID()}`;
    uiCreatedPromotionNames.push(name);

    await page.goto('/promotions');
    // .first(): when the promotions table is empty, EmptyState renders its
    // own duplicate "New Promotion" action button in addition to the page
    // header's — the header one is always first in DOM order (28-05 fix,
    // surfaced once the shared local DB genuinely has zero promotion rows).
    await page.getByRole('button', { name: /new promotion/i }).first().click();
    await expect(page).toHaveURL(/\/promotions\/new$/);

    // D-08: an empty name blocks Next on the Basics step.
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByText(/name is required/i)).toBeVisible();

    await page.getByLabel(/^name/i).fill(name);
    await page.getByLabel(/discount percent/i).fill('20');
    await page.getByRole('button', { name: /^next$/i }).click();

    // Now on the Scope step (Store-wide checkbox only renders here).
    await expect(page.getByRole('checkbox', { name: /store-wide/i })).toBeVisible();

    // D-08: unchecking store-wide with nothing selected blocks Next.
    await page.getByRole('checkbox', { name: /store-wide/i }).uncheck();
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByText(/select at least one product or category/i)).toBeVisible();

    // Select the seeded product as the scope target, then advance.
    await page.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill(product.name);
    await page.getByRole('option', { name: new RegExp(product.name, 'i') }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^next$/i }).click();

    // Now on the Validity & Recurrence step.
    await expect(page.getByRole('switch', { name: /recurring/i })).toBeVisible();

    // D-05: an invalid time window (end <= start) blocks Next.
    await page.getByRole('switch', { name: /recurring/i }).click();
    await page.getByLabel(/start time/i).fill('18:00');
    await page.getByLabel(/end time/i).fill('16:00');
    await page.getByRole('button', { name: /^next$/i }).click();
    await expect(page.getByText(/end time must be after start time/i)).toBeVisible();

    // Fix the time window and advance to Review.
    await page.getByLabel(/start time/i).fill('00:00');
    await page.getByLabel(/end time/i).fill('23:59');
    await page.getByRole('button', { name: /^next$/i }).click();

    // D-09: the live preview shows a real, cross-checkable computed
    // discounted price for the entered configuration (20% off $100 -> $80.00,
    // independently hand-computed here — not a duplicate of the app's own
    // evaluateBestPromotion implementation).
    const expectedDiscounted = round2(basePrice * (1 - 20 / 100));
    await expect(page.getByText(new RegExp(expectedDiscounted.toFixed(2)))).toBeVisible();
    await expect(page.getByText(new RegExp(product.name))).toBeVisible();

    await page.getByRole('button', { name: /create promotion/i }).click();
    await expect(page).toHaveURL(/\/promotions$/);
    await page.getByPlaceholder(/search/i).fill(name);
    await expect(page.getByRole('row', { name: new RegExp(name, 'i') })).toBeVisible();
  });

  test('edit mode allows immediate navigation to any step, no forward-gating (D-10)', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const name = `E2E wizard-edit-nav promo ${randomUUID()}`;
    uiCreatedPromotionNames.push(name);
    const adminStaffId = await findRoleStaffId(admin, 'admin');

    const { data, error } = await admin
      .from('promotions')
      .insert({
        name,
        discount_type: 'percent',
        discount_value: 10,
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        active: true,
        created_by: adminStaffId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const promotionId = data.id as string;
    seededPromotionIds.push(promotionId);

    await page.goto(`/promotions/${promotionId}/edit`);
    await expect(page.getByRole('tab', { name: /review/i })).toBeVisible();

    for (const stepName of [/basics/i, /^scope$/i, /validity/i, /^review$/i]) {
      await expect(page.getByRole('tab', { name: stepName })).toBeEnabled();
    }

    // Direct jump straight to Review, bypassing Scope/Validity entirely —
    // no forward-gating in edit mode (D-10).
    await page.getByRole('tab', { name: /^review$/i }).click();
    await expect(page.getByText(name)).toBeVisible();
  });
});
