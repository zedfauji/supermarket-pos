# Phase 22: Admin PIN Reset (Server-Side Recovery Path) - Research

**Researched:** 2026-08-30
**Domain:** Supabase Edge Function (Deno) privileged credential write + React/TanStack Query dialog, in an existing Tauri/FSD codebase
**Confidence:** HIGH — every recommendation below is copy-paste-derived from an existing, working file in this repo (`create-staff`), not from external docs.

## Summary

This phase is a near-exact structural clone of `supabase/functions/create-staff/index.ts`, with the
target operation swapped from `admin.createUser()` to `admin.updateUserById()` and the profile write
swapped from `insert` to `update`. Every piece of scaffolding the planner needs — Bearer-JWT
verification, the `supabaseAdmin` client, the role-lookup query, the audit call, the CORS headers,
the flat `{ error: string }` envelope, the client-side contract/wrapper shape, the confirm-dialog
component, and the PIN-format Zod schema — already exists in this codebase and is documented below
with exact line numbers and verbatim excerpts.

The one genuinely new server-side risk is the **atomic dual-write across two independent stores**:
`auth.users.encrypted_password` (via `admin.updateUserById`) and `public.profiles.pin` (via a
`profiles` table update), which are two separate API calls with no shared transaction — unlike
`clear_must_change_pin`'s single-statement Postgres `UPDATE`, `admin.updateUserById()` is a GoTrue API
call, not SQL, so it cannot be wrapped in the same transaction as the `profiles` write. The edge
function must call `admin.updateUserById()` first and only proceed to the `profiles` write if that
succeeds — mirroring `create-staff`'s own compensating-action pattern (it calls
`admin.auth.deleteUser(staffId)` if the follow-up `profiles.insert` fails). For this phase, the
symmetric case is: if `admin.updateUserById()` succeeds but the `profiles` update fails, the function
must not silently leave `auth.users` updated with `profiles.pin` stale — there is no clean
"compensating delete" for a password change the way there is for account creation, so the response
must surface this as a distinct, loud error state (see Pitfall 1 below) rather than the generic
`{ error: profileError.message }` create-staff uses.

