# Phase 22: Admin PIN Reset (Server-Side Recovery Path) - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 8
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/functions/admin-reset-pin/index.ts` | controller (edge function) | request-response (privileged dual-write) | `supabase/functions/create-staff/index.ts` | exact |
| `src/shared/lib/edge-function-contracts.ts` (add block) | config/contract | request-response | Same file's `create-staff` block (lines 294-385) | exact |
| `src/shared/lib/audit-actions.ts` (add enum entry) | config | CRUD (enum) | Same file's existing entries | exact |
| `src/features/admin-reset-pin/model/useAdminResetPin.ts` | hook | request-response (mutation) | `src/features/create-staff` mutation hook / `useMutationUpdateStaffRole` (`entities/staff/model/queries.ts`) | exact |
| `src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx` | component | request-response (form) | `src/features/create-staff/ui/CreateStaffDialog.tsx` | exact |
| `src/features/admin-reset-pin/index.ts` | utility (barrel) | — | `src/features/force-pin-change/index.ts` | exact |
| `src/widgets/StaffDashboard/StaffDashboard.tsx` (modify) | component (widget) | event-driven (button → dialog state) | Same file's existing `forcePinTarget` block (lines 158-169, 54-57, 237-276) | exact |
| `e2e/rbac/staff-management.spec.ts` (extend) or new `e2e/rbac/admin-reset-pin.spec.ts` | test | request-response/event-driven | Same file's SM2 (lines 104-136) and SM7/SM8 direct-fetch-403 tests | exact |

## Pattern Assignments

### `supabase/functions/admin-reset-pin/index.ts` (controller, request-response)

**Analog:** `supabase/functions/create-staff/index.ts` (full file)

**Imports pattern:**
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'
import { recordAudit } from '../_shared/audit.ts'
```

**CORS headers (required, was missing once — caused a real bug):**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

**Auth pattern — Bearer-JWT verify via direct REST fetch, NOT `admin.auth.getUser()`** (`create-staff/index.ts:22-59`):
```typescript
const authHeader = req.headers.get('Authorization')
if (!authHeader?.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
    status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
const authVerifyResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: { Authorization: authHeader, apikey: supabaseAnonKey },
})
if (!authVerifyResp.ok) {
  return new Response(JSON.stringify({ error: 'Invalid session' }), {
    status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
const authUser = (await authVerifyResp.json()) as { id: string }
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
```

**Role gate — DEVIATE from create-staff here.** create-staff allows `['admin','manager']` then re-checks later; D-01 requires a single-stage, admin-only gate:
```typescript
const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
  .from('profiles').select('role').eq('id', authUser.id).single()

if (callerProfileError || !callerProfile || callerProfile.role !== 'admin') {
  return new Response(JSON.stringify({ error: 'Insufficient role' }), {
    status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
```

**Body schema:**
```typescript
const BodySchema = z.object({
  targetStaffId: z.string().uuid(),
  newPin: z.string().regex(/^\d{6}$/),
})
```

**D-06 inactive-target guard (new — no direct analog, derived from lookup pattern):**
```typescript
const { data: targetProfile, error: targetLookupError } = await supabaseAdmin
  .from('profiles').select('id, name, is_active').eq('id', targetStaffId).single()

if (targetLookupError || !targetProfile) {
  return new Response(JSON.stringify({ error: 'Staff member not found' }), {
    status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
if (!targetProfile.is_active) {
  return new Response(JSON.stringify({ error: 'Staff member is inactive' }), {
    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
```

**Core dual-write pattern — auth.users FIRST, profiles SECOND (order matters, see Error Handling below):**
```typescript
const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetStaffId, {
  password: newPin,
})
if (authError) {
  return new Response(JSON.stringify({ error: authError.message }), {
    status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

const { error: profileError } = await supabaseAdmin
  .from('profiles')
  .update({ pin: newPin, must_change_pin: true })
  .eq('id', targetStaffId)
```

**Error handling — DEVIATE from create-staff for the partial-failure branch (Pitfall 1).** create-staff's model (compensating `admin.auth.deleteUser()` on insert failure) does NOT apply here — there is no way to "undo" a password change back to an unknown previous value. If `profileError` occurs after `authError` was clean, this is the exact two-store-divergence bug class the phase exists to fix. Return a distinct error (not the generic `{ error: profileError.message }` shape) and audit-log the partial-failure state explicitly rather than silently matching create-staff's shape.

**Audit pattern** (`supabase/functions/_shared/audit.ts:20-33`, called as in `create-staff/index.ts:143-151`):
```typescript
await recordAudit(supabaseAdmin, {
  action: 'permission.admin_pin_reset',
  entityType: 'staff',
  entityId: targetStaffId,
  before: null,
  after: { mustChangePin: true }, // never log the raw newPin
  source: 'edge',
  actorId: authUser.id, // unlike create-staff's null — actor is known and distinct from target here
})
```

