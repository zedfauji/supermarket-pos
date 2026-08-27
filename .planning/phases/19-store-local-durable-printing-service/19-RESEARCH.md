# Phase 19: Store-Local Durable Printing Service - Research

**Researched:** 2026-08-26
**Domain:** Windows Service architecture, durable local job queues, Windows Print Spooler (WinSpool) integration, LAN-bound authenticated HTTP, SQLite durability
**Confidence:** HIGH for the spike-validated core (already run against real hardware); MEDIUM for the production-hardening deltas (service install/identity, LAN binding, retention) this research adds on top

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Service identity & install**
- **D-01:** Broker installs as a native Windows Service via the `windows-service` Rust crate's SCM
  handler (no `nssm` dependency in production) — broker.exe registers itself as a real service.
  — **Reversibility:** costly — **rationale:** switching install mechanisms later means rewriting
  the installer script and re-testing SCM lifecycle behavior; the spike's nssm-based install
  cannot simply be swapped in place.
- **D-02:** Service account is Claude's discretion during planning/execution — see Claude's
  Discretion below; spike finding #4 explicitly flags LocalSystem (what the spike used) as
  overprivileged for production.
- **D-03:** Broker ships bundled inside the same Tauri MSI/NSIS installer as the POS app, with a
  post-install action (elevated) that registers the service once — not a separate standalone
  installer artifact.
- **D-04:** Auth secret between LAN clients and broker is a per-store secret generated at install
  time and written to both the Tauri app config and the broker config — no central/cloud secret
  service, no reuse of Supabase session/JWT (broker has no cloud dependency per PRN-01).

**Ambiguous-handoff ("unknown") operator UX**
- **D-05:** The confirm/reprint affordance for jobs stuck in `unknown` extends the existing
  `src/features/reprint-receipt/ui/ReprintButton.tsx` area with an inline status badge + confirm
  action, rather than a new dedicated page.
