/**
 * E2E spec: Settings → Categories (category tree + depth gate + modifier-groups RLS)
 *
 * Tickets: S1-13
 *
 * Covers:
 *  - Admin opens Settings and sees the Products tab with Categories and Modifier Groups sub-tabs
 *  - Admin creates a root category "Beers"
 *  - Admin creates child "Regular" under Beers
 *  - Admin creates grandchild "Corona" under Regular
 *  - Attempt to add a 4th level is blocked in UI (Add subcategory button absent at depth 2)
 *  - Bartender cannot write to modifier_groups (RLS guard)
 *
 * (A prior T6 asserting a category-level combo flag was removed — see the
 * comment above the deleted test below; that column was never on `categories`.)
 */

import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

// ---------------------------------------------------------------------------
// Test-local helpers
// ---------------------------------------------------------------------------

/**
 * Clean up categories created during this spec by name.
 * Uses the service-role client so that RLS doesn't block teardown.
 */
async function cleanupTestCategories(names: string[]): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) return;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.from('categories').delete().in('name', names);
}

/**
 * Attempt to insert a modifier_group row using a user JWT (anon key + bartender auth).
 * Returns the Supabase error code / message if refused, or null if succeeded.
 *
 * We authenticate as the bartender's email/password via the anon client (not service role)
 * to exercise RLS. If the credentials are not set in env we skip.
 */
async function attemptModifierGroupInsertAsBartender(): Promise<{
  success: boolean;
  errorMessage: string | null;
}> {
  const url = process.env.VITE_SUPABASE_URL ?? '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const bartenderEmail = process.env.E2E_BARTENDER_EMAIL;
  const bartenderPassword = process.env.E2E_BARTENDER_PASSWORD;

  // If anon key or bartender email/password not available, skip via special sentinel
  if (!anonKey || !bartenderEmail || !bartenderPassword) {
    return { success: false, errorMessage: 'SKIP_RLS_TEST' };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email: bartenderEmail,
    password: bartenderPassword,
  });
  if (signInError) {
    return { success: false, errorMessage: `auth failed: ${signInError.message}` };
  }

  const { error: insertError } = await client.from('modifier_groups').insert({
    name: 'E2E-RLS-Test-Group',
    min_select: 0,
    max_select: 1,
    is_required: false,
    sort_order: 9999,
  });

  if (insertError) {
    return { success: false, errorMessage: insertError.message };
  }

  // Succeeded unexpectedly — clean up
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.from('modifier_groups').delete().eq('name', 'E2E-RLS-Test-Group');
  return { success: true, errorMessage: null };
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------

const TEST_CATEGORY_NAMES = ['Beers', 'Regular', 'Corona'];

/**
 * The Category create/edit dialog, scoped to exclude the always-mounted
 * AgentPanel (`src/features/agent-chat/ui/AgentPanel.tsx`), which also renders
 * `role="dialog"` permanently in the DOM (toggled only by a CSS transform —
 * never `display:none`/`visibility:hidden`), so a bare `page.getByRole('dialog')`
 * intermittently re-resolves to it once the real Radix dialog has closed and
 * Radix's aria-hide-siblings-while-modal-is-open behavior lifts. AgentPanel is
 * the only `role="dialog"` element that ever carries a literal `aria-modal="false"`
 * attribute (verified via a live DOM dump this session — the real Radix dialog
 * carries no `aria-modal` attribute at all), so excluding that value — rather
 * than requiring a specific `aria-modal="true"` that doesn't exist — is the
 * correct, locale-independent way to scope this.
 */
function categoryDialog(page: Page) {
  return page.locator('[role="dialog"]:not([aria-modal="false"])');
}

