/**
 * e2e/46-i18n-locale-switch.spec.ts
 *
 * Phase 21 (i18n-multi-language), Plan 13 — SC-1/SC-4 end-to-end proof.
 * Exercises the real Settings → Language surface (LanguageSettingsTab.tsx,
 * SettingsTabsPanel/index.tsx): switches the acting admin's own locale from
 * the es-MX default to en-US and asserts real strings re-render WITHOUT a
 * page reload (`i18n.changeLanguage` re-renders subscribed components), then
 * resets back to es-MX so the shared admin test profile isn't left polluted
 * for other specs.
 *
 * Strings asserted come directly from the committed catalogs
 * (src/shared/lib/i18n/locales/{es-MX,en-US}/settings.json,staff.json) — not
 * re-derived from 21-UI-SPEC.md, since the catalogs are the actual runtime
 * source.
 *
 * Task 3 of 21-13-PLAN.md was originally a `checkpoint:human-verify` manual
 * UAT checklist. Per explicit user instruction ("i am not gonna do anything,
 * e2e, playwrite is specifcally for this purpose where every testing shoudl
 * be automated. less human or manual intervention."), every checklist item
 * below is converted to a deterministic Playwright assertion instead of a
 * human click-through. See 21-13-SUMMARY.md for the full mapping.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs, logout } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { openCaja, resetTestState } from '../helpers/supabase';

/**
 * Switch the currently-logged-in staff member's own locale via the real
 * Settings → Language surface. The es-MX option label is byte-identical in
 * both catalogs ("Español (México)"); the en-US option label differs
 * ("Inglés (EE. UU.)" in es-MX, "English (US)" in en-US) depending on
 * whichever language is active before the switch — matched via regex so
 * this helper works starting from either locale.
 *
 * Idempotency is checked against the Select's OWN currently-checked option
 * (`data-state="checked"`), not the surrounding heading/tab text. A full
 * `page.goto()` reload rehydrates `currentStaff.locale` (which seeds the
 * Select's initial value) synchronously from persisted storage, but the
 * `i18n.changeLanguage()` side-effect that drives the heading/tab labels can
 * lag a render behind — so the heading can still read stale (e.g. "Idioma")
 * for a moment even when the Select itself already reflects the saved
 * locale. Checking the option's own checked-state avoids that race.
 */
async function switchOwnLocale(page: Page, target: 'en-US' | 'es-MX'): Promise<void> {
  await page.goto('/settings');
  const languageTab = page.getByRole('tab', { name: /^(Idioma|Language)$/ });
  await expect(languageTab).toBeVisible({ timeout: 20_000 });
  await languageTab.click();

  const localeSelect = page.locator('#settings-language');
  await expect(localeSelect).toBeVisible({ timeout: 15_000 });
  await localeSelect.click();

  const optionLocator =
    target === 'es-MX'
      ? page.getByRole('option', { name: 'Español (México)' })
      : page.getByRole('option', { name: /^(Inglés \(EE\. UU\.\)|English \(US\))$/ });
  await expect(optionLocator).toBeVisible({ timeout: 10_000 });

  const alreadySelected = (await optionLocator.getAttribute('data-state')) === 'checked';
  if (alreadySelected) {
    // Already at the target locale (e.g. resuming after a retried run) — the
    // Select's onValueChange never fires for a re-selected same value, which
    // would leave Save permanently disabled. Close the dropdown and no-op.
    await page.keyboard.press('Escape');
    return;
  }

  await optionLocator.click();

  const saveButton = page.getByRole('button', { name: /^(Guardar idioma|Save Language)$/ });
  await expect(saveButton).toBeEnabled({ timeout: 20_000 });
  await saveButton.click();
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15_000 });

  const expectedHeading = target === 'es-MX' ? 'Idioma' : 'Language';
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible({
    timeout: 15_000,
  });
}