- **D-06:** Resolution flow is a manual "Did this print?" Yes/No confirm; "No" triggers an explicit
  reprint. The broker/UI must never auto-resubmit an `unknown` job (duplicate-print risk, per spike
  finding #1 and PRN-06/PRN-07).
- **D-07:** All job types (receipts, caja summary, test-print, cash-drawer) get the same shared
  status/confirm component — not receipts-only.
- **D-08:** `unknown` status is non-blocking — surfaces as a dismissible badge/notification; the
  cashier can continue selling without resolving it first.

**Migrating existing callers to one contract**
- **D-09:** `src/shared/lib/pos-printer.ts` keeps its current public API; only its internals swap
  from direct Tauri `invoke` calls to broker HTTP submission. All 6 existing callers (checkout,
  `ReprintButton`, `PaymentForm`, `PaymentPane`, `payment` queries, help content) need zero
  signature changes.
  — **Reversibility:** costly — **rationale:** if a caller-visible contract change is later needed
  anyway, this "hide it behind the existing API" choice means a second migration pass across the
  same 6 call sites.
- **D-10:** Retry/backoff is configurable per failure class (transient vs. terminal), stored in
  broker config — not the spike's hardcoded `MAX_ATTEMPTS=5` constant. Matches the spike's own
  explicit recommendation.
- **D-11:** Migration is a hard requirement: every one of the 6 callers must explicitly handle the
  submission `Result` (no silent discard), enforced by automated tests — directly satisfies PRN-04.
- **D-12:** When the broker itself is unreachable, callers use a short client-side connect-timeout
  (~1-2s) and show an immediate toast — do not rely on OS-level fail-fast, per spike finding #3
  (unreachable broker can silently time out ~2s+ rather than instantly refuse on Windows).

**Audit surface, retention & queue-health**
- **D-13:** Print-job audit UI extends the existing `/audit` page with a new Print Jobs tab —
  reuses `AuditPage`'s existing table/diff-viewer patterns rather than a new standalone page.
- **D-14:** Payload retention is short (7-30 days) for job payload bytes (receipt content, etc.);
  metadata/audit trail (job IDs, timestamps, status transitions) is retained indefinitely per
  PRN-05's "queryable command counts... by time range" requirement.
  — **Reversibility:** one-way — **rationale:** once payload bytes are purged past the retention
  window there is no way to recover them; the exact window value should be confirmed during
  planning/research, not assumed from this discussion.
- **D-15:** Queue-health monitoring (spike finding #2: a stuck head-of-queue job blocks the whole
  printer queue) is alert-only for v1.5 — the broker flags a stuck job in the audit/UI; the
  operator clears it manually via Windows Print Management. The broker does not auto-purge a
  stuck OS-level print job.
- **D-16:** Print-job audit access reuses the existing `view_audit_log` RBAC action (manager/admin)
  — no new dedicated permission for this phase.

### Claude's Discretion
- Service account for the Windows Service (dedicated least-privilege local service account is the
  spike's own recommendation and the default researchers/planners should favor, but the user
  explicitly deferred the specific mechanism to Claude's judgment during planning). This research's
  recommendation: see Common Pitfalls / Pitfall 2 and Pattern 4 — a dedicated local least-privilege
  standard user account, not `LocalSystem`/`LocalService`/`NetworkService`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Two items are explicitly flagged as follow-up
verification rather than new scope:
- LAN/VPN cross-machine network binding was validated as an open item by the spike itself (only
  loopback was tested) — this phase's planning/execution must close that gap before production
  sign-off, it is not deferred to a future phase. (See Common Pitfalls / Pitfall 1 and Open
  Question 1.)
- The exact payload retention window (7-30 days, D-14) should be pinned to a specific number during
  planning/research rather than left as a range. (See Assumptions Log A1 — this research pins it to
  14 days, pending owner confirmation.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRN-01 | Mobile, desktop, and POS clients on the store LAN/VPN submit all receipt, reprint, report, test-print, and cash-drawer print commands to one authenticated store-local broker; the broker is not exposed to the public internet and has no cloud dependency. | Architecture Patterns (system diagram, Pattern 5 NSIS install hook); Common Pitfalls #1 (LAN/VPN firewall gap) and #2 (service-account printer visibility); Security Domain V2/V4; Open Question 1 (VPN topology) |
| PRN-02 | A print-dependent workflow succeeds only after the broker durably records the job and returns its stable job/correlation ID. Unreachable broker, rejected payload, authentication, persistence, or routing failures fail immediately with a structured error and never report success. | Architecture Patterns Pattern 1 (durable-accept-before-response, spike-proven); Common Pitfalls #4 (client-side connect-timeout); Code Examples (reqwest client with connect_timeout) |
| PRN-03 | An accepted job survives client, Tauri application, and broker process restart and is delivered asynchronously to its configured named Windows printer queue. | Architecture Patterns Pattern 1 + SQLite WAL/synchronous=FULL durability (Code Examples); spike's proven restart-recovery finding (Sources, Standard Stack) |
| PRN-04 | Every printing boundary propagates and logs normalized structured errors with the same job/correlation ID. UI-originated terminal failures show an actionable toast; background and non-UI callers explicitly handle and log failed results rather than discarding them. | Architectural Responsibility Map (Rust command layer as secret/HTTP-client custodian); Assumptions Log A2 (new AppErrorCode values); Validation Architecture PRN-04 row (per-caller Vitest coverage) |
| PRN-05 | The broker retains an auditable command and event history containing origin/actor, printer endpoint, payload hash/reference, timestamps, attempts, state transitions, Windows job ID, and normalized errors, with queryable command counts and retention controls. | Architecture (Pitfall 5 — new `entities/print-job` data source, not `entities/audit-log`); Don't Hand-Roll (idempotency/status classification reuse); Assumptions Log A1 (retention window) |
| PRN-06 | Delivery uses finite retries only for classified transient failures and reconciles ambiguous Windows-spooler handoffs before resubmission. Stable idempotency keys prevent accidental duplicate jobs. | Architecture Patterns Pattern 2 (idempotency-key dedup, Stripe-aligned) and Pattern 3 (never blind-resubmit ambiguous handoff); Don't Hand-Roll (retry/backoff as data-driven worker tick) |
| PRN-07 | UI and audit states distinguish durable acceptance, submission to Windows, OS-reported completion, failure, cancellation, and unknown status; Windows status is never presented as proof of physical paper output. | Architecture Pattern 3; Don't Hand-Roll (JOB_INFO_2 status bitfield); Validation Architecture PRN-07 row (unknown-status confirm E2E) |
</phase_requirements>

## Summary

Spike 001 (`.planning/spikes/001-windows-print-broker/`) already proved the hard architectural bet — a Rust Windows Service + SQLite ledger + WinSpool delivery — against real Windows Service infrastructure and a real USB thermal printer. This phase is **not** "design a print broker"; it is "turn a VALIDATED spike into production code plus close the two gaps the spike explicitly left open": LAN/VPN cross-machine binding, and the exact payload-retention number. This research is scoped to exactly those production-hardening deltas: service installation mechanism and account identity, the Tauri installer integration point, the frontend/Rust split for the migrated `pos-printer.ts` contract, the audit-data-source mismatch between the new broker ledger and the existing Supabase-backed `/audit` page, and the concrete Windows-networking pitfall (firewall) that the spike's loopback-only testing could not surface.

**Primary recommendation:** Keep the spike's shape (Rust binary, SQLite WAL ledger, WinSpool via the `windows` crate, append-only `jobs`/`events` tables) and change exactly four things for production: (1) register via the `windows-service` crate's own SCM handler instead of `nssm`, running under a dedicated least-privilege local service account, not `LocalSystem`; (2) keep the broker's HTTP client entirely on the Rust side of the Tauri app (`reqwest`, already a dependency) so `pos-printer.ts`'s `invoke()` calls stay unchanged (D-09) and the per-store bearer secret never reaches the webview/devtools; (3) add a Windows Firewall inbound rule (scoped to `LocalSubnet` or the store's VPN subnet) at install time — the spike only ever exercised loopback and would silently fail the cross-machine case in production without this; (4) give the broker's ledger DB and audit HTTP endpoint their own query hook on the frontend (`entities/print-job`, not `entities/audit-log`) since the Print Jobs audit tab reads from the broker's local SQLite ledger, not Supabase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Durable job acceptance (commit-before-ack, idempotency) | Store-Local Broker (new Windows Service, Rust) | — | Must outlive the Tauri process (PRN-03); this is the phase's core new tier, distinct from both "Frontend Server" and "API/Backend" in the standard FSD stack |
| Delivery to named Windows printer queue (WinSpool) | Store-Local Broker | — | Same process as above; reuses `printer.rs`'s `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter` pattern (spike already extended it) |
| Ambiguous-handoff reconciliation / queue-health polling | Store-Local Broker | — | Runs in the broker's background worker tick, independent of any client being open |
| Print submission trigger (checkout, reprint, caja summary, test-print, cash-drawer) | Browser/Client (React widgets/features) | Tauri Rust command layer | UI-level; unchanged surface per D-09 |
| Broker HTTP client + bearer-secret custody | Tauri Rust command layer (`src-tauri`) | — | Keeps the per-store secret (D-04) out of the webview/devtools; `pos-printer.ts` keeps calling `invoke()`, only the Rust command's internals change from WinSpool-direct to broker-HTTP |
| Print-job audit query/display | Browser/Client (new `entities/print-job` query hook) | Store-Local Broker (data source) | **Not** the existing Supabase-backed `entities/audit-log` — the ledger lives in the broker's SQLite file, reached via the broker's `/audit`+`/jobs` HTTP endpoints (through a Tauri command, same reasoning as above), not a `supabase.from(...)` call |
| RBAC gating of the Print Jobs tab | API/Backend (existing `rbac.ts`, client-enforced) | — | Reuses `view_audit_log` (D-16) — no new tier, no new DB-side check needed since the data source isn't Supabase/RLS in the first place |
| Payload retention purge (7-30 day window) | Store-Local Broker (worker tick) | — | Runs alongside the existing 500ms delivery/reconciliation tick; purges `payload` BLOB bytes only, never the `jobs`/`events` metadata rows (D-14) |

## Standard Stack

### Core (broker, new Rust crate — separate from `src-tauri`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `windows-service` | 0.8.1 [VERIFIED: crates.io + package-legitimacy check] | Registers/manages the broker as a real SCM-controlled Windows Service (`define_windows_service!` + `service_control_handler::register`) | Purpose-built for exactly this — the spike used `nssm` only because hand-rolling the SCM handler was out of scope for a spike (README "Investigation Trail"); D-01 requires the real crate for production |
| `rusqlite` | 0.40.2 current [VERIFIED: crates.io + package-legitimacy check] (spike pinned 0.31 [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/Cargo.toml:12`]) | SQLite ledger (`jobs`, `events` tables), WAL mode | Already proven in the spike; bump to latest for the production crate |
| `windows` | 0.61, features `Win32_Foundation`, `Win32_Graphics_Printing`, `Win32_Graphics_Gdi` [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/Cargo.toml:18-20`] | `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter`/`GetJobW` | Exact same version already used by `src-tauri/Cargo.toml:36` [VERIFIED: `src-tauri/Cargo.toml:35-39`, `windows = { version = "0.61", features = ["Win32_Foundation", "Win32_Graphics_Printing"] }`] — pin the broker to the same major version to avoid two divergent copies of Win32 binding knowledge in the repo |
| `tiny_http` | 0.12.0 [VERIFIED: crates.io + package-legitimacy check] | The spike's minimal blocking HTTP server | Sufficient if the production broker stays a fixed 4-route API (`/jobs`, `/jobs/{id}`, `/audit`, `/health`) with hand-rolled Bearer-auth and JSON (de)serialization, as the spike already does |
| `axum` | 0.8.9 [VERIFIED: crates.io + package-legitimacy check] | Alternative to `tiny_http` if the route surface grows (retention-purge admin route, per-failure-class config reload endpoint, structured tower middleware for auth) | Worth it once auth/timeout/tracing middleware composition matters more than staying dependency-light; adds `tokio` |
| `serde` / `serde_json` | 1.x [ASSUMED — already pinned in spike Cargo.toml, not independently re-verified this session] | Request/response (de)serialization, broker config file | Already used by the spike |
| `base64` | 0.22 in spike [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/Cargo.toml:15`], 0.23 in `src-tauri` [VERIFIED: `src-tauri/Cargo.toml:33`] | Decoding `payload_b64` | Align the broker's version with `src-tauri`'s 0.23 rather than carrying two pins across the repo, unless the broker crate is intentionally fully independent |
| `uuid` (`v4` feature) | 1.x [VERIFIED: crates.io + package-legitimacy check] | Job IDs, idempotency-key generation on the client side | Matches Stripe's own recommendation (v4 UUID or high-entropy random string) [CITED: stripe.com/blog/idempotency] |

### Supporting (Tauri app side — no new npm dependency)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `reqwest` | 0.12, feature `json` [VERIFIED: `src-tauri/Cargo.toml:29`, `reqwest = { version = "0.12", features = ["json"] }`] | Rust-side HTTP client from the Tauri command layer to the broker | Already a dependency — reuse it rather than adding an HTTP client to the frontend bundle; keeps the bearer secret server(Rust)-side |
| native `fetch` + `AbortSignal.timeout()` | Web standard, no package [CITED: developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static] | Only relevant to the existing non-Tauri browser fallback path in `pos-printer.ts` (`printReceiptWebFallback`) — that path does not call the broker at all | Not needed for the broker submission path itself given the Rust-side-client recommendation above; keep for completeness/parity if a future non-Tauri LAN client is ever built directly against the broker |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `windows-service` crate SCM registration | Keep `nssm` in production | Rejected by D-01 explicitly — nssm adds a third-party runtime wrapper dependency and the spike's own README frames it as a spike-only shortcut |
| Broker as a standalone top-level crate (mirrors spike's `broker/` layout) | Second `[[bin]]` inside `src-tauri`'s existing crate | A second bin sharing `src-tauri`'s crate would pull the whole Tauri/WebView dependency graph into a service binary that never needs a WebView — standalone crate is leaner and matches the spike's proven layout; can still share the `win_print` OpenPrinterW/WritePrinter helper via a small shared lib crate if duplication becomes a real maintenance cost |
| Rust-side (`reqwest`) HTTP client to the broker | Frontend `fetch()` directly to `http://<broker-host>:<port>` | CSP is currently `null` [VERIFIED: `src-tauri/tauri.conf.json:24-26`, `"security": { "csp": null }`] so a direct frontend fetch would technically work, but it would require shipping the per-store bearer secret into the webview-accessible JS bundle/devtools — worse security posture for no benefit, since D-09 already requires zero signature change to `pos-printer.ts`'s public functions |
| `tiny_http` (spike's choice) | `axum` | Only worth the `tokio` dependency once the broker's route surface or middleware needs (retry-class config reload, structured auth middleware, more concurrent LAN clients) outgrow a 4-route hand-rolled server |

**Installation (broker crate, new `Cargo.toml`):**
```bash
cargo add windows-service rusqlite --features rusqlite/bundled
cargo add serde serde_json uuid --features uuid/v4
cargo add base64@0.23
cargo add windows@0.61 --features Win32_Foundation,Win32_Graphics_Printing,Win32_Graphics_Gdi
# choose one:
cargo add tiny_http@0.12      # OR
cargo add axum@0.8            # + tokio if the route surface grows
```

**Version verification:** all six crates above were checked against the live crates.io registry this session via the package-legitimacy seam (see Package Legitimacy Audit) — `windows-service` 0.8.1 (published 2018, 139k/week downloads, github.com/mullvad/windows-service-rs), `rusqlite` 0.40.2 (2.39M/week), `tiny_http` 0.12.0 (1.06M/week), `axum` 0.8.9 (8.45M/week), `uuid` 1.x (13.28M/week). None are new or low-signal.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| windows-service | crates | 8 yrs (since 2018-06-04) | 139,285/wk | github.com/mullvad/windows-service-rs | OK | Approved |
| rusqlite | crates | 12 yrs (since 2014-11-21) | 2,388,112/wk | github.com/rusqlite/rusqlite | OK | Approved |
| tiny_http | crates | 11 yrs (since 2015-05-07) | 1,058,868/wk | github.com/tiny-http/tiny-http | OK | Approved |
| axum | crates | 5 yrs (since 2021-07-22) | 8,454,264/wk | github.com/tokio-rs/axum | OK | Approved |
| uuid | crates | 12 yrs (since 2014-11-11) | 13,281,335/wk | github.com/uuid-rs/uuid | OK | Approved |
| base64 | crates | 11 yrs (since 2015-12-04) | 22,602,728/wk | github.com/marshallpierce/rust-base64 | OK | Approved |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

All six crates returned `OK` from `gsd-tools query package-legitimacy check --ecosystem crates` this session, with registry-reported age/downloads/repo signals as shown — no unverified/`[ASSUMED]` package names in this phase's Rust dependency set. No new npm packages are needed on the frontend (see Standard Stack — Supporting).

## Architecture Patterns

### System Architecture Diagram

```
 ┌───────────────────────────────┐        ┌───────────────────────────────┐
 │  Tauri POS (this app)         │        │  Future LAN/VPN client        │
 │  React widgets/features       │        │  (mobile/desktop, PRN-01)     │
 │  (checkout, ReprintButton,    │        │  — no such client exists in   │
 │  PaymentForm/Pane, caja,      │        │  this repo today; broker API  │
 │  HardwareSettingsTab)         │        │  must be usable by one anyway │
 └───────────────┬───────────────┘        └───────────────┬───────────────┘
                 │ invoke('print_receipt'/'print_raw_text'/    │ HTTP POST /jobs
                 │  'test_print'/'open_cash_drawer')            │ Authorization: Bearer <secret>
                 ▼                                              │
 ┌───────────────────────────────┐                              │
 │ Tauri Rust command layer      │                              │
 │ (src-tauri) — holds the       │                              │
 │ per-store bearer secret;      │                              │
 │ builds the broker HTTP        │                              │
 │ request via reqwest with a    │                              │
 │ short connect-timeout (D-12)  │                              │
 └───────────────┬───────────────┘                              │
                 │ HTTP POST /jobs (idempotency_key, printer_name, payload_b64, origin)
                 ▼                                              ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  Store-Local Broker (Windows Service, Session 0)             │
        │  ┌─────────────┐   durable commit BEFORE ack   ┌──────────┐  │
        │  │ HTTP handler│ ───────────────────────────► │ SQLite    │  │
        │  │ (auth, idem-│                                │ ledger    │  │
        │  │ potency     │ ◄─────────────────────────── │ (WAL,     │  │
        │  │ check,      │   job_id + status returned     │ synchronous│  │
        │  │ validation) │                                │ =FULL)    │  │
        │  └─────────────┘                                └────┬─────┘  │
        │                                                       │        │
        │  ┌─────────────────────────────────────────────────────────┐  │
        │  │ Background worker tick (~500ms):                        │  │
        │  │  1. deliver 'accepted' jobs → WinSpool (OpenPrinterW/    │  │
        │  │     StartDocPrinterW/WritePrinter, named printer only)  │  │
        │  │  2. immediate post-submit poll (0/10/20/40/80ms) for    │  │
        │  │     fast-completing jobs                                │  │
        │  │  3. periodic reconciliation of 'submitted_to_os' jobs   │  │
        │  │     via GetJobW — never blind-resubmit; ambiguous       │  │
        │  │     handoff → 'unknown' (needs manual confirm, D-06)    │  │
        │  │  4. per-failure-class retry/backoff (D-10, config file) │  │
        │  │  5. payload-retention purge pass (D-14 window)          │  │
        │  └─────────────────────────────────────────────────────────┘  │
        └───────────────────────────────┬───────────────────────────────┘
                                         │ WinSpool (named queue only)
                                         ▼
                              ┌───────────────────────┐
                              │ Windows Print Spooler  │
                              │ → named printer queue  │
                              │ → physical thermal      │
                              │   printer (USB)         │
                              └───────────────────────┘

 Audit read path (D-13): AuditPage → new "Print Jobs" tab → new
 `entities/print-job` query hook → invoke() → Tauri command → broker
 GET /audit + GET /jobs/{id} (NOT the existing `entities/audit-log`
 Supabase-backed hook — different data source entirely).
```

### Recommended Project Structure

```
broker/                          # NEW top-level crate (mirrors the spike's own layout)
├── Cargo.toml
├── src/
│   ├── main.rs                  # SCM entry point (windows-service define_windows_service!)
│   ├── http.rs                  # /jobs, /jobs/{id}, /audit, /health handlers + bearer auth
│   ├── ledger.rs                # SQLite schema, WAL pragmas, jobs/events CRUD
│   ├── delivery.rs              # WinSpool submit + reconciliation worker tick
│   ├── retry.rs                 # per-failure-class retry/backoff config (D-10)
│   └── config.rs                # broker-config.json load (retention window, retry policy, port)
└── install/                     # sc.exe / windows_service::service_manager registration helpers

src-tauri/src/commands/
└── printer.rs                   # internals swap to reqwest POST to broker (D-09); OpenPrinterW
                                  # direct-print path removed for migrated callers, kept only as
                                  # the broker's own delivery mechanism (moved into broker/)

src/entities/print-job/          # NEW entity — broker-backed, not Supabase-backed
├── model/types.ts               # Zod schema for job/event shape returned by the broker
├── model/queries.ts             # TanStack Query hook calling invoke('get_print_audit'/'get_print_job')
└── ui/                          # status badge, "Did this print?" confirm UI (D-05/D-06/D-07)

src/shared/lib/pos-printer.ts    # public API UNCHANGED (D-09) — internals still call invoke()
src/features/reprint-receipt/ui/ReprintButton.tsx   # extended with inline unknown-status badge (D-05)
src/pages/audit/index.tsx        # extended with a Tabs wrapper (pattern already used in
                                  # src/pages/reports/index.tsx) — "Audit Log" + "Print Jobs" tabs
```

### Pattern 1: Durable-accept-before-response

**What:** The HTTP handler inserts the job row into SQLite (and its first `events` row) and only returns the HTTP response after that INSERT succeeds. A crash between insert and response still leaves a durable, resumable job.
**When to use:** Every `/jobs` POST.
**Example (spike, already validated on real hardware):**
```rust
// Source: .planning/spikes/001-windows-print-broker/broker/src/main.rs:167-179
let result = conn.execute(
    "INSERT INTO jobs (id, idempotency_key, printer_name, origin, payload, status, attempts, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'accepted', 0, ?6, ?6)",
    params![job_id, req.idempotency_key, req.printer_name, req.origin, payload, ts],
);
match result {
    Ok(_) => { /* record_event + return 200 job_id */ }
    Err(e) => return err_json(500, "persistence_failed", &format!("{e}"), None),
}
```

### Pattern 2: Idempotency-key dedup before insert

**What:** Look up `idempotency_key` before creating a new row; a repeat submission returns the *original* job's ID/status and creates zero new rows.
**When to use:** Every `/jobs` POST, before the INSERT in Pattern 1.
**Example:**
```rust
// Source: .planning/spikes/001-windows-print-broker/broker/src/main.rs:151-162
let existing: Option<(String, String)> = conn
    .query_row("SELECT id, status FROM jobs WHERE idempotency_key = ?1", params![req.idempotency_key],
        |r| Ok((r.get(0)?, r.get(1)?))).optional().unwrap_or(None);
if let Some((id, status)) = existing {
    record_event(conn, &id, "duplicate_submit", "idempotency_key already accepted; no new job created");
    return ok_json(&SubmitResp { job_id: id, status });
}
```
Matches Stripe's own idempotency-key pattern: persist the first response and replay it verbatim for any retry with the same key [CITED: stripe.com/blog/idempotency].

### Pattern 3: Never blind-resubmit an ambiguous handoff

**What:** When `GetJobW` no longer knows about a submitted job's `win32_job_id`, mark it `unknown` — never silently retry (duplicate-print risk) and never silently mark it `os_reported_printed` (unproven).
**When to use:** Reconciliation pass and the immediate post-submit poll.
**Example:**
```rust
// Source: .planning/spikes/001-windows-print-broker/broker/src/main.rs:495-499
Ok(None) => {
    conn.execute("UPDATE jobs SET status='unknown', ... WHERE id=?2", params![ts, id]).ok();
    record_event(conn, &id, "ambiguous_handoff",
        "GetJob returned no data for this win32_job_id; marked unknown, will not auto-resubmit");
}
```
This is directly required by PRN-07 ("Windows status is never presented as proof of physical paper output") and was proven on both a controlled local port and the real XP-58/USB printer (spike README "Second real surprise").

### Pattern 4: Windows Service SCM registration (production replacement for D-01)

**What:** Use `windows-service`'s `define_windows_service!` macro plus `service_control_handler::register` to obtain a `ServiceStatusHandle`, transition `StartPending → Running`, and handle `Stop`/`Interrogate` control codes.
**When to use:** The broker's actual service entry point (`main.rs`, replacing the spike's bare `fn main()` foreground loop).
**Example (crate-documented shape — read `docs.rs/windows-service` directly during implementation for the exact current API):**
```rust
// Source: docs.rs/windows-service (mullvad/windows-service-rs) — general shape,
// not independently re-verified against the exact current-version API this session [ASSUMED]
windows_service::define_windows_service!(ffi_service_main, service_main);

fn service_main(_args: Vec<std::ffi::OsString>) {
    let status_handle = service_control_handler::register("PrintBrokerService", |control| {
        match control {
            ServiceControl::Stop => { /* signal shutdown */ ServiceControlHandlerResult::NoError }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    }).unwrap();
    // report Running, then run_http_server()+run_worker() exactly as the spike does
}
```
**Install/uninstall** should be a CLI subcommand on the same `broker.exe` (`broker.exe install` / `broker.exe uninstall`), invoked once, elevated, from the Tauri installer's NSIS `POSTINSTALL` hook (Pattern 5) — this keeps the "how do I register" logic co-located with the binary being registered rather than living only in installer script text.

### Pattern 5: Tauri NSIS post-install hook to register the service

**What:** `bundle.windows.nsis.installerHooks` points to a `.nsh` file; its `NSIS_HOOK_POSTINSTALL` macro runs after files/registry/shortcuts are written — the right place to run the elevated `broker.exe install` + start.
**When to use:** D-03's "bundled inside the same Tauri MSI/NSIS installer... post-install action (elevated) that registers the service once."
**Example:**
```json
// Source: tauri v2 docs (bundle.windows.nsis.installerHooks) [CITED: v2.tauri.app + tauri-apps/tauri GitHub issues]
{
  "bundle": {
    "windows": {
      "nsis": {
        "installerHooks": "./windows/hooks.nsh"
      }
    }
  }
}
```
```nsis
; windows/hooks.nsh — Tauri v2 does NOT support !include for local .nsh files;
; inline the full macro body here, do not split into a second included file.
!macro NSIS_HOOK_POSTINSTALL
  ExecWait '"$INSTDIR\broker\broker.exe" install'
  ExecWait 'sc.exe failure PrintBrokerService reset= 86400 actions= restart/5000/restart/5000/restart/5000'
  ExecWait 'netsh advfirewall firewall add rule name="Store Print Broker" dir=in action=allow program="$INSTDIR\broker\broker.exe" protocol=TCP localport=8973 profile=private'
  ExecWait 'sc.exe start PrintBrokerService'
!macroend
```

### Anti-Patterns to Avoid

- **Exposing the bearer secret to the frontend/webview:** even though CSP is currently `null` [VERIFIED: `src-tauri/tauri.conf.json:24-26`], routing the broker HTTP call through the frontend's `fetch()` puts the per-store secret into a devtools-inspectable bundle. Keep the HTTP client in the Rust command layer.
- **Reusing `entities/audit-log`'s Supabase query hook for Print Jobs:** the broker's ledger is a separate SQLite file on the local machine, not a Supabase table — a new query path (through a Tauri command, not `supabase.from(...)`) is required even though the *UI* table/diff-viewer components are reusable.
- **Trusting `localhost`/dual-stack DNS resolution for the connect-timeout:** connecting to a hostname that resolves both an IPv6 (`::1`) and IPv4 (`127.0.0.1`) address can add resolution/fallback delay before a connection is even attempted — bind and connect via an explicit IPv4 (or the store's static LAN IP) literal, not `localhost`, in addition to setting an explicit `reqwest` `connect_timeout` (D-12).
- **Registering the Windows Service without a `sc failure` recovery policy:** a crashed `broker.exe` with no auto-restart action leaves every already-`accepted` job stuck (durable but stalled) until a human notices and restarts it manually — configure automatic restart actions at install time (Pattern 5).
- **Assuming `externalBin`/sidecar handles service binary updates:** Tauri's NSIS installer has a documented bug where an `externalBin` sidecar is not always replaced on reinstall/upgrade (tauri-apps/tauri#15134) [CITED: github.com/tauri-apps/tauri/issues/15134] — the install hook must explicitly stop the running service, overwrite the binary via the installer's normal file-copy (not rely on sidecar semantics), and restart it on every upgrade, not just fresh installs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Windows Service SCM lifecycle (start/stop/interrogate, status reporting) | A hand-written `advapi32`/`StartServiceCtrlDispatcherW` FFI wrapper | `windows-service` crate | Purpose-built, `139k`/week downloads, maintained by Mullvad (also a security-sensitive Windows Service shipper) [VERIFIED: crates.io + package-legitimacy check] |
| Idempotency-key store/dedup logic | A custom in-memory or Redis-backed dedup cache | The SQLite `jobs.idempotency_key UNIQUE` column + lookup-before-insert (already in the spike) | The durable ledger the phase already needs is itself the correct idempotency store — no second system needed |
| Retry/backoff scheduling per failure class | A hand-rolled scheduler thread with sleep loops per job | A single worker tick (500ms, spike-proven) reading `status`/`attempts`/`last_checked_at` columns, branching on a `retry_policy` loaded from `broker-config.json` (D-10) | One polling loop with data-driven policy is simpler and more auditable than N per-job timers, and it's exactly what already survives restart (state lives in SQLite, not in-memory timers) |
| Printer job status classification (printed/error/deleted/printing/unknown) | Custom heuristics on top of raw WinSpool return codes | The documented `JOB_INFO_2.Status` bitfield (`JOB_STATUS_PRINTED`/`_ERROR`/`_DELETED`/`_PRINTING`, etc.) [CITED: learn.microsoft.com/en-us/windows/win32/printdocs/job-info-2] | Microsoft's own bit values already encode exactly the states PRN-07 needs to distinguish — the spike's constants (`JOB_STATUS_PRINTED = 0x80`, etc.) are the correct source |
| ESC/POS raw byte submission to a named printer | A new printer-IPC layer for the broker | The existing `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter` pattern already proven in both `src-tauri/src/commands/printer.rs` [VERIFIED: `src-tauri/src/commands/printer.rs:181-217`] and the spike's `win_print` module [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/src/main.rs:284-325`] | Both call sites already agree on the exact Win32 sequence; the broker's `delivery.rs` should port this code, not reimplement it |

**Key insight:** Every piece of this phase that looks like it needs new infrastructure (idempotency store, retry scheduler, status classifier) is already fully expressible as data + polling logic on top of the one SQLite ledger the phase requires anyway — resist the urge to add a message queue, Redis, or a second database for any of these.

## Common Pitfalls

### Pitfall 1: LAN/VPN cross-machine binding was never tested — Windows Firewall will silently block it
**What goes wrong:** The broker code already binds `0.0.0.0` [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/src/main.rs:232`, `Server::http(("0.0.0.0", PORT))`], so it *looks* LAN-ready, but the spike's README explicitly states "this was only ever driven over `127.0.0.1`" and flags a real cross-machine LAN test as still open before production sign-off. Windows Firewall blocks unsolicited inbound connections by default on Private/Public profiles — a second machine on the LAN/VPN will experience exactly the same symptom as an unreachable broker (silent hang, then timeout) even though the broker process is running correctly.
**Why it happens:** Loopback traffic never crosses the Windows Filtering Platform's inbound-connection firewall check the way real network-interface traffic does.
**How to avoid:** Add an explicit inbound firewall rule scoped to `LocalSubnet` (or the store's VPN's own subnet/interface, if the store uses one — this needs to be confirmed, see Open Questions) at install time [CITED: learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule], and add a real second-machine (or second-VM) LAN test to this phase's fault-test matrix before calling PRN-01 done.
**Warning signs:** The broker works from the POS machine itself but a phone/second desktop on the same network gets a hung/timed-out request.

### Pitfall 2: A non-`LocalSystem` service account may not see the printer the same way
**What goes wrong:** The spike ran as `LocalSystem` (nssm's default) and flags this as overprivileged; but a locally-attached (non-shared/non-network) printer is a machine-wide spooler object, while printers connected via a *network* share are typically mapped per-user-profile — a dedicated service account with no interactive profile can genuinely fail to see a printer that a logged-in user sees, depending on how it was installed [CITED: general Windows service-account/printer-visibility guidance, learn.microsoft.com forum thread + Session-0 isolation background].
**Why it happens:** Session-0 isolation plus per-user printer-connection mapping for network-class printers; local (USB) printers installed machine-wide are the safe case, but this must be confirmed for the store's actual printer setup, not assumed.
**How to avoid:** Use a dedicated local least-privilege standard user account (not a domain account — there is no AD in a single store), grant it "Log on as a service," and explicitly grant it "Print" permission on the specific named printer object (printer Security tab / `SetPrinter`) rather than assuming default ACLs are sufficient. Re-verify the exact account choice against the real store printer during implementation (this is Claude's Discretion per CONTEXT.md, but the verification step itself is not optional).
**Warning signs:** `OpenPrinterW` succeeds under a manual/interactive test but fails (`ERROR_ACCESS_DENIED` or "printer not found") once running under the real service account.

### Pitfall 3: A stuck head-of-queue job blocks every later job to that printer
**What goes wrong:** Spike finding #2 — the broker's own per-job retry only retries its own `StartDocPrinter` call; it does not detect or clear a stale job sitting at the head of the *Windows* printer queue from a prior failure.
**Why it happens:** WinSpool serializes delivery per printer queue; a job the spooler itself considers stuck (not one the broker submitted and is retrying) is invisible to the broker's own retry counters.
**How to avoid:** Per D-15, this phase is alert-only for v1.5 — the broker must actively poll for a stale head-of-queue condition and surface it in the audit/UI, but must not auto-purge the OS-level job. Do not skip the detection half of this even though the remediation half is manual.
**Warning signs:** Jobs pile up in `accepted`/retrying status with `last_error` referencing the same printer even though the printer is otherwise online.

### Pitfall 4: "Fails immediately" is a client responsibility, not something the network guarantees
**What goes wrong:** Spike finding #3 — an unreachable broker on this host did not produce an instant TCP refusal; it silently hung ~2s+. If every caller relies on the OS/network layer to fail fast, PRN-02's "fails immediately" guarantee breaks under exactly the condition (broker down) it exists to protect against.
**Why it happens:** Likely IPv6/IPv4 dual-stack resolution delay (`localhost` resolving to both `::1` and `127.0.0.1`) compounding with normal TCP retransmission timing — the spike did not root-cause this precisely, so treat the mechanism as unconfirmed but the symptom as reproduced fact.
**How to avoid:** Every caller path (the Rust `reqwest` client in the Tauri command layer, and any future non-Tauri LAN client) must set an explicit short connect-timeout (~1-2s per D-12) and must connect via an explicit IP literal rather than a hostname that could resolve to multiple addresses.
**Warning signs:** A UI action that should show a toast within ~1s instead appears to hang before failing.

### Pitfall 5: The Print Jobs audit tab has a different data source than every other Audit tab
**What goes wrong:** `AuditLogTable` (the existing D-13 extension point) is wired to `useAuditLogs` from `entities/audit-log`, which is Supabase-backed [VERIFIED: `src/widgets/AuditLogTable/AuditLogTable.tsx:17`, `import { useAuditLogs } from '@entities/audit-log';`]. The broker's ledger lives in a local SQLite file on the store's own machine, reachable only via the broker's own HTTP API — trying to reuse the same query hook for both tabs will not compile/will silently return nothing.
**Why it happens:** D-13 says to reuse the *table/diff-viewer UI patterns*, which is correct — but "extends the existing `/audit` page" does not mean "extends the existing data-fetching hook."
**How to avoid:** Build a new `entities/print-job` query hook (through a new Tauri command that calls the broker's `/audit` and `/jobs/{id}` endpoints) and compose it with the *same UI components* (`DataTable`, a Sheet-based detail view mirroring `AuditLogDetailSheet`), not the same data hook.
**Warning signs:** Planning a task as "add a filter to `useAuditLogs`" instead of "add a new query hook."

### Pitfall 6: Tauri's NSIS sidecar/resource handling doesn't guarantee the service binary gets replaced on upgrade
**What goes wrong:** A documented Tauri issue reports that an `externalBin` sidecar is not always replaced when the app is reinstalled/upgraded via the NSIS installer [CITED: github.com/tauri-apps/tauri/issues/15134] — an app update could silently leave a stale broker.exe (and stale service registration) running.
**Why it happens:** The NSIS installer's file-diffing/overwrite behavior for `externalBin`-declared binaries has known gaps, separate from how it handles the main app executable.
**How to avoid:** The `POSTINSTALL` hook (Pattern 5) should be idempotent and always explicit: stop the existing service if present, ensure the new binary is in place (verify via the installer's normal resource/file bundling rather than relying purely on sidecar semantics), then (re)install and start. Treat "is this an upgrade or a fresh install" as a case the hook script must handle, not assume away.
**Warning signs:** After a version bump, the broker's reported version (expose this via `/health`) does not match the new app version.

## Code Examples

### Broker HTTP client kept on the Rust/Tauri side (D-09, D-12)
```rust
// Illustrative shape for src-tauri/src/commands/printer.rs's new internals.
// reqwest is already a dependency [VERIFIED: src-tauri/Cargo.toml:29].
use std::time::Duration;

async fn submit_to_broker(job: SubmitReq, secret: &str, broker_url: &str) -> Result<SubmitResp, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(1500)) // D-12: fail fast, don't trust OS defaults
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("{broker_url}/jobs")) // broker_url should be an explicit IP literal, not "localhost"
        .bearer_auth(secret)
        .json(&job)
        .send()
        .await
        .map_err(|e| format!("broker unreachable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("broker rejected job: HTTP {}", resp.status()));
    }
    resp.json::<SubmitResp>().await.map_err(|e| e.to_string())
}
```

### Frontend Result mapping stays unchanged (D-09, D-11) — every caller already must handle the Result
```typescript
// src/shared/lib/pos-printer.ts — signature and Result<void> contract UNCHANGED;
// only the invoke('print_receipt', ...) internals (Rust side) now hit the broker.
// Source: src/shared/lib/pos-printer.ts:64-107 (existing pattern, retry loop stays
// client-facing the same way; broker-side retry/backoff is now ALSO happening
// independently inside the broker after acceptance).
export async function printReceipt(
  data: ReceiptData,
  settings: ReceiptSettings
): Promise<Result<void>> {
  // ...existing invoke('print_receipt', ...) call; on failure, map new broker-specific
  // error cases (unreachable / rejected / persistence_failed / unknown) onto new
  // AppErrorCode values (see Assumptions Log — exact new codes are a planning decision).
}
```

### SQLite ledger pragmas (already proven; carry forward unchanged)
```rust
// Source: .planning/spikes/001-windows-print-broker/broker/src/main.rs:61-64
let conn = Connection::open(db_path()).expect("open sqlite db");
conn.pragma_update(None, "journal_mode", "WAL").ok();
conn.pragma_update(None, "synchronous", "FULL").ok();
```
`synchronous=FULL` in WAL mode fsyncs the WAL after each commit — a COMMIT does not return until the write is durable, and an OS crash/power loss cannot corrupt the database (though `synchronous=NORMAL` could lose the most recent commits on power loss without corrupting the file) [CITED: sqlite.org/pragma.html#pragma_synchronous + community sources on SQLite WAL durability]. `FULL` is the correct choice for this ledger; do not weaken it to `NORMAL` for a "faster" broker.

## State of the Art

| Old Approach (spike) | Production Approach | When Changed | Impact |
|--------------------|---------------------|---------------|--------|
| `nssm install <name> <path>` | `windows-service` crate's own SCM registration (`broker.exe install`) | This phase (D-01) | Removes a third-party install-time dependency; the binary manages its own lifecycle |
| Hardcoded shared secret `spike-shared-secret-001` [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/src/main.rs:24`] | Per-store secret generated at install time, written to both Tauri app config and broker config (D-04) | This phase | Each store deployment gets a unique secret; no shared/well-known token in shipped code |
| `MAX_ATTEMPTS: i64 = 5` hardcoded constant [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/src/main.rs:25`] | Per-failure-class retry/backoff read from a `broker-config.json` (D-10) | This phase | Transient vs. terminal failures get different retry policies instead of one global count |
| `LocalSystem` (nssm default) | Dedicated least-privilege local service account | This phase (spike finding #4) | Reduces blast radius of a compromised broker process |
| Loopback-only (`127.0.0.1`) testing | Real cross-machine LAN/VPN test + firewall rule | This phase (explicitly deferred by the spike) | Closes the one architectural claim (PRN-01's "LAN/VPN client") the spike could not exercise |

**Deprecated/outdated:**
- Direct-to-default-printer submission from `src-tauri/src/commands/printer.rs`'s `try_send_raw`/`default_printer_name` path [VERIFIED: `src-tauri/src/commands/printer.rs:166-217`] is superseded for the 6 migrated callers by the broker's named-printer delivery — but note `printer.rs`'s file-level doc comment still says "bar-pos" [VERIFIED: `src-tauri/src/commands/printer.rs:1-6`, package `bar-pos` in `src-tauri/Cargo.toml:2-3`], a pre-existing leftover from the pre-pivot codebase, unrelated to this phase's scope — do not conflate cleaning that up with this phase's actual work.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Payload retention window pinned to **14 days** (midpoint of the discussed 7-30 day range) | Open Questions / D-14 | If the store owner's actual dispute/reconciliation cadence is longer, receipt payload bytes needed for a real dispute could already be purged; this is a one-way (irreversible) choice per CONTEXT.md D-14 — must be confirmed with the store owner before implementation, not treated as settled |
| A2 | New `AppErrorCode` values (e.g. a broker-unreachable code, a job-rejected code, a job-unknown/ambiguous code) are needed and don't yet exist in the union | Code Examples / `src/shared/lib/result.ts` | Verified true that today's union has no print-broker-specific codes [VERIFIED: `src/shared/lib/result.ts:165-205`] — but the exact new code names/count are this research's proposal, not yet a locked decision; wrong naming choices are cheap to fix (TS union) but should be settled once during planning, not per-task |
| A3 | The exact `windows-service` crate install/uninstall API shape shown in Pattern 4's code example matches the crate's current version | Architecture Patterns / Pattern 4 | Low risk (compile-time-checkable), but the executor must read `docs.rs/windows-service`'s current `service_manager`/`ServiceManager::create_service` API directly rather than copy the illustrative example verbatim |
| A4 | The store's LAN "VPN" component (if any) is not yet identified — no VPN infrastructure exists in this repo's own config today | Open Questions | If the store uses a VPN overlay (e.g., a WireGuard/Tailscale-style virtual adapter), a `LocalSubnet`-scoped firewall rule and a physical-LAN-only broker bind address would miss that traffic entirely — this must be confirmed, not assumed absent |
| A5 | A locally-attached (USB) thermal printer is a machine-wide spooler object visible to any account with Print permission, not session/profile-scoped like a mapped network printer | Common Pitfalls / Pitfall 2 | If the store's actual printer setup differs (e.g., installed via a network share rather than direct USB), the dedicated-service-account recommendation may need adjustment; must be re-verified against the real store hardware during implementation, as the spike's own README flags this as "partially observed," not conclusively proven |

**If this table is empty:** N/A — see rows above; all are flagged for confirmation during planning/execution, not blocking research from proceeding.

## Open Questions

1. **What VPN mechanism, if any, does the target store network actually use?**
   - What we know: The requirement says "LAN/VPN clients"; the spike bound `0.0.0.0` but only tested loopback.
   - What's unclear: Whether "VPN" here means a router-level site-to-site VPN (same physical LAN subnet, no extra firewall work needed) or a client-side overlay VPN with its own virtual adapter/subnet (needs its own firewall rule/interface binding).
   - Recommendation: Confirm with the store owner/operator before finalizing the firewall rule scope in the planning phase; do not assume `LocalSubnet` covers every case.

2. **Exact new `AppErrorCode` values for the broker submission contract.**
   - What we know: The current union has no print-broker-specific codes [VERIFIED: `src/shared/lib/result.ts:165-205`]; the broker's own error taxonomy (`unauthorized`, `invalid_payload`, `persistence_failed`, `not_found`, plus terminal job states `failed`/`unknown`) is already defined in the spike.
   - What's unclear: Whether to add 3-5 new specific codes or fold some into existing generic codes (e.g., reuse `VALIDATION_ERROR` for `invalid_payload`).
   - Recommendation: Decide once during planning (a locked list), then apply consistently across all 6 migrated callers — this is exactly the kind of decision D-11's "no silent discard" testing will catch if left inconsistent.

3. **Where does the `broker/` crate live relative to the existing `src-tauri` workspace, and how is it built/bundled into CI?**
   - What we know: No workspace `Cargo.toml` exists today — `src-tauri/Cargo.toml` is the only Rust crate in the repo [VERIFIED: `find . -maxdepth 2 -iname "Cargo.toml"` returned only `./src-tauri/Cargo.toml`]. The E2E suite's CI (`tauri-build` job per CLAUDE.md) currently only builds `src-tauri`.
   - What's unclear: Whether the broker becomes a Cargo workspace member (shared `target/`, single `cargo build`) or a fully separate build step wired into the release pipeline as a second artifact.
   - Recommendation: Treat this as a planning-time build-pipeline decision, not an implementation detail to improvise per-task — it affects `bundle.resources` paths in `tauri.conf.json` and the release script.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Windows 10/11 host with WinSpool | Broker delivery + Windows Service hosting | ✓ (production target; per CLAUDE.md, dev also runs on Ubuntu via webkit2gtk) | — | On Ubuntu dev machines, the broker crate is Windows-only (matches `printer.rs`'s existing `#[cfg(target_os = "windows")]` gating) — build/test the broker only in CI/Windows or a Windows VM; non-Windows dev falls back to the existing `write_fallback_bytes` temp-file behavior already present in `printer.rs` |
| Rust toolchain (`cargo`) | Building `broker/` and `src-tauri` | ✓ (already required for the existing `src-tauri` crate) | matches `src-tauri`'s toolchain | — |
| A real ESC/POS thermal printer + spooler queue | End-to-end fault testing (offline printer, stopped spooler, retry exhaustion) | Available during the spike per its README ("real Windows 11 host... real hardware... XP-58 58mm ESC/POS thermal printer over USB") | — | If unavailable during this phase's implementation, a Generic/Text-Only local FILE: port printer (also used by the spike for the fast-completion race test) is a valid substitute for logic testing, but the real hardware fault cases (offline/misconfigured printer) should be re-run once real hardware is available before sign-off |
| A second machine/VM on the same LAN/VPN | Closing the cross-machine binding gap (Pitfall 1) | Not yet exercised — this is the explicit open item from CONTEXT.md's Deferred section | If a genuinely separate machine isn't available, a second VM on a bridged (not NAT-only) virtual network adapter is the minimum viable substitute — loopback alone does not exercise the firewall path at all |

**Missing dependencies with no fallback:**
- A second real LAN/VPN-connected machine for the cross-machine binding test — no substitute proves the firewall-rule behavior; a bridged VM is the closest available fallback, not a full substitute (see above).

**Missing dependencies with fallback:**
- Non-Windows dev/build environment (Ubuntu) for the broker crate — build/CI only, matches existing `#[cfg(target_os = "windows")]` project convention.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend unit) + Playwright (E2E) [VERIFIED: `package.json` — `"@playwright/test": "^1.59.1"`, `"@vitest/coverage-v8"` etc.]; Rust `#[cfg(test)] mod tests` (already used in `printer.rs`) [VERIFIED: `src-tauri/src/commands/printer.rs:287-356`] for the new `broker/` crate |
| Config file | `playwright.config.ts` (frontend E2E); no broker-specific test config exists yet — new |
| Quick run command | `npx vitest run src/shared/lib/pos-printer.test.ts` (frontend); `cargo test` from `broker/` (new) |
| Full suite command | `npm run test` + `npm run test:e2e` + `cargo test` (new, in both `src-tauri` and `broker/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRN-01 | Authenticated LAN/VPN client submits to broker; broker not internet-exposed | integration (Rust, broker binds a real socket) + manual-machine E2E for cross-machine case | `cargo test --package print-broker -- auth` (new) | ❌ Wave 0 |
| PRN-02 | Success returned only after durable commit; unreachable/rejected fails immediately with structured error | unit (broker persistence) + Playwright (mocks broker via `page.route()`, same pattern as `e2e/ai/`'s Anthropic mocking) | `npx playwright test e2e/receipts/broker-submission.spec.ts` (new) | ❌ Wave 0 |
| PRN-03 | Accepted job survives client/app/broker restart, reaches named printer | integration (broker: kill process mid-flight, restart, assert delivery) — mirrors the spike's own proven manual test | `cargo test --package print-broker -- restart_recovery` (new) | ❌ Wave 0 |
| PRN-04 | Every caller explicitly handles the Result; UI shows toast on terminal failure | unit/component (Vitest, one test per of the 6 callers) + existing pattern in `PaymentForm.test.tsx`/`ReceiptPreview.test.tsx`/`CajaDashboard.test.tsx` [VERIFIED: files found via grep for `printReceipt`/`testPrint` usage] | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` (extend existing) | ✅ (existing files to extend) |
| PRN-05 | Auditable command/event history, queryable by time/origin/printer/job ID, retention controls | unit (broker: query builder) + Playwright (Print Jobs tab renders/filters) | `cargo test --package print-broker -- audit_query` (new) + `npx playwright test e2e/audit/print-jobs.spec.ts` (new) | ❌ Wave 0 |
| PRN-06 | Finite retries for transient failures only; idempotency keys prevent duplicate jobs; ambiguous handoffs reconciled | unit (broker: retry-class branching, duplicate-idempotency-key test — spike already proved this manually, needs an automated assertion) | `cargo test --package print-broker -- idempotency` (new) | ❌ Wave 0 |
| PRN-07 | UI/audit distinguish durable-accepted/submitted/os-reported/failed/cancelled/unknown; unknown never treated as proof of print | unit (broker status mapping) + Playwright (unknown-status badge + "Did this print?" confirm flow, D-05/D-06/D-07) | `npx playwright test e2e/receipts/unknown-status-confirm.spec.ts` (new) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the relevant quick command above (Vitest single file, or `cargo test` scoped to the touched module)
- **Per wave merge:** full `cargo test` (both crates) + `npm run test` + targeted `npx playwright test e2e/receipts/ e2e/audit/`
- **Phase gate:** full `npm run test:e2e` green before `/gsd-verify-work`, plus a manual (but automated-where-possible, per this repo's CLAUDE.md no-`human_needed` policy) cross-machine LAN test documented as a Playwright test driving a second browser context/machine if feasible, or as an explicit fault-test script if a true second machine isn't reachable from CI

### Wave 0 Gaps
- [ ] `broker/` crate itself does not exist yet — needs to be created from the spike's `broker/src/main.rs` as a starting point, split into the module structure under Recommended Project Structure
- [ ] `broker/` has no test harness yet — needs a `cargo test` setup that can spin up the broker on an ephemeral port and drive it with a real HTTP client (or an in-process handler call, bypassing sockets, for pure-logic tests)
- [ ] `e2e/receipts/broker-submission.spec.ts`, `e2e/receipts/unknown-status-confirm.spec.ts`, `e2e/audit/print-jobs.spec.ts` — none exist yet; should mock the broker's HTTP responses the same way `e2e/ai/` already mocks the Anthropic call via `page.route()`
- [ ] `src/entities/print-job/` — does not exist yet; needed before any Playwright test can assert against real component behavior

## Security Domain

### Applicable ASVS Categories (Level 1, per `.planning/config.json` `security_asvs_level: 1`)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Per-store static Bearer secret (D-04) checked on every broker request before any DB touch — matches the spike's already-proven `Authorization: Bearer <token>` gate [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/src/main.rs:238-249`] |
| V3 Session Management | no | No session concept — a single static secret per store, generated at install time, not a login/session flow |
| V4 Access Control | yes | Print Jobs audit tab reuses the existing `view_audit_log` RBAC action (D-16) [VERIFIED: `src/shared/lib/rbac.ts:29,52`, `'view_audit_log'` present in `STAFF_ACTIONS` and granted via `MANAGER_EXTRA`] — no new broker-side access control tiers, since the broker itself only has one identity (the store's Tauri app / any future LAN client holding the shared secret) |
| V5 Input Validation | yes | `payload_b64` decode, `idempotency_key`/`printer_name` non-empty checks, malformed-JSON rejection — all already proven in the spike (400 responses, no DB touch on failure) [VERIFIED: `.planning/spikes/001-windows-print-broker/broker/src/main.rs:140-148`] |
| V6 Cryptography | yes | The per-store bearer secret must be generated with a cryptographically secure RNG at install time (not the spike's hardcoded literal) — never hand-roll random-string generation; use a standard secure-random source in whichever language generates it (Rust `rand`/OS RNG, or the NSIS installer's own capability) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Bearer secret leaking into the webview/devtools if the HTTP call were made from the frontend | Information Disclosure | Keep the broker HTTP client entirely in the Rust command layer (Architecture Patterns, Anti-Patterns) |
| A malicious/compromised LAN device replaying a captured `Authorization: Bearer` header to submit spoofed print jobs | Spoofing / Tampering | Out of scope to fully solve in v1.5 per CONTEXT.md's locked D-04 (shared-secret-per-store, no mTLS/cert infra) — but the firewall scoping (Pitfall 1) is a meaningful compensating control limiting who can even reach the broker's port |
| A stuck/misbehaving job at the head of a printer queue enabling a trivial local denial-of-service against all printing | Denial of Service | D-15's alert-only queue-health monitoring is the accepted v1.5 mitigation — full auto-remediation is explicitly deferred |
| Payload bytes (receipt contents, potentially containing customer/payment-adjacent text) retained indefinitely | Information Disclosure (over-retention) | D-14's bounded retention window (pin to 14 days per Assumption A1, pending confirmation) purges payload bytes while keeping metadata indefinitely |

## Sources

### Primary (HIGH confidence)
- `.planning/spikes/001-windows-print-broker/README.md` — full VALIDATED verdict and investigation trail, read in full this session
- `.planning/spikes/001-windows-print-broker/broker/src/main.rs` — complete reference implementation, read in full this session
- `.planning/spikes/001-windows-print-broker/broker/Cargo.toml` — spike's exact dependency pins, read this session
- `src-tauri/src/commands/printer.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — existing codebase, read this session
- `src/shared/lib/pos-printer.ts`, `src/shared/lib/result.ts`, `src/shared/lib/rbac.ts`, `src/features/reprint-receipt/ui/ReprintButton.tsx`, `src/widgets/AuditLogTable/AuditLogTable.tsx`, `src/pages/audit/index.tsx`, `src/pages/reports/index.tsx` — existing codebase, read this session
- crates.io registry via `gsd-tools query package-legitimacy check --ecosystem crates` (windows-service, rusqlite, tiny_http, axum, uuid, base64) — queried this session

### Secondary (MEDIUM confidence)
- [SQLite PRAGMA synchronous](https://www.sqlite.org/pragma.html#pragma_synchronous) and community sources on WAL+FULL durability — cross-checked, WebSearch this session
- [JOB_INFO_2 structure (Winspool.h)](https://learn.microsoft.com/en-us/windows/win32/printdocs/job-info-2) — WebSearch this session
- [Stripe idempotency-key design](https://stripe.com/blog/idempotency) — WebSearch this session
- [Tauri v2 NSIS installerHooks](https://v2.tauri.app/reference/config/) and [tauri-apps/tauri#15134 externalBin reinstall bug](https://github.com/tauri-apps/tauri/issues/15134) — WebSearch this session
- [`New-NetFirewallRule` `-RemoteAddress LocalSubnet`](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule) — WebSearch this session
- [`AbortSignal.timeout()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) — WebSearch this session
- [`windows-service` crate / mullvad/windows-service-rs](https://docs.rs/windows-service) — WebSearch this session (general API shape; exact current-version API not independently re-verified — see Assumption A3)

### Tertiary (LOW confidence)
- Session-0/per-user printer-visibility interaction for non-`LocalSystem` service accounts (Pitfall 2) — WebSearch surfaced only general guidance, not a definitive Microsoft statement for this exact scenario; flagged `[ASSUMED]`-adjacent and called out explicitly for re-verification against the real store printer during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every new Rust crate confirmed live on crates.io this session via the package-legitimacy seam; versions match or intentionally upgrade from the already-VALIDATED spike
- Architecture: HIGH for the spike-proven core (durable-accept, idempotency, reconciliation, WinSpool delivery — all run against real hardware); MEDIUM for the production deltas (service install method, LAN firewall, Rust-side HTTP client split) which are this research's own reasoned recommendations, not yet spike-tested
- Pitfalls: HIGH for the four spike-carried-forward findings (real, reproduced); MEDIUM for the two newly-surfaced ones (Firewall/Pitfall 1, sidecar-reinstall/Pitfall 6) which are grounded in official docs/GitHub issues but not yet reproduced against this specific codebase

**Research date:** 2026-08-26
**Valid until:** 30 days for the architecture/stack guidance (stable domain); the two open LAN/VPN and retention-window items should be resolved during this phase's planning, not left to drift past plan creation
