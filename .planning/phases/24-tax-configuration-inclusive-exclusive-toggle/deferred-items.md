# Phase 24 — Deferred Items (out of scope for this plan)

## Pre-existing local-DB auth credential drift (found during 24-01 Task 2)

**Discovered:** 2026-08-31, during 24-01 Task 2's `npm run test` full-suite verification run.

**Symptom:** 3 unit test failures, all in files never touched by this plan:
- `src/entities/staff/model/queries.clock.test.ts` — `useShiftClosePreview`/`useMutationClockOut`
- `src/features/close-tab/tests/useCloseTab.test.ts` — `useCloseTab`

**Root cause (confirmed, not speculative):** these integration tests `signInWithPassword`
against the seeded staff account `alex@barpos.dev` / `123456` on the local self-hosted Supabase
stack. Direct verification via a standalone script confirms the local auth stack rejects this
login with `Invalid login credentials` — the account's password hash in this local dev DB no
longer matches the hardcoded test password, independent of anything in this plan. Every
assertion downstream of that failed sign-in (RLS-gated mutations silently running unauthenticated)
then fails as a consequence, not a cause.

**Why this is out of scope for 24-01:** neither test file, nor `close_tab`/`clock_out`/shift
RPCs, nor `alex@barpos.dev`'s credentials were touched by any task in this plan. This plan's own
verification surface (`edge-tax.test.ts`, `billing-settings.test.ts`, `PaymentForm.test.tsx`,
`e2e/checkout/tax-inclusive-mode.spec.ts`) is fully green. Per the executor's scope-boundary rule,
pre-existing failures in unrelated files are logged, not fixed, here.

**Suggested fix (for whoever picks this up):** reset `alex@barpos.dev`'s password on the local
stack via `supabase.auth.admin.updateUserById` (see CLAUDE.md's "PIN/password has two separate
credential stores" section for the correct dual-write pattern if `profiles.pin` also needs
realigning), or reseed the local dev DB's auth users from the documented seed script.

**Verification of pre-existing-ness:** confirmed the local DB was already in a slightly
inconsistent state before this plan ran — `supabase_migrations.schema_migrations` showed a
`20260831001057 / concurrent_agent_placeholder` row (not a real repo migration file) at the top of
the applied list, and `20260831000004_caja_report_bank_transfer_breakout.sql` (a real file already
committed to the repo from prior work) was *not yet applied* to this local DB before this plan's
Task 2 ran — both signs of unrelated environment drift predating this session.
