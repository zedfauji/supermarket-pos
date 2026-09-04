# Spike 011 — Offline local agent routing

Question: can a small local model produce a constrained, validated read-only POS request without DB, Supabase, shell, or POS credentials?

`local-routing-spike.cjs` uses only a loopback Ollama endpoint for this machine's experiment. It is not production architecture and it makes no database call: `reports.today_sales` returns a fixed fixture. That is deliberate because the current POS has no local authoritative replica when Supabase is unreachable.

Run `node local-routing-spike.cjs --self-check`, then `node local-routing-spike.cjs`. Use `SPIKE_MODEL` and `OLLAMA_URL` to swap a local runtime/model. Weights are local-machine state and must not be committed.

The production candidate is a packaged loopback-only `llama.cpp` sidecar with JSON-schema grammar; Ollama is used here because it was already installed. See `research/offline-agent/08-spike-results.md`.