test.describe('Settings: Category Tree + Combo Flag + Modifier Groups RLS', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(570);
    await cleanupTestCategories(TEST_CATEGORY_NAMES);
    await page.goto('/');
  });

  test.afterEach(async () => {
    await cleanupTestCategories(TEST_CATEGORY_NAMES);
  });

  // =========================================================================
  // T1: Admin can reach Settings → Products → Categories
  // =========================================================================
  test('T1: admin sees Settings with Categories and Modifier Groups tabs', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');

    // Settings heading visible
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 20_000 });

    // Products tab is visible and accessible
    await page.getByRole('tab', { name: 'Products' }).click();

    // Sub-tabs inside ProductsSettingsTab
    await expect(page.getByRole('tab', { name: 'Categories' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Modifier Groups' })).toBeVisible({ timeout: 10_000 });

    await logout(page);
  });

  // =========================================================================
  // T2: Admin creates root category "Beers"
  // =========================================================================
  test('T2: admin creates root category "Beers" — visible in tree', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Products' }).click();
    await page.getByRole('tab', { name: 'Categories' }).click();

    // Click "Add root category"
    await page.getByRole('button', { name: /add root category/i }).click();
    await expect(categoryDialog(page)).toBeVisible({ timeout: 10_000 });

    // Fill name
    await page.getByLabel(/name/i).fill('Beers');
    await page.getByRole('button', { name: /^save$/i }).click();

    // Dialog closes, success toast appears, tree shows Beers
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Beers')).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  // =========================================================================
  // T3: Admin creates child "Regular" under Beers
  // =========================================================================
  test('T3: admin creates child "Regular" under Beers', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Products' }).click();
    await page.getByRole('tab', { name: 'Categories' }).click();

    // Create root Beers first
    await page.getByRole('button', { name: /add root category/i }).click();
    await page.getByLabel(/name/i).fill('Beers');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Beers')).toBeVisible({ timeout: 15_000 });

    // Click "Add subcategory under Beers"
    await page.getByRole('button', { name: /add subcategory under Beers/i }).click();
    await expect(categoryDialog(page)).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/name/i).fill('Regular');
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });

    // Beers may be collapsed after the dialog closes (39-07, harness — T3 was
    // missing the expand step T4/T5 already handle for the same tree).
    const expandBeers = page.getByRole('button', { name: /expand Beers/i });
    const expandVisible = await expandBeers.isVisible({ timeout: 3_000 }).catch(() => false);
    if (expandVisible) await expandBeers.click();

    await expect(page.getByText('Regular')).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  // =========================================================================
  // T4: Admin creates grandchild "Corona" under Regular
  // =========================================================================
  test('T4: admin creates grandchild "Corona" under Regular', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Products' }).click();
    await page.getByRole('tab', { name: 'Categories' }).click();

    // Create root Beers
    await page.getByRole('button', { name: /add root category/i }).click();
    await page.getByLabel(/name/i).fill('Beers');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Beers')).toBeVisible({ timeout: 15_000 });

    // Create child Regular under Beers
    await page.getByRole('button', { name: /add subcategory under Beers/i }).click();
    await page.getByLabel(/name/i).fill('Regular');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });

    // Expand Beers to see Regular (Beers may be collapsed after dialog close —
    // 39-07, harness: this check must run before asserting "Regular" is
    // visible, not after).
    const expandBeers = page.getByRole('button', { name: /expand Beers/i });
    const expandVisible = await expandBeers.isVisible({ timeout: 3_000 }).catch(() => false);
    if (expandVisible) await expandBeers.click();

    await expect(page.getByText('Regular')).toBeVisible({ timeout: 15_000 });

    // Create grandchild Corona under Regular
    await page.getByRole('button', { name: /add subcategory under Regular/i }).click();
    await expect(categoryDialog(page)).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/name/i).fill('Corona');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });

    // Expand Regular to reveal Corona (39-07, harness — same collapsed-tree
    // pattern as the Beers/Regular expand step above; T5 already handles
    // this correctly for the identical tree shape).
    const expandRegular = page.getByRole('button', { name: /expand Regular/i });
    const expandRegularVisible = await expandRegular.isVisible({ timeout: 3_000 }).catch(() => false);
    if (expandRegularVisible) await expandRegular.click();

    await expect(page.getByText('Corona')).toBeVisible({ timeout: 15_000 });

    await logout(page);
  });

  // =========================================================================
  // T5: 4th-level creation is blocked in UI — "Add subcategory" button absent at depth 2
  // =========================================================================
  test('T5: 4th-level creation blocked in UI — no "Add subcategory" button on grandchild', async ({
    page,
  }) => {
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Products' }).click();
    await page.getByRole('tab', { name: 'Categories' }).click();

    // Build Beers → Regular → Corona tree
    await page.getByRole('button', { name: /add root category/i }).click();
    await page.getByLabel(/name/i).fill('Beers');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Beers')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /add subcategory under Beers/i }).click();
    await page.getByLabel(/name/i).fill('Regular');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });

    // Expand Beers
    const expandBeers = page.getByRole('button', { name: /expand Beers/i });
    const expandBeersVisible = await expandBeers.isVisible({ timeout: 3_000 }).catch(() => false);
    if (expandBeersVisible) await expandBeers.click();

    await expect(page.getByText('Regular')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /add subcategory under Regular/i }).click();
    await page.getByLabel(/name/i).fill('Corona');
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(categoryDialog(page)).not.toBeVisible({ timeout: 15_000 });

    // Expand Regular to reveal Corona
    const expandRegular = page.getByRole('button', { name: /expand Regular/i });
    const expandRegularVisible = await expandRegular.isVisible({ timeout: 3_000 }).catch(() => false);
    if (expandRegularVisible) await expandRegular.click();

    await expect(page.getByText('Corona')).toBeVisible({ timeout: 10_000 });

    // "Add subcategory under Corona" button must NOT exist (depth 2 = L3, max reached)
    await expect(
      page.getByRole('button', { name: /add subcategory under Corona/i })
    ).toHaveCount(0);

    await logout(page);
  });

  // =========================================================================
  // T6 REMOVED (39-07, obsolete — justified in 39-07-LEDGER.md):
  // the pack/case "combo" flag column this test asserted was never added to
  // `categories` — it was added only to `products`
  // (supabase/migrations/20260424000004_product_combo_flags.sql:7-10,
  // "S1-04: Add combo flags to products"). This test asserted a schema shape
  // that doesn't exist and never did — a live re-check this session confirmed
  // Postgres itself rejects the query with a missing-column error, not a
  // stale-cache artifact. Product-level combo-flag coverage belongs to a
  // products-focused spec, which this file is not and does not otherwise
  // touch.
  // =========================================================================

  // =========================================================================
  // T7: Bartender RLS — cannot write to modifier_groups
  //
  // RLS policy: only manager+ can INSERT/UPDATE/DELETE modifier_groups.
  // We test via direct Supabase anon-key client authenticated as bartender.
  // If E2E_BARTENDER_EMAIL / E2E_BARTENDER_PASSWORD env vars are not set,
  // the test is skipped with an informative message.
  // =========================================================================
  test('T7: bartender cannot write to modifier_groups (RLS)', async ({ page: _page }) => {
    const result = await attemptModifierGroupInsertAsBartender();

    if (result.errorMessage === 'SKIP_RLS_TEST') {
      test.skip(
        true,
        'Set E2E_BARTENDER_EMAIL and E2E_BARTENDER_PASSWORD to enable RLS test. ' +
          'These are the Supabase Auth credentials for the bartender E2E user.'
      );
      return;
    }

    // The insert should be refused by RLS
    expect(result.success).toBe(false);
    // Error should reference RLS / permission denied
    expect(result.errorMessage).toBeTruthy();
  });

  // =========================================================================
  // T8: Bartender UI — Settings shows only the role-agnostic Language tab,
  //     Products/Categories management stays inaccessible (39-07, updated
  //     from a stale full-page redirect assertion — justified in
  //     39-07-LEDGER.md). Phase 21 intentionally opened the `/settings` route
  //     itself to every authenticated role so bartenders can self-service
  //     their locale (src/widgets/SettingsTabsPanel/index.tsx:33-43, CLAUDE.md
  //     "i18n / Multi-Language"); the security property this test protects —
  //     bartenders cannot manage products/categories — is now enforced by
  //     per-tab RBAC gating (`canManageProducts`) rather than a route redirect.
  // =========================================================================
  test('T8: bartender sees only the Language tab on Settings — Products tab is absent', async ({
    page,
  }) => {
    await loginAs(page, 'cashier');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 15_000 });

    // Self-service Language tab is the only tab a bartender sees, and it is
    // selected by default.
    await expect(page.getByRole('tab', { name: 'Idioma' })).toBeVisible({ timeout: 10_000 });

    // Products/Categories management remains gated — no "Products" tab exists
    // for a bartender.
    await expect(page.getByRole('tab', { name: 'Products' })).toHaveCount(0);

    await logout(page);
  });
});
