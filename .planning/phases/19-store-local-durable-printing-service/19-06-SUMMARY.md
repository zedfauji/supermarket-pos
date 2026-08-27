---
phase: 19-store-local-durable-printing-service
plan: 06
subsystem: printing
tags: [rust, sqlite, tauri, tanstack-query, zod, react, print-broker]

requires:
  - phase: 19-store-local-durable-printing-service (plan 01)
    provides: broker/ crate (http.rs GET /jobs/{id}/GET /audit, delivery.rs worker_tick reconciliation), src-tauri submit_to_broker's reqwest client-builder pattern
  - phase: 19-store-local-durable-printing-service (plan 04)
    provides: printJobErrorCopyKey, ReprintButton's post-Result-branching handleClick shape
provides:
  - "broker GET /jobs filterable/paginated list endpoint (origin/printer_name/status/from_ms/to_ms/limit/offset), closing the PRN-05 API gap"
  - "JOB_STATUS_DELETED now recorded as its own status='cancelled' (event os_reported_cancelled), split from 'failed' via a pure classify_status_bits/apply_status_bits_outcome pair"
  - "Alert-only stuck-queue detection (D-15): STUCK_QUEUE_THRESHOLD_MS=60_000, one queue_health_alert event per stuck job, dedup via a NOT IN (...) SQL clause — never a status transition, never touches the Windows queue"
  - "src-tauri get_print_jobs/get_print_job Tauri commands reaching the broker's HTTP API"
  - "entities/print-job query layer (usePrintJobs infinite list, usePrintJob(jobId) 1500ms-polling detail) reading exclusively through those two commands, never Supabase"
  - "Shared src/shared/ui/PrintJobStatusBadge.tsx (6-way status vocabulary) with the unknown-status 'Did this print?' confirm/dismiss flow, wired into ReprintButton.tsx"
  - "Fixed a pre-existing ConfirmDialog bug where Radix's Action/Cancel both fire onOpenChange(false), causing onCancel to double-fire (or fire after Confirm)"
affects: [19-07]

actuals:
  tokens: 16825
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "classify_status_bits/apply_status_bits_outcome split in delivery.rs: a pure, platform-independent classifier (unit-testable without real WinSpool hardware) feeding a ledger-mutation applier — mirrors the existing retry::classify_failure/decide separation in the same file."
    - "Hand-rolled query-string parsing in http.rs (no new URL-parsing crate), matching this crate's existing style."
    - "entities/print-job mirrors entities/audit-log's query-key-factory + useInfiniteQuery shape exactly, swapping supabase.from(...) for invoke('get_print_jobs'/'get_print_job', ...) as the sole data source (RESEARCH.md Pitfall 5)."
    - "usePrintJob(jobId) uses TanStack Query v5's function-form refetchInterval — polls 1500ms while status is accepted/submitted_to_os, stops (false) once terminal or 'unknown' — and enabled: jobId.length > 0 so no fetch/poll exists before a caller has a real job."
    - "PrintJobStatusBadge owns its own local dismissed/confirmOpen state and the ConfirmDialog wiring internally (not the caller) — matches D-07's 'one shared component used identically everywhere' requirement; callers just pass status + onReprint."

key-files:
  created:
    - src-tauri/src/commands/print_audit.rs
    - src/entities/print-job/index.ts
    - src/entities/print-job/model/index.ts
    - src/entities/print-job/model/queries.ts
    - src/entities/print-job/model/queries.test.ts
    - src/entities/print-job/model/types.ts
    - src/shared/ui/PrintJobStatusBadge.tsx
    - src/shared/ui/PrintJobStatusBadge.test.tsx
  modified:
    - broker/src/http.rs
    - broker/src/delivery.rs
    - src-tauri/src/commands/mod.rs
    - src-tauri/src/lib.rs
    - src/shared/lib/domain.ts
    - src/features/reprint-receipt/ui/ReprintButton.tsx
    - src/features/reprint-receipt/ui/ReprintButton.test.tsx
    - src/shared/ui/ConfirmDialog.tsx
    - src/shared/ui/index.ts
    - src/shared/lib/i18n/locales/en-US/common.json
    - src/shared/lib/i18n/locales/es-MX/common.json

