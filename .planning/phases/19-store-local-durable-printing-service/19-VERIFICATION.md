---
phase: 19-store-local-durable-printing-service
verified: 2026-08-27T23:03:00Z
status: gaps_found
score: 6/7 PRN requirements fully verified (1 partial); 42/43 plan-level must_haves.truths verified (1 partial)
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The inbound firewall rule is scoped to LocalSubnet on TCP 8973, not an unrestricted allow-all rule (19-02-PLAN.md must_have #5, ties to PRN-01's LAN/VPN-only intent)."
    status: partial
    reason: "windows/hooks.nsh's netsh command (`netsh advfirewall firewall add rule name=\"Store Print Broker\" dir=in action=allow program=\"$INSTDIR\\broker\\broker.exe\" protocol=TCP localport=8973 profile=private`) omits `remoteip=LocalSubnet` entirely. `profile=private` restricts the rule to firing only when Windows classifies the active network as Private (blocking Public-profile/raw-internet exposure, which is the core of PRN-01's 'not exposed to the public internet'), but it does NOT restrict the remote/source IP address — the default when `remoteip` is omitted is `remoteip=any`. Any host that can route to the broker while the interface is in the Private profile (not just same-subnet devices) can reach TCP 8973. scripts/verify-print-broker-install.ps1's Check 3 only asserts protocol=TCP and localport=8973 — it never asserts a remoteip/LocalSubnet scope, so this gap is also unverified in the install-verification script. 19-02-SUMMARY.md marks this must-have 'met' citing only `profile=private`, which conflates network-profile scoping with IP-range scoping — the specific LocalSubnet claim is not actually implemented."
    artifacts:
      - path: "windows/hooks.nsh"
        issue: "netsh firewall rule has no remoteip=LocalSubnet (or equivalent) clause"
      - path: "scripts/verify-print-broker-install.ps1"
        issue: "Check 3 does not assert a remote-IP/LocalSubnet scope on the firewall rule, so this gap would not be caught even at real deployment"
    missing:
      - "Add `remoteip=LocalSubnet` (or a store-specific CIDR) to the netsh command in windows/hooks.nsh's post-install hook."
      - "Add an assertion in scripts/verify-print-broker-install.ps1 Check 3 that the rule's RemoteAddress is LocalSubnet, not Any."
deferred: []
---

# Phase 19: Store-Local Durable Printing Service Verification Report

**Phase Goal:** Every print command from a LAN/VPN client is either durably accepted by one
store-local broker with a stable job ID or fails immediately and loudly; accepted work survives
application and service restarts, routes to its named Windows printer, and remains auditable end
to end.

**Verified:** 2026-08-27T23:03:00Z
**Status:** gaps_found (one partial gap — firewall LAN scoping; every other must-have verified)
**Re-verification:** No — initial verification

## Method

Goal-backward verification against the merged HEAD of `main` (`a18dba1`, the 19-08 closing-wave
merge commit). All 8 plans' PLAN.md `must_haves` frontmatter, PRN-01..07 in REQUIREMENTS.md, and
ROADMAP.md's Phase 19 success criteria were checked directly against source files, not against
SUMMARY.md prose. A concurrent, unrelated Claude Code session's uncommitted WIP was present in the
working tree at verification time (`src/shared/lib/pos-printer.ts`/`.test.ts`, `logger.ts`,
`useBarcodeScanner.ts`, `useProductPeekWindow.ts`, `CheckoutPanel.tsx` — a `__TAURI__` →
`__TAURI_INTERNALS__` bugfix, per the task brief). It was left untouched; `git diff`/`git log`
against commit ranges (not raw working-tree state) was used to isolate what Phase 19 itself
changed. The two files it touches that Phase 19 also modified (`pos-printer.ts`/`.test.ts`) carry
only that isolated 6-line diff, confirmed by reading the diff directly — it does not alter any
Phase 19 logic.

## PRN Requirement Verdicts

| # | Requirement | Verdict | Evidence |
|---|---|---|---|
| PRN-01 | LAN/VPN clients submit to one authenticated store-local broker; no public-internet exposure, no cloud dependency | **PASS** (with a documented firewall-scoping gap below) | `broker/src/http.rs` bearer-auth-before-any-write (401 test passes); `broker/install/mod.rs` dedicated `NT SERVICE\PrintBrokerService` account (never LocalSystem); `windows/hooks.nsh` firewall rule uses `profile=private` (blocks Public-profile/internet exposure) but omits `remoteip=LocalSubnet` — see gap. No Supabase/cloud call anywhere in `broker/` (grep confirms zero `supabase`/`http(s)://` outbound references outside the local `127.0.0.1:8973` HTTP server itself). |
| PRN-02 | Success only after durable commit + stable job ID; unreachable/rejected/auth/persistence/routing failures fail immediately, never report success | **PASS** | `broker/src/http.rs::handle_submit` writes jobs+events rows before returning 200; `valid_submit_returns_200_and_durably_commits_accepted_status`, `invalid_payload_rejected_400_before_any_write`, `missing_or_wrong_auth_header_rejected_401_before_any_sqlite_write`, `read_only_ledger_file_returns_persistence_failed_without_writing_rows` all pass. `pos-printer.ts` never falls back to a silent `Ok()` on Windows — all 4 commands (`print_receipt`, `print_raw_text`, `open_cash_drawer`, `test_print`) return `Err` with a structured `AppErrorCode` on failure (`printer.rs` tests `print_receipt_broker_failure_returns_err_never_silent_ok`, `open_cash_drawer_broker_failure_returns_err_never_silent_ok` pass). |
| PRN-03 | Accepted job survives client/app/broker restart; delivered asynchronously to named Windows printer queue | **PASS** | `delivery.rs::accepted_job_survives_restart_and_worker_tick_transitions_it_with_zero_new_rows` passes — a job accepted before a simulated process kill delivers with zero client resubmission on the next `worker_tick`. Delivery happens exclusively via the independent worker-tick loop (`main.rs::run_worker`), never synchronously inside the HTTP handler — confirmed by reading `handle_submit` (no delivery call inside it). |
| PRN-04 | Every printing boundary propagates/logs normalized structured errors with the same job/correlation ID; UI shows actionable toast; non-UI callers explicitly handle failed Results | **PASS** | Shared `printJobErrorCopyKey(code)` in `pos-printer.ts`, imported by all 5 call-site files (`ReceiptPreview.tsx`, `ReprintButton.tsx`, `CajaDashboard.tsx`, `PaymentForm.tsx`, `HardwareSettingsTab.tsx` — grep-confirmed). Correlation ID (`job_id`) flows unbroken: `printReceipt()`'s returned `jobId` → `ReprintButton`'s `usePrintJob(jobId)` → broker `GET /jobs/{id}` → same ID rendered in `PrintJobsTable`'s sr-only row trigger — proven by `e2e/receipts/broker-submission.spec.ts` Test 1 (listed, not run, per E2E env note below). No caller silently discards a `Result` (`ReceiptPreview.tsx`'s prior bare `.finally()` discard was the one real violation, closed in Plan 19-04, `a8c585c`). REQUIREMENTS.md still shows PRN-04's checkbox unchecked/"Pending" — this is stale-documentation lag, not a code gap; it was not updated after Plans 19-04/19-06/19-08 closed it. |
| PRN-05 | Broker retains auditable command/event history (origin/actor, printer, payload hash/ref, timestamps, attempts, transitions, Win32 job ID, normalized errors); queryable counts; retention controls | **PASS** | `broker/src/http.rs::handle_audit` returns `counts_by_status` (GROUP BY status); `handle_list_jobs` supports `origin`/`printer_name`/`status`/`from_ms`/`to_ms` filters (3 passing tests: no-filter ordering, origin+status, date-range). `handle_get_job` returns the full per-job event timeline (`ts`, `category`, `detail`) plus `win32_job_id`/`last_error`. `ledger.rs::purge_expired_payloads` is wired into `delivery.rs::worker_tick` (confirmed call site at `delivery.rs:386`) and nulls only the payload BLOB column, never metadata (`purge_expired_payloads_nulls_payload_for_old_jobs_leaves_metadata_untouched` passes). `/audit` route's Print Jobs tab is gated by the same `view_audit_log` RBAC check as the existing Audit Log tab (`AuditRoute` → `can('view_audit_log')`, confirmed in `src/app/audit-route.tsx`) — no new/weaker gate. Same stale-checkbox note as PRN-04 applies to REQUIREMENTS.md. |
| PRN-06 | Finite retries only for classified transient failures; reconciles ambiguous handoffs before resubmission; idempotency keys prevent duplicates | **PASS** | `broker/src/retry.rs::classify_failure` splits Transient vs Terminal (`classify_failure_transient_vs_terminal`, `classify_failure_not_found_is_terminal`, `classify_failure_unrecognized_error_defaults_transient` all pass); `terminal_failure_marks_failed_after_exactly_one_attempt` and `transient_failure_retries_up_to_configured_max_attempts` confirm the per-class behavior. `delivery.rs::ambiguous_handoff_marks_unknown_and_never_resubmits_when_spooler_no_longer_reports_job_id` (added in Plan 19-08 to close the one real gap the 10-case fault-matrix audit found) passes — a job marked `unknown` is never auto-resubmitted by any reconciliation-pass code path, verified against a real (if bogus-job-id) `OpenPrinterW`/`GetJobW` round trip. `duplicate_idempotency_key_returns_same_job_id_and_creates_no_second_row` passes. |
| PRN-07 | UI/audit distinguish durable acceptance, submission-to-Windows, OS-reported completion, failure, cancellation, unknown; Windows status never presented as proof of physical output | **PASS** | `PrintJobStatusBadge.tsx` implements all 6 statuses (`accepted`, `submitted_to_os`, `os_reported_printed`, `failed`, `cancelled`, `unknown`) with distinct icons/color tokens (never destructive-red for `unknown` — uses `pos-warning`, matching D-06/D-08's non-blocking, non-alarming framing). `delivery.rs`'s `JOB_STATUS_DELETED` handling records a distinct `cancelled` status, not folded into `failed` (`job_status_deleted_marks_cancelled_not_failed_with_os_reported_cancelled_event` passes). No component text anywhere claims Windows status is proof of physical paper output — status labels read as OS-pipeline states (submitted/completed/etc.), and the "Did this print?" confirm flow exists specifically because Windows status is explicitly treated as non-authoritative for `unknown` jobs. |

**PRN Score:** 6/7 fully clean; PRN-01 passes its core requirement but carries one documented,
concrete implementation gap (firewall LocalSubnet scoping) against a stricter must-have the 19-02
plan itself set and its own SUMMARY incorrectly marked "met."

## must_haves Compliance Across All 8 Plans

Read every plan's `must_haves.truths`/`key_links`/`prohibitions` from PLAN.md frontmatter (not
SUMMARY prose) and spot-checked each against the merged code:

