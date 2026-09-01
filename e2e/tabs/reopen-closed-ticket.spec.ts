/**
 * E2E spec: Phase 23 — Reopen Closed Ticket
 * Plan: 23-01 (Wave-0 scaffold) / activated in Plan 06 (SC-1, SC-3)
 * Plan 09-01 (v1.1): fixture rebuilt on process_direct_sale_atomic (SC-4);
 * SC-2 (add a line item to a reopened sale) added.
 * Plan 09-03 (v1.1): SC-3 (remove a line item from a reopened sale) added.
 *
 * SC-1: a manager+ PIN-gated dialog reopens a closed/paid tab from the
 * PaymentPane payment-history row (mirrors e2e/tabs/edit-paid-tab.spec.ts's
 * PIN-gate/manager-vs-bartender shape).
 * SC-2: a manager adds a line item to a reopened sale via the new
 * EditReopenedItemsPanel (`useAddItemToTab` -> `create_order_with_items`).
 * SC-3: a manager removes an existing line item from a reopened sale via
 * EditReopenedItemsPanel's per-row "Remove" trigger -> its own
 * ManagerPinDialog -> RemoveTabItemDialog (`useRemoveTabItem` ->
 * `remove_tab_item`), reused unmodified per D-05.
 * SC-4: the seed fixture originates from `process_direct_sale_atomic`
 * (service-role RPC), not hand-built tabs/orders/order_items/payments rows.
 *
 * Note on RBAC shape: `ReopenTabButton` (PaymentPane.tsx) renders for every
 * role on any non-voided, non-refund payment row — there is no route/
 * visibility gate on /payments, mirroring the existing Refund/EditTicket
 * button pattern. The manager+ restriction on `reopen_tab` (23-01
 * MANAGER_EXTRA) is enforced entirely by `ManagerPinDialog`'s eligibleStaff
 * check: a bartender's own PIN is rejected, so a bartender can open the
 * dialog but cannot self-approve a reopen.
 *
 * Note on the bartender-negative assertion: while `ManagerPinDialog`
 * (an AlertDialog) is open on top of the Sheet, Radix's a11y layer marks the
 * Sheet's portal `aria-hidden` (it is still visually on screen, but
 * intentionally hidden from the accessibility tree while a modal covers it).
 * `page.getByRole('dialog', ...)` respects that and will not find it in this
 * state, so the "still open" check below uses a plain attribute-selector
 * locator (`[role="dialog"]`), which is unaffected by aria-hidden ancestors,
 * instead of a role-based query.
 *
 * Requires bar-pos/.env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 *
 * Locale note (Plan 09-01, Rule 1 fix; revised in Plan 17-13): the fixed E2E
 * accounts are nominally pinned to en-US, but this repo's shared remote
 * Supabase project is also the target of concurrently-run E2E suites in
 * other worktrees (locale-switch tests included), so the pinned manager
 * account's `profiles.locale` can be observed as es-MX mid-run. All UI-text
 * selectors below (button names, dialog titles, toast copy) match both the
 * en-US and es-MX strings the app can render for these accounts, rather than
 * assuming a single locale.
 */
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { findRoleStaffId, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

let cajaSessionId = '';

/**
 * Reads the live `billing` settings row the same way process_direct_sale_atomic
 * does (`settings.value->>'taxRatePercent'`/`->>'taxInclusive'`), falling back
 * to 16/true to match the migration's own COALESCE defaults when no row
 * exists yet (Plan 24-01's `taxInclusive` default is `true`).
 */
async function getBillingTaxConfig(
  admin: SupabaseClient
): Promise<{ taxRatePercent: number; taxInclusive: boolean }> {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const v = data?.value as { taxRatePercent?: number; taxInclusive?: boolean } | null;
  return {
    taxRatePercent: typeof v?.taxRatePercent === 'number' ? v.taxRatePercent : 16,
    taxInclusive: typeof v?.taxInclusive === 'boolean' ? v.taxInclusive : true,
  };
}

/**
 * Mode-aware authoritative-total computation matching process_direct_sale_atomic's
 * server-side branch (Plan 24-01): when taxInclusive, the seeded p_amount must
 * equal the catalog subtotal unchanged (TAX-02); when not, mirrors the RPC's
 * two-step rounding (tax rounded first, then added to the subtotal) so amounts
 * land within the RPC's one-cent authority tolerance (TAX-03).
 */
function computeAuthoritativeTotal(
  subtotal: number,
  taxRatePercent: number,
  taxInclusive: boolean
): number {
  if (taxInclusive) return subtotal;
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Seed helper — SC-4: seeds a paid tab via process_direct_sale_atomic
// (service-role only) instead of hand-built tabs/orders/order_items/payments
// rows, so the fixture exercises the real checkout path's invariants.
// ---------------------------------------------------------------------------

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
}

async function seedPaidTabViaDirectSale(): Promise<SeededPaidTab> {
  const admin = getServiceClient();

  // Seeding must not depend on a browser-side login having already opened a
  // shift (that couples DB seeding to UI/hydration timing) — create one
  // directly via the service-role client if none is open, same fallback
  // seedPaidTab (the fixture this replaces) used.
  let shiftId: string;
  let shiftStaffId: string;
  const { data: existingShift, error: shiftLookupError } = await admin
    .from('shifts')
    .select('id, staff_id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (shiftLookupError) {
    throw new Error(`seedPaidTabViaDirectSale: shift lookup failed - ${shiftLookupError.message}`);
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
      throw new Error(`seedPaidTabViaDirectSale: admin profile not found - ${profileError?.message ?? 'none'}`);
    }
    const { data: newShift, error: shiftCreateError } = await admin
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftCreateError || !newShift) {
      throw new Error(`seedPaidTabViaDirectSale: shift create failed - ${shiftCreateError?.message ?? 'none'}`);
    }
    shiftId = newShift.id as string;
    shiftStaffId = profile.id as string;
  }

  const { data: product, error: productError } = await admin
    .from('products')
    .select('id, base_price')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (productError || !product) {
    throw new Error(`seedPaidTabViaDirectSale: active product not found - ${productError?.message ?? 'none'}`);
  }

  const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
  // unit_price must match the catalog base_price within 0.01 — process_direct_sale_atomic's
  // own PRICE_MISMATCH check.
  const unitPrice = Number(product.base_price);
  const amount = computeAuthoritativeTotal(unitPrice, taxRatePercent, taxInclusive);

  const { data, error } = await admin.rpc('process_direct_sale_atomic', {
    p_staff_id: shiftStaffId,
    p_shift_id: shiftId,
    p_caja_session_id: cajaSessionId,
    p_items: [{ product_id: product.id, quantity: 1, unit_price: unitPrice }],
    p_idempotency_key: `e2e-reopen-${randomUUID()}`,
    p_method: 'cash',
    p_amount: amount,
    // Tendered must cover `amount` — a fixed 100 broke once a seeded active
    // product's base_price (plus tax) exceeded 100 (Rule 1 fix, Plan 09-03).
    p_tendered_amount: amount,
  });
  if (error) {
    throw new Error(`seedPaidTabViaDirectSale: process_direct_sale_atomic failed - ${error.message}`);
  }
  const rpcResult = data as { ok: boolean; code?: string; message?: string; tabId?: string } | null;
  if (!rpcResult?.ok || !rpcResult.tabId) {
    throw new Error(
      `seedPaidTabViaDirectSale: process_direct_sale_atomic returned not-ok - ${rpcResult?.code ?? 'no code'}: ${rpcResult?.message ?? 'no message'}`
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
    throw new Error(`seedPaidTabViaDirectSale: payment lookup failed - ${payErr?.message ?? 'no row'}`);
  }

  return {
    tabId,
    paymentId: payment.id as string,
  };
}

