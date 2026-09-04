# Small model candidates

Sizes below are parameter counts; Q4 disk estimates are engineering estimates (roughly 0.6–0.8 bytes/parameter plus metadata), not measurements. Licensing must be rechecked at acquisition/release.

## High-priority benchmark

| Model | Params | License / relevant official claim | Q4 estimate |
|---|---:|---|---:|
| [Qwen3](https://huggingface.co/Qwen/Qwen3-0.6B) | 0.6B | Apache-2.0; 100+ languages and tool calling | 0.45–0.6 GB |
| [LFM2](https://huggingface.co/LiquidAI/LFM2-700M) | 0.7B | LFM Open License; English/Spanish and tool protocol | 0.5–0.6 GB |
| [LFM2](https://huggingface.co/LiquidAI/LFM2-1.2B) | 1.2B | same; test GGUF/template compatibility | 0.8–1.0 GB |
| [Falcon3](https://huggingface.co/tiiuae/Falcon3-1B-Instruct) | 1B | Falcon terms; EN/ES, 8K, function-call training | 0.7–0.9 GB |
| [Gemma 3](https://huggingface.co/google/gemma-3-1b-it) | 1B | Gemma terms; 140+ languages | 0.7–0.9 GB |

## Secondary controls

| Candidate | Params | Distribution posture | Why secondary / limitation |
|---|---:|---|---|
| Qwen2.5 Instruct | 0.5B | Apache-2.0, ~0.35–0.5 GB Q4 | stable small baseline; benchmark Spanish/tools |
| LFM2 | 350M | LFM Open, ~0.25–0.35 GB | footprint control; quality unknown |
| Gemma 3 | 270M | Gemma terms, ~0.2–0.3 GB | routing control, gated terms |
| FunctionGemma | 270M | Gemma terms, ~0.2–0.3 GB | specialist/fine-tune only, not dialogue |
| SmolLM2 | 360M | Apache-2.0, ~0.25–0.35 GB | quality/Spanish evidence to test |
| TinyLlama Chat | 1.1B | Apache-2.0, ~0.75–0.95 GB | older quality control |
| Llama 3.2 Instruct | 1B | Llama community license, ~0.7–0.9 GB | license/release review |
| Phi-1.5 | 1.3B | MIT, ~0.9–1.1 GB | older/English-weighted control |
| Qwen2.5 Instruct | 1.5B | Apache-2.0, ~1.0–1.3 GB | boundary quality control |
| SmolLM2 | 1.7B | Apache-2.0, >1.1 GB | above target; only quality ceiling |
| Falcon3 base | 1B | Falcon terms, ~0.7–0.9 GB | base, not tool-ready |
| OLMo 2 | 1B | Apache-2.0, ~0.7–0.9 GB | instruction suitability unproven |
| MobileLLM | 1B | research/release-specific, ~0.7–0.9 GB | production distribution unclear |
| SmolVLM2 | 500M | Apache-2.0, ~0.35–0.5 GB | vision not required for first route |
| Granite 3.1 | 2B | Apache-2.0, >1.3 GB | outside target band |
| Granite 3.3 Instruct | 2B | Apache-2.0, >1.3 GB | outside target band |
| Gemma 2 | 2B | Gemma terms, >1.3 GB | outside target band |
| Llama 3.2 Instruct | 3B | Llama community, >2 GB | outside distribution target |
| Phi-3.5-mini | 3.8B | MIT, >2.5 GB | outside distribution target |

No generic tool benchmark establishes Spanish POS accuracy. Exact Q4/Q5/Q8 artifact size, context/RAM, GGUF availability, chat template and redistribution terms are candidate-acquisition checks, then measured in the harness—not facts inferred from parameter count.

## Not first-choice

Phi and Granite instruction controls above the target band, base models, vision-only models, and 3B+ models do not meet the distribution target. FunctionGemma merits a later supervised fine-tune experiment, not chat deployment. No generic benchmark establishes Spanish POS tool routing: this repository’s evaluation suite must decide.
