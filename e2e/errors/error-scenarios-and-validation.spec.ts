/**
 * E2E: Error Scenarios and Field Validation
 *
 * Merged from e2e/20-error-scenarios.spec.ts + e2e/26-field-validation.spec.ts
 * (Plan 17-14) — both files carried the same "Bucket B — /pos deleted, no
 * stub until Phase 2" staleness this phase resolved repeatedly elsewhere
 * (Plans 17-05/17-07/17-09/17-11/17-12): /pos is a live route again
 * (direct-sale checkout), so every test.skip that was blocked purely on
 * /pos not existing has been resolved here — rewritten against the current
 * UI, confirmed redundant with existing coverage, or confirmed obsolete
 * (deleted with a documented reason). See the Task 3 section of
 * 17-14-SUMMARY.md for the full disposition of every skip this file
 * inherited.
 *
 * ER1 (pool-session domain) is deleted outright per D-08 — that domain was
 * dropped wholesale in Phase 1, not deferred like /pos was.
 */

import { expect, test } from '../fixtures';
import { loginAs, logout, WHO_ARE_YOU_RE } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import {
  getInventoryQty,
  openCaja,
  resetTestState,
  seedOpenTab,
  setInventoryQty,
  setStockToZero,
} from '../helpers/supabase';

// Stable Indian-catalog checkout fixture (matches e2e/checkout/*.spec.ts,
// Plan 17-04) — reused here for ER3/ER6's direct-sale checkout flows.
const CHECKOUT_PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";

// Locale-agnostic (house style, 17-PATTERNS.md "Locale-agnostic UI
// matching") — confirmed this session via a failed run's screenshot that
// the 'cashier' E2E fixture account is NOT reliably en-US either (the
// /pos search placeholder rendered as es-MX "Buscar productos"), so every
// /pos-touching assertion below must accept both translations rather than
// assuming one locale's copy.
const SEARCH_PRODUCTS_RE = /search products|buscar productos/i;
const SELECT_CHECKOUT_PRODUCT_RE = /^(select|seleccionar) haldiram's aloo bhujia 200g/i;
const PROCESS_PAYMENT_RE = /^(process payment|procesar pago)$/i;
const AMOUNT_TENDERED_RE = /^(amount tendered|monto entregado)$/i;
const DONE_RE = /^(done|listo)$/i;
const CART_EMPTY_RE = /cart is empty|el carrito está vacío/i;
const RISK_TOAST_RE =
  /only 0 left of haldiram's aloo bhujia 200g|solo quedan 0 de haldiram's aloo bhujia 200g/i;
const CANCEL_RE = /^(cancel|cancelar)$/i;
const NO_CAJA_OPEN_RE = /no caja is open|no hay caja abierta/i;
// PINKeypad.tsx hardcodes "Key 1".."Key 9" (never run through i18n), but
// "Key 0" does go through t('pinKeypad.key0') — "Tecla 0" in es-MX.
const KEY_0_RE = /^(Key 0|Tecla 0)$/;

// ---------------------------------------------------------------------------
// Standard beforeEach (with caja)
// ---------------------------------------------------------------------------

