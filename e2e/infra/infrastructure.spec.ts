import { execSync } from 'node:child_process';
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '../fixtures';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getMigrationList } from '../helpers/supabase';

const BAR_POS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test.describe('Infrastructure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('All migrations applied (or CLI lists them)', async () => {
    requireIntegrationEnv();
    const files = readdirSync(path.join(BAR_POS, 'supabase', 'migrations')).filter(f => f.endsWith('.sql'));
    const list = await getMigrationList();
    if (list.length > 0 && list.every(x => !x.applied)) {
      test.skip(true, 'Supabase CLI did not report applied migrations (link project or run locally).');
    }
    const map = new Map(list.map(x => [x.name, x.applied]));
    const pending = files.filter(f => map.get(f) !== true);
    expect(pending, `Unapplied migrations: ${pending.join(', ')}`).toEqual([]);
  });

  test('Edge functions list includes process-payment', async () => {
    let out = '';
    try {
      out = execSync('npx supabase functions list', {
        cwd: BAR_POS,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 90_000,
        shell: true,
      });
    } catch {
      test.skip(true, 'Supabase CLI not linked or not available — cannot list remote functions.');
    }
    expect(out.toLowerCase()).toContain('process-payment');
    const wantsReceipt = out.toLowerCase().includes('get-receipt-data') || out.toLowerCase().includes('send-receipt-email');
    expect(wantsReceipt).toBe(true);
  });
});
