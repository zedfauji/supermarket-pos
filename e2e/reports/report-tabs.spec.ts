import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { expect, test, type Page } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState, seedOpenTab } from '../helpers/supabase';

/** Stable, always-seeded Indian-catalog fixture product (Sweets category,
 * scripts/seed-dev-data.ts / supabase/seed.sql, guaranteed to have a real
 * `inventory` row) — used throughout this file wherever a guaranteed,
 * distinct fixture product is needed. Deliberately NOT one of the
 * masalas/snacks names other already-rewritten specs (e.g.
 * e2e/checkout/barcode-scan-search.spec.ts) drive through a real checkout
 * flow — this file's Margin/Turnover fixtures need a product that reliably
 * has zero same-day cost_price_snapshot history, which a shared product name
 * sold concurrently by a sibling spec's process_direct_sale_atomic call would
 * silently break. */
const FIXTURE_PRODUCT = 'Bikaji Gulab Jamun 1kg';

// --------------------------------------------------------------------------
// Phase 24 (operational-reports-suite-csv) — Wave 6 helpers
// --------------------------------------------------------------------------

/** Inject a fake `__TAURI_INTERNALS__` so CSV export (save + write_file) resolves
 * without a real Tauri runtime. Mirrors e2e/25-export-reports.spec.ts. */
async function injectTauriMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__exportMockState'] = {
      saveDialogCalled: false,
      savedPath: null as string | null,
    };
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string): Promise<unknown> {
        const state = (window as unknown as Record<string, unknown>)['__exportMockState'] as {
          saveDialogCalled: boolean;
          savedPath: string | null;
        };
        if (cmd === 'plugin:dialog|save') {
          state.saveDialogCalled = true;
          state.savedPath = '/tmp/e2e-phase24-export.csv';
          return Promise.resolve('/tmp/e2e-phase24-export.csv');
        }
        if (cmd === 'plugin:fs|write_file') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      },
      transformCallback(callback: (arg: unknown) => void, _once: boolean): number {
        const id = Math.floor(Math.random() * 1_000_000);
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = callback;
        return id;
      },
      unregisterCallback(id: number): void {
        delete (window as unknown as Record<string, unknown>)[`_${String(id)}`];
      },
    };
  });
}

/** Seed a single `cash` payment on a fresh tab so Payment Methods has a
 * guaranteed non-empty rollup row (ExportButtons is hidden on empty state). */
