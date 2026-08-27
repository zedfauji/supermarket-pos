---
phase: 19
slug: store-local-durable-printing-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-26
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (frontend unit) + Playwright (E2E) + Rust `#[cfg(test)]` (new `broker/` crate, pattern already used in `printer.rs`) |
| **Config file** | `playwright.config.ts` (frontend E2E); no broker-specific test config exists yet — Wave 0 creates it |
| **Quick run command** | `npx vitest run src/shared/lib/pos-printer.test.ts` (frontend) / `cargo test` from `broker/` (new crate) |
| **Full suite command** | `npm run test && npm run test:e2e` (frontend) + `cargo test` in both `src-tauri` and `broker/` |
| **Estimated runtime** | ~90s frontend unit, ~3-5min full E2E, ~20s cargo test |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the touched module (Vitest single file, or `cargo test` scoped package/module)
- **After every plan wave:** Run full `cargo test` (both crates) + `npm run test` + targeted `npx playwright test e2e/receipts/ e2e/audit/`
- **Before `/gsd-verify-work`:** Full suite must be green — `npm run test:e2e` plus the cross-machine LAN/VPN reachability check (automated as a fault-test script per this repo's no-`human_needed` policy)
- **Max feedback latency:** ~300 seconds (full E2E run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | TBD | 0 | PRN-01 | V2 Authentication | Broker rejects requests without valid per-store Bearer secret before any DB touch | integration (Rust) | `cargo test --package print-broker -- auth` | ❌ W0 | ⬜ pending |
| 19-01-02 | TBD | 0 | PRN-02 | — | Success returned only after durable commit; unreachable/rejected fails immediately with structured error | unit + Playwright (mocked broker via `page.route()`) | `npx playwright test e2e/receipts/broker-submission.spec.ts` | ❌ W0 | ⬜ pending |
| 19-01-03 | TBD | 0 | PRN-03 | — | Accepted job survives client/app/broker restart, reaches named printer | integration (kill mid-flight, restart, assert delivery) | `cargo test --package print-broker -- restart_recovery` | ❌ W0 | ⬜ pending |
| 19-01-04 | TBD | 0 | PRN-04 | V5 Input Validation | Every caller (6 total) explicitly handles the `Result`; UI shows toast on terminal failure | unit/component (Vitest, per-caller) | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` (extend existing) | ✅ existing | ⬜ pending |
| 19-01-05 | TBD | 0 | PRN-05 | V4 Access Control | Auditable command/event history queryable by time/origin/printer/job ID; retention controls applied | unit (query builder) + Playwright (Print Jobs tab) | `cargo test --package print-broker -- audit_query` + `npx playwright test e2e/audit/print-jobs.spec.ts` | ❌ W0 | ⬜ pending |
| 19-01-06 | TBD | 0 | PRN-06 | Denial of Service | Finite retries for transient failures only; idempotency keys prevent duplicate jobs; ambiguous handoffs reconciled | unit (retry-class branching, duplicate-key test) | `cargo test --package print-broker -- idempotency` | ❌ W0 | ⬜ pending |
| 19-01-07 | TBD | 0 | PRN-07 | — | UI/audit distinguish durable-accepted/submitted/os-reported/failed/cancelled/unknown; unknown never treated as proof of print | unit (status mapping) + Playwright (unknown-status confirm) | `npx playwright test e2e/receipts/unknown-status-confirm.spec.ts` | ❌ W0 | ⬜ pending |

*Task IDs are placeholders — the planner fills in actual plan/task IDs once PLAN.md files exist.*

---

## Wave 0 Requirements

- [ ] `broker/` crate — does not exist yet; create from the spike's `broker/src/main.rs`, split per the recommended module structure in RESEARCH.md
- [ ] `broker/` test harness — `cargo test` setup that spins up the broker on an ephemeral port (or drives it in-process, bypassing sockets, for pure-logic tests)
- [ ] `e2e/receipts/broker-submission.spec.ts`, `e2e/receipts/unknown-status-confirm.spec.ts`, `e2e/audit/print-jobs.spec.ts` — none exist yet; mock broker HTTP responses via `page.route()` following the `e2e/ai/` Anthropic-mocking pattern
- [ ] `src/entities/print-job/` — does not exist yet; needed before Playwright can assert against real component behavior

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification, including the cross-machine LAN/VPN check (driven as a Playwright/fault-test script per this repo's `human_needed`-ban policy), per the project's CLAUDE.md testing policy.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`broker/` crate, its test harness, 3 new E2E specs, `entities/print-job/`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
