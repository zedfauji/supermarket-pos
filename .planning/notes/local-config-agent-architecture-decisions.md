---
title: Local config agent architecture decisions
date: 2026-09-02
context: GSD exploration of replacing the cloud Anthropic dependency in this app's AI features with a self-hosted, fully-offline, local-model agent that executes POS configuration/reporting operations directly rather than only advising
---

# Local Config Agent Architecture Decisions

## Motivation

Current `agent-chat` feature calls Anthropic client-side (`src/shared/lib/agent/{brain,vision}.ts`) —
flagged in `.planning/REQUIREMENTS.md` (AI-01..05) as needing to move server-side regardless. Separately,
the store owner wants a much bigger capability: a chat agent that directly performs POS configuration
and reporting operations (create a promotion, bulk price update, add staff, list/set printers, run
diagnostics, look up recent sales) rather than just describing how to do them — and wants it self-hosted
so it works without a constant internet connection and without sending business data to a third-party
cloud LLM. Target hardware is real bar/store PCs: Windows, WebView2, **no dedicated GPU**.

## Decisions

- **Autonomy model:** the agent executes atomic operations itself (not just instructions), but always
  shows a preview/diff summary and waits for a single confirm before committing. **Never bypasses
  existing RBAC** — if the underlying action already requires a manager/admin PIN gate (per
  `src/shared/lib/rbac.ts`), the agent triggers that same PIN-gate flow; it does not get an autonomy
  exception. This reuses the existing manager-PIN-gate UI pattern rather than inventing a parallel
  confirmation mechanism.
- **Model delivery:** bundled as a Tauri sidecar process shipped inside the app installer (or
  auto-downloaded on first run), not a separate tool the store owner has to install (e.g. not "install
  Ollama yourself"). Zero extra setup steps for a non-technical store owner; the app owns the inference
  runtime's lifecycle (start/stop/health).
- **v1 scope boundary:** config, reporting, and diagnostics only — promotions, bulk product/price edits,
  staff creation, printer/hardware setup, sales/receipt lookup, backend connection diagnostics. Checkout,
  payments, and refunds stay manual UI flows for now — highest-stakes money paths, already have staff
  muscle-memory, and don't need to be first through a new, less-proven execution surface.
- **Vision pipeline stays separate:** the existing Anthropic-based invoice/image extraction pipeline
  (`brain.ts`/`vision.ts`) is explicitly **out of scope** for this effort. This spike only covers the new
  text/tool-calling "do things in the POS via chat" agent. Whether to also localize vision/OCR is a
  separate future decision — CPU-only vision-language inference is a much heavier lift than CPU-only
  text tool-calling.
- **Correctness caveat (from research, see [[local-agent-runtime-model-research-questions]]):** grammar-
  constrained decoding (GBNF/JSON-schema) guarantees the tool-call JSON *parses*, not that the tool/params
  chosen are *correct* — a documented "constraint tax" shows constrained decoding can suppress a small
  model's tool-selection accuracy vs. unconstrained generation. This is the real justification for the
  confirm-before-commit step above, not just an RBAC nicety: on CPU-only small models, "valid JSON" ≠
  "right answer."
- **Isolation from concurrent phase work:** at exploration time, two other sessions were actively
  executing Phase 26 (Multi-Customer Deployment) and Phase 27 (Promotions & Discount Management), with
  uncommitted changes in shared files (`domain.ts`, `rbac.ts`, `edge-function-contracts.ts`,
  `PaymentModal.tsx`, `process-direct-sale/index.ts`). The feasibility spike for this agent runs in a
  **git worktree** — isolated checkout/branch, so it can still reference real `domain.ts`/`rbac.ts` types
  for realism, but produces zero working-tree collision with those in-flight sessions. Real integration
  work (wiring the agent to live RBAC/mutation hooks) should wait until Phase 26/27 land, not interleave
  with them.

## Open questions

See [[local-agent-runtime-model-research-questions]] for the runtime/model/license/accuracy unknowns a
research pass surfaced but couldn't fully resolve — final model+license pick, real CPU tokens/sec on
target hardware, and multi-parameter tool-call accuracy under grammar constraint all need the feasibility
spike's empirical results before this can become a phase plan.