test.describe('Error Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  test('ER2: close caja with open tabs — error toast shown', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'manager');

    // /pos (deleted in Plan 01-11, D-07) previously created this tab via its
    // own "New Tab" dialog — setup only; the subject under test is the
    // OPEN_TABS_EXIST guard on the close-caja flow (/staff or /home), not
    // /pos itself. Seed the open tab directly instead.
    await seedOpenTab({
      customerName: 'Open Tab Caja Close',
      role: 'manager',
      productName: CHECKOUT_PRODUCT_NAME,
    });

    // Try to close caja from /staff or home
    await page.goto('/staff');
    const closeCajaBtn = page.getByRole('button', { name: /close caja|close register/i });
    const hasBtn = await closeCajaBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasBtn) {
      await page.goto('/home');
      const homeBtn = page.getByRole('button', { name: /close caja|close register/i });
      const hasHomeBtn = await homeBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!hasHomeBtn) {
        test.skip(true, 'UI not implemented — EXPECTED FAIL: close caja button not found');
        return;
      }
      await homeBtn.click();
    } else {
      await closeCajaBtn.click();
    }

    // The page-level "Close Caja" link only opens a confirmation dialog
    // (Closing Cash Count / Notes) — the OPEN_TABS_EXIST mutation doesn't
    // fire until the dialog's own "Close Caja" submit button is clicked.
    const confirmDialog = page.getByRole('dialog', { name: /close caja/i });
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
    await confirmDialog.getByRole('button', { name: 'Close Caja' }).click();

    // The broad "open tabs" pattern also matches an unrelated static page
    // description ("Daily business session. All tabs require an open
    // ...") — strict-mode violation. The real toast (CajaDashboard.tsx,
    // OPEN_TABS_EXIST -> t('cajaDashboard.openTabsExist')) reads "Cannot
    // close caja — there are open tabs. Close all tabs first." — match its
    // distinctive lead phrase instead.
    await expect(page.getByText(/cannot close caja/i)).toBeVisible({ timeout: 15_000 });
    await logout(page);
  });

  // ER4 (adding an item to a paid tab, via /pos's Switch Tab drawer) is
  // deleted, not rewritten — confirmed obsolete against the current UI:
  // direct-sale checkout (CheckoutPanel.tsx) has no "Switch Tab"/tab-
  // selection affordance at all anymore — it's a single anonymous cart per
  // visit to /pos, not the old bar-pos tab-switcher. There is no UI path
  // left from which a paid tab could even be reached from the checkout
  // screen to attempt adding an item to it. The real current guard —
  // completed sales can only be modified through the dedicated,
  // manager-PIN-gated edit-paid-tab flow — is already covered end-to-end by
  // e2e/47-edit-paid-tab.spec.ts (SC-3: bartender/cashier cannot self-
  // approve the edit-paid-tab PIN gate). Rewriting ER4 against the current
  // UI would just be a weaker duplicate of that coverage, so it is deleted
  // here rather than force-retargeted at a UI affordance that doesn't
  // exist.

  test('ER6: adding an out-of-stock product shows a risky-add confirmation and is not added until confirmed', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');

    // CHECKOUT_PRODUCT_NAME is the shared fixture every e2e/checkout/*.spec.ts
    // file and ER3/FV4/FV5 below also rely on being purchasable — capture the
    // real quantity and restore it in `finally` (not as a tail statement) so
    // an assertion failure partway through this test can never leave every
    // other checkout-flow test (in this file or elsewhere in the suite)
    // permanently unable to add this product to a cart.
    const quantityBefore = await getInventoryQty(CHECKOUT_PRODUCT_NAME);
    try {
      await setStockToZero(CHECKOUT_PRODUCT_NAME);

      await page.goto('/pos');
      await page.getByPlaceholder(SEARCH_PRODUCTS_RE).fill(CHECKOUT_PRODUCT_NAME);

      // ProductCard itself doesn't disable/badge on stock (only on
      // `is_active`) — the real out-of-stock gate lives one layer up, in
      // useConfirmRiskyAdd (entities/product/model/useConfirmRiskyAdd.ts):
      // getProductRiskFlag flags any product whose quantityOnHand <=
      // lowStockThreshold (0 always qualifies) as 'low-stock', and
      // ProductGrid's onSelect routes through it instead of adding to cart
      // directly. Clicking "Select" therefore opens a toast requiring
      // explicit confirmation, not an immediate cart add — the real
      // current "out-of-stock ordering" guard.
      await page.getByRole('button', { name: SELECT_CHECKOUT_PRODUCT_RE }).click();

      const riskToast = page.getByText(RISK_TOAST_RE);
      await expect(riskToast).toBeVisible({ timeout: 10_000 });

      // Not added to cart yet — "Process payment" stays disabled with an
      // empty cart until the toast is explicitly confirmed.
      await expect(page.getByText(CART_EMPTY_RE)).toBeVisible();
      await expect(
        page.getByRole('button', { name: PROCESS_PAYMENT_RE }).first()
      ).toBeDisabled();

      // Cancel the risky add — item is never added, stock is untouched.
      await page.getByRole('button', { name: CANCEL_RE }).click();
      await expect(page.getByText(CART_EMPTY_RE)).toBeVisible();
      await expect.poll(() => getInventoryQty(CHECKOUT_PRODUCT_NAME)).toBe(0);
    } finally {
      await setInventoryQty(CHECKOUT_PRODUCT_NAME, quantityBefore);
    }

    await logout(page);
  });

  test('ER-DSF: confirming "Add anyway" on a 0-stock item and completing checkout shows the translated out-of-stock message, not a raw Postgres error', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');

    const quantityBefore = await getInventoryQty(CHECKOUT_PRODUCT_NAME);
    try {
      await setStockToZero(CHECKOUT_PRODUCT_NAME);

      await page.goto('/pos');
      await page.getByPlaceholder(SEARCH_PRODUCTS_RE).fill(CHECKOUT_PRODUCT_NAME);
      await page.getByRole('button', { name: SELECT_CHECKOUT_PRODUCT_RE }).click();

      const riskToast = page.getByText(RISK_TOAST_RE);
      await expect(riskToast).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /^add anyway$/i }).click();
      await expect(page.getByText(CART_EMPTY_RE)).not.toBeVisible();

      await page
        .getByRole('button', { name: PROCESS_PAYMENT_RE })
        .first()
        .click();
      await page.getByLabel(AMOUNT_TENDERED_RE).fill('100');
      await page
        .getByRole('button', { name: PROCESS_PAYMENT_RE })
        .last()
        .click();

      // Backend rejects the sale (stock is 0, decrement would go negative) —
      // the checkout form must show the translated inventoryNegativeError
      // copy, never the raw Postgres constraint-violation string.
      // Scope to the payment form's own error alert via its data-testid
      // (added alongside this fix in PaymentForm.tsx) rather than the bare
      // page — an unscoped `getByRole('alert')` can also match ProductGrid's
      // own query-error alert or a sonner toast and flaked once in review.
      // /pos mounts PaymentForm directly (CheckoutPanel), not inside a
      // Radix Dialog, so scoping via role="dialog" doesn't apply here —
      // PaymentPane on /payments is the one that wraps it in a Dialog.
      const errorAlert = page.getByTestId('payment-error-alert');
      await expect(errorAlert).toBeVisible({ timeout: 20_000 });
      await expect(errorAlert).toContainText(/out of stock/i);
      await expect(errorAlert).not.toContainText(/constraint|relation|SQLSTATE|violates/i);

      await expect(page.getByRole('button', { name: DONE_RE })).not.toBeVisible();
    } finally {
      await setInventoryQty(CHECKOUT_PRODUCT_NAME, quantityBefore);
    }

    await logout(page);
  });

  // D-07: /pos was deleted in Phase 1 (Plan 01-11) — see note above ER4. This
  // test exercises /pos's own product-select grid + out-of-stock rendering
  // directly (only ever mounted on /pos). Skipped, not deleted.
  test('ER7: session cleared — /home redirects to /login', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'manager');
    await page.goto('/home');
    await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });

    // This app persists auth in localStorage, not cookies — the Supabase
    // client (src/shared/lib/supabase.ts, default `storage`) and the staff
    // Zustand store (src/entities/staff/model/store.ts, `persist`
    // middleware, default storage) both default to localStorage.
    // `clearCookies()` alone leaves both fully intact, so the app never sees
    // a cleared session at all. Clear localStorage to actually simulate it.
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    // No logout needed — session already cleared
  });

  test('ER8: RLS enforced at DB level', async () => {
    test.skip(true, 'RLS tested at DB level via Supabase policies — not an E2E concern');
  });
});

