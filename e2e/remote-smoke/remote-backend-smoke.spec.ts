/**
 * E2E: Remote backend smoke pass (ROADMAP Phase 20 Success Criterion 5).
 *
 * Runs ONLY via `npm run test:e2e:remote-smoke` (playwright.remote.config.ts)
 * against the real remote Supabase project (mkvinyekkyennyegfoxq) — never as
 * part of the default `npm run test:e2e` local-backend suite (excluded via
 * playwright.config.ts's testIgnore).
 *
 * Authenticates as a dedicated, permanent E2E fixture admin account (created
 * by scripts/seed-remote-e2e-admin.ts) — never the real store owner's own
 * admin account ("Vinty Owner"). See
 * .planning/phases/20-store-deployment-installer/20-03-PLAN.md for full
 * rationale, threat model, and cleanup contract.
 *
 * The second test below drives real writes against the shared remote
 * project (receiving, checkout, staff creation) and MUST NOT call
 * resetTestState(), openCaja(), or forceCloseAllOpenTabs() from
 * e2e/helpers/supabase.ts — those force-close/bulk-mutate every row of their
 * target tables project-wide. It implements its own narrowly-scoped,
 * read-before-touch equivalents instead (Step 0 below).
 */
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { gotoAuthed, loginAsNamed, logout } from '../helpers/auth';
import { requireRemoteSmokeEnv } from '../helpers/requireEnv';
import { deleteTestStaff, getServiceClient } from '../helpers/supabase';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Injects the dual-global Tauri IPC mock (mirrors
 * e2e/receipts/broker-submission.spec.ts's injectBrokerMock), scoped to just
 * print_receipt and open_cash_drawer resolving successfully — this spec does
 * not need the broader fault-matrix outcomes that file covers.
 */
async function injectPrintMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    (window as unknown as Record<string, unknown>)['__invokeCallCounts'] = {};
    (window as unknown as Record<string, unknown>)['__TAURI_EVENT_PLUGIN_INTERNALS__'] = {
      unregisterListener: () => undefined,
    };
    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string): Promise<unknown> {
        const counts = (window as unknown as Record<string, unknown>)['__invokeCallCounts'] as Record<
          string,
          number
        >;
        counts[cmd] = (counts[cmd] ?? 0) + 1;
        if (cmd === 'print_receipt') {
          return Promise.resolve({ job_id: 'e2e-remote-smoke-job', status: 'accepted' });
        }
        if (cmd === 'open_cash_drawer') {
          return Promise.resolve({ job_id: 'e2e-remote-smoke-drawer', status: 'accepted' });
        }
        return Promise.resolve(null);
      },
      transformCallback(): number {
        return Math.floor(Math.random() * 1_000_000);
      },
      unregisterCallback(): void {
        /* no-op */
      },
    };
  });
}

async function invokeCallCount(page: Page, cmd: string): Promise<number> {
  return page.evaluate(
    c =>
      ((window as unknown as Record<string, unknown>)['__invokeCallCounts'] as
        | Record<string, number>
        | undefined)?.[c] ?? 0,
    cmd
  );
}

/** PIN entry for the ManagerPinDialog's PINKeypad (button-based, aria-label "Key N"). */
async function enterManagerPin(page: Page, pin: string): Promise<void> {
  for (const ch of pin) {
    const label = ch === '0' ? /^(key 0|tecla 0)$/i : `Key ${ch}`;
    await page.getByRole('button', { name: label }).click();
  }
}

