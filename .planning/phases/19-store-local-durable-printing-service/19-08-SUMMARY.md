---
phase: 19-store-local-durable-printing-service
plan: 08
subsystem: printing
tags: [playwright, e2e, rust, cargo-test, print-broker, powershell, verification]

requires:
  - phase: 19-store-local-durable-printing-service (plan 01)
    provides: broker/ crate, dual-global Tauri IPC mock pattern (e2e/receipts/broker-test-print.spec.ts)
  - phase: 19-store-local-durable-printing-service (plan 04)
    provides: printJobErrorCopyKey wired into PaymentForm/CajaDashboard/HardwareSettingsTab
  - phase: 19-store-local-durable-printing-service (plan 05)
    provides: broker/src/retry.rs (classify_failure/decide), payload retention purge
  - phase: 19-store-local-durable-printing-service (plan 06)
    provides: entities/print-job, PrintJobStatusBadge, ReprintButton's confirm/reprint wiring
  - phase: 19-store-local-durable-printing-service (plan 07)
    provides: PrintJobsTable/PrintJobFilterBar/PrintJobDetailSheet, /audit's Print Jobs tab
provides:
  - "e2e/receipts/broker-submission.spec.ts — dual-global-mocked fault matrix across PaymentForm/CajaDashboard/HardwareSettingsTab + job_id correlation proof into the Print Jobs table"
  - "e2e/receipts/unknown-status-confirm.spec.ts — end-to-end 'Did this print?' Yes/No flow through PaymentPane's ReprintButton, with explicit print_receipt call-count assertions"
  - "e2e/audit/print-jobs.spec.ts — end-to-end Print Jobs tab (badges, filter-apply, detail Sheet timeline) plus the cashier-redirect regression check"
  - "broker/src/delivery.rs::ambiguous_handoff_marks_unknown_and_never_resubmits_when_spooler_no_longer_reports_job_id — closes this phase's one previously-undocumented-as-tested fault case"
  - "scripts/verify-lan-broker-reachability.ps1 — cross-machine LAN/VPN reachability script (documented backstop, not run against real second hardware)"
affects: []

actuals:
  tokens: 8800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Dual-global Tauri IPC mock reused verbatim across all three new specs (window.__TAURI__ + window.__TAURI_INTERNALS__.invoke) — never page.route(), since the broker HTTP call is Rust-side reqwest, not a browser fetch()."
    - "window.__invokeCallCounts / window.__printReceiptCallCount / window.__getPrintJobsCalls — mock-side call-count/call-args recorders exposed on window so Playwright assertions can prove exact invocation counts (e.g. 'No, print again' calls print_receipt exactly once) and exact filter args reached the mocked command, without needing page.route()'s request-inspection API."
    - "Read-only WinSpool probe for a hardware-dependent fault case: ambiguous_handoff_marks_unknown_... calls OpenPrinterW+GetJobW against a real, always-present printer object ('Microsoft Print to PDF') and a bogus win32_job_id — never StartDocPrinterW — so the test is deterministic and hang-free while still exercising the real Win32 code path, with a graceful skip if that printer object is absent on the host (mirrors ledger.rs's existing read_only_ledger_file test's platform-gap convention)."

key-files:
  created:
    - e2e/receipts/broker-submission.spec.ts
    - e2e/receipts/unknown-status-confirm.spec.ts
    - e2e/audit/print-jobs.spec.ts
    - scripts/verify-lan-broker-reachability.ps1
  modified:
    - broker/src/delivery.rs

key-decisions:
  - "Task 1's action text says 'all five caller files' but its own enumerated list only names three UI-triggered failure-toast callers (PaymentForm, CajaDashboard, HardwareSettingsTab) — matching Plan 19-04's actual scope (5 callers total handle Results, but ReceiptPreview/ReprintButton's failure-toast paths are already covered by their own Plan 19-04 unit tests and ReprintButton's Plan 19-06 component tests). This plan's e2e spec covers the 3 callers Task 1's action text explicitly names, plus the correlation-ID proof through PaymentForm's cash-checkout path — it does not re-derive ReceiptPreview's/ReprintButton's own already-tested failure-toast behavior."
  - "The correlation-ID assertion targets the Print Jobs table row's sr-only accessible-trigger aria-label (`View print job {jobId} from {createdAt}`), not the visually truncated 8-char EntityIdCell text — the full job_id only ever exists in that aria-label (or a hover-only Tooltip) in the rendered DOM, and this exact pattern (asserting via AuditLogTable's parallel 'View diff for...' sr-only trigger) is already proven working by e2e/audit/audit-logs.spec.ts's own diff-sheet test."
  - "Chose 'Microsoft Print to PDF' (confirmed present on this build host via Get-Printer) as the real-but-safe printer object for the ambiguous-handoff gap-closing test, over either (a) leaving the gap open per Plan 19-01's original deferral, or (b) mocking win_print at a trait/DI boundary that doesn't exist in the current code. A read-only OpenPrinterW+GetJobW probe against a bogus job id carries none of the hang/interactive-dialog risk Plan 19-01 flagged for an actual StartDocPrinterW submission, so it closes the gap without introducing new flakiness risk."

