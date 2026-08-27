---
phase: 19-store-local-durable-printing-service
plan: 01
subsystem: infra
tags: [rust, sqlite, tiny_http, windows, print-broker, tauri, reqwest]

requires: []
provides:
  - Standalone broker/ Rust crate (ledger.rs, http.rs, delivery.rs, main.rs) — durable-accept-before-ack HTTP -> WAL SQLite ledger -> WinSpool delivery -> reconciliation
  - src-tauri submit_to_broker() HTTP client with a 1.5s connect-timeout against the IPv4 literal 127.0.0.1:8973
  - testPrint() migrated end-to-end onto the broker contract, returning a durable job id
  - Three new AppErrorCode values (PRINT_BROKER_UNREACHABLE, PRINT_JOB_REJECTED, PRINT_JOB_UNKNOWN)
affects: [19-02, 19-03, 19-04, 19-05]

actuals:
  tokens: 19063
  tasks: 2
  commits: 2

tech-stack:
  added: [rusqlite 0.40, tiny_http 0.12, uuid 1.x (broker + src-tauri), base64 0.23 (broker)]
  patterns:
    - "Durable-accept-before-response: SQLite INSERT of job+first event completes before the HTTP 200 is written"
    - "Idempotency-dedup-before-insert: idempotency_key lookup runs before any new row is created"
    - "Never-auto-resubmit-unknown: worker_tick only ever selects status='accepted' or 'submitted_to_os' rows — 'unknown' jobs are structurally excluded from every future tick"
    - "HttpResult (status, body) as the handler-return boundary, decoupled from tiny_http::Response — makes handler logic directly unit-testable"

key-files:
  created:
    - broker/Cargo.toml
    - broker/src/main.rs
    - broker/src/http.rs
    - broker/src/ledger.rs
    - broker/src/delivery.rs
    - e2e/receipts/broker-test-print.spec.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/commands/printer.rs
    - src/shared/lib/result.ts
    - src/shared/lib/pos-printer.ts
    - src/shared/lib/pos-printer.test.ts

key-decisions:
  - "handle_submit/handle_get_job/handle_audit return a plain HttpResult{status,body} instead of tiny_http::Response directly, wrapped at the HTTP edge by to_tiny_http_response() — same wire behavior as the spike, but lets cargo tests assert on status/body without depending on tiny_http's Response introspection API."
  - "Test 2 (401-before-any-write) drives a real HTTP round trip against run_http_server bound to a fixed non-production test port (127.0.0.1:18980), using a minimal dependency-free raw-HTTP TcpStream client — the auth check lives inline in the server's request loop before any handler runs, so this is the one test in the suite that needs a genuine HTTP call rather than a direct function call."
  - "Test 5 (restart-mid-flight recovery) pre-seeds a job's attempts at MAX_ATTEMPTS-1 against the deterministic NONEXISTENT_TEST_PRINTER_19 target, so a single post-restart worker_tick call deterministically transitions status away from 'accepted' (to 'failed' via retry-exhaustion) without depending on a real Windows printer object being present on the test host — matches this plan's own verification note that WinSpool success paths are not guaranteed to be exercisable in every environment."

requirements-completed: [PRN-01, PRN-02, PRN-03, PRN-06, PRN-07]

