---
status: resolved
trigger: "Fix near-expiry threshold save not persisting"
created: 2026-09-05T16:51:42Z
updated: 2026-09-05T17:43:01Z
---

## Symptoms

- expected: An admin changes the near-expiry threshold, clicks "Save alert window", reloads the page, reopens the Near expiry settings tab, and sees the newly saved value.
- actual: After reload, the input consistently shows the old value (22) instead of the newly submitted value (21).
- error_messages: No explicit error is reported by the test. The component may silently toast an error when the mutation returns `ok: false`.
- timeline: Pre-existing on branch `ui-redesign-fable`; reproduced in the initial Playwright attempt and configured retry, both in the inventory suite and in isolation.
- reproduction: Run `npx playwright test e2e/inventory/near-expiry-alerts.spec.ts --reporter=line`; the test "admin saves the threshold and it persists after reload" deterministically fails with workers=1, fullyParallel=false, retries=1.

## Current Focus

- hypothesis: RESOLVED — the E2E now waits for and asserts the successful settings POST before reloading.
- test: The user-designated acceptance command passed, and revert/reapply verification proved the synchronization hunk controls the failure.
- expecting: Complete; no further verification is required.
- next_action: Archive the resolved session and record the recurrence guard.

reasoning_checkpoint:
  hypothesis: "The spec's immediate reload causes the authenticated save to cross a navigation boundary, so Supabase auth validation fails and the subsequent upsert is unauthorized."
  confirming_evidence:
    - "The trace measured reload 0.766 ms after the Save click completed."
    - "During reload, GET /auth/v1/user returned 403 before POST /rest/v1/settings returned 401, and the database row remained unchanged."
  falsification_test: "If waiting for and asserting the Save-triggered settings POST still produces a 401 before reload, then navigation is not the cause."
  fix_rationale: "Synchronizing the test on the observable successful write response preserves the intended workflow and prevents reload from destroying the request's authenticated execution context."
  blind_spots: "The focused local E2E does not exercise remote Supabase latency or multiple parallel workers; the same response boundary should be timing-independent."
  candidate_causes:
    - "code/test: the spec dispatches Save and reloads without waiting for the resulting settings POST"
    - "environment: an unrelated process can occupy port 1520, affecting reproducibility but not the save race"
    - "data: the persisted threshold could be overwritten or malformed, contradicted by the unchanged pre-test row and valid 21/22 payloads"
  and_gate: "no — the unguarded reload alone reproduces the auth/write failure; the port conflict and data values are not contributing conditions"

tdd_checkpoint:
  test_file: "e2e/inventory/near-expiry-alerts.spec.ts"
  test_name: "admin saves the threshold and it persists after reload"
  status: "green"
  failure_output: "Expected threshold 21 after reload, received 22; on the current checkout the immediate reload additionally causes GET /auth/v1/user 403 and POST /rest/v1/settings 401."

## Evidence

- timestamp: 2026-09-05T16:58:00Z
  checked: Phase 0 semantic recall and local knowledge base fallback
  found: MemPalace CLI is unavailable. The sole knowledge-base entry concerns deployment skew in discount authorization and has no two-token or semantic match to settings persistence.
  implication: No known-pattern hypothesis applies; trace this deterministic failure from first principles.

- timestamp: 2026-09-05T17:02:00Z
  checked: Complete `NearExpirySettingsTab`, its unit tests, `useSettings`/`useMutationUpdateSetting`, and the failing E2E
  found: Save and reload both use the exact key `near_expiry`; the component awaits `mutateAsync`; the mutation upserts `{ key, value, updated_by }` on conflict `key`; a successful result invalidates the same `['settings']` query read after reload.
  implication: A key mismatch and an unawaited client mutation are contradicted. The write's database contract or returned result is more likely than stale client cache.

