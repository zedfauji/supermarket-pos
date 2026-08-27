# Phase 15: Receipt Designer (Layout, Branding & Logo Printing) - Research

**Researched:** 2026-08-23
**Domain:** Receipt configuration UI (React/Zod/Supabase) + native ESC/POS thermal raster printing (Rust/Tauri)
**Confidence:** HIGH (schema/UI/formatter gaps — directly read from source) / MEDIUM (ESC/POS raster byte format — cross-checked web source) / LOW (dot-width-per-paper-size mapping, PDF-receipt scope — flagged as open questions)

## Summary

This phase is **not greenfield** — `receipt_settings` (table, RLS, Zod schema, TanStack Query hooks, and a `HardwareSettingsTab` UI with paper-width select, 6 toggle checkboxes, and a full logo-upload widget) already shipped in Phase 6. Do not re-plan any of that. The real, verified gap is narrower and sharper than the phase description implies: **`receipt_settings` is faithfully persisted to Postgres but is never read by the code that actually builds receipt text.** `src/shared/lib/receipt-format.ts`'s `buildThermalReceiptText()` hardcodes `LINE = 32` and unconditionally prints cashier/customer name — it takes no `ReceiptSettings` parameter at all. So today, toggling "Show cashier name" off in Settings does nothing to the printed, previewed, or emailed receipt. That wiring gap — not new UI, not new schema — is the load-bearing work for RCPD-01. Two UI fields (`headerLine2`, `footerText`) are also fully modeled and persisted end-to-end but have zero form inputs in `HardwareSettingsTab.tsx` — that is genuinely missing UI. A live-preview-while-editing view (success criterion #2) is also genuinely missing: `ReceiptPreview.tsx` exists and is the correct renderer to reuse, but it is only ever invoked post-payment with real `ReceiptData`, never from the Settings page against unsaved draft settings.

RCPD-02 (logo raster printing) is genuinely greenfield: `src-tauri/src/commands/printer.rs` has zero image-handling code today — no `image` or `base64` crate dependency, no raster/`GS v 0` logic, and `print_receipt` only accepts `lines: Vec<String>`. The logo already uploads, resizes (client-side, browser `<canvas>`, to a 384px-wide PNG/JPEG data URL, ≤200KB), and persists correctly via the existing `LogoUploader`/`useUploadLogo` feature — it just never reaches the physical printer. This phase must add real Rust image-decoding, dithering, and ESC/POS `GS v 0` byte-packing, verified confirmed via web search against Epson's official ESC/POS reference: `1D 76 30 m xL xH yL yH d[0]...d[k]`.