**Success response — flat envelope (not `process-payment`'s nested `{success, error:{code,message}}`):**
```typescript
return new Response(JSON.stringify({ id: targetProfile.id, name: targetProfile.name }), {
  headers: { 'Content-Type': 'application/json', ...corsHeaders },
})
```

---

### `src/shared/lib/edge-function-contracts.ts` (config/contract)

**Analog:** same file, `create-staff` block, lines 294-385

**Request/success schema + error mapper pattern** (lines 297-320):
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

function mapAdminResetPinEdgeError(status: number, message: string): AppError {
  if (status === 401) return { code: 'AUTH_REQUIRED', message };
  if (status === 403) return { code: 'AUTH_FORBIDDEN', message };
  return { code: 'SUPABASE_ERROR', message };
}
```

**Caller function** — copy `callCreateStaff` (lines 327-385) verbatim, rename to `callAdminResetPin`, swap schema names, URL segment to `functions/v1/admin-reset-pin`. Uses `getCachedAccessToken()` + raw `fetch()`, NOT `supabase.functions.invoke()` (that client doesn't forward the caller's JWT in this codebase — comment at lines 208-210).

Register in the `EDGE_FUNCTIONS` registry object (lines 1312-1358) following the existing `'create-staff': {...}` entry shape.

---

### `src/shared/lib/audit-actions.ts` (config)

**Analog:** existing `AuditActionSchema` enum entries in the same file.

Add `'permission.admin_pin_reset'` to the enum **before** any `recordAudit()` call uses it. Note: the CI test (`audit-actions.test.ts`) only greps `supabase/migrations/**/*.sql` for `PERFORM record_audit(...)`, NOT `supabase/functions/**/*.ts` for `recordAudit(...)` — there is no automated backstop for this specific entry, so add it manually and carefully (Pitfall 2 in RESEARCH.md). Consider extending the test to grep edge functions too, as a side-quest.

---

### `src/features/admin-reset-pin/model/useAdminResetPin.ts` (hook, request-response mutation)

**Analog:** `src/entities/staff/model/queries.ts`'s `useMutationUpdateStaffRole` / `useMutationUpdateStaffLocale`, and create-staff's own mutation hook.

Pattern: TanStack `useMutation` wrapping `callAdminResetPin()`, `onSuccess` → `queryClient.invalidateQueries(staffKeys.list())` + `toast.success(t('staff:resetPin.successToast', { name }))`, `onError` → branch on error shape: generic failure → `resetPin.genericFailure` toast; if the edge function signals the Pitfall-1 partial-failure state → `resetPin.partialFailureToast` (must render visibly differently, per UI-SPEC).

---

### `src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx` (component, request-response form)

**Analog:** `src/features/create-staff/ui/CreateStaffDialog.tsx` (lines 38-40, 60-84, 108-138) for the PIN/confirm-PIN fields; `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` (lines 18-23, 65-77) reused unmodified for D-03.

**Dual PIN + confirm-PIN state/validation pattern** (`CreateStaffDialog.tsx:38-40,60-84,108-138`):
```typescript
const [pin, setPin] = useState('');
const [confirmPin, setConfirmPin] = useState('');

if (pin !== confirmPin || !PinSchema.safeParse(pin).success) {
  toast.error(t('staff:resetPin.pinMismatch'));
  return;
}

const canSubmit =
  PinSchema.safeParse(pin).success &&
  PinSchema.safeParse(confirmPin).success &&
  pin === confirmPin &&
  !mutation.isPending;
```

Input markup: plain `<Input type="password" inputMode="numeric" maxLength={6} />` — NOT `PINKeypad` (that's reserved for PIN *entry*, this is PIN *assignment* by a keyboard-typing admin, matching `CreateStaffDialog`'s own choice).

**`PinSchema`** (`src/shared/lib/domain.ts:20-23`):
```typescript
export const PinSchema = z.string().length(6).regex(/^\d{6}$/, 'PIN must be exactly 6 digits');
```

**D-03 confirm-before-fire composition — `ManagerPinDialog` reused unmodified** (`ManagerPinDialog.tsx:18-23`):
```typescript
export interface ManagerPinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredAction: StaffAction;
  onSuccess: () => void;
}
```
Compose: `AdminResetPinDialog` collects the new PIN, then on submit opens `<ManagerPinDialog requiredAction="manage_staff" onSuccess={...} />`; the edge-function call fires only from `onSuccess`. `manage_staff` is confirmed admin-only (`rbac.ts` `ADMIN_EXTRA`), so this client-side gate mirrors D-01's server-side admin-only check.

**Typography override (UI-SPEC requirement, not optional):** `DialogTitle` must get `className="font-semibold"` to match `ManagerPinDialog`'s `AlertDialogTitle` weight (600) — the un-overridden default is 500. Field labels use `className="font-normal"` override exactly as `CreateStaffDialog.tsx:96`.

**D-07 collision warning** — non-blocking inline text below confirm-PIN field, `text-sm text-muted-foreground` (same weight as `DialogDescription`, never destructive/red styling), computed client-side against `useStaffList()`'s already `is_active=true`-filtered cache (no separate query — per RESEARCH.md Pitfall 5 recommendation).

---

### `src/features/admin-reset-pin/index.ts` (barrel)

**Analog:** `src/features/force-pin-change/index.ts` — plain re-export barrel, copy shape exactly.

---

### `src/widgets/StaffDashboard/StaffDashboard.tsx` (modify)

**Analog:** same file's existing `forcePinTarget` wiring (button block lines 158-169, state declaration lines 54-57, dialog render lines 237-276/259-265).

**Button placement pattern** (`StaffDashboard.tsx:158-169`) — add a sibling block immediately after this one, before the locale-edit block (lines 170-181):
```tsx
<ProtectedAction action="manage_staff" currentRole={currentRole}>
  <POSButton
    type="button"
    size="sm"
    variant="outline"
    onClick={() => { setResetPinTarget(staff); }}
  >
    {t('staff:actions.resetPin')}
  </POSButton>
