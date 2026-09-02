import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

/**
 * Phase 27 (Promotions & Discount Management), Plan 07 — PROMO-09 timezone-boundary scenario.
 *
 * promotions.starts_at/ends_at are `timestamptz` (an absolute instant) and
 * process_direct_sale_atomic compares against it with a plain `now() BETWEEN starts_at AND
 * ends_at` (Plan 01, 20260901000002_process_direct_sale_atomic_promotions.sql) — timezone-safe
 * by construction as long as the STORED instant is the correct one. The actual risk this
 * scenario guards against is a naive UTC-calendar-day conversion when computing "23:59:59
 * store-local time" in the first place (RESEARCH.md A4 / "Don't Hand-Roll" — no date library
 * dependency exists in this repo, so this file uses native `Intl.DateTimeFormat` to do the
 * timezone conversion, matching RESEARCH.md's guidance).
 *
 * Reads the store's actual settings.general.timezone and seeds ends_at as the genuine UTC
 * instant of 23:59:59 in that timezone — deterministic regardless of what real wall-clock
 * time this spec happens to run at (it always resolves "today"/"yesterday" relative to the
 * live moment, rather than hardcoding a fixed calendar date or waiting for a specific
 * UTC-crossover window to occur naturally).
 */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** y/m/d of `date`'s wall-clock calendar day in `timeZone`. */
function ymdInTimeZone(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? NaN);
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Converts a wall-clock instant (y-m-d hh:mm:ss) in `timeZone` to the equivalent UTC Date. */
function zonedWallTimeToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  ss: number,
  timeZone: string
): Date {
  const asUTC = Date.UTC(y, m - 1, d, hh, mm, ss);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(asUTC));
  const get = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? NaN);
  const asIfUtcInTz = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  const offsetMs = asIfUtcInTz - asUTC;
  return new Date(asUTC - offsetMs);
}

/** UTC instant of 23:59:59 on `date`'s local calendar day in `timeZone`. */
function storeLocalEndOfDayUtc(date: Date, timeZone: string): Date {
  const { y, m, d } = ymdInTimeZone(date, timeZone);
  return zonedWallTimeToUtc(y, m, d, 23, 59, 59, timeZone);
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
  if (error || !data) throw new Error(error?.message ?? 'Product not found');
  return data as unknown as ProductRow;
}

const seededPromotionIds: string[] = [];

async function seedPromotion(
  admin: SupabaseClient,
  createdBy: string,
  productId: string,
  startsAt: Date,
  endsAt: Date
): Promise<string> {
  const { data, error } = await admin
    .from('promotions')
    .insert({
      name: `E2E timezone-boundary promo ${randomUUID()}`,
      scope_type: 'product',
      product_id: productId,
      discount_type: 'percent',
      discount_value: 15,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      active: true,
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'promotion insert failed');
  seededPromotionIds.push(data.id as string);
  return data.id as string;
}

test.describe('Store-local timezone date-range boundary (PROMO-09)', () => {
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

  test('still applies at 23:59:59 store-local time, even when that instant has already crossed into the next UTC calendar day', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);
    const timezone = await getStoreTimezone(admin);

    const now = new Date();
    const endsAtTodayLocal = storeLocalEndOfDayUtc(now, timezone);
    // Sanity: genuinely in the future relative to "now" — the end of TODAY's
    // store-local calendar day. If it weren't, the assertion below would
    // trivially pass for the wrong reason.
    expect(endsAtTodayLocal.getTime()).toBeGreaterThan(now.getTime());

    await seedPromotion(
      admin,
      adminStaffId,
      product.id,
      new Date(now.getTime() - 60_000),
      endsAtTodayLocal
    );

    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await page.getByPlaceholder(/search products/i).fill(product.name);
    await page
      .getByRole('button', { name: new RegExp(`select ${escapeRe(product.name)}`, 'i') })
      .click();

    const cartLine = page
      .locator('aside .rounded-lg.border.bg-card')
      .filter({ has: page.getByTestId(`cart-item-notes-${product.id}`) });
    await expect(cartLine.getByText('15% off')).toBeVisible();
  });

  test('does not apply once past store-local midnight (yesterday store-local end-of-day is already expired)', async ({
    page,
  }) => {
    const admin = getServiceClient();
    const adminStaffId = await findRoleStaffId(admin, 'admin');
    const product = await findScopedProduct(admin);
    const timezone = await getStoreTimezone(admin);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endsAtYesterdayLocal = storeLocalEndOfDayUtc(yesterday, timezone);
    // Sanity: guaranteed in the past relative to "now".
    expect(endsAtYesterdayLocal.getTime()).toBeLessThan(now.getTime());

    await seedPromotion(
      admin,
      adminStaffId,
      product.id,
      new Date(endsAtYesterdayLocal.getTime() - 60 * 60_000),
      endsAtYesterdayLocal
    );

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
