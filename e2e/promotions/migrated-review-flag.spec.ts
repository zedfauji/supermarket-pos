import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, resetTestState } from '../helpers/supabase';

/**
 * Phase 28 (Promotion Management Redesign), Plan 01 — D-11/D-12: every
 * promotion row that predates the 20260904000001_promotion_targets_recurrence
 * migration was backfilled with `needs_review = true`, surfaced as a
 * "Needs review" badge on /promotions so an admin can confirm each one
 * carried over correctly under the new multi-target model. A promotion
 * created after the migration (via the new wizard) defaults to
 * `needs_review = false` and shows no badge.
 */

const seededPromotionIds: string[] = [];
const uiCreatedPromotionNames: string[] = [];

async function seedMigratedPromotion(admin: SupabaseClient, createdBy: string): Promise<string> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E migrated promo ${randomUUID()}`,
      discount_type: 'percent',
      discount_value: 10,
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
      // Simulates a row that already existed before the Phase 28 migration
      // ran and was backfilled true (D-11/D-12) — never set explicitly by
      // any current create path, but this is exactly what the migration's
      // `UPDATE promotions SET needs_review = true` produced for every
      // pre-existing row.
      needs_review: true,
    })
    .select('id, name')
    .single();
  if (error) throw new Error(error.message);
  seededPromotionIds.push(data.id as string);
  return data.name as string;
}

test.describe('Migrated-promotion review flag (D-11/D-12)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test.afterEach(async () => {
    const admin = getServiceClient();
    if (seededPromotionIds.length > 0) {
      await admin.from('promotions').delete().in('id', seededPromotionIds);
      seededPromotionIds.length = 0;
    }
    if (uiCreatedPromotionNames.length > 0) {
      await admin.from('promotions').delete().in('name', uiCreatedPromotionNames);
      uiCreatedPromotionNames.length = 0;
    }
  });

  test('a promotion backfilled needs_review=true shows the "Needs review" badge on /promotions', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const name = await seedMigratedPromotion(admin, adminStaffId);

    await page.goto('/promotions');
    await page.getByPlaceholder(/search/i).fill(name);

    const row = page.getByRole('row', { name: new RegExp(name, 'i') });
    await expect(row).toBeVisible();
    await expect(row.getByText(/needs review/i)).toBeVisible();
  });

  test('a promotion created fresh through the wizard shows no "Needs review" badge', async ({
    page,
  }) => {
    const name = `E2E fresh promo ${randomUUID()}`;
    uiCreatedPromotionNames.push(name);

    await page.goto('/promotions');
    await page.getByRole('button', { name: /new promotion/i }).click();
    await expect(page).toHaveURL(/\/promotions\/new$/);

    await page.getByLabel(/^name/i).fill(name);
    // Discount type defaults to "Percent" with the string-buffered percent
    // field defaulting to "0" — set a valid value before advancing.
    await page.getByLabel(/discount percent/i).fill('15');
    await page.getByRole('button', { name: /^next$/i }).click();
    await page.getByRole('button', { name: /^next$/i }).click();
    await page.getByRole('button', { name: /^next$/i }).click();
    await page.getByRole('button', { name: /create promotion/i }).click();

    await expect(page).toHaveURL(/\/promotions$/);

    await page.getByPlaceholder(/search/i).fill(name);
    const row = page.getByRole('row', { name: new RegExp(name, 'i') });
    await expect(row).toBeVisible();
    await expect(row.getByText(/needs review/i)).toHaveCount(0);
  });
});
