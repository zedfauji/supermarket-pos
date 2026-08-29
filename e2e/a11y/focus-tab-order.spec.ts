/**
 * e2e/a11y/focus-tab-order.spec.ts
 *
 * FOCUS-03 (Phase 32, D-11/D-12/D-13): automated Tab-order regression coverage
 * for the three named surfaces. Read-only — does not modify ManagerPinDialog,
 * PINKeypad, DataTable, or SearchInput.
 *
 * UI text & role references are derived from reading:
 *   - e2e/helpers/auth.ts (loginAs/logout conventions)
 *   - src/shared/ui/DataTable.tsx + src/shared/ui/SearchInput.tsx (search/filter row)
 *   - src/widgets/InventoryPagePanel.tsx (category filter toolbar, batch-adjustment dialog form)
 *   - src/entities/inventory/ui/InventoryRow.tsx (SortHeader column-header buttons)
 *   - e2e/payments/refund.spec.ts (RefundSheet PIN-gate flow, seedPaidTab/enterManagerPin pattern)
 *   - .planning/phases/32-touch-target-focus-visible-sweep/32-CONTEXT.md (D-11, D-12, D-13)
 *
 * NOTE (documented gap, D-12(b)): InventoryPagePanel's <DataTable> call does not pass
 * `searchable`, so there is no SearchInput rendered on /inventory — only the category
 * `<select>` filter. Surface (b) below therefore asserts Tab order from that filter
 * select into the first two sortable column headers (Product, Category), which is the
 * real "search/filter row" reachable under this page today.
 *
 * Surface (a) — ManagerPinDialog PIN entry driven from TableStatusPanel's "Edit Start
 * Time" action — is permanently gone, not a candidate to restore. Plan 01-06 (Phase 01
 * strip-rebrand, D-09) deleted the entire pool-parlour table-tracking domain end to
 * end: the table-status route/pages, `TableStatusPanel`, and its underlying DB tables
 * (dropped via `supabase/migrations/20260810000003_drop_pool_resources.sql`). Bar/
 * pool-parlour features are explicitly out of scope forever for this grocery-store
 * pivot (PROJECT.md's Out of Scope decision). `e2e/16-table-status.spec.ts` — the
 * other spec that covered this same page — was already deleted outright for the
 * same reason (commit bc8481e).
 *
 * Plan 17-14 (this file's own prior version, `e2e/44-focus-tab-order.spec.ts`) left the
 * general ManagerPinDialog Tab-order coverage (1-9, 0, Backspace, Cancel) as a
 * documented, permanently-skipped placeholder, noting it's still exercised by several
 * live PIN-gated flows (RefundSheet, ReopenTabDialog, EditPaidTabDialog, etc.) and
 * leaving the re-point to whichever future plan wants that coverage. This plan is that
 * future plan: Surface (a) below drives the PIN keypad from RefundSheet's "Request
 * approval" gate (`e2e/payments/refund.spec.ts`'s pattern) — the simplest live surface
 * to seed (a single service-role paid-tab insert, no RPC round-trip required).
 */

import { expect, test } from '../fixtures';
import { loginAs, logout, gotoAuthed } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

/**
 * Seed a fully paid tab with one order_item — mirrors
 * e2e/payments/refund.spec.ts's seedPaidTab, trimmed to what Surface (a)
 * needs (just enough for RefundSheet to render one refundable item).
 */
