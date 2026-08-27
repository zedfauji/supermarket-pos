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

## Spikes

| # | Idea | Name | Type | Validates | Verdict | Tags |
|---|------|------|------|-----------|---------|------|
| 001 | store-local-printing | windows-print-broker | standard | Given a LAN client and installed broker, when a job is durably accepted and the POS exits, then the broker retains, routes, and audits it through a named Windows printer queue | PENDING | windows-service, printing, sqlite, lan |

