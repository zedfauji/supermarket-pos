---
phase: 19-store-local-durable-printing-service
plan: 05
subsystem: infra
tags: [rust, print-broker, retry-policy, retention, sqlite]

requires: [19-01, 19-02]
provides:
  - broker/src/retry.rs — FailureClass/classify_failure(), RetryPolicy, and the pure
    decide() function delivery.rs's worker_tick calls to turn a classified failure
    into a MarkFailed/WillRetry decision
  - broker/src/config.rs — BrokerConfig.retry now the real RetryPolicy (replacing
    Plan 19-02's RetryPolicyStub placeholder); DEFAULT_RETENTION_DAYS = 7 constant
  - broker/src/ledger.rs — purge_expired_payloads(conn, retention_days), jobs.payload
    column migrated to nullable BLOB
affects: [19-06, 19-07, 19-08]

actuals:
  tokens: 6250
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pure-decision-function: retry::decide(FailureClass, current_attempts, &RetryPolicy) -> RetryDecision has no DB/IO, so the retry-count math (Terminal fails at 1 attempt; Transient retries to max_attempts_transient) is unit-tested directly without needing real printer hardware or a live worker_tick call"
    - "worker_tick(conn) / worker_tick_with_config(conn, &BrokerConfig) split: the public worker_tick loads config::load_or_init() fresh each tick (config-driven per PRN-06/D-10); worker_tick_with_config is the testable core so tests can inject a fixture BrokerConfig instead of racing the real %ProgramData%\\PrintBroker\\ filesystem path"
    - "Retention purge excludes status='accepted' jobs — a job still awaiting delivery keeps its payload intact even past the retention window, so a broker outage longer than 7 days can't silently null out content before it's ever printed"

key-files:
  created:
    - broker/src/retry.rs
  modified:
    - broker/src/config.rs
    - broker/src/delivery.rs
    - broker/src/ledger.rs
    - broker/src/main.rs

key-decisions:
  - "D-14 checkpoint (payload retention window) was pre-resolved by the orchestrator asking the human user directly before this plan was dispatched — the answer is 7 days, not the RESEARCH.md provisional default of 14. This plan's DEFAULT_RETENTION_DAYS constant in config.rs is set to 7 accordingly; the checkpoint:decision task itself was not re-asked, re-paused, or treated as blocking during execution."
  - "Added a status != 'accepted' guard to purge_expired_payloads' WHERE clause, beyond the plan action's literal SQL. Without it, a job still awaiting delivery (status='accepted') that happened to sit unprocessed for longer than the retention window would have its payload silently nulled before ever being sent to WinSpool — a genuine data-loss/stuck-job bug introduced directly by making the payload column nullable and purge-able. Rule 2 auto-fix (missing critical functionality): the purge must never race the still-in-flight delivery pass."
  - "Extracted retry logic into a pure retry::decide(FailureClass, i64, &RetryPolicy) -> RetryDecision function rather than inlining the classify+branch logic directly in delivery.rs's worker_tick. This makes Tests 2 and 3 (Terminal fails after 1 attempt; Transient retries to the configured ceiling) unit-testable without real WinSpool I/O, and keeps worker_tick's Err(e) branch a thin translation from RetryDecision to SQL/event calls."
  - "worker_tick's public signature is unchanged (still fn(conn: &Connection)) so run_worker and all pre-existing call sites needed zero changes; it now internally loads config::load_or_init() and delegates to a new pub fn worker_tick_with_config(conn, &BrokerConfig) that both the real caller and tests use — tests build a BrokerConfig fixture in-memory instead of touching the real ProgramData config file, avoiding cross-test races."
  - "http.rs required no code change for Task 3 (listed in files_modified but not edited): handle_get_job's SELECT already never selects the payload column at all, so a NULL payload can never surface in the GET /jobs/{id} response or cause an error. Verified this directly with a new ledger.rs test (get_job_returns_200_with_events_when_payload_already_purged) rather than assuming it."

requirements-completed: [PRN-05, PRN-06]

duration: ~35m
completed: 2026-08-27
status: complete
---

# Phase 19 Plan 05: Data-Driven Retry Policy & Payload Retention Purge Summary

Replaced the print broker's hardcoded `MAX_ATTEMPTS=5`/`RECONCILE_AFTER_SECS=3` constants with a
config-driven, per-failure-class `RetryPolicy` (Terminal failures fail-fast after 1 attempt,
Transient failures retry per policy), and added a payload-only retention purge using the
human-confirmed 7-day window.

## What Was Built

### Task 1 — Data-driven per-failure-class retry policy (`broker/src/retry.rs`)

- `enum FailureClass { Transient, Terminal }` and `fn classify_failure(err_message: &str)`:
  matches "invalid" or "not found" (case-insensitive) as `Terminal`; everything else
  (spooler stopped, RPC unavailable, incomplete write, any other WinSpool error) as
  `Transient`, failing open toward retry for unrecognized error text.
- `struct RetryPolicy { max_attempts_transient: u32, backoff_ms: u64, reconcile_after_secs: u64 }`
  with `Default` matching the spike's original hardcoded values (5, 500ms, 3s) — not editing
  `broker-config.json` is not a behavior change.
- `fn decide(FailureClass, current_attempts: i64, &RetryPolicy) -> RetryDecision`: a pure
  function (no DB/IO) that turns a classification into either `MarkFailed { attempts,
  event_category }` or `WillRetry { attempts }`. `delivery.rs`'s `worker_tick`'s `Err(e)`
  branch now calls `retry::classify_failure(&e)` then `retry::decide(...)` and translates the
  result directly into the existing SQL/`record_event` calls — Terminal failures use event
  category `terminal_failure_no_retry`, Transient failures keep the pre-existing
  `retry_exhausted`/`submit_failed_will_retry` categories.
- `config.rs`'s `BrokerConfig.retry` field switched from Plan 19-02's `RetryPolicyStub`
  placeholder to the real `RetryPolicy` (same JSON key, so an already-written
  `broker-config.json` from a Plan 19-02 install still deserializes as long as its shape
  matches — `RetryPolicyStub` had only `max_attempts`, so an old file would need
  `max_attempts_transient`/`backoff_ms`/`reconcile_after_secs`; no production installs exist
  yet in this phase, so no migration script was needed).
- Removed `pub const MAX_ATTEMPTS: i64 = 5;` and `pub const RECONCILE_AFTER_SECS: u64 = 3;`
  from `delivery.rs` entirely. `worker_tick`'s reconciliation-pass threshold now reads
  `cfg.retry.reconcile_after_secs`.
- Introduced `worker_tick(conn) -> loads config::load_or_init() -> worker_tick_with_config(conn,
  &cfg)` split so the config-driven policy is read fresh every tick (per D-10/PRN-06) while
  keeping a directly-testable core function.

### Checkpoint (pre-resolved) — Payload retention window, D-14

This plan's `checkpoint:decision` task (D-14, rated one-way/irreversible) was resolved by the
orchestrator asking the human user directly **before** this plan was dispatched to the
executor. **The answer is 7 days.** Per the dispatch instructions, this was not re-asked,
re-paused, or treated as a blocking gate during execution — Task 3 proceeded directly using
the confirmed value.

### Task 3 — Payload retention purge pass (`broker/src/ledger.rs`, `config.rs`, `delivery.rs`)

- `config.rs`: `pub const DEFAULT_RETENTION_DAYS: u32 = 7;` (the confirmed value, not the
  RESEARCH.md provisional default of 14), used in `load_or_init_at`'s default `BrokerConfig`.
- `ledger.rs`: migrated `jobs.payload` from `BLOB NOT NULL` to nullable `BLOB` in
  `open_db()`'s `CREATE TABLE IF NOT EXISTS` (fresh-schema definition; no production installs
  exist yet in this phase, so no migration script was needed).
