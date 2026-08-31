# Phase 22: Admin PIN Reset (Server-Side Recovery Path) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 22-admin-pin-reset-server-side-recovery-path
**Areas discussed:** Role gate, New PIN source, Confirm-before-fire gate, Post-reset staff flow, Relation to Force PIN Change, Inactive-staff guard, PIN collision check, Self-target

---

## Todo fold check (pre-discussion)

| Option | Description | Selected |
|--------|-------------|----------|
| No — unrelated | DB password rotation is infra hygiene, not part of admin-PIN-reset | ✓ |
| Yes — fold it in | Handle the DB password rotation as part of this phase's work | |

**User's choice:** No — unrelated
**Notes:** "Rotate remote Supabase database password" todo scored a loose keyword match (supabase/password) but targets a different credential (the project DB connection password, not a staff PIN). Left pending, untouched.

---

## Role gate

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-only, any staff | Only admin role can call the reset; can target any staff member incl. other admins | ✓ |
| Manager+ reset lower roles, admin resets anyone | Mirrors create-staff's exact escalation guard | |
| Manager+ can reset anyone | Any manager or admin can reset any staff member's PIN | |

**User's choice:** Admin-only, any staff
**Notes:** Stricter than create-staff's escalation guard, deliberately — this overwrites a live credential on an existing account, not account creation.

---

## New PIN source

| Option | Description | Selected |
|--------|-------------|----------|
| Admin types a specific PIN | Same UX as the existing 'Add Staff' dialog | ✓ |
| System generates a random PIN, shown once | Avoids weak/reused PINs, closer to typical password-reset UX | |

**User's choice:** Admin types a specific PIN

---

## Confirm-before-fire gate

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — ManagerPinDialog-style re-confirm | Acting admin re-enters their own PIN right before the reset fires | ✓ |
| No — RBAC-gated access is enough | Being logged in as admin is itself the gate, no extra re-confirm | |

**User's choice:** Yes — ManagerPinDialog-style re-confirm

---

## Post-reset staff flow

| Option | Description | Selected |
|--------|-------------|----------|
| must_change_pin = true | Staff logs in once with admin-set PIN, then forced to pick their own | ✓ |
| Admin's PIN stands permanently | No forced follow-up | |

**User's choice:** must_change_pin = true

---

## Relation to Force PIN Change

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both, separate actions | Force PIN Change stays; Reset PIN is a second, distinct action | ✓ |
| Reset PIN absorbs/replaces it | Remove or hide the old Force PIN Change entry | |

**User's choice:** Keep both, separate actions

---

## Inactive-staff guard

| Option | Description | Selected |
|--------|-------------|----------|
| Blocked — reactivate first | Reset unavailable for inactive staff | ✓ |
| Allowed regardless | No active-status check | |

**User's choice:** Blocked — reactivate first

---

## PIN collision check

| Option | Description | Selected |
|--------|-------------|----------|
| No check — same as Add Staff today | Add Staff doesn't check for collisions today, Reset PIN follows same precedent | |
| Warn on collision | Flag if entered PIN matches another active staff member's PIN | ✓ |

**User's choice:** Warn on collision

---

## Self-target

| Option | Description | Selected |
|--------|-------------|----------|
| Allowed, no special case | If admin is logged in, self-target just works like any other target | ✓ |
| Blocked | Reset PIN explicitly can't target your own account | |

**User's choice:** Allowed, no special case

---

## Claude's Discretion

- Exact edge function name/route (e.g. `admin-reset-pin` vs `reset-staff-pin`)
- Exact audit action string (ROADMAP suggests `permission.admin_pin_reset`)
- Exact placement of the "Reset PIN" button/menu item relative to "Force PIN Change" on the Staff page
- Whether the PIN-collision check (D-07) runs client-side against the already-fetched staff list or via a dedicated query

## Deferred Ideas

None new — discussion stayed within phase scope. "Rotate remote Supabase database password" todo reviewed and not folded (see Todo fold check above).