test.describe('Remote backend smoke pass', () => {
  test('logs in as the dedicated fixture admin against the real remote project', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    requireRemoteSmokeEnv();

    const name = process.env.E2E_REMOTE_ADMIN_NAME as string;
    const pin = process.env.E2E_REMOTE_ADMIN_PIN as string;

    await loginAsNamed(page, name, pin);
    await expect(page).toHaveURL(/\/(home|pos)/);

    await logout(page);
  });

  test('receiving -> checkout+print -> staff creation, then full self-verifying teardown', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    requireRemoteSmokeEnv();

    const adminName = process.env.E2E_REMOTE_ADMIN_NAME as string;
    const adminPin = process.env.E2E_REMOTE_ADMIN_PIN as string;

    const db = getServiceClient();
    const uuid = randomUUID();
    const supplierName = `E2E-REMOTE-SMOKE supplier ${uuid}`;
    const productName = `E2E-REMOTE-SMOKE product ${uuid}`;
    const barcode = `992${String(Date.now()).slice(-10)}`;
    const staffName = `E2E-REMOTE-SMOKE staff ${uuid}`;
    const staffPin = '246810';

    let supplierId: string | undefined;
    let productId: string | undefined;
    let paymentId: string | undefined;
    let openedCajaSessionId: string | undefined;

    try {
      // Step 0: caja safety guard — never resetTestState()/openCaja()/
      // forceCloseAllOpenTabs(); read-before-touch against real store state.
      const { data: adminProfile, error: adminProfileErr } = await db
        .from('profiles')
        .select('id')
        .eq('name', adminName)
        .maybeSingle();
      if (adminProfileErr || !adminProfile) {
        throw new Error(
          `Fixture admin profile "${adminName}" not found — run scripts/seed-remote-e2e-admin.ts first`
        );
      }
      const fixtureAdminId = adminProfile.id as string;

      const { data: openSession, error: openSessionErr } = await db
        .from('caja_sessions')
        .select('id, opened_by, version')
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();
      if (openSessionErr) throw new Error(`Step 0: caja lookup failed - ${openSessionErr.message}`);

      if (openSession) {
        if (openSession.opened_by !== fixtureAdminId) {
          throw new Error(
            `Step 0 safety guard: an open caja session (id=${openSession.id as string}) exists that was NOT opened by the fixture admin (opened_by=${openSession.opened_by as string}). Refusing to touch real/unknown store state.`
          );
        }
        // Leftover from a previous failed run — close it. This run still
        // needs an open session of its own to check out against below, so
        // fall through to opening a fresh one (not a second concurrent
        // session — the leftover is now closed).
        const { error: closeLeftoverErr } = await db
          .from('caja_sessions')
          .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
            version: (openSession.version as number) + 1,
          })
          .eq('id', openSession.id as string)
          .eq('version', openSession.version as number);
        if (closeLeftoverErr) {
          throw new Error(`Step 0: failed to close leftover fixture-admin caja session - ${closeLeftoverErr.message}`);
        }
      }

      // Ensure exactly one open session, owned by the fixture admin, for
      // this run to check out against (whether or not a leftover was just
      // closed above).
      const { data: newSession, error: newSessionErr } = await db
        .from('caja_sessions')
        .insert({ opened_by: fixtureAdminId, opening_cash: 500, status: 'open' })
        .select('id')
        .single();
      if (newSessionErr || !newSession) {
        throw new Error(`Step 0: failed to open caja session - ${newSessionErr?.message}`);
      }
      openedCajaSessionId = newSession.id as string;

      // process_direct_sale_atomic separately requires an open `shifts` row
      // for the acting staff (SHIFT_NOT_OPEN otherwise) — normally created by
      // the app's own "opening cash / start shift" dialog on login, which
      // loginAsNamed only triggers when NO caja session is open yet. Since
      // this Step already guarantees an open caja session via direct
      // service-role writes (bypassing that dialog), it must also ensure the
      // matching shift row directly, mirroring e2e/helpers/supabase.ts's
      // seedOpenTab() find-or-create pattern.
      const { data: existingShift } = await db
        .from('shifts')
        .select('id')
        .eq('staff_id', fixtureAdminId)
        .is('clock_out', null)
        .limit(1)
        .maybeSingle();
      if (!existingShift) {
        const { error: shiftErr } = await db
          .from('shifts')
          .insert({ staff_id: fixtureAdminId, opening_cash: 500 });
        if (shiftErr) throw new Error(`Step 0: failed to open shift - ${shiftErr.message}`);
      }

      // Step 1: login (proven leg from the tracer test above).
      await loginAsNamed(page, adminName, adminPin);

      // Step 2: shipment receiving.
      const { data: supplier, error: supplierErr } = await db
        .from('suppliers')
        .insert({ name: supplierName })
        .select('id')
        .single();
      if (supplierErr || !supplier) throw new Error(`Step 2: supplier create failed - ${supplierErr?.message}`);
      supplierId = supplier.id as string;

      await gotoAuthed(page, '/suppliers');
      await page.getByRole('button', { name: /receive shipment|recibir/i }).click();
      const receiveDialog = page.getByRole('dialog');
      await receiveDialog.getByLabel(/supplier|proveedor/i).selectOption({ label: supplierName });
      await receiveDialog.getByRole('button', { name: /add line item|agregar partida/i }).click();
      await receiveDialog.getByLabel(/product|producto/i).fill(barcode);
      await receiveDialog.getByRole('button', { name: /add product|agregar producto/i }).click();
      await receiveDialog.getByLabel(/^name|^nombre/i).fill(productName);
      await receiveDialog.getByLabel(/barcode|código de barras/i).fill(barcode);
      await receiveDialog.getByLabel(/sale price|precio de venta/i).fill('1.00');
      await receiveDialog
        .getByRole('button', { name: /add product|agregar producto/i })
        .last()
        .click();
      await expect(receiveDialog.getByLabel(/product|producto/i)).toHaveValue(productName);
      await receiveDialog.getByLabel(/quantity|cantidad/i).fill('10');
      await receiveDialog.getByLabel(/cost price|costo/i).fill('0.50');
      await receiveDialog.getByLabel(/expiry date|fecha de caducidad/i).fill('2030-01-02');
      await receiveDialog.getByRole('button', { name: /confirm receipt|confirmar recepción/i }).click();

      const { data: product, error: productErr } = await db
        .from('products')
        .select('id, is_active')
        .eq('barcode', barcode)
        .single();
      if (productErr || !product) throw new Error(`Step 2: product lookup failed - ${productErr?.message}`);
      productId = product.id as string;
      expect(product.is_active).toBe(true);

      await expect
        .poll(async () => {
          const { data, error } = await db
            .from('inventory')
            .select('quantity_on_hand')
            .eq('product_id', productId as string)
            .single();
          if (error || !data) return null;
          return Number(data.quantity_on_hand);
        })
        .toBe(10);

      // Step 3: checkout + print (dual-global Tauri IPC mock; no real broker/printer).
      // Surface the edge function's real error body on failure — this spec runs
      // against a real remote backend where a 409 can mean a genuine deployed
      // schema/code mismatch, not just a test-data issue (see 20-03-SUMMARY.md).
      page.on('response', async res => {
        if (res.url().includes('process-direct-sale') && res.status() >= 400) {
          console.error('process-direct-sale error response:', await res.text().catch(() => '<unreadable>'));
        }
      });
      await injectPrintMock(page);
      await gotoAuthed(page, '/home');
      await page.getByRole('button', { name: /checkout/i }).click();
      await expect(page).toHaveURL(/\/pos$/);
      await page.getByPlaceholder(/search products/i).fill(productName);
      await page.getByRole('button', { name: new RegExp(`select ${escapeRegex(productName)}`, 'i') }).click();

      // Receiving only 10 units (Step 2) trips the low-stock "Add anyway"
      // confirm gate (same as e2e/errors/error-scenarios-and-validation.spec.ts's
      // ER-DSF) — confirm it if it appears rather than receiving a larger
      // quantity purely to dodge a real app safety feature.
      const addAnywayBtn = page.getByRole('button', { name: /^add anyway$/i });
      const addAnywayVisible = await addAnywayBtn
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (addAnywayVisible) {
        await addAnywayBtn.click();
      }

      await page
        .getByRole('button', { name: /^process payment$/i })
        .first()
        .click();
      await page.getByLabel(/amount tendered/i).fill('5.00');
      await page
        .getByRole('button', { name: /^process payment$/i })
        .last()
        .click();
      await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 30_000 });

      await expect
        .poll(async () => invokeCallCount(page, 'print_receipt'), { timeout: 10_000 })
        .toBeGreaterThan(0);

      const { data: orderItem, error: orderItemErr } = await db
        .from('order_items')
        .select('order_id')
        .eq('product_id', productId as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orderItemErr || !orderItem) {
        throw new Error(`Step 3: order_item lookup failed - ${orderItemErr?.message}`);
      }
      const { data: order, error: orderErr } = await db
        .from('orders')
        .select('tab_id')
        .eq('id', orderItem.order_id as string)
        .single();
      if (orderErr || !order) throw new Error(`Step 3: order lookup failed - ${orderErr?.message}`);
      const { data: payment, error: paymentErr } = await db
        .from('payments')
        .select('id')
        .eq('tab_id', order.tab_id as string)
        .eq('is_refund', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (paymentErr || !payment) throw new Error(`Step 3: payment lookup failed - ${paymentErr?.message}`);
      paymentId = payment.id as string;

      // Step 4: staff creation.
      await gotoAuthed(page, '/staff');
      await page.getByRole('button', { name: /add staff|agregar personal/i }).click();
      const staffDialog = page.getByRole('dialog');
      await expect(staffDialog).toBeVisible({ timeout: 10_000 });
      await staffDialog.getByLabel('Name', { exact: true }).fill(staffName);
      await staffDialog.getByLabel('PIN', { exact: true }).fill(staffPin);
      await staffDialog.getByLabel(/confirm pin/i).fill(staffPin);
      await staffDialog.locator('#create-staff-role').click();
      await page.getByRole('option', { name: 'cashier', exact: true }).click();
      await staffDialog.getByRole('button', { name: /create staff|crear personal/i }).click();
      await expect(page.getByText(staffName, { exact: true })).toBeVisible({ timeout: 15_000 });
    } finally {
      // Cleanup — runs unconditionally, self-verifying (asserts its own effect below).
      if (paymentId) {
        try {
          await gotoAuthed(page, '/payments');
          const paymentRow = page.getByTestId(`payment-row-${paymentId}`);
          await expect(paymentRow).toBeVisible({ timeout: 15_000 });
          await paymentRow.getByRole('button', { name: 'Refund' }).click();
          const refundDialog = page.getByRole('dialog', { name: 'Process refund' });
          await expect(refundDialog).toBeVisible({ timeout: 10_000 });

          const itemCheckboxes = refundDialog.getByRole('checkbox', { name: /^select .* for refund$/i });
          const itemCount = await itemCheckboxes.count();
          for (let i = 0; i < itemCount; i++) {
            const cb = itemCheckboxes.nth(i);
            if (!(await cb.isDisabled())) await cb.check();
          }
          const restockCheckboxes = refundDialog.getByRole('checkbox', { name: /^restock /i });
          const restockCount = await restockCheckboxes.count();
          for (let i = 0; i < restockCount; i++) {
            const rc = restockCheckboxes.nth(i);
            if (!(await rc.isChecked())) await rc.check();
          }

          const reasonTrigger = refundDialog.locator('#refund-reason');
          await expect(reasonTrigger).toBeVisible({ timeout: 5_000 });
          await reasonTrigger.click();
          await page.getByRole('option', { name: /wrong.*order/i }).click();

          await page.getByRole('button', { name: /request approval/i }).click();
          const pinDialog = page.getByRole('alertdialog');
          await expect(pinDialog).toBeVisible({ timeout: 8_000 });
          await enterManagerPin(page, adminPin);
          await expect(page.getByText(/refund.*processed/i)).toBeVisible({ timeout: 15_000 });
        } catch (refundErr) {
          console.error('Cleanup: refund step failed, continuing with remaining cleanup', refundErr);
        }
      }

      if (productId) {
        await db.from('products').update({ is_active: false }).eq('id', productId);
      }
      if (supplierId) {
        await db.from('shipments').delete().eq('supplier_id', supplierId);
        await db.from('suppliers').delete().eq('id', supplierId);
      }
      await deleteTestStaff(staffName).catch(() => undefined);

      if (openedCajaSessionId) {
        const { data: sessionRow } = await db
          .from('caja_sessions')
          .select('version')
          .eq('id', openedCajaSessionId)
          .maybeSingle();
        if (sessionRow) {
          await db
            .from('caja_sessions')
            .update({
              status: 'closed',
              closed_at: new Date().toISOString(),
              closing_cash: 500,
              version: (sessionRow.version as number) + 1,
            })
            .eq('id', openedCajaSessionId)
            .eq('version', sessionRow.version as number);
        }
      }

      // Final assertions — proof cleanup actually ran, not just attempted.
      if (supplierId) {
        const { data: supplierAfter } = await db.from('suppliers').select('id').eq('id', supplierId).maybeSingle();
        expect(supplierAfter).toBeNull();
      }
      if (productId) {
        const { data: productAfter } = await db
          .from('products')
          .select('is_active')
          .eq('id', productId)
          .maybeSingle();
        expect(productAfter?.is_active).toBe(false);
      }
      const { data: staffAfter } = await db.from('profiles').select('id').eq('name', staffName).maybeSingle();
      expect(staffAfter).toBeNull();

      await logout(page).catch(() => undefined);
    }
  });
});