key-decisions:
  - "Extended broker's existing handle_get_job (GET /jobs/{id}) to also return origin/printer_name/created_at/updated_at, which it previously omitted. This plan's own PrintJobDetailSchema extends PrintJobSchema (which requires those fields) — the existing response shape didn't carry them, so get_print_job's Zod-validated detail would have failed to parse. In-scope for this task (broker/src/http.rs is already a Task 1 file) and a direct consequence of this plan's own schema contract, not scope creep."
  - "Fixed a pre-existing ConfirmDialog bug (Rule 1): Radix's AlertDialogAction/AlertDialogCancel are both internally DialogPrimitive.Close, so clicking either fires the AlertDialog's onOpenChange(false) in addition to the button's own onClick. ConfirmDialog's onOpenChange unconditionally called onCancel(), so a Cancel click fired onCancel twice, and a Confirm click incorrectly fired onCancel afterward too. For every other existing ConfirmDialog caller this was latent/harmless (onCancel is typically just a state-closing no-op), but PrintJobStatusBadge's onCancel has a real side effect (reprint) — 'Yes, it printed' was triggering an unwanted reprint. Fixed with a handledRef guard so onOpenChange only calls onCancel for a true dismiss (Escape/outside click), not after an explicit button click already handled it."
  - "PrintJobStatusBadge owns the ConfirmDialog and all interactive state (dismissed/confirmOpen) internally rather than ReprintButton owning it — keeps the badge a true drop-in 'status + onReprint callback' component so the same component works unmodified for PaymentForm/PaymentPane/caja-summary/test-print/cash-drawer in later plans (D-07)."
  - "usePrintJob(jobId) gained an enabled: jobId.length > 0 guard (not explicitly named in Task 2's action text) so ReprintButton's usePrintJob(jobId ?? '') genuinely does not fetch/poll before the first print attempt, rather than relying on the caller to avoid calling the hook at all (which React's Rules of Hooks forbid conditionally)."
  - "usePrintJobs' fromMs/toMs filters are computed client-side via Date.getTime() rather than parsed from ISO strings on the Rust side — avoids adding a date/time crate to src-tauri for a value that's already trivially derivable in TypeScript."

requirements-completed: [PRN-04, PRN-05, PRN-07]

coverage:
  - id: D1
    description: "Broker exposes a filterable, paginated GET /jobs list endpoint (origin, printer_name, status, date range), closing the PRN-05 API gap between the spike's minimal GET /jobs/{id}/GET /audit and the full requirement."
    requirement: PRN-05
    verification:
      - kind: unit
        ref: "broker/src/http.rs#tests::list_jobs_no_filters_returns_jobs_ordered_desc_by_created_at"
        status: pass
      - kind: unit
        ref: "broker/src/http.rs#tests::list_jobs_filters_by_origin_and_status"
        status: pass
      - kind: unit
        ref: "broker/src/http.rs#tests::list_jobs_filters_by_date_range"
        status: pass
    human_judgment: false
  - id: D2
    description: "A WinSpool JOB_STATUS_DELETED status is now recorded as a distinct 'cancelled' job status (event category os_reported_cancelled), not folded into 'failed' — completing PRN-07's 6-way status vocabulary."
    requirement: PRN-07
    verification:
      - kind: unit
        ref: "broker/src/delivery.rs#tests::job_status_deleted_marks_cancelled_not_failed_with_os_reported_cancelled_event"
        status: pass
    human_judgment: false
  - id: D3
    description: "A job stuck in submitted_to_os for longer than STUCK_QUEUE_THRESHOLD_MS (60s) gets exactly one queue_health_alert event, never a status transition or auto-purge (D-15, alert-only)."
    verification:
      - kind: unit
        ref: "broker/src/delivery.rs#tests::stuck_submitted_to_os_job_gets_exactly_one_queue_health_alert_event"
        status: pass
    human_judgment: false
  - id: D4
    description: "entities/print-job reads through get_print_jobs/get_print_job Tauri commands calling the broker's HTTP API — never Supabase/useAuditLogs (RESEARCH.md Pitfall 5)."
    requirement: PRN-05
    verification:
      - kind: unit
        ref: "src-tauri/src/commands/print_audit.rs#tests (3 tests: empty jobs array, populated jobs array, filters query-string building)"
        status: pass
      - kind: unit
        ref: "src/entities/print-job/model/queries.test.ts (5 tests: usePrintJobs invoke shape + filter conversion, usePrintJob invoke shape + polling on/off)"
        status: pass
    human_judgment: false
  - id: D5
    description: "PrintJobStatusBadge renders all six locked status labels with the correct color token (amber=unknown, jade=completed, danger=failed only, neutral=accepted/submitted_to_os/cancelled) as the single shared component."
    requirement: PRN-04
    verification:
      - kind: unit
        ref: "src/shared/ui/PrintJobStatusBadge.test.tsx (8 tests: label+icon per status, no destructive/pos-danger for unknown, font-medium)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A job stuck in 'unknown' shows a dismissible amber badge; clicking it opens 'Did this print?'; 'Yes, it printed' dismisses with no further action; 'No, print again' triggers a fresh printReceipt() call and then dismisses (D-05/D-06)."
    requirement: PRN-04
    verification:
      - kind: unit
        ref: "src/features/reprint-receipt/ui/ReprintButton.test.tsx#Test 9 (2 tests: Yes dismisses without reprint, No triggers exactly one fresh printReceipt call)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Dismissing the unknown badge's own 'x' hides it locally without changing the job's status in the broker's ledger or triggering any mutation."
    requirement: PRN-04
    verification:
      - kind: unit
        ref: "src/features/reprint-receipt/ui/ReprintButton.test.tsx#Test 10"
        status: pass
    human_judgment: false

