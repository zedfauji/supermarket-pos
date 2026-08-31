# Phase 22: Admin PIN Reset (Server-Side Recovery Path) - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

An admin can reset a staff member's PIN from the Staff page even when that staff member has
genuinely forgotten their current PIN and cannot log in at all. This is a new, privileged
cross-account credential write: a Supabase Edge Function (service-role key held server-side only)
verifies the caller is an admin from their JWT, then calls
`admin.updateUserById(target, { password: newPin })` and writes `public.profiles.pin` in the same
operation — the two PIN stores must never diverge, per the two-incident RCA that motivated this
phase.

Out of scope: changing the existing "Force PIN Change" action (stays as a separate, distinct
action), any new self-service "forgot PIN" flow for a fully logged-out staff member (this remains
an in-app, admin-mediated recovery path only — there is no path for a locked-out admin to recover
themselves without another admin or direct DB access), PIN uniqueness enforcement beyond a
same-screen warning (no DB constraint), and rotating the remote Supabase database password (a
different, unrelated credential — reviewed and explicitly not folded into this phase).

</domain>

<decisions>
## Implementation Decisions

### Role gate
- **D-01:** Only the `admin` role can call the reset; an admin can target any staff member
  including other admins. No manager-tier access, no target-role restriction. Simpler than
  `create-staff`'s escalation guard (which lets manager create cashier/kitchen accounts) —
  deliberately stricter here because this is a live-credential overwrite on an existing account,
  not account creation.

### New PIN source
- **D-02:** The admin types a specific new 6-digit PIN for the staff member in the reset dialog —
  same UX as the existing "Add Staff" flow (`CreateStaffDialog`), not a system-generated random
  PIN.

### Confirm-before-fire gate
- **D-03:** The acting admin must re-enter **their own** PIN (reusing the `ManagerPinDialog`
  component/pattern) immediately before the reset edge-function call fires. This is in addition to
  already being authenticated as admin — an extra guard on the single most privileged cross-account
  write in the app. — **Reversibility:** reversible — purely a UI/flow gate, no schema or contract
  dependency; removing it later is a local change.

### Post-reset staff flow
- **D-04:** The reset always sets `profiles.must_change_pin = true`. The staff member logs in once
  with the admin-set PIN, then is forced through the existing forced-change screen
  (`PINLoginForm.tsx`) to pick their own new PIN — matches `create-staff` and `force-pin-change`
  precedent exactly. Do not skip this even though the admin already chose a PIN.

### Relation to Force PIN Change
- **D-05:** "Force PIN Change" (`force_pin_change` RPC, flags `must_change_pin=true` only, requires
  the staff member to already know and use their current PIN) stays as a separate, unmodified
  action. "Reset PIN" is a new, second action for the genuinely-locked-out case — different
  problems, different tools, both remain on the Staff page.

### Inactive-staff guard
- **D-06:** Reset PIN is blocked for a staff member with `profiles.is_active = false`. The admin
  must reactivate the profile first (existing reactivation path) before the reset action becomes
  available for that row.

### PIN collision check
- **D-07:** The reset dialog warns (non-blocking) if the entered PIN matches another **active**
  staff member's current `profiles.pin` — new validation, going beyond today's `create-staff`
  precedent (which does not check for collisions at all). This warning applies only to the new
  Reset PIN dialog, not retroactively to Add Staff.

### Self-target
- **D-08:** An admin can use this flow to reset their own PIN — no special-case block. If it works
  for any other staff row, it works for the admin's own row too; one less edge case to guard.

### Claude's Discretion
- Exact edge function name/route (e.g. `admin-reset-pin` or `reset-staff-pin`) — follow the
  existing kebab-case convention (`create-staff`, `receive-shipment`).
- Exact audit action string — ROADMAP suggests `permission.admin_pin_reset`; must be added to
  `AuditActionSchema` (`src/shared/lib/audit-actions.ts`) before any `record_audit()` call uses it,
  per that file's own stated convention (CI greps for this).
- Exact placement of the "Reset PIN" button/menu item relative to the existing "Force PIN Change"
  action on the Staff page row/detail UI.
- Whether the PIN-collision check (D-07) runs client-side against the already-fetched staff list
  or via a dedicated query — no precedent either way in this codebase for this kind of check.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & exploration record
- `.planning/ROADMAP.md` "### Phase 22: Admin PIN Reset (Server-Side Recovery Path)" section —
  phase goal statement, the "must not embed service-role key in Tauri client" constraint, and the
  suggested audit action name
- `.planning/notes/vinty-owner-login-outage-rca.md` — full RCA for the incident that motivated this
  phase; **Incident 2** documents the exact "two separate PIN credential stores can silently
  diverge" failure mode this phase's edge function must avoid by writing both stores atomically
- `CLAUDE.md` "PIN/password has two separate credential stores" section — the standing project rule
  derived from the RCA: `public.profiles.pin` (client-side pre-flight UX check) and
  `auth.users.encrypted_password` (real GoTrue credential) must always be written together, never
  one without the other
- `CLAUDE.md` "Never create or repair an `auth.users` row with a raw INSERT/UPDATE" section —
  mandates going through `supabase.auth.admin.updateUserById()` / `createUser()`, never raw SQL;
  directly governs how this phase's edge function must write the new password

