# Spike results

## Implemented

[`local-routing-spike.cjs`](../../spikes/011-offline-agent-local-routing/local-routing-spike.cjs) is an isolated Node proof. It asks a loopback-only local Ollama model for one JSON-schema constrained `reports.today_sales` request, rejects anything else, executes a fixture-only read-only adapter, and requests a final response. No production code, dependencies, model weights, Supabase credential, SQL or shell capability were added. `README.md` documents invocation.

## Measured 2026-09-04

Ollama 0.22.0, `qwen3:0.6b`, local 522 MB model, on the workstation described in 07:

| Case | Tool request | Tool request wall | Answer wall | Decode rate | Result |
|---|---|---:|---:|---:|---|
| `Show today's sales` | correct | 732 ms (warm) | 481 ms | 512.56 tok/s | answer omitted gross amount: failure |
| `Muestra las ventas de hoy` | correct | 705 ms (warm) | 479 ms | 514.69 tok/s | Spanish answer included 123456 cents/37 tx: pass |

The self-check passed and rejects an invented `sql.query` tool and `yesterday` argument. The initial run surfaced a script control-flow defect; it was fixed before the recorded run. These are warm single-run measurements, not a performance claim. Ollama is only an installed development harness; the candidate shipped runtime remains llama.cpp sidecar. Unproven: llama.cpp integration, cold load/RSS, real report adapter/auth, concurrency, packaging and model accuracy beyond two prompts.