coverage:
  - id: D1
    description: "A test_print submission returns 200 with a stable UUID job_id only after the broker's SQLite ledger durably commits the job row and its first event row (PRN-02)."
    requirement: PRN-02
    verification:
      - kind: unit
        ref: "broker/src/http.rs#tests::valid_submit_returns_200_and_durably_commits_accepted_status"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /jobs with a missing or wrong Authorization: Bearer header is rejected 401 before any SQLite write (PRN-01)."
    requirement: PRN-01
    verification:
      - kind: integration
        ref: "broker/src/http.rs#tests::missing_or_wrong_auth_header_rejected_401_before_any_sqlite_write"
        status: pass
    human_judgment: false
  - id: D3
    description: "Malformed payload_b64 or an empty idempotency_key/printer_name is rejected 400 before any SQLite write (PRN-02)."
    requirement: PRN-02
    verification:
      - kind: unit
        ref: "broker/src/http.rs#tests::invalid_payload_rejected_400_before_any_write"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two POST /jobs with the same idempotency_key create exactly one job row and return the same job_id both times (PRN-06)."
    requirement: PRN-06
    verification:
      - kind: unit
        ref: "broker/src/http.rs#tests::duplicate_idempotency_key_returns_same_job_id_and_creates_no_second_row"
        status: pass
    human_judgment: false
  - id: D5
    description: "A job durably accepted but never delivered survives a simulated broker restart (fresh Connection against the same ledger path) and the next worker_tick delivers/processes it with zero new rows for its idempotency_key (PRN-03)."
    requirement: PRN-03
    verification:
      - kind: unit
        ref: "broker/src/delivery.rs#tests::accepted_job_survives_restart_and_worker_tick_transitions_it_with_zero_new_rows"
        status: pass
    human_judgment: false
  - id: D6
    description: "A job whose printer_name does not exist retries up to MAX_ATTEMPTS (5) times then marks 'failed' with a non-null last_error."
    verification:
      - kind: unit
        ref: "broker/src/delivery.rs#tests::nonexistent_printer_retries_then_marks_failed_after_max_attempts"
        status: pass
    human_judgment: false
  - id: D7
    description: "A read-only ledger file causes POST /jobs to return 500 persistence_failed with zero rows written, never a false 'accepted'."
    verification:
      - kind: unit
        ref: "broker/src/ledger.rs#tests::read_only_ledger_file_returns_persistence_failed_without_writing_rows"
        status: pass
    human_judgment: false
  - id: D8
    description: "HardwareSettingsTab's Test Print button round-trips through the broker (mocked at the invoke boundary) and shows the existing success toast."
    requirement: PRN-02
    verification:
      - kind: e2e
        ref: "e2e/receipts/broker-test-print.spec.ts#Test Print round-trips through the broker and shows the existing success toast (Test 4)"
        status: unknown
    human_judgment: true
    rationale: "This environment has no .env.local Supabase/E2E credentials configured, so requireIntegrationEnv() skips the spec (0 pass/0 fail) rather than proving it. The spec is authored, lints clean, and typechecks; it needs a credentialed run to move from unknown to pass/fail."
  - id: D9
    description: "An unreachable broker (invoke('test_print') rejecting with 'broker unreachable') surfaces a toast.error naming the broker, and testPrint()'s Result carries PRINT_BROKER_UNREACHABLE."
    requirement: PRN-02
    verification:
      - kind: unit
        ref: "src/shared/lib/pos-printer.test.ts#testPrint > maps a \"broker unreachable\" failure to PRINT_BROKER_UNREACHABLE (D-12)"
        status: unknown
      - kind: e2e
        ref: "e2e/receipts/broker-test-print.spec.ts#An unreachable broker shows a toast.error mentioning the broker (Test 8)"
        status: unknown
    human_judgment: true
    rationale: "Vitest's global-setup also requires Supabase credentials not present in this environment (fails before any test file runs, unrelated to this plan's code) and the e2e spec skips for the same reason as D8. Both are authored/reviewed but unrun in this session — needs a credentialed run."

duration: ~2h
completed: 2026-08-27
status: complete
---

# Phase 19 Plan 01: Durable test_print Tracer Summary

**A standalone `broker/` Rust crate (WAL SQLite ledger + tiny_http + WinSpool) durably accepts, delivers, and reconciles `test_print` jobs end-to-end, replacing the old silent-fallback WinSpool path with an authenticated HTTP submission from the Tauri command layer.**

## Performance

- **Tasks:** 2/2 completed
- **Files modified:** 14 (Task 1) + 3 (Task 2), see `key-files` above
- **Commits:** 2

## Accomplishments

