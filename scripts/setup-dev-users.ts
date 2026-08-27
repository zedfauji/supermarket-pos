/**
 * setup-dev-users.ts
 *
 * Ensures the four PIN-login E2E staff accounts (admin/manager/cashier/kitchen)
 * exist, matching e2e/helpers/auth.ts's staffForRole(): a `profiles` row plus a
 * linked `auth.users` account whose password equals the profile's `pin` (PINLoginForm
 * calls `supabase.auth.signInWithPassword({ email, password: enteredPin })`).
 * Idempotent — safe to re-run; repairs drift (inactive/deleted/stale password) on
 * accounts that already exist instead of erroring.
 *
 * Usage: cd bar-pos && npx tsx scripts/setup-dev-users.ts
 * Requires: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, plus
 * E2E_<ROLE>_NAME / E2E_<ROLE>_PIN for each role you want seeded.
 *
 * WARNING: Uses service role key — do NOT import this in the renderer.
 */

/* eslint-disable */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// package.json sets "type": "module", so __dirname isn't defined — derive it
// from import.meta.url instead (same pattern as playwright.config.ts).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local from bar-pos/ directory
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // fallback to .env
}

const SUPABASE_URL = process.env['VITE_SUPABASE_URL'] ?? process.env['SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
  process.exit(1);
}

// Service role client — bypasses RLS, and grants the Admin Auth API used to
// create/update auth.users accounts.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) as any;

// Matches e2e/helpers/auth.ts's StaffRole union. Env prefix stays E2E_BARTENDER
// (internal-only, never user-visible — RESEARCH.md Pitfall 5) even though the
// role value itself is now 'cashier'.
const ROLES: { envPrefix: string; role: 'admin' | 'manager' | 'cashier' | 'kitchen' }[] = [
  { envPrefix: 'E2E_ADMIN', role: 'admin' },
  { envPrefix: 'E2E_MANAGER', role: 'manager' },
  { envPrefix: 'E2E_BARTENDER', role: 'cashier' },
  { envPrefix: 'E2E_KITCHEN', role: 'kitchen' },
];

/** name -> deterministic @test.local email, matching the convention already used by other test fixtures in this DB. */
function emailForName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}@test.local`;
}

async function ensureStaffAccount(
  role: 'admin' | 'manager' | 'cashier' | 'kitchen',
  name: string,
  pin: string
): Promise<void> {
  const email = emailForName(name);

  const { data: existing, error: findErr } = await db
    .from('profiles')
    .select('id, is_active, deleted_at, must_change_pin, pin, role, email, locale')
    .eq('name', name)
    .maybeSingle();

  if (findErr) {
    console.error(`Failed to look up profile "${name}":`, findErr);
    process.exit(1);
  }

  if (existing) {
    const id = existing.id as string;

    // Re-sync the auth.users password to the current PIN and make sure the
    // account is confirmed/usable — cheap and idempotent, repairs drift from
    // a prior manual PIN change or a stale auth.users row.
    const { error: authUpdateErr } = await db.auth.admin.updateUserById(id, {
      password: pin,
      email_confirm: true,
    });
    if (authUpdateErr) {
      console.error(`Failed to sync auth password for "${name}":`, authUpdateErr);
      process.exit(1);
    }

    const needsRepair =
      existing.pin !== pin ||
      existing.role !== role ||
      existing.is_active !== true ||
      existing.deleted_at !== null ||
      existing.must_change_pin !== false ||
      existing.locale !== 'en-US' ||
      !existing.email;

    if (needsRepair) {
      const { error: updateErr } = await db
        .from('profiles')
        .update({
          pin,
          role,
          is_active: true,
          deleted_at: null,
          must_change_pin: false,
          // App default is es-MX (D-02), but E2E specs assert on English UI text
          // (e2e/helpers/auth.ts and most e2e/*.spec.ts selectors) — post-login,
          // i18n.changeLanguage(staff.locale) fires, so these test-only accounts
          // pin to en-US regardless of the app-wide default.
          locale: 'en-US',
          email: existing.email ?? email,
        })
        .eq('id', id);
      if (updateErr) {
        console.error(`Failed to repair profile "${name}":`, updateErr);
        process.exit(1);
      }
      console.log(`  repaired: ${name} (${role})`);
    } else {
      console.log(`  ok: ${name} (${role})`);
    }
    return;
  }

  // No profile yet — create the auth.users account first (profiles.id is a
  // foreign key to auth.users.id, not auto-generated), then the profile row.
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    console.error(`Failed to create auth user for "${name}":`, createErr);
    process.exit(1);
  }

  const { error: insertErr } = await db.from('profiles').insert({
    id: created.user.id,
    name,
    pin,
    role,
    email,
    is_active: true,
    must_change_pin: false,
    // See the repair-path comment above: E2E specs assert on English UI text.
    locale: 'en-US',
  });
  if (insertErr) {
    console.error(`Failed to insert profile "${name}":`, insertErr);
    process.exit(1);
  }
  console.log(`  created: ${name} (${role})`);
}

async function main() {
  console.log('Setting up dev/E2E staff accounts...');

  let anyConfigured = false;
  for (const { envPrefix, role } of ROLES) {
    const name = process.env[`${envPrefix}_NAME`];
    const pin = process.env[`${envPrefix}_PIN`];

    if (!name || !pin) {
      console.warn(`  skipping ${role}: ${envPrefix}_NAME / ${envPrefix}_PIN not set in .env.local`);
      continue;
    }

    anyConfigured = true;
    await ensureStaffAccount(role, name, pin);
  }

  if (!anyConfigured) {
    console.error(
      'No E2E_<ROLE>_NAME / E2E_<ROLE>_PIN pairs found in .env.local — nothing to set up.'
    );
    process.exit(1);
  }

  console.log('Dev/E2E staff account setup complete.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
