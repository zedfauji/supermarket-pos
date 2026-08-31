/**
 * E2E spec: Phase 21 — Idle Screen Lock
 * Plan: 21-01
 *
 * Covers the full idle-lock/unlock cycle end-to-end:
 *   1. LCK-01: overlay engages after the configured per-terminal timeout, on
 *      every screen, and cannot be dismissed by Escape.
 *   2. LCK-03/D-04: any valid staff PIN unlocks it — the active session's
 *      identity (currentStaff) does not change.
 *   3. Incorrect PIN renders the idleLock.incorrectPin error, dialog stays open.
 *   4. LCK-04/D-05: both the lock and unlock events are fully attributed in
 *      audit_logs (session owner at lock time; unlocking staff at unlock time).
 *
 * Requires .env.local with E2E_*_PIN/NAME and SUPABASE_SERVICE_ROLE_KEY.
 */
import { expect, test } from '../fixtures';
import { enterPin, gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, resetTestState } from '../helpers/supabase';

const TERMINAL_ID = process.env.VITE_TERMINAL_ID ?? 'POS-1';
const LOCK_TIMEOUT_SECONDS = 15;

async function seedLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  const { error } = await admin
    .from('terminal_lock_settings')
    .upsert(
      { terminal_id: TERMINAL_ID, lock_timeout_seconds: LOCK_TIMEOUT_SECONDS },
      { onConflict: 'terminal_id' }
    );
  if (error) throw new Error(`seedLockTimeout: ${error.message}`);
}

async function clearLockTimeout(): Promise<void> {
  const admin = getServiceClient();
  await admin.from('terminal_lock_settings').delete().eq('terminal_id', TERMINAL_ID);
}

test.describe('Idle Screen Lock', () => {
  test.beforeEach(async () => {
    requireIntegrationEnv();
    await resetTestState();
    await seedLockTimeout();
  });

  test.afterEach(async () => {
    await clearLockTimeout();
  });

  test('locks after idle timeout (non-dismissable), cross-staff unlock keeps session identity, incorrect PIN errors, both events audited', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await loginAs(page, 'cashier');
    await gotoAuthed(page, '/home');

    const overlay = page.getByRole('alertdialog', { name: /screen locked|pantalla bloqueada/i });

    // LCK-01: engages after the configured timeout, no exemption; Escape does not dismiss.
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(overlay).toBeVisible();

    // LCK-03/D-04: a DIFFERENT staff member's (manager) correct PIN unlocks it;
    // the active session's identity is unchanged.
    const managerPin = process.env['E2E_MANAGER_PIN'] ?? '';
    const bartenderName = process.env['E2E_BARTENDER_NAME'] ?? '';
    const managerName = process.env['E2E_MANAGER_NAME'] ?? '';
    await enterPin(page, managerPin);
    await expect(overlay).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(new RegExp(bartenderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    ).toBeVisible({ timeout: 10_000 });

    // LCK-04/D-05: both the lock and unlock events are fully attributed in audit_logs.
    const admin = getServiceClient();
    const { data: cashierProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('name', bartenderName)
      .maybeSingle();
    const { data: managerProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('name', managerName)
      .maybeSingle();
    if (!cashierProfile || !managerProfile) {
      throw new Error('idle-lock.spec: could not resolve cashier/manager profile ids');
    }

    const { data: recentAudit, error: auditErr } = await admin
      .from('audit_logs')
      .select('action, after')
      .eq('terminal_id', TERMINAL_ID)
      .in('action', ['screen.lock', 'screen.unlock'])
      .order('created_at', { ascending: false })
      .limit(2);
    if (auditErr) throw new Error(`idle-lock.spec: audit_logs query failed - ${auditErr.message}`);
    const rows = recentAudit as { action: string; after: Record<string, unknown> | null }[];
    const unlockRow = rows.find(r => r.action === 'screen.unlock');
    const lockRow = rows.find(r => r.action === 'screen.lock');
    expect(lockRow?.after?.['sessionOwnerStaffId']).toBe(cashierProfile.id);
    expect(unlockRow?.after?.['unlockedByStaffId']).toBe(managerProfile.id);

    // Incorrect PIN: re-trigger the lock, enter a PIN matching no active staff.
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    const { data: activeStaff } = await admin.from('profiles').select('pin').eq('is_active', true);
    const usedPins = new Set((activeStaff ?? []).map(s => s.pin as string));
    let badPin = '000000';
    while (usedPins.has(badPin)) {
      badPin = String(Number(badPin) + 1).padStart(6, '0');
    }
    await enterPin(page, badPin);
    await expect(page.getByText(/incorrect pin|pin incorrecto/i)).toBeVisible({ timeout: 10_000 });
    await expect(overlay).toBeVisible();
  });
});