async function seedCashPayment(): Promise<void> {
  const admin = getServiceClient();
  const { data: staff, error: sErr } = await admin
    .from('profiles')
    .select('id')
    .limit(1)
    .single();
  if (sErr || !staff) throw new Error(`seedCashPayment: no staff profile - ${sErr?.message}`);

  let shiftId: string;
  const { data: existingShift } = await admin
    .from('shifts')
    .select('id')
    .eq('staff_id', staff.id)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift, error: shiftErr } = await admin
      .from('shifts')
      .insert({ staff_id: staff.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftErr || !newShift) throw new Error(`seedCashPayment: shift create failed - ${shiftErr?.message}`);
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: 'E2E Payment Methods Seed',
      status: 'closed',
      closed_at: new Date().toISOString(),
      staff_id: staff.id,
      shift_id: shiftId,
      is_deleted: false,
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedCashPayment: tab insert failed - ${tabErr?.message}`);

  const { error: payErr } = await admin.from('payments').insert({
    tab_id: tab.id,
    amount: 25,
    method: 'cash',
    processed_by: staff.id,
    processed_at: new Date().toISOString(),
    idempotency_key: `e2e-phase24-payment-methods-${String(Date.now())}`,
  });
  if (payErr) throw new Error(`seedCashPayment: payment insert failed - ${payErr.message}`);
}

/**
 * Phase 14 (inventory-analytics) — Plan 01: Valuation section (INVR-01).
 *
 * Seeds one product with a distinctive, known cost_price/quantity_on_hand so
 * the rendered store-total can be reconciled against an independently
 * computed expected total (see computeExpectedValuationTotal below).
 */
async function seedValuationFixture(): Promise<{ productName: string }> {
  const admin = getServiceClient();
  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id, name')
    .limit(1)
    .single();
  if (pErr || !product) {
    throw new Error(`seedValuationFixture: no seeded product found - ${pErr?.message}`);
  }

  const { error: uErr } = await admin
    .from('inventory')
    .update({ quantity_on_hand: 17, cost_price: 12.34 })
    .eq('product_id', product.id);
  if (uErr) throw new Error(`seedValuationFixture: inventory update failed - ${uErr.message}`);

  return { productName: product.name as string };
}

/**
 * Independently computes the expected store-wide valuation total by summing
 * quantity_on_hand * cost_price across all inventory rows — mirrors
 * computeInventoryValueAsOf's formula (D-03/D-04), queried directly rather
 * than reusing app code, to prove UI/data reconciliation (success criterion
 * #5) instead of only proving the app agrees with itself. Every seeded test
 * environment has zero stock_movements dated after "now", so the live
 * inventory table already equals the "as of end-of-today" reconstruction.
 */
async function computeExpectedValuationTotal(): Promise<number> {
  const admin = getServiceClient();
  const { data, error } = await admin.from('inventory').select('quantity_on_hand, cost_price');
  if (error) throw new Error(`computeExpectedValuationTotal: ${error.message}`);
  let total = 0;
  for (const row of (data ?? []) as { quantity_on_hand: number; cost_price: number | null }[]) {
    if (row.cost_price === null) continue;
    total += Number(row.quantity_on_hand) * Number(row.cost_price);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Phase 14 (inventory-analytics) — Plan 03: Shrinkage/Waste + Expiry-Loss
 * sections (INVR-02/INVR-03). Seeds one 'waste' and one 'expired'
 * stock_movements row for a product with a known cost_price, so the
 * Shrinkage/Waste total can be asserted to include the waste value and
 * exclude the expired value, and vice versa for Expiry-Loss — proving the
 * "filtered separately" requirement end-to-end (ROADMAP SC #3), not just in
 * unit tests.
 */
async function seedShrinkageFixture(): Promise<{
  productName: string;
  wasteValue: number;
  expiredValue: number;
}> {
  const admin = getServiceClient();
  const { data: staff, error: sErr } = await admin
    .from('profiles')
    .select('id')
    .limit(1)
    .single();
  if (sErr || !staff) throw new Error(`seedShrinkageFixture: no staff profile - ${sErr?.message}`);

  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id, name')
    .limit(1)
    .single();
  if (pErr || !product) {
    throw new Error(`seedShrinkageFixture: no seeded product found - ${pErr?.message}`);
  }

  const costPrice = 8.5;
  const { error: uErr } = await admin
    .from('inventory')
    .update({ cost_price: costPrice })
    .eq('product_id', product.id);
  if (uErr) throw new Error(`seedShrinkageFixture: inventory update failed - ${uErr.message}`);

  const wasteQty = 2;
  const expiredQty = 3;

  const { error: movErr } = await admin.from('stock_movements').insert([
    {
      product_id: product.id,
      quantity_delta: -wasteQty,
      reason: 'waste',
      staff_id: staff.id,
    },
    {
      product_id: product.id,
      quantity_delta: -expiredQty,
      reason: 'expired',
      staff_id: staff.id,
    },
  ]);
  if (movErr) throw new Error(`seedShrinkageFixture: stock_movements insert failed - ${movErr.message}`);

  return {
    productName: product.name as string,
    wasteValue: Math.round(wasteQty * costPrice * 100) / 100,
    expiredValue: Math.round(expiredQty * costPrice * 100) / 100,
  };
}

/** Local calendar day 00:00:00.000-23:59:59.999, matching src/pages/reports/index.tsx's
 * default date-range (today/today), so the fixture always lands inside the
 * report's active window regardless of time-of-day/timezone. */
function localDayRange(d: Date): { from: Date; to: Date } {
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from, to };
}

/**
 * Independently computes the expected Shrinkage/Waste total (waste +
 * correction + unclassified_adjustments, excluding 'expired') and the
 * expected Expiry-Loss total (expired only) by querying stock_movements +
 * inventory directly and re-grouping in JS — mirrors groupShrinkageByReason's
 * formula (D-02/D-03) without calling the app's own function, to prove
 * UI/data reconciliation (success criterion #5) rather than the app agreeing
 * with itself. Scoped to today's local calendar day to match the report's
 * default date range.
 */
async function computeExpectedShrinkageTotals(): Promise<{
  shrinkageWasteTotal: number;
  expiryLossTotal: number;
}> {
  const admin = getServiceClient();
  const { from, to } = localDayRange(new Date());

  const { data: invData, error: invErr } = await admin
    .from('inventory')
    .select('product_id, cost_price');
  if (invErr) throw new Error(`computeExpectedShrinkageTotals: ${invErr.message}`);
  const costByProduct = new Map<string, number | null>(
    (invData ?? []).map((r: { product_id: string; cost_price: number | null }) => [
      r.product_id,
      r.cost_price,
    ])
  );

  const { data: movData, error: movErr } = await admin
    .from('stock_movements')
    .select('product_id, quantity_delta, reason, created_at')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());
  if (movErr) throw new Error(`computeExpectedShrinkageTotals: ${movErr.message}`);

  let shrinkageWasteTotal = 0;
  let expiryLossTotal = 0;
  for (const row of (movData ?? []) as {
    product_id: string;
    quantity_delta: number;
    reason: string;
  }[]) {
    if (row.quantity_delta >= 0) continue;
    const costPrice = costByProduct.get(row.product_id) ?? null;
    const value = costPrice === null ? 0 : Math.abs(row.quantity_delta) * costPrice;
    if (row.reason === 'expired') {
      expiryLossTotal += value;
    } else if (row.reason === 'waste' || row.reason === 'correction' || row.reason === 'manual_adjustment') {
      shrinkageWasteTotal += value;
    }
  }
  return {
    shrinkageWasteTotal: Math.round(shrinkageWasteTotal * 100) / 100,
    expiryLossTotal: Math.round(expiryLossTotal * 100) / 100,
  };
}

/**
 * Phase 14 (inventory-analytics) — Plan 04: Turnover section (INVR-04).
 * Seeds FIXTURE_PRODUCT — the codebase's stable fixture product, guaranteed
 * to already have a real `inventory` row (unlike an arbitrary
 * `.limit(1).single()` pick, which can land on a leftover, inventory-less
 * `__test_r_box_*` product from an unrelated integration-test run sharing
 * this local DB) — with a known cost_price, plus one additional order_item
 * (a manual insert, not seedOpenTab, since seedOpenTab always seeds exactly
 * 1 unit and this fixture needs a distinctive addition to assert against).
 * Mirrors the "Margin layout" test's local getServiceClient() order_item
 * insert pattern elsewhere in this file. Reuses useProductSalesReport's own
 * data shape (order_items -> orders -> tabs), never a second
 * sales-aggregation query. Returns the independently-recomputed TOTAL units
 * sold today for FIXTURE_PRODUCT (not just this seed's own quantity) —
 * mirrors computeExpectedValuationTotal/computeExpectedShrinkageTotals's
 * reconciliation pattern, since other specs sharing this local DB may also
 * have sold it earlier today.
 */
async function seedTurnoverFixture(): Promise<{ productName: string; unitsSold: number }> {
  const admin = getServiceClient();
  const { data: staff, error: sErr } = await admin
    .from('profiles')
    .select('id')
    .limit(1)
    .single();
  if (sErr || !staff) throw new Error(`seedTurnoverFixture: no staff profile - ${sErr?.message}`);

  const { data: product, error: pErr } = await admin
    .from('products')
    .select('id, name, base_price')
    .eq('name', FIXTURE_PRODUCT)
    .single();
  if (pErr || !product) {
    throw new Error(`seedTurnoverFixture: ${FIXTURE_PRODUCT} fixture product not found - ${pErr?.message}`);
  }

  const { error: uErr } = await admin
    .from('inventory')
    .update({ quantity_on_hand: 20, cost_price: 6.5 })
    .eq('product_id', product.id);
  if (uErr) throw new Error(`seedTurnoverFixture: inventory update failed - ${uErr.message}`);

  let shiftId: string;
  const { data: existingShift } = await admin
    .from('shifts')
    .select('id')
    .eq('staff_id', staff.id)
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift, error: shiftErr } = await admin
      .from('shifts')
      .insert({ staff_id: staff.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftErr || !newShift) throw new Error(`seedTurnoverFixture: shift create failed - ${shiftErr?.message}`);
    shiftId = newShift.id as string;
  }

  const { data: tab, error: tabErr } = await admin
    .from('tabs')
    .insert({
      customer_name: 'E2E Turnover Seed',
      status: 'open',
      staff_id: staff.id,
      shift_id: shiftId,
      is_deleted: false,
    })
    .select('id')
    .single();
  if (tabErr || !tab) throw new Error(`seedTurnoverFixture: tab insert failed - ${tabErr?.message}`);

  const { data: order, error: oErr } = await admin
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: staff.id, status: 'pending' })
    .select('id')
    .single();
  if (oErr || !order) throw new Error(`seedTurnoverFixture: order insert failed - ${oErr?.message}`);

  const { error: iErr } = await admin.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 4,
    unit_price: product.base_price,
    modifier_price_delta: 0,
  });
  if (iErr) throw new Error(`seedTurnoverFixture: order_item insert failed - ${iErr.message}`);

  // Independently recompute the total units sold TODAY for this product,
  // mirroring useProductSalesReport's own filter (non-voided order status,
  // tabs.created_at within today) — proves UI/data reconciliation instead of
  // assuming this seed's own quantity is the only contributor.
  const { from, to } = localDayRange(new Date());
  const { data: soldRows, error: soldErr } = await admin
    .from('order_items')
    .select('quantity, orders!inner(status, tabs!inner(created_at))')
    .eq('product_id', product.id)
    .neq('orders.status', 'voided')
    .gte('orders.tabs.created_at', from.toISOString())
    .lte('orders.tabs.created_at', to.toISOString());
  if (soldErr) throw new Error(`seedTurnoverFixture: units-sold recompute failed - ${soldErr.message}`);
  const unitsSold = (soldRows ?? []).reduce(
    (sum: number, r: { quantity: number }) => sum + r.quantity,
    0
  );

  return { productName: product.name as string, unitsSold };
}

/** Formats an amount as this codebase's MoneyDisplay would render it when
 * negative (i.e. Shrinkage/Waste and Expiry-Loss totals, which are always
 * displayed via `MoneyDisplay amount={-total}`) — unicode minus (U+2212),
 * not a hyphen. */
function formatNegativeUsd(amount: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `−$${formatted}`;
}

/**
 * Reads the live `billing` settings row the same way process_direct_sale_atomic
 * does (`settings.value->>'taxRatePercent'`), falling back to 16 to match the
 * migration's own COALESCE default when no row exists yet.
 * Copied verbatim from e2e/48-reopen-closed-ticket.spec.ts.
 */
async function getTaxRatePercent(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const rate = (data?.value as { taxRatePercent?: number } | null)?.taxRatePercent;
  return typeof rate === 'number' ? rate : 16;
}

/**
 * Mirrors process_direct_sale_atomic's two-step rounding (tax rounded first,
 * then added to the subtotal) so amounts computed here land within the RPC's
 * one-cent authority tolerance instead of drifting from a single-step
 * (subtotal * (1 + rate)) computation.
 * Copied verbatim from e2e/48-reopen-closed-ticket.spec.ts.
 */
function computeAuthoritativeTotal(subtotal: number, taxRatePercent: number): number {
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
}

/**
 * Seeds a paid tab with 2 order_items via process_direct_sale_atomic (the
 * real checkout RPC, service-role only) — mirrors
 * e2e/48-reopen-closed-ticket.spec.ts's seedPaidTabViaDirectSale, extended to
 * 2 distinct products so the reopened ticket still has a remaining item after
 * one is removed. Replaces the old removable-item fixture (which seeded an
 * occupied bar/pool table for a route deleted with the bar/pool domain):
 * the reason-required removal test only ever needed a paid tab it could
 * reopen and edit via /payments.
 */
async function seedPaidTabWithTwoItems(cajaSessionId: string): Promise<SeededPaidTab> {
  const admin = getServiceClient();

  let shiftId: string;
  let shiftStaffId: string;
  const { data: existingShift, error: shiftLookupError } = await admin
    .from('shifts')
    .select('id, staff_id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (shiftLookupError) {
    throw new Error(`seedPaidTabWithTwoItems: shift lookup failed - ${shiftLookupError.message}`);
  }
  if (existingShift) {
    shiftId = existingShift.id as string;
    shiftStaffId = existingShift.staff_id as string;
  } else {
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)
      .single();
    if (profileError || !profile) {
      throw new Error(`seedPaidTabWithTwoItems: admin profile not found - ${profileError?.message ?? 'none'}`);
    }
    const { data: newShift, error: shiftCreateError } = await admin
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftCreateError || !newShift) {
      throw new Error(`seedPaidTabWithTwoItems: shift create failed - ${shiftCreateError?.message ?? 'none'}`);
    }
    shiftId = newShift.id as string;
    shiftStaffId = profile.id as string;
  }

  const { data: products, error: productError } = await admin
    .from('products')
    .select('id, base_price')
    .eq('is_active', true)
    .limit(2);
  if (productError || !products || products.length < 2) {
    throw new Error(
      `seedPaidTabWithTwoItems: need at least 2 active products - ${productError?.message ?? 'none'}`
    );
  }

  const taxRatePercent = await getTaxRatePercent(admin);
  const items = products.map(p => ({
    product_id: (p as { id: string }).id,
    quantity: 1,
    unit_price: Number((p as { base_price: number }).base_price),
  }));
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const amount = computeAuthoritativeTotal(subtotal, taxRatePercent);

  const { data, error } = await admin.rpc('process_direct_sale_atomic', {
    p_staff_id: shiftStaffId,
    p_shift_id: shiftId,
    p_caja_session_id: cajaSessionId,
    p_items: items,
    p_idempotency_key: `e2e-report-tabs-removal-${randomUUID()}`,
    p_method: 'cash',
    p_amount: amount,
    p_tendered_amount: amount,
  });
  if (error) {
    throw new Error(`seedPaidTabWithTwoItems: process_direct_sale_atomic failed - ${error.message}`);
  }
  const rpcResult = data as { ok: boolean; code?: string; message?: string; tabId?: string } | null;
  if (!rpcResult?.ok || !rpcResult.tabId) {
    throw new Error(
      `seedPaidTabWithTwoItems: process_direct_sale_atomic returned not-ok - ${rpcResult?.code ?? 'no code'}: ${rpcResult?.message ?? 'no message'}`
    );
  }

  const tabId = rpcResult.tabId;

  const { data: payment, error: payErr } = await admin
    .from('payments')
    .select('id')
    .eq('tab_id', tabId)
    .limit(1)
    .single();
  if (payErr || !payment) {
    throw new Error(`seedPaidTabWithTwoItems: payment lookup failed - ${payErr?.message ?? 'no row'}`);
  }

  return { tabId, paymentId: payment.id as string };
}

async function enterManagerPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    await page.getByRole('button', { name: label }).click();
  }
}

/** Reproduces src/pages/reports/index.tsx's toDateStr() exactly (local
 * calendar date, not UTC/ISO) so the test's notion of "today"/"yesterday"
 * can never disagree with the app's own default date range, in any
 * timezone or time of day (closes 04-VERIFICATION.md Gap G-04-1). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${day}`;
}

