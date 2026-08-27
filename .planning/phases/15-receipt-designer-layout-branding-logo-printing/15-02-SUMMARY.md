---
phase: 15-receipt-designer-layout-branding-logo-printing
plan: 02
subsystem: infra
tags: [rust, tauri, esc-pos, image, base64, thermal-printer, ci]

# Dependency graph
requires: []
provides:
  - "encode_logo_raster(bytes, target_width_dots) -> Result<Vec<u8>, String>: byte-exact GS v0 header + MSB-first packed monochrome raster, zero-padded on non-8-aligned widths"
  - "decode_data_url(data_url) -> Result<Vec<u8>, String>: strips data-URL prefix, base64-decodes, rejects payloads over 512KB before image::load_from_memory ever runs"
  - "build_print_payload(lines, logo_data_url, paper_width_chars) -> Vec<u8>: best-effort logo raster prepended to ESC/POS text lines, never fails the print job on logo errors"
  - "dot_width_for_paper(paper_width_chars) -> u32: 384/576-dot mapping (ASSUMED, flagged for hardware verification)"
  - "print_receipt Tauri command now accepts logo_data_url: Option<String>, paper_width_chars: u16 (camelCase IPC: logoDataUrl/paperWidthChars)"
  - "cargo test now runs in CI's tauri-build job"
affects: ["15-03 (frontend IPC wiring — printReceipt call site needs logoDataUrl/paperWidthChars args)"]

# Actuals (#2632)
actuals:
  tokens: 2500
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: ["image 0.25 (default-features=false, png+jpeg only)", "base64 0.23 (promoted from transitive 0.22.1 to direct dependency)"]
  patterns: ["Every fallible logo-decode step returns Result<_, String> via .map_err — zero unwrap/expect/panic on attacker-controlled bytes", "Printer failures degrade gracefully (logged WARNING, skip block) rather than blocking the whole print job — consistent with existing write_fallback_bytes fallback policy"]

key-files:
  created: []
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/commands/printer.rs
    - .github/workflows/ci.yml

key-decisions:
  - "512KB decode cap chosen as the real trust boundary (not the 200KB client-side canvas cap) because a direct receipt_settings UPDATE via the Supabase client bypasses the browser resizer entirely"
  - "dot_width_for_paper's 384/576 mapping is explicitly marked ASSUMED in-code — ceiling documented, correction is a one-function change with no persisted-data impact"
  - "Fixed 3 pre-existing non-Windows-only clippy warnings (dead_code/unused_variables in test_print/DRAWER_PULSE/try_send_raw) via cfg-scoped #[allow(...)] — required to satisfy this task's own cargo clippy -D warnings verification step; no behavior change on any platform"

patterns-established:
  - "New Rust unit-test fixtures build real in-memory PNGs via image::RgbImage + write_to(..., ImageFormat::Png) rather than hand-crafting raw pixel buffers, exercising the actual decode path in every test"

requirements-completed: [RCPD-02]

coverage:
  - id: D1
    description: "encode_logo_raster produces byte-exact GS v0 headers (xL/xH byte-width, yL/yH dot-height, never swapped) and zero-padded packed monochrome data for known fixture bitmaps"
    requirement: RCPD-02
    verification:
      - kind: unit
        ref: "src-tauri/src/commands/printer.rs#encode_logo_raster_solid_black_8x8"
        status: pass
      - kind: unit
        ref: "src-tauri/src/commands/printer.rs#encode_logo_raster_solid_white_8x8"
        status: pass
      - kind: unit
        ref: "src-tauri/src/commands/printer.rs#encode_logo_raster_non_multiple_of_8_width_pads_with_zero"
        status: pass
    human_judgment: false
  - id: D2
    description: "decode_data_url/encode_logo_raster reject oversized (>512KB decoded), malformed (no comma), and non-image payloads with Result::Err — never panic"
    requirement: RCPD-02
    verification:
      - kind: unit
        ref: "src-tauri/src/commands/printer.rs#decode_data_url_rejects_oversized_payload_before_image_decode"
        status: pass
      - kind: unit
        ref: "src-tauri/src/commands/printer.rs#encode_logo_raster_returns_err_not_panic_on_non_image_bytes"
        status: pass
      - kind: unit
        ref: "src-tauri/src/commands/printer.rs#decode_data_url_rejects_missing_comma_separator"
        status: pass
    human_judgment: false
  - id: D3
    description: "print_receipt wires build_print_payload (logo raster + text lines), degrades to text-only on any logo failure, and CI now runs cargo test in the tauri-build job"
    requirement: RCPD-02
    verification:
      - kind: other
        ref: "cargo build && cargo clippy -- -D warnings (src-tauri/, both clean)"
        status: pass
      - kind: other
        ref: "grep -n 'cargo test' .github/workflows/ci.yml (new tauri-build step present)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-08-24
status: complete
---

# Phase 15 Plan 02: ESC/POS Logo Raster Encoding Summary

**Byte-exact `GS v 0` monochrome thermal-receipt logo raster encoding in Rust (`image` + `base64` crates), wired into `print_receipt` with non-fatal degrade-on-failure and a size-capped decode trust boundary, plus a new `cargo test` CI step.**

## Performance

