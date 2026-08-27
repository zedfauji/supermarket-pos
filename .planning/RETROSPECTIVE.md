# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Pre-Launch Hardening

**Shipped:** 2026-08-18
**Phases:** 6 | **Plans:** 25 | **Tasks:** 51

### What Was Built
- Anthropic API calls moved server-side (`agent-proxy` edge function, Bearer-JWT auth), `@anthropic-ai/sdk` fully removed from the client bundle
- `receipt_settings` given migration-tracked `CREATE TABLE` + RLS, then a DB-enforced singleton constraint after a gap-closure fix
- Orphaned void-order feature deleted end-to-end (code, edge function, RBAC, i18n, E2E spec)
- `receive_shipment`'s cost/expiry silent-overwrite bug fixed (weighted-average-cost + earliest-expiry-wins)
- Staff-creation UI wired with a real caller-role check (closed a critical elevation-of-privilege gap along the way — a manager could mint admin accounts)
- Reopen-and-edit-a-completed-sale flow built on existing RPCs, offline-checkout fail-fast, refund/checkout error-message translation
- Storybook backfilled from scratch (never configured despite 15 pre-existing story files), Suppliers page loading/error states, cross-linked entity IDs across Audit Log/Edit History/Reports/Payments/Staff, DB backup/DR documentation

### What Worked
- Automated-only verification (Playwright/Vitest, zero manual UAT) held for all 6 phases, including a security-hardening phase where "just have a human click it" would have been the easy default
- Code review + phase-goal verification as separate gates caught a real, distinct bug each time: code review found the elevation-of-privilege gap in Phase 8, phase-goal verification (via a live-DB check, not summary-trusting) found the `receipt_settings` singleton gap in Phase 6
- Fixing a small, well-scoped gap directly (one migration + one rewritten test) was faster and lower-overhead than the formal gap-closure planning cycle (`/gsd-plan-phase --gaps` → `/gsd-execute-phase --gaps-only`) for a single-finding case

### What Was Inefficient
- `gsd-tools`' `phase.complete` didn't update `REQUIREMENTS.md`'s checkboxes/traceability for 3 of 6 phases (5, 6, 7) — required a manual fix pass before milestone archival, or the archived historical record would have shown "Not started" for shipped work
- Phase 6 sat with `implementation_complete: true` but no `VERIFICATION.md` for a period before this session — the execute-phase workflow's resume logic (condition 3 in `discover_and_group_plans`) handled it correctly, but it's a state a session can be interrupted into without anyone noticing until the next `/gsd-progress`

### Patterns Established
- Independent live-system re-verification (querying the actual DB, actually running the test, actually grepping the build output) rather than trusting a fix's own commit message or SUMMARY.md — used for both the initial Phase 6 verification and the gap-closure re-verification, and caught a real discrepancy (a grep-count claim in the first VERIFICATION.md was imprecise, corrected in the second)
- Service-role integration tests as the way to prove RLS role-scoped access when the RBAC-gated UI route makes a Playwright browser test structurally unable to reach the write path as a lower-privileged role

### Key Lessons
1. A DB singleton "invariant" that's only enforced client-side (a hardcoded sentinel UUID the app always upserts) isn't actually enforced — the same integration test written to prove RLS access can double as the test that catches the missing DB-level constraint, as it did here.
2. When a phase's SUMMARY.md files all exist but no VERIFICATION.md does, that's a distinct, detectable state (not "phase incomplete," not "phase done") — worth checking explicitly rather than assuming plan-count parity means done.
3. For a single, well-scoped code-review/verification finding, fixing it directly and re-verifying is faster than the full formal gap-closure cycle; the formal cycle earns its overhead back on multi-finding or ambiguous-scope gaps.

### Cost Observations
- Sessions: 1 (this session closed out Phase 6 verification + gap fix + milestone completion in one continuous run)
- Notable: 3 background subagent dispatches (code review, initial verification, re-verification) ran concurrently with inline regression-gate work (full unit suite, typecheck, lint, targeted e2e/integration tests) rather than serially blocking on each other

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | — | 4 | Initial pivot from bar-pos; established FSD layering and generic-retail-infra reuse |
| v1.1 | 1+ | 6 | First milestone under the repo's "automated-only verification, no manual UAT" CLAUDE.md policy end-to-end |

### Top Lessons (Verified Across Milestones)

1. Client-side-only enforcement of an invariant the DB itself doesn't check (RLS role checks, singleton conventions) is a recurring gap category worth a standing checklist item in future security-adjacent phases.