**Primary recommendation:** Copy `supabase/functions/create-staff/index.ts` wholesale into a new
`supabase/functions/admin-reset-pin/index.ts`, keep the Bearer-verify/role-lookup preamble
byte-for-byte, replace the `BodySchema` and the two write calls, and follow the exact same
`edge-function-contracts.ts` / `AuditActionSchema` / RBAC-registration steps `create-staff` already
went through.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Admin-only role verification for the reset | API / Backend (Edge Function) | Browser/Client (UI hides the button) | D-01 requires server-side enforcement; client-side RBAC gating alone is a UX nicety, not a security boundary (matches `create-staff`'s existing pattern of re-checking role inside the function even though `manage_staff` already gates the UI trigger) |
| New-PIN input + client-side format validation | Browser / Client | — | Same as `CreateStaffDialog` — Zod `PinSchema` validation runs client-side before any network call, purely for fast feedback; server re-validates authoritatively |
| Confirm-before-fire (acting admin's own PIN) | Browser / Client | — | D-03 — `ManagerPinDialog` compares against `useStaffList()` PIN client-side only; this is a UX gate, not itself the privilege check (the privilege check for the *target* write still happens server-side per D-01) |
| `auth.users.encrypted_password` write | API / Backend (Edge Function, service-role) | — | Must go through `admin.updateUserById()` — CLAUDE.md forbids any other path to this table |
| `public.profiles.pin` + `must_change_pin` sync write | API / Backend (Edge Function, service-role) | Database (RLS as defense-in-depth for non-edge paths) | Must happen in the same edge-function invocation as the `auth.users` write per the "atomic dual-write" project rule; RLS (`profiles_update_admin`) already exists as a second-layer client-side-bypass guard but the *edge function* uses the service-role client, bypassing RLS entirely by design (same as `create-staff`) |
| Audit trail (`permission.admin_pin_reset`) | API / Backend (Edge Function via `recordAudit`) | Database (`audit_logs` table) | `recordAudit` writes from edge-function context using the same service-role client, exactly as `create-staff` does for `staff.create` |
| Inactive-staff guard (D-06) | API / Backend (Edge Function) | Browser/Client (row won't even render — see Pitfall 3) | Must be enforced server-side because the edge function is reachable directly via `fetch()` (see SM7/SM8 E2E precedent bypassing the UI entirely) even though the UI currently can't produce an inactive-staff row to click |
| PIN-collision warning (D-07) | Browser / Client | — | Explicitly a non-blocking, same-screen UX warning per D-07 — no server enforcement implied or required |

## Standard Stack

No new dependencies. This phase reuses the exact existing stack:

| Library | Version | Purpose | Why Standard (this repo) |
|---------|---------|---------|---------------------------|
| `@supabase/supabase-js@2` (Deno, via `esm.sh`) | pinned in `create-staff/index.ts:2` | Edge function's admin client | Identical import used by every edge function in `supabase/functions/` |
| `zod@v3.23.8` (Deno, via `deno.land/x`) | pinned in `create-staff/index.ts:3` | Edge function body validation | Identical import used by `create-staff`; do not use a different zod version/import path for the new function |
| `zod` (npm, client) | already in `package.json` | Client-side request/response contracts | `edge-function-contracts.ts` convention |
| TanStack Query v5 | already in `package.json` | Mutation hook for the new client call | Matches `useForcePinChange`/`useCreateStaff` pattern |

No package-legitimacy audit is required — no new external packages are introduced by this phase.

## Package Legitimacy Audit

Not applicable — this phase adds zero new npm/Deno dependencies. All imports are copied verbatim from
`create-staff/index.ts`, an existing, already-deployed edge function.

## Architecture Patterns

### System Architecture Diagram

```
[Staff page: StaffDashboard.tsx row action]
         |  admin clicks "Reset PIN" for target staff row
         v
[New ResetPinDialog] --(1) admin types new 6-digit PIN, client Zod PinSchema validates
         |
         v
[ManagerPinDialog reused] --(2) D-03: acting admin re-enters OWN pin, checked client-side
         |  against useStaffList() cache (canAccess(role,'manage_staff') filter, matching
         |  ManagerPinDialog's existing eligibleStaff logic)
         v  onSuccess()
[callAdminResetPin() in edge-function-contracts.ts]
         |  fetch(`${VITE_SUPABASE_URL}/functions/v1/admin-reset-pin`, Bearer <acting admin JWT>)
         v
[Edge Function: supabase/functions/admin-reset-pin/index.ts]
         |
         |-- (a) verify Bearer JWT via GET /auth/v1/user (NOT admin.auth.getUser() -- ES256 bug)
         |-- (b) supabaseAdmin.from('profiles').select('role').eq('id', callerId) -- must be 'admin'
         |-- (c) BodySchema.safeParse(body) -- { targetStaffId: uuid, newPin: 6-digit }
         |-- (d) supabaseAdmin.from('profiles').select('id,is_active').eq('id', targetStaffId)
         |         -- 404 if missing, 400/403 if is_active === false (D-06)
         |-- (e) supabaseAdmin.auth.admin.updateUserById(targetStaffId, { password: newPin })
         |         -- FIRST write; if this fails, abort before touching profiles
         |-- (f) supabaseAdmin.from('profiles').update({ pin: newPin, must_change_pin: true })
         |         .eq('id', targetStaffId)
         |         -- SECOND write; if THIS fails after (e) succeeded, the two stores have
         |         -- just diverged again (the exact Incident 2/3 failure mode) -- surface a
         |         -- distinct error code, do not swallow it as a generic 400 (Pitfall 1)
         |-- (g) recordAudit(supabaseAdmin, { action: 'permission.admin_pin_reset', ... })
         v
[Response: { id, name } on 2xx | { error: string } on 4xx/5xx -- flat envelope, create-staff's shape]
         |
         v
[ResetPinDialog toast.success/toast.error, queryClient.invalidateQueries(staffKeys.list())]
         |
         v
[Target staff's next login: PINLoginForm.tsx client-side pre-flight check passes
 (profiles.pin now matches), signInWithPassword succeeds (auth.users now matches),
 must_change_pin=true routes to the existing forced-change screen -- D-04, unchanged code path]
```

### Recommended Project Structure

```
supabase/functions/
  admin-reset-pin/
    index.ts                          # new -- clone of create-staff/index.ts structure

src/features/admin-reset-pin/         # new feature folder, mirrors force-pin-change/ shape
  index.ts                            # re-exports (mirror force-pin-change/index.ts)
  model/
    useAdminResetPin.ts               # TanStack mutation calling callAdminResetPin()
  ui/
    AdminResetPinDialog.tsx           # new-PIN input dialog (mirrors CreateStaffDialog's PIN fields)
                                       # + reuses ManagerPinDialog for the D-03 confirm gate

src/shared/lib/edge-function-contracts.ts   # add AdminResetPinRequestSchema/Success/caller, template = create-staff block (lines 296-385)
src/shared/lib/audit-actions.ts             # add 'permission.admin_pin_reset' to AuditActionSchema
src/widgets/StaffDashboard/StaffDashboard.tsx  # add one more ProtectedAction+POSButton next to
                                                # the existing forcePinChange one (lines 158-169)
e2e/rbac/staff-management.spec.ts           # or a new e2e/rbac/admin-reset-pin.spec.ts -- new specs
```

### Pattern 1: Bearer-JWT verification via direct `/auth/v1/user` fetch

**What:** `admin.auth.getUser()` fails with "Unsupported JWT algorithm ES256" on tokens issued by this
project's Supabase instance under the pinned `@supabase/supabase-js@2` version. Every edge function in
this codebase (verified in `create-staff`, referenced as the same pattern used by `process-payment`)
instead verifies the caller by forwarding their Bearer token to Supabase's own Auth REST endpoint.

**When to use:** Any new edge function needing "who is calling me" — including this one.

**Example (verbatim from `supabase/functions/create-staff/index.ts:22-59`):**
```typescript
// Source: supabase/functions/create-staff/index.ts:22-59 (existing, deployed code)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', authUser.id)
    .single()

  if (callerProfileError || !callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
    return new Response(JSON.stringify({ error: 'Insufficient role' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
  // ...
```

**D-01 deviation from this template:** `create-staff`'s role check allows `['admin', 'manager']`
through the first gate (both can create *some* accounts), then applies a second, tighter check later
for admin-tier accounts. This phase's D-01 is simpler and stricter: the FIRST gate itself must be
`callerProfile.role !== 'admin'` → 403, full stop. Do not copy the two-stage `['admin','manager']`
gate — replace it with a single `!== 'admin'` check.

### Pattern 2: CORS headers block (required, not optional)

**What:** `create-staff/index.ts:13-20`'s own comment states this was *missing* until a bug fix — its
absence causes every real browser call to fail CORS preflight. Any new edge function must include it
from day one.

```typescript
// Source: supabase/functions/create-staff/index.ts:13-20
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### Pattern 3: Audit write from edge-function context

**Exact signature** (`supabase/functions/_shared/audit.ts:20-33`, `[VERIFIED: supabase/functions/_shared/audit.ts:20-33]`):
```typescript
export interface AuditParams {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  source?: 'rpc' | 'edge' | 'client' | 'trigger';
  actorId?: string | null;
  terminalId?: string | null;
}

export async function recordAudit(
  supabase: SupabaseClient,
  params: AuditParams
): Promise<void>
```
`recordAudit` is fire-and-forget and never throws — a failed audit write is logged to stderr, not
surfaced to the caller (see file header comment). Call it exactly as `create-staff` does:

```typescript
// Source: supabase/functions/create-staff/index.ts:143-151
await recordAudit(supabaseAdmin, {
  action: 'staff.create',
  entityType: 'staff',
  entityId: staffId,
  before: null,
  after: { name, role, email },
  source: 'edge',
  actorId: null,
})
```
For this phase: `action: 'permission.admin_pin_reset'`, `entityType: 'staff'`, `entityId: targetStaffId`,
`before`/`after` should NOT include the plaintext PIN value (avoid writing the raw new PIN into
`audit_logs.after` — treat it like `terminalReference`/other project conventions of not logging raw
secrets; log `{ mustChangePin: true }` or similar non-secret marker instead), `source: 'edge'`,
`actorId: authUser.id` (unlike `create-staff`, which passes `null` — this phase's actor genuinely is
known and distinct from the target, so pass it through for a useful audit trail).

**CRITICAL — audit-actions CI gate does NOT cover edge functions.** `[VERIFIED:
src/shared/lib/__tests__/audit-actions.test.ts:14,46-48]`: the enforcement test greps
`MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')` and matches
`/PERFORM\s+record_audit\s*\(\s*'([^']+)'/g` — this only scans `.sql` migration files for **SQL**
`PERFORM record_audit(...)` calls. It does **not** scan `supabase/functions/**/*.ts` for
`recordAudit(...)` TypeScript calls. This means adding `'permission.admin_pin_reset'` to
`AuditActionSchema` is still required by convention (CONTEXT.md's discretion note is correct that it
must be added there), but the CI test as it exists today will not fail if you forget — there is no
automated backstop for this specific edge-function call the way there is for RPC-based audit calls.
The planner should add a manual verification step (or, better, a Vitest assertion analogous to the
migration-scan one but pointed at `supabase/functions/**/*.ts`) rather than relying on the existing
test to catch a missing enum entry.

### Pattern 4: `edge-function-contracts.ts` client-wrapper template

**Exact template to copy** (`create-staff`'s full block, `src/shared/lib/edge-function-contracts.ts:294-385`):

```typescript
// Source: src/shared/lib/edge-function-contracts.ts:297-320 (request/success schemas + error mapper)
export const CreateStaffRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  pin: PinSchema,
  role: UserRoleSchema,
  locale: LocaleSchema.optional(),
});
export type CreateStaffRequest = z.infer<typeof CreateStaffRequestSchema>;

export const CreateStaffSuccessSchema = z.object({
  id: UuidSchema,
  email: z.email(),
  name: z.string(),
  role: UserRoleSchema,
});
export type CreateStaffSuccess = z.infer<typeof CreateStaffSuccessSchema>;

/** create-staff/index.ts's flat error envelope: `{ error: string }` (not process-payment's `{error:{code,message}}`). */
function mapCreateStaffEdgeError(status: number, message: string): AppError {
  if (status === 401) return { code: 'AUTH_REQUIRED', message };
  if (status === 403) return { code: 'AUTH_FORBIDDEN', message };
  return { code: 'SUPABASE_ERROR', message };
}
```
And the caller function body (`edge-function-contracts.ts:327-385`) — copy the `callCreateStaff`
function verbatim, renaming to `callAdminResetPin`, changing the request/success schema names, the
`functions/v1/create-staff` URL segment to `functions/v1/admin-reset-pin`, and the fallback message
string. The `getCachedAccessToken()` + raw `fetch()` pattern (not `supabase.functions.invoke`) is used
here specifically because `supabase.functions` "creates a new FunctionsClient with static anon-key
headers on every access — the user JWT is never injected" (comment at
`edge-function-contracts.ts:208-210`) — do not switch to `supabase.functions.invoke` for this new
function; `create-staff` and `process-payment` both deliberately avoid it for this reason.

**Proposed new schema** (D-02: admin picks the new PIN, not random-generated):
```typescript
export const AdminResetPinRequestSchema = z.object({
  targetStaffId: UuidSchema,
  newPin: PinSchema,
});
export type AdminResetPinRequest = z.infer<typeof AdminResetPinRequestSchema>;

export const AdminResetPinSuccessSchema = z.object({
  id: UuidSchema,
  name: z.string(),
});
export type AdminResetPinSuccess = z.infer<typeof AdminResetPinSuccessSchema>;
```
Register the new entry in the `EDGE_FUNCTIONS` registry object at the bottom of the file
(`edge-function-contracts.ts:1312-1358`), following the existing `'create-staff': {...}` entry shape.

### Pattern 5: Confirm-before-fire dialog (D-03) — exact `ManagerPinDialog` API

`[VERIFIED: src/features/manager-pin-gate/ui/ManagerPinDialog.tsx:18-23]` (exact prop interface, quoted verbatim):
```typescript
export interface ManagerPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredAction: StaffAction;
  onSuccess: () => void;
}
```
Reuse this component directly — do not fork it. Render it from the new `AdminResetPinDialog` (or
compose them: the reset dialog collects the new PIN, then on submit opens `ManagerPinDialog` with
`requiredAction="manage_staff"` — matching the action already gating "Reset PIN"'s visibility — and
only calls the edge function from `ManagerPinDialog`'s `onSuccess` callback). `ManagerPinDialog`
internally filters `useStaffList()` by `canAccess(s.role, requiredAction)` and compares the entered
PIN against `s.pin` client-side (`ManagerPinDialog.tsx:65-77`) — this is the acting-admin identity
check, entirely separate from and in addition to the server-side admin-role check inside the edge
function itself (D-01). Two independent admin-only staff members' PINs will both pass this client-side
gate if `requiredAction="manage_staff"` is admin-only per `rbac.ts` — confirm `manage_staff` really is
admin-only (`[VERIFIED: src/shared/lib/rbac.ts:59-64]`: `ADMIN_EXTRA` includes `'manage_staff'`,
and it is NOT present in `MANAGER_EXTRA` at lines 45-55) — so `ManagerPinDialog` with
`requiredAction="manage_staff"` already restricts `eligibleStaff` to admin-role accounts only,
correctly mirroring D-01 on the client side (though the server-side check remains authoritative).

### Pattern 6: New-PIN input dialog UX (D-02) — exact `CreateStaffDialog` PIN-field template

`[VERIFIED: src/features/create-staff/ui/CreateStaffDialog.tsx:38-40,60-84,108-138]`, the dual
PIN + confirm-PIN input pattern to replicate for the new reset dialog:
```typescript
const [pin, setPin] = useState('');
const [confirmPin, setConfirmPin] = useState('');
// ...
if (pin !== confirmPin || !PinSchema.safeParse(pin).success) {
  toast.error(t('addStaff.pinMismatch'));
  return;
}
// ...
const canSubmit =
  name.trim().length > 0 &&
  PinSchema.safeParse(pin).success &&
  PinSchema.safeParse(confirmPin).success &&
  Boolean(role) &&
  !mutation.isPending;
```
Input markup uses plain `<Input type="password" inputMode="numeric" maxLength={6} />` (NOT
`PINKeypad`) for this dialog — `PINKeypad` is reserved for PIN *entry* (login, `ManagerPinDialog`
confirm), while `CreateStaffDialog` uses a regular masked text `Input` for PIN *assignment* by an
admin who is typing on a keyboard, not tapping a numeric pad. Follow `CreateStaffDialog`'s choice
(`Input`, not `PINKeypad`) for the new-PIN field in the reset dialog, since this is the same
"admin assigns a PIN via keyboard" scenario, not a PIN-entry scenario.

`PinSchema` exact definition — `[VERIFIED: src/shared/lib/domain.ts:20-23]`:
```typescript
export const PinSchema = z
  .string()
  .length(6)
  .regex(/^\d{6}$/, 'PIN must be exactly 6 digits');
```

### Pattern 7: Staff-page action placement (D-05)

`[VERIFIED: src/widgets/StaffDashboard/StaffDashboard.tsx:158-169]`, the exact block the new
"Reset PIN" button is added alongside:
```tsx
<ProtectedAction action="manage_staff" currentRole={currentRole}>
  <POSButton
    type="button"
    size="sm"
    variant="outline"
    onClick={() => {
      setForcePinTarget(staff);
    }}
  >
    {t('actions.forcePinChange')}
  </POSButton>
</ProtectedAction>
```
Add a sibling `ProtectedAction action="manage_staff"` block immediately after this one (before the
locale-edit block at lines 170-181), following the exact `set<X>Target(staff)` state pattern already
used for `clockInStaff`/`clockOutTarget`/`forcePinTarget`/`localeTarget` (state declared at
`StaffDashboard.tsx:54-57`, dialogs rendered at `StaffDashboard.tsx:237-276`). Add
`const [resetPinTarget, setResetPinTarget] = useState<Staff | null>(null);` and a
`<AdminResetPinDialog staff={resetPinTarget} open={resetPinTarget !== null} onOpenChange={...} />`
block mirroring `ForcePinChangeDialog`'s render call at lines 259-265.

### Anti-Patterns to Avoid

- **Using `supabase.functions.invoke()` for this call.** It does not forward the caller's JWT in this
  codebase's setup (see Pattern 4) — use the raw `fetch()` + `getCachedAccessToken()` pattern instead.
- **Using `admin.auth.getUser()` inside the edge function.** Fails on ES256 tokens in this
  supabase-js version — use the `/auth/v1/user` REST fetch instead.
- **Writing `profiles.pin` before `auth.users.encrypted_password` succeeds.** If the order is
  reversed and the `auth.users` write then fails, `profiles.pin` has already changed to a value that
  does not match any real credential — a stale-in-the-other-direction Incident 2/3 replay. Always
  write `auth.users` first (Pattern in Summary above).
- **A nested `{ success, error: { code, message } }` envelope.** `create-staff` (and this phase's
  clone) uses the flatter `{ error: string }` shape — do not copy `process-payment`'s envelope shape
  by mistake; they are deliberately different, documented at `edge-function-contracts.ts:315`.
- **Reaching for a new RBAC action (e.g. `reset_staff_pin`).** `rbac.ts`'s existing `manage_staff`
  action already gates every other admin-only staff-management UI trigger
  (`create-staff`'s Add Staff button, `force-pin-change`'s button, `edit-staff-locale`'s button — all
  three at `StaffDashboard.tsx:158,170,210` use `action="manage_staff"`). Adding a new, narrower
  client-side action would only affect UI visibility (D-01's real enforcement is server-side
  regardless) while breaking the file's existing one-action-for-all-staff-admin-actions consistency.
  Reuse `manage_staff`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Bearer-JWT verification in Deno | A custom JWT decode/verify routine | The existing `/auth/v1/user` fetch pattern | Already solved, already handles the ES256 quirk this Supabase project has |
| Acting-admin re-confirmation UI | A new PIN-entry dialog/keypad component | `ManagerPinDialog` (unmodified) | Exact UX already exists and is used for other privileged actions in this app |
| PIN format validation | A new regex/length check | `PinSchema` from `domain.ts` | Single source of truth; reused by `create-staff`, `clear_must_change_pin`, this phase should match exactly |
| Edge function → DB audit trail | A raw `.insert()` into `audit_logs` | `recordAudit()` from `_shared/audit.ts` | Already handles error-swallowing (never throws) and the correct column names |

**Key insight:** This phase should add almost zero net-new patterns to the codebase — its entire job
is to compose four already-proven pieces (edge-function auth preamble, `admin.updateUserById`,
`ManagerPinDialog`, `recordAudit`) in a new arrangement. Any task in the plan that proposes writing a
new low-level primitive (a new JWT check, a new PIN dialog chrome, a new audit helper) should be
treated as a red flag during plan review.

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. New behavior only; no existing strings,
keys, or registrations are being renamed.

## Common Pitfalls

### Pitfall 1: Silent divergence on partial failure (the exact bug class this phase exists to fix)

**What goes wrong:** `admin.updateUserById()` succeeds (real credential now changed) but the
subsequent `profiles.update({ pin, must_change_pin })` call fails (network blip, RLS misconfiguration,
etc.) — `auth.users` and `profiles.pin` have now diverged in exactly the shape of Incident 2/3, except
this time triggered by the *fix* for that class of incident rather than by `PINLoginForm.tsx`.

**Why it happens:** These are two separate API calls (one GoTrue admin API, one PostgREST/service-role
`.update()`) with no shared transaction boundary — `admin.updateUserById` cannot be wrapped inside a
Postgres `BEGIN/COMMIT` the way `clear_must_change_pin`'s single-statement SQL fix could be.

**How to avoid:** After a successful `admin.updateUserById()`, if the `profiles.update()` call errors,
do NOT return the same generic `{ error: profileError.message }` shape `create-staff` uses for its
(structurally different) create-then-insert failure. Return a distinct signal — e.g. a specific error
message/code the client can log loudly, and consider a background retry or at minimum a clearly
worded audit-log entry (`recordAudit` with `source: 'edge'`, action still
`permission.admin_pin_reset`, but with a `details`/`after` payload noting the partial-failure state) so
this is discoverable rather than silently identical to the pre-fix bug. `create-staff`'s own
compensating action (`admin.auth.deleteUser(staffId)` on profile-insert failure) is NOT a valid model
here — there is no equivalent "undo the password change" operation that restores the *previous*
password (it isn't known/stored anywhere in plaintext to roll back to). The planner should treat this
as an explicit task: define what the edge function does/returns on this specific partial-failure path,
not just "copy create-staff's error handling."

**Warning signs:** A staff member reports "my PIN was reset but I still can't log in" shortly after an
admin performs a reset — check whether `profiles.pin` and the real password actually match before
assuming user error.

### Pitfall 2: Forgetting the audit-actions CI gate doesn't cover edge functions

**What goes wrong:** A developer adds `recordAudit({ action: 'permission.admin_pin_reset', ... })`
inside the new edge function but forgets to add the string to `AuditActionSchema` in
`audit-actions.ts` — nothing in CI catches this (see Pattern 3 above), so the audit write silently
fails at runtime (caught internally by `recordAudit`'s try/catch, logged to stderr only) and no one
notices until someone goes looking at `/audit` for a reset that isn't there.

**How to avoid:** Add the enum entry in the SAME commit/task as the edge function, before writing any
code that calls `recordAudit` with it. Consider having the plan add a lightweight Vitest check (new
test file or extend `audit-actions.test.ts`) that greps `supabase/functions/**/*.ts` for
`recordAudit(...)` calls the same way the existing test greps migrations — this is a coverage gap this
phase is well-positioned to close as a side effect.

### Pitfall 3: D-06's "existing reactivation path" does not appear to exist in this codebase

**What goes wrong:** CONTEXT.md's D-06 says "The admin must reactivate the profile first (existing
reactivation path) before the reset action becomes available for that row" — but a full search of
`src/` for staff-`is_active` toggle/reactivate/deactivate UI found none. `[VERIFIED:
src/entities/staff/model/queries.ts:78-85]`: `useStaffList()` — the query `StaffDashboard.tsx` itself
uses to populate its rows — is hard-filtered to `.eq('is_active', true)`, meaning an inactive staff
member's row **cannot currently appear on the Staff page at all**, for any action, not just Reset PIN.
There is no `edit-staff-active`/`toggle-staff-active` feature folder alongside the existing
`edit-staff-locale`/`edit-staff-role` ones, and no reactivation control was found in
`StaffDashboard.tsx`, `RBACDashboard.tsx`, or anywhere else in `src/`.

**How to avoid:** The planner has two honest options, and should pick one explicitly rather than
silently building D-06's server-side guard against a UI path that doesn't exist:
1. **Descope the client-visibility half of D-06** (there's nothing to "block" in the UI — an inactive
   row is already absent) and implement ONLY the server-side guard in the edge function (return 400/403
   if `profiles.is_active === false` for the target), documented as defense-in-depth against a direct
   API call (mirroring the SM7/SM8 E2E precedent of hitting the edge function directly, bypassing the
   UI).
2. **Flag this gap back to the user/CONTEXT.md before planning** — if a "reactivate a staff member"
   feature genuinely doesn't exist yet, D-06 may implicitly require building one, which is a
   meaningfully larger scope than "add a Reset PIN button." Given D-06's own phrasing assumes the path
   already exists, option 1 (server-side guard only, no new UI) is almost certainly the intended
   scope — but the planner should note this explicitly rather than silently building unrequested
   reactivation UI OR silently skipping the server-side guard.

This project's own `verification-overrides.md`/gap-tracking convention (see `.planning/STATE.md`
Deferred Items) is the right place to log "no staff reactivation UI exists" as a separately-tracked
gap if it isn't folded into this phase.

**Warning signs:** A plan task titled "add reactivation button" appearing in this phase's PLAN.md
without CONTEXT.md explicitly re-scoping D-06 — that would silently expand scope beyond what was
discussed.

### Pitfall 4: `useStaffList()`'s `is_active=true` filter breaks D-01's "target any staff member" claim indirectly

**What goes wrong:** D-01 says "an admin can target any staff member including other admins" — but if
the target-staff picker for the new Reset PIN dialog reuses `useStaffList()` (as CONTEXT.md's
Reusable Assets section suggests for "the target-staff picker"), an admin can only ever pick from
*active* staff, which is actually consistent with D-06's intent (inactive staff excluded) — not a bug,
but worth the planner confirming this is the desired mechanism (implicit is_active filtering via reuse
of `useStaffList()`) rather than something that needs a separate explicit check, since D-06's guard
already gets partially satisfied for free by which staff even appear as pickable in the first place.
The only place a genuinely inactive target could reach the edge function is a direct API call (Pitfall
3's scenario), which is exactly why the server-side check in the edge function still matters even
though the picker itself won't offer inactive staff.

### Pitfall 5: PIN-collision check (D-07) needs the *active* staff list, and only that

**What goes wrong:** If the collision check is implemented as a query against `profiles.pin` directly
(rather than reusing the already-fetched, already-`is_active`-filtered `useStaffList()` data),
whoever writes it might accidentally include inactive staff in the collision set, producing a
confusing warning for a PIN "in use" by an account nobody can log into anymore.

**How to avoid:** Per D-07's own wording ("another **active** staff member's current `profiles.pin`"),
reuse `useStaffList()`'s already-filtered data for the client-side collision check (CONTEXT.md's
Claude's Discretion section leaves the client-vs-query choice open — this research recommends
client-side reuse of `useStaffList()`, since the data is already fetched, already filtered correctly
by `is_active`, and this avoids a second network round-trip for what is explicitly a non-blocking,
best-effort warning per D-07).

## Code Examples

### Full edge-function skeleton to adapt (structure only — do not copy target-write logic verbatim, see Pitfall 1)

```typescript
// Source: supabase/functions/create-staff/index.ts (existing file, full structure reference)
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
    headers: { Authorization: authHeader, apikey: supabaseAnonKey },
  })
  if (!authVerifyResp.ok) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
  const authUser = (await authVerifyResp.json()) as { id: string }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

  // D-01: admin-only, single-stage gate (stricter than create-staff's ['admin','manager']).
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

  // D-06: target must be active.
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

  // (e) auth.users write FIRST.
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetStaffId, {
    password: newPin,
  })
  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // (f) profiles write SECOND -- see Pitfall 1 for what to do if this fails.
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ pin: newPin, must_change_pin: true })
    .eq('id', targetStaffId)

  if (profileError) {
    // DO NOT return create-staff's generic shape here uncritically -- this is
    // the partial-divergence case (Pitfall 1). Planner must decide the exact
    // error code/message and whether/how to retry or flag for follow-up.
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  await recordAudit(supabaseAdmin, {
    action: 'permission.admin_pin_reset',
    entityType: 'staff',
    entityId: targetStaffId,
    before: null,
    after: { mustChangePin: true },
    source: 'edge',
    actorId: authUser.id,
  })

  return new Response(JSON.stringify({ id: targetProfile.id, name: targetProfile.name }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Direct Supabase Studio/SQL edit of `auth.users.encrypted_password` + `profiles.pin` by hand | Server-side edge function, admin-role-gated, atomic-intent dual write | This phase (2026-08-30 discussion → 2026-08-31 execution) | Closes the recovery gap that caused the Vinty Owner outage; no more "developer on call with DB access" dependency for a forgotten PIN |

**Deprecated/outdated:** None — `force_pin_change`/`clear_must_change_pin` remain unchanged and
serve a different, non-overlapping case (staff member who knows their current PIN) per D-05.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "existing reactivation path" referenced in D-06 does not exist in this codebase as of this research (no `is_active` toggle UI found anywhere in `src/`) | Pitfall 3 | If a reactivation feature does exist somewhere unsearched (e.g. done via direct Supabase Studio access, documented only in an ops runbook), the planner may over-scope by proposing to build one that's redundant, or under-scope by leaving D-06 half-implemented if the user actually expects new reactivation UI in this same phase |
| A2 | `ManagerPinDialog` with `requiredAction="manage_staff"` is the correct `requiredAction` value to pass for D-03's confirm gate (since `manage_staff` is admin-only per `rbac.ts`, matching D-01's admin-only requirement) | Pattern 5 | If a different `requiredAction` is intended, `eligibleStaff` inside `ManagerPinDialog` would include managers, weakening the D-03 gate to non-admin-only, though the edge function's own D-01 check would still block the actual write |
| A3 | The recommended partial-failure handling in Pitfall 1 (distinct error path, no compensating action) is sufficient without a queued-retry mechanism | Pitfall 1 | If manual retry/support intervention proves too slow in practice, a follow-up phase might need a background reconciliation job — out of scope for this phase per CONTEXT.md's boundary, but worth flagging as a known residual risk |

## Open Questions (RESOLVED)

1. **What exact recovery/error UX happens on the Pitfall 1 partial-failure path?**
   - What we know: `auth.users` succeeded, `profiles` update failed — the two stores have diverged.
   - What's unclear: whether the plan should (a) just surface a distinct error and audit-log it for
     manual follow-up, (b) attempt an automatic retry of the `profiles` update a few times before
     giving up, or (c) something else. CONTEXT.md doesn't address this because D-01–D-08 were framed
     around the happy path.
   - Recommendation: planner should add an explicit task/requirement for this specific failure mode
     rather than leaving it to "same as create-staff's error handling," since the failure semantics are
     genuinely different (see Pitfall 1).
   - **RESOLVED:** Option (a). `22-01-PLAN.md` Task 1 step 3 returns a distinct `PARTIAL_FAILURE:`-prefixed
     error (mapped client-side to `PIN_RESET_PARTIAL_FAILURE` in step 2) and writes an explicit
     partial-divergence audit entry — no automatic retry. No follow-up reconciliation job is in this
     phase's scope (tracked as residual risk T-22-03/A3 in the plan's threat model).

2. **Does D-06 imply new reactivation UI must ship in this phase, or is the server-side guard
   sufficient?**
   - What we know: no reactivation UI currently exists (Pitfall 3).
   - What's unclear: whether CONTEXT.md's author was aware of this gap when writing D-06.
   - Recommendation: raise this explicitly during planning/requirements-derivation rather than
     guessing; default to "server-side guard only, no new UI" (option 1 in Pitfall 3) unless corrected.
   - **RESOLVED:** Option 1. `22-01-PLAN.md`'s "Artifacts This Phase Produces" section explicitly states
     "no reactivation/deactivation UI... D-06's guard is server-side only" — Task 2's SM11 test proves
     the guard via direct `getServiceClient()` seeding, independent of any UI.

## Environment Availability

Not applicable — no new external tools/services/runtimes are introduced. The phase uses the existing
Supabase project (edge functions already deployed per DEP-03/v1.6), the existing Deno edge runtime, and
the existing client stack. No new environment probing is needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit) + Playwright v1.59 (E2E) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| Quick run command | `npx vitest run src/features/admin-reset-pin` |
| Full suite command | `npm run test` (unit), `npm run test:e2e` (E2E) |

### Phase Requirement → Test Map

No formal REQ-IDs exist yet (ROADMAP.md marks them TBD); candidate IDs derived from CONTEXT.md's
D-01..D-08 for the planner's use:

| Candidate REQ ID | Behavior (from CONTEXT.md decision) | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PINRST-01 (D-01) | Only admin role can call reset; admin can target any staff incl. other admins; non-admin caller rejected with 403 | E2E | `npx playwright test e2e/rbac/staff-management.spec.ts` (new test in this file, mirroring SM7/SM8's direct-fetch-403 pattern) | ❌ Wave 0 |
| PINRST-02 (D-02) | Admin types a specific 6-digit PIN in the dialog (not system-generated) | Unit (dialog) + E2E | `npx vitest run src/features/admin-reset-pin` | ❌ Wave 0 |
| PINRST-03 (D-03) | Acting admin must re-enter own PIN via `ManagerPinDialog` before the edge function fires | E2E | new Playwright spec, click-through | ❌ Wave 0 |
| PINRST-04 (D-04) | Reset always sets `must_change_pin=true`; next login forces the change screen | E2E | mirror SM2's exact assertion pattern (`e2e/rbac/staff-management.spec.ts:104-136`) | ❌ Wave 0 (new test, existing pattern) |
| PINRST-05 (D-05) | "Force PIN Change" stays unmodified; "Reset PIN" is a distinct, additional action | Unit + E2E | existing `ForcePinChangeDialog.test.tsx` must remain green unmodified; new test for the new button | ✅ (regression-only) |
| PINRST-06 (D-06) | Reset blocked server-side for `is_active=false` target | E2E (direct-fetch, since UI can't reach this state — Pitfall 3) | new Playwright spec using `getServiceClient()` to seed an inactive profile then hit the edge function directly | ❌ Wave 0 |
| PINRST-07 (D-07) | Non-blocking same-screen warning on PIN collision with another active staff member | Unit (dialog) | Vitest test on the new dialog component | ❌ Wave 0 |
| PINRST-08 (D-08) | Admin can reset their own PIN, no special-case block | E2E | new Playwright spec, admin resets own account, logs back in with new PIN | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/features/admin-reset-pin` (fast, no live Supabase needed for the dialog/hook logic beyond mocking)
- **Per wave merge:** `npm run test` (full unit) + targeted `npx playwright test e2e/rbac/`
- **Phase gate:** Full `npm run test:e2e` green (or the relevant `e2e/rbac/` + `e2e/staff`-adjacent subset) before `/gsd-verify-work`, consistent with this repo's CLAUDE.md mandatory-automated-testing policy — no `human_needed`/manual UAT for any scenario in this phase, including D-03's confirm-dialog flow and D-06's inactive-staff block, both of which are fully driveable via Playwright + `getServiceClient()` seeding (mirrors `e2e/rbac/staff-management.spec.ts`'s existing SM7/SM8 direct-fetch pattern for privilege-boundary tests).

### Wave 0 Gaps
- [ ] `supabase/functions/admin-reset-pin/index.ts` — new edge function (no existing file)
- [ ] `src/features/admin-reset-pin/` — new feature folder (hook + dialog + tests)
- [ ] New Playwright spec(s) under `e2e/rbac/` (extend `staff-management.spec.ts` or add
      `e2e/rbac/admin-reset-pin.spec.ts`) covering D-01/D-03/D-04/D-06/D-08
- [ ] Optional: a Vitest check extending `audit-actions.test.ts`'s pattern to also grep
      `supabase/functions/**/*.ts` for `recordAudit(...)` calls (closes the CI gap in Pitfall 2) — not
      strictly required by CONTEXT.md but flagged here as a natural side-quest given this phase touches
      exactly that gap

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | `admin.updateUserById()` — the only sanctioned path to `auth.users.encrypted_password` per CLAUDE.md; never raw SQL |
| V3 Session Management | no | No session/token issuance changes in this phase |
| V4 Access Control | yes | Server-side (edge function) role check per D-01, admin-only, single-stage gate — never rely on client-side RBAC hiding alone |
| V5 Input Validation | yes | Zod `BodySchema`/`PinSchema` server-side (edge function) AND client-side (dialog); 6-digit numeric PIN format enforced both places |
| V6 Cryptography | yes | Password hashing handled entirely by GoTrue's `admin.updateUserById()` — never hand-roll bcrypt/`crypt()` in this path (contrast with the documented emergency-SQL-only fallback in CLAUDE.md, which is explicitly the non-preferred path) |
| V8 Data Protection | yes | Do not log the raw new PIN value in `audit_logs.after` or in application logs — mirrors the project's existing convention of never logging `terminalReference` raw (see `ReceiptTenderSchema` comment in `edge-function-contracts.ts:41`) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Privilege escalation via direct edge-function call bypassing UI (proven precedent: SM7/SM8 E2E tests already exploit this against `create-staff`) | Elevation of Privilege | Server-side role re-check inside the edge function itself (D-01), independent of any client-side gating — already the established pattern in this codebase |
| Stale/cached JWT role claims — a demoted admin's still-valid JWT used to call this function before their session naturally expires | Elevation of Privilege | Not solved by the current `create-staff` pattern either (it also trusts the JWT's `sub` + a fresh `profiles.role` lookup, not the JWT's own claims) — this codebase's pattern already re-queries `profiles.role` fresh on every call rather than trusting a JWT claim, which mitigates this: a demoted admin's `profiles.role` is checked live, not read from a stale JWT. No new work needed here beyond copying the existing pattern faithfully. |
| Cross-account credential write abuse (a compromised admin session resets many staff PINs to enable further compromise) | Tampering / Elevation of Privilege | D-03's confirm-before-fire re-entry of the acting admin's own PIN adds a speed bump against a hijacked-but-unattended session; full mitigation (rate limiting, anomaly detection) is explicitly out of this single-store project's scope per the existing `agent-proxy` precedent ("Per-user rate limiting... Enterprise/multi-tenant scope" in REQUIREMENTS.md Out of Scope) — no rate limiting is expected to be added in this phase, but the planner should note this as an accepted residual risk consistent with prior phases' threat-model dispositions, not silently omit it |
| Replay of a captured reset request | Tampering | Not directly relevant — `admin.updateUserById` is idempotent in effect (replaying the same new-PIN request just re-sets the same password + re-syncs profiles.pin; no double-charge/double-apply risk analogous to payment idempotency keys). No idempotency key is needed for this endpoint, unlike `process-payment`/`process-direct-sale`. |
| Target validation gap (D-06/D-08 edge cases: non-existent staffId, self-target) | Tampering / Denial of Service | Explicit `targetProfile` lookup with 404 on missing row (skeleton above); D-08 requires NO special-case block for self-target — the code path is identical whether `targetStaffId === authUser.id` or not, per D-08's own reasoning ("one less edge case to guard") |

## Sources

### Primary (HIGH confidence — all read directly this session)
- `supabase/functions/create-staff/index.ts` (full file) — Bearer-JWT verify pattern, role-gate shape, error envelope, audit call shape
- `supabase/functions/_shared/audit.ts` (full file) — `recordAudit` exact signature
- `src/shared/lib/edge-function-contracts.ts` (full file) — `create-staff` contract block (lines 294-385), file-wide conventions, `EDGE_FUNCTIONS` registry
- `src/shared/lib/audit-actions.ts` (full file) — `AuditActionSchema` enum, CI-enforcement doc comment
- `src/shared/lib/__tests__/audit-actions.test.ts` (full file) — confirmed the CI gate scans `supabase/migrations` only, not edge functions (Pitfall 2)
- `src/shared/lib/rbac.ts` (full file) — confirmed `manage_staff` is admin-only (`ADMIN_EXTRA`)
- `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (full file) — exact prop interface, `eligibleStaff` filter logic
- `src/features/force-pin-change/ui/ForcePinChangeDialog.tsx` + `model/useForcePinChange.ts` (full files) — sibling-action pattern to place the new action beside
- `src/features/create-staff/ui/CreateStaffDialog.tsx` (full file) — dual PIN/confirm-PIN input UX pattern
- `src/widgets/StaffDashboard/StaffDashboard.tsx` (lines 1-280, full component) — exact row-action placement point, `useStaffList()` usage confirming `is_active=true` filter
- `src/entities/staff/model/queries.ts` (full file) — `useStaffList()` exact query (`is_active=true` filter), `mapStaffRow`, existing mutation hook patterns (`useMutationUpdateStaffRole`, `useMutationUpdateStaffLocale`) as additional templates for a staff-targeted mutation
- `src/shared/lib/domain.ts` (lines 1-70) — `PinSchema`, `UserRoleSchema`, `LocaleSchema` exact definitions
- `src/shared/lib/supabase.types.ts` (lines 974-1013) — `profiles` table generated columns (`is_active`, `must_change_pin`, `pin`, `role`)
- `supabase/migrations/20260831000001_clear_must_change_pin_sync_pin_column.sql` (full file) — atomic dual-write precedent within `profiles` alone, and its own doc comment explaining Incident 3
- `e2e/rbac/staff-management.spec.ts` (lines 1-230) — SM2 (create-staff → forced PIN change E2E pattern to mirror for D-04), SM7/SM8 (direct-fetch role-check bypass pattern to mirror for D-01/D-06 server-side tests)
- `e2e/helpers/supabase.ts` (`getServiceClient`, `seedNewStaffMember`, `deleteTestStaff`) — E2E seeding/teardown helpers available for the new specs
- `.planning/phases/22-admin-pin-reset-server-side-recovery-path/22-CONTEXT.md` — D-01..D-08 locked decisions
- `.planning/notes/vinty-owner-login-outage-rca.md` (referenced, not re-quoted here — see CONTEXT.md's summary) — Incident 2/3 root causes this phase must not reintroduce

### Secondary (MEDIUM confidence)
- None used — all findings this session were verified directly against repo source, not web search, since CONTEXT.md's canonical_refs already named the exact files needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entirely reused existing imports.
- Architecture: HIGH — direct structural clone of a working, deployed edge function plus existing UI dialog components.
- Pitfalls: HIGH for Pitfalls 1/2 (derived from reading the exact CI test and the exact migration this phase must not regress); MEDIUM for Pitfalls 3/4/5 (derived from an exhaustive-but-not-100%-guaranteed grep of `src/` — flagged as Assumption A1 accordingly).

**Research date:** 2026-08-30
**Valid until:** 30 days (stable internal codebase pattern; not dependent on any external library release cadence)