- **Duration:** ~6 min (commit-to-commit)
- **Started:** 2026-08-23T20:36:25-06:00
- **Completed:** 2026-08-23T20:42:20-06:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `encode_logo_raster(bytes, target_width_dots)` decodes PNG/JPEG bytes, Lanczos3-resizes preserving aspect ratio, Floyd-Steinberg-dithers to 2-color via `image::imageops::colorops::{dither, BiLevel}`, and packs 8 dots/byte MSB-first into a byte-exact `GS v 0` header + data block — verified against solid-black/white 8x8 and non-8-aligned 12-wide fixtures built as real in-memory PNGs.
- `decode_data_url(data_url)` strips the `data:...;base64,` prefix, decodes, and rejects any payload whose decoded length exceeds 512KB *before* `image::load_from_memory` ever runs — the actual trust boundary, since a direct `receipt_settings` UPDATE via the Supabase client bypasses the browser canvas resizer entirely.
- `build_print_payload` + `dot_width_for_paper` wire the raster block into `print_receipt`, which now accepts `logoDataUrl`/`paperWidthChars` and degrades to text-only (logged `[printer] WARNING`) on any logo decode/encode failure, never blocking the print job.
- `image`/`base64` promoted to direct `Cargo.toml` dependencies (`image` scoped to `png`/`jpeg` features only, no avif/webp/tiff/gif bloat); both already package-legitimacy-audited in RESEARCH.md, no blocking checkpoint required.
- Added a "Rust unit tests" (`cargo test`) step to CI's `tauri-build` job — closing RESEARCH.md's identified CI gap.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — encode_logo_raster, byte-exact GS v0 header + packed monochrome data** - `fc6e394` (feat)
2. **Task 2: Decode-bomb guard — oversized/malformed logo payload degrades non-fatally**
   - RED: `5c80446` (test) — 3 failing tests (compile error, `decode_data_url`/`MAX_LOGO_DECODED_BYTES` did not exist yet)
   - GREEN: `f0ad84c` (feat) — implementation, all 6 tests pass
3. **Task 3: Wire encode_logo_raster into print_receipt + add cargo test to CI** - `464ef69` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles STATE.md/ROADMAP.md centrally)

## Files Created/Modified

- `src-tauri/Cargo.toml` - Added `image` (png/jpeg only) and `base64` as direct dependencies
- `src-tauri/Cargo.lock` - Lockfile update for the two new direct deps
- `src-tauri/src/commands/printer.rs` - `encode_logo_raster`, `decode_data_url`, `build_print_payload`, `dot_width_for_paper`, `print_receipt` signature change, 6 new unit tests, 3 cfg-scoped clippy-warning fixes
- `.github/workflows/ci.yml` - New "Rust unit tests" step in the `tauri-build` job

## Decisions Made

- 512KB decode cap (not the 200KB client-side canvas cap) is the real trust boundary, since a direct Supabase `receipt_settings` UPDATE bypasses the browser resizer entirely.
- `dot_width_for_paper`'s 384/576-dot mapping is marked `ASSUMED` in-code per RESEARCH.md Assumption A1 — isolated function, cheap to correct against real printer hardware later.
- Used `image::imageops::colorops::dither` with `BiLevel` rather than hand-rolling Floyd-Steinberg (RESEARCH.md's explicit Don't-Hand-Roll guidance).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 3 pre-existing non-Windows-only clippy warnings blocking this task's own verification step**
- **Found during:** Task 3 (`cargo clippy -- -D warnings` verification)
- **Issue:** `printer.rs` already contained 3 latent dead-code/unused-variable warnings on non-Windows builds (`DRAWER_PULSE` const, the non-Windows `try_send_raw` stub, and `test_print`'s `bytes` binding are all only referenced inside `#[cfg(target_os = "windows")]` blocks). These pre-date this plan and are unrelated to the new logo code, but CI had never run `cargo clippy` before (only `cargo test` was added this plan), so they'd never surfaced. The plan's Task 3 `<verify>` explicitly requires `cargo clippy -- -D warnings` to succeed, which this file-level pre-existing issue blocked.
- **Fix:** Added narrowly cfg-scoped `#[allow(dead_code)]` / `#[allow(unused_variables)]` attributes (via `#[cfg_attr(not(target_os = "windows"), allow(...))]` where the item is only unused on non-Windows) — zero behavior change on any platform, Windows code paths untouched.
- **Files modified:** `src-tauri/src/commands/printer.rs`
- **Verification:** `cargo build` and `cargo clippy -- -D warnings` both clean; `cargo test` still 6/6 passing.
- **Committed in:** `464ef69` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's own verification step; no scope creep, no behavior change, pure cfg-scoped lint suppression on genuinely dead non-Windows code paths.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `print_receipt`'s new `logoDataUrl`/`paperWidthChars` parameters are Rust-only for now — the TS call site (`src/shared/lib/pos-printer.ts`'s `invoke('print_receipt', { lines: ... })`) still only passes `lines`. This is intentional two-plan sequencing per this plan's `<objective>`: Plan 03 is scoped to wire the frontend IPC call (and verify via vitest/Playwright against the browser-only dev server, per this repo's testability constraint that Playwright never exercises the compiled Tauri binary). Until Plan 03 lands, a raw `invoke('print_receipt', { lines })` call without `paperWidthChars` will fail Tauri's argument deserialization (non-`Option` `u16` has no default) — expected, not a regression, since no runtime code path calls it that way yet outside this Rust module's own tests.
- `encode_logo_raster`/`decode_data_url`/`build_print_payload`/`dot_width_for_paper` are all pure, unit-tested, and ready for Plan 03 to invoke via the wired `print_receipt` command.

---
*Phase: 15-receipt-designer-layout-branding-logo-printing*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 4 modified files confirmed present on disk; all 4 task/RED/GREEN commit hashes (`fc6e394`, `5c80446`, `f0ad84c`, `464ef69`) confirmed in `git log --oneline --all`.
