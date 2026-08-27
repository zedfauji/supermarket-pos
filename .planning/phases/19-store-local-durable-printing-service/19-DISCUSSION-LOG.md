# Phase 19: Store-Local Durable Printing Service - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-26
**Phase:** 19-store-local-durable-printing-service
**Areas discussed:** Service identity & install method, Ambiguous-handoff (unknown) operator UX, Migrating existing callers to one contract, Audit surface/retention/queue-health

---

## Service identity & install method

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated least-privilege service account | Local service account granted only printer + ProgramData access, per spike finding #4 | |
| LocalSystem (like the spike) | Simplest, overprivileged | |
| You decide | Claude picks during planning/execution | ✓ |

**User's choice:** You decide.
**Notes:** Deferred to Claude's Discretion in CONTEXT.md; spike's own recommendation (least-privilege) is the default researchers/planners should favor.

| Option | Description | Selected |
|--------|-------------|----------|
| nssm-wrapped install script | Same mechanism the spike proved works | |
| Native windows-service Rust crate (SCM handler) | No nssm dependency, broker.exe self-registers | ✓ |
| You decide | Claude picks | |

**User's choice:** Native windows-service Rust crate.

| Option | Description | Selected |
|--------|-------------|----------|
| Bundled with Tauri installer, admin-elevated one-time install step | Ships inside same MSI/NSIS installer | ✓ |
| Separate standalone installer, run once by IT/setup | Decoupled from POS app updates | |
| You decide | | |

**User's choice:** Bundled with Tauri installer.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-store generated secret, stored in Tauri app config + broker config at install time | No cloud secret service | ✓ |
| Reuse existing Supabase session/JWT for broker auth | Conflicts with no-cloud-dependency constraint | |
| You decide | | |

**User's choice:** Per-store generated secret at install time.

---

## Ambiguous-handoff (unknown) operator UX

| Option | Description | Selected |
|--------|-------------|----------|
| Existing ReprintButton area — inline badge + confirm action | Reuses existing reprint entry point | ✓ |
| New dedicated print-jobs status panel | Separate page | |
| You decide | | |

**User's choice:** Existing ReprintButton area.

| Option | Description | Selected |
|--------|-------------|----------|
| Manual "Did this print?" Yes/No confirm, No triggers explicit reprint | Never auto-resubmit | ✓ |
| Auto-mark resolved after N minutes with no further status change | Risks silent false-resolution | |
| You decide | | |

**User's choice:** Manual Yes/No confirm.

| Option | Description | Selected |
|--------|-------------|----------|
| All job types get it — one shared status component | Receipts, caja summary, test-print, cash-drawer | ✓ |
| Receipts only for v1.5, others log-only for now | Narrower scope | |
| You decide | | |

**User's choice:** All job types get it.

| Option | Description | Selected |
|--------|-------------|----------|
| Non-blocking — badge/notification, cashier can continue selling | Matches spike's routine-fast-completion-race finding | ✓ |
| Blocking — must confirm before next action | Higher friction | |
| You decide | | |

**User's choice:** Non-blocking.

---

## Migrating existing callers to one contract

| Option | Description | Selected |
|--------|-------------|----------|
| Replace pos-printer.ts internals, keep its public API | Zero caller-side signature changes | ✓ |
| New shared/lib/print-broker.ts, callers migrate one by one | More visible diff | |
| You decide | | |

**User's choice:** Replace pos-printer.ts internals.

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable per failure class (transient vs terminal), stored in broker config | Matches spike's explicit recommendation | ✓ |
| Fixed sensible constants for v1.5, configurability deferred | Simpler | |
| You decide | | |

**User's choice:** Configurable per failure class.

| Option | Description | Selected |
|--------|-------------|----------|
| Hard requirement: every caller must explicitly handle Result, enforced by tests | Matches PRN-04 exactly | ✓ |
| Best-effort during migration, tests added only where feasible | Lower rigor | |

**User's choice:** Hard requirement.

| Option | Description | Selected |
|--------|-------------|----------|
| Short client-side connect-timeout (e.g. 1-2s) + immediate toast | Matches spike finding #3 | ✓ |
| Use Tauri/reqwest default timeout, accept slower failure | Risks multi-second hang | |
| You decide | | |

**User's choice:** Short client-side connect-timeout.

---

## Audit surface, retention & queue-health

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing /audit page with a Print Jobs tab | Reuses AuditPage patterns/RBAC | ✓ |
| New dedicated page (e.g. /print-jobs) | Separate page | |
| You decide | | |

**User's choice:** Extend existing /audit page.

| Option | Description | Selected |
|--------|-------------|----------|
| Short payload retention (e.g. 7-30 days), metadata/audit trail kept indefinitely | Reduces PII exposure, keeps PRN-05 history | ✓ |
| Keep everything indefinitely, no purge for v1.5 | Simpler, defers retention policy | |
| You decide | | |

**User's choice:** Short payload retention, metadata kept indefinitely.

| Option | Description | Selected |
|--------|-------------|----------|
| Alert-only: flag stuck job in audit/UI, operator clears manually via Windows Print Management | Safer default, no force-delete | ✓ |
| Auto-purge stale head-of-queue jobs after a threshold | More automated, riskier | |
| You decide | | |

**User's choice:** Alert-only.

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing view_audit_log action (manager/admin) | Simplest RBAC | ✓ |
| New dedicated RBAC action for print-job audit specifically | Finer-grained | |
| You decide | | |

**User's choice:** Reuse view_audit_log.

---

## Claude's Discretion

- Windows Service account identity (dedicated least-privilege local service account is the
  spike's own recommendation and should be the default; user explicitly deferred the exact
  mechanism to Claude's judgment during planning).

## Deferred Ideas

None captured as out-of-scope deferrals. Two items flagged as required follow-up work within this
phase rather than deferred to a future phase:
- LAN/VPN cross-machine network binding (spike only validated loopback) must be closed during this
  phase's planning/execution, not pushed to a later phase.
- Exact payload retention window (7-30 days range) should be pinned to a specific number during
  planning/research.
