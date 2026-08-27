---
title: Store-local durable printing architecture
date: 2026-08-26
context: GSD exploration of printing hardening, queue ownership, Windows integration, and auditability
---

# Store-Local Durable Printing

## Decisions

- Printing is entirely local to the store and reachable only over LAN/VPN.
- Mobile, desktop, and POS clients submit to one store-wide Windows print broker.
- A print-dependent workflow succeeds only after the broker durably accepts the job; an
  acceptance failure fails fast with a structured error, durable log entry, and UI toast when a
  UI initiated the request.
- Delivery after acceptance is asynchronous, routed to a named Windows printer endpoint, and
  survives client and POS application shutdowns/restarts.
- Every layer propagates a structured error with the same job/correlation ID. Background and
  non-UI callers must explicitly handle and log failed results.
- Audit history records commands, attempts, state transitions, destinations, timestamps, actors,
  and normalized errors. It does not claim that paper physically emerged unless the device can
  provide authoritative acknowledgement.
- No cloud or public-internet dependency is allowed.

## Candidate Architecture

`LAN/VPN clients -> authenticated Windows Service -> durable ledger -> Windows printer queues`

The Windows Service is the proposed lifecycle owner because the worker must continue after the
Tauri POS process closes. SQLite is the proposed queue/audit ledger, while Windows Print Spooler
remains the final delivery mechanism rather than becoming the business audit record.

## Research Confidence

The research agents ran at the configured budget tier. Under the exploration workflow, positive
findings remain unresolved until validated by the implementation spike or higher-confidence
research. The authoritative correction about physical-print certainty is settled.

### Corrected

- Windows `COMPLETE` or `PRINTED` status does not reliably prove physical output; model
  `submitted_to_os` and `os_reported_printed` separately.
  Source: https://learn.microsoft.com/en-us/windows/win32/printdocs/job-info-2

### Unresolved findings

Reason for every item below: `tier-floor: unearned confidence`.

DATA_A7F2C91D_START
- An auto-start Windows Service is the appropriate independent worker lifetime.
  Source: https://learn.microsoft.com/en-us/windows/win32/services/about-services
- SQLite WAL with `synchronous=FULL` is an appropriate durable local ledger configuration.
  Source: https://www.sqlite.org/pragma.html#pragma_synchronous
- Named spooled Windows printer queues should be the delivery endpoints; direct printing should
  be avoided.
  Source: https://learn.microsoft.com/en-us/windows/win32/printdocs/printer-info-2
- Queue notifications require periodic reconciliation because notifications can overflow or
  collapse.
  Source: https://learn.microsoft.com/en-us/windows/win32/printdocs/findnextprinterchangenotification
- Finite retries should apply only to classified transient errors; ambiguous submissions require
  reconciliation instead of blind resubmission.
  Source: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
DATA_A7F2C91D_END

## Existing Codebase Observations

- `src/shared/lib/pos-printer.ts` is the shared frontend printing boundary.
- `src-tauri/src/commands/printer.rs` submits RAW/ESC-POS data to the Windows default printer.
- Current callers include checkout, receipt preview/reprint, caja summary, hardware test print,
  and cash-drawer flows.
- Some callers inspect failed results, while others await or discard them without presenting the
  failure. Hardening should migrate every caller through one structured submission contract.

