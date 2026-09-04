# Packaging and performance

The current workstation is AMD Ryzen 7 9800X3D, 8 cores/16 logical processors, 31.15 GiB RAM. It is **not** a low-end POS benchmark.

| Scenario | Model Q4 | Runtime + tokenizer/prompts + sidecar | Full installed estimate | Use |
|---|---:|---:|---:|---|
| ~300 MB | 270–350M: 0.2–0.3 GB | 30–80 MB | 0.25–0.38 GB | routing research only |
| ~500 MB | 0.6B: 0.45–0.6 GB | 30–100 MB | 0.5–0.7 GB | realistic minimum |
| ~750 MB | 0.7–1B: 0.55–0.85 GB | 40–120 MB | 0.65–1.0 GB | quality candidate |
| ~1 GB | 1.2B: 0.8–1.0 GB | 50–150 MB | 0.9–1.2 GB | upper target |

These are estimates, not model-file measurements; mapped weights, KV cache/context, OS page cache and runtime RSS are extra. Avoid embeddings/RAG initially: SQLite FTS/BM25 or no retrieval adds negligible distribution size and suits static POS help. Re-evaluate embeddings only if measured help retrieval fails.

Benchmark low-end 4-core/8GB/iGPU, mid 6–8-core/16GB and this development workstation. Measure cold start, first token, decode tokens/s, peak/sustained process RSS, CPU, disk, 20 repeated English/Spanish safety cases, and checkout responsiveness under concurrent inference. Suspend/unload inference under RAM pressure; POS sales always outrank AI.
