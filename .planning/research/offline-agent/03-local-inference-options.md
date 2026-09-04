# Local inference options

| Runtime | Evidence | Verdict |
|---|---|---|
| llama.cpp / GGUF | MIT, CPU/GPU backends, `llama-server` local chat API and grammar/JSON-schema constrained output ([repo](https://github.com/ggml-org/llama.cpp), [server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [grammars](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md)) | First packaged prototype: loopback sidecar. |
| mistral.rs | MIT Rust engine, offline GGUF and strict-schema grammar documented ([repo](https://github.com/EricLBuehler/mistral.rs), [GGUF](https://docs.mistralrs.dev/guides/models/run-gguf/)) | Second experiment; do not enable bundled shell/Python/MCP/agent functions. |
| Candle | MIT/Apache tensor framework, not a finished GGUF/tool-serving layer ([repo](https://github.com/huggingface/candle)) | Defer. |
| ONNX Runtime GenAI | C API, CPU/DirectML/CUDA, INT4 tooling; DirectML is sustained engineering ([docs](https://onnxruntime.ai/docs/genai/api/c.html), [status](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html)) | Defer: conversion and serving glue have no proven CPU-first advantage. |
| Kalosm/other Rust-native | promising but narrower deployment evidence; Kalosm calls its Fusor backend early/not production-ready ([repo](https://github.com/floneum/kalosm)) | Experimental only. |

Choose a sidecar before embedding: it contains model crashes/RAM pressure, decouples Tauri ABI/builds and follows the existing print-broker precedent. Bind loopback only, authenticate the renderer-to-sidecar channel, own lifecycle in Tauri, set memory/CPU limits, and fail closed to “assistant unavailable.” Grammar guarantees shape only; it never grants semantic correctness or authorization.