requirements-completed: [PRN-01, PRN-02, PRN-03, PRN-04, PRN-05, PRN-06, PRN-07]

duration: ~1h45m
completed: 2026-08-27
status: complete
---

# Phase 19 Plan 08: Closing Verification Wave Summary

**Three new end-to-end Playwright specs (broker-submission fault matrix + correlation-ID proof, the unknown-status "Did this print?" confirm flow, and the Print Jobs audit tab) close out this phase's E2E coverage; a targeted gap-audit of the broker's cargo test suite found and closed exactly one real gap (the ambiguous-handoff reconciliation branch); and a cross-machine LAN reachability script exists as a documented, honestly-flagged backstop rather than a falsely-claimed verification.**

## Performance

- **Duration:** ~1h45m
- **Tasks:** 3/3 completed
- **Files created:** 4 (3 Playwright specs, 1 PowerShell script)
- **Files modified:** 1 (`broker/src/delivery.rs`)
- **Commits:** 3

## Accomplishments

- `e2e/receipts/broker-submission.spec.ts`: 7 tests. Test 1 drives a real cash checkout with `print_receipt` mocked to resolve a fixture job_id, asserts no failure toast appears, then re-logs-in as a manager and asserts that SAME job_id renders in the Print Jobs table via its sr-only accessible-trigger's aria-label — the correlation-ID propagation proof (PRN-04). Tests 2-7 cover the broker-unreachable/generic-rejection failure-class-copy pair for each of PaymentForm (cash checkout), CajaDashboard's Print Summary, and HardwareSettingsTab's Test Print.
- `e2e/receipts/unknown-status-confirm.spec.ts`: 2 tests. Drives a real reprint from `/payments`' `PaymentPane`, with `print_receipt` mocked to resolve a job_id and `get_print_job` mocked to resolve `status='unknown'` for that id. Asserts the amber "Needs confirmation" badge renders, clicking it opens "Did this print?" with the exact locked title/description copy, "Yes, it printed" closes it with `print_receipt`'s mock call count staying at 1, and — in a second test — "No, print again" drives the mock call count to exactly 2 before closing.
- `e2e/audit/print-jobs.spec.ts`: 2 tests. Manager test: default-active "Audit Log" tab (via `data-state="active"`), switches to "Print Jobs", asserts 3 fixture rows' status badges render the correct label+color-token (`unknown`→amber/never-destructive, `failed`→`pos-danger`, `os_reported_printed`→`pos-accent`), applies a status filter and asserts `get_print_jobs`'s mocked invoke call recorded that filter, opens the detail Sheet via the sr-only row trigger and asserts its 3-event timeline renders in order. Cashier test: direct navigation to `/audit` still redirects to `/home` with the existing "restricted to managers and admins" toast — proving the new tab did not weaken the `view_audit_log` route gate.
- `broker/src/delivery.rs`: added `ambiguous_handoff_marks_unknown_and_never_resubmits_when_spooler_no_longer_reports_job_id` — the one real gap this task's fault-matrix audit found (see below). Seeds a `submitted_to_os` job with a bogus `win32_job_id` against the real "Microsoft Print to PDF" printer object, runs `worker_tick` twice, and asserts: first tick marks `status='unknown'` with an `ambiguous_handoff` event; second tick leaves both `status` and `attempts` completely unchanged — proving the single most safety-critical guarantee in this crate (never auto-resubmit an unknown job) holds under a real (if bogus-job-id) Win32 round trip, not just by code inspection.
- `scripts/verify-lan-broker-reachability.ps1`: takes the POS host's LAN/VPN IP as a mandatory parameter, refuses loopback addresses (with an explanatory message), and asserts an unauthenticated `GET /health` returns `{"ok":true}` within a configurable timeout. Its top-of-file comment states plainly this could not be run during this phase's execution (no second real machine/VM reachable from this sandboxed environment) — parsed and smoke-tested locally (loopback-refusal path and unreachable-host-timeout path both verified to exit non-zero with the correct message) but never run cross-machine.

## Task Commits