- New standalone `broker/` crate (own `Cargo.toml`, deliberately not a Cargo workspace member) proving the entire store-local durable printing architecture on one job type: `POST /jobs` durably commits the job + its first event to a WAL SQLite ledger (`synchronous=FULL`) *before* returning the 200 response; an independent worker thread delivers accepted jobs to a named Windows printer queue via the proven `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter` sequence; a reconciliation pass polls `GetJobW` for jobs already submitted and marks ambiguous handoffs `'unknown'` — a status that is structurally excluded from every future worker tick (never auto-resubmitted).
- `src-tauri/src/commands/printer.rs`'s `test_print` command rewritten from a direct-WinSpool call to `submit_to_broker()`, a `reqwest` client with an explicit 1500ms connect-timeout against the IPv4 literal `127.0.0.1:8973` (never `localhost`) — closing the "unreachable broker silently hangs ~2s+" pitfall the spike found on this host's dual-stack DNS resolution.
- `src/shared/lib/result.ts` gained three new `AppErrorCode` values (`PRINT_BROKER_UNREACHABLE`, `PRINT_JOB_REJECTED`, `PRINT_JOB_UNKNOWN`); `pos-printer.ts`'s `testPrint()` now returns `Promise<Result<{ jobId: string }>>`, mapping the Rust command's error string onto the correct code.
- 8 cargo tests (broker) + 4 Vitest tests (pos-printer.test.ts) + 2 Playwright tests (broker-test-print.spec.ts) cover the happy path, auth rejection, invalid-payload rejection, idempotency dedup, restart-mid-flight recovery, persistence failure, retry-exhaustion, and the client-side connect-timeout error mapping.

## Task Commits

1. **Task 1: Tracer — durable test_print client through broker through Windows Spooler** — `b086694` (feat)
2. **Task 2: Harden the tracer — restart recovery, ambiguous handoff, connect-timeout fault cases** — `e4627d5` (test)

**Plan metadata:** commit pending (this SUMMARY + REQUIREMENTS.md, worktree mode — orchestrator merges centrally)

## Files Created/Modified

- `broker/Cargo.toml` — standalone crate manifest (rusqlite/bundled, serde/serde_json, tiny_http, uuid/v4, base64; windows 0.61 w/ Win32_Foundation, Win32_Graphics_Printing, Win32_Graphics_Gdi under `cfg(windows)`)
- `broker/src/ledger.rs` — WAL SQLite schema (`jobs`, `events`), `%ProgramData%\PrintBroker\` data dir/log helpers, `open_db(path)` takes an explicit path (never a hidden global) so tests inject a tempfile path
- `broker/src/http.rs` — `handle_submit`/`handle_get_job`/`handle_audit`/`run_http_server`/`resolve_broker_secret`; auth-before-any-DB-touch, idempotency-dedup-before-insert, durable-insert-before-200
- `broker/src/delivery.rs` — `win_print::send_raw_named`/`query_job_status` (Win32), `worker_tick` (delivery pass + tight 0/10/20/40/80ms post-submit poll + reconciliation pass), `JOB_STATUS_*` bit constants, `MAX_ATTEMPTS=5`/`RECONCILE_AFTER_SECS=3`
- `broker/src/main.rs` — foreground bootstrap: spawns the worker thread, runs the HTTP server on the main thread (no Windows Service registration yet — Plan 19-02)
- `src-tauri/Cargo.toml` — added `uuid = { version = "1", features = ["v4"] }`
- `src-tauri/src/commands/printer.rs` — `PrintJobAck` struct, `resolve_broker_secret()`, `submit_to_broker()`, rewritten `test_print()` command
- `src/shared/lib/result.ts` — 3 new `AppErrorCode` values
- `src/shared/lib/pos-printer.ts` — `testPrint()` return-type/error-mapping change
- `src/shared/lib/pos-printer.test.ts` — updated `testPrint` describe block for the new return shape + 2 new error-mapping tests
- `e2e/receipts/broker-test-print.spec.ts` — new spec, Test 4 (success toast) + Test 8 (unreachable-broker toast.error)

## Decisions Made

- See `key-decisions` in frontmatter (HttpResult testability adaptation, real-HTTP-round-trip auth test, deterministic nonexistent-printer restart-recovery test).
- Split the plan's Task 2 hardening tests cleanly into their own commit (rather than writing all 8 cargo tests in Task 1's commit) so each commit's diff matches exactly what its own task's `<verify>`/`<acceptance_criteria>` describes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `PrintJobAck` needed `Serialize`, not just `Deserialize`**
- **Found during:** Task 1 (`cargo check` on `src-tauri`)
- **Issue:** Tauri's `#[tauri::command]` macro requires the return type to implement `IpcResponse` (which needs `Serialize`, since the value crosses the IPC boundary to the frontend). `PrintJobAck` only derived `Deserialize` (matching the plan's action text), which fails `cargo check` with an `E0599` trait-bound error pointing at the `generate_handler!` macro.
- **Fix:** Added `#[derive(serde::Serialize, serde::Deserialize)]` (both, since the struct also needs `Deserialize` for `resp.json::<PrintJobAck>()` on the reqwest response side).
- **Files modified:** `src-tauri/src/commands/printer.rs`
- **Verification:** `cd src-tauri && cargo check` passes cleanly.
- **Committed in:** `b086694` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — a one-line derive fix required for the code to compile at all).
**Impact on plan:** No scope creep; purely a compile-fix inside the exact struct the plan specified.