async function seedPaidTabForRefund(
  db: ReturnType<typeof getServiceClient>,
  unitPrice: number
): Promise<{ paymentId: string }> {
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
      customer_name: 'E2E Focus Tab Order Refund',
      staff_id: profile.id,
      shift_id: shiftId,
      status: 'open',
      is_deleted: false,
    })
    .select('id')
    .single();

  const { data: order } = await db
    .from('orders')
    .insert({ tab_id: tab.id, staff_id: profile.id, status: 'pending' })
    .select('id')
    .single();

  const { data: product } = await db
    .from('products')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();

  await db.from('order_items').insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: unitPrice,
    modifier_price_delta: 0,
  });

  // tabs has a bump_version_on_update trigger (STALE_VERSION guard) — a
  // freshly inserted tab starts at version 1, so this update must set
  // version: 2.
  const { error: tabUpdateErr } = await db
    .from('tabs')
    .update({ status: 'paid', closed_at: new Date().toISOString(), version: 2 })
    .eq('id', tab.id);
  if (tabUpdateErr) {
    throw new Error(`seedPaidTabForRefund: tabs update to paid failed: ${tabUpdateErr.message}`);
  }

  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({
      tab_id: tab.id,
      amount: unitPrice,
      method: 'cash',
      is_refund: false,
      processed_by: profile.id,
      idempotency_key: `e2e-focus-tab-order-refund-${(tab.id as string).slice(0, 8)}`,
    })
    .select('id')
    .single();
  if (payErr || !payment) {
    throw new Error(`seedPaidTabForRefund: payments insert failed: ${payErr?.message ?? 'no row'}`);
  }

  return { paymentId: payment.id as string };
}

// Locale-agnostic (house style, 17-PATTERNS.md "Locale-agnostic UI matching") —
// the fixed E2E accounts' locale can be es-MX or en-US depending on which
// staff-locale test last ran against the shared fixture accounts, so every
// text match this new Surface (a) test introduces must accept both
// translations. Only "Key 1".."Key 9" are safe as plain string matches —
// PINKeypad.tsx hardcodes those nine aria-labels (`Key ${key}`), never
// running them through i18n; "Key 0", Backspace, and Cancel do go through
// t(), so those need the bilingual pattern too.
const REFUND_BTN_RE = /^(Refund|Reembolso)$/;
const PROCESS_REFUND_DIALOG_RE = /^(Process refund|Procesar reembolso)$/;
const SELECT_FOR_REFUND_RE = /^(select .* for refund|seleccionar .* para reembolso)$/i;
const REASON_OPTION_RE = /(wrong.*order|pedido.*equivocado)/i;
const REQUEST_APPROVAL_RE = /(request approval|solicitar aprobación)/i;
const KEY_0_RE = /^(Key 0|Tecla 0)$/;
const BACKSPACE_RE = /^(Backspace|Borrar)$/i;
const CANCEL_RE = /^(Cancel|Cancelar)$/;

