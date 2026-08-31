---
phase: 22-admin-pin-reset-server-side-recovery-path
verified: 2026-08-31T01:00:00Z
status: gaps_found
score: 9/10 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "If profiles.update() fails after admin.updateUserById() already succeeded, the edge function returns a distinct, non-generic error and writes an audit entry describing the partial-divergence state, instead of silently matching a routine failure (Pitfall 1)."
    status: partial
    reason: >
      The code path is present and correctly ordered (auth.users write first, profiles write second,
      PARTIAL_FAILURE-prefixed 500 + explicit partial-failure recordAudit() call on the second write's
      failure — supabase/functions/admin-reset-pin/index.ts:112-156). But no automated test exercises
      this branch against a genuine failure: edge-function-contracts.test.ts only unit-tests the
      CLIENT-SIDE string-mapping function (mapAdminResetPinEdgeError('PARTIAL_FAILURE: ...') ->
      PIN_RESET_PARTIAL_FAILURE) given a canned message — it never invokes the edge function itself.
      No E2E test (SM9-SM12) forces a genuine "auth write succeeds, profiles write fails" condition;
      all four only exercise the full-success or full-rejection-before-any-write paths. 22-REVIEW.md's
      claim that this is "unit-tested end-to-end" overstates what the test actually covers — it tests
      the mapper, not the server branch that produces the mapped string. This is the specific failure
      mode (Incident 2/3-style credential-store divergence) this phase exists to prevent, so leaving it
      without any automated proof of correct runtime behavior contradicts this project's CLAUDE.md
      "Testing & Verification Policy" (every behavior must have automated proof; code-inspection
      confidence alone is not sufficient, and manual/human verification is explicitly banned as a
      terminal state here).
    artifacts:
      - path: "supabase/functions/admin-reset-pin/index.ts"
        issue: "Partial-failure branch (lines 131-156) has zero automated test coverage of its actual execution"
      - path: "src/features/admin-reset-pin/ui/AdminResetPinDialog.test.tsx"
        issue: "No test drives handleConfirmedReset's PIN_RESET_PARTIAL_FAILURE or generic-failure toast branches (also flagged as 22-REVIEW.md WR-02) — mutateAsyncMock is already mocked and trivially returnable as Err(...), so this half is cheap to close"
    missing:
      - "A test that forces the edge function's profiles.update() to fail after auth.users.updateUserById() succeeds, and asserts: (a) the response is a 500 with a PARTIAL_FAILURE-prefixed error, (b) an audit_logs row with action='permission.admin_pin_reset' and after->>'partialFailure'='true' was written, (c) auth.users' password WAS changed (proving the divergence, not a rollback). This needs either: a Deno-level test with an injectable/mockable Supabase client (would require refactoring index.ts's inline Deno.serve handler into a testable function), or a targeted E2E that induces a real profiles-write failure (e.g. a temporary trigger/constraint on a disposable fixture row) while the auth write is expected to still succeed."
      - "AdminResetPinDialog.test.tsx cases for both toast branches (mutateAsyncMock resolving to Err with code PIN_RESET_PARTIAL_FAILURE vs. a generic error), per 22-REVIEW.md WR-02 — this part is straightforward to add with existing test scaffolding and does not require any edge-function changes."
human_verification: []
---

# Phase 22: Admin PIN Reset (Server-Side Recovery Path) Verification Report

**Phase Goal:** A manager/admin can reset a staff member's PIN from the Staff page even when that
staff member has genuinely forgotten their current PIN and cannot log in at all — closing the
recovery gap documented in `.planning/notes/vinty-owner-login-outage-rca.md`, via a new server-side
`admin-reset-pin` Supabase Edge Function (service-role key held server-side only) that writes
`auth.users.encrypted_password` and `public.profiles.pin`/`must_change_pin` together.