- timestamp: 2026-09-05T17:02:00Z
  checked: Failure repeatability and Phase 1.25 SBFL eligibility
  found: The E2E fails deterministically on retry, so `bug_class` is `bohrbug`. SBFL is skipped because the failing Playwright flow has no per-test source coverage spectrum paired with passing tests.
  implication: Route through deterministic reproduction and working backwards from the persisted database row.

- timestamp: 2026-09-05T17:02:00Z
  checked: Worktree state
  found: The worktree contains unrelated modified planning/spike files and another active debug file; none overlaps the settings implementation or test.
  implication: Preserve all unrelated edits and restrict any eventual change to the confirmed root-cause files plus this debug session.

- timestamp: 2026-09-05T17:05:00Z
  checked: Settings DDL/RLS and E2E reset/auth flow
  found: `settings.key` is UNIQUE, so `onConflict: 'key'` is valid. Settings writes require the Supabase `authenticated` role plus `get_user_role() = 'admin'`; the E2E PIN flow establishes a Supabase Auth session. `resetTestState()` does not modify settings.
  implication: Schema conflict targeting and reset overwrites are contradicted; write authorization or read hydration remain live candidates.

- timestamp: 2026-09-05T17:05:00Z
  checked: Deterministic reproduction command
  found: The test did not run because Playwright's web server could not bind port 1520; another process already owns it.
  implication: This is an environment blocker for the attempted run, not evidence about the product defect. Reuse or isolate the existing listener safely.

- timestamp: 2026-09-05T17:11:00Z
  checked: Playwright trace network, action timings, and the database row after the failed run
  found: The Save click ended at 6845.683 ms and reload started at 6846.157 ms (0.474 ms later). The entire trace contains only GETs for `/rest/v1/settings`, no POST/PATCH settings write. The service-role read still shows threshold 22 with `updated_at` from before the test.
  implication: The database never received a write. This directly contradicts RLS rejection and stale-read hypotheses and supports navigation canceling the asynchronous save before its first network write.

- timestamp: 2026-09-05T17:11:00Z
  checked: Common bug pattern scan and candidate branches
  found: The matching pattern is Async/Timing (an event initiates async work, then navigation immediately destroys its execution context). Candidate branches span code/test sequencing (reload is unguarded), environment (a foreign Vite server briefly occupied the shared port), and data (valid 21/22 values with unchanged row). The environment issue affects reproducibility only; data shape is valid.
  implication: `bug_class` remains deterministic `bohrbug`, not concurrency; one sequencing defect fully explains the observed failure, so the AND-gate is currently no.

- timestamp: 2026-09-05T17:16:00Z
  checked: Original E2E rerun against a Vite server launched from this checkout
  found: The click ended at 5145.199 ms and reload began at 5145.965 ms (0.766 ms later). During reload, `GET /auth/v1/user` began at 5152.877 ms and returned 403; the client emitted `auth.session_lost`, then `POST /rest/v1/settings` began at 5195.246 ms and returned 401 `AUTH_FORBIDDEN`.
  implication: The unguarded reload causally overlaps and breaks the async save. This confirms the sequencing hypothesis and explains both the unchanged row and the missing post-reload settings UI.

- timestamp: 2026-09-05T17:16:00Z
  checked: Regression-test oracle and minimization
  found: The existing one-test spec is already the minimal end-to-end reproduction. Its oracle is specified: after a successful admin save, reload must hydrate the submitted threshold. The valid adjacent seeds 21 and 22 are already exercised by toggling between them.
  implication: No new test file or property framework is needed; the existing RED test is the TDD checkpoint.

- timestamp: 2026-09-05T17:33:00Z
  checked: TDD green target test after response synchronization
  found: `npx playwright test e2e/inventory/near-expiry-alerts.spec.ts --reporter=line` completed with `1 passed (47.1s)`.
  implication: Waiting for the successful Save-triggered settings POST prevents the premature reload and satisfies the specified persistence oracle.

- timestamp: 2026-09-05T17:38:00Z
  checked: Guardrail signal 5, fix temporarily reverted
  found: With only the response synchronization removed, the focused spec failed once with retries disabled: expected the toggled value 22 after reload but received the prior value 21; the browser also logged `TypeError: Failed to fetch` from Supabase auth.
  implication: The original bug returns when this hunk is absent, directly tying the failure to the missing request boundary.

