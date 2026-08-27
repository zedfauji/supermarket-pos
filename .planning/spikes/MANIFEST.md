# Spike Manifest

## Ideas

### store-local-printing

Validate the store-local Windows printing broker before committing the production implementation.

**Requirements:**

- Must accept authenticated jobs from mobile, desktop, and POS clients over LAN/VPN only.
- Must durably accept a job before the originating workflow succeeds.
- Must continue processing after the POS application exits or restarts.
- Must retain an auditable event history and propagate correlated structured errors.
- Must use named Windows printer queues and make no public-internet or cloud calls.
- Must treat "spooler accepted the job" as ambiguous, never as physical-output proof — jobs that
  purge from the spooler before their terminal status is observed land in a distinct `unknown`
  state, never auto-resubmitted, surfaced to an operator for manual confirm/reprint (Spike 001).
- Must actively monitor per-printer queue health (a stuck head-of-queue job blocks every job
  behind it) — plain per-job retry does not detect or clear this (Spike 001).
- Every client (mobile, desktop, POS) must set an aggressive connect-timeout when calling the
  broker — an unreachable broker can time out rather than instantly refuse (Spike 001).
- Service must run under a dedicated least-privilege account, not LocalSystem (Spike 001 used
  LocalSystem for expedience; this still needs its own verification pass).

## Spikes

| # | Idea | Name | Type | Validates | Verdict | Tags |
|---|------|------|------|-----------|---------|------|
| 001 | store-local-printing | windows-print-broker | standard | Given a LAN client and installed broker, when a job is durably accepted and the POS exits, then the broker retains, routes, and audits it through a named Windows printer queue | VALIDATED | windows-service, printing, sqlite, lan |

