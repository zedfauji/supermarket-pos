import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

import { recordAudit } from '../_shared/audit.ts';

const BodySchema = z.object({
  backupId: z.string().uuid(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Snapshot = {
  settings?: Array<{ key: string; value: unknown; updated_by?: string | null }>;
  categories?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
  modifiers?: Array<Record<string, unknown>>;
  product_modifiers?: Array<Record<string, unknown>>;
};

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: { code: 'CONFIG', message: 'Server misconfigured' } }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || profile?.role !== 'admin') {
    return json({ ok: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await req.json();
  } catch {
    return json({ ok: false, error: { code: 'INVALID_JSON', message: 'Body must be JSON' } }, 400);
  }
  const parsed = BodySchema.safeParse(bodyRaw);
  if (!parsed.success) {
    return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid backup id' } }, 400);
  }

  const { data: backup, error: backupError } = await serviceClient
    .from('settings_backups')
    .select('snapshot')
    .eq('id', parsed.data.backupId)
    .single();

  if (backupError || !backup) {
    return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Backup not found' } }, 404);
  }

  const snapshot = (backup.snapshot ?? {}) as Snapshot;
  const categories = snapshot.categories ?? [];
  const products = snapshot.products ?? [];
  const modifiers = snapshot.modifiers ?? [];
  const productModifiers = snapshot.product_modifiers ?? [];
  const settingsRows = snapshot.settings ?? [];

  if (categories.length > 0) {
    const { error } = await serviceClient.from('categories').upsert(categories, { onConflict: 'id' });
    if (error) return json({ ok: false, error: { code: 'RESTORE_FAILED', message: error.message } }, 500);
  }
  if (modifiers.length > 0) {
    const { error } = await serviceClient.from('modifiers').upsert(modifiers, { onConflict: 'id' });
    if (error) return json({ ok: false, error: { code: 'RESTORE_FAILED', message: error.message } }, 500);
  }
  if (products.length > 0) {
    const { error } = await serviceClient.from('products').upsert(products, { onConflict: 'id' });
    if (error) return json({ ok: false, error: { code: 'RESTORE_FAILED', message: error.message } }, 500);
  }

  await serviceClient.from('product_modifiers').delete().neq('product_id', '00000000-0000-0000-0000-000000000000');
  if (productModifiers.length > 0) {
    const { error } = await serviceClient
      .from('product_modifiers')
      .upsert(productModifiers, { onConflict: 'product_id,modifier_id' });
    if (error) return json({ ok: false, error: { code: 'RESTORE_FAILED', message: error.message } }, 500);
  }

  if (settingsRows.length > 0) {
    const settingsPayload = settingsRows.map(row => ({
      key: row.key,
      value: row.value,
      updated_by: user.id,
    }));
    const { error } = await serviceClient.from('settings').upsert(settingsPayload, { onConflict: 'key' });
    if (error) return json({ ok: false, error: { code: 'RESTORE_FAILED', message: error.message } }, 500);
  }

  await serviceClient
    .from('settings_backups')
    .update({
      restored_at: new Date().toISOString(),
      restored_by: user.id,
    })
    .eq('id', parsed.data.backupId);

  await recordAudit(serviceClient, {
    action: 'settings.update',
    entityType: 'settings',
    entityId: null,
    before: null,
    after: {
      categories: categories.length,
      products: products.length,
      settings: settingsRows.length,
    },
    source: 'edge',
    actorId: user.id,
  });

  return json({ ok: true });
});
