# Phase 18: Barcode Scan Product Peek Window - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-26
**Phase:** 18-Barcode Scan Product Peek Window
**Areas discussed:** Cross-window scan relay, Window lifecycle, Add-to-cart wiring, Guard & input reuse

---

## Cross-window scan relay (PEEK-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Peek window relays via Tauri event | Peek window's own `useBarcodeScanner` captures the keystrokes (since it's focused), then `emit()`s a Tauri event with the code; main window listens alongside its own local listener | ✓ |
| Global OS-level keyboard hook (Rust) | Rust backend captures scanner keystrokes globally, broadcasts to all webviews — heavier, new Rust dependency | |
| You decide | Claude picks based on research | |

**User's choice:** Peek window relays via Tauri event
**Notes:** No Rust changes; pure frontend, reuses existing `useBarcodeScanner` hook on both sides.

---

## Window lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Single persistent window, content swapped | Create once, keep alive; rescan updates content via event; close/add-to-cart hides rather than destroys | ✓ |
| Destroy and recreate per scan | Simpler mental model but risks flicker and repeated creation overhead | |

**User's choice:** Single persistent window, content swapped
**Notes:** Matches PEEK-04's "replaces its content" wording; avoids window-creation overhead on every scan.

---

## Add-to-cart wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri event: peek emits, main window's cartStore listens | Peek emits `add-to-cart` event with product+qty/weight; main window's CheckoutPanel/cartStore listener performs the mutation | ✓ |
| You decide | Claude picks the concrete event/channel shape during planning | |

**User's choice:** Tauri event: peek emits, main window's cartStore listens
**Notes:** Cart mutation logic stays exclusively in the main window; peek window has no direct store access (separate JS context).

---

## Guard & input reuse (PEEK-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing pieces as-is | `getProductRiskFlag` + `useConfirmRiskyAdd`, `WeightEntryDialog`/`useAddLooseWeightItem`, plain qty stepper — same components CheckoutPanel/ProductGrid already use | ✓ |
| You decide | Claude composes based on peek window's single-product context | |

**User's choice:** Reuse existing pieces as-is
**Notes:** No duplicate guard implementation — mirrors `ProductGrid.selectProduct`'s existing commit-callback pattern.

---

## Claude's Discretion

- Exact Tauri event names/payload shapes
- Window creation API details (`WebviewWindow` at runtime vs. static `tauri.conf.json` window entry) and required capability permissions
- Whether peek window mounts the full app at a `/peek` route or a minimal standalone entry
- Peek window visual layout (field ordering, photo fallback)

## Deferred Ideas

None — discussion stayed within phase scope.
