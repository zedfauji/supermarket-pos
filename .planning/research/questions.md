# Research Questions

## Local config agent — runtime/model/license unknowns

**Slug:** `local-agent-runtime-model-research-questions`
**Raised:** 2026-09-02, during `/gsd-explore` of a self-hosted local-LLM config/reporting agent (see
[[local-config-agent-architecture-decisions]]). A research pass answered the first-cut versions of these
but several claims landed as [tier-floor: unearned confidence] (resolver couldn't confirm researcher
tier — see explore workflow's tier-floor rule) or genuinely unverifiable this session. Recorded here as
unresolved, not settled fact.

- **Final model + license pick.** Candidates checked so far: Hermes-2-Pro-Llama-3-8B (strong documented
  function-calling eval, but under Meta's Llama 3 Community License — fine at this app's scale, real
  license artifact to track); Phi-3.5-mini-instruct-onnx (MIT, ships a `cpu-int4-awq` variant for
  CPU-only inference, function-calling track record not independently verified); Qwen2.5 — **correction**,
  the 3B checkpoint is under the restrictive "qwen-research" non-commercial license, not Apache-2.0 (only
  0.5B/1.5B/7B/14B/32B are Apache-2.0); Llama-3.2-3B-Instruct is under the Llama 3.2 Community License,
  not Apache/MIT. Functionary not yet evaluated. Needs a final pick with license sign-off before any
  phase plan commits to one.
- **Real CPU throughput.** No vendor-published tokens/sec figure found for any candidate model on a
  4-8 core, no-AVX-512 consumer CPU (the realistic bar/store-PC target) — only community anecdote.
  [tier-floor: unearned confidence] — needs an actual benchmark run on representative hardware, which is
  exactly what the feasibility spike (see note above) is for.
- **ONNX Runtime GenAI structured-output support.** Could not confirm from Microsoft's own
  onnxruntime-genai docs whether it has native JSON-schema/grammar-constrained decoding (as opposed to
  llama.cpp's native GBNF support, which is confirmed in llama.cpp's own docs). May require pairing with
  an external constrained-decoding layer. [abstain: non-authoritative source only]
- **Multi-parameter tool-call accuracy under grammar constraint.** A documented "constraint tax" shows
  grammar/schema-constrained decoding can suppress tool-selection accuracy generally, and llama.cpp has
  open issues where grammar constraint degrades output on some models — but no primary study isolating
  whether *multi-parameter* calls (e.g. this app's bulk price-update case, several fields at once) degrade
  worse than single-parameter calls. [abstain: source-vs-prior conflict, unconfirmed]
- **llamafile as a bundling option.** Confirmed Apache-2.0/MIT-derived and that Windows caps a single
  executable at 4GB (forcing "external weights" mode for anything beyond a very small model) — but no
  concrete bundle-size comparison against llama-server/node-llama-cpp was found this session.
  [abstain: unverifiable this session]
