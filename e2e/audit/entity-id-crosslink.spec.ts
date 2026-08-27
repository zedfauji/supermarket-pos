/**
 * E2E: Entity ID cross-link read side (QA-03, D-03/D-04).
 *
 * Proves the destination half of the payment/staff cross-linking work
 * directly by URL, independent of whether the source-side links
 * (EntityIdCell in AuditLogTable/EditHistoryTable/Reports) exist yet:
 *  1. /payments?id={paymentId} seeds PaymentPane's ID filter and shows
 *     only the matching payment row.
 *  2. /staff?id={staffId} highlights the matching staff row (via
 *     DataTable's existing getRowClassName prop) and scrolls it into view.
 */

import { expect, test } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState, seedClosedTab } from '../helpers/supabase';

test.describe('Entity ID cross-link read side (D-03/D-04)', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
  });

  test('/payments?id= seeds the filter and shows the matching payment row', async ({ page }) => {
    test.setTimeout(60_000);

    const db = getServiceClient();
    const tabId = await seedClosedTab();
    const { data: paymentRow } = await db
      .from('payments')
      .select('id')
      .eq('tab_id', tabId)
      .single();
    if (!paymentRow) throw new Error('seed lookup failed: no payment row for seeded tab');
    const paymentId = paymentRow.id as string;

    await loginAs(page, 'manager');
    await gotoAuthed(page, `/payments?id=${paymentId}`);

    await expect(page.getByTestId(`payment-row-${paymentId}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/filter by id/i)).toHaveValue(paymentId);
  });

  test('/staff?id= highlights and scrolls the matching staff row into view', async ({ page }) => {
    test.setTimeout(60_000);

    const db = getServiceClient();
    const { data: staffRow } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'cashier')
      .limit(1)
      .single();
    if (!staffRow) throw new Error('staff lookup failed: no cashier profile found');
    const staffId = staffRow.id as string;

    await loginAs(page, 'manager');
    await gotoAuthed(page, `/staff?id=${staffId}`);

    const highlightedRow = page.locator('tr.bg-accent\\/40');
    await expect(highlightedRow).toBeVisible({ timeout: 15_000 });
    await expect(highlightedRow).toBeInViewport();
  });
});