- timestamp: 2026-09-05T17:43:00Z
  checked: Guardrail signal 5, identical fix reapplied
  found: The focused spec passed again with retries disabled: `1 passed (21.6s)`.
  implication: The bug returns without the synchronization and disappears when the same hunk is restored.

- timestamp: 2026-09-05T17:43:00Z
  checked: Guardrail signals 2–4 and source hygiene
  found: No Stryker package or configuration is installed, so mutation testing is unavailable. The diff only adds the targeted response wait and success assertion; `git diff --check` and Prettier both pass. The changed file is a leaf E2E spec with no held-out importer or adjacent test in the file.
  implication: Mutation and adjacent-test signals are explicitly skipped; the no-op/deletion detector passes and no unrelated behavior was removed.

## Eliminated

- hypothesis: The `near_expiry` write targets the wrong key or invalid JSON shape.
  evidence: The component payload and settings read parser both use `near_expiry`; values 21/22 and discount 15 satisfy the schema.
  timestamp: 2026-09-05T17:16:00Z

- hypothesis: The database upsert cannot conflict on `settings.key` or RLS rejects a valid authenticated admin.
  evidence: `settings.key` is UNIQUE and the write is not attempted while the original authenticated page remains stable; it is attempted only after reload has caused `auth.session_lost`, at which point the observed 401 is expected.
  timestamp: 2026-09-05T17:16:00Z

- hypothesis: A successful write is later hidden by stale React Query hydration.
  evidence: Both traces and the service-role row read show no successful settings write; the unchanged `updated_at` predates the test.
  timestamp: 2026-09-05T17:16:00Z

- hypothesis: Port-1520 ownership is the product root cause.
  evidence: After the foreign listener disappeared, the current checkout reproduced the same save/reload failure and exposed the auth/write race.
  timestamp: 2026-09-05T17:16:00Z

## Resolution

root_cause: "The focused Playwright spec reloads 0.766 ms after dispatching Save without waiting for the asynchronous Supabase mutation to succeed. The save's `getUser()` validation then runs during navigation, receives 403 and signs the client out; its subsequent settings upsert runs anonymously and returns 401, so `near_expiry` remains unchanged."
fix: "Wait for the Save-triggered POST to `/rest/v1/settings` and assert its response is successful before reloading."
verification:
  target_test: { result: pass }
  mutation_check: { result: skipped, reason_if_skipped: "No Stryker dependency or configuration is installed.", mutant_killed: null }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false }
  adjacent_tests: { result: skipped, reason_if_skipped: "The changed file is a leaf one-test E2E spec; no held-out test imports it or shares its test body.", suites_run: [] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  source_hygiene: { diff_check: pass, prettier: pass }
  guardrail_verdict: accepted
files_changed: ["e2e/inventory/near-expiry-alerts.spec.ts"]
oracle_type: "specified"

## Prevention

- code/test branch: Playwright's click auto-wait ends when the click action completes, not when the application's asynchronous mutation completes. The spec immediately reloaded without an observable write-success boundary, allowing navigation to invalidate authentication before the upsert.
- environment branch: A foreign process occupying port 1520 temporarily blocked reproduction, but a clean checkout-owned Vite server reproduced the same request race. It was not part of the root-cause AND-gate.
- data branch: Alternating valid values 21 and 22 ruled out malformed or special-case threshold data. It was not part of the root-cause AND-gate.
- why_not_caught: Code review and the E2E test contract did not require an explicit successful network response before navigation; Playwright's action auto-wait made the click look synchronized when the mutation was still in flight.
- recurrence_guard: The regression test `e2e/inventory/near-expiry-alerts.spec.ts: admin saves the threshold and it persists after reload` now waits for the Save-triggered settings POST and asserts `response.ok()` before reload. The exact acceptance command passes.