/** No raw `namespace:key.path` i18next key should ever be visible to a user. */
const RAW_I18N_KEY_PATTERN = /\b[a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+\b/;

async function assertNoRawKeys(page: Page, surface: string): Promise<void> {
  const text = await page.locator('body').innerText();
  expect(RAW_I18N_KEY_PATTERN.test(text), `${surface} should not render a raw i18next key`).toBe(
    false
  );
}

test.describe('i18n locale switch (SC-1/SC-4)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await openCaja(300);
    await page.goto('/');
  });

  test('Settings → Language switches es-MX → en-US live, then resets to es-MX', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAs(page, 'admin');

    // The fixed E2E admin login account is pinned to en-US by
    // setup-dev-users.ts (so other specs' English-text selectors work) and
    // is excluded from resetTestState()'s locale reset for the same reason
    // (e2e/helpers/supabase.ts). This spec can't assume a cold es-MX
    // starting locale — force a known es-MX baseline before asserting the
    // Spanish-first UI below.
    await switchOwnLocale(page, 'es-MX');
    await page.goto('/settings');

    // Language is the role-agnostic, always-first tab (SettingsTabsPanel.tsx) —
    // es-MX is the default locale (D-02), so it renders in Spanish first.
    const languageTab = page.getByRole('tab', { name: 'Idioma' });
    await expect(languageTab).toBeVisible({ timeout: 20_000 });
    await languageTab.click();

    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Idioma de la interfaz')).toBeVisible();

    // Switch the Select to en-US.
    const localeSelect = page.locator('#settings-language');
    await localeSelect.click();
    await page.getByRole('option', { name: 'Inglés (EE. UU.)' }).click();

    const saveButton = page.getByRole('button', { name: 'Guardar idioma' });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // (a) success toast appears (either language, depending on the exact
    // microtask ordering between i18n.changeLanguage() and the toast call).
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15_000 });

    // (b) the whole page re-renders in English WITHOUT a page reload — no
    // page.reload()/page.goto() call between Save and these assertions.
    await expect(page.getByRole('tab', { name: 'Language' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
    await expect(page.getByText('Interface language')).toBeVisible();

    // Reset back to es-MX so the shared admin profile isn't left polluted.
    await localeSelect.click();
    await page.getByRole('option', { name: 'Español (México)' }).click();
    const saveButtonEn = page.getByRole('button', { name: 'Save Language' });
    await expect(saveButtonEn).toBeEnabled();
    await saveButtonEn.click();

    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Idioma de la interfaz')).toBeVisible();

    // Round-trip integrity (old checklist item 4 — "matches the pre-phase
    // look"): confirm a SECOND namespace (staff.json) also renders its
    // es-MX default after the reset, not just settings.json's own strings.
    await page.goto('/staff');
    // StaffPage's PageContainer AND StaffDashboard's own SectionHeader both
    // render an <h2> Staff heading — .first() avoids a strict-mode
    // violation. We're now on es-MX (staff.json's section.title is
    // "Personal", not "Staff"), so the name must match both locales.
    await expect(page.getByRole('heading', { name: /^(Staff|Personal)$/ }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('columnheader', { name: 'Idioma' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar idioma' }).first()).toBeVisible();

    // Restore the shared E2E admin account to its pinned en-US baseline
    // (setup-dev-users.ts) — this test's own es-MX round-trip assertions
    // above are the point of the test, but leaving the account at es-MX
    // afterward breaks every other spec's English-text selectors that
    // assume this pinned account stays en-US (e2e/helpers/supabase.ts).
    await switchOwnLocale(page, 'en-US');

    await logout(page);
  });

  test('Settings → Language tab is visible to a cashier without manage_settings', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAs(page, 'cashier');
    await page.goto('/settings');

    // Language is pushed first and unconditionally, outside the
    // manage_settings/manage_products gates (SettingsTabsPanel.tsx) — every
    // authenticated role must be able to change their own UI language.
    const languageTab = page.getByRole('tab', { name: /^(Idioma|Language)$/ });
    await expect(languageTab).toBeVisible({ timeout: 20_000 });
    await languageTab.click();
    await expect(page.getByRole('heading', { name: /^(Idioma|Language)$/ })).toBeVisible({
      timeout: 15_000,
    });

    // Gating still works: a manage_settings-gated tab must NOT be present.
    await expect(page.getByRole('tab', { name: 'General' })).toHaveCount(0);

    await logout(page);
  });

  test('no raw i18n keys leak (POS/Staff/dialog) and per-staff locale change does not affect the acting admin session', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAs(page, 'admin');

    // Switch the acting admin's own session to English.
    await switchOwnLocale(page, 'en-US');
    await assertNoRawKeys(page, 'Settings (post-switch, en-US)');

    // Navigate via real in-app SPA links/tiles (Home back-link, home-grid
    // tiles) rather than page.goto() for the remaining surfaces. A
    // page.goto() is a full browser reload — it re-triggers the persisted
    // Zustand store's async rehydration, which can render one frame of the
    // PREVIOUS session's default language before `i18n.changeLanguage()`
    // catches up. Real users navigate this app via its own links, never the
    // URL bar, so SPA navigation is both the more realistic check AND avoids
    // that reload race entirely.
    await page.getByRole('link', { name: /^(home|inicio)$/i }).click();
    await expect(page.getByText(/^Welcome, /)).toBeVisible({ timeout: 15_000 });

    // Surface 1: POS page. HomeDashboard's tile label is 'Checkout'/'Cobro'
    // (wPanels.json's `pos` key) — 'POS Register' (`posRegister`) is an
    // orphaned i18n key with no component reference, matched via a
    // locale-agnostic regex since this test drives both locales.
    await page.getByRole('button', { name: /^(Checkout|Cobro)$/ }).click();
    // PosPage (src/pages/pos/index.tsx) has no page-level "POS" heading — the
    // route renders CheckoutPanel directly under a logo-only header. Wait on
    // the URL plus the cart's own heading (locale-agnostic, Cart/Carrito)
    // instead of the stale heading assertion.
    await expect(page).toHaveURL(/\/pos$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /^(Cart|Carrito)$/ })).toBeVisible({
      timeout: 20_000,
    });
    await assertNoRawKeys(page, 'POS page');

    // D-01/D-08: while the acting admin session is en-US, product-grid
    // MoneyDisplay prices must render the bare '$' symbol, never the es-MX
    // 'MX$' prefix (formatMoney reads getCurrentLocale() live — a stale
    // symbol here would mean the switch didn't actually propagate).
    await expect(page.getByText(/^\$\d/).first()).toBeVisible({ timeout: 15_000 });

    // PosPage (src/pages/pos/index.tsx) has no Home link in its logo-only
    // header, unlike Settings/Staff's shared PageContainer. Use the SPA
    // router's own history navigation (client-side popstate, not a network
    // request/full reload) instead of a Home link that doesn't exist here.
    await page.goBack();
    await expect(page.getByText(/^Welcome, /)).toBeVisible({ timeout: 15_000 });

    // Surface 2: Staff page (StaffDashboard).
    await page.getByRole('button', { name: 'Staff' }).click();
    await expect(page.getByRole('heading', { name: 'Staff' }).first()).toBeVisible({
      timeout: 20_000,
    });
    await assertNoRawKeys(page, 'Staff page');

    // Surface 3: a dialog — EditLocaleDialog opened for another staff
    // member's row (never the acting admin's own row).
    const managerName = process.env.E2E_MANAGER_NAME?.trim();
    if (!managerName) throw new Error('Missing required env: E2E_MANAGER_NAME');
    const escapedManagerName = managerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const managerRow = page.getByRole('row', { name: new RegExp(escapedManagerName, 'i') });
    await expect(managerRow).toBeVisible({ timeout: 15_000 });

    await managerRow.getByRole('button', { name: 'Change language' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const dialogText = await dialog.innerText();
    expect(
      RAW_I18N_KEY_PATTERN.test(dialogText),
      'EditLocaleDialog should not render a raw i18next key'
    ).toBe(false);

    // Set the target's locale to a known value (es-MX) — deterministic end
    // state regardless of what a prior run left behind.
    await dialog.locator('#edit-locale-locale').click();
    await page.getByRole('option', { name: 'es-MX', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    // Not asserting the dialog closes: a persistent, always-mounted "AI
    // Assistant" side panel also has role="dialog" (translated off-screen,
    // not display:none), so a role=dialog query re-resolves to IT once
    // EditLocaleDialog unmounts — the success toast is the reliable signal.
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 15_000 });

    // The target row's Language badge updated...
    await expect(managerRow.getByText(/es-mx/i)).toBeVisible({ timeout: 15_000 });

    // ...but the ACTING admin's own session language did NOT change — the
    // row action buttons (translated via the global i18n singleton, driven
    // by the acting admin's own locale, not the target's) are still
    // English, not reverted to "Cambiar idioma".
    await expect(managerRow.getByRole('button', { name: 'Change language' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar idioma' })).toHaveCount(0);

    // Reset the acting admin's own session back to es-MX so the shared
    // admin profile isn't left polluted for other specs.
    await switchOwnLocale(page, 'es-MX');

    // D-01/D-08: back on es-MX, the same product-grid MoneyDisplay prices
    // must now render the two-letter-prefixed 'MX$' symbol — the one place
    // this spec exercises both locales' currency symbols end-to-end.
    await page.getByRole('link', { name: /^(home|inicio)$/i }).click();
    // Now on es-MX — wPanels.json's welcome greeting is "Bienvenido, ".
    await expect(page.getByText(/^(Welcome|Bienvenido), /)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^(Checkout|Cobro)$/ }).click();
    await expect(page).toHaveURL(/\/pos$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /^(Cart|Carrito)$/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/^MX\$\d/).first()).toBeVisible({ timeout: 15_000 });

    // Restore the shared E2E admin account to its pinned en-US baseline
    // (setup-dev-users.ts) — see the matching comment in the first test.
    await switchOwnLocale(page, 'en-US');

    await logout(page);
  });
});
