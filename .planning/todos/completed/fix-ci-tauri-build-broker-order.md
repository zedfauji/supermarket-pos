---
title: Fix ci.yml — tauri-build job never builds the broker crate before cargo test
date: 2026-09-01
priority: high
---

## What

`.github/workflows/ci.yml`'s `tauri-build` job runs `cargo test` in `src-tauri` (step "Rust unit
tests") without first building the sibling `broker/` crate. `src-tauri/tauri.conf.json` bundles
`../broker/target/release/broker.exe` as a resource, and tauri-build's build script hard-fails if
that path doesn't exist — even for a plain `cargo test`, not just a real bundle.

This is the confirmed root cause of GitHub Actions run `33587195680` / job `100113706453` failing:

```
resource path `..\broker\target\release\broker.exe` doesn't exist
```

It likely worked before by accident: this repo's runner is self-hosted (`[self-hosted, windows,
x64]`), and the workspace persists across jobs — a stale `broker.exe` from some prior manual/local
build was probably still sitting on disk until it wasn't.

## Fix

Add a step to `ci.yml`'s `tauri-build` job, before "Rust unit tests", that builds the broker crate:

```yaml
- name: Build broker
  working-directory: broker
  run: cargo build --release
```

## Why it matters

Blocks every CI run on this job until fixed — not a flaky/one-off failure, it's a permanent gap in
the workflow that only worked by leftover-state coincidence.