## Must-Haves Compliance (plan frontmatter)

All 8 `must_haves.truths` and all 3 `prohibitions` from the plan frontmatter, checked explicitly:

**Truths:**
1. Durable-accept-before-ack + stable UUID job_id — **met**, `broker/src/http.rs#tests::valid_submit_returns_200_and_durably_commits_accepted_status`.
2. 401 before any SQLite write on bad/missing auth — **met**, `broker/src/http.rs#tests::missing_or_wrong_auth_header_rejected_401_before_any_sqlite_write` (real HTTP round trip).
3. 400 before any SQLite write on malformed payload/empty required fields — **met**, `broker/src/http.rs#tests::invalid_payload_rejected_400_before_any_write`.
4. Idempotency dedup returns same job_id — **met**, `broker/src/http.rs#tests::duplicate_idempotency_key_returns_same_job_id_and_creates_no_second_row`.
5. Restart-mid-flight recovery, zero client resubmission — **met**, `broker/src/delivery.rs#tests::accepted_job_survives_restart_and_worker_tick_transitions_it_with_zero_new_rows` (deterministic, hardware-independent framing — see Known Gaps below).
6. "unknown" jobs never auto-resubmitted — **met by code inspection and structural guarantee** (worker_tick's delivery/reconciliation queries only ever select `status='accepted'`/`'submitted_to_os'` rows; `'unknown'` is excluded from both), verbatim-ported from the spike's real-hardware-validated branch, but **not independently re-proven by a new automated test in this plan's suite** — see Known Gaps.
7. Tauri HTTP client uses ~1.5s connect-timeout + IPv4 literal `127.0.0.1` — **met by code** (`submit_to_broker`'s `reqwest::Client::builder().connect_timeout(Duration::from_millis(1500))` against `http://127.0.0.1:8973`), verified by direct code review (not independently unit-testable without excessive `reqwest::Client` introspection scaffolding disproportionate to this tracer's scope).
8. Unreachable broker -> `PRINT_BROKER_UNREACHABLE` within the connect-timeout window (marked `verification: backstop` in the plan) — **met by code** and unit-tested in `pos-printer.test.ts` (`maps a "broker unreachable" failure to PRINT_BROKER_UNREACHABLE`); this test is authored but unrun in this session (see Known Gaps — Vitest global-setup requires Supabase credentials not present here).

**Prohibitions:**
1. MUST NOT silently fall back to the old direct-WinSpool try_send_raw-with-fallback path for `test_print` — **met**: the rewritten `test_print()` command calls `submit_to_broker()` exclusively; it no longer calls `try_send_raw` or `write_fallback_bytes` on any platform.
2. MUST NOT deliver to WinSpool synchronously inside the `POST /jobs` handler — **met**: `handle_submit` only performs the SQLite INSERT; all WinSpool delivery happens exclusively inside `worker_tick`, run on the independent worker thread.
3. MUST NOT auto-resubmit a job once marked `'unknown'` — **met**: both of `worker_tick`'s SQL queries (delivery pass, reconciliation pass) filter on `status='accepted'`/`status='submitted_to_os'` respectively — `'unknown'` rows can never match either query again.

## Known Gaps

- **must_haves.truths #6 (ambiguous handoff) has no independent automated test in this plan's own suite.** The `Ok(None) => mark 'unknown', never resubmit` branch in `broker/src/delivery.rs`'s reconciliation pass is a verbatim, logic-unchanged port of the exact branch Spike 001 validated on real Windows Service infrastructure and a real thermal printer (see `.planning/spikes/001-windows-print-broker/README.md`'s "Second real surprise" finding). Reproducing it deterministically in this plan's own test suite requires a live Windows printer object where `OpenPrinterW` succeeds but `GetJobW` returns no data for a submitted job id — this host has several real printer objects installed (`XP-58`, `Microsoft Print to PDF`, etc.) but driving one through the RAW datatype from an automated test risks non-deterministic/hanging behavior (virtual printers in particular often expect an interactive save-path prompt), which this plan's own verification note explicitly allows skipping rather than risk a flaky/hanging test suite. Logged to `.planning/WINDOWS.md` (ledger entry #38, `unrun-verify`).
- **The new Playwright spec (`broker-test-print.spec.ts`) and 2 new `pos-printer.test.ts` cases could not be executed in this session.** This sandboxed worktree has no `.env.local` with Supabase/E2E credentials configured — `requireIntegrationEnv()` skips the Playwright spec (0 pass / 0 fail, matching every other credential-gated spec in this suite), and Vitest's `global-setup.ts` throws before any test file runs at all (a pre-existing project-wide constraint, not introduced by this plan). Both files typecheck cleanly (`npm run typecheck`) and lint cleanly (`npx eslint`); they need a credentialed run to move from `unknown` to `pass`/`fail` in the `coverage` block above.

## Verification Results (this session)

- `cd broker && cargo build --release && cargo test` — **PASS**: release build clean (zero warnings), 8/8 tests pass.
- `cd src-tauri && cargo check` — **PASS**: clean, and `cargo test --lib` (all 6 existing printer.rs tests) still pass.
- `npm run typecheck` — **PASS**: clean across the whole repo.
- `npm run lint` (src/) — **PASS**: clean (only pre-existing `boundaries` plugin config warnings, unrelated to this plan).
- `npx playwright test e2e/receipts/broker-test-print.spec.ts` — **2 skipped** (missing `.env.local` integration credentials in this environment — see Known Gaps).

## Issues Encountered

None beyond the auto-fixed `PrintJobAck: Serialize` compile error documented above.

## Next Phase Readiness

- `broker/` is a runnable foreground binary (`cargo run` from `broker/`) proving the full durable-accept -> deliver -> reconcile pipeline for `test_print`. Plan 19-02 adds Windows Service registration (`windows-service` crate), the per-store install-time secret (replacing the `dev-only-insecure-secret-CHANGE-AT-INSTALL` fallback both `broker/src/http.rs::resolve_broker_secret` and `src-tauri/src/commands/printer.rs::resolve_broker_secret` currently return), LAN/VPN firewall binding, and wiring `"RECEIPT_PRINTER"`'s current hardcoded placeholder to the real Settings-configured printer name.
- Plan 19-03 expands this same contract to the remaining three job types (receipt, reprint, caja summary, cash-drawer) per D-09 — `pos-printer.ts`'s public API is designed to stay unchanged for those callers.
- Before this plan is considered fully proven end-to-end in CI/production, the two "Known Gaps" above need a credentialed run (Playwright + Vitest against real Supabase test env) and, ideally, a real cross-machine test of the ambiguous-handoff branch against one of this host's actual printer objects.

## Self-Check: PASSED

All files created/modified in this plan verified present on disk; both task commits (`b086694`, `e4627d5`) verified present in `git log --oneline --all`.
