# Phase 5: Delete void-order feature - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16
**Phase:** 5-delete-void-order-feature
**Areas discussed:** RBAC removal, Edge function, Test cleanup

---

## RBAC removal

| Option | Description | Selected |
|--------|-------------|----------|
| New DELETE migration + drop from Action union | Write a new forward migration deleting the void_order rows from role_permissions, and remove 'void_order' entirely from the Action type/ACTIONS array in rbac.ts | ✓ |
| DELETE migration only, keep the Action type | Remove the DB rows but leave 'void_order' in the Action union as a reserved/unused value | |

**User's choice:** New DELETE migration + drop from Action union (recommended option).
**Notes:** The seeding migration (`20260510000001_rls_rewrite_phase13.sql`) is historical and can't be edited — removal requires a new forward migration.

---

## Edge function

| Option | Description | Selected |
|--------|-------------|----------|
| Delete the whole folder | No live callers after the client-side removal; nothing else needs it | ✓ |
| Something else | User would explain a reason to keep it | |

**User's choice:** Delete the whole folder (recommended option).
**Notes:** None.

---

## Test cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Full sweep — delete feature's own tests, update every incidental reference | Delete useVoidOrder.test.tsx/VoidOrderDialog.test.tsx with the feature folder; update contract-registry/RBAC/audit-coverage tests; re-run the full suite | ✓ |
| Just the feature + E2E spec, let CI catch the rest | Delete the feature folder and E2E spec; leave fixing resulting test failures to be discovered by running npm run test | |

**User's choice:** Full sweep (recommended option).
**Notes:** Scout confirmed `seedVoidableOrder` (e2e/helpers/supabase.ts) is only used by the spec being deleted, so it's included in the sweep.

---

## Claude's Discretion

- Exact form of the "automated grep/lint check returns zero matches" verification mechanic (Success Criteria #2) — a one-off grep run vs. a persisted script.
- Commit granularity for the phase's changes.

## Deferred Ideas

None — discussion stayed within phase scope.