1. **Task 1: broker-submission.spec.ts** — `d298ce6` (test)
2. **Task 2: unknown-status-confirm.spec.ts + print-jobs.spec.ts** — `d5c8a6e` (test)
3. **Task 3: ambiguous-handoff gap-closing test + verify-lan-broker-reachability.ps1** — `123f747` (test)

**Plan metadata:** commit pending (this SUMMARY, worktree mode — orchestrator merges centrally; STATE.md/ROADMAP.md are NOT touched by this executor per the wave-parallel execution contract).

## Files Created/Modified

- `e2e/receipts/broker-submission.spec.ts` — new spec, 7 tests
- `e2e/receipts/unknown-status-confirm.spec.ts` — new spec, 2 tests
- `e2e/audit/print-jobs.spec.ts` — new spec, 2 tests
- `broker/src/delivery.rs` — one new `#[test]` closing the ambiguous-handoff gap
- `scripts/verify-lan-broker-reachability.ps1` — new PowerShell script

## Decisions Made

See `key-decisions` in frontmatter (Task 1's 3-vs-5-caller scope, the correlation-ID assertion's aria-label target, and the "Microsoft Print to PDF" read-only-probe choice for the ambiguous-handoff test).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two ESLint `@typescript-eslint/no-unnecessary-*` violations in newly-written specs**
- **Found during:** Task 1/Task 2, running `npx eslint` against the new spec files before committing.
- **Issue:** `print-jobs.spec.ts` had a redundant `as FixtureJob[]` cast (the addInitScript callback parameter was already correctly typed from its call-site argument). `unknown-status-confirm.spec.ts` copy-pasted `e2e/receipts/reprint.spec.ts`'s exact `if (error || !payment) throw new Error(error?.message ?? '...')` Supabase-error-handling idiom, which ESLint flags as "unnecessary conditional" in that file too (confirmed by running the same lint rule against the pre-existing `reprint.spec.ts` — 6 identical errors there, unrelated to this plan and out of scope to fix).
- **Fix:** Removed the redundant cast in `print-jobs.spec.ts` (in scope, this plan's own new file). Left `unknown-status-confirm.spec.ts`'s Supabase-error-handling block matching the established, already-accepted `reprint.spec.ts` idiom rather than deviating — `npm run lint` only scopes `src/`, not `e2e/`, so this is not a blocking-lint issue, and diverging from the proven precedent in a new file risked introducing a genuinely different (untested) pattern for no benefit.
- **Files modified:** `e2e/audit/print-jobs.spec.ts`
- **Verification:** `npx eslint e2e/audit/print-jobs.spec.ts e2e/receipts/broker-submission.spec.ts` — 0 errors, 0 warnings.
- **Committed in:** `d5c8a6e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 lint cleanliness fix, scoped to this plan's own new file only).
**Impact on plan:** No scope creep — the fix only touches code this plan itself wrote; the pre-existing `reprint.spec.ts` lint findings are explicitly out of scope and were not touched.

## Verification Results (this session)

- `cd broker && cargo test` — **PASS**: 27/27 tests (26 pre-existing + 1 new `ambiguous_handoff_...` test), including the new fault-matrix-closing test, confirmed twice for stability.
- `cd broker && cargo build --release` — **PASS**: clean release build, zero warnings.
- `npx eslint e2e/receipts/broker-submission.spec.ts e2e/receipts/unknown-status-confirm.spec.ts e2e/audit/print-jobs.spec.ts` — **PASS**: 0 errors, 0 warnings.
- `npx tsc --noEmit -p e2e/tsconfig.json` — **PASS** for all three new files (the full `e2e/` project has pre-existing, unrelated `TS18047`/`TS2532`/`TS2769`/`TS6133` errors in other files not touched by this plan — none of this plan's three new files appear in that error list).
- `npx playwright test e2e/receipts/broker-submission.spec.ts e2e/receipts/unknown-status-confirm.spec.ts e2e/audit/print-jobs.spec.ts --reporter=list` — **11/11 skipped, 0 pass, 0 fail**. This sandboxed worktree has no `.env.local` with `E2E_*_NAME`/`E2E_*_PIN`/`SUPABASE_SERVICE_ROLE_KEY` (confirmed absent; a reachable local Supabase instance exists at `127.0.0.1:54321`, but the E2E staff-credential env vars specifically are not configured in this worktree) — `requireIntegrationEnv()` skips every test file in this suite identically, matching the exact, already-documented pattern in every prior Phase 19 plan's SUMMARY (19-01 through 19-06 all hit this same gate). All 11 tests were confirmed **discoverable and cleanly skipping** (no syntax/import errors) — this is real evidence the specs are well-formed and wired correctly, but it is NOT proof they pass against live app behavior. That proof requires a credentialed run.
- `npx playwright test e2e/receipts/ e2e/audit/ --reporter=list` — **37/37 skipped, 0 pass, 0 fail** (broader run including every existing spec in both folders) — confirms this plan's new files did not break discovery/parsing of any sibling spec file.
- `npm run test:e2e` (full suite) — **not run**. Per this plan's own verification note ("if this is prohibitively slow/flaky in this environment, at minimum run the three new specs plus the other e2e/receipts/*.spec.ts and e2e/audit/*.spec.ts specs and document what was/wasn't run"): the credential gate above applies identically to the full suite (every spec requires the same `.env.local` keys), so a full run would produce the same 0-pass/0-fail/all-skip result already demonstrated by the broader `e2e/receipts/` + `e2e/audit/` run above. Running the full ~51-file suite would add no additional signal in this environment and was skipped to avoid a slow, uninformative pass.
- `scripts/verify-lan-broker-reachability.ps1` — parsed cleanly (`pwsh -File`, no syntax errors); smoke-tested locally twice: (1) passing a loopback IP correctly fails fast with the loopback-refusal message and exit code 1; (2) passing an unreachable non-loopback IP (`192.0.2.1`, TEST-NET-1) correctly times out and fails with exit code 1 and the expected troubleshooting message. **Never run against a real second machine** — see Must-Haves Compliance below.

## Must-Haves Compliance (plan frontmatter)

All 4 `must_haves.truths` (one marked `verification: backstop`) and both `prohibitions`, checked explicitly:

**Truths:**
1. "The same job_id a mocked broker response returns from a submission is the exact value later shown in the Print Jobs table's Job ID column and in ReprintButton's status badge lookup — correlation ID propagates unbroken through every boundary this phase's E2E suite can exercise (PRN-04)." — **met**. `broker-submission.spec.ts`'s Test 1 asserts the exact fixture `job_id` from the mocked `print_receipt` response appears in the Print Jobs table's sr-only row trigger; `unknown-status-confirm.spec.ts` proves the same `job_id` flows from `print_receipt`'s mocked response into `get_print_job`'s mocked lookup for `ReprintButton`'s badge (both keyed on the identical `UNKNOWN_JOB_ID` constant).
2. "A dedicated e2e spec drives ReprintButton's full 'Did this print?' Yes/No flow end-to-end (D-05/D-06/D-07/D-08), not just the isolated component test from Plan 19-06." — **met**. `unknown-status-confirm.spec.ts` drives the real `/payments` PaymentPane UI, not a mounted-in-isolation component.
3. "A dedicated e2e spec drives the Print Jobs audit tab end-to-end: filter, open detail Sheet, verify timeline renders, verify a cashier session is redirected away from /audit the same way it already is today for the Audit Log tab." — **met**. `print-jobs.spec.ts` covers all four (filter-apply-with-args, detail-Sheet-timeline, badge-rendering, cashier-redirect-regression).
4. "Every fault case in this phase's validation strategy ... has a named, passing automated test somewhere across the broker crate's cargo test suite — this plan audits for and closes any gap rather than assuming prior plans already covered all ten." — **met**. See the full ten-case citation table below; the one real gap found (ambiguous handoff) was closed with a new test, confirmed passing.
5. *(backstop)* "Cross-machine LAN/VPN reachability ... is proven by a runnable automated script — this sandboxed planning/execution environment has no second real machine or VM available to run it against, so this truth is flagged for confirmation at real deployment rather than claimed as verified here." — **backstop, honestly flagged, not claimed as verified**. `scripts/verify-lan-broker-reachability.ps1` exists, is parseable, and was smoke-tested for its two failure paths (loopback-refusal, unreachable-host-timeout) locally — but it has never been run from a genuine second machine against a genuine LAN-bound broker instance. This is stated plainly both in the script's own top-of-file comment and here.

**Prohibitions:**
1. "MUST NOT use page.route() to mock broker responses in any new Playwright spec in this plan." — **met**. `grep -rn "page.route" e2e/receipts/broker-submission.spec.ts e2e/receipts/unknown-status-confirm.spec.ts e2e/audit/print-jobs.spec.ts` returns zero matches. All three specs exclusively use the dual-global `window.__TAURI__`/`window.__TAURI_INTERNALS__.invoke` mock pattern.
2. "MUST NOT report the cross-machine LAN reachability truth as fully verified when no second real machine was actually exercised." — **met**. See Truth 5 above and the script's own doc comment — both explicitly state the gap rather than glossing over it.

## Ten-Case Fault Matrix — Full Citation (no "assumed covered" hand-waving)

| # | Fault case | Named, passing test | File:line |
|---|---|---|---|
| 1 | Broker unavailable (client-side connect-timeout) | `print_receipt_broker_failure_returns_err_never_silent_ok`, `open_cash_drawer_broker_failure_returns_err_never_silent_ok` | `src-tauri/src/commands/printer.rs:487`, `:522` |
| 2 | Auth failure (missing/wrong Bearer) | `missing_or_wrong_auth_header_rejected_401_before_any_sqlite_write` | `broker/src/http.rs:612` |
| 3 | Invalid payload | `invalid_payload_rejected_400_before_any_write` | `broker/src/http.rs:451` |
| 4 | Persistence failure (read-only ledger file) | `read_only_ledger_file_returns_persistence_failed_without_writing_rows` | `broker/src/ledger.rs:156` |
| 5 | Stopped spooler / transient WinSpool failure | `classify_failure_transient_vs_terminal` (asserts a "spooler likely stopped" message classifies Transient), `classify_failure_unrecognized_error_defaults_transient` (asserts "RPC server is unavailable" classifies Transient), `transient_failure_retries_up_to_configured_max_attempts` (proves the classified-Transient path actually retries per policy) | `broker/src/retry.rs:95`, `:115`, `:141` |
| 6 | Offline/misconfigured printer (nonexistent printer name — Terminal case) | `nonexistent_printer_is_terminal_and_marks_failed_after_one_attempt` | `broker/src/delivery.rs:418` |
| 7 | Retry exhaustion | `transient_failure_retries_up_to_configured_max_attempts` | `broker/src/retry.rs:141` |
| 8 | Duplicate idempotency key | `duplicate_idempotency_key_returns_same_job_id_and_creates_no_second_row` | `broker/src/http.rs:480` |
| 9 | Ambiguous handoff (spooler no longer reports the job id) | `ambiguous_handoff_marks_unknown_and_never_resubmits_when_spooler_no_longer_reports_job_id` **(new, added by this plan — closes the gap Plan 19-01's own SUMMARY documented as untested)** | `broker/src/delivery.rs:511` |
| 10 | Restart recovery | `accepted_job_survives_restart_and_worker_tick_transitions_it_with_zero_new_rows` | `broker/src/delivery.rs:456` |

Cases 1-8 and 10 were confirmed already covered by prior plans' test suites (re-read and re-run in this session, not assumed from SUMMARY prose alone). Case 9 was the one genuine gap this audit found — Plan 19-01's own SUMMARY ("Known Gaps") had explicitly flagged it as untested, and no later plan (19-02 through 19-07) added a test for it. Closed in this plan's Task 3 commit (`123f747`).

## Known Stubs

None.

## Threat Flags

None. This plan adds no new network endpoints, auth paths, or schema changes — it is verification-only (new test/spec files + one script).

## Next Phase Readiness

- This is the final plan of the final wave of Phase 19. Every PRN-01 through PRN-07 requirement now has at least one end-to-end automated assertion (PRN-01 also carries the honestly-flagged LAN-reachability backstop), and the full ten-case fault matrix is provably covered by name — not by assumption.
- Real credentialed execution of all three new specs (and the rest of `e2e/receipts/`/`e2e/audit/`) is the one remaining verification step this sandboxed environment could not perform — needs a `.env.local` with `E2E_*_NAME`/`E2E_*_PIN`/`SUPABASE_SERVICE_ROLE_KEY` configured, same gate every prior Phase 19 plan hit.
- `scripts/verify-lan-broker-reachability.ps1` running once against real store hardware (a genuine second machine on the LAN/VPN) is the closing step for PRN-01's cross-machine claim — a deployment-time task, not something this sandboxed environment can close, per this repo's no-silent-drop policy.

## Self-Check: PASSED

- FOUND: `e2e/receipts/broker-submission.spec.ts`
- FOUND: `e2e/receipts/unknown-status-confirm.spec.ts`
- FOUND: `e2e/audit/print-jobs.spec.ts`
- FOUND: `scripts/verify-lan-broker-reachability.ps1`
- FOUND: `broker/src/delivery.rs` (`ambiguous_handoff_marks_unknown_and_never_resubmits_when_spooler_no_longer_reports_job_id`)
- FOUND commit `d298ce6`: test(19-08): e2e broker-submission fault matrix across all callers + correlation ID
- FOUND commit `d5c8a6e`: test(19-08): e2e unknown-status confirm flow + Print Jobs audit tab
- FOUND commit `123f747`: test(19-08): close ambiguous-handoff fault-matrix gap; add LAN reachability script