**Primary recommendation:** Treat this phase as two independent tracks that touch the same files: (1) wire `ReceiptSettings` into `receipt-format.ts` + add the two missing text inputs + build a Settings-page live preview by calling the existing `buildThermalReceiptText` against a synthetic sample receipt and the *unsaved* draft settings; (2) add `image` + `base64` crates to `printer.rs`, write a pure `encode_logo_raster()` function with byte-exact Rust unit tests, and extend `print_receipt`'s Tauri command signature to accept an optional logo payload.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|--------------------|
| RCPD-01 | Owner can edit receipt header lines, footer text, and toggle optional line items (cashier name, customer name, receipt #, tax breakdown) from Settings, with a live preview reflecting current `receipt_settings` before saving — reusing/extending `ReceiptPreview.tsx` rather than a second renderer | `HardwareSettingsTab.tsx` already has 6/8 toggle fields + logo upload; missing only `headerLine2`/`footerText` inputs and the live-preview component (Architecture Patterns, Pattern 1; Code Examples). The blocking gap is that `buildThermalReceiptText()` reads none of these settings today (Summary; Common Pitfalls, Pitfall 1) — must become the settings-parameterized single source of truth for preview/print/email text. |
| RCPD-02 | Store's uploaded logo (`receipt_settings.logoDataUrl`) prints on the physical 80mm ESC/POS thermal receipt via new Rust support in `printer.rs` converting it to a monochrome raster image encoded via `GS v 0`, verified E2E by a Playwright test asserting the raster bytes are sent to the printer command | Logo upload/resize/persistence already complete (`features/upload-logo`); zero existing Rust image/raster code (Summary). `image`/`base64` crates verified legitimate (Standard Stack, Package Legitimacy Audit); `GS v 0` byte format cited (Architecture Patterns, Pattern 2). Testability tension between "Playwright E2E" and Playwright never exercising the real Tauri binary is flagged explicitly (Assumptions Log A3; Open Question 3; Validation Architecture). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `receipt_settings` storage + RLS | Database / Storage | — | Already built (Phase 6): singleton row, manager+/admin write, all-authenticated read. No schema change needed for RCPD-01/02 — every column the UI needs already exists. |
| Header/footer/toggle edit UI | Browser / Client (React, `HardwareSettingsTab.tsx`) | — | Existing tab already hosts 6 of 8 editable fields; adding 2 text inputs extends it, does not replace it. |
| Live unsaved-edit preview | Browser / Client | — | Pure client-side render of draft state through the existing shared formatter; no network round-trip required per keystroke. |
| Receipt text formatting (shared source of truth) | Browser / Client (`shared/lib/receipt-format.ts`) | Also runs inside the Tauri webview at print time | Single formatter already feeds preview, print, and email (RCP-03 dependency) — must gain a `ReceiptSettings` parameter, not a second formatter. |
| Thermal ESC/POS text + raster encoding | Native / Desktop (Rust, `src-tauri/src/commands/printer.rs`) | — | Byte-level printer protocol; must live where `lines_to_esc_pos()` already lives so the raster block interleaves correctly with the existing text stream. |
| Windows raw printer dispatch | Native / Desktop | — | Existing `win_print` module (`WritePrinter`), unchanged by this phase. |
| Logo upload / client-side resize | Browser / Client (`features/upload-logo`) | — | Already built — canvas resize to 384px width, PNG/JPEG validation, 200KB cap. Reuse verbatim. |
| PDF receipt generation | Browser / Client (`@react-pdf/renderer`, same pattern as report exporters) | Edge Function (if server-rendered) | **Does not exist yet** for receipts (only for Reports). Owned by paused v1.2 Phase 13 (RCP-03). See Open Questions. |

## Standard Stack

### Core (new Rust dependencies — none new on the TypeScript side)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `image` (crates.io) | 0.25.10 [VERIFIED: crates registry, package-legitimacy check OK — published 2014, 3.4M downloads/week, repo `github.com/image-rs/image`] | Decode the uploaded PNG/JPEG data-URL bytes, resize/grayscale for thermal output | De facto standard Rust imaging crate (image-rs org); no existing in-repo alternative, no lighter stdlib option for PNG/JPEG decode |
| `base64` (crates.io) | 0.23.1 latest [VERIFIED: crates registry, package-legitimacy check OK — published 2015, 22.6M downloads/week, repo `github.com/marshallpierce/rust-base64`]. Currently only a **transitive** dependency at 0.22.1 [VERIFIED: src-tauri/Cargo.lock:246] — promote to a direct `[dependencies]` entry. | Strip the `data:image/png;base64,` prefix and decode the logo payload sent from TS | Already resolved into the dependency tree by `reqwest`; adding it directly avoids an undeclared reliance on a transitive version |

No new npm/TypeScript packages are needed — logo capture/resize already uses the browser `<canvas>` API (`features/upload-logo/model/useUploadLogo.ts`), which is correct and sufficient; do not add an npm image-processing library for the frontend side.

### Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `image` | crates.io | ~11 yrs | 3.4M/week | github.com/image-rs/image | OK | Approved |
| `base64` | crates.io | ~10 yrs | 22.6M/week | github.com/marshallpierce/rust-base64 | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rust `image` crate decode + dither | Decode/dither the logo to a 1-bit bitmap in TypeScript (browser canvas), send raw packed bytes over `invoke()` | Would make the byte-exact GS v0 payload directly observable by a mocked Playwright `invoke()` call (easier E2E assertion) — but RCPD-02 explicitly specifies "new Rust support in `printer.rs`"; moving encoding to TS contradicts that and duplicates image-decode logic the Rust side needs anyway for non-Tauri-web-fallback correctness. See Open Questions — flag for discuss-phase, do not decide unilaterally. |
| `image` crate's `imageops::dither` | Hand-rolled threshold-only monochrome conversion (no dithering) | A simple 50%-threshold pass is far simpler code but produces visibly worse logos on thermal print (loses gradients/anti-aliasing edges); Floyd–Steinberg dithering via `image::imageops::dither` with a 2-color `ColorMap` is one function call, not meaningfully more code — use it (Don't Hand-Roll below). |

**Installation:**
```toml
# src-tauri/Cargo.toml
[dependencies]
image = { version = "0.25", default-features = false, features = ["png", "jpeg"] }
base64 = "0.23"
```
Scope `image` to `default-features = false, features = ["png", "jpeg"]` — the crate's default feature set pulls in `avif`, `webp`, `tiff`, `gif`, etc. via `rayon`/`ravif`, none of which this phase needs; the logo uploader already restricts input to `image/png,image/jpeg` (`LogoUploader.tsx:82`). A minimal feature set keeps the native build lean and avoids pulling in `ravif`'s heavier native dependency chain.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐
│ HardwareSettingsTab.tsx     │  Settings > Hardware (manager/admin only, ProtectedAction)
│  - paper width select       │
│  - 6 existing toggles       │
│  - [NEW] header/footer text │──┐
│  - LogoUploader (existing)  │  │ local draft state (unsaved edits)
└─────────────────────────────┘  │
              │ on save              │
              ▼                      ▼
┌─────────────────────────────┐   ┌──────────────────────────────┐
│ useMutationUpdateReceipt-   │   │ [NEW] ReceiptDesignPreview    │
│ Settings (existing)         │   │  buildThermalReceiptText(     │
│  → upsert receipt_settings  │   │    sampleReceiptData,         │
└─────────────────────────────┘   │    draftLocalReceiptSettings) │
              │                   └──────────────────────────────┘
              ▼                              (reuses same function,
┌─────────────────────────────┐               proves preview == print)
│ receipt_settings (Postgres) │
│  singleton row, RLS-gated   │
└─────────────────────────────┘
              │ read on every print/preview/email
              ▼
