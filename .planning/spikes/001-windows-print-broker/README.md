---
spike: 001
idea: store-local-printing
name: windows-print-broker
type: standard
validates: "Given a LAN client and installed broker, when a job is durably accepted and the POS exits, then the broker retains, routes, and audits it through a named Windows printer queue"
verdict: PENDING
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

Pending implementation. This spike requires a Windows host with service-install privileges and a
real or controlled test printer queue. Do not substitute a mocked-only result for the final verdict.

## What to Expect

- Acceptance is returned only after durable commit.
- An unavailable broker fails immediately with a correlated structured error.
- Accepted work survives client exit and service restart.
- A duplicate idempotency key does not create a second physical submission.
- Audit queries distinguish `submitted_to_os`, `os_reported_printed`, `failed`, and `unknown`.

## Observability

Capture timestamped events with job/correlation ID, endpoint, origin, state transition, attempt,
Win32 job ID, duration, and normalized error fields. Export a redacted JSON trace for each test.

## Investigation Trail

- 2026-08-26: Spike defined from GSD exploration and primary-source research.
- Hardware/service execution remains pending; no feasibility verdict has been claimed.

## Results

**PENDING** — requires execution on Windows with an installed service and printer queue.

