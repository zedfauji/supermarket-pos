import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const BodySchema = z.object({
  email: z.string().trim().email(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!supabaseUrl || !anonKey || !resendApiKey) {
    return json({ ok: false, error: { code: 'CONFIG', message: 'Server misconfigured' } }, 500);
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
    return json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError || !profile || profile.role !== 'admin') {
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
    return json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid email' } }, 400);
  }

  const { data: emailSetting } = await userClient
    .from('settings')
    .select('value')
    .eq('key', 'email_receipts')
    .maybeSingle();

  const value = emailSetting?.value as { fromEmail?: unknown } | null;
  const fromEmailSetting =
    value != null && typeof value.fromEmail === 'string' ? value.fromEmail.trim() : '';
  const fromEmailEnv = (Deno.env.get('RECEIPT_FROM_EMAIL') ?? '').trim();
  const fromEmail = fromEmailSetting || fromEmailEnv;
  if (fromEmail.length === 0) {
    return json(
      { ok: false, error: { code: 'CONFIG', message: 'No from-email configured in settings or env' } },
      500
    );
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [parsed.data.email],
      subject: 'POS settings test email',
      text: 'This is a test email from your POS settings page.',
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return json(
      {
        ok: false,
        error: {
          code: 'RESEND_ERROR',
          message: detail.slice(0, 500) || `Resend returned ${String(response.status)}`,
        },
      },
      502
    );
  }

  return json({ ok: true });
});