test.describe('Focus Tab Order (FOCUS-03)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(300);
    await page.goto('/');
  });

  // ── Surface (a): ManagerPinDialog PIN entry via RefundSheet's "Request approval" ──
  test('A: ManagerPinDialog Tab order follows the visual keypad layout (1-9, 0, Backspace, Cancel)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const db = getServiceClient();
    await seedPaidTabForRefund(db, 10.0);

    await loginAs(page, 'admin');
    await gotoAuthed(page, '/payments');

    const refundBtn = page.getByRole('button', { name: REFUND_BTN_RE }).first();
    await expect(refundBtn).toBeVisible({ timeout: 20_000 });
    await refundBtn.click();

    const refundDialog = page.getByRole('dialog', { name: PROCESS_REFUND_DIALOG_RE });
    await expect(refundDialog).toBeVisible({ timeout: 10_000 });

    const checkbox = refundDialog.getByRole('checkbox', { name: SELECT_FOR_REFUND_RE }).first();
    await expect(checkbox).toBeVisible({ timeout: 10_000 });
    await checkbox.check();

    const reasonTrigger = refundDialog.locator('#refund-reason');
    await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
    await reasonTrigger.click();
    await page.getByRole('option', { name: REASON_OPTION_RE }).click();

    await page.getByRole('button', { name: REQUEST_APPROVAL_RE }).click();

    const pinDialog = page.getByRole('alertdialog');
    await expect(pinDialog).toBeVisible({ timeout: 8_000 });

    // PINKeypad.tsx disables Backspace while the PIN is empty
    // (`disabled={isLoading || value.length === 0}`) — a disabled button is
    // never a Tab stop, so Backspace would be silently skipped in the walk
    // below unless at least one digit has been entered first. Press one key
    // (arbitrarily "1") to enable it before starting the actual order walk;
    // the extra digit doesn't submit anything (maxLength is 6) and the
    // subsequent re-focus of "Key 1" below is unaffected by its own value.
    await pinDialog.getByRole('button', { name: 'Key 1' }).click();

    // Tab order follows the visual 3x4 keypad grid (PINKeypad.tsx): row 1-3
    // are keys 1-9, row 4 is [empty, 0, Backspace] — 0 precedes Backspace in
    // both the DOM and the visual grid.
    const keyOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const firstKey = pinDialog.getByRole('button', { name: 'Key 1' });
    await firstKey.focus();
    await expect(firstKey).toBeFocused();

    for (const digit of keyOrder.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(pinDialog.getByRole('button', { name: `Key ${digit}` })).toBeFocused();
    }

    await page.keyboard.press('Tab');
    await expect(pinDialog.getByRole('button', { name: KEY_0_RE })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(pinDialog.getByRole('button', { name: BACKSPACE_RE })).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(pinDialog.getByRole('button', { name: CANCEL_RE })).toBeFocused();

    await pinDialog.getByRole('button', { name: CANCEL_RE }).click();
    await logout(page);
  });

  // ── Surface (b): inventory DataTable filter row + sortable column headers ─
  test('B: inventory category filter Tabs into the sortable column headers in visual order', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const categorySelect = page.locator('#inv-category-filter');
    await expect(categorySelect).toBeVisible({ timeout: 20_000 });
    await categorySelect.focus();
    await expect(categorySelect).toBeFocused();

    // First column (Product) is the next tab stop after the filter.
    await page.keyboard.press('Tab');
    const productHeader = page.getByRole('button', { name: /^(Product|Producto)$/, exact: true });
    await expect(productHeader).toBeFocused();

    // Second column (Category) follows — matches left-to-right visual column order.
    await page.keyboard.press('Tab');
    const categoryHeader = page.getByRole('button', {
      name: /^(Category|Categoría)$/,
      exact: true,
    });
    await expect(categoryHeader).toBeFocused();

    await logout(page);
  });

  // ── Surface (c): inventory Batch Adjustment form (product select -> qty -> Cancel -> Apply) ─
  test('C: Batch Adjustment dialog Tab order follows visual field/button layout', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const adjustBtn = page.getByRole('button', { name: /^(Adjust|Ajustar)$/, exact: true });
    await expect(adjustBtn).toBeVisible({ timeout: 20_000 });
    await adjustBtn.click();

    const dialog = page.getByRole('dialog', { name: /batch adjustment|ajuste por lote/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    const productSelect = page.locator('#batch-product');
    await productSelect.focus();
    await expect(productSelect).toBeFocused();

    await page.keyboard.press('Tab');
    const deltaInput = page.getByLabel(/quantity delta|delta de cantidad/i);
    await expect(deltaInput).toBeFocused();

    // The Reason <select> (InventoryPagePanel.tsx) sits between the delta
    // input and the dialog footer buttons — a real Tab stop the pre-existing
    // version of this test omitted, causing this exact assertion to fail
    // against the current UI (Rule 1 fix).
    await page.keyboard.press('Tab');
    const reasonSelect = page.getByLabel(/^(Reason|Motivo)$/);
    await expect(reasonSelect).toBeFocused();

    await page.keyboard.press('Tab');
    const cancelBtn = dialog.getByRole('button', { name: CANCEL_RE, exact: true });
    await expect(cancelBtn).toBeFocused();

    await page.keyboard.press('Tab');
    const applyBtn = dialog.getByRole('button', { name: /^(Apply|Aplicar)$/, exact: true });
    await expect(applyBtn).toBeFocused();

    await page.keyboard.press('Escape');
    await logout(page);
  });
});
