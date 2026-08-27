/**
 * E2E spec: Tabs Version (Optimistic Concurrency) — retargeted (Plan 17-13)
 *
 * Original target (Phase 15-09): the old tab-drawer/tab-card "Close Tab" flow
 * via /pos. Both /pos (Plan 01-11) and those tab-drawer/tab-card components
 * themselves (orphaned dead code once /pos was gone, deleted in Plan 01-13)
 * no longer exist, so this test was left permanently `test.skip`'d against
 * components that no longer exist. The underlying mechanism (bumpTabVersion()'s
 * intercept-the-request-then-bump-the-DB race simulation, proving a
 * STALE_VERSION conflict surfaces as a toast instead of silent
 * last-write-wins) is still a real, valuable data-integrity guarantee —
 * every version-guarded `tabs` mutation should hold it, not just the deleted
 * close-tab path.
 *
 * New target: EditPaidTabDialog's save action (`useEditPaidTab` ->
 * `edit_paid_tab` RPC, `src/features/edit-paid-tab/`). Confirmed
 * version-guarded: the RPC takes `p_expected_version` and raises
 * STALE_VERSION (SQLSTATE P0V01) when it no longer matches `tabs.version`
 * (supabase/migrations/20260719000001_edit_paid_tab_rpc.sql), and the
 * dialog's `handleSubmit` passes `tab.version` as `expectedVersion` and
 * routes STALE_VERSION through the shared `handleVersionError` helper
 * (src/shared/lib/version-error.ts), which toasts "Updated by another
 * terminal — please retry" and closes the dialog rather than silently
 * reapplying the edit.
 *
 * Race simulation: `useEditPaidTab` calls `supabase.rpc('edit_paid_tab', ...)`
 * (a POST to .../rest/v1/rpc/edit_paid_tab), which already carries the
 * version read by the dialog when it opened. Intercepting that POST via
 * `page.route()`, bumping `tabs.version` out-of-band via the service-role
 * client (`bumpTabVersion`), and then releasing the request unmodified
 * reproduces a second terminal winning the race — the RPC's own
 * `p_expected_version <> v_current` check then rejects it server-side.
 *
 * Requires bar-pos/.env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 */

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { bumpTabVersion, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
  orderItemId: string;
}

/**
 * Seeds a single-item paid tab directly via the service-role client.
 * Mirrors e2e/tabs/edit-paid-tab.spec.ts's seedPaidTab.
 */
async function seedPaidTab(
  db: ReturnType<typeof getServiceClient>,
  unitPrice: number,
): Promise<SeededPaidTab> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  let shiftId: string;
  const { data: existingShift } = await db
    .from('shifts')
    .select('id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (existingShift) {
    shiftId = existingShift.id as string;
  } else {
    const { data: newShift } = await db
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    shiftId = newShift.id as string;
  }

  const { data: tab } = await db
    .from('tabs')
    .insert({
      customer_name: 'E2E Concurrent Edit Test',
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  const { data: order } = await db
    .from('orders')
    .insert({
      tab_id: tab.id,
      staff_id: profile.id,
      status: 'pending',
    })
    .select('id')
    .single();

  const { data: product } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  const { data: items } = await db
    .from('order_items')
    .insert({
      order_id: order.id,
      product_id: product.id,
      quantity: 1,
      unit_price: unitPrice,
      modifier_price_delta: 0,
    })
    .select('id');
  const orderItemId = (items as { id: string }[])[0].id;

  // tabs has bump_version_on_update (STALE_VERSION guard) — a freshly
  // inserted tab starts at version 1, so this update must set version: 2.
  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPaidTab: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: unitPrice,
      tip_amount: 0,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-concurrent-edit-${(tab.id as string).slice(0, 8)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) {
    throw new Error(`seedPaidTab: payments insert failed: ${payErr?.message}`);
  }

  return {
    tabId: tab.id as string,
    paymentId: payment.id as string,
    orderItemId,
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

test.describe('Concurrent Edits (Optimistic Concurrency)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(540);
    await page.goto('/');
  });

  test.afterEach(async ({ page }) => {
    await logout(page).catch(() => undefined);
  });

  test('editing a paid tab against a stale version shows the conflict toast, not a silent overwrite', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const db = getServiceClient();
    const seeded = await seedPaidTab(db, 15);
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

    await loginAs(page, 'manager');
    await gotoAuthed(page, '/payments');

    const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /edit ticket|editar ticket/i }).click();

    const dialog = page.getByRole('dialog', { name: /edit paid ticket|editar ticket pagado/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Reads `tab.version` into the dialog's in-memory state here. The
    // subsequent save request will carry this now-stale version as
    // p_expected_version once the intercept below bumps the DB out from
    // under it.
    const priceInput = dialog.locator(`#edit-price-${seeded.orderItemId}`);
    await expect(priceInput).toBeVisible({ timeout: 10_000 });
    await priceInput.fill('20');
    await dialog.locator('#edit-paid-tab-reason').fill('E2E concurrent edit race');

    // Let the dialog's own version read happen normally (already loaded via
    // useTab above), then hold the edit_paid_tab RPC POST and bump the DB
    // out from under it via the service-role client before releasing the
    // request unmodified — its p_expected_version then no longer matches
    // the DB's real, bumped version.
    await page.route('**/rest/v1/rpc/edit_paid_tab*', async route => {
      await bumpTabVersion(seeded.tabId);
      await route.continue();
    });

    await dialog.getByRole('button', { name: /save correction|guardar corrección/i }).click();

    const pinDialog = page.getByRole('alertdialog');
    await expect(pinDialog).toBeVisible({ timeout: 8_000 });
    await enterManagerPin(page, managerPin);

    await expect(page.getByText('Updated by another terminal — please retry')).toBeVisible({
      timeout: 15_000,
    });
    // handleVersionError's STALE_VERSION branch closes the dialog instead of
    // silently reapplying the edit — the sheet must not stay open showing a
    // "success" state.
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // The item's price must be unchanged — the stale-version conflict must
    // block the write, not silently apply it (last-write-wins).
    const { data: item } = await db
      .from('order_items')
      .select('unit_price')
      .eq('id', seeded.orderItemId)
      .single();
    expect(Number((item as { unit_price: number }).unit_price)).toBeCloseTo(15, 1);
  });
});