</ProtectedAction>
```
State: `const [resetPinTarget, setResetPinTarget] = useState<Staff | null>(null);` (mirrors `forcePinTarget`/`clockInStaff`/`localeTarget`). Dialog render mirrors `ForcePinChangeDialog`'s call:
```tsx
<AdminResetPinDialog
  staff={resetPinTarget}
  open={resetPinTarget !== null}
  onOpenChange={(open) => { if (!open) setResetPinTarget(null); }}
/>
```
Do **not** use `variant="destructive"` — reserved for genuinely irreversible actions elsewhere; D-03's PIN re-entry is the safety gate here, not button color (UI-SPEC).

---

### `e2e/rbac/staff-management.spec.ts` (extend) / new `e2e/rbac/admin-reset-pin.spec.ts`

**Analog:** same file's SM2 (lines 104-136, create-staff → forced-PIN-change flow, mirror for D-04) and SM7/SM8 (direct-fetch-403 pattern, mirror for D-01/D-06 server-side-only checks that can't be reached through the UI).

Seeding/teardown helpers: `e2e/helpers/supabase.ts` — `getServiceClient()`, `seedNewStaffMember()`, `deleteTestStaff()`. Auth helper: `e2e/helpers/auth.ts` — `loginAs(page, 'admin')`.

Coverage needed per RESEARCH.md's REQ map: PINRST-01 (403 for non-admin caller, direct fetch), PINRST-03 (confirm-gate flow through UI), PINRST-04 (must_change_pin → forced screen next login, mirror SM2 exactly), PINRST-06 (inactive target rejected — seed `is_active:false` via service client, hit edge function directly since UI can't produce this row — Pitfall 3), PINRST-08 (admin resets own PIN, logs back in with it).

---

## Shared Patterns

### Edge-function auth preamble (Bearer verify + role lookup)
**Source:** `supabase/functions/create-staff/index.ts:22-59`
**Apply to:** `admin-reset-pin/index.ts` — copy byte-for-byte except the role check becomes single-stage `!== 'admin'` (D-01), not the two-stage `['admin','manager']` gate.

### Flat error envelope `{ error: string }`
**Source:** `create-staff/index.ts` throughout; documented contrast at `edge-function-contracts.ts:315`
**Apply to:** `admin-reset-pin/index.ts` and its contract's error mapper — do not use `process-payment`'s nested `{code,message}` shape.

### `recordAudit()` from edge-function context
**Source:** `supabase/functions/_shared/audit.ts:20-33`, called as in `create-staff/index.ts:143-151`
**Apply to:** `admin-reset-pin/index.ts` — never write raw PIN into `after`; pass `actorId: authUser.id` (unlike create-staff's `null`, since actor ≠ target here).

### Never write `profiles.pin` without `auth.users.encrypted_password` in the same operation, and in that order
**Source:** CLAUDE.md "PIN/password has two separate credential stores" section; `supabase/migrations/20260831000001_clear_must_change_pin_sync_pin_column.sql`
**Apply to:** `admin-reset-pin/index.ts` — `admin.updateUserById()` must succeed before the `profiles.update()` is attempted; on partial failure after success, surface a distinct loud error/audit entry, not a generic one (Pitfall 1).

### `ManagerPinDialog` for any "re-confirm your own PIN" gate
**Source:** `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`
**Apply to:** `AdminResetPinDialog`'s D-03 step — reuse unmodified, do not fork.

### `PinSchema` for all PIN format validation
**Source:** `src/shared/lib/domain.ts:20-23`
**Apply to:** client dialog validation AND edge-function `BodySchema` (both layers validate; server is authoritative).

## No Analog Found

None — every file in this phase has a strong, direct analog per RESEARCH.md's own assessment (near-exact structural clone of `create-staff`).

## Metadata

**Analog search scope:** `supabase/functions/`, `src/features/`, `src/shared/lib/`, `src/widgets/StaffDashboard/`, `e2e/rbac/` (all pre-identified by RESEARCH.md with verified line numbers; no additional Glob/Grep search was needed beyond confirming RESEARCH.md's citations)
**Files scanned:** 8 target files against their pre-identified analogs (all real, already-shipped files)
**Pattern extraction date:** 2026-08-30
