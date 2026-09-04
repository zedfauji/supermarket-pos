/**
 * e2e/infra/offline.spec.ts
 *
 * Offline resilience coverage. The deleted e2e/11-offline.spec.ts targeted
 * the pre-Phase-2 tab-opening "/pos New Tab" flow that no longer exists — its
 * queue-and-sync tests (T1/T2/T5) were permanently skipped as a result.
 *
 * Direct-sale checkout (the CURRENT /pos flow) does NOT use
 * tabsStore.offlineQueue when offline — PaymentForm shows a blocking
 * "offline" alertdialog with Try Again/Cancel instead, already covered by
 * e2e/checkout/happy-path.spec.ts's 3 dedicated offline tests. The only live
 * caller of tabsStore.offlineQueue's 'place-order' action today is
 * useAddItemToTab (EditReopenedItemsPanel — adding a line item to a
 * reopened/paid sale); useMutationOpenTab's 'open-tab' action type has zero
 * feature callers left in the app and is dead code (domain.ts's
 * OfflineActionTypeSchema also still lists the fully-removed
 * start-pool-timer/stop-pool-timer types, discarded as unknown by
 * OfflineQueueProcessor). This file's queue-and-sync tests therefore drive
 * the reopened-sale edit flow instead of the deleted New-Tab UI — the only
 * UI surface that genuinely still exercises the queue mechanism this file
 * is meant to verify.
 *
 * T4 (offline pool-table timer start) is deleted outright, not rewritten —
 * the pool feature was removed end-to-end in Phase 1; its subject no longer
 * exists, independent of its own already-documented Playwright limitation.
 */
import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getOrderCount, getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
import { getBillingTaxConfig, computeAuthoritativeTotal } from '../helpers/tax';

let cajaSessionId = '';

interface SeededPaidTab {
  tabId: string;
  paymentId: string;
}

/** Seeds a paid tab via the real process_direct_sale_atomic RPC (service-role). */
async function seedPaidTabViaDirectSale(): Promise<SeededPaidTab> {
  const admin = getServiceClient();

  let shiftId: string;
  let shiftStaffId: string;
  const { data: existingShift, error: shiftLookupError } = await admin
    .from('shifts')
    .select('id, staff_id')
    .is('clock_out', null)
    .limit(1)
    .maybeSingle();
  if (shiftLookupError) throw new Error(`seed: shift lookup failed - ${shiftLookupError.message}`);
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
      throw new Error(`seed: admin profile not found - ${profileError?.message ?? 'none'}`);
    }
    const { data: newShift, error: shiftCreateError } = await admin
      .from('shifts')
      .insert({ staff_id: profile.id, opening_cash: 0 })
      .select('id')
      .single();
    if (shiftCreateError || !newShift) {
      throw new Error(`seed: shift create failed - ${shiftCreateError?.message ?? 'none'}`);
    }
    shiftId = newShift.id as string;
    shiftStaffId = profile.id as string;
  }

  // Excludes products with a near-expiry inventory row (and zero-priced
  // placeholder rows) — process_direct_sale_atomic's PROMO-02 expiry-proximity
  // auto-discount (Phase 27, unrelated to this fixture) silently reduces the
  // derived total for any product within settings.near_expiry's threshold
  // (default 14 days), which this helper's flat unitPrice*tax expectation
  // never accounts for, tripping a false AMOUNT_MISMATCH (28-05 fix, mirrors
  // e2e/tabs/reopen-closed-ticket.spec.ts's identical seed helper fix).
  const nearExpiryCutoff = new Date();
  nearExpiryCutoff.setDate(nearExpiryCutoff.getDate() + 14);
  const nearExpiryCutoffStr = nearExpiryCutoff.toISOString().slice(0, 10);

  const { data: candidateProducts, error: productError } = await admin
    .from('products')
    .select('id, base_price, inventory(expiry_date)')
    .eq('is_active', true)
    .gt('base_price', 0)
    .limit(50);
  if (productError || !candidateProducts || candidateProducts.length === 0) {
    throw new Error(`seed: active product not found - ${productError?.message ?? 'none'}`);
  }
  const product = candidateProducts.find(p => {
    const inv = p.inventory as { expiry_date: string | null } | { expiry_date: string | null }[] | null;
    const invRow = Array.isArray(inv) ? inv[0] : inv;
    const expiryDate = invRow?.expiry_date;
    return !expiryDate || expiryDate > nearExpiryCutoffStr;
  });
  if (!product) {
    throw new Error('seed: no active, positively-priced product without a near-expiry inventory row found');
  }

  const { taxRatePercent, taxInclusive } = await getBillingTaxConfig(admin);
  const unitPrice = Number(product.base_price);
  const amount = computeAuthoritativeTotal(unitPrice, taxRatePercent, taxInclusive);

  const { data, error } = await admin.rpc('process_direct_sale_atomic', {
    p_staff_id: shiftStaffId,
    p_shift_id: shiftId,
    p_caja_session_id: cajaSessionId,
    p_items: [{ product_id: product.id, quantity: 1, unit_price: unitPrice }],
    p_idempotency_key: `e2e-offline-${randomUUID()}`,
    p_method: 'cash',
    p_amount: amount,
    p_tendered_amount: amount,
  });
  if (error) throw new Error(`seed: process_direct_sale_atomic failed - ${error.message}`);
  const rpcResult = data as { ok: boolean; code?: string; message?: string; tabId?: string } | null;
  if (!rpcResult?.ok || !rpcResult.tabId) {
    throw new Error(
      `seed: RPC not-ok - ${rpcResult?.code ?? 'no code'}: ${rpcResult?.message ?? 'no message'}`
    );
  }
  const tabId = rpcResult.tabId;

  const { data: payment, error: payErr } = await admin
    .from('payments')
    .select('id')
    .eq('tab_id', tabId)
    .limit(1)
    .single();
  if (payErr || !payment) throw new Error(`seed: payment lookup failed - ${payErr?.message ?? 'no row'}`);

  return { tabId, paymentId: payment.id as string };
}

