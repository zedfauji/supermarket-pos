---
title: Rename src-tauri Cargo package from bar-pos to supermarket-pos
date: 2026-09-01
priority: low
---

## What

`src-tauri/Cargo.toml` still has `name = "bar-pos"` and `bar_pos_lib` — leftover from the bar-pos
fork this project pivoted from (2026-08-10), never renamed. This is why CI/build logs show
`Compiling bar-pos v1.2.0 (...)` even though the shipped product is correctly branded "Supermarket
POS" everywhere a user actually sees it (`tauri.conf.json`'s `productName`).

## Fix

Rename in `src-tauri/Cargo.toml`:
- `name = "bar-pos"` → `name = "supermarket-pos"`
- `bar_pos_lib` → `supermarket_pos_lib` (lib target name, and its `path = "src/lib.rs"` reference)

Update any `use bar_pos_lib::...` references in `src-tauri/src/`, and the binary filename this
produces (`bar-pos.exe` → `supermarket-pos.exe`) wherever it's referenced (e.g. version-resource
inspection commands, any packaging script that hardcodes the exe name).

## Why it matters

Cosmetic only — doesn't affect the shipped app's identity or functioning (`productName`/
`identifier` in `tauri.conf.json` are already correct). Confusing for anyone reading build logs or
grepping `target/debug/` and finding `bar-pos.exe`/`bar_pos_lib.dll` in a repo called
supermarket-pos.