### Pattern precedent
- `supabase/functions/create-staff/index.ts` — closest existing edge-function pattern to model the
  new reset function on: Bearer-JWT verification via a direct `/auth/v1/user` fetch (not
  `admin.auth.getUser()`, which fails on ES256-signed tokens in this supabase-js version), a single
  reused `supabaseAdmin` client for both the role lookup and the privileged write, a role-escalation
  guard shape (relevant precedent even though D-01 chose a simpler admin-only gate), and a flat
  `{ error: string }` error envelope (see `edge-function-contracts.ts:315` comment contrasting it
  with `process-payment`'s nested envelope)
- `supabase/migrations/20260831000001_clear_must_change_pin_sync_pin_column.sql` — the just-applied
  (uncommitted) fix for Incident 3: `clear_must_change_pin` now writes `profiles.pin` and
  `profiles.must_change_pin` atomically in one `SECURITY DEFINER` statement. This is the same
  "atomic dual-write" principle this phase's edge function must apply across the `auth.users` /
  `profiles` boundary instead of within `profiles` alone.
- `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` — the PIN re-confirm dialog pattern for
  D-03 (`AlertDialog` + `PINKeypad` from `@shared/ui`, staff list via `useStaffList()`)
- `src/shared/lib/audit-actions.ts` — `AuditActionSchema`, single source of truth for valid
  `record_audit()` action strings; CI (`audit-actions.test.ts`) fails if a used action isn't
  enumerated here first
- `src/shared/lib/rbac.ts` — RBAC action definitions; confirm whether a new action (e.g.
  `reset_staff_pin`) is warranted or whether the admin-only gate (D-01) is enforced purely
  server-side in the edge function without a new client-side RBAC action
- `src/shared/lib/edge-function-contracts.ts` — where new edge function request/response types and
  the client-side call wrapper belong (see `create-staff`'s contract around line 315-341 as the
  template)

No formal SPEC.md or REQUIREMENTS.md entries exist yet for Phase 22 — requirements are TBD per
ROADMAP.md, to be derived during `/gsd-plan-phase 22` from the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ManagerPinDialog` (`src/features/manager-pin-gate/ui/ManagerPinDialog.tsx`) — reuse directly for
  D-03's confirm-before-fire gate (the acting admin re-entering their own PIN).
- `create-staff` edge function (`supabase/functions/create-staff/index.ts`) — reuse its
  Bearer-JWT-verify + service-role-client + role-lookup skeleton wholesale; only the target-account
  logic changes (`admin.updateUserById` instead of `admin.createUser`, plus the `profiles.pin` +
  `must_change_pin` sync).
- `useStaffList()` — existing hook already used by `ManagerPinDialog` and the Staff page; source for
  both the target-staff picker and the D-07 collision check.
- `recordAudit` helper (`supabase/functions/_shared/audit.ts`) — already used by `create-staff` for
  server-side audit writes from an edge function context.

### Established Patterns
- Edge functions in this codebase verify the caller's Bearer JWT via a direct `/auth/v1/user` fetch
  (not `supabase-js`'s `admin.auth.getUser()`), then use one `supabaseAdmin` client (service-role)
  for both the profile role lookup and the privileged write.
- RBAC/role checks for privileged actions are enforced server-side inside the edge function itself
  (see `create-staff`'s `callerProfile.role` check), not just client-side UI gating — this phase's
  admin-only gate (D-01) must be enforced the same way, not merely hidden behind a client-side RBAC
  check.
- Audit action enum (`src/shared/lib/audit-actions.ts`) must have any new action string added before
  it's used in a `record_audit()`/`recordAudit()` call — CI enforces this.
- Every privileged credential-store write in this codebase must update `public.profiles.pin` and
  `auth.users.encrypted_password` together, in the same operation — this is now a hard project rule
  (CLAUDE.md), not just a suggestion, following two production incidents.

### Integration Points
- Staff page (`src/pages/StaffPage` or wherever the existing "Force PIN Change" action lives) is
  where the new "Reset PIN" action/button is added, per D-05, alongside the existing action.
- `edge-function-contracts.ts` needs a new request/response contract + client call wrapper for the
  new edge function, following the `create-staff` contract's shape.
- E2E: per this repo's mandatory-automated-testing policy, the reset flow (role gate, confirm gate,
  must_change_pin follow-through, inactive-staff block, collision warning) needs new Playwright
  coverage — likely under `e2e/rbac/` or `e2e/staff/`-adjacent, mirroring how `create-staff` and
  `force-pin-change` are already covered.

</code_context>

<specifics>
## Specific Ideas

No UI mockups given. The user confirmed reusing the `ManagerPinDialog` chrome for the
confirm-before-fire step (D-03) rather than inventing new dialog styling.

</specifics>

<deferred>
## Deferred Ideas

None new — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- **Rotate remote Supabase database password** (`.planning/todos/pending/rotate-remote-supabase-db-password.md`) —
  matched Phase 22 on generic keywords (supabase/database/password) but is a distinct concern (the
  project's own DB connection password, an infra credential, not a staff member's login PIN).
  Reviewed and explicitly not folded — remains a separate pending todo.

</deferred>

---

*Phase: 22-admin-pin-reset-server-side-recovery-path*
*Context gathered: 2026-08-30*
