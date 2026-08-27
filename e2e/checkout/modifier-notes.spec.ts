/**
 * E2E: Per-item cart notes on /pos (modifier sheet coverage — see T1 below).
 *
 * Split out of the former hybrid modifier-notes/kitchen-display spec
 * (Pitfall 3): that file mixed live modifier/notes coverage with
 * kitchen-board-display assertions for a feature that was removed
 * end-to-end in Phase 1. The board-display content is gone; the
 * modifier/notes content is rewritten here.
 *
 * T1 (modifier sheet opens on product tap) is re-verified as genuinely dead,
 * not merely stale-navigation: `ModifierSheet.tsx` has zero production
 * callers as of this plan (confirmed via
 * `grep -rn "ModifierSheet" src --include=*.tsx --include=*.ts`, which
 * matches only the component file and its own Storybook story).
 * `CheckoutPanel`'s `ProductGrid onSelect` wires straight to
 * `addItem(product, [])` — tapping a product tile never opens a modifier
 * picker, regardless of whether the product carries modifiers. This is
 * documented, not silently re-skipped: see T1's `test.skip` reason below.
 *
 * T2 (per-item notes) is genuinely live — `CartItem` renders a notes
 * `<Input>` per cart line (`data-testid="cart-item-notes-{productId}"`,
 * `order_items.notes` still exists in the schema) — and is rewritten
 * against the current `/pos` product-grid → cart flow with a real seeded
 * Indian-catalog product, no `page.route()` mock needed.
 *
 * Auth note: LoginPage redirects to /pos when isAuthenticated=true (Supabase
 * session persisted in localStorage). Clear localStorage before calling
 * loginAs so the PIN flow always goes through the shift-start dialog → /home.
 */

import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';

const PRODUCT_NAME = "Haldiram's Aloo Bhujia 200g";

test.describe('Modifier sheet + per-item notes', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(400);
    // Clear Supabase localStorage session before each test so loginAs always
    // starts from an unauthenticated state. Navigate to the app origin first
    // so localStorage is in scope, then clear it, then continue to /login.
    await page.goto('/');
    await page.evaluate(() => {
      // Remove all supabase-* keys to force a fresh auth flow.
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k.startsWith('supabase'))
        .forEach(k => localStorage.removeItem(k));
    });
  });

  // ---------------------------------------------------------------------------
  // T1: Modifier sheet opens when a product with modifiers is tapped in the POS.
  //
  // Confirmed dead, not just stale-premise: `ModifierSheet` has zero
  // production callers (only its own `.stories.tsx` imports it) and
  // `CheckoutPanel`'s `ProductGrid onSelect={product => addItem(product, [])}`
  // (src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx) never checks whether a
  // product carries modifiers before adding it to the cart. There is no
  // reachable UI path left to exercise here — a `page.route()` mock product
  // with injected `product_modifiers` would still just get added directly,
  // because the checkout flow itself never branches on that data anymore.
  // The underlying schema (order_items.modifier_ids/modifier_price_delta) is
  // still live and used by the admin-side modifier CRUD
  // (src/features/manage-products/ui/CatalogModifiersTab.tsx) and by
  // CartItem's modifier-badge rendering — only the checkout-time picker UI is
  // gone. Filed as a coverage gap, not silently dropped.
  // ---------------------------------------------------------------------------
  test('T1: modifier sheet is not reachable from the current /pos checkout UI', async () => {
    test.skip(
      true,
      'ModifierSheet (src/features/add-item-to-tab/ui/ModifierSheet.tsx) has zero production ' +
        'callers as of this plan (verified: only ModifierSheet.stories.tsx imports it). ' +
        'CheckoutPanel wires ProductGrid.onSelect straight to addItem(product, []) — tapping a ' +
        'product tile never opens a modifier picker. This is orphaned dead UI code, not a stale ' +
        'navigation reference; the modifier/notes schema itself is still live (see T2). ' +
        'Re-enable if/when ModifierSheet is wired back into the checkout product-grid tap flow.'
    );
  });

  // ---------------------------------------------------------------------------
  // T2: Type a note on a cart line — the cart reflects it.
  // ---------------------------------------------------------------------------
  test('T2: adding a per-item note on a cart line — cart reflects it', async ({ page }) => {
    test.setTimeout(120_000);

    const admin = getServiceClient();
    const { data: product, error } = await admin
      .from('products')
      .select('id')
      .eq('is_active', true)
      .eq('name', PRODUCT_NAME)
      .single();
    if (error || !product) throw new Error(error?.message ?? 'Seeded product not found');

    await loginAs(page, 'admin');
    await page.goto('/pos');

    await page.getByPlaceholder(/search products/i).fill(PRODUCT_NAME);
    await page.getByRole('button', { name: new RegExp(`select ${PRODUCT_NAME}`, 'i') }).click();

    const notesInput = page.getByTestId(`cart-item-notes-${product.id}`);
    await expect(notesInput).toBeVisible({ timeout: 10_000 });
    await notesInput.fill('sin apio');
    await expect(notesInput).toHaveValue('sin apio');

    await logout(page);
  });

  // ---------------------------------------------------------------------------
  // T4: Pre-cheque text includes modifier and note lines.
  // Skipped: Tauri IPC (invoke 'print_precheque') is not callable in Playwright
  // browser mode — the app runs as a plain Vite dev server without the Rust backend.
  // The buildPreChequeText() function is unit-tested in src/features/print-precheque/.
  // Re-enable once a RUN_TAURI_E2E=1 harness is wired up (see 13-tauri-build.spec.ts).
  // ---------------------------------------------------------------------------
  test('T4: pre-cheque text includes modifier and note (skipped — Tauri IPC not available)', async () => {
    test.skip(
      true,
      'TODO: Tauri IPC (print_precheque command) is unavailable in Playwright browser mode. ' +
        'Test buildPreChequeText() at the unit level in src/features/print-precheque/. ' +
        'Re-enable when RUN_TAURI_E2E=1 harness is wired up.',
    );
  });
});
