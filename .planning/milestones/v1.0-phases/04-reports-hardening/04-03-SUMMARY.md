---
phase: 04-reports-hardening
plan: 03
status: complete
subsystem: E2E hardening and caja reconciliation
tags: [playwright, supabase, caja, checkout]
requires: [04-02]
provides: [full-day-soak, caja-close-reconciliation]
affects: [REP-01]
tech-stack:
  added: []
  patterns: [service-role RPC volume, UI checkout, captured RPC response]
key-files:
  created:
    - e2e/55-full-day-soak.spec.ts
    - supabase/migrations/20260818000004_close_caja_reconciliation_summary.sql
  modified: []
decisions:
  - Close caja now returns its payment-method cash reconciliation payload without changing existing ok semantics.
metrics:
  duration: 0m
  completed: 2026-08-15
actuals:
  tokens: 5306
  tasks: 2
  commits: 3
---

# Phase 04 Plan 03: Full-day soak Summary

Realistic checkout, receiving, near-expiry, and caja-close coverage with live reconciliation output.

## Completed

- Added a serial Playwright soak with 70 direct RPC sales plus barcode, search, loose-weight, open-unit, and split-tender UI sales.
- Re-exercised rejected tampered direct-sale and receiving calls with zero-row-mutation assertions.
- Added a replayed-close assertion and a minimal migration returning the existing payment-method cash reconciliation from `close_caja_session`.

## Verification

- `npx tsc --noEmit --pretty false` — passed
- `npx playwright test e2e/55-full-day-soak.spec.ts --retries=0` — passed (2 tests)

## Deviations from Plan

### Approved scope expansion

- Added `20260818000004_close_caja_reconciliation_summary.sql` because the pre-existing close RPC returned only `{ ok: true }`, while REP-01 requires the close response’s reconciliation summary to be asserted directly.

## Self-Check: PASSED
