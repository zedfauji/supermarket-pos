import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getServiceClient } from './supabase';

type Role = 'cashier' | 'manager' | 'admin' | 'kitchen';

function getUrl(): string {
  const url = process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing VITE_SUPABASE_URL');
  return url;
}

function getAnonKey(): string {
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new Error('Missing VITE_SUPABASE_ANON_KEY');
  return key;
}

/** Creates a temporary signed-in client for RLS-denial assertions. Call cleanup after use. */
export async function createRoleScopedClient(
  role: Role,
  label: string
): Promise<{ client: SupabaseClient; userId: string; cleanup: () => Promise<void> }> {
  const stamp = Date.now();
  const email = `__e2e_rls_${label}_${stamp}@test.local`;
  const password = 'TestRls123!';
  const admin = getServiceClient();

  const { data: authData, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !authData.user) {
    throw new Error(
      `createRoleScopedClient: user creation failed - ${createError?.message ?? 'no user returned'}`
    );
  }

  const userId = authData.user.id;
  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId,
    name: `__e2e_rls_${label}__`,
    email,
    role,
    pin: String(100000 + (stamp % 900000)),
    is_active: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`createRoleScopedClient: profile upsert failed - ${profileError.message}`);
  }

  const client = createClient(getUrl(), getAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `e2e-rls-${label}-${stamp}`,
    },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`createRoleScopedClient: sign-in failed - ${signInError.message}`);
  }

  return {
    client,
    userId,
    cleanup: async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`createRoleScopedClient: cleanup failed - ${error.message}`);
    },
  };
}
