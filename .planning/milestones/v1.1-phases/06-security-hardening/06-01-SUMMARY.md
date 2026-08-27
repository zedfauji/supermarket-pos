---
phase: 06-security-hardening
plan: 01
subsystem: security
tags: [supabase-edge-function, anthropic, agent-proxy, bearer-auth, vitest]

requires:
  - phase: 03
    provides: process-payment edge function's Bearer-auth + corsHeaders/jsonResponse pattern, copied verbatim
provides:
  - Bearer-authenticated agent-proxy Supabase Edge Function forwarding to the Anthropic Messages API
  - callAgentProxy() client contract in edge-function-contracts.ts (registered in EDGE_FUNCTIONS)
  - brain.ts and vision.ts fully migrated off @anthropic-ai/sdk onto callAgentProxy
  - Minimal local Anthropic type definitions (anthropic-types.ts) replacing SDK type imports
affects: [07, 08, 09, 10]

actuals:
  tokens: ~95000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Thin server-side proxy: agent-proxy forwards one messages.create-shaped request/response verbatim — tool-loop/RAG orchestration stays entirely client-side (D-01)"

key-files:
  created:
    - supabase/functions/agent-proxy/index.ts
    - src/shared/lib/agent/anthropic-types.ts
    - src/shared/lib/agent/vision.test.ts
  modified:
    - src/shared/lib/edge-function-contracts.ts
    - src/shared/lib/agent/vision.ts
    - src/shared/lib/agent/brain.ts
    - src/shared/lib/agent/brain.test.ts
    - src/shared/lib/edge-function-contracts.test.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Task 4 (setting the real ANTHROPIC_API_KEY secret + redeploying agent-proxy) is deliberately NOT executed in this run — the user explicitly stated they will add the real Anthropic API key themselves at the end of the project, right before shipping to the customer. This is not a failure or an oversight; it is the correct behavior for a checkpoint:human-action task Claude cannot complete (no real paid API key available)."

patterns-established:
  - "Pattern: client Anthropic calls -> callAgentProxy() (edge-function-contracts.ts) -> Bearer-authenticated fetch -> agent-proxy edge function -> Deno.env.get('ANTHROPIC_API_KEY') -> Anthropic Messages API. No client ever holds the real key."

requirements-completed: []

coverage:
  - id: D1
    description: "brain.ts and vision.ts never construct an Anthropic SDK client or hold an Anthropic API key client-side — every request flows through the authenticated agent-proxy edge function"
    requirement: "SEC-01"
    verification:
      - kind: unit
        ref: "src/shared/lib/agent/vision.test.ts, src/shared/lib/agent/brain.test.ts, src/shared/lib/edge-function-contracts.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "@anthropic-ai/sdk removed from client dependencies; production build output contains no key material or SDK reference"
    requirement: "SEC-01"
    verification:
      - kind: other
        ref: "npm run typecheck && npm run lint && npm run build && grep -rq '@anthropic-ai/sdk' dist/ (0 matches); npm ls @anthropic-ai/sdk (not installed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ANTHROPIC_API_KEY set as a server-only secret and agent-proxy deployed/restarted so real Anthropic calls succeed end-to-end"
    requirement: "SEC-01"
    verification: []
    human_judgment: true
    rationale: "Claude cannot generate or obtain a real, paid Anthropic API key. The user has explicitly deferred this step to the end of the project, immediately before shipping to the customer. This deliverable is NOT complete — SEC-01 remains open until this is done."

duration: ~35min (Tasks 1-3 only)
completed: 2026-08-17
status: halted
---

# Phase 06-01: Agent-Proxy Migration Summary (Tasks 1-3 of 4 — Task 4 deferred)

**Bearer-authenticated `agent-proxy` Supabase Edge Function now fronts every Anthropic call; `brain.ts`/`vision.ts` fully off `@anthropic-ai/sdk` — real key provisioning (Task 4) intentionally deferred by the user until shipping.**

## Performance

- **Duration:** ~35 min (Tasks 1-3)
- **Tasks:** 3 of 4 completed (Task 4 is a `checkpoint:human-action` requiring a real, paid Anthropic API key)
- **Files modified:** 9

## Accomplishments

- New `supabase/functions/agent-proxy/index.ts` — Bearer-JWT-verified pass-through proxy to `https://api.anthropic.com/v1/messages`, copying `process-payment`'s auth block verbatim. Never reads a client-supplied key; forwards the raw Anthropic response unchanged.
- New `src/shared/lib/agent/anthropic-types.ts` — minimal local type surface (`AnthropicMessage`, `AnthropicContentBlock`, etc.) replacing `@anthropic-ai/sdk`'s type imports.
- `callAgentProxy()` added to `edge-function-contracts.ts` (with `AgentProxyRequestSchema`/`AnthropicMessageResponseSchema`), registered in the `EDGE_FUNCTIONS` registry, following the exact `callProcessPayment` client pattern (`getCachedAccessToken()` -> Bearer fetch).
- `vision.ts`'s `extractProductsFromText` and `extractProductsFromImage`, and `brain.ts`'s full tool-loop (both `messages.create` call sites) now call `callAgentProxy` instead of constructing an Anthropic SDK client. Tool-loop/RAG/Ollama-fallback control flow in `brain.ts` is byte-for-byte unchanged (D-02).
- `@anthropic-ai/sdk` fully removed from `package.json`/`package-lock.json`. Production build (`npm run build`) verified clean of the SDK package name and the client-exposed `VITE_ANTHROPIC_API_KEY`.