┌──────────────────────────────────────────────────┐
│ [MODIFIED] buildThermalReceiptText(data, locale,  │  shared/lib/receipt-format.ts
│   settings: ReceiptSettings)                      │  — single formatter for preview, print, email, PDF
│  - LINE = settings.paperWidthChars (was: hardcoded)│
│  - conditionally emit cashier/customer/receipt#    │
│  - emit settings.headerLine2, settings.footerText  │
│  - bold-totals hint passed through to printer      │
└──────────────────────────────────────────────────┘
        │ (existing consumers, now settings-aware)
        ├──────────────┬───────────────────┬───────────────
        ▼              ▼                   ▼
  ReceiptPreview   pos-printer.ts     email-receipt.ts
  (post-payment)   printReceipt()    sendReceiptByEmail()
        │                │
        │                ▼ invoke('print_receipt', { lines, logoDataUrl })
        │      ┌──────────────────────────────────────────┐
        │      │ [NEW] printer.rs: print_receipt           │
        │      │  1. lines_to_esc_pos(lines)  (existing)   │
        │      │  2. IF logoDataUrl: decode base64 → image │
        │      │     → resize to dot width → dither 1-bit  │
        │      │     → pack GS v 0 bytes  (NEW)             │
        │      │  3. concatenate: [raster][text] or         │
        │      │     [text][raster] (header vs footer logo) │
        │      └──────────────────────────────────────────┘
        │                       │
        ▼                       ▼
  browser popup fallback   Windows WritePrinter (existing win_print module)
  (non-Tauri / non-Windows)
```

### Recommended Project Structure
No new FSD folders needed — every touched file already exists in its correct layer:
```
src/
├── entities/settings/model/       # ReceiptSettings type/queries — unchanged, already correct
├── features/upload-logo/          # logo capture/resize — unchanged, already correct
├── features/process-payment/ui/
│   └── ReceiptPreview.tsx         # reused as-is post-payment; NOT duplicated for Settings
├── widgets/SettingsTabsPanel/tabs/
│   └── HardwareSettingsTab.tsx    # [MODIFIED] add header/footer inputs + embed new preview
├── widgets/ReceiptDesignPreview/  # [NEW, if the preview needs its own composition] — or
│                                  # keep it inline in HardwareSettingsTab if small enough
└── shared/lib/
    └── receipt-format.ts          # [MODIFIED] buildThermalReceiptText gains settings param
