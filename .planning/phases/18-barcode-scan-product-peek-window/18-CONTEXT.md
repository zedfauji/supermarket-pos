# Phase 18: Barcode Scan Product Peek Window - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Scanning a barcode on `/pos` opens a separate Tauri OS window (not a modal/overlay) showing full product detail with a qty/weight input, letting the cashier inspect and choose to add-or-skip before it touches the cart. Covers window creation/lifecycle, cross-window scan relay, product detail display, qty/weight entry with existing guards, add-to-cart wiring back into the main window's cart, and rescan-replaces-content behavior.

</domain>

<decisions>
## Implementation Decisions

### Cross-window scan relay (PEEK-04)
- **D-01:** Physical scanner sends keystrokes only to the OS-focused window. Since the peek window takes focus when open, it runs its own `useBarcodeScanner` instance to capture the keystrokes, then emits a Tauri event (`emit()`) carrying the scanned code.
- **D-02:** The main `/pos` window's `CheckoutPanel` adds a listener for that emitted event, alongside its existing local `keydown`-based `useBarcodeScanner` call, and treats a received event identically to a locally-captured scan (sets `search` the same way). No Rust/native keyboard-hook code — pure frontend, reuses the existing hook as-is on both sides.

### Window lifecycle
- **D-03:** Single persistent peek window (fixed label, e.g. `"peek"`), created once and kept alive — not destroyed/recreated per scan. Opening on first scan creates it; subsequent scans while it's open just swap its content via the same event channel (no flicker, no window-creation overhead). "Close" and "Add to Cart" hide/reset it rather than destroying the window instance.

### Add-to-cart wiring
- **D-04:** Peek window emits an `add-to-cart` Tauri event carrying `{ product, qty | weightGrams }`. Main window's `CheckoutPanel` (or `cartStore` init) listens and calls the existing cart mutation path (`addItem` / weight-item logic) — cart mutation logic stays exclusively in the main window; the peek window is a data-entry-only surface with no direct cart-store access.

### Guard & input reuse (PEEK-02)
- **D-05:** Peek window composes the *existing* checkout building blocks, not new/simplified versions: `getProductRiskFlag` + `useConfirmRiskyAdd` for the risky-add (out-of-stock / near-expiry) confirmation gate, `WeightEntryDialog` + `useAddLooseWeightItem` for loose-weight products, and a plain qty stepper for piece-counted products. These are the same pieces `ProductGrid.tsx` already uses for the main checkout flow — composed inside the peek window's own React root, not duplicated.

### Claude's Discretion
- Exact Tauri event names/payload shapes, window creation API (`@tauri-apps/api/webviewWindow` `WebviewWindow`, already available in the installed `@tauri-apps/api ^2` — no new plugin dependency), and required `core:webview`/`core:window` capability permissions to add to `src-tauri/capabilities/default.json` (currently scoped to `"windows": ["main"]` only — peek window's own capability entry needed).
- Whether the peek window mounts the full Vite/React app (routed to a dedicated `/peek` path) or a minimal standalone entry — planner's call based on Tauri multi-window + Vite research.
- Peek window's visual layout (field ordering, photo placement/fallback when `imageUrl` is null) — no specific reference given by user, standard approach expected.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` (PEEK-01..04) — full requirement text
- `.planning/ROADMAP.md` § Phase 18 — success criteria and depends-on note

### Existing code this phase reuses
- `src/shared/lib/useBarcodeScanner.ts` — USB HID keystroke-buffering hook; reused as-is in both windows
- `src/entities/product/model/productRiskFlag.ts` (`getProductRiskFlag`) — out-of-stock/near-expiry risk detection
- `src/entities/product/model/useConfirmRiskyAdd.ts` — risky-add confirmation gate
- `src/features/add-loose-weight-item/model/useAddLooseWeightItem.ts` + `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` — weight entry for loose-weight products
- `src/widgets/ProductGrid/ui/ProductGrid.tsx` — current reference implementation of scan→select→guard→add flow (`selectProduct` function is the pattern to mirror)
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` — main window's cart owner; where the new event listeners attach
- `src-tauri/tauri.conf.json` — current single-window config (`app.windows[0]`, no `"peek"` entry yet)
- `src-tauri/capabilities/default.json` — capability currently scoped to `"windows": ["main"]`; peek window needs its own entry

No external specs beyond REQUIREMENTS.md/ROADMAP.md — requirements fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useBarcodeScanner` — generic keydown-buffering hook, already used twice (CheckoutPanel today); safe to instantiate a third time in the peek window
- `getProductRiskFlag` / `useConfirmRiskyAdd` / `WeightEntryDialog` / `useAddLooseWeightItem` — the entire existing add-to-cart guard/entry pipeline, directly reusable
- `@tauri-apps/api ^2` (already a dependency) — includes `webviewWindow` module for creating/managing additional OS windows and the `event` module for `emit`/`listen`; no new package needed

### Established Patterns
- Scanner input is captured via `window.addEventListener('keydown')`, filtered to ignore focused editable elements, buffered until `Enter` — this pattern must be preserved in the peek window's own instance, not reinvented
- Cart mutations flow through Zustand `cartStore` accessed only from within the main window's React tree — peek window cannot reach that store directly (separate JS/webview context), hence the event-relay decision (D-04)
- Risky-add confirmation is already decoupled from the grid (`ProductGrid.selectProduct`) as a reusable `commit`-callback pattern — same shape works inside the peek window

### Integration Points
- New Tauri event channel(s) for: peek→main scan-relay (D-01/D-02) and peek→main add-to-cart (D-04)
- `src-tauri/tauri.conf.json` needs a second window definition (or the peek window created dynamically via `WebviewWindow` API at runtime — planner to decide which)
- `src-tauri/capabilities/default.json` needs a capability entry granting the peek window the permissions it needs (window create/show/hide, event emit/listen)

</code_context>

<specifics>
## Specific Ideas

No specific visual/reference examples given — user deferred window layout and Tauri API mechanics to Claude's discretion, but was explicit and firm on the three architectural decisions (D-01/D-02 relay, D-03 window reuse, D-04 event-based cart wiring, D-05 component reuse — no duplication).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 18-Barcode Scan Product Peek Window*
*Context gathered: 2026-08-26*
