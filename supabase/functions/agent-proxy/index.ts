// Supabase Edge Function — agent-proxy (Deno)
//
// Phase 06 (SEC-01): thin, Bearer-authenticated pass-through proxy to the
// Anthropic Messages API. D-01 (locked): this is NOT a server-side agent
// loop — brain.ts's multi-turn tool loop and vision.ts/brain.ts's RAG
// context stay entirely client-side. This function only ever forwards one
// messages.create-shaped request and returns the raw Anthropic response.
//
// D-03 (locked): no manager/admin role check beyond Bearer-JWT auth — any
// authenticated staff (cashier+) may call this, matching pre-phase behavior.
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Forwarded opaquely (D-01's thin-proxy framing) — do not deeply validate
// message/tool internals or the model string.
const BodySchema = z.object({
  model: z.string(),
  max_tokens: z.number().int().positive(),
  system: z.string().optional(),
  tools: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only' } }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ success: false, error: { code: 'CONFIG', message: 'Server misconfigured' } }, 500);
  }

  // Verify the JWT via a direct HTTP call to /auth/v1/user.
  // admin.auth.getUser() in supabase-js@2.49.1 fails with ES256-signed tokens
  // ("Unsupported JWT algorithm ES256") because the bundled JWT library predates
  // Supabase's switch from RS256 → ES256. The Auth REST API handles ES256 correctly.
  const token = authHeader.slice(7); // strip "Bearer "
  const authVerifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseAnonKey,
    },
  });

  if (!authVerifyResp.ok) {
    return jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid session' } }, 401);
  }
  // authUser.id not otherwise used — no DB write, no audit row, this proxy only
  // needs to prove a valid session exists (D-03: no role check beyond auth).

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse({ success: false, error: { code: 'INVALID_JSON', message: 'Body must be JSON' } }, 400);
  }

  const parsed = BodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: JSON.stringify(parsed.error.flatten().fieldErrors),
        },
      },
      400
    );
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    return jsonResponse({ success: false, error: { code: 'CONFIG', message: 'ANTHROPIC_API_KEY not set' } }, 500);
  }

  const body = parsed.data;

  let anthropicResp: Response;
  try {
    anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': anthropicApiKey,
      },
      body: JSON.stringify({
        model: body.model,
        max_tokens: body.max_tokens,
        system: body.system,
        tools: body.tools,
        messages: body.messages,
      }),
    });
  } catch (e) {
    return jsonResponse(
      { success: false, error: { code: 'UPSTREAM_ERROR', message: e instanceof Error ? e.message : 'Anthropic request failed' } },
      500
    );
  }

  // Success path: forward the raw Anthropic response body UNCHANGED (same
  // status) — brain.ts/vision.ts read response.stop_reason/response.content
  // directly and would break against a wrapped {success, data} envelope.
  const anthropicBody: unknown = await anthropicResp.json().catch(() => null);

  if (!anthropicResp.ok) {
    const message =
      anthropicBody !== null && typeof anthropicBody === 'object' && 'error' in anthropicBody
        ? JSON.stringify((anthropicBody as { error: unknown }).error)
        : 'Anthropic API error';
    return jsonResponse(
      { success: false, error: { code: 'ANTHROPIC_ERROR', message } },
      anthropicResp.status
    );
  }

  return new Response(JSON.stringify(anthropicBody), {
    status: anthropicResp.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