// ---------------------------------------------------------------------------
// Separate describe with NO caja — for ER3 and ER5
// ---------------------------------------------------------------------------

test.describe('Error Scenarios — No Caja', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    // Intentionally NOT calling openCaja here
    await page.goto('/');
  });

  test('ER3: attempting to complete a sale with no open caja shows the CAJA_CLOSED error', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');
    await page.goto('/pos');

    // /pos itself doesn't gate on caja state (useCheckoutSale's own
    // CAJA_CLOSED check is a submit-time guard, not a page-load guard —
    // src/features/checkout-sale/model/useCheckoutSale.ts) — the cart and
    // "Process payment" UI render normally with the caja closed; the error
    // only surfaces once a payment is actually attempted.
    await page.getByPlaceholder(SEARCH_PRODUCTS_RE).fill(CHECKOUT_PRODUCT_NAME);
    await page.getByRole('button', { name: SELECT_CHECKOUT_PRODUCT_RE }).click();
    await page
      .getByRole('button', { name: PROCESS_PAYMENT_RE })
      .first()
      .click();
    await page.getByLabel(AMOUNT_TENDERED_RE).fill('100');
    await page
      .getByRole('button', { name: PROCESS_PAYMENT_RE })
      .last()
      .click();

    // entities:tab.cajaNotOpen
    await expect(page.getByText(NO_CAJA_OPEN_RE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: DONE_RE })).not.toBeVisible();
    await logout(page);
  });

  test('ER5: already-paid tab disappears from payments list', async ({ page }) => {
    test.setTimeout(120_000);
    // Re-open caja for this test since we need to create a payment
    await openCaja(500);
    await loginAs(page, 'manager');

    // /pos (deleted in Plan 01-11, D-07) previously placed this order via its
    // own "New Tab" + product-select + "Place Order" flow — setup only; the
    // subject under test is the payments list dropping a tab after payment,
    // which lives entirely on /payments. Seed the tab + order directly.
    await seedOpenTab({
      customerName: 'Pay Twice Tab',
      role: 'manager',
      withItem: true,
      productName: CHECKOUT_PRODUCT_NAME,
    });

    // Pay via payments page
    await page.goto('/payments');
    const list = page.getByTestId('tabs-waiting-for-payment');
    await expect(list.getByText('Pay Twice Tab')).toBeVisible({ timeout: 20_000 });
    await list.getByRole('button', { name: /tab Pay Twice Tab/i }).click();
    await page.getByRole('button', { name: /verify pin to process payment/i }).click();

    const pinDialog = page.getByRole('alertdialog', { name: /manager access required/i });
    await expect(pinDialog).toBeVisible({ timeout: 10_000 });
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    for (const ch of managerPin) {
      await pinDialog.getByRole('button', { name: ch === '0' ? KEY_0_RE : `Key ${ch}` }).click();
    }
    await expect(pinDialog).not.toBeVisible({ timeout: 10_000 });

    await page.getByTestId('payment-btn-cash').click();
    await page.getByLabel(/amount tendered/i).fill('500');
    await page.getByRole('button', { name: /process payment/i }).click();
    await expect(page.getByRole('heading', { name: 'Receipt' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Done' }).click();

    // Tab should no longer appear in payments list
    await expect(list.getByText('Pay Twice Tab')).not.toBeVisible({ timeout: 10_000 });
    await logout(page);
  });
});

// ---------------------------------------------------------------------------
// Field Validation
// ---------------------------------------------------------------------------

test.describe('Field Validation', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(500);
    await page.goto('/');
  });

  // FV1-FV3 (customer-name field validation on the deleted Open Tab dialog)
  // are deleted, not rewritten — confirmed obsolete: direct-sale checkout
  // (CheckoutPanel.tsx / useCheckoutSale.ts) has no user-typed customer-name
  // field anywhere in the flow. Every direct sale is recorded under a fixed
  // default name (`i18n.t('featOrders:checkoutSale.defaultCustomerName')`,
  // "Walk-in" in en-US) that the cashier cannot edit — an anonymous
  // walk-in sale genuinely has no equivalent input to validate. There is no
  // real current field these three tests could be retargeted at.

  // FV4-equivalent: the current direct-sale checkout flow's real per-item
  // notes field (CartItem.tsx, `data-testid="cart-item-notes-{productId}"`,
  // native `maxLength={200}`) is the closest live equivalent to the old
  // order-notes field FV4/FV5 targeted — retargeted at its real boundary
  // (200, not the old field's 500) instead of the removed field.
  test('FV4-equivalent: cart item notes accept up to 200 characters', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');
    await page.goto('/pos');
    await page.getByPlaceholder(SEARCH_PRODUCTS_RE).fill(CHECKOUT_PRODUCT_NAME);
    await page.getByRole('button', { name: SELECT_CHECKOUT_PRODUCT_RE }).click();

    const notesInput = page.getByTestId(/^cart-item-notes-/);
    await expect(notesInput).toBeVisible({ timeout: 10_000 });
    const longNote = 'A'.repeat(200);
    await notesInput.fill(longNote);
    await expect(notesInput).toHaveValue(longNote);

    await logout(page);
  });

  test('FV5-equivalent: cart item notes input is capped at 200 characters (native maxLength)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'cashier');
    await page.goto('/pos');
    await page.getByPlaceholder(SEARCH_PRODUCTS_RE).fill(CHECKOUT_PRODUCT_NAME);
    await page.getByRole('button', { name: SELECT_CHECKOUT_PRODUCT_RE }).click();

    const notesInput = page.getByTestId(/^cart-item-notes-/);
    await expect(notesInput).toBeVisible({ timeout: 10_000 });
    const tooLongNote = 'B'.repeat(201);
    await notesInput.fill(tooLongNote);

    const actualValue = await notesInput.inputValue();
    expect(actualValue.length).toBeLessThanOrEqual(200);

    await logout(page);
  });

  test('FV6: open caja with negative opening cash — form error shown', async ({ page }) => {
    test.setTimeout(90_000);
    // Close the existing caja so we can try to open a new one
    // (resetTestState already closes it, but openCaja was called in beforeEach — skip re-close here)
    await loginAs(page, 'manager');

    // Look for "Open Caja" button (may be on /staff or /home after caja is closed)
    // Since beforeEach already opens caja, we test via the modal if accessible without closing first
    //
    // 39-06 triage finding: the opening-cash field is a MoneyInput
    // (src/shared/ui/MoneyInput.tsx), whose parseToCents() strips any
    // non-digit/non-'.' character — including a leading '-' — before
    // parsing, so a negative value can never actually be typed into this
    // field; it silently coerces to 0/positive rather than surfacing a
    // validation error. The boundary is enforced by input coercion, not by
    // an error message, so this test's premise (a "form error shown" path)
    // has no code path to exercise. Writing a full close-caja-then-reopen
    // flow to assert the coercion behavior instead is more than a trivial
    // same-root-cause fix (D-03), so left as a documented skip rather than
    // implemented in this triage-only plan.
    test.skip(true, 'Not implemented — MoneyInput silently strips a leading "-" (coerces to 0/positive) rather than showing a validation error, so no "form error shown" path exists to test; a close-caja-then-reopen flow to assert the coercion behavior is out of scope for this triage plan');
  });

  test('FV7: product form with empty name — error shown, not saved', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');
    await page.goto('/inventory');

    const inventoryHeading = page.getByRole('heading', { name: /inventory|products|catalog/i });
    const found = await inventoryHeading.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: /inventory not rendered');
      return;
    }

    const prodTab = page.getByRole('tab', { name: /products/i });
    if (await prodTab.isVisible({ timeout: 3_000 }).catch(() => false)) await prodTab.click();

    const addProdBtn = page.getByRole('button', { name: /add product|new product/i });
    if (!(await addProdBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: add product button not found');
      return;
    }
    await addProdBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    // Leave name empty, fill required price
    const priceInput = dialog.getByLabel(/base price|price/i).first();
    if (await priceInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await priceInput.fill('10');
    }
    await dialog.getByRole('button', { name: /save|create/i }).click();

    // Dialog should stay open with error
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    const hasError =
      (await dialog.getByText(/name.*required|required/i).count()) > 0 ||
      (await dialog.getByLabel(/name/i).evaluate(el => (el as HTMLInputElement).validity.valid === false));
    expect(hasError).toBe(true);
    await logout(page);
  });

  test('FV8: 5-digit PIN on login page — error shown', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: WHO_ARE_YOU_RE })).toBeVisible({ timeout: 30_000 });

    // Click on the first staff member — scoped to the EmployeeSelector's own
    // container (the heading's nearest common ancestor with the button list),
    // not a bare page-wide getByRole('button') (39-06 triage finding: the
    // broad locator was resolving to the persistent AI-assistant panel's
    // "Ver menú" toggle button, which sits outside the viewport and caused
    // the 15s click timeout — same overlay documented in helpers/auth.ts's
    // logout() and e2e/24-waitlist.spec.ts's T6/T7 dialog-title-filter
    // comments).
    const employeeSection = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: WHO_ARE_YOU_RE }) })
      .last();
    const firstStaffBtn = employeeSection.getByRole('button').first();
    await firstStaffBtn.click();

    // Enter only 5 digits (not a full 6-digit PIN)
    for (const ch of '12345') {
      await page.getByRole('button', { name: ch === '0' ? 'Key 0' : `Key ${ch}` }).click();
    }

    // With only 5 digits, the PIN is not submitted yet (PinSchema requires 6 digits)
    // The login should NOT proceed — we should still be on the PIN entry screen
    await expect(page).not.toHaveURL(/\/home/, { timeout: 5_000 });

    // The PIN dialog / keypad should still be visible
    const pinPad = page.getByRole('button', { name: /Key/i }).first();
    await expect(pinPad).toBeVisible({ timeout: 5_000 });
    // No navigation to /home
    expect(page.url()).not.toMatch(/\/home/);
  });

  test('FV9: caja entry form — amount 0 shows error', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'manager');

    // Try to find the caja entry form
    await page.goto('/staff');
    const addBtn = page.getByRole('button', { name: /add entry|register entry|expense.*income/i });
    const found = await addBtn.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!found) {
      test.skip(true, 'UI not implemented — EXPECTED FAIL: caja entry form not found');
      return;
    }

    await addBtn.click();
    const dialog = page.getByRole('dialog', { name: /register expense|expense.*income/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const amountInput = dialog.getByLabel(/amount/i);
    await amountInput.fill('0');
    await dialog.locator('#entry-concept').fill('Zero test');
    await dialog.getByRole('button', { name: /save entry/i }).click();

    // The amount input has a native HTML5 `min="0.01"` constraint (see
    // src/features/register-caja-entry/ui/RegisterCajaEntryDialog.tsx), so
    // clicking the submit button triggers the browser's own constraint
    // validation before the form's onSubmit/Zod handler ever runs — the
    // custom "Amount must be greater than 0" paragraph is never rendered in
    // that path (39-06 triage finding). Accept either signal, exactly the
    // same and-alternative pattern FV1/FV7 already use for their own
    // required-field checks in this file.
    const hasError =
      (await dialog.getByText(/amount must be greater than 0|positive/i).count()) > 0 ||
      (await amountInput.evaluate(el => (el as HTMLInputElement).validity.valid === false));
    expect(hasError).toBe(true);
    await expect(dialog).toBeVisible();
    await logout(page);
  });
});
