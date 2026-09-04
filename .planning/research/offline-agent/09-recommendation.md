# Recommendation

1. **Practical?** Yes for offline chat/inference and bounded local intent routing; no for current offline live business-data answers/mutations because the POS has no local authoritative replica.
2. **Location:** retain the chat UI; replace cloud `brain.ts` and direct browser tools with a local bridge and permissioned gateway.
3. **Process:** prototype a loopback-only sidecar, not embedded Tauri inference. It isolates failures and follows the broker pattern.
4. **Runtime:** llama.cpp/GGUF first; mistral.rs comparison second.
5. **First models:** Qwen3-0.6B, LFM2-700M, Falcon3-1B-Instruct, Gemma 3 1B IT, LFM2-1.2B. FunctionGemma only as fine-tune control.
6. **Footprint:** budget 0.5–1.2 GB complete installed AI, not model-file size alone; prove it per candidate.
7. **Minimum hardware:** do not promise below 4 cores/8 GB RAM until benchmarked. Support 6–8 cores/16 GB first; AI degrades/turns off without touching checkout.
8. **Security/audit:** strict gateway, current JWT/RLS, external confirmation and immutable `source=agent` audit; model receives no credentials.
9. **First milestone:** packaged model lifecycle, local chat availability, one read-only report tool, schema/permission gateway, offline-data-unavailable UX, eval harness and target-hardware benchmark.
10. **Exclude V1:** all mutations, payments/refunds/discounts, RBAC/audit/config writes, cloud RAG/embeddings, arbitrary SQL/shell, and “offline data” claims.
11. **Risks:** sub-1B semantic accuracy, Spanish POS vocabulary, CPU/RAM contention, redistributable licenses, GGUF/template compatibility, and absent offline data. Fine-tuning/RAG are unproven and not needed before evaluation proves a gap.
