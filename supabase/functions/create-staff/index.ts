// Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { recordAudit } from '../_shared/audit.ts'

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  pin: z.string().regex(/^\d{6}$/),
  role: z.enum(['cashier', 'manager', 'admin', 'kitchen']),
  locale: z.enum(['es-MX', 'en-US']).optional(),
})

Deno.serve(async (req) => {
  // Bearer-JWT verification via a direct HTTP call to /auth/v1/user.
  // admin.auth.getUser() fails on ES256-signed tokens ("Unsupported JWT
  // algorithm ES256") in this supabase-js version — the Auth REST API
  // handles ES256 correctly. Same pattern as process-payment/index.ts.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const authUser = (await authVerifyResp.json()) as { id: string }

  // Single admin client, reused for the role lookup below and the
  // createUser/insert calls further down — don't construct two.
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single()

  if (callerProfileError || !callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Insufficient role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let bodyJson: unknown
  try {
    bodyJson = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const parsed = BodySchema.safeParse(bodyJson)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { name, role, pin, locale } = parsed.data

  // manage_staff (the RBAC action gating the "Add Staff" UI) is admin-only —
  // a manager caller must not be able to mint an admin/manager account by
  // calling this endpoint directly, bypassing the client-side RBAC boundary.
  if (['admin', 'manager'].includes(role) && callerProfile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Insufficient role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const staffId = crypto.randomUUID()
  const email = `${staffId}@barpos.local`

  const { error: authError } = await supabaseAdmin.auth.admin.createUser({
    id: staffId,
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { name, role },
  })

  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: staffId,
      name,
      role,
      pin,
      email,
      is_active: true,
      must_change_pin: true,
      ...(locale ? { locale } : {}),
    })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(staffId)
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await recordAudit(supabaseAdmin, {
    action: 'staff.create',
    entityType: 'staff',
    entityId: staffId,
    before: null,
    after: { name, role, email },
    source: 'edge',
    actorId: null,
  })

  return new Response(JSON.stringify({ id: staffId, email, name, role }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
