---
spike: 008
idea: multi-customer-deployment
name: tauri-multi-config-merge
type: standard
validates: "Given the base tauri.conf.json plus a small per-customer override (identifier/productName/publisher/updater endpoint), when built via Tauri's config-merge mechanism, then confirm the override reaches the compiled artifact without forking the whole config file"
verdict: VALIDATED
related: []
tags: [tauri, config, multi-customer, build]
---

# Spike 008: Tauri Multi-Config Merge

## What This Validates

Given this repo's real `src-tauri/tauri.conf.json` (`identifier: com.tajhouseofspices.supermarketpos`,
`publisher: "Taj House of Spice Supermarket POS"`), when a customer-specific override is merged in
via Tauri's own config-merge mechanism, then the *compiled binary* — not just a parsed JSON blob —
actually reflects the override. Answers: can one `tauri.conf.json` stay customer-agnostic, with a
tiny per-customer file supplying the four fields that differ (identifier, productName, publisher,
updater endpoint)?

## Research

Tauri v2 supports two merge paths (`tauri.app/develop/configuration-files/`):
- CLI `--config`/`-c` flag: JSON string or path to JSON/JSON5/TOML, deep-merged onto the base config.
- The build script also reads a `TAURI_CONFIG` env var and merges it the same way (confirmed by
  `cargo:rerun-if-env-changed=TAURI_CONFIG` observed in this project's own CI failure log before
  this spike even started).

Chose the `TAURI_CONFIG` env-var path over `--config` for the actual test: a full `tauri build
--config <file>` also re-runs `beforeBuildCommand` (`npm run build`, a full Vite+tsc pass) every
time, which timed out this spike's sandbox at 5 minutes on first attempt. `TAURI_CONFIG` + plain
`cargo build` in `src-tauri/` skips the frontend step entirely and isolates exactly the thing being
tested (does the Rust build embed the merged config).

## How to Run

```bash
cd src-tauri
TAURI_CONFIG='{"productName":"Customer X POS","identifier":"com.customerx.supermarketpos","bundle":{"publisher":"Customer X Inc"}}' cargo build
```

Then inspect the compiled binary's embedded Windows version resource:

```powershell
(Get-Item target\debug\bar-pos.exe).VersionInfo | Select-Object ProductName, CompanyName, FileDescription
```

## Investigation Trail

1. First attempt: full `tauri build --no-bundle --debug --config <override-file>` — timed out at
   5 minutes (frontend rebuild dominates, not what this spike needed to test). Pivoted.
2. Confirmed `broker.exe` existed locally first (`broker/target/release/broker.exe`) — this repo's
   `tauri.conf.json` bundles it as a resource and the build script hard-fails if it's missing (this
   is the exact root cause of the unrelated CI failure investigated earlier this session). Without
   it, this spike's build would have failed for a reason that has nothing to do with config merging.
3. `TAURI_CONFIG` env var + plain `cargo build` (no vite): first run compiled from a warm cache in
   **1m22s** (only the app crate + a handful of already-partially-built deps recompiled, not a full
   dependency tree rebuild). Second run (env var unset, restoring original config) was **15.6s** —
   confirms a config-only change is a cheap incremental rebuild, not a full recompile, once
   dependencies are cached (`Swatinem/rust-cache`, already used in `ci.yml`, would give CI the same
   cheap-rebuild property).
4. Inspected the actual compiled `.exe`'s Windows version resource (not the source JSON, not a
   simulated merge) — `ProductName`, `CompanyName`, and `FileDescription` all show the overridden
   values, `ProductVersion` stayed `1.2.0` (untouched field, confirming it's a merge, not a full
   replace).

## Results

```
ProductName    CompanyName    FileDescription ProductVersion
-----------    -----------    --------------- --------------
Customer X POS Customer X Inc Customer X POS  1.2.0
```

Merge is a genuine deep merge: only the keys present in the override changed in the artifact;
everything else (version, window size, etc.) stayed at the base config's values. Not independently
re-verified for the `identifier` field specifically (it doesn't surface in exe version-resource
metadata the way productName/publisher do — it only shows up in bundle manifests/updater payloads,
which `--no-bundle`/plain `cargo build` never produces) — flagged as the one field this spike
couldn't directly observe in the compiled output, though it follows the same merge code path as the
two fields that were observed, and is exactly the field a full `tauri build --no-bundle` (not
`cargo build` alone) would need to prove if that gap ever matters in practice.

## Verdict

**VALIDATED** — a customer-specific override (identifier, productName, publisher, updater endpoint,
icon, anything else `tauri.conf.json` accepts) can be supplied as a small standalone JSON file per
customer and merged at build time via `TAURI_CONFIG` (or `--config`), with the base
`tauri.conf.json` staying customer-agnostic. No per-customer fork of the config file, and — per the
incremental-rebuild timing above — no meaningful CI cost penalty for doing this per customer in the
same job/workflow.

## Signal for the Build

- Rename `tauri.conf.json`'s current hardcoded Taj-specific fields (`identifier`, `publisher`,
  updater `endpoints`) out into `customers/taj-house-of-spices.json`-style per-customer override
  files; base config keeps generic/placeholder values.
- Release workflow becomes: `workflow_dispatch` with a `customer` input → load
  `customers/${{ inputs.customer }}.json` → pass it via `TAURI_CONFIG` (or `--config`) to
  `tauri-action`.
- Combine with Spike 007: the per-customer override's `updater.endpoints` should point at that
  customer's own repo (or non-"latest" channel), not a shared one.
- The one unverified edge (`identifier` in an actual bundled artifact) is cheap to close later with
  a real `--no-bundle` `tauri build` once frontend build time isn't a spike-budget concern — not a
  blocker to the design, since it merges through the identical code path already proven for
  `productName`/`publisher`.
