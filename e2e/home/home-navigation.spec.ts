import { expect, test } from '../fixtures';

import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

// Locale-agnostic (house style, 17-PATTERNS.md "Locale-agnostic UI matching") —
// the fixed E2E accounts' locale can be es-MX or en-US depending on which
// staff-locale test last ran against the shared fixture accounts, so every
// home-tile button match here must accept both translations rather than
// assuming one locale's copy.
const SETTINGS_RE = /^(Settings|Ajustes)$/;
const REPORTS_RE = /^(Reports|Reportes)$/;
const PAYMENTS_RE = /^(Payments|Pagos)$/;
const HOME_LINK_RE = /^(Home|Inicio)$/;
const MANAGER_ACCESS_REQUIRED_RE = /manager access required|se requiere acceso de gerente/i;
const INCORRECT_PIN_RE = /incorrect pin|pin incorrecto/i;
// PINKeypad.tsx hardcodes "Key 1".."Key 9" (never run through i18n), but
// "Key 0" does go through t('pinKeypad.key0') — "Tecla 0" in es-MX.
const KEY_0_RE = /^(Key 0|Tecla 0)$/;

test.describe('Home Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(600);
    await page.goto('/');
  });

  test('cashier login lands on /home', async ({ page }) => {
    await loginAs(page, 'cashier');
    await expect(page).toHaveURL(/\/home/, { timeout: 15_000 });
    await logout(page);
  });

  test('back button on feature page returns to /home', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.getByRole('button', { name: SETTINGS_RE }).click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });
    await page.getByRole('link', { name: HOME_LINK_RE }).click();
    await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });
    await logout(page);
  });

  test('cashier clicking Reports shows Manager PIN dialog', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: REPORTS_RE }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(MANAGER_ACCESS_REQUIRED_RE)).toBeVisible();
    await expect(page).toHaveURL(/\/home/);
    await logout(page);
  });

  test('wrong PIN in Manager PIN dialog shows error and stays on /home', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: REPORTS_RE }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5_000 });

    const dialog = page.getByRole('alertdialog');
    for (const ch of '000000') {
      await dialog.getByRole('button', { name: ch === '0' ? KEY_0_RE : `Key ${ch}` }).click();
    }
    await expect(dialog.getByText(INCORRECT_PIN_RE)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/home/);
    await logout(page);
  });

  test('correct manager PIN navigates to /reports', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: REPORTS_RE }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5_000 });

    const dialog = page.getByRole('alertdialog');
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    for (const ch of managerPin) {
      await dialog.getByRole('button', { name: ch === '0' ? KEY_0_RE : `Key ${ch}` }).click();
    }
    await expect(page).toHaveURL(/\/reports/, { timeout: 15_000 });
    await logout(page);
  });

  test('manager login clicks Reports — no dialog, navigates directly', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.getByRole('button', { name: REPORTS_RE }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/reports/, { timeout: 10_000 });
    await logout(page);
  });

  test('admin login can access Settings directly', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.getByRole('button', { name: SETTINGS_RE }).click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });
    await logout(page);
  });

  test('cashier clicking Settings shows Manager PIN dialog', async ({ page }) => {
    await loginAs(page, 'cashier');
    await page.getByRole('button', { name: SETTINGS_RE }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(MANAGER_ACCESS_REQUIRED_RE)).toBeVisible();
    await logout(page);
  });

  test('T11: cashier navigates to /settings directly — only the Language tab is available, no admin tabs', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // `/settings`'s route registration (router.tsx) has no dedicated role
    // gate — unlike `/reports`/`/audit`, it's wrapped only in the
    // generic (auth-only) <ProtectedRoute>. This is intentional, not a gap:
    // SettingsTabsPanel (widgets/SettingsTabsPanel/index.tsx) always pushes
    // the role-agnostic "Language" tab first, outside both the
    // `canManageSettings`/`canManageProducts` gates, specifically so every
    // authenticated role — including cashier — can self-serve their own
    // locale (CLAUDE.md "i18n / Multi-Language": "Self-service via Settings
    // > Language, open to every authenticated role including bartender").
    // The actual admin-only surfaces (General/Hardware/Email/Backup/Products/
    // Billing) are conditionally excluded from the tab list entirely for a
    // role without `manage_settings`/`manage_products` — verify that gate
    // here instead of a page-level redirect or blocking dialog that was
    // never the actual design.
    await loginAs(page, 'cashier');
    await page.goto('/settings');

    // Locale-agnostic (the test staff's default locale is es-MX, rendering
    // the Language tab as "Idioma", not "Language") — assert the tab COUNT
    // instead of matching a specific translated label. Exactly one tab
    // (the always-pushed, role-agnostic Language tab) confirms none of the
    // 6 admin-only tabs (General/Hardware/Email/Backup/Products/Billing)
    // rendered.
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(1, { timeout: 10_000 });
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    await logout(page);
  });

  test('T12: cashier navigates to /reports directly — redirected or PIN dialog shown', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'cashier');
    await page.goto('/reports');

    const onHome = await page
      .waitForURL(/\/home/, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);

    if (!onHome) {
      // PIN dialog or alertdialog shown on the reports page
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible({ timeout: 8_000 });
    } else {
      expect(onHome).toBe(true);
    }
    await logout(page);
  });

  test('T13: admin logs out — /settings redirects to /login', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'admin');
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });
    await logout(page);

    // After logout, navigating to /settings should redirect to /login
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

test.describe('Removed route redirects (D-10)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(600);
    await page.goto('/');
    await loginAs(page, 'admin');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  // Generic nonexistent paths — NOT real bar-pos route names. `/pos` is a
  // live route (direct-sale checkout, Phase 2) and must never appear here;
  // every bar/pool-parlour-era route this list used to carry (table status,
  // kitchen display, delivery, waitlist) is gone for good (Phase 1) and a
  // rewritten suite shouldn't keep referencing their names as fixture data.
  // These generic literals still prove the same router behavior: the
  // catch-all `<Route path="*">` redirects any unmatched path to /home.
  const removedPaths = ['/nonexistent-page-xyz', '/some-random-path-123', '/this-route-does-not-exist'];

  for (const path of removedPaths) {
    test(`visiting removed route ${path} redirects to /home with the dashboard rendered`, async ({
      page,
    }) => {
      await page.goto(path);
      // The catch-all `<Route path="*">` fires a client-side redirect — assert
      // the resulting URL AND that the HomeDashboard tile grid actually
      // rendered, not just that the URL string changed (no error/404 page
      // ever shows).
      await expect(page).toHaveURL(/\/home$/, { timeout: 10_000 });
      await expect(page.getByRole('button', { name: PAYMENTS_RE })).toBeVisible({
        timeout: 10_000,
      });
    });
  }
});
