# Phase 15: Receipt Designer (Layout, Branding & Logo Printing) - Pattern Map

**Mapped:** 2026-08-23
**Files analyzed:** 6 (modified) + 1 (new component, optional) + 1 (new shadcn component)
**Analogs found:** 6 / 6 — every touched file already has a direct in-repo analog because this phase modifies existing files, not greenfield ones.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/shared/lib/receipt-format.ts` (modify `buildThermalReceiptText`) | utility (pure formatter) | transform | itself — `buildPreChequeText` in the same file | exact (sibling function, same file) |
| `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` (add 2 inputs + preview) | component (settings form) | CRUD (draft-then-persist) | itself — existing checkbox/select fields in the same component | exact |
| `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` (new preview block, possibly extracted) | component | transform (render-only) | `src/features/process-payment/ui/ReceiptPreview.tsx` | exact |
| `src/shared/ui/textarea.tsx` (new, via shadcn CLI) | component (primitive) | — | `src/shared/ui/input.tsx` | exact (shadcn sibling primitive) |
| `src/shared/lib/pos-printer.ts` (update call site for new `settings` param) | utility | request-response (Tauri `invoke`) | itself — existing `printReceipt`/`receiptDataToPrinterLines` | exact |
| `src/shared/lib/email-receipt.ts` (update call site for new `settings` param) | utility | transform | itself — existing call site | exact |
| `src-tauri/src/commands/printer.rs` (`encode_logo_raster` + `print_receipt` signature) | native command (Rust/Tauri) | transform + file-I/O | itself — `lines_to_esc_pos()` / `write_fallback_bytes()` in the same file | role-match (same file, new function) |
| `src-tauri/src/commands/printer.rs` `#[cfg(test)] mod tests` | test (Rust) | — | `src-tauri/src/commands/logger.rs` `#[cfg(test)] mod tests` | exact (only Rust test precedent in repo) |

## Pattern Assignments

### `src/shared/lib/receipt-format.ts` — `buildThermalReceiptText` (utility, transform)

**Analog:** same file, `buildPreChequeText` (lines 114-159) and the existing `buildThermalReceiptText` itself (lines 162-241) — this is a modification, not a net-new pattern.

**Current signature to break** (`receipt-format.ts:162`):
```typescript
export function buildThermalReceiptText(receipt: ReceiptData, locale: Locale): string {
  const tr = receiptT(locale);
  const lines: string[] = [];
  ...
```
Becomes `(receipt: ReceiptData, locale: Locale, settings: ReceiptSettings)`. `settings` must be a **required** parameter (Pitfall 1 in RESEARCH.md) — no default fallback, so TS strict mode forces every call site to update.

**`LINE` becomes settings-driven** — today it's a module-level `const LINE = 32` (line 7) used by every helper (`padRight`, `centerLine`, `lineLeftRight`, `divider`, `byteWidth`-based truncation). Since `LINE` is currently a module constant referenced by free functions (not passed as a param), the smallest diff is to thread `LINE` as a parameter through `centerLine`/`lineLeftRight`/`divider`/`padRight`, or close over `settings.paperWidthChars` inside `buildThermalReceiptText` by rebuilding line-builder closures locally (mirrors how `receiptT(locale)` already returns a locale-bound closure at line 72-74 — same closure-factory pattern, reuse it).

**Existing conditional-emission precedent to copy** — `barAddress` wrapping loop (lines 171-176) is the exact pattern the UI-SPEC says to reuse for `footerText`:
```typescript
if (receipt.barAddress) {
  const addr = sanitize(receipt.barAddress);
  for (let i = 0; i < addr.length; i += LINE) {
    lines.push(padRight(addr.slice(i, i + LINE), LINE));
  }
}
```
Copy this shape verbatim for `settings.footerText` (with `divider()` before it, per RESEARCH.md Pattern 1). Do NOT use the RESEARCH.md's own `centerLine(sanitize(settings.footerText))` example — UI-SPEC explicitly flags that as wrong/truncating.

**Existing toggle-gated line precedent** — the `receipt.terminalReference` conditional (lines 220-222, 232-234) is the exact shape for `settings.showCashierName` / `showCustomerName` / `showReceiptNumber`:
```typescript
if (receipt.terminalReference) {
  lines.push(lineLeftRight(tr('receipt.ref'), receipt.terminalReference));
}
```
Apply the same `if (settings.showX) lines.push(...)` wrapper around the existing unconditional `cashier`/`customer` lines (179-180) and the existing unconditional `#${receipt.receiptNumber}` line (238).