**Verified:** 2026-08-31T01:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Only role=admin can call admin-reset-pin; manager/cashier/unauthenticated rejected before any write (D-01) | ✓ VERIFIED | `supabase/functions/admin-reset-pin/index.ts:58-69` single-stage `role !== 'admin'` gate; `e2e/rbac/staff-management.spec.ts` SM10 — re-ran directly, confirmed 403 for both cashier and manager, 401 unauthenticated, target `profiles.pin` unchanged after each attempt |
| 2 | Admin types a specific 6-digit PIN for the target — system never generates it (D-02) | ✓ VERIFIED | `AdminResetPinDialog.tsx` uses controlled `<Input type="password" maxLength={6}>` fields (not `PINKeypad`/generator); `BodySchema` requires `newPin` to match `/^\d{6}$/`; SM9 types `SM9_NEW_PIN` literally |
| 3 | Acting admin must re-enter their own PIN via reused `ManagerPinDialog` immediately before the edge function call, in addition to existing session (D-03) | ✓ VERIFIED | `AdminResetPinDialog.tsx:158-165` — mutation only invoked from `ManagerPinDialog`'s `onSuccess`; `AdminResetPinDialog.test.tsx` "clicking the dialog submit button never calls the mutation directly" test (mutateAsyncMock 0 calls until gate fires); SM9/SM12 e2e drive the real `ManagerPinDialog` PIN entry before success |
| 4 | Successful reset writes `auth.users.encrypted_password` then `profiles.pin`+`must_change_pin=true`, auth.users first; target forced through must-change-PIN on next login (D-04) | ✓ VERIFIED | `index.ts:112-134` — write order confirmed by direct code read (auth.users write, early-return on its own failure, then profiles write); SM9 e2e: login with `SM9_NEW_PIN` after reset lands on the forced-change screen |
| 5 | Force PIN Change (`force_pin_change` RPC) completely unmodified; Reset PIN is new/additional/separately reachable (D-05) | ✓ VERIFIED | `git diff`/plan `files_modified` list excludes `force_pin_change` source; `npx vitest run src/features/force-pin-change` — 4/4 pass unmodified (re-ran); `StaffDashboard.tsx:160-183` — sibling `ProtectedAction` blocks, distinct buttons |
| 6 | Reset rejected server-side for `is_active=false` target, independent of UI (D-06) | ✓ VERIFIED | `index.ts:93-110` — explicit `is_active` check -> 400; SM11 e2e (re-ran) — 400, `pin` unchanged, target seeded+deactivated via `getServiceClient()` directly (no UI path exists, matching Pitfall 3) |
| 7 | Non-blocking collision warning vs. another ACTIVE staff member's current PIN, never on target's own PIN, never disables submit (D-07) | ✓ VERIFIED | `AdminResetPinDialog.tsx:57,126-130` — `s.id !== staff?.id` exclusion; `AdminResetPinDialog.test.tsx` — collision-warning-rendered and no-warning-on-own-PIN cases both pass, submit stays enabled in the collision case |
| 8 | Admin can Reset PIN on their own row, no special-case block anywhere (D-08) | ✓ VERIFIED | `index.ts:90-92` — explicit comment + no self-target branch; SM12 e2e (re-ran) — disposable admin resets own PIN end to end, forced-change screen on relogin |
| 9 | Partial-failure divergence (auth.users succeeds, profiles fails) returns distinct error + writes divergence audit entry, not a silent generic failure (Pitfall 1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present and structurally correct (`index.ts:131-156`); only the *client-side string-mapping function* is unit-tested (`edge-function-contracts.test.ts` "maps a PARTIAL_FAILURE-prefixed message..."), not the edge function's actual execution of this branch under a genuine failure. No E2E/unit test forces `profiles.update()` to fail after `auth.users` succeeds. See Gaps below. |
| 10 | `recordAudit()` action strings in edge functions are enumerated before use, closing the CI gap that previously only scanned SQL migrations (Pitfall 2) | ✓ VERIFIED | `src/shared/lib/__tests__/audit-actions.test.ts` new test "every recordAudit() call in edge functions uses an enumerated action" — re-ran, passes; `audit-actions.ts` has `'permission.admin_pin_reset'` entry preceding the edge function's call |

**Score:** 9/10 truths verified (1 present + wired, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/functions/admin-reset-pin/index.ts` | Admin-only edge function, dual write, guards, audit | ✓ VERIFIED | Exists, substantive (171 lines, no stubs), correctly structured |
| `src/features/admin-reset-pin/ui/AdminResetPinDialog.tsx` | Reset-PIN dialog with confirm gate | ✓ VERIFIED | Exists, substantive, wired into `StaffDashboard.tsx` |
| `src/features/admin-reset-pin/model/useAdminResetPin.ts` | Mutation hook | ✓ VERIFIED | Exists, substantive, wired into dialog, invalidates `staffKeys.list()` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `admin-reset-pin/index.ts` `recordAudit()` | `audit-actions.ts` `AuditActionSchema` | `'permission.admin_pin_reset'` string literal | ✓ WIRED | Enum entry present at `audit-actions.ts:51`; CI-gate test passes |
| `callAdminResetPin()` | `supabase/functions/admin-reset-pin/` | POST `{VITE_SUPABASE_URL}/functions/v1/admin-reset-pin` | ✓ WIRED | Route segment `admin-reset-pin` matches directory name exactly (`edge-function-contracts.ts:439`) |
| `AdminResetPinDialog` submit | `ManagerPinDialog.onSuccess` | confirm-before-fire gate | ✓ WIRED | `mutation.mutateAsync` called only inside `handleConfirmedReset`, itself only reachable from `onSuccess` |
| `StaffDashboard` "Reset PIN" button + `ManagerPinDialog` | `rbac.ts` `manage_staff` (admin-only) | `ProtectedAction action="manage_staff"` / `requiredAction="manage_staff"` | ✓ WIRED | `rbac.ts` confirms `manage_staff` is in `ADMIN_EXTRA` (admin-only) |

### Behavioral Spot-Checks / Test Re-Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit suite (contracts, audit-actions scan, dialog, force-pin-change regression) | `npx vitest run src/shared/lib/edge-function-contracts.test.ts src/shared/lib/__tests__/audit-actions.test.ts src/features/admin-reset-pin src/features/force-pin-change` | 4 files / 62 passed, 2 todo | ✓ PASS |
| E2E RBAC suite (SM9-SM12) | `npx playwright test e2e/rbac/staff-management.spec.ts -g "SM9\|SM10\|SM11\|SM12"` | 4 passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | clean | ✓ PASS |
| Lint (`src` scope) | `npm run lint` | clean, 0 warnings | ✓ PASS |
| Partial-failure (Pitfall 1) server-side branch execution | *(none exists)* | not run | ? SKIP — no test forces this condition; see Gaps |

Note on `PIN_RESET_PARTIAL_FAILURE` type: `edge-function-contracts.ts` imports the legacy, loosely-typed
`AppError` (`code: string`) from `supabase-contracts.ts` for this contract block — not the strict
`AppErrorCode` union in `result.ts`, which does **not** include `PIN_RESET_PARTIAL_FAILURE`. This looked
like a type-safety bug at first read but is confirmed pre-existing precedent: `mapCreateStaffEdgeError`
and every other edge-function mapper in this same file use the identical loose type. Not a phase-22
defect — verified by direct `tsc --noEmit` run (clean).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PINRST-01 | 22-01 | Admin-only role gate, server-side | ✓ SATISFIED | SM10 (403/401), `index.ts:58-69` |
| PINRST-02 | 22-01 | Admin types the new PIN | ✓ SATISFIED | `AdminResetPinDialog.tsx` Input fields, `BodySchema` regex |
| PINRST-03 | 22-01 | Confirm-before-fire re-auth gate | ✓ SATISFIED | Unit test + SM9/SM12 |
| PINRST-04 | 22-01 | Forced PIN-change on next login | ✓ SATISFIED | SM9 e2e |
| PINRST-05 | 22-01 | Force PIN Change unmodified, Reset PIN additional | ✓ SATISFIED | force-pin-change regression suite unmodified + passing |
| PINRST-06 | 22-01 | Inactive-target guard, server-side | ✓ SATISFIED | SM11 e2e |
| PINRST-07 | 22-01 | Non-blocking collision warning | ✓ SATISFIED | Dialog unit tests |
| PINRST-08 | 22-01 | Self-target, no special case | ✓ SATISFIED | SM12 e2e |

All 8 formal PINRST-01..08 requirement IDs are satisfied with automated-test evidence. The gap
identified above (Pitfall 1's partial-failure branch) is a plan-level `must_haves.truths` item derived
from RESEARCH.md, not one of the 8 formally numbered requirements — but per this verifier's mandate,
plan-level must-haves are still binding and cannot be silently dropped.

No orphaned requirements found in `.planning/REQUIREMENTS.md` for Phase 22 beyond PINRST-01..08.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any of the phase's modified/created
files (`supabase/functions/admin-reset-pin/index.ts`, `src/features/admin-reset-pin/**`,
`src/shared/lib/edge-function-contracts.ts`, `src/shared/lib/audit-actions.ts`,
`src/widgets/StaffDashboard/StaffDashboard.tsx`). No hardcoded-empty-data or console.log-only stub
patterns found.

Two review-flagged warnings (22-REVIEW.md, non-blocking on their own per this verifier's instructions,
but noted here because they compound the Truth-9 gap above):

- **WR-01**: `ManagerPinDialog` confirm gate stays open (PIN keypad disabled, no visible error) after a
  reset failure — `handleConfirmedReset` only closes the gate on the success path
  (`AdminResetPinDialog.tsx:64-82`). Deviates from the `RefundSheet.tsx` prior-art pattern this dialog's
  own tests cite.
- **WR-02**: Zero test coverage for the failure/partial-failure toast branches in
  `AdminResetPinDialog.test.tsx` — directly related to the Truth-9 gap; this half is trivial to close
  with the existing `mutateAsyncMock` scaffolding (mock an `Err(...)` resolution, assert
  `toastErrorMock` called with the right key).

### Human Verification Required

None. Per this project's `CLAUDE.md` "Testing & Verification Policy — NON-NEGOTIABLE",
`human_needed` is not a valid terminal state and every check must be automatable. The one item that
would otherwise route to human verification (Truth 9 / Pitfall 1's partial-failure branch) is instead
recorded as an actionable **gap** requiring additional automated test coverage (Deno-level test with an
injectable client, or a targeted E2E/DB-level failure injection), not manual sign-off.

### Gaps Summary

9 of 10 plan-level must-have truths are verified with real, re-executed automated evidence (all 4 new
Playwright tests re-run and passing, the full relevant Vitest suite re-run and passing, typecheck and
lint re-run clean). All 8 formally numbered requirements (PINRST-01..08) have automated-test evidence
and are legitimately satisfiable as complete.

The one gap: the edge function's **partial-failure / credential-divergence branch** (Pitfall 1 — the
specific failure mode this phase exists to prevent, per the RCA note it cites) has zero automated proof
that it actually executes correctly at runtime. What exists today only proves the *client-side string
parser* correctly classifies a canned `PARTIAL_FAILURE:`-prefixed message — it does not prove the
*server* ever produces that message correctly when `profiles.update()` genuinely fails after
`auth.users.admin.updateUserById()` genuinely succeeds. 22-REVIEW.md's summary overstates this as
"unit-tested end-to-end," which isn't accurate on inspection. Given this project's explicit,
non-negotiable policy that every behavior needs automated proof (not code-inspection confidence) and
that manual verification is banned outright, this is flagged as a gap rather than accepted on
inspection or routed to a human-verification checkpoint.

This does not block the core recovery-path guarantee (admin resets a locked-out staff member's PIN
through the happy path, proven end to end by SM9) — it blocks confidence in the specific defense this
phase added against repeating Incident 2/3's credential-store-divergence failure mode under a real
partial-write failure.

---

*Verified: 2026-08-31T01:00:00Z*
*Verifier: Claude (gsd-verifier)*