src-tauri/src/commands/
└── printer.rs                     # [MODIFIED] add logo decode/dither/GS-v0-encode + Cargo deps
```

### Pattern 1: Single shared formatter, settings-parameterized
**What:** `buildThermalReceiptText(receipt, locale)` becomes `buildThermalReceiptText(receipt, locale, settings)`, reading `settings.paperWidthChars` instead of the module-level `LINE = 32` constant, and gating cashier/customer/receipt-number/footer lines behind the corresponding `settings.show*` booleans.
**When to use:** Every call site (`ReceiptPreview.tsx`, `pos-printer.ts`, `email-receipt.ts`) must be updated together — this is a breaking signature change to a function with 3 existing call sites [VERIFIED: grep confirmed exactly these 3 non-test files import `buildThermalReceiptText`/`receipt-format`].
**Example (target shape, adapted from the existing function at `src/shared/lib/receipt-format.ts:162`):**
```typescript
// Source: this repo, src/shared/lib/receipt-format.ts (existing function, to be parameterized)
export function buildThermalReceiptText(
  receipt: ReceiptData,
  locale: Locale,
  settings: ReceiptSettings
): string {
  const LINE = settings.paperWidthChars; // was: module-level constant
  // ...
  if (settings.headerLine2) lines.push(centerLine(sanitize(settings.headerLine2)));
  // ...
  if (settings.showCashierName) lines.push(lineLeftRight(tr('receipt.cashier'), sanitize(receipt.cashierName)));
  if (settings.showCustomerName) lines.push(lineLeftRight(tr('receipt.customer'), sanitize(receipt.customerName)));
  // ...
  if (settings.footerText) {
    lines.push(divider());
    lines.push(centerLine(sanitize(settings.footerText)));
  }
  if (settings.showReceiptNumber) lines.push(centerLine(`#${receipt.receiptNumber}`));
}
```
All 3 call sites already have (or can trivially reach) `useReceiptSettings()` — `ReceiptPreview.tsx` is rendered from `PaymentPane`, which is already inside a component tree that can fetch settings; `pos-printer.ts` and `email-receipt.ts` are plain `shared/lib` functions with no hook access, so they need the caller to pass `settings` in (do not reach into TanStack Query cache from `shared/lib` — that would invert the FSD import direction).

### Pattern 2: GS v 0 raster encoding (Rust)
**What:** `1D 76 30 m xL xH yL yH d[0]...d[k]` [CITED: Epson ESC/POS Technical Reference, `GS v 0` — cross-checked via web search summary of `download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_lv_0.html`, confirmed by a second independent source (`parzibyte.me` raster-bit-image walkthrough)]. `m=0` normal mode. `xL,xH` = image width **in bytes** (little-endian 16-bit: `width_bytes = ceil(width_dots / 8)`, `xL = width_bytes & 0xFF`, `xH = (width_bytes >> 8) & 0xFF`). `yL,yH` = image height **in dots** (same little-endian split). Each data byte packs 8 horizontal dots MSB-first; a `1` bit prints (dark), `0` does not.
**When to use:** Only for the logo block. Do not use for the existing text — text stays on the existing `lines_to_esc_pos()` byte-per-character path (bitmap fonts + `ESC E`/`ESC a` bold/align commands), unchanged.
**Note:** Epson's own current reference marks `GS v 0` "obsolete" in favor of `GS ( L` — but RCPD-02 explicitly names `GS v 0`, and it remains the most widely implemented raster command across generic/clone 58mm/80mm thermal printers (the class of hardware this single-store POS targets), so this is the correct choice despite the "obsolete" label; do not substitute `GS ( L` without an explicit decision.
**Example (shape only — write against this repo's actual printer.rs once dependencies are added):**
```rust
// Target shape for src-tauri/src/commands/printer.rs — NOT yet in the codebase.
// Source: ESC/POS GS v 0 byte layout per Epson technical reference (see citation above);
// `image` crate API per https://docs.rs/image (dither/resize/grayscale — verify exact
// method names against the pinned 0.25.10 docs when implementing, API surface shifts
// across image 0.24→0.25).
fn encode_logo_raster(png_or_jpeg_bytes: &[u8], target_width_dots: u32) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(png_or_jpeg_bytes).map_err(|e| e.to_string())?;
    let scale = target_width_dots as f32 / img.width() as f32;
    let resized = img.resize(
        target_width_dots,
        (img.height() as f32 * scale) as u32,
        image::imageops::FilterType::Lanczos3,
    );
    let gray = resized.to_luma8();
    // Floyd–Steinberg dither to 1-bit — see Don't Hand-Roll below.
    let width_bytes = (target_width_dots as usize).div_ceil(8);
    let height = gray.height();
    let mut out = vec![GS, b'v', b'0', 0, (width_bytes & 0xFF) as u8, (width_bytes >> 8) as u8,
                        (height & 0xFF) as u8, (height >> 8) as u8];
    // ... pack 8 dithered pixels per byte, MSB-first, append to `out`
    Ok(out)
}
```

### Anti-Patterns to Avoid
- **A second receipt renderer for the Settings live preview:** RCPD-01 success criterion #2 explicitly forbids this ("rendered through the existing `ReceiptPreview.tsx` renderer rather than a second, divergent one"). Build the preview by calling `buildThermalReceiptText` with a synthetic sample `ReceiptData` + the draft (unsaved) `ReceiptSettings`, and if UI chrome differs from `ReceiptPreview.tsx`, extract the `<pre>` rendering into a small shared piece rather than re-implementing the text-building logic.
- **Encoding GS v 0 bytes without byte-boundary padding:** if `target_width_dots` is not a multiple of 8, `width_bytes = ceil(width/8)` leaves trailing pad bits in the last byte of each row — pad with `0` (not-printed), never leave garbage bits, or the right edge of the printed logo shows random noise.
- **Skipping the dead `kdsEnabled` field:** `receipt_settings.kds_enabled` [VERIFIED: supabase/migrations/20260819000001_receipt_settings.sql:31 — `kds_enabled BOOLEAN NOT NULL DEFAULT false`] is a leftover from the bar-pos KDS feature, which CLAUDE.md confirms was removed end-to-end in Phase 1. It is not surfaced in `HardwareSettingsTab.tsx` today (correctly — dead field). Do not add UI for it under this phase; it's pre-existing schema debt, not phase scope.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Monochrome image dithering | A custom threshold/dithering loop | `image::imageops::dither` with a 2-color `BiLevel`/custom `ColorMap`, or `image::imageops::colorops::grayscale` + a hand-rolled Floyd–Steinberg pass if `dither` doesn't expose the exact API needed (verify against pinned `image` 0.25.10 docs at implementation time — API has shifted across `image` major versions) | Getting error-diffusion dithering right (correct neighbor-pixel error propagation, edge clamping) is a well-known source of off-by-one visual bugs; the crate already solves it |
| PNG/JPEG decode in Rust | A hand-rolled PNG/JPEG parser or shelling out to an external binary (e.g. ImageMagick) | `image::load_from_memory` | Standard, well-maintained, zero external process dependency (important — this is a single-EXE desktop app, no bundled ImageMagick) |
| Base64 data-URL decoding | Manual base64 alphabet lookup table | `base64` crate (already transitively present) | Solved problem, error-prone by hand (padding edge cases) |
| GS v 0 byte-order math | Ad hoc bit-shifting scattered inline | A single `encode_logo_raster()` pure function with unit tests (Pattern 2 above) | Byte-order/padding bugs here are silent (printer just prints garbage) — isolate and test the math, don't inline it into `print_receipt` |

**Key insight:** Every piece of this phase that looks like "build a settings UI" or "build a preview" is mostly already built — the actual net-new engineering is entirely on the Rust/ESC-POS side, and that side has zero existing test coverage or prior art in this codebase to lean on (only `logger.rs` has any `#[cfg(test)]` precedent). Budget planning effort accordingly: most of RCPD-01 is "wire an existing thing up," RCPD-02 is genuinely new.

## Common Pitfalls

### Pitfall 1: Settings changes silently not affecting output (already latent in the codebase today)
**What goes wrong:** A manager toggles "Show customer name" off, sees it persist in the UI/DB, closes Settings satisfied — and the next printed receipt still shows the customer name, because `buildThermalReceiptText` never read the flag.
**Why it happens:** `receipt-format.ts` was written before `receipt_settings` existed as a table (it still hardcodes `LINE = 32` and unconditional field emission) and was never revisited when the settings table + UI shipped in Phase 6.
**How to avoid:** Make `settings: ReceiptSettings` a required (non-optional) parameter to `buildThermalReceiptText` so TypeScript's strict mode forces every call site to supply it — do not add a default-value fallback that silently reproduces today's hardcoded behavior.
**Warning signs:** Any new/updated E2E test that only checks a toggle's UI-persisted `checked` state (as `e2e/08-settings-receipt.spec.ts` does today [VERIFIED: e2e/08-settings-receipt.spec.ts:24-32, asserts `.setChecked(false)` / `.not.toBeChecked()` on the DOM control, never inspects rendered receipt text]) without also asserting the *rendered receipt text* changed is not proof the wiring works.

### Pitfall 2: Preview/print divergence (explicitly named in STATE.md blockers)
**What goes wrong:** A CSS-rendered `<pre>` preview using a proportional or slightly-off monospace font wraps lines differently than the physical 32/40/48-column fixed-width thermal output, so what the owner approves in Settings doesn't match what prints.
**Why it happens:** Two independent rendering paths — one computes byte-width-aware fixed-column text (`receipt-format.ts`), the other is arbitrary CSS.
**How to avoid:** The existing `ReceiptPreview.tsx` already gets this right — it renders the *exact string* `buildThermalReceiptText` produces inside a `<pre className="font-mono ... whitespace-pre">` (`ReceiptPreview.tsx:24-27`, comment already documents this is deliberate). Reuse that same pattern for the Settings-page live preview; do not introduce a second CSS layout that merely *approximates* column widths.

### Pitfall 3: `GS v 0` width/height byte-order mistakes
**What goes wrong:** Swapping `xL`/`xH` or using dot-width instead of byte-width for `xL`/`xH` produces a printer that either errors, prints nothing, or prints a horizontally-corrupted/repeated image.
**Why it happens:** `xL,xH` is genuinely different from `yL,yH` — width is byte-count, height is dot-count — an easy mismatch to introduce when writing the packing loop by hand.
**How to avoid:** Rust unit test with a small (e.g. 8x8 or 16x8 dot) fixture bitmap, asserting the exact 8-byte header (`1D 76 30 00 <xL> <xH> <yL> <yH>`) and the exact packed data bytes for a known checkerboard/solid pattern.

### Pitfall 4: Untrusted image decode without bounds
**What goes wrong:** `image::load_from_memory` on a maliciously/accidentally huge or malformed image (e.g., a crafted PNG with a huge declared dimension) can cause excessive memory allocation before your own resize step ever runs (decompression-bomb-shaped risk), even though only `manage_settings` (manager+/admin) can write `logo_data_url` per RLS.
**Why it happens:** The frontend already caps upload size (200KB) and resizes to 384px client-side (`useUploadLogo.ts:4-5`), but that is a *client-side, bypassable* guard (a direct `receipt_settings` UPDATE via the Supabase REST API bypasses the browser canvas entirely) — the Rust decode path processing whatever `logo_data_url` currently holds must not trust that invariant.
**How to avoid:** Before calling `image::load_from_memory`, cap the decoded byte length server/Rust-side too (e.g., reject base64 payloads whose decoded length exceeds a fixed ceiling, consistent with the existing 200KB client cap) and treat any `image::ImageError` as a non-fatal print failure (log + skip the raster block, still print the text) rather than propagating a panic — this is consistent with RCP-02's existing project-wide policy that a printer failure never blocks a completed sale.

## Runtime State Inventory

Not applicable — this phase is purely additive to already-hardened schema/RLS (no rename/refactor/migration). Explicitly verified: no new table, no column rename, no key rename. `receipt_settings` (all 11 columns) already exists exactly as needed [VERIFIED: supabase/migrations/20260819000001_receipt_settings.sql:20-35, quoted column list: `paper_width_chars, show_cashier_name, show_customer_name, show_receipt_number, header_line_2, footer_text, bold_totals, print_on_start, auto_cut, kds_enabled, logo_data_url`].

## Code Examples

### Reading receipt settings in a component that needs both server value and draft/unsaved edits (existing pattern, reuse verbatim)
```typescript
// Source: this repo, src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:27-53
// (existing pattern — optimistic local state mirrors server value, rolls back on mutation failure)
const { data: receiptSettings } = useReceiptSettings();
const updateReceiptSettings = useMutationUpdateReceiptSettings();
const [localReceipt, setLocalReceipt] = useState<ReceiptSettings | undefined>(() => receiptSettings);
const receipt = localReceipt ?? receiptSettings;

function patchReceipt(patch: Partial<ReceiptSettings>) {
  if (!receipt) return;
  const next: ReceiptSettings = { ...receipt, ...patch };
  setLocalReceipt(next); // optimistic — this `next` value is also what the live preview should render
  updateReceiptSettings.mutate(next, {
    onSuccess: result => {
      if (!result.ok) { setLocalReceipt(receipt); toast.error(result.error.message); }
    },
  });
}
```
The live preview (success criterion #2) should render off `receipt` (the local/optimistic value) with `buildThermalReceiptText(sampleReceiptData, locale, receipt)` — it already reflects unsaved edits by construction because `patchReceipt` updates it before the network call resolves.

### Playwright IPC-mock pattern to reuse for RCPD-02's E2E test
```typescript
// Source: this repo, e2e/25-export-reports.spec.ts:35-80 (existing, verified working pattern
// for asserting on args a Tauri command was invoked with — no other e2e spec exercises the
// real Rust `src-tauri` binary; Playwright always runs against `npm run dev`'s browser context)
await page.addInitScript(() => {
  (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
    invoke(cmd: string, args: unknown): Promise<unknown> {
      if (cmd === 'print_receipt') {
        // record `args` (lines + logoDataUrl) for assertion
      }
      return Promise.resolve(null);
    },
  };
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `receipt_settings` fields persisted but unread by the formatter | `receipt-format.ts` takes `ReceiptSettings` as a required parameter | This phase | Settings UI becomes truthful — what's saved is what prints, in-app-previews, and emails |
| Logo stored/displayed in-app (Home, Login, `<img>`) only | Logo also prints on the physical thermal receipt via `GS v 0` raster | This phase | Closes the gap the existing `uploadLogo.description` i18n copy already (inaccurately) claims: "It appears on the Home, Login, and printed receipt headers" [VERIFIED: src/shared/lib/i18n/locales/en-US/featMgmt.json:266 — the string literally already says this, but it is not yet true] |

**Deprecated/outdated:** Epson's own current technical reference marks `GS v 0` obsolete in favor of `GS ( L` — noted in Pattern 2 above; RCPD-02 explicitly specifies `GS v 0`, so this phase intentionally uses the "obsolete but universally supported" command, not the newer one.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Physical dot-width for each `paperWidthChars` option (32/40/48 → 384/576/576 dots, the conventional 203dpi 58mm/80mm mapping) [ASSUMED — not present anywhere in this codebase; no existing dot-width constant found] | Pattern 2 / Standard Stack | If wrong, the printed logo is scaled to the wrong physical width — either clipped or leaving unexpected margin. Must be confirmed against the actual target printer's spec sheet (or made configurable) before implementation, not hardcoded from this guess. |
| A2 | Scope of "PDF receipt" in success criterion #3 — whether this phase must newly build receipt PDF generation, or whether it only needs to apply settings to a PDF path that already exists [ASSUMED it does NOT exist yet — confirmed no receipt-PDF code found, only report-PDF via `@react-pdf/renderer`; RCP-03, the requirement that would build this, belongs to paused v1.2 Phase 13] | Summary / Architectural Responsibility Map | If this phase is expected to also build PDF receipt generation from scratch, the phase is significantly larger than "purely additive extension" as scoped in the phase description. Needs explicit resolution before planning — see Open Questions. |
| A3 | Whether GS v0 byte-correctness verification via a Rust `#[cfg(test)]` unit test (not a Playwright test) satisfies this project's CLAUDE.md "every test/verification/UAT MUST be automated Playwright E2E" policy, given Playwright in this repo never exercises the real compiled Tauri binary (confirmed: `playwright.config.ts` `webServer` always runs `npm run dev`, a browser-only Vite dev server) [ASSUMED a Rust unit test is the correct/necessary complement here, not a policy violation, since it is not a *manual/human* verification step — it's `cargo test`, fully automated] | Common Pitfalls / Pattern 2 | If the user/planner insists the GS v0 byte format itself must be Playwright-verifiable, the architecture must change (e.g., move raster encoding to TypeScript so the exact bytes cross the mocked IPC boundary observably) — a materially different design than "new Rust support in printer.rs." Flag explicitly in discuss-phase. |

**If this table is empty:** N/A — see entries above; all three need explicit confirmation before/during planning.

## Open Questions

1. **Does this phase need to build PDF receipt generation, or does it only need to make an *existing* PDF path settings-aware?**
   - What we know: No receipt-PDF code exists anywhere in the repo today (verified: only `src/shared/lib/exporters/pdf.tsx`, which is Reports-only, using `@react-pdf/renderer`). `email-receipt.ts` sends *plain text* (`receiptPlainText`), not a PDF attachment. RCP-03 (PDF receipt via email/download) is a separate, still-`Pending`, paused v1.2 requirement (Phase 13).
   - What's unclear: The phase description's success criterion #3 explicitly lists "PDF receipt" alongside "printed" and "in-app" as things that must reflect saved settings — but there is no PDF receipt to make settings-aware yet.
   - Recommendation: Confirm with the user during discuss-phase whether success criterion #3's "PDF receipt" clause (a) should be descoped/deferred to when Phase 13/RCP-03 resumes, since Phase 15 is declared "independent of Phase 14/16" but says nothing about Phase 13, or (b) requires this phase to also build a minimal receipt-PDF path (reusing `@react-pdf/renderer`, same as the report exporters) as net-new scope. Do not silently assume either — this materially changes phase size.

2. **What is the correct physical dot-width for each `paperWidthChars` option, and does it match the store's actual thermal printer hardware?**
   - What we know: `HardwareSettingsTab.tsx` offers 32/40/48-character options labeled 58mm / 80mm-standard / 80mm-wide. Standard ESC/POS convention at 203dpi is 384 dots for 58mm and 576 dots for 80mm, but this is a convention, not something this codebase specifies anywhere, and depends on the specific printer model's actual print-head resolution.
   - What's unclear: Whether both 40-char and 48-char (both labeled "80mm") should map to the same 576-dot width (with the logo just scaled differently) or different widths.
   - Recommendation: Treat A1 above as needing explicit confirmation (from the printer's spec sheet, or a `test_print`-style calibration step) rather than hardcoding 384/576 during planning without flagging it as a guess.

3. **Should `print_receipt`'s Tauri command signature grow a new parameter (`logoDataUrl: string | null`), or should logo printing be a separate command invoked before/after `print_receipt`?**
   - What we know: Today's signature is `print_receipt(lines: Vec<String>)` [VERIFIED: src-tauri/src/commands/printer.rs:123-124]. A single combined call keeps the "one atomic print job" semantics the existing fallback-to-temp-file behavior (`write_fallback_bytes`) relies on.
   - What's unclear: Whether header-position logos (before the text) vs. footer-position logos (after) need to be configurable, or whether this phase only needs "logo always at the top" (simpler, matches most real-world receipt design).
   - Recommendation: Default to logo-always-at-header (simplest, matches success criteria's plain wording), single combined `print_receipt(lines, logoDataUrl)` call — raise with the user only if they want footer-logo placement as a toggle.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain / `cargo` | Building `printer.rs` changes | ✓ [VERIFIED: `cargo info` ran successfully during research] | — | — |
| `image` crate (crates.io) | Logo decode/dither | ✓ (resolvable, not yet a dependency) | 0.25.10 latest | — |
| `base64` crate (crates.io) | Logo data-URL decode | ✓ (already transitively resolved at 0.22.1; 0.23.1 latest) | 0.23.1 latest | — |
| Windows `WritePrinter` API | Physical print dispatch | Not applicable on this Ubuntu dev machine — existing `#[cfg(target_os = "windows")]` gate already handles this; non-Windows falls back to writing raw ESC/POS bytes (including the new raster block) to a temp `.prn` file | — | Existing `write_fallback_bytes` fallback, unchanged by this phase |
| A real 58mm/80mm ESC/POS thermal printer | End-to-end physical verification of `GS v 0` output | ✗ (not present in this dev/CI environment) | — | Rust unit tests for byte-exact encoding (Pattern 2); Playwright mocked-IPC tests for the wiring; no physical-hardware verification is possible in this environment — release-signing/final hardware check stays a human/ops step outside this phase's automated-testing scope, same as existing Windows-only printer dispatch |

**Missing dependencies with no fallback:** none blocking — logo raster verification is scoped to unit + mocked-IPC tests per Common Pitfalls / Open Question 3, consistent with what this environment can actually exercise.

**Missing dependencies with fallback:** `image`/`base64` crates are not yet installed but are trivially added via `Cargo.toml`; no risk.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4 (unit) [VERIFIED: package.json devDependency, existing `npm run test` script] + Playwright v1.59 (E2E) [VERIFIED: package.json, `playwright.config.ts`] + Rust `#[cfg(test)]`/`cargo test` (new, for this phase's Rust logic — precedent already exists at `src-tauri/src/commands/logger.rs:97-109`) |
| Config file | `vite.config.ts` (Vitest), `playwright.config.ts`, none needed for `cargo test` (built into the Rust toolchain) |
| Quick run command | `npx vitest run src/shared/lib/receipt-format.test.ts` / `cargo test -p bar-pos-lib` (from `src-tauri/`) |
| Full suite command | `npm run test` / `npm run test:e2e` / `cargo test` (from `src-tauri/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RCPD-01 | `buildThermalReceiptText` honors `paperWidthChars`/`show*`/`headerLine2`/`footerText`/`boldTotals` | unit | `npx vitest run src/shared/lib/receipt-format.test.ts` | ✅ file exists, needs new cases — Wave 0 |
| RCPD-01 | Settings page: header/footer inputs persist and the live preview reflects unsaved edits before save | e2e | `npx playwright test e2e/08-settings-receipt.spec.ts` | ✅ file exists, needs new cases — Wave 0 |
| RCPD-01 | Live preview text matches `ReceiptPreview.tsx`'s rendering byte-for-byte for the same settings (no divergent second renderer) | unit | new assertion in `receipt-format.test.ts` or a small preview-component test | ❌ Wave 0 |
| RCPD-02 | `encode_logo_raster` produces byte-exact `GS v 0` header + packed data for a fixture bitmap | unit (Rust) | `cargo test encode_logo_raster` | ❌ Wave 0 — no Rust tests exist for `printer.rs` today |
| RCPD-02 | Uploading a logo → printing invokes `print_receipt` with a `logoDataUrl` payload matching the uploaded/saved logo (wiring, not byte-format) | e2e | `npx playwright test e2e/08-settings-receipt.spec.ts` (or a new logo-print spec) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/shared/lib/receipt-format.test.ts` + (if `printer.rs` touched) `cargo test -p bar-pos-lib`
- **Per wave merge:** `npm run test` + `npm run typecheck` + `npm run lint` + `cargo test` (from `src-tauri/`) + relevant `npx playwright test e2e/08-settings-receipt.spec.ts`
- **Phase gate:** Full suite green (`npm run test`, `npm run test:e2e`, `cargo test`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src-tauri/src/commands/printer.rs` — no `#[cfg(test)] mod tests` block exists yet for raster encoding (precedent pattern at `logger.rs:97-109` to copy)
- [ ] `src/shared/lib/receipt-format.test.ts` — needs new cases exercising every `ReceiptSettings` field's effect on output, once the function signature changes
- [ ] `e2e/08-settings-receipt.spec.ts` — every existing test only asserts on the *form control's* checked/value state after reload; none assert the *rendered receipt output* changed — this is the exact gap named in Pitfall 1 and must be closed, not just extended
- [ ] CI: no `cargo test` step currently runs in `.github/workflows/ci.yml`'s `tauri-build` job (only `npm run tauri build -- --ci --no-bundle`) [VERIFIED: .github/workflows/ci.yml:87] — decide during planning whether to add one, or rely on local `cargo test` execution as part of the plan's own verification steps

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no | Unchanged — existing PIN auth, out of scope |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | Already correctly enforced: `receipt_settings` write RLS requires `manager`/`admin` role [VERIFIED: supabase/migrations/20260819000001_receipt_settings.sql:46-47]; `HardwareSettingsTab` gates on `manage_settings` via `ProtectedAction` [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:78-82]. No new RBAC action needed for this phase. |
| V5 Input Validation | yes | Client-side: existing `encodeLogoDataUrl` (type + size + resize cap, `useUploadLogo.ts`). New surface this phase adds: `header_line_2` (`VARCHAR(48)`, already DB-enforced) and `footer_text` (`VARCHAR(480)`, already DB-enforced) — both already length-capped at the schema level [VERIFIED: supabase/migrations/20260819000001_receipt_settings.sql:26-27]; the new UI inputs must mirror these caps client-side (maxLength) for good UX, but the DB constraint is the actual backstop. |
| V6 Cryptography | no | Not applicable — no new secrets/crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Malformed/oversized image bytes reaching `image::load_from_memory` (decompression-bomb-shaped resource exhaustion) | Denial of Service | Bound decoded byte length before decode, treat decode errors as non-fatal (log + skip raster, still print text) — see Pitfall 4. Client-side canvas resize is a UX nicety, not a trust boundary (a direct `receipt_settings` UPDATE via the Supabase client bypasses it). |
| Unsanitized `header_line_2`/`footer_text` free text reaching the printed byte stream | Tampering (in the loose sense of corrupting printer output, not a classic web injection since there's no HTML/SQL context here) | Route through the existing `sanitize()` helper already used for every other free-text receipt field (`groupOrderItemsForReceipt.ts`'s `sanitize`, already imported in `receipt-format.ts`) — do not add these two new fields without the same treatment other user-entered receipt text already gets. |

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `src-tauri/src/commands/printer.rs` — full read, confirms zero existing image/raster/base64 code
- `src/shared/lib/receipt-format.ts` — full read, confirms `LINE = 32` hardcode and no `ReceiptSettings` parameter
- `src/entities/settings/model/queries.ts` — full read, confirms `receipt_settings` read/write hooks are complete and correct
- `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` — full read, confirms 6/8 fields have UI, 2 (`headerLine2`/`footerText`) do not
- `src/features/upload-logo/{ui/LogoUploader.tsx,model/useUploadLogo.ts}` — full read, confirms logo upload/resize/persist is complete
- `supabase/migrations/{20260420000005,20260819000001,20260819000002,20260819000004}_receipt_settings*.sql` — full read, confirms schema/RLS history and current state
- `src/shared/lib/domain.ts:806-826` — `ReceiptSettingsSchema` full read
- `e2e/08-settings-receipt.spec.ts`, `e2e/25-export-reports.spec.ts` — full reads, confirm existing test coverage and the Tauri-IPC-mock pattern
- `playwright.config.ts` — confirms Playwright always runs against `npm run dev` (browser), never the compiled Tauri binary except a Windows-gated MSI test
- `.github/workflows/ci.yml` — confirms no `cargo test` step exists today

### Secondary (MEDIUM confidence)
- Epson ESC/POS Technical Reference, `GS v 0` — web search cross-checked against a second independent source (parzibyte.me); byte layout `1D 76 30 m xL xH yL yH d[0]...d[k]` and the "obsolete but widely implemented" note
- `image`/`base64` crates.io registry data — via `gsd-tools package-legitimacy check --ecosystem crates`, confirmed OK (age, downloads, source repo)

### Tertiary (LOW confidence)
- 58mm→384-dot / 80mm→576-dot conventional mapping — general ESC/POS domain knowledge, not verified against this store's actual printer hardware; flagged as Assumption A1 / Open Question 2

## Metadata

**Confidence breakdown:**
- Standard stack (Rust crates): HIGH — verified via cargo registry + package-legitimacy check
- Architecture / gap analysis: HIGH — every claim about what exists/doesn't exist is a direct file read, not inference
- ESC/POS raster byte format: MEDIUM — cross-checked web sources, not verified against an actual physical printer in this environment
- Pitfalls: HIGH for Pitfalls 1-2 (directly observed in code), MEDIUM for Pitfalls 3-4 (domain knowledge, not yet implemented/tested)
- Dot-width mapping (A1) and PDF-receipt scope (A2): LOW — explicitly flagged, needs user/planner resolution before implementation

**Research date:** 2026-08-23
**Valid until:** 30 days (stable domain — no fast-moving dependencies; re-verify crate versions if planning is delayed past ~4 weeks)