/** Enters a PIN on the button-based PINKeypad (aria-label "Key N"). */
async function enterManagerPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? 'Key 0' : `Key ${ch}`;
    const btn = page.getByRole('button', { name: label });
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await page.keyboard.type(ch);
    }
  }
}

/** Reopens a paid tab from /payments and opens its EditReopenedItemsPanel. */
async function reopenAndOpenEditPanel(
  page: Page,
  seeded: SeededPaidTab,
  managerPin: string
): Promise<{ row: Locator; panel: Locator }> {
  await gotoAuthed(page, '/payments');
  const row = page.getByTestId(`payment-row-${seeded.paymentId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button', { name: 'Reopen ticket' }).click();

  const reopenDialog = page.getByRole('dialog', { name: 'Reopen ticket' });
  await expect(reopenDialog).toBeVisible({ timeout: 10_000 });
  await reopenDialog.locator('#reopen-tab-reason').fill('E2E offline queue test');
  await reopenDialog.getByRole('button', { name: 'Request approval' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 8_000 });
  await enterManagerPin(page, managerPin);
  await expect(page.getByText(/ticket reopened successfully/i)).toBeVisible({ timeout: 15_000 });
  await expect(reopenDialog).not.toBeVisible({ timeout: 5_000 });

  const panel = await openEditPanel(page, row);
  // useTab(tabId)'s first fetch for this panel must resolve before any
  // offline mutation snapshots `tab.version` for its expectedVersion guard —
  // otherwise a queued action can capture a version one behind the
  // just-reopened tab and get discarded as STALE_VERSION on replay.
  await expect(panel.getByText('Loading items...')).toHaveCount(0, { timeout: 15_000 });
  return { row, panel };
}

async function openEditPanel(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole('button', { name: 'Edit items' }).click();
  const panel = page.getByRole('dialog', { name: 'Edit items on reopened ticket' });
  await expect(panel).toBeVisible({ timeout: 10_000 });
  return panel;
}

/**
 * Adds one pending row (first product in the picker) and submits it —
 * useMutationAddOrder's isOnline() guard makes this a single queued
 * offline action per call when offline.
 */
async function addOneItemAndSave(page: Page, panel: Locator, managerPin: string): Promise<void> {
  await panel.getByRole('button', { name: 'Add item' }).click();
  await panel.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 8_000 });
  await enterManagerPin(page, managerPin);
}

test.describe('Offline Resilience', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    cajaSessionId = await openCaja(570);
    await page.goto('/');
  });

  // OfflineBanner (src/shared/ui/OfflineBanner.tsx) is mounted app-wide in
  // App.tsx — any authenticated route exercises it.
  test('Offline banner appears', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.goto('/home');
    // Wait for the HomePage route chunk's own content, not just goto()'s
    // 'load' event — going offline while a lazy-loaded route chunk is still
    // mid-fetch (common on a freshly-started dev server) produces a Vite
    // "Failed to fetch dynamically imported module" error overlay instead
    // of the app UI.
    // The shared "cashier" E2E account's locale isn't guaranteed en-US at
    // test-run time (only 4 admin-role accounts are pin-excluded from
    // resetTestState()'s es-MX reset) — match both locales, as elsewhere.
    await expect(page.getByText(/^(Welcome|Bienvenido), /)).toBeVisible({ timeout: 15_000 });
    await page.context().setOffline(true);
    // en-US: "Offline — running on cached data"; es-MX: "Sin conexión — usando datos locales".
    await expect(page.getByText(/offline.*cached data|sin conexión/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.context().setOffline(false);
    await logout(page);
  });

  test('Order queued while offline while editing a reopened sale — no error/failed toast', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const seeded = await seedPaidTabViaDirectSale();
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';

    await loginAs(page, 'manager');
    const { panel } = await reopenAndOpenEditPanel(page, seeded, managerPin);

    await page.context().setOffline(true);
    await addOneItemAndSave(page, panel, managerPin);

    // useMutationAddOrder's isOnline() guard resolves NETWORK_OFFLINE
    // ("No internet connection. Working offline.") and its onSuccess handler
    // enqueues the action to tabsStore.offlineQueue in the same tick — no
    // toast containing "error"/"failed" text should appear.
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /error|failed/i })
    ).toHaveCount(0);

    await page.context().setOffline(false);
    await logout(page).catch(() => undefined);
  });

  test('Order syncs on reconnect', async ({ page }) => {
    test.setTimeout(90_000);
    const seeded = await seedPaidTabViaDirectSale();
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    const ordersBefore = await getOrderCount(seeded.tabId);

    await loginAs(page, 'manager');
    const { panel } = await reopenAndOpenEditPanel(page, seeded, managerPin);

    await page.context().setOffline(true);
    await addOneItemAndSave(page, panel, managerPin);

    await page.context().setOffline(false);
    await expect(page.getByText(/all actions synced|offline/i).first()).toBeVisible({
      timeout: 45_000,
    });

    await expect
      .poll(() => getOrderCount(seeded.tabId), { timeout: 60_000 })
      .toBeGreaterThan(ordersBefore);

    await logout(page).catch(() => undefined);
  });

  // T5's "three offline actions" no longer maps 1:1 onto the current UI —
  // EditReopenedItemsPanel batches every pending row into ONE
  // create_order_with_items call per Save (D-04: one ManagerPinDialog per
  // save, not one per row). Two independent save cycles (closing/reopening
  // the panel between them, which resets its local pending-rows state)
  // queue two separate 'place-order' actions instead — the closest current
  // equivalent to "multiple queued offline actions sync in order".
  // Two independently-queued offline actions against the SAME tab both
  // capture their expectedVersion from the same pre-replay cached version
  // (neither can see the other's not-yet-applied change while offline).
  // OfflineQueueProcessor replays sequentially: the first to apply succeeds
  // and bumps the tab's version; the second is then genuinely stale and is
  // safely discarded (not silently duplicated, not corrupting state) —
  // exactly the "lands exactly once, never duplicated" property T-17-22
  // calls out. This is documented, intentional behavior (see
  // OfflineQueueProcessor's `discarded`/`formatDiscardedSummary` handling),
  // not a bug — so this test asserts ONE order synced and the discard
  // summary toast fired for the other, not that both landed.
  test('T5: two offline actions on the same tab — one syncs, one is safely discarded', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seeded = await seedPaidTabViaDirectSale();
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    const ordersBefore = await getOrderCount(seeded.tabId);

    await loginAs(page, 'manager');
    const { row, panel } = await reopenAndOpenEditPanel(page, seeded, managerPin);

    await page.context().setOffline(true);

    // Action 1.
    await addOneItemAndSave(page, panel, managerPin);
    // Close (clears the panel's local pending-rows state) and reopen so the
    // second save queues an independent action rather than re-submitting
    // the first row alongside a new one.
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel).not.toBeVisible({ timeout: 5_000 });
    const panel2 = await openEditPanel(page, row);
    // Action 2.
    await addOneItemAndSave(page, panel2, managerPin);

    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /error|failed/i })
    ).toHaveCount(0);

    await page.context().setOffline(false);

    // formatDiscardedSummary's toast ("Discarded 1 queued action(s) — data
    // changed: place-order") is the signal that the conflict was handled,
    // not silently dropped or duplicated.
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /discarded/i })
    ).toBeVisible({ timeout: 45_000 });

    await expect
      .poll(() => getOrderCount(seeded.tabId), { timeout: 60_000 })
      .toBe(ordersBefore + 1);

    await logout(page).catch(() => undefined);
  });
});
