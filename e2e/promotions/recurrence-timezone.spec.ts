import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

/**
 * Phase 28 (Promotion Management Redesign), Plan 01 — D-03..D-06: a
 * recurring promotion's time-of-day window (`start_time`/`end_time`) is an
 * additional AND-filter on top of the existing date range, evaluated in the
 * store's configured `settings.general.timezone` — mirroring the ROADMAP's
 * own "every day 4-6PM" example. Seeded directly into `promotions` with
 * zero `promotion_targets` rows (store-wide), isolating this recurrence
 * check from the scope-matching check already proven by
 * multi-target-scope.spec.ts.
 *
 * The expected in/out-of-window result is computed via the SAME
 * Intl.DateTimeFormat technique timezone-boundary.spec.ts already
 * establishes (RESEARCH.md Pattern 3) — never the test runner's own local
 * clock — so this spec is deterministic regardless of which machine/CI
 * timezone it runs on.
 */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mirrors src/entities/promotion/model/promotion-pricing.ts's getStoreLocalDowAndTime (mirrored, not shared — RESEARCH.md Pitfall 1). */
function storeLocalMinutesOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? NaN);
  return get('hour') * 60 + get('minute');
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A fixed window guaranteed to contain `nowMinutes` — half-day split avoids any midnight-boundary clamping risk. */
function includedWindow(nowMinutes: number): { start: string; end: string } {
  return nowMinutes < 12 * 60
    ? { start: minutesToHHMM(0), end: minutesToHHMM(11 * 60 + 59) }
    : { start: minutesToHHMM(12 * 60), end: minutesToHHMM(23 * 60 + 59) };
}

/** A fixed window guaranteed to NOT contain `nowMinutes` — the other half of the day. */
function excludedWindow(nowMinutes: number): { start: string; end: string } {
  return nowMinutes < 12 * 60 ? { start: '14:00', end: '16:00' } : { start: '02:00', end: '04:00' };
}

async function getStoreTimezone(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from('settings').select('value').eq('key', 'general').maybeSingle();
  const v = data?.value as { timezone?: string } | null;
  return v?.timezone ?? 'America/Mexico_City';
}

interface ProductRow {
  id: string;
  name: string;
}

async function findScopedProduct(admin: SupabaseClient): Promise<ProductRow> {
  const { data, error } = await admin
    .from('products')
    .select('id, name')
    .eq('name', "Haldiram's Aloo Bhujia 200g")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ProductRow;
}

const seededPromotionIds: string[] = [];

async function seedRecurringPromotion(
  admin: SupabaseClient,
  createdBy: string,
  window: { start: string; end: string }
): Promise<string> {
  const now = Date.now();
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E recurrence-timezone promo ${randomUUID()}`,
      discount_type: 'percent',
      discount_value: 20,
      starts_at: new Date(now - 24 * 60 * 60_000).toISOString(),
      ends_at: new Date(now + 24 * 60 * 60_000).toISOString(),
      active: true,
      created_by: createdBy,
      // daysOfWeek left null (every day, per the ROADMAP's own "every day
      // 4-6PM" example) — isolates this spec to the time-window check only.
      days_of_week: null,
      start_time: window.start,
      end_time: window.end,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const promotionId = data.id as string;
  seededPromotionIds.push(promotionId);
  return promotionId;
}

test.describe('Recurring promotion time-of-day window, store-local timezone (D-03..D-06)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
    await loginAs(page, 'cashier');
  });

  test.afterEach(async () => {
    if (seededPromotionIds.length === 0) return;
    const admin = getServiceClient();
    await admin.from('promotions').delete().in('id', seededPromotionIds);
    seededPromotionIds.length = 0;
  });

  test('discounts at checkout when the real store-local wall-clock time falls inside the window', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);
    const timezone = await getStoreTimezone(admin);

    const nowMinutes = storeLocalMinutesOfDay(new Date(), timezone);
    const window = includedWindow(nowMinutes);
    // Sanity: the computed window is non-degenerate.
    expect(window.start < window.end).toBe(true);

    await seedRecurringPromotion(admin, adminStaffId, window);

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
  });

  test('does not discount at checkout when the real store-local wall-clock time falls outside the window', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);
    const timezone = await getStoreTimezone(admin);

    const nowMinutes = storeLocalMinutesOfDay(new Date(), timezone);
    const window = excludedWindow(nowMinutes);
    // Sanity: the computed window genuinely excludes "now".
    const nowHHMM = minutesToHHMM(nowMinutes);
    expect(nowHHMM < window.start || nowHHMM > window.end).toBe(true);

    await seedRecurringPromotion(admin, adminStaffId, window);

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(product.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(product.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${product.id}`) });
    await expect(cartLine.locator('[aria-label="Promotion applied"]')).toHaveCount(0);
    await expect(cartLine.getByText(/% off/)).toHaveCount(0);
  });
});