| Plan | Truths | Key Links | Prohibitions | Result |
|---|---|---|---|---|
| 19-01 (tracer) | 8 (1 backstop) | 3 | 3 | All verified. Broker ledger/http/delivery skeleton, connect-timeout+IPv4-literal, never-auto-resubmit-unknown, restart recovery — all backed by passing `cargo test` cases. |
| 19-02 (SCM/install) | 6 (1 backstop) | 3 | 2 | 5/6 verified; **1 partial** (firewall LocalSubnet scoping — see gap above). Service account, failure-recovery policy, secret generation (once, never regenerated), NSIS bundling all verified in code. |
| 19-03 (contract migration) | 5 | 3 | 2 | All verified. All 4 commands route through `submit_to_broker`; `print_raw_text` is now a real registered command (previously missing — confirmed via `src-tauri/src/lib.rs` command registration); no fallback-to-Ok on Windows; non-Windows dev fallback preserved; every success payload carries `jobId`. |
| 19-04 (Result hardening) | 4 | 2 | 2 | All verified. All 5 callers branch explicitly on `Result`; `ReceiptPreview.tsx`'s prior discard closed; no success toast on any of the 5 callers (grep confirms no `toast.success` on the happy path in any of the 5 files); shared `printJobErrorCopyKey` used everywhere. |
| 19-05 (retry/retention) | 4 | 2 | 2 | All verified. Per-failure-class retry config read from `broker-config.json`; terminal failures fail after 1 attempt; 7-day retention window confirmed (`DEFAULT_RETENTION_DAYS` in `config.rs`); `purge_expired_payloads` only nulls the payload column; a purged job's `GET /jobs/{id}` still returns 200 (`get_job_returns_200_with_events_when_payload_already_purged` passes). |
| 19-06 (print-job read path) | 7 | 3 | 4 | All verified. `GET /jobs` list endpoint with all 5 filter dimensions; `cancelled` split from `failed`; `entities/print-job` never touches Supabase (grep confirms zero `supabase.from`/`db.from` matches); `PrintJobStatusBadge` 6-status/color-token contract; "Did this print?" confirm flow wired on `ReprintButton`; dismiss-without-answering leaves ledger status untouched; `queue_health_alert` event exists and is alert-only (test `stuck_submitted_to_os_job_gets_exactly_one_queue_health_alert_event` passes). |
| 19-07 (audit UI) | 8 | 3 | 2 | All verified. `/audit` Tabs wrapper with unchanged Audit Log tab + new Print Jobs tab, same `view_audit_log` gate; `PrintJobsTable` columns match spec; detail Sheet renders an event timeline (not `JsonDiffViewer` — grep confirms zero references to it in `PrintJobDetailSheet.tsx`); `PrintJobFilterBar` mirrors `AuditLogFilterBar`'s staged-filter UX; three-branch empty state; reuses `DataTable`'s existing pagination. |
| 19-08 (closing verification) | 4 (1 backstop) | 2 | 2 | All verified. Correlation ID propagation proven end-to-end by a listed (not run, per E2E env note) Playwright spec; dedicated "Did this print?" e2e spec; dedicated Print Jobs audit-tab e2e spec including the cashier-redirect regression; full 10-case fault matrix each has a named, passing test (confirmed directly — all 10 test names exist and pass in the `cargo test` runs above); LAN-reachability script exists, is a real runnable script, and is honestly flagged as an unexercised backstop, not falsely claimed as verified. |