/**
 * Enter a PIN on the PINKeypad (button-based, aria-label "Key N").
 */
async function enterManagerPin(
  page: import('@playwright/test').Page,
  pin: string,
): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    const btn = page.getByRole('button', { name: label });
    const isVisible = await btn.isVisible().catch(() => false);
    if (isVisible) {
      await btn.click();
    } else {
      await page.keyboard.type(ch);
    }
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.describe('Reopen Closed Ticket', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(540);
    await page.goto('/');
  });

  test.afterEach(async ({ page }) => {
    await logout(page).catch(() => undefined);
  });

  // ==========================================================================
  // SC-1: manager reopens a closed/paid tab from /payments
  // ==========================================================================
  test.describe('SC-1: reopen a closed/paid tab from /payments', () => {
    test(
      'manager opens ReopenTabDialog from a closed tab\'s payment row, passes the PIN gate, ' +
        'fills a reason, confirms, and the tab flips back to open (payment shown as voided)',
      async ({ page }) => {
        test.setTimeout(90_000);

        const db = getServiceClient();
        const seeded = await seedPaidTabViaDirectSale();
        const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

        await loginAs(page, 'manager');
        await gotoAuthed(page, '/payments');

        const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
        await expect(row).toBeVisible({ timeout: 20_000 });
        await row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i }).click();

        const dialog = page.getByRole('dialog', { name: /reopen ticket|reabrir cuenta/i });
        await expect(dialog).toBeVisible({ timeout: 10_000 });

        await dialog.locator('#reopen-tab-reason').fill('E2E reopen reason');
        await dialog.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

        const pinDialog = page.getByRole('alertdialog');
        await expect(pinDialog).toBeVisible({ timeout: 8_000 });
        await enterManagerPin(page, managerPin);

        await expect(page.getByText(/ticket reopened successfully|cuenta reabierta correctamente/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(dialog).not.toBeVisible({ timeout: 5_000 });

        const { data: tabRow } = await db
          .from('tabs')
          .select('status, closed_at, reopen_count')
          .eq('id', seeded.tabId)
          .single();
        expect((tabRow as { status: string }).status).toBe('open');
        expect((tabRow as { closed_at: string | null }).closed_at).toBeNull();
        expect((tabRow as { reopen_count: number }).reopen_count).toBe(1);

        const { data: paymentRow } = await db
          .from('payments')
          .select('status')
          .eq('id', seeded.paymentId)
          .single();
        expect((paymentRow as { status: string }).status).toBe('reopened_void');

        // The now-voided payment's Reopen button should no longer show.
        await expect(row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i })).not.toBeVisible({
          timeout: 10_000,
        });
      },
    );

    // ========================================================================
    // Phase 24 Plan 03: repay a reopened tab — process-payment's receipt must
    // carry the same decomposed subtotal+tax+total shape as a fresh
    // direct-sale receipt (TAX-05), proven by intercepting the edge
    // function's real JSON response.
    // ========================================================================
    test(
      'manager reopens a closed/paid tab and repays it — process-payment\'s receipt shows a ' +
        'decomposed subtotal+tax+total shape',
      async ({ page }) => {
        test.setTimeout(90_000);

        // useTabs() (backs "tabs waiting for payment") is shift-scoped — the
        // reopened tab only shows up in the UI list if it shares shift_id
        // with the manager's CURRENT shift. Open a shift for the manager
        // profile up front so seedPaidTabViaDirectSale's "reuse an existing
        // open shift" lookup (and PINLoginForm's own existing-shift check on
        // loginAs below) both resolve to this same shift, instead of
        // seedPaidTabViaDirectSale falling back to a fresh admin-owned shift.
        const admin = getServiceClient();
        const managerStaffId = await findRoleStaffId(admin, 'manager');
        await admin.from('shifts').insert({ staff_id: managerStaffId, opening_cash: 0 });

        const seeded = await seedPaidTabViaDirectSale();
        const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

        await loginAs(page, 'manager');
        await gotoAuthed(page, '/payments');

        const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
        await expect(row).toBeVisible({ timeout: 20_000 });
        await row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i }).click();

        const reopenDialog = page.getByRole('dialog', { name: /reopen ticket|reabrir cuenta/i });
        await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
        await reopenDialog.locator('#reopen-tab-reason').fill('E2E reopen for repay-receipt test');
        await reopenDialog.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

        const reopenPinDialog = page.getByRole('alertdialog');
        await expect(reopenPinDialog).toBeVisible({ timeout: 8_000 });
        await enterManagerPin(page, managerPin);

        await expect(page.getByText(/ticket reopened successfully|cuenta reabierta correctamente/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(reopenDialog).not.toBeVisible({ timeout: 5_000 });

        // Tab flipped back to 'open' (workers: 1, resetTestState in
        // beforeEach voided every other open tab, so this is the only card).
        const list = page.getByTestId('tabs-waiting-for-payment');
        await expect(list).toBeVisible({ timeout: 20_000 });
        await list.getByRole('button').first().click();
        await page.getByRole('button', { name: /verify pin to process payment|verificar pin/i }).click();

        const payPinDialog = page.getByRole('alertdialog', {
          name: /manager access required|se requiere acceso de gerente/i,
        });
        await expect(payPinDialog).toBeVisible({ timeout: 10_000 });
        await enterManagerPin(page, managerPin);
        await expect(payPinDialog).not.toBeVisible({ timeout: 10_000 });

        await expect(page.getByTestId('payment-btn-cash')).toBeVisible({ timeout: 15_000 });
        await page.getByTestId('payment-btn-cash').click();
        await page.getByLabel(/amount tendered/i).fill('500');

        const responsePromise = page.waitForResponse(
          resp => resp.url().includes('/functions/v1/process-payment') && resp.status() === 200
        );
        await page.getByRole('button', { name: /process payment/i }).click();
        const response = await responsePromise;
        const body = (await response.json()) as {
          receiptData?: { subtotal: number; taxAmount?: number; total: number };
        };
        const receiptData = body.receiptData;
        if (!receiptData) throw new Error('process-payment response had no receiptData');

        expect(receiptData.subtotal).toBeDefined();
        expect(receiptData.taxAmount ?? -1).toBeGreaterThanOrEqual(0);
        expect(Math.round((receiptData.subtotal + (receiptData.taxAmount ?? 0)) * 100)).toBe(
          Math.round(receiptData.total * 100)
        );

        await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });
        await page.getByRole('button', { name: 'Done' }).click();
      },
    );

    test('bartender cannot self-approve the reopen-tab PIN gate (manager+ only, D-04)', async ({
      page,
    }) => {
      test.setTimeout(60_000);

      const db = getServiceClient();
      const seeded = await seedPaidTabViaDirectSale();
      const bartenderPin = process.env['E2E_BARTENDER_PIN'] ?? '';

      await loginAs(page, 'cashier');
      await gotoAuthed(page, '/payments');

      const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i }).click();

      // A plain attribute-selector locator, not a role-based one — while the
      // ManagerPinDialog (AlertDialog) is open on top, Radix marks this Sheet's
      // portal aria-hidden (correct a11y behavior), which a role query would
      // exclude even though the Sheet is still visually on screen and mounted.
      const dialog = page.locator('[role="dialog"]', { hasText: /reopen ticket|reabrir cuenta/i });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator('#reopen-tab-reason').fill('Bartender self-approval attempt');
      await dialog.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

      const pinDialog = page.getByRole('alertdialog');
      await expect(pinDialog).toBeVisible({ timeout: 8_000 });
      await enterManagerPin(page, bartenderPin);

      // Bartender is not in ManagerPinDialog's eligibleStaff list for
      // reopen_tab (manager+ only) — rejected with an error, dialog stays open.
      await expect(pinDialog.getByText(/incorrect pin/i)).toBeVisible({ timeout: 8_000 });
      await expect(dialog).toBeVisible();

      const { data: tabRow } = await db
        .from('tabs')
        .select('status')
        .eq('id', seeded.tabId)
        .single();
      expect((tabRow as { status: string }).status).toBe('paid');

      const { data: paymentRow } = await db
        .from('payments')
        .select('status')
        .eq('id', seeded.paymentId)
        .single();
      expect((paymentRow as { status: string }).status).toBe('completed');
    });
  });

  // ==========================================================================
  // SC-2: manager adds a line item to a reopened sale
  // ==========================================================================
  test.describe('SC-2: add a line item to a reopened sale', () => {
    test(
      'manager reopens a paid tab, adds a new line item via EditReopenedItemsPanel, ' +
        'PIN-confirms, and the item appears in the panel and in order_items',
      async ({ page }) => {
        test.setTimeout(90_000);

        const db = getServiceClient();
        const seeded = await seedPaidTabViaDirectSale();
        const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

        // Find a distinct active product (not already on the seeded tab) so the
        // add-item picker has an unambiguous option to select by name.
        const { data: orders } = await db.from('orders').select('id').eq('tab_id', seeded.tabId);
        const orderIds = (orders ?? []).map(o => (o as { id: string }).id);
        const { data: existingItems } = await db
          .from('order_items')
          .select('product_id')
          .in('order_id', orderIds);
        const existingProductIds = new Set(
          (existingItems ?? []).map(i => (i as { product_id: string }).product_id)
        );
        const { data: candidateProducts } = await db
          .from('products')
          .select('id, name')
          .eq('is_active', true)
          .order('name', { ascending: true });
        const productToAdd = (candidateProducts ?? []).find(
          p => !existingProductIds.has((p as { id: string; name: string }).id)
        ) as { id: string; name: string } | undefined;
        if (!productToAdd) {
          throw new Error('SC-2 setup: no distinct active product available to add');
        }

        await loginAs(page, 'manager');
        await gotoAuthed(page, '/payments');

        const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
        await expect(row).toBeVisible({ timeout: 20_000 });
        await row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i }).click();

        const reopenDialog = page.getByRole('dialog', { name: /reopen ticket|reabrir cuenta/i });
        await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
        await reopenDialog.locator('#reopen-tab-reason').fill('E2E reopen for add-item test');
        await reopenDialog.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

        const reopenPinDialog = page.getByRole('alertdialog');
        await expect(reopenPinDialog).toBeVisible({ timeout: 8_000 });
        await enterManagerPin(page, managerPin);

        await expect(page.getByText(/ticket reopened successfully|cuenta reabierta correctamente/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(reopenDialog).not.toBeVisible({ timeout: 5_000 });

        // "Edit items" is the SALE-03 entry point.
        await row.getByRole('button', { name: /edit items|editar artículos/i }).click();

        const panel = page.getByRole('dialog', { name: /edit items on reopened ticket|editar artículos del ticket reabierto/i });
        await expect(panel).toBeVisible({ timeout: 10_000 });

        await panel.getByRole('button', { name: /add item|agregar artículo/i }).click();

        const productSelect = panel.getByRole('combobox');
        await productSelect.click();
        await page.getByRole('option', { name: productToAdd.name }).click();

        await panel.getByRole('button', { name: /increase quantity|aumentar cantidad/i }).click();

        await panel.getByRole('button', { name: /save changes|guardar cambios/i }).click();

        const addPinDialog = page.getByRole('alertdialog');
        await expect(addPinDialog).toBeVisible({ timeout: 8_000 });
        await enterManagerPin(page, managerPin);

        await expect(page.getByText(/item added to ticket\.|artículo agregado al ticket\./i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(panel.getByText(productToAdd.name)).toBeVisible({ timeout: 10_000 });

        const { data: newOrders } = await db.from('orders').select('id').eq('tab_id', seeded.tabId);
        const newOrderIds = (newOrders ?? []).map(o => (o as { id: string }).id);
        const { data: addedItem } = await db
          .from('order_items')
          .select('id, quantity, product_id')
          .in('order_id', newOrderIds)
          .eq('product_id', productToAdd.id)
          .maybeSingle();
        expect(addedItem).not.toBeNull();
        expect((addedItem as { quantity: number } | null)?.quantity).toBe(2);
      },
    );
  });

  // ==========================================================================
  // SC-3: manager removes a line item from a reopened sale
  // ==========================================================================
  test.describe('SC-3: remove a line item from a reopened sale', () => {
    test(
      'manager reopens a paid tab, removes the existing line item via ' +
        'EditReopenedItemsPanel, PIN-confirms, fills a reason, and the item ' +
        'disappears from the panel and from order_items',
      async ({ page }) => {
        test.setTimeout(90_000);

        const db = getServiceClient();
        const seeded = await seedPaidTabViaDirectSale();
        const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

        const { data: orders } = await db.from('orders').select('id').eq('tab_id', seeded.tabId);
        const orderIds = (orders ?? []).map(o => (o as { id: string }).id);
        const { data: existingItems } = await db
          .from('order_items')
          .select('id, product_id')
          .in('order_id', orderIds);
        const seededItem = (existingItems ?? [])[0] as
          | { id: string; product_id: string }
          | undefined;
        if (!seededItem) {
          throw new Error('SC-3 setup: no seeded order item found');
        }
        const { data: seededProduct } = await db
          .from('products')
          .select('name')
          .eq('id', seededItem.product_id)
          .single();
        const productName = (seededProduct as { name: string }).name;

        await loginAs(page, 'manager');
        await gotoAuthed(page, '/payments');

        const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
        await expect(row).toBeVisible({ timeout: 20_000 });
        await row.getByRole('button', { name: /reopen ticket|reabrir cuenta/i }).click();

        const reopenDialog = page.getByRole('dialog', { name: /reopen ticket|reabrir cuenta/i });
        await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
        await reopenDialog.locator('#reopen-tab-reason').fill('E2E reopen for remove-item test');
        await reopenDialog.getByRole('button', { name: /request approval|solicitar aprobación/i }).click();

        const reopenPinDialog = page.getByRole('alertdialog');
        await expect(reopenPinDialog).toBeVisible({ timeout: 8_000 });
        await enterManagerPin(page, managerPin);

        await expect(page.getByText(/ticket reopened successfully|cuenta reabierta correctamente/i)).toBeVisible({
          timeout: 15_000,
        });
        await expect(reopenDialog).not.toBeVisible({ timeout: 5_000 });

        await row.getByRole('button', { name: /edit items|editar artículos/i }).click();

        const panel = page.getByRole('dialog', { name: /edit items on reopened ticket|editar artículos del ticket reabierto/i });
        await expect(panel).toBeVisible({ timeout: 10_000 });
        await expect(panel.getByText(productName)).toBeVisible({ timeout: 10_000 });

        await panel.getByRole('button', { name: /^(remove|quitar)$/i }).click();

        const removePinDialog = page.getByRole('alertdialog');
        await expect(removePinDialog).toBeVisible({ timeout: 8_000 });
        await enterManagerPin(page, managerPin);

        const removeConfirmDialog = page.getByRole('alertdialog', { name: /remove item\?|¿eliminar artículo\?/i });
        await expect(removeConfirmDialog).toBeVisible({ timeout: 10_000 });
        await removeConfirmDialog
          .locator('#remove-tab-item-reason')
          .fill('E2E remove reason');
        await removeConfirmDialog.getByRole('button', { name: /^(remove item|eliminar artículo)$/i }).click();

        await expect(
          page.getByText(
            new RegExp(
              `${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (removed from order\\.|eliminado del pedido\\.)`
            )
          )
        ).toBeVisible({
          timeout: 15_000,
        });
        await expect(panel.getByText(productName)).not.toBeVisible({ timeout: 10_000 });

        const { data: removedItem } = await db
          .from('order_items')
          .select('id')
          .eq('id', seededItem.id)
          .maybeSingle();
        expect(removedItem).toBeNull();
      },
    );
  });
});
