import { randomUUID } from 'node:crypto';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

/**
 * Phase 27 (Promotions & Discount Management), gap-closure Plan 27-10 — G-27-8
 * Part A: the promotion discount-percent field was stuck at 0 because
 * `discountValue` was number-typed React state coerced via
 * `Number(e.target.value)` on every keystroke, with no string buffer.
 * Clearing the field yielded `Number('') === 0`, which the controlled
 * `value` prop redisplayed as the literal digit '0'; new digits then
 * inserted BEFORE that persistent '0' instead of replacing it. Fixed by
 * string-buffering the percent field (mirrors NearExpirySettingsTab.tsx's
 * discountPercent pattern) and coercing to a number only at submit time.
 * See .planning/debug/promotion-dialog-ux-and-scope-gaps.md (Part A).
 *
 * Permanent E2E proof (replaces the temporary repro spec used during the
 * debug session, per this project's mandatory-automated-testing policy):
 * create a percent promotion via the real /promotions/new wizard, clear the
 * default '0' and type '20', assert the DOM input value is exactly "20",
 * save (store-wide, default date range, no recurrence), and assert the
 * created row's discount_value = 20 server-side.
 *
 * Rewritten in Phase 28 (Promotion Management Redesign), Plan 05: the
 * `PromotionFormDialog` this spec originally drove was deleted in 28-01 and
 * replaced by the `PromotionWizardPage` route (`/promotions/new`) — same
 * string-buffered percent field, new page instead of a dialog.
 */

const seededPromotionIds: string[] = [];

test.describe('Promotion percent-discount field accepts typed input (G-27-8 Part A)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test.afterEach(async () => {
    if (seededPromotionIds.length === 0) return;
    const admin = getServiceClient();
    await admin.from('promotions').delete().in('id', seededPromotionIds);
    seededPromotionIds.length = 0;
  });

  test('typing "20" into the percent field displays "20" and saves discount_value=20', async ({ page }) => {
    const promoName = `E2E percent-field-input ${randomUUID()}`;

    await page.goto('/');
    await loginAs(page, 'admin');
    await page.goto('/promotions');

    // .first(): when the promotions table is empty, EmptyState renders its
    // own duplicate "New Promotion" action button in addition to the page
    // header's — the header one is always first in DOM order.
    await page.getByRole('button', { name: /new promotion/i }).first().click();
    await expect(page).toHaveURL(/\/promotions\/new$/);

    await page.getByLabel(/^name/i).fill(promoName);

    // Discount type defaults to 'percent'. The field starts at the literal
    // digit '0' (create-mode default) — clear it and type '20'.
    const percentInput = page.getByLabel(/discount percent/i);
    await expect(percentInput).toHaveValue('0');
    await percentInput.fill('');
    await percentInput.pressSequentially('20');

    // Proves the fix: displays exactly "20", not "020" or stuck at "0".
    await expect(percentInput).toHaveValue('20');

    // Advance through the remaining 3 steps: Scope defaults to store-wide
    // (no picker interaction needed), Validity defaults to a valid date
    // range with recurrence off, Review just confirms and creates.
    await page.getByRole('button', { name: /^next$/i }).click(); // Basics -> Scope
    await expect(page.getByRole('checkbox', { name: /store-wide/i })).toBeChecked();
    await page.getByRole('button', { name: /^next$/i }).click(); // Scope -> Validity
    await expect(page.getByRole('switch', { name: /recurring/i })).toBeVisible();
    await page.getByRole('button', { name: /^next$/i }).click(); // Validity -> Review

    await page.getByRole('button', { name: /create promotion/i }).click();
    await expect(page).toHaveURL(/\/promotions$/);

    const admin = getServiceClient();
    const { data: created, error } = await admin
      .from('promotions')
      .select('id, discount_value, discount_type')
      .eq('name', promoName)
      .single();
    if (error || !created) throw new Error(error?.message ?? 'Created promotion not found');
    seededPromotionIds.push(created.id as string);

    expect(created.discount_type).toBe('percent');
    expect(Number(created.discount_value)).toBe(20);
  });
});