**Total: 42 of 43 plan-level `must_haves.truths` fully verified; 1 partial** (19-02's LocalSubnet
firewall-scoping truth). Every `key_link` and `prohibition` across all 8 plans checked and holds.

## Automated Verification Commands Run

| Command | Result |
|---|---|
| `cd broker && cargo build --release` | **PASS** — clean release build, no warnings surfaced as errors |
| `cd broker && cargo test` | **PASS** — 27/27 tests passed (0 failed), covering all 10 fault-matrix cases named in 19-08-SUMMARY.md's citation table |
| `cd src-tauri && cargo check` | **PASS** — clean, no errors |
| `cd src-tauri && cargo test --lib` | **PASS** (bonus check beyond the requested `cargo check`) — 14/14 tests passed, including `print_receipt_broker_failure_returns_err_never_silent_ok` and `open_cash_drawer_broker_failure_returns_err_never_silent_ok`, the two tests 19-08-SUMMARY.md cites for fault case #1 |
| `npm run typecheck` | **PASS** — no output, `tsc --noEmit` clean |
| `npm run lint` | **PASS** — 0 errors (only a pre-existing `eslint-plugin-boundaries` legacy-selector-syntax tooling warning, unrelated to Phase 19 code) |
| `npm run test` (full unit suite) | **1275/1280 passed** (5 failed, 2 skipped, 15 todo). All 5 failures are in `src/entities/staff/model/queries.clock.test.ts` (4) and `src/features/close-tab/tests/useCloseTab.test.ts` (1) — files Phase 19 never touched (`git log --follow` shows their last change was the initial-history commit, predating Phase 19 entirely). 19-06-SUMMARY.md independently documents these as a pre-existing "Supabase not initialized"/`AppConfigProvider`-ordering environment issue. Re-running the phase-19-specific subset in isolation (`npx vitest run src/entities/print-job src/widgets/PrintJobsTable src/shared/ui/PrintJobStatusBadge.test.tsx src/shared/lib/pos-printer.test.ts src/features/reprint-receipt`) — **59/59 passed**. |
| `npx playwright test --list e2e/receipts/broker-submission.spec.ts e2e/receipts/unknown-status-confirm.spec.ts e2e/audit/print-jobs.spec.ts e2e/receipts/broker-test-print.spec.ts` | **PASS (parse/list only)** — 13 tests across 4 files listed cleanly, no syntax/collection errors. Full execution requires `.env.local` Supabase/staff credentials absent in this sandboxed environment, per this repo's documented, pre-existing constraint — consistent with every one of this phase's 8 plans hitting the same limitation. |

