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
 *
 * Rewritten again for Counter UX pass 2, Task 6: the wizard route was
 * replaced by the single-screen `PromotionDialog` on `/promotions` — same
 * string-buffered percent field, no page navigation.
 */

const seededPromotionIds: string[] = [];
// Backstop for the id-based cleanup above: a test that fails between the UI
// create (line ~80 below) and the id lookup below never pushes to
// seededPromotionIds, leaking the row. Every name this spec hands to the UI
// is recorded here up front so afterEach can also sweep by name.
const uiCreatedPromotionNames: string[] = [];

test.describe('Promotion percent-discount field accepts typed input (G-27-8 Part A)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
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

  test('typing "20" into the percent field displays "20" and saves discount_value=20', async ({ page }) => {
    const promoName = `E2E percent-field-input ${randomUUID()}`;
    uiCreatedPromotionNames.push(promoName);

    await page.goto('/');
    await loginAs(page, 'admin');
    await page.goto('/promotions');

    // .first(): when the promotions table is empty, EmptyState renders its
    // own duplicate "New Promotion" action button in addition to the page
    // header's — the header one is always first in DOM order.
    await page.getByRole('button', { name: /new promotion/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /new promotion/i });
    await expect(dialog).toBeVisible();

    await page.getByLabel(/^name/i).fill(promoName);

    // Discount type defaults to 'percent'. The field starts at the literal
    // digit '0' (create-mode default) — clear it and type '20'.
    const percentInput = page.getByLabel(/discount percent/i);
    await expect(percentInput).toHaveValue('0');
    await percentInput.fill('');
    await percentInput.pressSequentially('20');

    // Proves the fix: displays exactly "20", not "020" or stuck at "0".
    await expect(percentInput).toHaveValue('20');

    // Every section is visible at once — Scope defaults to store-wide (no
    // picker interaction needed) and Validity defaults to a valid date
    // range with recurrence off, so Create can be clicked directly.
    await page.getByRole('button', { name: /create promotion/i }).click();
    // Wait for the dialog to actually close (real signal the create mutation
    // resolved) before reading the DB — the URL never changes in the dialog
    // flow, so a bare `toHaveURL` check here is a no-op that races the
    // still-in-flight insert.
    await expect(dialog).toBeHidden();
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
