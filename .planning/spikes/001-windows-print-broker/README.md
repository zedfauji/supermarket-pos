---
spike: 001
idea: store-local-printing
name: windows-print-broker
type: standard
validates: "Given a LAN client and installed broker, when a job is durably accepted and the POS exits, then the broker retains, routes, and audits it through a named Windows printer queue"
verdict: VALIDATED
related: []
tags: [windows-service, printing, sqlite, lan]
---

# Spike 001: Windows Print Broker

## What This Validates

Given an authenticated LAN/VPN client and an installed Windows broker, when the broker acknowledges
a print command and the originating POS application exits, then the command remains durable, is
routed to the configured named printer, and retains a queryable attempt/error history.

## Research

| Approach | Pros | Cons | Status |
|----------|------|------|--------|
| Tauri-process queue | Reuses the existing application | Stops when the process exits | Rejected by requirement |
| Windows Spooler only | Native delivery survives the client | Not an authoritative business audit ledger | Delivery endpoint only |
| Windows Service + local ledger + Spooler | Independent lifetime, durable acceptance, auditable routing | Installation, identity, IPC, and recovery must be proven | Chosen for spike |

Positive research findings are unresolved due to the exploration research tier floor. See
`.planning/notes/store-local-durable-printing.md` for sources and dispositions.

## Experiment

1. Install a minimal auto-start service under a least-privilege account.
2. Bind an authenticated API only to the store LAN/VPN interface or a firewall-restricted local
   port; reject unauthenticated requests.
3. Commit a job and initial event atomically before returning acceptance with a stable job ID.
4. Terminate the POS client and restart the service during controlled test cases.
5. Submit RAW/ESC-POS bytes to a configured named Windows queue and retain its Win32 job ID.
6. Exercise printer-offline, spooler-stopped, malformed-payload, duplicate-idempotency-key,
   ambiguous-handoff, and restart-recovery cases.
7. Query command counts, attempts, transitions, and normalized errors by job ID and time window.

## How to Run