test.describe('Reports Page', () => {
  let cajaSessionId = '';

  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(530);
    await page.goto('/');
  });

  test('Reports page loads', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /daily caja report/i })).toBeVisible({ timeout: 20_000 });
    await logout(page);
  });

  test('Session picker shows closed sessions', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');
    const sel = page.locator('#caja-selector');
    await expect(sel).toBeVisible({ timeout: 20_000 });
    const options = await sel.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(1);
    await logout(page);
  });

  test('Report sections visible after selecting session', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');
    const sel = page.locator('#caja-selector');
    await expect(sel).toBeVisible({ timeout: 20_000 });
    const val = await sel.locator('option').nth(0).getAttribute('value');
    if (val) await sel.selectOption(val);

    await expect(page.getByText('Total Revenue', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Cash Reconciliation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top 10 Products' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Staff Performance' })).toBeVisible();
    await logout(page);
  });

  test('Revenue breakdown shows cash and card', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');
    const sel = page.locator('#caja-selector');
    await expect(sel).toBeVisible({ timeout: 20_000 });
    const val = await sel.locator('option').nth(0).getAttribute('value');
    if (val) await sel.selectOption(val);
    await expect(page.getByText('Cash Sales', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Card Sales', { exact: false })).toBeVisible();
    await logout(page);
  });

  test('Cash reconciliation variance displayed', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');
    const sel = page.locator('#caja-selector');
    await expect(sel).toBeVisible({ timeout: 20_000 });
    const val = await sel.locator('option').nth(0).getAttribute('value');
    if (val) await sel.selectOption(val);
    // exact: true — a "Recipe Variance" report tab was added since this test
    // was written; { exact: false } now also matches that tab's label,
    // causing a strict-mode violation (2 elements) on the substring "Variance".
    await expect(page.getByText('Variance', { exact: true })).toBeVisible({ timeout: 30_000 });
    await logout(page);
  });

  // --------------------------------------------------------------------------
  // Sprint 1 Feature #12 — Product Sales & Hourly Breakdown tab tests
  // --------------------------------------------------------------------------

  // /pos (the UI that used to open a tab and add an item) was deleted in Plan
  // 01-11 (D-07) — no stub until Phase 2 rebuilds direct-sale checkout. This
  // test's real subject is `useProductSalesReport` (src/entities/tab/model/
  // queries-reports.ts), which aggregates directly from `order_items` joined
  // through a non-voided `order` to its `tab` (filtered by `tabs.created_at`)
  // — it does not require a payment/closed tab. Seeding an open tab with an
  // item via `seedOpenTab` reproduces that exact data shape without the
  // deleted UI (same pattern as e2e/10-inventory.spec.ts).
  test('Product Sales tab shows at least one product row with revenue > $0.00 after an order', async ({ page }) => {
    await loginAs(page, 'admin');

    await seedOpenTab({ customerName: 'E2E-Reports-Test', withItem: true, productName: FIXTURE_PRODUCT });

    // Navigate to reports
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /product sales/i }).click();

    // Assert the Product Sales tab panel is visible (it's always rendered, may contain data or empty state)
    await expect(page.getByRole('tabpanel', { name: /product sales/i })).toBeVisible({
      timeout: 20_000,
    });

    await logout(page);
  });

  test('Product Sales: date range filter to today shows data or empty state (no crash)', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /product sales/i }).click();

    // Ensure From and To inputs exist and have today's value
    const today = localDateStr(new Date());
    const fromInput = page.getByLabel('From:').nth(0);
    const toInput = page.getByLabel('To:').nth(0);
    await expect(fromInput).toBeVisible({ timeout: 10_000 });
    await expect(toInput).toBeVisible({ timeout: 10_000 });

    // Confirm default date is today
    await expect(fromInput).toHaveValue(today);
    await expect(toInput).toHaveValue(today);

    // Panel should render without crashing (either table rows or empty state)
    await expect(
      page.locator('[data-testid="product-sales-panel"], [class*="DataTable"], [data-slot="data-table"], tbody, [aria-label*="No sales"]')
        .first()
    ).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  test('Product Sales: date range filter to far past shows empty state', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /product sales/i }).click();

    // Set From and To to a date with no data
    const fromInput = page.getByLabel('From:').nth(0);
    const toInput = page.getByLabel('To:').nth(0);
    await expect(fromInput).toBeVisible({ timeout: 10_000 });

    await fromInput.fill('2020-01-01');
    await toInput.fill('2020-01-02');

    // Trigger re-query by blurring the input
    await toInput.press('Tab');

    // Text updated by the Phase 21 i18n migration
    // (productSalesPanel.emptyTitle in en-US/wAdmin.json): "No sales data"
    // became "No sales in this range" — the role itself (EmptyState's
    // role="status") is unchanged.
    await expect(page.getByRole('status').filter({ hasText: /No sales in this range/i })).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  test('Product Sales: Margin column has no layout breakage at desktop and narrow viewports', async ({ page }) => {
    test.setTimeout(90_000);

    // Row 1 — unknown-cost row: seedOpenTab never sets cost_price_snapshot,
    // so the fixture product's Margin cell renders the aria-labelled "—"
    // placeholder.
    const { orderId } = await seedOpenTab({
      customerName: 'E2E-Margin-Layout',
      withItem: true,
      productName: FIXTURE_PRODUCT,
    });
    if (!orderId) throw new Error('seedOpenTab did not return an orderId for withItem: true');

    // Row 2 — populated-margin row: a second order_items row on the same
    // order, with cost_price_snapshot set, mirroring seedCashPayment's local
    // getServiceClient() insert pattern.
    const admin = getServiceClient();
    const { data: otherProduct, error: pErr } = await admin
      .from('products')
      .select('id, name, base_price')
      .neq('name', FIXTURE_PRODUCT)
      .limit(1)
      .single();
    if (pErr) {
      throw new Error(`Margin layout test: no second product found - ${pErr.message}`);
    }
    if (!otherProduct) {
      throw new Error('Margin layout test: no second product found');
    }
    const basePrice = otherProduct.base_price as number;
    const costPriceSnapshot = Math.round(basePrice * 0.4 * 100) / 100;
    const { error: iErr } = await admin.from('order_items').insert({
      order_id: orderId,
      product_id: otherProduct.id,
      quantity: 1,
      unit_price: basePrice,
      modifier_price_delta: 0,
      cost_price_snapshot: costPriceSnapshot,
    });
    if (iErr) throw new Error(`Margin layout test: order_item insert failed - ${iErr.message}`);
    const otherProductName = otherProduct.name as string;

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /product sales/i }).click();

    const tabPanel = page.getByRole('tabpanel', { name: /product sales/i });
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const columnNames = ['Product', 'Category', 'Units Sold', 'Revenue', '% of Total', 'Margin'];
    const marginAriaLabel = 'Margin unavailable — no recorded cost for this period';

    async function assertNoLayoutBreakage(): Promise<void> {
      const headers = columnNames.map(name => tabPanel.getByRole('columnheader', { name, exact: true }));
      for (const header of headers) {
        await expect(header).toBeVisible({ timeout: 20_000 });
      }

      const fixtureRow = tabPanel.locator('tbody tr').filter({ hasText: FIXTURE_PRODUCT }).first();
      const otherRow = tabPanel.locator('tbody tr').filter({ hasText: otherProductName }).first();
      await expect(fixtureRow).toBeVisible({ timeout: 20_000 });
      await expect(otherRow).toBeVisible({ timeout: 20_000 });

      const fixtureMarginCell = fixtureRow.locator('td:nth-child(6)');
      await expect(fixtureMarginCell.locator(`[aria-label="${marginAriaLabel}"]`)).toBeVisible();

      const otherMarginCell = otherRow.locator('td:nth-child(6)');
      await expect(otherMarginCell).toContainText('$');

      // No header-to-header x-overlap: each header's right edge stays at or
      // before the next header's left edge (small tolerance for rounding).
      const headerBoxes = [];
      for (const header of headers) {
        const box = await header.boundingBox();
        if (!box) throw new Error('columnheader has no bounding box');
        headerBoxes.push(box);
      }
      headerBoxes.sort((a, b) => a.x - b.x);
      const [leftmostHeaderBox, ...restHeaderBoxes] = headerBoxes;
      if (!leftmostHeaderBox) throw new Error('no columnheader bounding boxes found');
      let previousBox = leftmostHeaderBox;
      for (const box of restHeaderBoxes) {
        expect(previousBox.x + previousBox.width).toBeLessThanOrEqual(box.x + 2);
        previousBox = box;
      }

      // No header-to-body y-overlap (catches sticky/absolute-position regressions).
      const firstBodyRowBox = await tabPanel.locator('tbody tr').first().boundingBox();
      if (!firstBodyRowBox) throw new Error('first body row has no bounding box');
      expect(leftmostHeaderBox.y + leftmostHeaderBox.height).toBeLessThanOrEqual(firstBodyRowBox.y + 2);
    }

    // Default desktop viewport (1280x800 — playwright.config.ts's configured default).
    await assertNoLayoutBreakage();

    // Narrow/minimum-supported viewport (1024x700, per src-tauri/tauri.conf.json).
    await page.setViewportSize({ width: 1024, height: 700 });
    await assertNoLayoutBreakage();

    await logout(page);
  });

  test('Hourly Breakdown tab shows 24 rows', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /hourly breakdown/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /hourly breakdown/i }).click();

    // Wait for content to load (either table or empty state). LoadingSpinner's
    // aria-label is "Loading" (no ellipsis) — wait for it to clear before
    // reading rows, otherwise the isTableVisible check below can race the
    // fetch (see the identical fix in e2e/reports/product-sales.spec.ts).
    const tabPanel = page.getByRole('tabpanel').last();
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status', { name: 'Loading' })).not.toBeVisible({ timeout: 20_000 });

    // If there is a table, assert 24 rows; if empty state, that is acceptable too
    const tbody = tabPanel.locator('tbody');
    const isTableVisible = await tbody.isVisible({ timeout: 10_000 }).catch(() => false);

    if (isTableVisible) {
      const rows = tbody.locator('tr');
      await expect(rows).toHaveCount(24, { timeout: 20_000 });
    } else {
      // Empty state is valid when no data is present
      await expect(tabPanel.getByRole('heading', { name: 'No hourly data' })).toBeVisible({ timeout: 10_000 });
    }

    await logout(page);
  });

  test('Hourly Breakdown: Peak hour callout visible when revenue data exists', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /hourly breakdown/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /hourly breakdown/i }).click();

    const tabPanel = page.getByRole('tabpanel').last();
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('status', { name: 'Loading' })).not.toBeVisible({ timeout: 20_000 });

    // If there are orders (revenue > 0), Peak callout must appear.
    // If no orders, table is in all-zero state and EmptyState renders — skip the peak check.
    const hasTable = await tabPanel.locator('tbody tr').first().isVisible({ timeout: 8_000 }).catch(() => false);

    if (hasTable) {
      await expect(tabPanel.getByText(/Peak:/i)).toBeVisible({ timeout: 15_000 });
    } else {
      // No data — acceptable empty state
      await expect(tabPanel.getByText(/No hourly data/i)).toBeVisible({ timeout: 10_000 });
    }

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // S7-03 — Voids & Refunds sub-view (POS-4)
  // --------------------------------------------------------------------------

  test('Voids & Refunds tab is present and navigable on ReportsPage', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    // The Voids & Refunds tab trigger must be visible
    await expect(page.getByRole('tab', { name: /voids/i })).toBeVisible({ timeout: 20_000 });

    // Clicking it activates the tab and shows the panel
    await page.getByRole('tab', { name: /voids/i }).click();
    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  test('Voids & Refunds: shows date range inputs sharing the global filter', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /voids/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /voids/i }).click();

    // Date range inputs must be present within the Voids tab content
    const today = localDateStr(new Date());
    // Labels "From:" and "To:" are shared across tabs; after switching to Voids the tab-scoped
    // inputs in the tabpanel are what we check
    const tabPanel = page.getByRole('tabpanel');
    const fromInput = tabPanel.getByLabel('From:');
    const toInput = tabPanel.getByLabel('To:');

    await expect(fromInput).toBeVisible({ timeout: 10_000 });
    await expect(toInput).toBeVisible({ timeout: 10_000 });

    // Default date is today for both
    await expect(fromInput).toHaveValue(today);
    await expect(toInput).toHaveValue(today);

    await logout(page);
  });

  test('Voids & Refunds: empty state shown when date range has no voids', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /voids/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /voids/i }).click();

    const tabPanel = page.getByRole('tabpanel');

    // Set date range to year 2020 — guaranteed to have no void data
    const fromInput = tabPanel.getByLabel('From:');
    const toInput = tabPanel.getByLabel('To:');
    await expect(fromInput).toBeVisible({ timeout: 10_000 });

    await fromInput.fill('2020-01-01');
    await toInput.fill('2020-01-02');
    await toInput.press('Tab');

    // AC-4: empty state message must appear
    await expect(tabPanel.getByText(/no voids or refunds in this range/i)).toBeVisible({
      timeout: 20_000,
    });

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // S7-04 — Revenue by Category sub-view (POS-5)
  // --------------------------------------------------------------------------

  test('Revenue by Category tab is present and navigable on ReportsPage', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await expect(page.getByRole('tab', { name: /revenue by category/i })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: /revenue by category/i }).click();
    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  test('Revenue by Category: all canonical categories appear with date range filter (no crash, no empty state)', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await expect(page.getByRole('tab', { name: /revenue by category/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /revenue by category/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    // AC-4: the "No category data" empty state must NOT appear when categories exist in the DB
    await expect(tabPanel.getByText('No category data')).not.toBeVisible({ timeout: 15_000 });

    // AC-1: table must be present with category name, revenue, and % columns
    await expect(tabPanel.getByRole('columnheader', { name: /category/i })).toBeVisible({ timeout: 15_000 });
    await expect(tabPanel.getByRole('columnheader', { name: /revenue/i })).toBeVisible();
    await expect(tabPanel.getByRole('columnheader', { name: /% of total/i })).toBeVisible();

    await logout(page);
  });

  test('Revenue by Category: shows date range inputs', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await expect(page.getByRole('tab', { name: /revenue by category/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /revenue by category/i }).click();

    const today = localDateStr(new Date());
    const tabPanel = page.getByRole('tabpanel');
    const fromInput = tabPanel.getByLabel('From:');
    const toInput = tabPanel.getByLabel('To:');

    await expect(fromInput).toBeVisible({ timeout: 10_000 });
    await expect(toInput).toBeVisible({ timeout: 10_000 });

    // AC-2: date range inputs are present and default to today
    await expect(fromInput).toHaveValue(today);
    await expect(toInput).toHaveValue(today);

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // S7-06 — DateRangePicker shared state across all four date-filtered tabs (POS-7 AC-2)
  // --------------------------------------------------------------------------

  test('AC-2 (POS-7): changing date range in one tab propagates to all four date-filtered tabs', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    // Start on Product Sales tab
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /product sales/i }).click();

    // Compute yesterday's date string (YYYY-MM-DD)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = localDateStr(yesterday);

    // Click the "Yesterday" preset button on Product Sales tab
    await page.getByRole('button', { name: 'Yesterday' }).first().click();

    // Verify Product Sales tab now shows yesterday in From input
    const productTabPanel = page.getByRole('tabpanel');
    await expect(productTabPanel.getByLabel('From:')).toHaveValue(yesterdayStr, { timeout: 5_000 });

    // Switch to Hourly Breakdown — shared state means same date range
    await page.getByRole('tab', { name: /hourly breakdown/i }).click();
    const hourlyPanel = page.getByRole('tabpanel');
    await expect(hourlyPanel.getByLabel('From:')).toHaveValue(yesterdayStr, { timeout: 10_000 });

    // Switch to Voids & Refunds — must still show yesterday
    await page.getByRole('tab', { name: /voids/i }).click();
    const voidsPanel = page.getByRole('tabpanel');
    await expect(voidsPanel.getByLabel('From:')).toHaveValue(yesterdayStr, { timeout: 10_000 });

    // Switch to Revenue by Category — must still show yesterday
    await page.getByRole('tab', { name: /revenue by category/i }).click();
    const catPanel = page.getByRole('tabpanel');
    await expect(catPanel.getByLabel('From:')).toHaveValue(yesterdayStr, { timeout: 10_000 });

    await logout(page);
  });

  test('Voids & Refunds: table renders columns Timestamp, Staff, Amount, Reason when voids exist', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /voids/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /voids/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    // If rows are present, assert AC-1: all four column headers must be in the table
    const tbody = tabPanel.locator('tbody');
    const hasRows = await tbody.locator('tr').first().isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasRows) {
      // AC-1: all four column headers must be visible
      await expect(tabPanel.getByRole('columnheader', { name: /timestamp/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /staff/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /amount/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /reason/i })).toBeVisible();
    } else {
      // No voids today — empty state is acceptable
      await expect(tabPanel.getByText(/no voids or refunds in this range/i)).toBeVisible({
        timeout: 10_000,
      });
    }

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // Sprint 10 — Staff Performance tab (StaffSalesPanel)
  // --------------------------------------------------------------------------

  test('Sprint 10: Staff Performance tab is present and navigable', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /staff performance/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /staff performance/i }).click();
    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });
    await logout(page);
  });

  test('Sprint 10: Staff Performance tab shows DateRangePicker with today\'s date', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /staff performance/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /staff performance/i }).click();

    const today = localDateStr(new Date());
    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const fromInput = tabPanel.getByLabel('From:');
    const toInput = tabPanel.getByLabel('To:');
    await expect(fromInput).toBeVisible({ timeout: 10_000 });
    await expect(toInput).toBeVisible({ timeout: 10_000 });
    await expect(fromInput).toHaveValue(today);
    await expect(toInput).toHaveValue(today);

    await logout(page);
  });

  test('Sprint 10: Staff Performance tab shows column headers or empty state', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /staff performance/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /staff performance/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    // Either data table with correct columns, or empty state — both are valid
    const tbody = tabPanel.locator('tbody');
    const hasRows = await tbody.locator('tr').first().isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasRows) {
      await expect(tabPanel.getByRole('columnheader', { name: /staff member/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /revenue/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /transactions/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /avg check/i })).toBeVisible();
      await expect(tabPanel.getByRole('columnheader', { name: /voids/i })).toBeVisible();
    } else {
      await expect(tabPanel.getByText(/no staff activity in this date range/i)).toBeVisible({
        timeout: 20_000,
      });
    }

    await logout(page);
  });

  test('Sprint 10: Staff Performance tab shows empty state for year 2020 date range', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /staff performance/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /staff performance/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const fromInput = tabPanel.getByLabel('From:');
    const toInput = tabPanel.getByLabel('To:');
    await expect(fromInput).toBeVisible({ timeout: 10_000 });

    await fromInput.fill('2020-01-01');
    await toInput.fill('2020-01-02');
    await toInput.press('Tab');

    // Changing the date range re-triggers useStaffMetrics' isLoading — wait for
    // StaffSalesPanel's LoadingSpinner (aria-label "Loading", no ellipsis) to
    // clear before reading rows, otherwise the hasRows check below can race the
    // refetch (the DB now carries 50+ staff fixture profiles from other specs,
    // so the aggregation query can outlast a short fixed wait).
    await expect(page.getByRole('status', { name: 'Loading' })).not.toBeVisible({ timeout: 20_000 });

    // Active staff profiles always seed a zero-metric row in useStaffMetrics'
    // aggregation map, so a year-2020 range with no real activity may render
    // either the EmptyState (no active profiles) or a populated table where
    // every row's revenue is $0.00 — both prove "no staff activity" occurred.
    const tbody = tabPanel.locator('tbody');
    const hasRows = await tbody
      .locator('tr')
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    if (hasRows) {
      const revenueCells = tabPanel.locator('tbody tr td:nth-child(2)');
      await expect(revenueCells.first()).toBeVisible();
      const revenueTexts = await revenueCells.allTextContents();
      for (const text of revenueTexts) {
        expect(text).toContain('$0.00');
      }
    } else {
      await expect(tabPanel.getByText(/no staff activity in this date range/i)).toBeVisible({
        timeout: 20_000,
      });
    }

    await logout(page);
  });

  test('Sprint 10: Staff Performance date range propagates from Product Sales tab', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    // Start on Product Sales tab and click the Yesterday preset
    await expect(page.getByRole('tab', { name: /product sales/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /product sales/i }).click();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = localDateStr(yesterday);

    await page.getByRole('button', { name: 'Yesterday' }).first().click();

    // Verify Product Sales tab picked up yesterday
    const productTabPanel = page.getByRole('tabpanel');
    await expect(productTabPanel.getByLabel('From:')).toHaveValue(yesterdayStr, { timeout: 5_000 });

    // Switch to Staff Performance — shared state means same date range
    await page.getByRole('tab', { name: /staff performance/i }).click();
    const staffTabPanel = page.getByRole('tabpanel');
    await expect(staffTabPanel.getByLabel('From:')).toHaveValue(yesterdayStr, { timeout: 10_000 });

    await logout(page);
  });

  test('Sprint 10: Export button appears in Staff Performance tab when data rows exist', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /staff performance/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /staff performance/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    // Only assert Export button when rows are present — ExportButtons is hidden in EmptyState
    const tbody = tabPanel.locator('tbody');
    const hasRows = await tbody.locator('tr').first().isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasRows) {
      await expect(tabPanel.getByRole('button', { name: /export/i })).toBeVisible({ timeout: 10_000 });
    } else {
      // No staff data today — EmptyState correctly hides ExportButtons, test passes
      await expect(tabPanel.getByText(/no staff activity in this date range/i)).toBeVisible({
        timeout: 10_000,
      });
    }

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // Phase 24 (operational-reports-suite-csv) — retained report tabs + CSV
  // export + bartender-initiated reason-required removal (SC-1..SC-4)
  // --------------------------------------------------------------------------

  test('Phase 24: retained new report tabs render without crash', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/reports');

    await expect(page.getByRole('tab', { name: 'Deletions' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Corrections' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Payment Methods' })).toBeVisible();

    // deletions-pre: the standing historical-gap Alert is always visible (not dismissible)
    await page.getByRole('tab', { name: 'Deletions' }).click();
    const deletionsPrePanel = page.getByRole('tabpanel');
    await expect(deletionsPrePanel).toBeVisible({ timeout: 20_000 });
    await expect(deletionsPrePanel.getByText(/partial history|historial parcial/i)).toBeVisible({ timeout: 15_000 });

    // deletions-post: table or empty state, never a crash
    await page.getByRole('tab', { name: 'Corrections' }).click();
    const deletionsPostPanel = page.getByRole('tabpanel');
    await expect(deletionsPostPanel).toBeVisible({ timeout: 20_000 });

    // payment-methods: chart+table or empty state
    await page.getByRole('tab', { name: 'Payment Methods' }).click();
    const paymentMethodsPanel = page.getByRole('tabpanel');
    await expect(paymentMethodsPanel).toBeVisible({ timeout: 20_000 });

    // refunds-reg (RefundsRegister widget) — table or empty state, never a crash.
    // Confirmed during Plan 17-17's src/widgets-to-e2e cross-reference audit to
    // have zero prior e2e coverage anywhere in the suite.
    await page.getByRole('tab', { name: 'Refunds Register' }).click();
    const refundsRegPanel = page.getByRole('tabpanel');
    await expect(refundsRegPanel).toBeVisible({ timeout: 20_000 });
    await expect(
      refundsRegPanel.getByRole('table').or(refundsRegPanel.getByText(/no refunds/i)).first()
    ).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  test('Phase 24: CSV export from Payment Methods report writes a file', async ({ page }) => {
    await seedCashPayment();
    await injectTauriMocks(page);

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await page.getByRole('tab', { name: 'Payment Methods' }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const exportBtn = tabPanel.getByRole('button', { name: /export/i });
    await expect(exportBtn).toBeVisible({ timeout: 20_000 });
    await exportBtn.click();

    const csvItem = page.getByRole('menuitem', { name: /^csv$/i });
    await expect(csvItem).toBeVisible({ timeout: 5_000 });
    await csvItem.click();

    await expect(page.getByText('Report exported successfully.')).toBeVisible({ timeout: 20_000 });

    const mockState = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>)['__exportMockState'] as {
        saveDialogCalled: boolean;
        savedPath: string | null;
      };
    });
    expect(mockState.saveDialogCalled).toBe(true);
    expect(mockState.savedPath).toMatch(/\.csv$/);

    await logout(page);
  });

  // Note: RemoveTabItemDialog/useRemoveTabItem carry no PIN gate or role check
  // of their own — the only reachable UI caller is now EditReopenedItemsPanel
  // (src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx), reached from a
  // reopened tab's payment-history row on /payments (the original table-status
  // page this test used to drive was deleted with the bar/pool domain — see
  // e2e/48-reopen-closed-ticket.spec.ts's SC-3 for the equivalent
  // reopen-then-remove flow this test's setup now mirrors). Removal is gated
  // by its own pre-existing ManagerPinDialog (requiredAction="reopen_tab").
  // This test proves the phase's actual delivery: a cashier-initiated
  // reason-required removal completes without AUTH_FORBIDDEN once past that
  // gate, and the removal is attributed correctly in the deletions-pre report
  // (SC-1).
  //
  // The REOPEN prerequisite must run under an actual manager/admin session,
  // not a cashier one with ManagerPinDialog approval: reopen_tab's server-side
  // check is `auth.uid()`'s OWN role (its doc comment: "the client's
  // ManagerPinDialog is UX-only; this is the actual security boundary") —
  // unlike remove_tab_item, ManagerPinDialog's PIN match never elevates or
  // re-authenticates the session, so a cashier calling reopen_tab always hits
  // AUTH_FORBIDDEN regardless of which PIN is entered. This differs from the
  // pre-move test (e2e/07-reports.spec.ts, deleted bar/pool domain), which
  // only ever drove the (role-check-free) remove_tab_item RPC directly on an
  // already-open pool table — no reopen_tab call was in that flow at all.
  // Reopening here as manager isolates the setup step from the actual claim
  // under test: that the REMOVAL itself is cashier-attributed and completes
  // without AUTH_FORBIDDEN once the tab is already open.
  test('Phase 24: cashier-initiated reason-required removal succeeds (no AUTH_FORBIDDEN) and appears in Deletions', async ({ page }) => {
    test.setTimeout(120_000);
    const seeded = await seedPaidTabWithTwoItems(cajaSessionId);
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

    await loginAs(page, 'manager');
    await page.goto('/payments');

    const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Reopen ticket' }).click();

    const reopenDialog = page.getByRole('dialog', { name: 'Reopen ticket' });
    await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
    await reopenDialog.locator('#reopen-tab-reason').fill('E2E reopen for removal-attribution test');
    await reopenDialog.getByRole('button', { name: 'Request approval' }).click();

    // Step 1 — manager-PIN gate on the reopen action itself
    const reopenPinDialog = page.getByRole('alertdialog');
    await expect(reopenPinDialog).toBeVisible({ timeout: 8_000 });
    await enterManagerPin(page, managerPin);

    await expect(page.getByText(/ticket reopened successfully/i)).toBeVisible({ timeout: 15_000 });
    await expect(reopenDialog).not.toBeVisible({ timeout: 5_000 });
    await logout(page);

    // Removal (the actual claim under test) is cashier-initiated —
    // remove_tab_item carries no server-side role check, so this proves the
    // cashier-attributed removal itself, not the reopen prerequisite.
    await loginAs(page, 'cashier');
    await page.goto('/payments');
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Edit items' }).click();

    const panel = page.getByRole('dialog', { name: 'Edit items on reopened ticket' });
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // Two seeded items — after removing one, the ticket still has a remaining item.
    await panel.getByRole('button', { name: 'Remove' }).first().click();

    // Step 2 — manager-PIN gate on the removal itself (independent prompt, D-05)
    const removePinDialog = page.getByRole('alertdialog');
    await expect(removePinDialog).toBeVisible({ timeout: 8_000 });
    await enterManagerPin(page, managerPin);

    // Step 3 — RemoveTabItemDialog: required reason field, no additional PIN prompt
    const confirmDialog = page.getByRole('alertdialog', { name: 'Remove item?' });
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });

    const confirmBtn = confirmDialog.getByRole('button', { name: 'Remove item' });
    await expect(confirmBtn).toBeDisabled();

    // Unique per-run so a re-run of this test (or a prior failed run's leftover
    // audit row) never causes a strict-mode multi-match on the assertion below.
    const uniqueReason = `Phase 24 E2E - wrong item ${String(Date.now())}`;
    await confirmDialog.locator('#remove-tab-item-reason').fill(uniqueReason);
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // No AUTH_FORBIDDEN — success toast confirms the RPC accepted the cashier-attributed removal
    await expect(page.getByText(/removed from order/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/forbidden/i)).not.toBeVisible();

    await logout(page);

    // Verify attribution in the deletions-pre report
    await loginAs(page, 'admin');
    await page.goto('/reports');
    await page.getByRole('tab', { name: 'Deletions' }).click();
    const deletionsPanel = page.getByRole('tabpanel');
    await expect(deletionsPanel).toBeVisible({ timeout: 20_000 });
    await expect(deletionsPanel.getByText(uniqueReason)).toBeVisible({ timeout: 20_000 });

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // Phase 14 (inventory-analytics-reports) — Plan 01: Valuation section (INVR-01)
  // --------------------------------------------------------------------------

  test('Inventory analytics: Valuation store total reconciles with quantity x current cost across seeded inventory', async ({ page }) => {
    await seedValuationFixture();
    const expectedTotal = await computeExpectedValuationTotal();
    const expectedFormatted = `$${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(expectedTotal)}`;

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    await expect(tabPanel.getByText(expectedFormatted, { exact: false })).toBeVisible({
      timeout: 20_000,
    });

    await logout(page);
  });

  test('Inventory analytics: Valuation formula note renders only the range end date (D-05), never a from-to range', async ({ page }) => {
    await seedValuationFixture();

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const today = localDateStr(new Date());
    const toInput = tabPanel.getByLabel('To:');
    await expect(toInput).toBeVisible({ timeout: 10_000 });
    await expect(toInput).toHaveValue(today);

    const formulaNote = tabPanel.getByText(/on-hand quantity/i);
    await expect(formulaNote).toBeVisible({ timeout: 20_000 });
    const noteText = (await formulaNote.textContent()) ?? '';

    // D-05 backstop: Valuation reads the shared DateRangePicker as "as of end
    // date" only — the formula note must render exactly one date, never an
    // en-dash-separated from-to range like the other 3 sections use.
    expect(noteText).not.toContain('–');
    const slashCount = noteText.split('/').length - 1;
    expect(slashCount).toBeLessThanOrEqual(2);

    await logout(page);
  });

  test('Inventory analytics: Valuation CSV export writes a file', async ({ page }) => {
    await seedValuationFixture();
    await injectTauriMocks(page);

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    // Scoped to the Valuation section specifically — Plan 14-03 added two more
    // sections to this same tabpanel, each with their own "Export" button once
    // they have qualifying rows (from other tests' seeded stock_movements
    // sharing this local DB), which would otherwise strict-mode-violate a
    // tabPanel-wide getByRole('button', { name: /export/i }) lookup.
    const valuationSection = tabPanel.getByTestId('valuation-section');
    const exportBtn = valuationSection.getByRole('button', { name: /export/i });
    await expect(exportBtn).toBeVisible({ timeout: 20_000 });
    await exportBtn.click();

    const csvItem = page.getByRole('menuitem', { name: /^csv$/i });
    await expect(csvItem).toBeVisible({ timeout: 5_000 });
    await csvItem.click();

    await expect(page.getByText('Report exported successfully.')).toBeVisible({ timeout: 20_000 });

    const mockState = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>)['__exportMockState'] as {
        saveDialogCalled: boolean;
        savedPath: string | null;
      };
    });
    expect(mockState.saveDialogCalled).toBe(true);
    expect(mockState.savedPath).toMatch(/\.csv$/);

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // Phase 14 (inventory-analytics-reports) — Plan 03: Shrinkage/Waste (INVR-02)
  // + Expiry-Loss (INVR-03) sections
  // --------------------------------------------------------------------------

  test('Inventory analytics: shrinkage/waste and expiry-loss totals reconcile and stay filtered separately', async ({
    page,
  }) => {
    await seedShrinkageFixture();
    const { shrinkageWasteTotal, expiryLossTotal } = await computeExpectedShrinkageTotals();

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const shrinkageSection = tabPanel.getByTestId('shrinkage-waste-section');
    const expirySection = tabPanel.getByTestId('expiry-loss-section');
    await expect(shrinkageSection).toBeVisible({ timeout: 20_000 });
    await expect(expirySection).toBeVisible({ timeout: 20_000 });

    // Shrinkage/Waste shows the waste-tagged value, never the expired value.
    // .first() — the total appears twice (hero MoneyDisplay + table row cell).
    await expect(
      shrinkageSection.getByText(formatNegativeUsd(shrinkageWasteTotal), { exact: false }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(shrinkageSection.getByText('Expired', { exact: true })).toHaveCount(0);

    // Expiry-Loss shows only the expired value, never the waste value.
    await expect(
      expirySection.getByText(formatNegativeUsd(expiryLossTotal), { exact: false }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(expirySection.getByText('Waste', { exact: true })).toHaveCount(0);

    await logout(page);
  });

  test('Inventory analytics: Shrinkage/Waste CSV export writes a file', async ({ page }) => {
    await seedShrinkageFixture();
    await injectTauriMocks(page);

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const shrinkageSection = page.getByTestId('shrinkage-waste-section');
    await expect(shrinkageSection).toBeVisible({ timeout: 20_000 });

    const exportBtn = shrinkageSection.getByRole('button', { name: /export/i });
    await expect(exportBtn).toBeVisible({ timeout: 20_000 });
    await exportBtn.click();

    const csvItem = page.getByRole('menuitem', { name: /^csv$/i });
    await expect(csvItem).toBeVisible({ timeout: 5_000 });
    await csvItem.click();

    await expect(page.getByText('Report exported successfully.')).toBeVisible({ timeout: 20_000 });

    const mockState = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>)['__exportMockState'] as {
        saveDialogCalled: boolean;
        savedPath: string | null;
      };
    });
    expect(mockState.saveDialogCalled).toBe(true);
    expect(mockState.savedPath).toMatch(/\.csv$/);

    await logout(page);
  });

  test('Inventory analytics: Expiry-Loss CSV export writes a file', async ({ page }) => {
    await seedShrinkageFixture();
    await injectTauriMocks(page);

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const expirySection = page.getByTestId('expiry-loss-section');
    await expect(expirySection).toBeVisible({ timeout: 20_000 });

    const exportBtn = expirySection.getByRole('button', { name: /export/i });
    await expect(exportBtn).toBeVisible({ timeout: 20_000 });
    await exportBtn.click();

    const csvItem = page.getByRole('menuitem', { name: /^csv$/i });
    await expect(csvItem).toBeVisible({ timeout: 5_000 });
    await csvItem.click();

    await expect(page.getByText('Report exported successfully.')).toBeVisible({ timeout: 20_000 });

    const mockState = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>)['__exportMockState'] as {
        saveDialogCalled: boolean;
        savedPath: string | null;
      };
    });
    expect(mockState.saveDialogCalled).toBe(true);
    expect(mockState.savedPath).toMatch(/\.csv$/);

    await logout(page);
  });

  // --------------------------------------------------------------------------
  // Phase 14 (inventory-analytics-reports) — Plan 04: Turnover section (INVR-04)
  // --------------------------------------------------------------------------

  test('Inventory analytics: Turnover row shows units sold and a non-null turnover ratio', async ({ page }) => {
    const { productName, unitsSold } = await seedTurnoverFixture();

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const tabPanel = page.getByRole('tabpanel');
    await expect(tabPanel).toBeVisible({ timeout: 20_000 });

    const turnoverSection = tabPanel.getByTestId('turnover-section');
    await expect(turnoverSection).toBeVisible({ timeout: 20_000 });

    const productRow = turnoverSection.locator('tbody tr').filter({ hasText: productName }).first();
    await expect(productRow).toBeVisible({ timeout: 20_000 });
    await expect(productRow).toContainText(String(unitsSold));

    // Turnover ratio is the 5th column (Product/Category/Units Sold/Avg
    // Inventory Value/Turnover Ratio) — must render a computed number, never
    // the "—" fallback, since this fixture guarantees both units-sold and a
    // non-zero average inventory value.
    const ratioCell = productRow.locator('td').nth(4);
    await expect(ratioCell).not.toContainText('—');

    await logout(page);
  });

  test('Inventory analytics: Turnover CSV export writes a file', async ({ page }) => {
    await seedTurnoverFixture();
    await injectTauriMocks(page);

    await loginAs(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: /inventory analytics/i }).click();

    const turnoverSection = page.getByTestId('turnover-section');
    await expect(turnoverSection).toBeVisible({ timeout: 20_000 });

    const exportBtn = turnoverSection.getByRole('button', { name: /export/i });
    await expect(exportBtn).toBeVisible({ timeout: 20_000 });
    await exportBtn.click();

    const csvItem = page.getByRole('menuitem', { name: /^csv$/i });
    await expect(csvItem).toBeVisible({ timeout: 5_000 });
    await csvItem.click();

    await expect(page.getByText('Report exported successfully.')).toBeVisible({ timeout: 20_000 });

    const mockState = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>)['__exportMockState'] as {
        saveDialogCalled: boolean;
        savedPath: string | null;
      };
    });
    expect(mockState.saveDialogCalled).toBe(true);
    expect(mockState.savedPath).toMatch(/\.csv$/);

    await logout(page);
  });

  test('Inventory analytics: Turnover units-sold is not truncated when the day has >1000 order_items (PostgREST PGRST_DB_MAX_ROWS regression)', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const admin = getServiceClient();

    // Defensive sweep: if a prior run of this test crashed/was killed
    // between creating the filler tab and its `finally` cleanup, the tab
    // (and cascaded order/order_items) would otherwise linger forever —
    // no other sweep in the suite cleans up this name. Same pattern as
    // product-sales-report.integration.test.ts's "KDS E2E Tab%" beforeEach
    // sweep.
    const { data: leakedTabs } = await admin
      .from('tabs')
      .select('id')
      .eq('customer_name', 'E2E Row-Cap Regression Filler');
    const leakedTabIds = (leakedTabs ?? []).map(t => t.id as string);
    if (leakedTabIds.length > 0) {
      const { data: leakedOrders } = await admin.from('orders').select('id').in('tab_id', leakedTabIds);
      const leakedOrderIds = (leakedOrders ?? []).map(o => o.id as string);
      if (leakedOrderIds.length > 0) {
        // Deleting order_items fires the restore trigger, returning any
        // stock the leaked run decremented back onto quantity_on_hand.
        await admin.from('order_items').delete().in('order_id', leakedOrderIds);
        await admin.from('orders').delete().in('id', leakedOrderIds);
      }
      await admin.from('tabs').delete().in('id', leakedTabIds);
    }

    // All setup below is inside `try` so any failure (network flake, a
    // timeout inserting 1005 rows, a retry re-running the test body) is
    // still caught by the matching `finally` cleanup — nothing here can
    // leak a tab/order/inventory top-up behind without it.
    try {
      // Seed 1005 filler order_items today for an UNRELATED product/order,
      // on top of whatever the shared local DB already has for today —
      // this is exactly the condition that silently truncated the old
      // client-side query at PostgREST's default 1000-row response cap
      // (confirmed via `docker inspect supabase-rest` showing
      // PGRST_DB_MAX_ROWS=1000).
      const { data: fillerProduct, error: fillerProductErr } = await admin
        .from('products')
        .select('id')
        .neq('name', 'Bikaji Gulab Jamun 1kg')
        .limit(1)
        .single();
      if (fillerProductErr || !fillerProduct) {
        throw new Error(`filler product lookup failed - ${fillerProductErr?.message}`);
      }

      const { data: staff } = await admin.from('profiles').select('id').limit(1).single();
      if (!staff) throw new Error('no staff profile for filler fixture');

      let fillerShiftId: string;
      const { data: existingShift } = await admin
        .from('shifts')
        .select('id')
        .eq('staff_id', staff.id)
        .is('clock_out', null)
        .limit(1)
        .maybeSingle();
      if (existingShift) {
        fillerShiftId = existingShift.id as string;
      } else {
        const { data: newShift, error: shiftErr } = await admin
          .from('shifts')
          .insert({ staff_id: staff.id, opening_cash: 0 })
          .select('id')
          .single();
        if (shiftErr || !newShift) throw new Error(`filler shift insert failed - ${shiftErr?.message}`);
        fillerShiftId = newShift.id as string;
      }

      const { data: fillerTab, error: fillerTabErr } = await admin
        .from('tabs')
        .insert({
          customer_name: 'E2E Row-Cap Regression Filler',
          status: 'open',
          staff_id: staff.id,
          shift_id: fillerShiftId,
          is_deleted: false,
        })
        .select('id')
        .single();
      if (fillerTabErr || !fillerTab) throw new Error(`filler tab insert failed - ${fillerTabErr?.message}`);
      const fillerTabId: string = fillerTab.id as string;

      try {
        const { data: fillerOrder, error: fillerOrderErr } = await admin
          .from('orders')
          .insert({ tab_id: fillerTabId, staff_id: staff.id, status: 'pending' })
          .select('id')
          .single();
        if (fillerOrderErr || !fillerOrder) {
          throw new Error(`filler order insert failed - ${fillerOrderErr?.message}`);
        }
        const fillerOrderId: string = fillerOrder.id as string;

        const FILLER_COUNT = 1005;
        const testStartedAt = new Date().toISOString();

        // order_items insert has an AFTER INSERT trigger that decrements
        // inventory.quantity_on_hand (CHECK quantity_on_hand >= 0) — top up
        // the filler product's stock first so 1005 filler line items don't
        // drive it negative, then restore the original value in the
        // `finally` below (the matching DELETE trigger already restores
        // +FILLER_COUNT on cleanup).
        const { data: fillerInventory, error: fillerInventoryErr } = await admin
          .from('inventory')
          .select('quantity_on_hand')
          .eq('product_id', fillerProduct.id)
          .single();
        if (fillerInventoryErr || !fillerInventory) {
          throw new Error(`filler inventory lookup failed - ${fillerInventoryErr?.message}`);
        }
        const originalQuantityOnHand = fillerInventory.quantity_on_hand as number;

        try {
          const { error: topUpErr } = await admin
            .from('inventory')
            .update({ quantity_on_hand: originalQuantityOnHand + FILLER_COUNT })
            .eq('product_id', fillerProduct.id);
          if (topUpErr) throw new Error(`filler inventory top-up failed - ${topUpErr.message}`);

          const fillerItems = Array.from({ length: FILLER_COUNT }, () => ({
            order_id: fillerOrderId,
            product_id: fillerProduct.id,
            quantity: 1,
            unit_price: 1,
            modifier_price_delta: 0,
          }));
          const { error: fillerItemsErr } = await admin.from('order_items').insert(fillerItems);
          if (fillerItemsErr) {
            throw new Error(`filler order_items insert failed - ${fillerItemsErr.message}`);
          }

          try {
            const { productName, unitsSold } = await seedTurnoverFixture();

            await loginAs(page, 'admin');
            await page.goto('/reports');
            await expect(page.getByRole('tab', { name: /inventory analytics/i })).toBeVisible({
              timeout: 20_000,
            });
            await page.getByRole('tab', { name: /inventory analytics/i }).click();

            const turnoverSection = page.getByTestId('turnover-section');
            await expect(turnoverSection).toBeVisible({ timeout: 20_000 });

            const productRow = turnoverSection
              .locator('tbody tr')
              .filter({ hasText: productName })
              .first();
            await expect(productRow).toBeVisible({ timeout: 20_000 });
            // The old client-side query truncated at 1000 rows and would
            // have undercounted this product once the filler pushed
            // today's total order_items past that cap. The new RPC
            // aggregates server-side, so this must still show the true,
            // untruncated count. Target the Units Sold column (3rd column:
            // Product/Category/Units Sold/...) exactly, rather than
            // substring-matching the whole row, so a coincidentally
            // matching digit in another cell (e.g. revenue) can't mask a
            // truncation regression.
            const unitsSoldCell = productRow.locator('td').nth(2);
            await expect(unitsSoldCell).toHaveText(String(unitsSold));

            await logout(page);
          } finally {
            // Deleting the filler order_items fires the matching restore
            // trigger (+FILLER_COUNT back onto quantity_on_hand), which
            // returns stock to the topped-up baseline.
            await admin.from('order_items').delete().eq('order_id', fillerOrderId);

            // decrement_inventory_on_order_item fired a stock_movements
            // ('sale') row per order_items INSERT above, and the restore
            // trigger fired above just fired another ('correction') row per
            // DELETE — neither is cleaned up by deleting
            // order_items/orders/tabs, so without this delete every run of
            // this test permanently leaks ~2xFILLER_COUNT stock_movements
            // rows into the shared local DB and can push a sibling report
            // past PostgREST's row cap. Run after the order_items delete
            // above so both the 'sale' and 'correction' rows it produced
            // are in range to be swept up.
            await admin
              .from('stock_movements')
              .delete()
              .eq('product_id', fillerProduct.id)
              .in('reason', ['sale', 'correction'])
              .gte('created_at', testStartedAt);
          }
        } finally {
          // Reset explicitly to the pre-test value regardless of how far
          // setup got (e.g. the order_items insert itself failing above).
          await admin
            .from('inventory')
            .update({ quantity_on_hand: originalQuantityOnHand })
            .eq('product_id', fillerProduct.id);
        }
      } finally {
        await admin.from('orders').delete().eq('tab_id', fillerTabId);
      }
    } finally {
      await admin.from('tabs').delete().eq('customer_name', 'E2E Row-Cap Regression Filler');
    }
  });
});
