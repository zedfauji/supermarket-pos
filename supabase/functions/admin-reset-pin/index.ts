// Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { recordAudit } from '../_shared/audit.ts'

const BodySchema = z.object({
  targetStaffId: z.string().uuid(),
  newPin: z.string().regex(/^\d{6}$/),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Bearer-JWT verification via a direct HTTP call to /auth/v1/user.
  // admin.auth.getUser() fails on ES256-signed tokens ("Unsupported JWT
  // algorithm ES256") in this supabase-js version — the Auth REST API
  // handles ES256 correctly. Same pattern as create-staff/index.ts.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authVerifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: supabaseAnonKey,
    },
  })

  if (!authVerifyResp.ok) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const authUser = (await authVerifyResp.json()) as { id: string }

  // Single admin client, reused for the role lookup, target lookup, and
  // both dual-write calls below — don't construct two.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  // D-01: single-stage, admin-only gate — stricter than create-staff's
  // ['admin','manager'] gate, deliberately, since this is a live-credential
  // overwrite on an existing account, not account creation.
  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single()

  if (callerProfileError || !callerProfile || callerProfile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Insufficient role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  let bodyJson: unknown
  try {
    bodyJson = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const parsed = BodySchema.safeParse(bodyJson)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
  const { targetStaffId, newPin } = parsed.data

  // D-06: target must exist and be active. No self-target special-case
  // anywhere in this function (D-08) — targetStaffId === authUser.id is an
  // ordinary case, identical code path.
  const { data: targetProfile, error: targetLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, is_active')
    .eq('id', targetStaffId)
    .single()

  if (targetLookupError || !targetProfile) {
    return new Response(JSON.stringify({ error: 'Staff member not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
  if (!targetProfile.is_active) {
    return new Response(JSON.stringify({ error: 'Staff member is inactive' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Dual write, auth.users FIRST (D-04). If this fails, nothing else has
  // changed — abort cleanly.
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetStaffId, {
    password: newPin,
  })
  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // profiles write SECOND. If THIS fails after auth.users already succeeded,
  // the two credential stores have just diverged again — the exact
  // Incident 2/3 failure mode this phase exists to fix. Do NOT return the
  // generic create-staff-style error shape here (there is no compensating
  // "undo the password change" operation, unlike create-staff's
  // admin.auth.deleteUser() rollback) — surface a distinct, loud,
  // PARTIAL_FAILURE-prefixed error and audit-log the divergence explicitly.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ pin: newPin, must_change_pin: true })
    .eq('id', targetStaffId)

  if (profileError) {
    await recordAudit(supabaseAdmin, {
      action: 'permission.admin_pin_reset',
      entityType: 'staff',
      entityId: targetStaffId,
      before: null,
      after: { partialFailure: true, authUpdateSucceeded: true, profileUpdateFailed: true },
      source: 'edge',
      actorId: authUser.id,
    })
    return new Response(
      JSON.stringify({
        error:
          'PARTIAL_FAILURE: credential changed but staff record failed to sync — contact support before this staff member logs in',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    )
  }

  await recordAudit(supabaseAdmin, {
    action: 'permission.admin_pin_reset',
    entityType: 'staff',
    entityId: targetStaffId,
    before: null,
    after: { mustChangePin: true }, // never log the raw newPin
    source: 'edge',
    actorId: authUser.id, // unlike create-staff's null — actor is known and distinct from target here
  })

  return new Response(JSON.stringify({ id: targetProfile.id, name: targetProfile.name }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
})