- `ledger.rs`: added `fn purge_expired_payloads(conn: &Connection, retention_days: u32)` —
  `UPDATE jobs SET payload = NULL WHERE payload IS NOT NULL AND status != 'accepted' AND
  (now_ms - created_at) > retention_days_in_ms`. Called once per `worker_tick_with_config`
  iteration in `delivery.rs`, after the reconciliation pass.
- `http.rs`: no code change needed. `handle_get_job`'s `SELECT` already only reads
  `status, attempts, win32_job_id, last_error` — the `payload` column is never selected into
  the `GET /jobs/{id}` response, so a NULL payload can never surface as an error there. This
  was verified with a new test (`get_job_returns_200_with_events_when_payload_already_purged`)
  rather than assumed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - missing critical functionality] Excluded `status='accepted'` jobs from the retention purge**
- **Found during:** Task 3, while writing `purge_expired_payloads`.
- **Issue:** The plan's literal SQL (`UPDATE jobs SET payload = NULL WHERE payload IS NOT NULL
  AND (now_ms - created_at) > retention_days_in_ms`) purges payload regardless of job status.
  Combined with making `payload` nullable, a job still in `'accepted'` status (awaiting
  delivery) that happened to sit unprocessed for longer than the retention window — e.g. the
  broker service was down for over a week — would have its payload silently nulled before
  `worker_tick`'s delivery pass ever sent it to WinSpool, permanently losing the print content
  for a job that was never actually delivered.
- **Fix:** Added `AND status != 'accepted'` to the purge query's WHERE clause. Documented in
  `purge_expired_payloads`'s doc comment.
- **Files modified:** `broker/src/ledger.rs`
- **Commit:** `177ad54`

**2. [Rule 1 - bug] Updated the pre-existing delivery.rs test that assumed retry-until-exhaustion for a nonexistent printer name**
- **Found during:** Task 1, running the full test suite after the retry-classification change.
- **Issue:** `delivery.rs`'s existing test `nonexistent_printer_retries_then_marks_failed_after_max_attempts`
  asserted that a job targeting `NONEXISTENT_TEST_PRINTER_19` retries `MAX_ATTEMPTS` (5) times
  before failing. Under the new classification, a nonexistent printer name is the canonical
  Terminal case (`classify_failure` matches "invalid" in the real `OpenPrinterW` error text —
  the exact scenario the plan's own Test 1 example and PRN-06's requirement describe), so it
  now correctly fails after exactly 1 attempt. The old test's assertions were directly
  superseded by this plan's own required behavior change, not an unrelated regression.
- **Fix:** Renamed to `nonexistent_printer_is_terminal_and_marks_failed_after_one_attempt` and
  updated assertions to `attempts == 1`. Also updated the adjacent restart-recovery test's
  pre-seeded `attempts` value (was `MAX_ATTEMPTS - 1`, now a literal `1`) since the constant no
  longer exists; that test's own assertions (`status != 'accepted'`, zero new rows for the
  idempotency key) were unaffected by the classification change and needed no logic changes.
- **Files modified:** `broker/src/delivery.rs`
- **Commit:** `84afa97`

No other deviations — Tasks 1 and 3 otherwise match the plan's `<action>` text.

## Must-Haves Verification (plan frontmatter)

**Truths:**
- ✅ "Retry/backoff is configurable per failure class... read from broker-config.json at
  worker-tick time, replacing the spike's hardcoded MAX_ATTEMPTS=5 constant" — `worker_tick`
  calls `config::load_or_init()` every tick; `MAX_ATTEMPTS` is fully removed
  (`grep -c 'const MAX_ATTEMPTS' broker/src/delivery.rs` returns `0`).
- ✅ "A delivery failure classified terminal... is marked failed after one attempt... while a
  transient failure... still retries per the configured policy" — proven by
  `retry::tests::terminal_failure_marks_failed_after_exactly_one_attempt`,
  `retry::tests::transient_failure_retries_up_to_configured_max_attempts`, and
  `delivery::tests::nonexistent_printer_is_terminal_and_marks_failed_after_one_attempt`.
- ✅ "The confirmed payload retention window... purges only the payload BLOB column on jobs
  older than the window; job/event metadata rows are never purged" — proven by
  `ledger::tests::purge_expired_payloads_nulls_payload_for_old_jobs_leaves_metadata_untouched`
  (status/attempts/created_at/updated_at asserted byte-identical before/after).
- ✅ "A job whose payload has already been purged still returns 200 from GET /jobs/{id} with
  payload omitted/null rather than erroring" — proven by
  `ledger::tests::get_job_returns_200_with_events_when_payload_already_purged`.

**Prohibitions:**
- ✅ "MUST NOT purge or truncate the jobs/events metadata rows... during the retention
  worker-tick pass" — `purge_expired_payloads`'s `UPDATE` statement touches only the `payload`
  column; no `events` table statement exists in the purge path at all.
- ✅ "MUST NOT auto-resubmit a job once marked unknown from any retry-classification path added
  in this plan" — `retry::classify_failure`/`decide` are only ever called from the delivery
  pass's `Err(e)` branch (jobs in `status='accepted'`); the reconciliation pass's
  `ambiguous_handoff` -> `'unknown'` branch (Plan 19-01) is untouched by this plan and contains
  no call into `retry.rs`.

**Artifact:** `broker/src/retry.rs` exists.

**Key links verified:**
- `delivery.rs worker_tick -> retry.rs classify_failure(err) -> Transient|Terminal -> config.rs
  RetryPolicy.max_attempts_transient`: confirmed in `worker_tick_with_config`'s `Err(e)` branch.
- `delivery.rs worker_tick -> ledger.rs purge_expired_payloads(retention_days) -> UPDATE jobs
  SET payload=NULL...`: confirmed at the end of `worker_tick_with_config`.

## Verification

- `cd broker && cargo test retry` — 7 tests pass.
- `cd broker && cargo test ledger` — 5 tests pass.
- `cd broker && cargo build --release && cargo test` — release build succeeds, full suite (21
  tests) passes, zero regressions.
- `grep -c 'const MAX_ATTEMPTS' broker/src/delivery.rs` — returns `0`.
- `broker/src/config.rs`'s `DEFAULT_RETENTION_DAYS` — equals `7`.
- `broker/src/ledger.rs`'s jobs table schema — no longer declares `payload BLOB NOT NULL`.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `broker/src/retry.rs`
- FOUND: `broker/src/config.rs` (DEFAULT_RETENTION_DAYS = 7)
- FOUND: `broker/src/ledger.rs` (purge_expired_payloads, nullable payload column)
- FOUND: `broker/src/delivery.rs` (MAX_ATTEMPTS/RECONCILE_AFTER_SECS removed, worker_tick_with_config)
- FOUND commit `84afa97`: feat(19-05): data-driven per-failure-class retry policy
- FOUND commit `177ad54`: feat(19-05): payload retention purge with confirmed 7-day window
