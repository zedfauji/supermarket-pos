import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, resetTestState } from '../helpers/supabase';

/**
 * Phase 28 (Promotion Management Redesign) D-07/D-08/D-09/D-10, updated for
 * the single-screen `PromotionDialog` (Counter UX pass 2, Task 6) that
 * replaced the 4-step wizard routes: every section (Basics/Applies
 * to/When) is visible at once, so there is no forward-navigation gate left
 * to test — instead:
 *  - Create is blocked per-section while any section is invalid, with the
 *    same validation messages the wizard used (D-08).
 *  - The summary rail's live price preview shows a real, cross-checkable
 *    computed discount (D-09), and Create persists the promotion.
 *  - The `?edit=<id>` deep link opens the dialog with every section
 *    visible immediately — there is no step gating to bypass (D-10).
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

test.describe('Promotion dialog — validation, live preview, deep links (D-07/D-08/D-09/D-10)', () => {
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

  test('blocks Create on every invalid section, shows the live preview, and creates the promotion', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const basePrice = 100;
    const product = await seedProduct(admin, basePrice);
    const name = `E2E wizard-validation promo ${randomUUID()}`;
    uiCreatedPromotionNames.push(name);

    await page.goto('/promotions');
    await page.getByRole('button', { name: /new promotion/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(dialog).toBeVisible();

    // Empty name blocks Create.
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/name is required/i)).toBeVisible();

    await dialog.getByLabel(/^name/i).fill(name);
    await dialog.getByLabel(/discount percent/i).fill('20');

    // Unchecking store-wide with nothing selected blocks Create.
    await dialog.getByRole('checkbox', { name: /store-wide/i }).uncheck();
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/select at least one product or category/i)).toBeVisible();

    await dialog.getByRole('button', { name: /select products or categories/i }).click();
    await page.getByPlaceholder(/search products or categories/i).fill(product.name);
    await page.getByRole('option', { name: new RegExp(product.name, 'i') }).click();
    await page.keyboard.press('Escape');

    // Invalid time window blocks Create.
    await dialog.getByRole('switch', { name: /recurring/i }).click();
    await dialog.getByLabel(/start time/i).fill('18:00');
    await dialog.getByLabel(/end time/i).fill('16:00');
    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog.getByText(/end time must be after start time/i)).toBeVisible();

    await dialog.getByLabel(/start time/i).fill('00:00');
    await dialog.getByLabel(/end time/i).fill('23:59');

    // Live preview in the summary rail: 20% off $100 -> $80.00.
    const expectedDiscounted = round2(basePrice * (1 - 20 / 100));
    await expect(dialog.getByText(new RegExp(expectedDiscounted.toFixed(2)))).toBeVisible();
    await expect(dialog.getByText(new RegExp(product.name)).first()).toBeVisible();

    await dialog.getByRole('button', { name: /create promotion/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/promotions$/);
    await page.getByPlaceholder(/search/i).fill(name);
    await expect(page.getByRole('row', { name: new RegExp(name, 'i') })).toBeVisible();
  });

  test('edit deep link opens the dialog with every section visible (no step gating)', async ({
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

    await page.goto(`/promotions?edit=${promotionId}`);
    const dialog = page.getByRole('dialog', { name: /edit promotion/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByLabel(/^name/i)).toHaveValue(name);
    await expect(dialog.getByRole('heading', { name: /basics/i })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /applies to/i })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /when/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  test('edit mode blocks Save when the admin leaves Scope in an invalid state, does not silently wipe an existing scope to store-wide', async ({
    page,
  }) => {
    // Regression test for a 28-code-review Critical finding: 0 rows in
    // promotion_targets means store-wide (see 20260904000001's own comment),
    // so an unvalidated Scope step saving targets:[] is indistinguishable
    // from a genuine store-wide promotion — silent, undetectable data loss
    // for whoever originally scoped this promotion to one product.
    const admin = getServiceClient();
    const product = await seedProduct(admin, 50);
    const name = `E2E wizard-edit-scope-guard promo ${randomUUID()}`;
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
    const { error: targetErr } = await admin
      .from('promotion_targets')
      .insert({ promotion_id: promotionId, product_id: product.productId });
    if (targetErr) throw new Error(targetErr.message);

    await page.goto(`/promotions?edit=${promotionId}`);
    const dialog = page.getByRole('dialog', { name: /edit promotion/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    // Prefilled from promotion.targets (28-03): store-wide starts unchecked,
    // with the seeded product already selected as a chip.
    await expect(dialog.getByRole('checkbox', { name: /store-wide/i })).not.toBeChecked();

    // Remove the only selected target without picking a replacement — Scope
    // is now invalid (D-08: "select at least one product or category").
    await dialog.getByRole('button', { name: new RegExp(`remove ${product.name}`, 'i') }).click();
    await dialog.getByRole('button', { name: /save changes/i }).click();

    // Save must be blocked: the dialog stays open with the same validation
    // error Create would have shown, never silently persisted.
    await expect(dialog.getByText(/select at least one product or category/i)).toBeVisible();
    await expect(dialog).toBeVisible();

    // The promotion's original scope (one product, not store-wide) survived
    // untouched server-side — this is the actual data-integrity assertion.
    const { data: targets, error: targetsErr } = await admin
      .from('promotion_targets')
      .select('product_id')
      .eq('promotion_id', promotionId);
    if (targetsErr) throw new Error(targetsErr.message);
    expect(targets).toHaveLength(1);
    expect(targets?.[0]?.product_id).toBe(product.productId);
  });
});