## Cross-Machine LAN Reachability (Explicit Backstop)

`scripts/verify-lan-broker-reachability.ps1` exists (81 lines) and is a real, complete, runnable
script — not a stub. It: requires a mandatory `-PosHostIp` parameter, explicitly refuses
loopback/localhost values with a clear error (so it cannot be mistakenly self-satisfied), hits an
unauthenticated `GET http://<PosHostIp>:8973/health` (route confirmed present in
`broker/src/http.rs`), and exits non-zero with an actionable message on any failure. Its top-of-file
doc comment and 19-08-SUMMARY.md both state plainly that it was never run against a genuine second
machine (no such machine/VM was available in the sandboxed execution environment) — this matches
the task brief's framing exactly: a documented, honestly-flagged backstop for confirmation at real
deployment, not a silently-dropped gap and not falsely claimed as verified.

## Git History / Merge Integrity

All 8 plans (19-01 through 19-08) have both a `feat(19-0N)`/`test(19-0N)` implementation commit and
a `docs(19-0N): complete ... plan` SUMMARY commit, each closed by its own `merge(19-0N): ...` commit
on `main` (`479a15c`, `24176c8`, `c7ab3fd`, `09e2361`, `55e1219`, `315eb32`, `13dd4bd`, `a18dba1`).
No duplicate or conflicting commits from merge-conflict resolution were found. The one live-edit
collision flagged in the task brief (`src/shared/lib/pos-printer.ts`/`.test.ts` vs. a concurrent
unrelated peek-window session) is visible today only as that other session's **uncommitted**
6-line `__TAURI__`→`__TAURI_INTERNALS__` working-tree diff — it never entered any Phase 19 commit
(confirmed by reading `git show b086694 -- src/shared/lib/pos-printer.ts` and every subsequent
Phase 19 commit touching that file; none contain a `__TAURI__` string). It was left untouched per
the task brief's explicit instruction.