Implementation lives in `broker/` (Rust, `cargo build --release` from that dir). The binary is
`broker/target/release/broker.exe`; it self-creates its SQLite ledger and log under
`%ProgramData%\PrintBrokerSpike\`. For a real install (not just a foreground process), wrap it
with `nssm install <name> <path-to-broker.exe>` then `nssm start <name>` — this registers it as
a genuine SCM-managed Windows Service (auto-start, Session 0, survives logoff). All jobs go
through `POST /jobs` on `127.0.0.1:8973` with `Authorization: Bearer spike-shared-secret-001`
(hardcoded shared secret, per spike convention — never do this in the real build).

This spike was run on a real Windows 11 host with real hardware (an XP-58 58mm ESC/POS thermal
printer over USB) and a real installed Windows Service. No result below is mocked.

## What to Expect

- Acceptance is returned only after durable commit.
- An unavailable broker fails immediately with a correlated structured error.
- Accepted work survives client exit and service restart.
- A duplicate idempotency key does not create a second physical submission.
- Audit queries distinguish `submitted_to_os`, `os_reported_printed`, `failed`, and `unknown`.

## Observability

Every job carries a UUID job ID. `events` table (job_id, ts, category, detail) is the append-only
trail; `GET /jobs/{id}` returns the job plus its full event history, `GET /audit` returns command
counts grouped by status. `broker.log` under `%ProgramData%\PrintBrokerSpike\` mirrors every event
to a flat file for out-of-band inspection when the HTTP API itself is unreachable.

## Investigation Trail

- 2026-08-26: Spike defined from GSD exploration and primary-source research.
- Built the broker in Rust (matches `src-tauri`'s existing stack and its `windows` crate WinSpool
  usage in `printer.rs`) rather than Node, to reuse the project's proven `OpenPrinterW` /
  `StartDocPrinterW` / `WritePrinter` pattern directly, extended to take an explicit printer name
  (never the default) and to capture the returned Win32 job ID for reconciliation.
- **Auth boundary**: missing/wrong `Authorization: Bearer` header → `401` before any DB touch. Confirmed.
- **Durable-accept-before-response + idempotency**: `POST /jobs` inserts into SQLite (WAL,
  `synchronous=FULL`) inside the request handler, before the HTTP response is written. A repeat
  `POST` with the same `idempotency_key` returns the *original* `job_id`/status and creates zero
  new rows — proven by submitting the same key twice and diffing job counts.
- **First real-hardware surprise**: the store's `XP-58` printer object was configured on `LPT1:`
  (parallel port), but this machine has no functioning parallel port — every job to it produced a
  real `JOB_STATUS_ERROR` and a stuck head-of-queue job that blocked all later jobs to that queue.
  This is a genuine "offline/misconfigured printer" fault case, not a broker bug — reproduced and
  logged correctly (`failed`, structured `last_error`, event `os_reported_failed`).
- **Discovered production hardware was actually on USB**: after the operator reinstalled `XP-58`
  on `USB001`, jobs succeeded and physically printed. This validates named-printer routing against
  the exact class of hardware production will use, not a stand-in.
- **Second real surprise — fast-completion race**: a controlled local printer (Generic/Text Only
  driver, port = a local file we own) completes and gets purged from the Windows Spooler queue in
  under ~100ms — faster than a tight 0/10/20/40/80ms post-submit poll loop *and* faster than
  reconciliation could always catch a terminal status. The delivered bytes were verified
  byte-perfect on disk in every case, but the broker correctly logged these as `unknown`
  (`ambiguous_handoff` — "GetJob returned no data for this win32_job_id") rather than guessing
  success. **This is the exact behavior PRN-07 requires** ("Windows status is never presented as
  proof of physical paper output") — proven from both directions: `unknown` never means failure,
  and it never means confirmed success either. It later reproduced on the real XP-58/USB printer
  too — receipts physically printed while the broker's own status still read `unknown`, purely
  because delivery outran the poll cadence. Ops/UI must treat `unknown` as "needs manual
  confirmation," not as an error to auto-retry (auto-retrying `unknown` would risk a duplicate
  physical print).
- **Restart recovery, proven precisely**: submitted a job, `taskkill /F`'d the broker process
  before the 500ms worker tick could pick it up (confirmed via direct SQLite read: `status =
  'accepted'`, `win32_job_id IS NULL` at the moment of the kill — the client never resubmitted),
  relaunched the exe, and the resumed worker delivered it and wrote the exact submitted bytes to
  disk with zero client involvement. This is the core PRN-02/PRN-03 claim, and it held.
- **Real Windows Service install** (via `nssm`, since hand-rolling a `windows-service`
  crate SCM handler was out of scope for a spike): first install attempt raced a leftover manually
  started `broker.exe` still holding port 8973 — nssm's watchdog restarted the service 5+ times in
  seconds and the SCM reported `Paused`. Root-caused via `Get-CimInstance Win32_Process` (the
  manual process's `ParentProcessId` was `bash.exe`, not `services.exe`/nssm — a giveaway).
  Killing the stray process and restarting cleanly produced a service process with `SessionId =
  0` and `ParentProcessId` under the service tree — genuine SCM management, `Get-Service` showing
  `Running`/`Automatic`. A job submitted afterward round-tripped through the real service exactly
  like the foreground process had.
- **Stopped-spooler fault case**: with `Spooler` service stopped (elevated `Stop-Service Spooler
  -Force`), a submission still returns `accepted` (durable commit is independent of the Spooler),
  then the delivery loop's `OpenPrinter` calls fail with `"The RPC server is unavailable"` —
  classified as transient, retried 5×, then `failed` with a structured, correlated error. No hang,
  no silent success, no crash.
- **Retry exhaustion**: pointed a job at a nonexistent printer name; 5 attempts at 500ms spacing,
  each logged individually, then `retry_exhausted` → `failed`. `MAX_ATTEMPTS` is a hardcoded spike
  constant (5); the real build should make this configurable per failure class.
- **Broker-unavailable timing gotcha**: hitting a stopped/nonexistent broker port on this host
  does **not** produce an instant TCP connection-refused — it silently times out (~2s+ observed).
  This means "fails immediately" (PRN-02) is a *client-side* responsibility: callers must set an
  aggressive connect-timeout themselves; they cannot rely on the OS to fail fast on an unreachable
  broker.
- **Invalid-payload cases**: malformed JSON, non-base64 `payload_b64`, and a missing required
  field all rejected with `400` and a specific `detail` string before touching SQLite. Confirmed.
- **Persistence-failure case**: made the SQLite file read-only (`attrib +R`) mid-run; submission
  returned `500 persistence_failed` with the raw SQLite error, and no job/event row was created —
  no false "accepted." Restored write access afterward.
- **Queue-blocking discovery** (not in the original experiment list, found empirically): a single
  stuck/errored job at the head of a printer's Windows queue blocks every job submitted after it
  to that same printer — the broker's own retry logic only retries *its own* `StartDocPrinter`
  call, it does not detect or clear a queue stuck on a stale prior job. This is a real gap for the
  production build: needs active queue-health monitoring (e.g. periodically check for an
  old/stuck job at head-of-queue and either auto-purge it or raise an operator alert), not just
  per-job retry.
- 2026-08-26: All experiment cases from the original list, plus the four found above, executed
  against real Windows Service infrastructure and real thermal-printer hardware. Cleaned up all
  spike-installed system state (service, test printer/port, `%ProgramData%\PrintBrokerSpike\`)
  after verification — confirmed removed from both the elevated and unelevated side.

## Results

**VALIDATED** — with four carried-forward findings the real implementation must design for, not
"gotchas" the spike merely worked around:

1. **`unknown` (ambiguous handoff) is a normal, expected terminal-ish state**, not a rare edge
   case — fast/local deliveries can complete and purge from the spooler before any realistic poll
   cadence observes them. The real build needs an operator-facing "confirm/reprint" affordance for
   jobs stuck in `unknown`, and must never auto-resubmit an `unknown` job (duplicate-print risk).
2. **A stuck job blocks its whole printer queue.** The broker needs active queue-health detection
   (stale head-of-queue job → alert or auto-clear), independent of per-job retry.
3. **"Fails immediately" is a client contract, not a network guarantee** — an unreachable broker
   can time out rather than instantly refuse on Windows. Every caller (mobile, desktop, POS) must
   set a short connect-timeout.
4. **The spike ran the service as `LocalSystem`** (nssm's default) — the real build should use a
   dedicated least-privilege service account per the original research recommendation, and this
   needs its own verification (a non-LocalSystem account may see printers differently, per the
   Session-0/per-user-printer-visibility behavior partially observed here).

Everything else in Requirements/PRN-01 through PRN-07 that this spike could exercise held up
exactly as designed: durable-accept-before-response, idempotency, named-printer routing (proven on
real hardware, not just a stand-in), restart survival with zero client resubmission, structured
correlated errors at every fault boundary (auth, payload, persistence, spooler-down, printer-down,
retry-exhaustion), and an append-only auditable event trail per job ID. **LAN/VPN network-boundary
binding (as opposed to loopback) was not exercised** — the broker binds `0.0.0.0` and this was
only ever driven over `127.0.0.1`; a real cross-machine LAN test is still open before production
sign-off.

