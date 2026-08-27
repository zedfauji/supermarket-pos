/**
 * E2E spec: AI vision pipeline (agent-chat) — confirm-then-import flow
 *
 * Requirement: TEST-02 (17-17 Task 1) — this feature had zero e2e coverage
 * across the entire original 50-file suite prior to this plan.
 *
 * Covers the pipeline's UI/DB wiring only (upload -> extraction preview ->
 * confirm -> products created in Postgres). Extraction *accuracy* is out of
 * scope (per CLAUDE.md, still v2/Beta work) — the Anthropic call is always
 * mocked via page.route() against the agent-proxy edge function, never a
 * real external API call from a test.
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

const IMPORTED_PRODUCT_CSV = 'E2E Agent Import CSV Product';
const IMPORTED_PRODUCT_IMAGE = 'E2E Agent Import Image Product';

/**
 * FileDropZone only accepts drag-and-drop (no <input type="file">), so a real
 * file input can't be used here. Build a DataTransfer client-side and dispatch
 * a native 'drop' event, mirroring what a real browser drag-and-drop produces.
 */
async function dropFileOntoAgent(
  page: Page,
  fileName: string,
  mimeType: string,
  content: string
): Promise<void> {
  const dataTransfer = await page.evaluateHandle(
    ({ fileName, mimeType, content }) => {
      const dt = new DataTransfer();
      const file = new File([content], fileName, { type: mimeType });
      dt.items.add(file);
      return dt;
    },
    { fileName, mimeType, content }
  );
  await page.getByTestId('agent-file-dropzone').dispatchEvent('drop', { dataTransfer });
}

async function cleanupImportedProducts(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('products').delete().in('name', [IMPORTED_PRODUCT_CSV, IMPORTED_PRODUCT_IMAGE]);
}

test.describe('AI vision pipeline (agent-chat)', () => {
  test.beforeEach(async ({ page }) => {
    requireIntegrationEnv();
    await resetTestState();
    await cleanupImportedProducts();
    await page.goto('/');
    await loginAs(page, 'manager');
  });

  test.afterEach(async () => {
    await cleanupImportedProducts();
  });

  test('CSV upload: extraction preview -> confirm -> product created (no external API call)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /open ai assistant/i }).click();
    await expect(page.getByRole('dialog', { name: /ai assistant/i })).toBeVisible();

    // CSV parsing is fully local (csv-parser.ts) — never touches agent-proxy.
    await dropFileOntoAgent(
      page,
      'products.csv',
      'text/csv',
      `name,price\n${IMPORTED_PRODUCT_CSV},45.5\n`
    );

    const preview = page.getByTestId('agent-import-preview');
    await expect(preview.getByText(IMPORTED_PRODUCT_CSV)).toBeVisible();
    await preview.getByRole('button', { name: /confirm import/i }).click();
    await expect(page.getByText(/1 product imported successfully/i)).toBeVisible();

    const admin = getServiceClient();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('products')
          .select('id, base_price')
          .eq('name', IMPORTED_PRODUCT_CSV)
          .maybeSingle();
        return data;
      })
      .toMatchObject({ base_price: 45.5 });
  });

  test('Image upload: mocked Anthropic extraction -> confirm -> product created', async ({
    page,
  }) => {
    // Mock the agent-proxy edge function — the client never calls the
    // real Anthropic API directly (see src/shared/lib/agent/vision.ts).
    await page.route('**/functions/v1/agent-proxy', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg_e2e_mock',
          type: 'message',
          role: 'assistant',
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text: JSON.stringify([{ name: IMPORTED_PRODUCT_IMAGE, price: 62 }]),
            },
          ],
        }),
      });
    });

    await page.getByRole('button', { name: /open ai assistant/i }).click();
    await expect(page.getByRole('dialog', { name: /ai assistant/i })).toBeVisible();

    // Image bytes are irrelevant — the extraction network response is mocked above.
    await dropFileOntoAgent(page, 'invoice.png', 'image/png', 'not-a-real-png');

    const preview = page.getByTestId('agent-import-preview');
    await expect(preview.getByText(IMPORTED_PRODUCT_IMAGE)).toBeVisible();
    await preview.getByRole('button', { name: /confirm import/i }).click();
    await expect(page.getByText(/1 product imported successfully/i)).toBeVisible();

    const admin = getServiceClient();
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('products')
          .select('id, base_price')
          .eq('name', IMPORTED_PRODUCT_IMAGE)
          .maybeSingle();
        return data;
      })
      .toMatchObject({ base_price: 62 });
  });
});
