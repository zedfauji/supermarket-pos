import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const BodySchema = z.object({
  label: z.string().trim().min(1).max(120),
});

// Missing on this function until now — every other edge function in this
// project sets these, and their absence means every real browser call fails
// at CORS preflight before ever reaching this code.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
    return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Backup label is required' } }, 400);
  }

  const [settingsRes, categoriesRes, productsRes, modifiersRes, productModifiersRes] = await Promise.all([
    serviceClient.from('settings').select('*').order('key'),
    serviceClient.from('categories').select('*').order('sort_order'),
    serviceClient.from('products').select('*').order('name'),
    serviceClient.from('modifiers').select('*').order('sort_order'),
    serviceClient.from('product_modifiers').select('*'),
  ]);

  if (settingsRes.error || categoriesRes.error || productsRes.error || modifiersRes.error || productModifiersRes.error) {
    return json({ ok: false, error: { code: 'DB_ERROR', message: 'Could not collect backup data' } }, 500);
  }

  const snapshot = {
    settings: settingsRes.data,
    categories: categoriesRes.data,
    products: productsRes.data,
    modifiers: modifiersRes.data,
    product_modifiers: productModifiersRes.data,
  };

  const { data: backup, error: backupError } = await serviceClient
    .from('settings_backups')
    .insert({
      label: parsed.data.label,
      snapshot,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (backupError || !backup) {
    return json({ ok: false, error: { code: 'DB_ERROR', message: 'Could not create backup record' } }, 500);
  }

  return json({ ok: true, backupId: backup.id });
});