**`headerLine2`** — single `centerLine(...)` call, same shape as the existing `barName` header line (line 170): `lines.push(centerLine(sanitize(receipt.barName) || 'Bar'));`. Insert `if (settings.headerLine2) lines.push(centerLine(sanitize(settings.headerLine2)));` right after it.

**`sanitize()` import already exists** (line 4, from `groupOrderItemsForReceipt`) — route both new fields through it per RESEARCH.md's Security Domain V5/threat-pattern note; no new import needed.

---

### `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` (component, CRUD form)

**Analog:** itself — the existing 6-checkbox `.map(...)` block (lines 137-168) and `patchReceipt` (lines 39-53).

**Existing optimistic-draft pattern to reuse verbatim** (lines 33-53):
```typescript
const [localReceipt, setLocalReceipt] = useState<ReceiptSettings | undefined>(
  () => receiptSettings
);
const receipt = localReceipt ?? receiptSettings;

function patchReceipt(patch: Partial<ReceiptSettings>) {
  if (!receipt) return;
  const next: ReceiptSettings = { ...receipt, ...patch };
  setLocalReceipt(next);
  updateReceiptSettings.mutate(next, {
    onSuccess: result => {
      if (!result.ok) {
        setLocalReceipt(receipt);
        toast.error(result.error.message);
      }
    },
  });
}
```
UI-SPEC requires splitting this for the two new text fields: `onChange` calls only `setLocalReceipt(next)` (no mutate — draft-only, drives live preview), `onBlur` calls the existing `patchReceipt(...)` (mutates). Both pieces already exist in the function above — the local-setter and the mutate-call are just currently fused; unfuse them for the two new fields only, leave checkboxes/select unchanged (they still call `patchReceipt` directly on change, per UI-SPEC Interaction Contract).

**Existing checkbox-list rendering to copy the "list of fields" idiom from** (lines 137-168) — not directly reusable for text inputs, but establishes the `receipt-${key}` id-naming and `Label htmlFor` pairing convention to match for the 2 new fields.

**New `Textarea`/`Input` field shape** — no existing text-input field in this file to copy from (all fields today are checkbox/select). Closest in-repo analog for a labeled text input with maxLength + character counter: none found in Settings tabs; use `src/shared/ui/input.tsx` directly (shadcn primitive, plain controlled `<Input>` with `value`/`onChange`/`onBlur`/`maxLength`), same `space-y-1` + `<Label htmlFor>` wrapper the `paper-width` `<select>` field already uses (lines 119-135):
```typescript
<div className="space-y-1">
  <Label htmlFor="paper-width">{t('hardwareSettingsTab.paperWidthLabel')}</Label>
  <select id="paper-width" value={receipt.paperWidthChars} onChange={...} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
```
Copy this exact wrapper div + label pairing for `headerLine2` (`<Input>`) and `footerText` (`<Textarea>`, new shadcn component).

**Live preview placement** — UI-SPEC says: inside the same `space-y-4 rounded-lg border p-4` card (line 116), after the toggle list (after line 168), before the closing `</div>` at line 169. Render via `buildThermalReceiptText(sampleReceiptData, locale, receipt)` (see `ReceiptPreview.tsx` analog below) — `receipt` here is already the draft/optimistic value (line 37), so no new state plumbing needed.

---

### Live Preview panel — `<pre>` rendering (component, transform)

**Analog:** `src/features/process-payment/ui/ReceiptPreview.tsx` (full file, 67 lines) — reuse this exact rendering fragment, not a new CSS layout.

**Core pattern to copy verbatim** (`ReceiptPreview.tsx:19,25-27`):
```typescript
const text = buildThermalReceiptText(receipt, getCurrentLocale());
// ...
<pre className="max-h-[50vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-tight whitespace-pre">
  {text}
</pre>
```
For the Settings-page preview, swap the args to `buildThermalReceiptText(sampleReceiptData, getCurrentLocale(), receipt)` where `sampleReceiptData` is a new local static fixture (per UI-SPEC: 2 items, one with a modifier line, one cash tender leg with tendered/change, receipt number, cashier+customer name populated) and `receipt` is `HardwareSettingsTab`'s existing draft state. Do not import `ReceiptPreview` itself (it has payment/email action buttons that don't belong in Settings) — only its `<pre>` fragment pattern.

