# Phase 19: Store-Local Durable Printing Service - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Every print command (receipt, reprint, caja summary, test-print, cash-drawer) from a LAN/VPN
client — mobile, desktop, or the Tauri POS itself — routes through one store-local, authenticated
Windows Service broker. The broker durably commits a job (stable job ID) before returning success,
survives client/app/broker restarts, delivers asynchronously to a named Windows printer queue, and
retains an auditable, queryable event history. This phase hardens the printing boundary and
migrates all existing print callers onto one submission contract — it does not add new print
content/layout features (that's Phase 15's Receipt Designer scope) and does not exercise
cross-machine LAN network binding (spike only validated loopback; see canonical refs).

Spike 001 (`.planning/spikes/001-windows-print-broker/`) already VALIDATED the core architecture
against real Windows Service infrastructure and real thermal-printer hardware. This phase turns
that spike into production code, not a first attempt at the concept.

</domain>

<decisions>
## Implementation Decisions

### Service identity & install
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

### Ambiguous-handoff ("unknown") operator UX
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

### Migrating existing callers to one contract
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

### Audit surface, retention & queue-health
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
  explicitly deferred the specific mechanism to Claude's judgment during planning).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike findings (authoritative — read first)
- `.planning/spikes/001-windows-print-broker/README.md` — VALIDATED verdict, full investigation
  trail, and the four carried-forward findings (ambiguous-handoff-is-normal, queue-blocking,
  fail-immediately-is-a-client-contract, LocalSystem-is-overprivileged) that this phase's
  decisions above are directly built on.
- `.planning/spikes/001-windows-print-broker/broker/` — Rust reference implementation from the
  spike (SQLite ledger, `windows` crate WinSpool usage, HTTP API shape) — production code should
  build from this, not from scratch.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §"Printing Broker" — PRN-01 through PRN-07, the locked requirement
  set this phase must satisfy.
- `.planning/ROADMAP.md` §"Phase 19: Store-Local Durable Printing Service" — goal, success
  criteria, dependency note.

### Prior research/architecture notes
- `.planning/notes/store-local-durable-printing.md` — GSD exploration decisions and candidate
  architecture that predates and motivated the spike.

### Existing codebase (printing boundary)
- `src/shared/lib/pos-printer.ts` — current shared frontend printing boundary; keeps its public
  API per D-09.
- `src-tauri/src/commands/printer.rs` — current direct-to-Windows-default-printer RAW/ESC-POS
  submission logic; the production broker's delivery loop supersedes this for the callers that
  migrate.
- `src/features/reprint-receipt/ui/ReprintButton.tsx` — extension point for the unknown-status
  confirm affordance (D-05).
- `src/pages/AuditPage` (routed at `/audit`) — extension point for the Print Jobs tab (D-13).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src-tauri/src/commands/printer.rs`'s proven `OpenPrinterW` / `StartDocPrinterW` / `WritePrinter`
  pattern — the spike's broker already extended this pattern to take an explicit named printer
  and capture the Win32 job ID; production delivery logic should reuse it directly rather than
  reimplementing.
- `AuditPage`'s existing table/diff-viewer component patterns — reusable for the new Print Jobs
  tab (D-13).

### Established Patterns
- Every async operation in this codebase returns `Result<T>` (`src/shared/lib/result.ts`) with a
  fixed `AppErrorCode` union — the broker submission contract must map its structured errors
  (auth, payload, persistence, spooler-down, printer-down, retry-exhaustion) onto this same
  pattern so callers handle it identically to every other mutation.
- RBAC actions are defined centrally in `src/shared/lib/rbac.ts` — D-16 reuses `view_audit_log`
  rather than adding a new action there.

### Integration Points
- `pos-printer.ts` is the single seam where all 6 existing callers already converge — D-09 makes
  this the integration point for the new broker contract, so no caller-side changes are needed
  beyond internal error-handling hardening (D-11).
- `ReprintButton.tsx` becomes a second integration point for surfacing job status (D-05), not just
  triggering a reprint.

</code_context>

<specifics>
## Specific Ideas

- The unknown-status resolution UX should read exactly as "Did this print?" Yes/No, mirroring how
  a cashier would naturally phrase checking the printer themselves — not a generic "confirm job"
  dialog.
- Retry/backoff configurability (D-10) should be organized by failure class (transient vs.
  terminal), matching the spike's own explicit recommendation for the real build, not a single
  global retry count.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Two items are explicitly flagged as follow-up
verification rather than new scope:
- LAN/VPN cross-machine network binding was validated as an open item by the spike itself (only
  loopback was tested) — this phase's planning/execution must close that gap before production
  sign-off, it is not deferred to a future phase.
- The exact payload retention window (7-30 days, D-14) should be pinned to a specific number during
  planning/research rather than left as a range.

</deferred>

---

*Phase: 19-store-local-durable-printing-service*
*Context gathered: 2026-08-26*
