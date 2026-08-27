/**
 * E2E: Suppliers list panel loading + error states (QA-01).
 *
 * Verifies SupplierListPanel shows a visible loading skeleton while
 * useSuppliers() is fetching, and a role="alert" error message when the
 * fetch fails — instead of silently rendering blank in either case.
 */

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { resetTestState } from '../helpers/supabase';

test.describe('Suppliers loading/error states', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('shows a loading skeleton while the suppliers fetch is slow', async ({ page }) => {
    test.setTimeout(60_000);

    await page.route('**/rest/v1/suppliers*', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.continue();
    });

    await loginAs(page, 'manager');
    await gotoAuthed(page, '/suppliers');

    await expect(page.getByRole('status').first()).toBeVisible({ timeout: 2_000 });
  });

  test('shows a role="alert" error message when the suppliers fetch fails', async ({ page }) => {
    test.setTimeout(60_000);

    await page.route('**/rest/v1/suppliers*', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await loginAs(page, 'manager');
    await gotoAuthed(page, '/suppliers');

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  });
});