**Import pattern** (`ReceiptPreview.tsx:1-8`, for reference on how this file already imports the formatter + locale helper):
```typescript
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import { getCurrentLocale } from '@shared/lib/i18n';
import { buildThermalReceiptText } from '@shared/lib/receipt-format';
```

---

### `src/shared/ui/textarea.tsx` (new shadcn primitive)

**Analog:** `src/shared/ui/input.tsx` (full file, 30 lines) — installed via `npx shadcn@latest add textarea`, but if hand-written to match this repo's existing placeholder-comment convention, copy this exact shape:
```typescript
/* eslint-disable react/prop-types */
import * as React from 'react';
import { cn } from '@shared/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
export { Input };
```
Prefer running the actual `shadcn` CLI over hand-copying — UI-SPEC explicitly names this as the install method and no vetting gate applies (`components.json` `"registries": {}`).

---

### `src/shared/lib/pos-printer.ts` / `src/shared/lib/email-receipt.ts` (call-site updates only)

**Analog:** themselves — no pattern change, just propagate the new `settings` argument.

`pos-printer.ts:21-22` (`receiptDataToPrinterLines`) and `pos-printer.ts:26` (`printReceiptWebFallback`) both call `buildThermalReceiptText(data, locale)` — each needs a `settings: ReceiptSettings` parameter threaded in from their own callers (these are plain `shared/lib` functions with no hook access — per RESEARCH.md Pattern 1, the caller must pass `settings` in, do not reach into TanStack Query cache here, that would invert FSD import direction).

`email-receipt.ts:24` — same, `receiptPlainText: buildThermalReceiptText(data, getCurrentLocale())` needs the third arg.

Both call sites currently have exactly the 2-arg call; grep confirms these are the only 3 non-test call sites of `buildThermalReceiptText` in the repo (`ReceiptPreview.tsx`, `pos-printer.ts`, `email-receipt.ts`).

---

### `src-tauri/src/commands/printer.rs` — `encode_logo_raster` (native command, transform)

**Analog:** `lines_to_esc_pos()` in the same file (lines 17-34) — same file, same "pure byte-building function consumed by `print_receipt`" role.

**Existing byte-building pattern to copy the shape of** (`printer.rs:17-34`):
```rust
fn lines_to_esc_pos(lines: &[String]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[ESC, b'@']);
    if let Some(first) = lines.first() {
        out.extend_from_slice(&[ESC, b'a', 1]);
        out.extend_from_slice(&[ESC, b'E', 1]);
        out.extend_from_slice(first.as_bytes());
        out.push(b'\n');
    }
    // ...
    out.extend_from_slice(&[GS, b'V', 0x42, 0x03]);
    out
}
```
`encode_logo_raster` should follow the identical shape: build a `Vec<u8>` starting with the ESC/POS command header bytes (`[GS, b'v', b'0', 0, xL, xH, yL, yH]`), then `extend_from_slice`/push packed data bytes — same `let mut out = Vec::new(); out.extend_from_slice(...); ... out` idiom, not a builder struct or trait.

**Existing command-entry-point pattern to extend** (`printer.rs:122-142`):
```rust
#[tauri::command(rename_all = "camelCase")]
pub fn print_receipt(lines: Vec<String>) -> Result<(), String> {
    let bytes = lines_to_esc_pos(&lines);
    #[cfg(target_os = "windows")]
    { match try_send_raw(&bytes) { Ok(()) => Ok(()), Err(e) => { eprintln!("[printer] WARNING: {e}"); write_fallback_bytes(&bytes) } } }
    #[cfg(not(target_os = "windows"))]
    { eprintln!("[printer] WARNING: non-Windows host; writing receipt bytes to temp file"); write_fallback_bytes(&bytes) }
}
```
Add `logo_data_url: Option<String>` param (camelCase rename already configured via `#[tauri::command(rename_all = "camelCase")]`, so TS side passes `logoDataUrl`); prepend `encode_logo_raster(...)` output to `bytes` before the existing `lines_to_esc_pos` bytes when `Some`, matching RESEARCH.md Pattern 3's Open Question 3 resolution (logo-always-header, single combined call). On decode/size error, follow Pitfall 4's guidance: log via the same `eprintln!("[printer] WARNING: ...")` idiom already used at lines 132/139, skip the raster block, still print text — never `panic!`/`unwrap()`.