duration: ~31min
completed: 2026-08-27
status: complete
---

# Phase 19 Plan 06: Print-Job Status Read Path + Badge Summary

**Broker GET /jobs list endpoint (filterable/paginated) plus a distinct 'cancelled' status and alert-only stuck-queue detection; a broker-backed entities/print-job query layer through two new Tauri commands; and a shared PrintJobStatusBadge with a "Did this print?" confirm/reprint flow wired into ReprintButton.**

## Performance

- **Duration:** ~31 min
- **Tasks:** 3/3 completed
- **Files modified:** 19 (8 created, 11 modified)

## Accomplishments

- `broker/src/http.rs` gained `handle_list_jobs` — a new `GET /jobs` route (hand-rolled query-string parsing for `origin`/`printer_name`/`status`/`from_ms`/`to_ms`/`limit`/`offset`, default limit 50), checked before the existing `/jobs/{id}` route so a bare `/jobs`/`/jobs?...` never falls into the single-job path.
- `broker/src/delivery.rs`'s reconciliation pass now splits `JOB_STATUS_DELETED` into its own `status='cancelled'`/`os_reported_cancelled` outcome, distinct from `JOB_STATUS_ERROR`'s `status='failed'` — factored through a new pure `classify_status_bits`/`apply_status_bits_outcome` pair (mirrors the file's existing `retry::classify_failure`/`decide` split) so the split is unit-testable without real WinSpool hardware.
- New stuck-queue detection pass (D-15): `STUCK_QUEUE_THRESHOLD_MS=60_000`, one `queue_health_alert` event per stuck `submitted_to_os` job, deduped by a `NOT IN (SELECT job_id FROM events WHERE category='queue_health_alert')` clause — never a status transition, never touches the Windows print queue.
- New `src-tauri/src/commands/print_audit.rs`: `get_print_jobs`/`get_print_job` Tauri commands reusing `submit_to_broker`'s reqwest client-builder shape (connect-timeout, bearer auth, `127.0.0.1:8973`) for GET instead of POST. Registered in `lib.rs`.
- `domain.ts` gained `PrintJobStatusSchema` (6-way vocabulary), `PrintJobSchema`, `PrintJobEventSchema`, `PrintJobDetailSchema`, `PrintJobFiltersSchema`.
- New `entities/print-job/` module mirroring `entities/audit-log`'s query-key-factory + `useInfiniteQuery` shape: `usePrintJobs(filters)` (paginated list) and `usePrintJob(jobId)` (polls every 1500ms while `accepted`/`submitted_to_os`, stops once terminal or `unknown` — `unknown` never self-resolves).
- New shared `src/shared/ui/PrintJobStatusBadge.tsx`: Clock/CheckCircle2/XCircle/AlertTriangle/Ban icons, `font-medium` (not the shadcn Badge default `font-semibold`), amber `pos-warning` for `unknown` (never destructive/`pos-danger`, reserved for `failed`). For `unknown` only: a clickable trigger opens a "Did this print?" `ConfirmDialog`, plus a separate local-only "x" dismiss.
- `ReprintButton.tsx` now tracks the most recent `printReceipt()` call's `jobId` in local state (gated on `isTauri()`), rendering the badge only once a job exists for this specific button.
- Fixed a pre-existing bug in the shared `ConfirmDialog` (Radix's `AlertDialogAction`/`AlertDialogCancel` both internally close via `onOpenChange`, which was unconditionally re-invoking `onCancel`) — see Deviations.

## Task Commits

1. **Task 1: Broker GET /jobs list endpoint + split cancelled from failed + stuck-queue alert (D-15)** — `3462abe` (feat)
2. **Task 2: entities/print-job query layer + Tauri get_print_jobs/get_print_job commands** — `67b0357` (feat)
3. **Task 3: PrintJobStatusBadge + "Did this print?" confirm wiring on ReprintButton** — `d92b722` (feat)

**Plan metadata:** commit pending (this SUMMARY, worktree mode — orchestrator merges centrally; STATE.md/ROADMAP.md are NOT touched by this executor per orchestrator instruction)

## Files Created/Modified

- `broker/src/http.rs` — new `handle_list_jobs`/`parse_job_list_query`, route dispatch, `handle_get_job` extended to also return `origin`/`printer_name`/`created_at`/`updated_at`
- `broker/src/delivery.rs` — `STUCK_QUEUE_THRESHOLD_MS`, `classify_status_bits`/`apply_status_bits_outcome`, stuck-queue detection pass
- `src-tauri/src/commands/print_audit.rs` — new file: `get_print_jobs`/`get_print_job` commands, `PrintJobFiltersReq`/`PrintJobsPage`/`PrintJobDetailResp` types
- `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` — module/command registration
- `src/shared/lib/domain.ts` — `PrintJobStatusSchema`/`PrintJobSchema`/`PrintJobEventSchema`/`PrintJobDetailSchema`/`PrintJobFiltersSchema`
- `src/entities/print-job/` — new module (`types.ts`, `queries.ts`, `queries.test.ts`, `model/index.ts`, `index.ts`)
- `src/shared/ui/PrintJobStatusBadge.tsx` + `.test.tsx` — new shared badge component
- `src/shared/ui/ConfirmDialog.tsx` — `handledRef` guard fixing the double/incorrect `onCancel` bug
- `src/shared/ui/index.ts` — barrel export for `PrintJobStatusBadge`
- `src/features/reprint-receipt/ui/ReprintButton.tsx` + `.test.tsx` — badge wiring, jobId tracking, confirm/dismiss tests
- `src/shared/lib/i18n/locales/{en-US,es-MX}/common.json` — `printJobStatus.*` (6 keys) + `printJobConfirm.*` (4 keys)

## Decisions Made

See `key-decisions` in frontmatter (handle_get_job field extension, ConfirmDialog bug fix, badge-owns-dialog architecture, usePrintJob's `enabled` guard, client-side epoch-ms filter conversion).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality] Extended `handle_get_job` to return `origin`/`printer_name`/`created_at`/`updated_at`**
- **Found during:** Task 2, writing `PrintJobDetailSchema` (extends `PrintJobSchema`, which requires these fields)
- **Issue:** The existing `GET /jobs/{id}` response (from Plan 19-01) only returned `job_id`/`status`/`attempts`/`win32_job_id`/`last_error`/`events` — missing the fields this plan's own schema contract requires, which would make `get_print_job`'s Zod-validated detail fail to parse.
- **Fix:** Extended the SELECT and JSON response to include the four missing fields.
- **Files modified:** `broker/src/http.rs`
- **Verification:** All existing `broker/src/ledger.rs`/`http.rs` tests re-run and still pass (26/26 broker tests).
- **Committed in:** `67b0357` (Task 2 commit)

**2. [Rule 1 — bug] Fixed `ConfirmDialog`'s double/incorrect `onCancel` invocation**
- **Found during:** Task 3, writing ReprintButton's "Yes, it printed" test — it failed because `printReceipt` was called once when it should never be called on "Yes"
- **Issue:** Radix's `AlertDialogAction`/`AlertDialogCancel` are both internally a `DialogPrimitive.Close`, so clicking either one fires the `AlertDialog`'s `onOpenChange(false)` in addition to the button's own `onClick`. `ConfirmDialog`'s `onOpenChange` unconditionally called `onCancel()`, so a Cancel click fired `onCancel` twice, and — critically for this plan — a Confirm click incorrectly fired `onCancel` afterward too. For every pre-existing `ConfirmDialog` caller this was latent/harmless (their `onCancel` is typically just closing state), but `PrintJobStatusBadge`'s `onCancel` has a real side effect (reprint), making "Yes, it printed" silently trigger an unwanted reprint.
- **Fix:** Added a `handledRef` flag set by the Confirm/Cancel button handlers and the Escape-key handler; `onOpenChange` now only calls `onCancel` when the dialog closes WITHOUT either handler having already run (a true dismiss via outside click).
- **Files modified:** `src/shared/ui/ConfirmDialog.tsx`
- **Verification:** Existing `ConfirmDialog.test.tsx` (2 tests) still passes; full `npm run test` (1242/1245 non-pre-existing-failures pass) shows no regression across any of `ConfirmDialog`'s other callers.
- **Committed in:** `d92b722` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 schema-completeness fix, 1 Rule 1 bug fix in a shared component).
**Impact on plan:** No scope creep — both fixes are direct, necessary consequences of this plan's own schema contract and the new interactive-badge feature it introduces. The ConfirmDialog fix is a net-positive correctness improvement for every existing caller too (removes a latent double-invocation of `onCancel`).

## Issues Encountered

- **Vitest global-setup requires a reachable Supabase instance** (same pre-existing project-wide constraint as prior Phase 19 plans) — a local self-hosted Supabase stack was already running at `127.0.0.1:54321`; passed `VITE_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` inline on `npx vitest run`/`npm run test` (no `.env.local` created or committed).
- **Tauri build requires `broker/target/release/broker.exe` to exist** (a `tauri.conf.json` bundling resource) — ran `cargo build --release` in `broker/` once before `cargo test` in `src-tauri/` would compile at all. Pre-existing project constraint from Plan 19-02, not introduced by this plan.
- **Pre-existing, unrelated test failures** confirmed via full `npm run test`: `src/entities/staff/model/queries.clock.test.ts` and `src/features/close-tab/tests/useCloseTab.test.ts` (2 tests, "Supabase not initialized" — a test-environment/`AppConfigProvider` ordering issue unrelated to this plan's files), and the 3 `useProductPeekWindow.test.ts` failures already documented in `.planning/phases/19-store-local-durable-printing-service/deferred-items.md` from Plan 19-04 (a separate non-GSD session's uncommitted `isTauri()` fix in the main working tree, not present in this forked worktree). None of these files were touched by this plan; confirmed by re-running each in isolation.

## Must-Haves Compliance (plan frontmatter)

All 7 `must_haves.truths` and both `prohibitions`, checked explicitly:

**Truths:**
1. "The broker exposes a filterable, paginated GET /jobs list endpoint..." — **met**. `handle_list_jobs` in `broker/src/http.rs`, 3 passing tests (no-filter ordering, origin+status filter, date-range filter).
2. "A WinSpool JOB_STATUS_DELETED status is now recorded as a distinct 'cancelled' job status..." — **met**. `classify_status_bits(JOB_STATUS_DELETED)` returns `Cancelled`; `grep -n "status='cancelled'" broker/src/delivery.rs` finds the branch, distinct from `status='failed'`.
3. "entities/print-job reads through a new Tauri command... not entities/audit-log's Supabase-backed useAuditLogs hook." — **met**. `grep -n "supabase.from(\|db.from(" src/entities/print-job/model/queries.ts` finds zero matches (only the file's own doc comment mentions the string); all data flows through `invoke('get_print_jobs'/'get_print_job', ...)`.
4. "PrintJobStatusBadge renders one of the six locked status labels with the correct color token... single shared component..." — **met**. 8 passing tests cover all 6 statuses' label+icon, the never-destructive-for-unknown color rule, and `font-medium`.
5. "A job stuck in 'unknown' shows a dismissible amber badge; clicking it opens 'Did this print?'... 'Yes' dismisses... 'No' triggers a fresh printReceipt()..." — **met**. `ReprintButton.test.tsx` Test 9 (2 assertions: Yes calls `printReceipt` zero times, No calls it exactly once).
6. "Dismissing the unknown badge without answering hides the badge locally but does not change the job's unknown status..." — **met**. `ReprintButton.test.tsx` Test 10: dismiss hides the badge and `printReceipt` is never called (no mutation of any kind — the badge's dismissed state is component-local `useState`, never written to any query cache or the broker).
7. "A job stuck in submitted_to_os for longer than a configurable stale threshold... gets flagged with a queue_health_alert event... alert-only, never auto-purged or auto-resubmitted..." — **met**. `stuck_submitted_to_os_job_gets_exactly_one_queue_health_alert_event` proves exactly one alert on first detection, no status change, and no duplicate alert on a second tick.

**Prohibitions:**
1. "MUST NOT reuse entities/audit-log's useAuditLogs Supabase query hook for any print-job data..." — **met**, see Truth 3.
2. "MUST NOT auto-resubmit an unknown job from the badge/confirm UI itself or from usePrintJob's polling..." — **met**. `usePrintJob`'s `refetchInterval` only ever returns a poll interval or `false` — it has no mutation path. The only reprint trigger is the badge's `onCancel` callback, itself only invoked by the user's explicit "No, print again" click (proven by Test 9's zero-calls-on-Yes / exactly-one-call-on-No assertions).
3. "MUST NOT show a toast when a job's status transitions to os_reported_printed/completed while polling..." — **met by code inspection**: `usePrintJob`'s `queryFn`/`refetchInterval` never call `toast.*`; `PrintJobStatusBadge` renders only visual state, no toast side effects anywhere in the component.
4. "MUST NOT auto-purge or auto-clear a stuck head-of-queue Windows print job when queue_health_alert fires..." — **met**. The stuck-queue detection pass's SQL only ever `INSERT`s into `events` — it contains no `UPDATE jobs SET status=...` and no WinSpool API call of any kind.

## Threat Flags

None beyond the two already declared in this plan's own `<threat_model>` (T-19-15, T-19-16), both mitigated as designed: the new `GET /jobs` list route reuses the same bearer-auth check as every other broker route and never selects the `payload` BLOB column; `usePrintJob`'s polling has no mutation path, and the only reprint trigger is the user's explicit "No, print again" click.

## Next Phase Readiness

- The broker-backed print-job read path (`entities/print-job`, `PrintJobStatusBadge`) is now proven end-to-end on one caller (`ReprintButton`) and ready to compose into Plan 19-07's `PrintJobsTable`/`PrintJobFilterBar`/`PrintJobDetailSheet` widgets (`usePrintJobs(filters)` is already shaped for a `DataTable` + staged-filter UI; `usePrintJob(jobId)`'s `events` array is already shaped for a detail-Sheet timeline).
- `PrintJobStatusBadge` is a genuinely reusable drop-in (`status` + `onReprint` props only) — future plans wiring it into `PaymentForm`/`PaymentPane`/caja-summary/test-print/cash-drawer need no changes to the badge itself.
- The `ConfirmDialog` fix benefits every existing and future caller of that shared component, not just this plan's badge.

## Self-Check: PASSED

All files created/modified in this plan verified present on disk; all three task commits (`3462abe`, `67b0357`, `d92b722`) verified present in `git log --oneline -5`.

---
*Phase: 19-store-local-durable-printing-service*
*Completed: 2026-08-27*