## Task Commits

Each task was committed atomically:

1. **Task 1: agent-proxy edge function + client contract + vision.ts text path** — `a6d9cd2` (feat)
2. **Task 2: Complete migration — vision.ts image path + brain.ts tool loop + full test rewrite** — `52282fa` (feat)
3. **Task 3: Remove @anthropic-ai/sdk dependency, prove clean build output** — `e8b91ca` (chore)

Merge commit into `main`: `589ef34`

Task 4 (checkpoint:human-action, `gate="blocking"`) was **not executed** — see below.

## Files Created/Modified

- `supabase/functions/agent-proxy/index.ts` - Bearer-authenticated pass-through proxy to the Anthropic Messages API
- `src/shared/lib/agent/anthropic-types.ts` - Minimal local Anthropic type definitions
- `src/shared/lib/edge-function-contracts.ts` - `callAgentProxy`, `AgentProxyRequestSchema`, `AgentProxyErrorBodySchema`, `AnthropicMessageResponseSchema`
- `src/shared/lib/agent/vision.ts` - Both extraction functions migrated to `callAgentProxy`; SDK import + `getApiKey()` removed
- `src/shared/lib/agent/brain.ts` - Both `messages.create` call sites migrated to `callAgentProxy`; SDK client/import/`getApiKey()` removed
- `src/shared/lib/agent/vision.test.ts` (new) - Vitest coverage for both extraction functions, mocking the edge-function boundary
- `src/shared/lib/agent/brain.test.ts` - Mock boundary moved from the SDK constructor to `callAgentProxy`
- `src/shared/lib/edge-function-contracts.test.ts` - `AgentProxyRequestSchema` cases added
- `package.json` / `package-lock.json` - `@anthropic-ai/sdk` dependency removed

## Decisions Made

- Task 4 is deliberately deferred, not skipped or forgotten. The user explicitly stated in this run's phase-execution instruction: *"I will be adding the anthropic key by the end of this project after shipping to the customer."* This is a legitimate use of `checkpoint:human-action` (Claude cannot obtain a real paid Anthropic API key) and the plan correctly halts here rather than fabricating completion.

## Deviations from Plan

### Auto-fixed Issues

None affecting scope. One out-of-scope finding surfaced, not fixed (see Issues Encountered).

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — Tasks 1-3 executed exactly as written.

## Issues Encountered

- **Unrelated pre-existing key exposure found, not fixed (out of scope for SEC-01):** the plan's literal Task 3 verify command (`grep -rq "@anthropic-ai/sdk\|dangerouslyAllowBrowser" dist/`) still technically matches `dist/`, but only because the unrelated `openai` package (`src/shared/lib/agent/rag.ts`, RAG embeddings, `VITE_OPENAI_API_KEY`) independently uses the same literal string `dangerouslyAllowBrowser` in its own client construction. This is pre-existing code, outside this plan's `<files>` list and outside SEC-01's Anthropic-only scope. Isolated checks confirm Success Criterion #1's actual intent is met: `dist/` grep for `@anthropic-ai/sdk` alone -> 0 matches; `VITE_ANTHROPIC_API_KEY` -> 0 matches. The OpenAI client-side key exposure is the same class of vulnerability and is already tracked in `.planning/STATE.md`'s Deferred Items (v1.2 backlog: "fuller client-secret-leak sweep"). Flagging here so it isn't lost — fixing it would require a new edge function and new threat-model entries (Rule 4 territory, out of this plan's scope).

## User Setup Required

**External service requires manual configuration — deferred by explicit user instruction, not yet done.**

Task 4 of this plan (`06-01-PLAN.md`) specifies:
1. Set `ANTHROPIC_API_KEY` as a server-only secret on the self-hosted Supabase stack (`supabase secrets set`, or the Docker Compose env file the edge-runtime container reads) — a real key from console.anthropic.com.
2. Deploy/restart the `agent-proxy` edge function so the secret is live.

**Status:** Not started. The user has stated they will do this themselves at the end of the project, immediately before shipping to the customer. Until this is done, `agent-proxy` will return HTTP 500 on every real call — the AI vision/agent-chat features are functionally offline in this environment, but no client-exposed key or SDK reference remains in the shipped bundle (the actual security exposure this phase closes).

**Resume:** Re-run `/gsd-execute-phase 06` (or address this plan directly) once `ANTHROPIC_API_KEY` is set and `agent-proxy` is deployed. At that point, add a `Task 4` completion note to this SUMMARY, flip `status: complete`, and populate `requirements-completed: [SEC-01]`.

## Next Phase Readiness

- Code-level SEC-01 work (the actual security exposure — a paid API key baked into the shipped Tauri binary) is fully closed: no client-exposed Anthropic key or SDK reference anywhere in `dist/`.
- Functional readiness (agent-proxy actually answering real Anthropic calls) blocks on the user's deferred Task 4. Not a blocker for Phase 06's other work (06-02/06-03, both complete) or for subsequent phases — the AI vision/chat feature was already effectively a v2/Beta scope item per PROJECT.md.

---
*Phase: 06-security-hardening*
*Completed: 2026-08-17 (Tasks 1-3 only; Task 4 deferred by user)*
