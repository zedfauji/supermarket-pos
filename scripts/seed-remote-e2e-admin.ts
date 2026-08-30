/**
 * Idempotent ops script: seeds (or confirms) the dedicated, permanent E2E
 * remote-smoke fixture admin account on the remote Supabase project.
 *
 * This account is used exclusively by `e2e/remote-smoke/remote-backend-smoke.spec.ts`
 * to authenticate against the remote project — never the real store owner's
 * own admin account ("Vinty Owner"). See
 * .planning/phases/20-store-deployment-installer/20-03-PLAN.md for the full
 * rationale.
 *
 * Usage: npx tsx scripts/seed-remote-e2e-admin.ts
 * Requires: .env.remote-e2e (git-ignored) with VITE_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, E2E_REMOTE_ADMIN_NAME, E2E_REMOTE_ADMIN_PIN.
 */
import { config } from 'dotenv';

config({ path: '.env.remote-e2e' });

// getServiceClient()/seedNewStaffMember() read process.env lazily at call
// time (not at import time), so loading .env.remote-e2e above — before these
// functions are ever invoked — is sufficient even though the import
// statement itself is hoisted above this call.
import { getServiceClient, seedNewStaffMember } from '../e2e/helpers/supabase';

async function main(): Promise<void> {
  const name = process.env.E2E_REMOTE_ADMIN_NAME;
  const pin = process.env.E2E_REMOTE_ADMIN_PIN;
  if (!name || !pin) {
    throw new Error(
      'Missing E2E_REMOTE_ADMIN_NAME / E2E_REMOTE_ADMIN_PIN — set them in .env.remote-e2e'
    );
  }

  const admin = getServiceClient();
  const { data: existing, error } = await admin
    .from('profiles')
    .select('id, role')
    .eq('name', name)
    .maybeSingle();
  if (error) {
    throw new Error(`seed-remote-e2e-admin: lookup failed – ${error.message}`);
  }

  if (existing) {
    console.log(`already exists, skipping (id: ${existing.id as string}, role: ${existing.role as string})`);
    return;
  }

  const userId = await seedNewStaffMember(name, pin, 'admin');
  console.log(`created fixture admin (id: ${userId})`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