**Error-handling pattern already established in this file** — every fallible operation returns `Result<_, String>` and uses `.map_err(|e| e.to_string())` (e.g., `write_fallback_bytes`, `try_send_raw`) — `encode_logo_raster` must return `Result<Vec<u8>, String>` and follow the same `.map_err(|e| e.to_string())` idiom for `image::load_from_memory` and base64 decode calls (see RESEARCH.md Pattern 2 example, already written in this shape).

---

### `src-tauri/src/commands/printer.rs` `#[cfg(test)] mod tests` (Rust unit test)

**Analog:** `src-tauri/src/commands/logger.rs` (lines 96-109) — the only existing Rust test precedent in the repo.

**Exact structure to copy:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_file_naming() {
        let now = Local::now();
        let expected = format!("bar-pos-{}.log", now.format("%Y-%m-%d"));
        assert!(expected.starts_with("bar-pos-"));
        assert!(expected.ends_with(".log"));
    }
}
```
Copy this `#[cfg(test)] mod tests { use super::*; #[test] fn ... { assert!/assert_eq! } }` shape at the bottom of `printer.rs`. Per RESEARCH.md Pitfall 3, write a fixture-bitmap test asserting the exact 8-byte `GS v 0` header (`1D 76 30 00 <xL> <xH> <yL> <yH>`) and packed data bytes for a small (e.g. 8x8 or 16x8) known checkerboard/solid pattern — `assert_eq!(encode_logo_raster(&fixture_bytes, 8).unwrap(), expected_vec)`.

## Shared Patterns

### Sanitization of user-entered receipt text
**Source:** `src/shared/lib/receipt-format.ts:4` (`sanitize` imported from `groupOrderItemsForReceipt`), already applied to `barName`, `barAddress`, `cashierName`, `customerName` throughout the file.
**Apply to:** `settings.headerLine2` and `settings.footerText` — both must be passed through `sanitize(...)` before being pushed into `lines`, matching every other free-text field in this formatter (RESEARCH.md Security Domain V5).

### Optimistic draft state + rollback-on-error
**Source:** `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:33-53` (`localReceipt`/`patchReceipt`).
**Apply to:** All new field mutations in this tab — the two new text inputs reuse this exact mechanism, just splitting the "set local" and "mutate" calls across `onChange`/`onBlur` instead of a single `onChange`/`onCheckedChange`.

### `<pre>`-based fixed-width receipt rendering
**Source:** `src/features/process-payment/ui/ReceiptPreview.tsx:25-27`.
**Apply to:** Any new receipt preview surface — the live-preview panel must render the exact string `buildThermalReceiptText` produces inside this exact `<pre>` class list; never approximate column widths with CSS.

### Rust `Result<_, String>` + `.map_err(|e| e.to_string())` + non-fatal `eprintln!` warning
**Source:** `src-tauri/src/commands/printer.rs` throughout (`write_fallback_bytes`, `try_send_raw`, `print_receipt`).
**Apply to:** `encode_logo_raster` and the `print_receipt` logo branch — decode/size failures must log via `eprintln!("[printer] WARNING: ...")` and degrade gracefully (skip raster, still print text), never `panic!`.

## No Analog Found

None. Every file this phase touches already exists and has a direct in-file or same-directory analog to extend (this is a "wire up + extend" phase, not greenfield, per RESEARCH.md's explicit framing).

## Metadata

**Analog search scope:** `src/shared/lib/`, `src/widgets/SettingsTabsPanel/tabs/`, `src/features/process-payment/ui/`, `src/features/upload-logo/`, `src/shared/ui/`, `src-tauri/src/commands/`
**Files scanned:** 9 (read in full: `receipt-format.ts`, `HardwareSettingsTab.tsx`, `ReceiptPreview.tsx`, `useUploadLogo.ts`, `pos-printer.ts` (partial), `email-receipt.ts` (grep), `printer.rs` (partial), `logger.rs` (partial), `input.tsx`, `domain.ts` (partial))
**Pattern extraction date:** 2026-08-23