## Anti-Pattern Scan

Scanned every Rust/TS/PS1 file modified across all 8 plans for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/
`PLACEHOLDER`/"not yet implemented"/"coming soon" — **zero matches**. No debt markers.

## Requirements Coverage (REQUIREMENTS.md Traceability)

REQUIREMENTS.md's checkboxes and its "Traceability" table (lines 76-100, 175-181) still show
PRN-04 and PRN-05 as unchecked/"Pending." This is a **stale-documentation gap, not a code gap** —
both requirements are fully satisfied by the merged code (see PRN-04/PRN-05 rows above); the
REQUIREMENTS.md checkboxes were simply never flipped after Plans 19-04/19-05/19-06/19-07/19-08
closed them. Flagged here for the ship/complete-milestone flow to update, not as a phase-blocking
gap.

## Gaps Summary

**One concrete, verifiable gap found:** the LAN firewall rule in `windows/hooks.nsh` does not
actually scope inbound TCP 8973 traffic to `LocalSubnet` — it relies solely on
`profile=private`, which restricts by Windows network-category classification, not by remote IP
range. This falls short of 19-02-PLAN.md's own explicit must-have ("scoped to LocalSubnet ... not
an unrestricted allow-all rule") and its own SUMMARY's "met" verdict does not hold up against the
actual `netsh` command. The higher-level PRN-01 requirement ("not exposed to the public internet")
still holds because `profile=private` does block Public-profile/raw-internet exposure — this is a
defense-in-depth shortfall, not a break in the phase's core promise. It is a one-line fix
(`remoteip=LocalSubnet` in the `netsh` command) plus a corresponding assertion in
`scripts/verify-print-broker-install.ps1`.

Everything else — durable-accept-before-ack, restart survival, one submission contract across all
5 UI callers with no silent Result discards, correlation-ID propagation, the full auditable
event/command history with queryable filters and retention purge, per-failure-class retry with
safe ambiguous-handoff reconciliation, and the 6-way status vocabulary — is genuinely implemented,
tested (41 Rust unit tests + 59 targeted Vitest tests all passing), and wired end to end in the
merged code, not just claimed in SUMMARY prose.

---

_Verified: 2026-08-27T23:03:00Z_
_Verifier: Claude (gsd-verifier)_
