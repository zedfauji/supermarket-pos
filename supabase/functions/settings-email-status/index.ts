import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

type ErrorBody = { ok: false; error: { code: string; message: string } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(status: number, code: string, message: string): Response {
  return json({ ok: false, error: { code, message } } satisfies ErrorBody, status);
}

Deno.serve(async req => {
  if (req.method !== 'POST') return err(405, 'METHOD_NOT_ALLOWED', 'POST only');

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return err(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return err(500, 'CONFIG', 'Server misconfigured');
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return err(401, 'UNAUTHORIZED', 'Invalid session');
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendConfigured = typeof resendApiKey === 'string' && resendApiKey.length > 0;

  return json({ ok: true, resendConfigured });
});
