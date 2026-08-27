# Phase 6: Security hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 06-security-hardening
**Areas discussed:** Anthropic edge function shape, Abuse/cost controls, receipt_settings scope, Migration of existing data

---

## Anthropic edge function shape

| Option | Description | Selected |
|--------|-------------|----------|
| Thin proxy | Edge function only does auth check → forward messages/tools/config to Anthropic → return response. brain.ts/vision.ts keep their existing loop/tool-execution/RAG logic. | ✓ |
| Full server-side agent loop | Edge function owns the whole tool loop — executes tools, retrieves RAG context, loops until done. | |

**User's choice:** Thin proxy (recommended option)
**Notes:** None — no follow-up questions on this area.

---

## Abuse/cost controls

| Option | Description | Selected |
|--------|-------------|----------|
| Auth-gating only | Any authenticated staff member (cashier+) can call the edge function freely, same as today. No new rate-limit logic. | ✓ |
| Per-user daily cap | Edge function tracks call count per staff member per day and rejects once a cap is hit. | |

**User's choice:** Auth-gating only (recommended option)
**Notes:** None — no follow-up questions on this area.

---

## receipt_settings scope

| Option | Description | Selected |
|--------|-------------|----------|
| Store-wide singleton | One receipt_settings row for the whole store, migration-tracked, RLS: any authenticated staff SELECT, manager/admin write. | ✓ |
| Real per-terminal isolation | Add terminal_id column, one row per terminal, RLS scoped per terminal. New capability — no terminal/device identity concept exists today. | |

**User's choice:** Store-wide singleton (recommended option)
**Notes:** This reinterprets ROADMAP.md Success Criterion #4 ("cannot read/write another terminal's row") as role-scoped write isolation on the single row, since there is no terminal concept in the schema. Recorded as D-05 in CONTEXT.md for the planner/researcher.

---

## Migration of existing data

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill from existing row | Migration copies settings.value for key='receipt' into the new table. | |
| Start empty, use app defaults | New table starts with zero rows; DEFAULT_RECEIPT constant fills in until first save. | ✓ |

**User's choice:** Start empty, use app defaults (user chose against Claude's initial "backfill" recommendation)
**Notes:** Pre-production/dev environment — no real customized receipt data at risk. Whether the old settings row is deleted or left orphaned is left to Claude's discretion (planner should document the choice).

---

## Claude's Discretion

- Whether the old `settings` table's `key = 'receipt'` row is deleted or left orphaned after the client moves to the new `receipt_settings` table.
- Exact edge function name/route for the new Anthropic proxy (follow existing `process-payment`/`process-direct-sale` naming convention).
- Confirming both `vision.ts` (single image message) and `brain.ts` (chat messages + tools) call shapes fit cleanly into one shared endpoint before committing to "one shared function."

## Deferred Ideas

- Real per-terminal `receipt_settings` isolation — deferred, would require inventing a terminal/device-identity concept from scratch; note for a future phase if ever needed.
- Rate limiting / per-user cost caps on the Anthropic edge function — deferred, related to REQUIREMENTS.md's v1.2 backlog item "Full client-side-secret-leak sweep beyond the Anthropic key."
