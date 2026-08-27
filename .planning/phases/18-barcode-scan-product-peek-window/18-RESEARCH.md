# Phase 18: Barcode Scan Product Peek Window - Research

**Researched:** 2026-08-26
**Domain:** Tauri 2 multi-window (`WebviewWindow`), cross-window event relay, capability/ACL permissions, reuse of existing checkout guard/entry components in a second React root
**Confidence:** HIGH (all core mechanics verified directly against the installed `@tauri-apps/api@2.10.1` source, this repo's generated ACL manifest, and this repo's own source files — not training-data guesses)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Physical scanner sends keystrokes only to the OS-focused window. Since the peek window takes focus when open, it runs its own `useBarcodeScanner` instance to capture the keystrokes, then emits a Tauri event (`emit()`) carrying the scanned code.
- **D-02:** The main `/pos` window's `CheckoutPanel` adds a listener for that emitted event, alongside its existing local `keydown`-based `useBarcodeScanner` call, and treats a received event identically to a locally-captured scan (sets `search` the same way). No Rust/native keyboard-hook code — pure frontend, reuses the existing hook as-is on both sides.
- **D-03:** Single persistent peek window (fixed label, e.g. `"peek"`), created once and kept alive — not destroyed/recreated per scan. Opening on first scan creates it; subsequent scans while it's open just swap its content via the same event channel (no flicker, no window-creation overhead). "Close" and "Add to Cart" hide/reset it rather than destroying the window instance.
- **D-04:** Peek window emits an `add-to-cart` Tauri event carrying `{ product, qty | weightGrams }`. Main window's `CheckoutPanel` (or `cartStore` init) listens and calls the existing cart mutation path (`addItem` / weight-item logic) — cart mutation logic stays exclusively in the main window; the peek window is a data-entry-only surface with no direct cart-store access.
- **D-05:** Peek window composes the *existing* checkout building blocks, not new/simplified versions: `getProductRiskFlag` + `useConfirmRiskyAdd` for the risky-add (out-of-stock / near-expiry) confirmation gate, `WeightEntryDialog` + `useAddLooseWeightItem` for loose-weight products, and a plain qty stepper for piece-counted products. These are the same pieces `ProductGrid.tsx` already uses for the main checkout flow — composed inside the peek window's own React root, not duplicated.

### Claude's Discretion
- Exact Tauri event names/payload shapes, window creation API (`@tauri-apps/api/webviewWindow` `WebviewWindow`, already available in the installed `@tauri-apps/api ^2` — no new plugin dependency), and required `core:webview`/`core:window` capability permissions to add to `src-tauri/capabilities/default.json` (currently scoped to `"windows": ["main"]` only — peek window's own capability entry needed).
- Whether the peek window mounts the full Vite/React app (routed to a dedicated `/peek` path) or a minimal standalone entry — planner's call based on Tauri multi-window + Vite research.
- Peek window's visual layout (field ordering, photo placement/fallback when `imageUrl` is null) — no specific reference given by user, standard approach expected (resolved separately by the approved 18-UI-SPEC.md).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Summary

This phase's hard part is not the product-detail UI (UI-SPEC already fully specifies that as a pure composition of existing components) — it is **wiring a second native OS window into a codebase that has only ever had one**. Three things had to be verified from scratch since there is no in-repo precedent: (1) exactly which Tauri v2 capability permissions are missing for window creation and must be added, (2) a race-free protocol for getting the *first* scanned barcode into a not-yet-created window without losing the event, and (3) how this can be asserted by Playwright at all, given this project's E2E suite drives a plain Chromium browser against the Vite dev server — not the packaged Tauri binary — so there is no real Tauri IPC backend to service `WebviewWindow` creation or `emit`/`listen` during a test run.

All three are solvable without new dependencies: `@tauri-apps/api ^2` (already installed, resolved to `2.10.1`) ships `webviewWindow.ts`/`event.ts` with everything needed. The capability gap is a one-file edit (`src-tauri/capabilities/default.json`): extend `"windows"` to include `"peek"` and add five explicit permission strings that `core:default`'s bundled defaults do **not** grant (window creation, close/hide/show/focus). The first-scan race is avoided by passing the initial barcode as a URL query parameter at window-creation time (synchronous, no listener needed) and reserving the Tauri event channel purely for *rescans* (both windows are guaranteed alive by then). The E2E gap is solved by extending this repo's own already-established `window.__TAURI_INTERNALS__.invoke` mock pattern (used today in `e2e/receipts/*.spec.ts`) with a `BroadcastChannel`-backed fake event bus, plus a second Playwright `page` (via `context.newPage()`) standing in for the second OS window — same-origin same-browser-context pages can genuinely pass messages via `BroadcastChannel`, which is the closest same-process analog to Tauri's real cross-window event relay.

**Primary recommendation:** Create the peek window lazily on first scan via `new WebviewWindow('peek', { url: '/?window=peek&barcode=<code>', ... })` (no static entry in `tauri.conf.json`); branch `main.tsx` on `?window=peek` to mount a `PeekApp` root (same `AppConfigProvider`/`Providers` shell as `App.tsx`, minus `Router`); use one event name (`barcode-scanned`) for rescans and one (`add-to-cart`) for commit, both plain `emit`/`listen` (no `emitTo` needed, since only one side of each channel ever listens); hide (never destroy) on Close; extend `WeightEntryDialog` with an optional `onConfirm` override so the peek window can reuse it without writing to the wrong (peek-local) cart store instance.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Peek window creation/lifecycle (open, show, hide, focus) | Frontend (main window's JS, via `@tauri-apps/api/webviewWindow`) | Tauri Rust core (services the IPC command) | No custom Rust command needed — the JS `WebviewWindow` API already issues `plugin:webview|create_webview_window` / `plugin:window|*` commands that Tauri's built-in core plugin services; nothing to write in `src-tauri/src/` |
| Cross-window event relay (scan-relay, add-to-cart) | Frontend (both windows, via `@tauri-apps/api/event`) | Tauri Rust core (`plugin:event|*`) | Same as above — `core:event` is a built-in plugin, not a custom command |
| Product detail fetch (exact barcode lookup) | Peek window's own React tree (`useLookupProductByBarcode`) | Supabase (`products` table + RLS) | UI-SPEC already mandates the peek window re-fetches independently (separate query-cache context) rather than reading main's cache |
| Cart mutation (`addItem`/`addWeightedItem`) | Main window's `cartStore` (Zustand) exclusively | — | D-04 locked: peek window has no cart-store access (separate JS heap); it only emits a data payload |
| Risky-add guard, qty/weight entry UI | Peek window's own React tree, composing existing `entities/product` + `features/add-loose-weight-item` pieces | — | D-05 locked: reuse, not reimplementation |
| Capability/permission grants | `src-tauri/capabilities/default.json` (declarative ACL) | — | Tauri v2's security model — no code can bypass this; missing permissions fail silently or throw at the `invoke()` boundary |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PEEK-01 | Scanning opens a separate Tauri OS window showing name, size/unit, photo, price, inventory, SKU, barcode | `WebviewWindow` creation pattern below; `Product` schema fields confirmed in `src/shared/lib/domain.ts` (no separate kg/g/L unit enum exists — `soldByWeight: boolean` is the only unit-type signal, see Pitfall 5) |
| PEEK-02 | Qty/weight input matching unit type, reuses existing out-of-stock/near-expiry guards | `getProductRiskFlag` + `useConfirmRiskyAdd` + `QuantityControl`/`WeightEntryDialog` reuse pattern below (mirrors `ProductGrid.selectProduct`) |
| PEEK-03 | "Add to Cart" adds entered amount + closes; "Close" dismisses without change | `add-to-cart` event pattern + hide-not-destroy lifecycle below |
| PEEK-04 | Rescan while open replaces content; main window's own scan-to-search still fires | Dual-listener `barcode-scanned` event pattern below; race-condition pitfall (Pitfall 1) |

## Package Legitimacy Audit

**Not applicable this phase.** No new npm or Cargo packages are introduced. `@tauri-apps/api` is already a dependency (`^2`, resolved locally to `2.10.1` — confirmed via `node_modules/@tauri-apps/api/package.json`) and already includes the `webviewWindow` and `event` submodules this phase needs. No `npm install` step belongs in this phase's plan.

## Standard Stack

### Core (already installed — no version change needed)

| Library | Version (verified locally) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/api` | `2.10.1` [VERIFIED: `node_modules/@tauri-apps/api/package.json`] | `WebviewWindow` class (window+webview creation) via `@tauri-apps/api/webviewWindow`; `emit`/`listen`/`emitTo` via `@tauri-apps/api/event`; `getCurrentWebviewWindow()` for the peek window's own self-reference (hide/close/listen) | This is Tauri's own official multi-window API — there is no alternative library for this in the Tauri ecosystem |
| `tauri` (Rust crate) | `2` [VERIFIED: `src-tauri/Cargo.toml`] | Backend that services the window/event IPC commands | Already the app's runtime; no Rust code changes needed for this phase (window creation, capability grants, and event relay are all handled by Tauri's built-in `core:window`/`core:webview`/`core:event` plugins — no custom `#[tauri::command]` required) |

No supporting/alternative libraries apply — this is a platform-API feature, not a domain problem with competing solutions.

**Installation:** None required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────── Main window (label: "main") ───────────────────────────────┐
│                                                                                              │
│  USB scanner keydown ──> useBarcodeScanner ──> CheckoutPanel.onScan(code)                   │
│                                                        │                                     │
│                                                        ├─> setSearch(code)   [UNCHANGED]     │
│                                                        │                                     │
│                                                        └─> ensurePeekWindow(code)             │
│                                                              │                               │
│                                          ┌───────────────────┴────────────────────┐          │
│                                          │ getByLabel('peek') === null?           │          │
│                                          │  YES → new WebviewWindow('peek', {     │          │
│                                          │         url: `/?window=peek&barcode=   │          │
│                                          │              ${code}` })               │          │
│                                          │  NO  → show(); setFocus();             │          │
│                                          │         emit('barcode-scanned',{code}) │          │
│                                          └────────────────────────────────────────┘          │
│                                                                                              │
│  listen('barcode-scanned') ──────────────────────────────────┐  (only fires when the        │
│    on receipt: setSearch(code) — same call as local scan      │   PEEK window captured the   │
│                                                                 │   keystrokes, see Pitfall 1) │
│  listen('add-to-cart') ──> cartStore.addItem / addWeightedItem │                              │
│                                                                                              │
└──────────────────────────────────────────────────────────────┼─────────────────────────────┘
                                                                 │ Tauri event bus
                                                                 │ (plugin:event|emit + listen,
                                                                 │  backend-relayed to all
                                                                 │  windows with a listener)
┌────────────────────────────────────────────────────────────────┼── Peek window (label: "peek") ─┐
│                                                                  │                                │
│  Mount: read `?barcode=` from location.search (FIRST scan only)  │                                │
│    ──> useLookupProductByBarcode().lookup(code) ──> render       │                                │
│                                                                  │                                │
│  USB scanner keydown (peek has OS focus now) ──> useBarcodeScanner│                               │
│    ──> local: useLookupProductByBarcode().lookup(code) ──> re-render (PEEK-04)                    │
│    ──> emit('barcode-scanned', {code}) ─────────────────────────┘ (relay to main, D-01/D-02)      │
│                                                                                                    │
│  getProductRiskFlag(product) → flagged? → useConfirmRiskyAdd(...) → commit                        │
│    commit (piece): build {product, qty} ──> emit('add-to-cart', payload) ──> hide()               │
│    commit (weight): open WeightEntryDialog (onConfirm override) ──> emit('add-to-cart', payload)  │
│                                                                                                    │
│  "Close" button ──> getCurrentWebviewWindow().hide()   [never .close()/.destroy() — D-03]         │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── main.tsx                          # branch on ?window=peek → <PeekApp/> vs <App/>
├── app/
│   ├── App.tsx                       # unchanged — main window's existing tree
│   └── PeekApp.tsx                   # NEW — reuses AppConfigProvider+Providers, no Router
├── widgets/
│   └── ProductPeekWindow/
│       └── ui/ProductPeekWindow.tsx  # NEW — the window's root component (UI-SPEC layout)
├── features/
│   ├── open-product-peek-window/     # NEW — main-side: ensurePeekWindow(code), listen('add-to-cart')
│   │   └── model/useProductPeekWindow.ts
│   └── add-loose-weight-item/
│       └── ui/WeightEntryDialog.tsx  # MODIFIED — optional onConfirm override prop
└── shared/lib/
    └── tauriPeekEvents.ts            # NEW (optional) — typed emit/listen wrappers for
                                       #   'barcode-scanned' and 'add-to-cart' payload shapes
src-tauri/
└── capabilities/default.json         # MODIFIED — windows: ["main","peek"] + 5 new permissions
```

### Pattern 1: Lazy window creation with race-free first-payload delivery

**What:** Create the peek window only on the first scan (not declared in `tauri.conf.json`), passing the initial barcode via the creation URL's query string rather than a post-creation event.

**When to use:** Any time the *very first* payload must reach a window whose JS hasn't mounted (and therefore hasn't registered an event listener) yet.

**Why not just `emit()` right after construction:** Tauri events are not buffered for listeners that don't exist yet — `WebviewWindow`'s constructor returns before the new webview's JS bundle has loaded, let alone called `listen()`. An `emit()` fired immediately after `new WebviewWindow(...)` races the new window's bootstrap and can be lost. Passing data via the creation URL sidesteps the race entirely because the new window reads it synchronously from `location.search` on its own first render — no listener required.

```typescript
// Source: @tauri-apps/api/webviewWindow (node_modules/@tauri-apps/api/webviewWindow.d.ts,
// constructor + getByLabel, verified 2.10.1) — features/open-product-peek-window
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';

async function ensurePeekWindowShown(code: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel('peek');
  if (existing === null) {
    // First scan ever (or first since app launch) — window doesn't exist.
    // Pass the barcode via the URL; PeekApp reads it on mount. No event race.
    new WebviewWindow('peek', {
      url: `/?window=peek&barcode=${encodeURIComponent(code)}`,
      title: 'Product Details', // static per UI-SPEC copy contract, set once
      width: 480,
      height: 720,
      minWidth: 400,
      minHeight: 600,
      resizable: true,
      center: true,
    });
    return;
  }
  // Window already exists (possibly hidden after a prior "Close") — reuse it.
  await existing.show();
  await existing.setFocus();
  // Both windows are guaranteed to be alive and listening by this point —
  // this is the only path where a post-creation emit is safe.
  await emit('barcode-scanned', { code });
}
```

### Pattern 2: Bidirectional single-channel scan relay (D-01/D-02, satisfies PEEK-04's "main still fires")

**What:** Both windows run their own `useBarcodeScanner` instance (as decided in CONTEXT.md). Whichever window has OS focus captures the raw keystrokes and (a) handles the scan locally exactly as it does today, and (b) relays the raw code to the other window over one shared event name.

**Peek side (own capture → local update + relay to main):**
```typescript
// Source: existing src/shared/lib/useBarcodeScanner.ts (reused as-is, D-01) +
// @tauri-apps/api/event (verified: node_modules/@tauri-apps/api/event.js calls
// invoke('plugin:event|emit', ...) — confirmed at runtime, not just typed)
import { emit, listen } from '@tauri-apps/api/event';
import { useBarcodeScanner } from '@shared/lib/useBarcodeScanner';
import { useLookupProductByBarcode } from '@features/lookup-product-by-barcode/model/useLookupProductByBarcode';

function useProductPeekScanner(onProduct: (code: string) => void) {
  useBarcodeScanner({
    onScan: (code) => {
      onProduct(code);            // local: re-fetch + re-render this window (PEEK-04)
      void emit('barcode-scanned', { code }); // relay so main's `search` stays in sync
    },
  });
}
```

**Main side (existing local capture UNCHANGED, plus one new listener):**
```typescript
// CheckoutPanel.tsx — additive, does not touch the existing useBarcodeScanner call
useEffect(() => {
  const unlistenPromise = listen<{ code: string }>('barcode-scanned', (event) => {
    setSearch(event.payload.code); // identical call to the existing local onScan (D-02)
  });
  return () => {
    void unlistenPromise.then((unlisten) => { unlisten(); });
  };
}, []);
```

Note the asymmetry is intentional: main's *local* scan handler additionally calls `ensurePeekWindowShown` (Pattern 1); peek's *local* scan handler does not need an equivalent "ensure main is shown" step, since main always exists.

### Pattern 3: `WeightEntryDialog` optional confirm override (resolves the UI-SPEC's flagged open question)

**What:** `WeightEntryDialog` currently calls `useCartStore(state => state.addWeightedItem)` directly (verified: `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:36-37`). Under D-04, the peek window's own bundle has a *different* Zustand module instance — calling that store would write to a cart nobody ever reads from. Add an optional `onConfirm` prop; default behavior (main window, `ProductGrid`, `CheckoutPanel`'s existing edit-weight usage) is **unchanged**.

```typescript
// WeightEntryDialogProps — additive, backward compatible
export interface WeightEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  mode: 'add' | 'edit';
  initialWeightGrams?: number;
  tempId?: string;
  /** Overrides the default cartStore.addWeightedItem/updateWeightedItem call.
   *  Used by the peek window (D-04: no direct cart-store access there). */
  onConfirm?: (weightGrams: number) => void;
}

// inside confirm():
const confirm = () => {
  if (!isValid) return;
  if (onConfirm) {
    onConfirm(weightGrams);
  } else if (mode === 'edit' && tempId) {
    updateWeightedItem(tempId, weightGrams);
  } else {
    addWeightedItem(product, weightGrams);
  }
  onOpenChange(false);
};
```
Peek window passes `onConfirm={(weightGrams) => { void emit('add-to-cart', { product, weightGrams }); void getCurrentWebviewWindow().hide(); }}`.

### Pattern 4: Capability grant (the one required `src-tauri/` change)

**What:** `src-tauri/capabilities/default.json` currently scopes `"windows": ["main"]` (verified) with `permissions: ["core:default", ...]`. `core:default` bundles `core:window:default` and `core:webview:default` (verified via `src-tauri/gen/schemas/acl-manifests.json`'s `default_permission` entries) — **neither includes window creation, close, hide, show, or set-focus.** `core:event:default` (also bundled in `core:default`) *does* already include `allow-emit`/`allow-listen`/`allow-emit-to`/`allow-unlisten` — the event relay in Patterns 1–3 needs **no new event permission**, only the window/webview lifecycle calls do.

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main and peek windows",
  "windows": ["main", "peek"],
  "permissions": [
    "core:default",
    "core:webview:allow-create-webview-window",
    "core:window:allow-close",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "opener:default",
    "dialog:allow-save",
    "fs:allow-write-file",
    "notification:default",
    "updater:default",
    "process:allow-restart"
  ]
}
```
[VERIFIED: `src-tauri/gen/schemas/acl-manifests.json` — exact permission identifiers `allow-create-webview-window` (under `core:webview`), `allow-close`/`allow-hide`/`allow-show`/`allow-set-focus` (under `core:window`) confirmed present in that plugin's full permission list]

Without adding `"peek"` to `windows`, the peek webview has **zero** granted permissions (capabilities are matched by window label) — its own `hide()`/`listen()`/`emit()` calls would be silently denied even though `core:default` is already in the permissions array.

### Anti-Patterns to Avoid
- **Declaring the peek window statically in `tauri.conf.json`'s `app.windows` array.** That creates (and pays webview-process memory cost for) a second window on every app launch, even when no barcode is ever scanned. Create it lazily on first use (Pattern 1) — matches D-03's "created once and kept alive," not "created at boot."
- **Emitting the initial product payload as a Tauri event right after `new WebviewWindow(...)`.** Race condition — see Pattern 1.
- **Giving the peek window direct `cartStore` access "for simplicity."** It is a separate JS module instance in a separate webview process; a direct import compiles fine and silently does nothing useful (writes to a cart nobody reads). This is explicitly locked out by D-04.
- **A second `/peek` route relying on Tauri's production static-asset server to fall back to `index.html` for unknown sub-paths.** This is a real, currently-open gap in Tauri v2 (confirmed via `tauri-apps/tauri#10931` — a user reports exactly this: packaged Tauri + client-side router, direct sub-path navigation fails with no built-in SPA fallback, unlike a dev server or an Nginx-fronted deployment). Using a query parameter on the **existing root path** (`/?window=peek&barcode=...`) instead of a new pathname sidesteps this risk entirely, since the root path is always served. See Pitfall 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Out-of-stock / near-expiry confirmation gate | A second toast/dialog for the peek window | `getProductRiskFlag` + `useConfirmRiskyAdd` (verbatim, same import) | D-05 locked; also these already handle the 44px touch-target exception and zero-price vs. low-stock copy differences correctly |
| Loose-weight numeric entry (keypad, kg formatting, line-total preview) | A simplified peek-window-only weight input | `WeightEntryDialog` + Pattern 3's `onConfirm` override | Re-deriving the keypad/backspace/`.`-guard logic would duplicate ~70 lines of already-correct, already-tested code for zero benefit |
| Exact barcode → product lookup | A new Supabase query in the peek window | `useLookupProductByBarcode` (`features/lookup-product-by-barcode`) | Already handles the is_active filter, the query-cache fast path, and error logging; UI-SPEC's "cold cache, frequent loading state" note already assumes this hook's cache-miss path will be hit every time in the peek window |
| Stock tier badge (`inv_in_stock`/`inv_low_stock`/`inv_out_of_stock`) | A copy-pasted 3-line tier function | Inline a tiny `Product`-typed equivalent of `stockTier()` (`src/entities/inventory/ui/InventoryRow.tsx:37-42`) — that exact function is **not exported** and operates on the `Inventory` type (non-optional fields), not `Product` (optional `quantityOnHand`/`lowStockThreshold`), so it cannot be imported as-is | 3 lines, not worth extracting a shared abstraction for one caller — but do reuse the *same three comparisons and tier names* rather than inventing new ones, so `StatusBadge` renders identically to every other screen |

**Key insight:** every domain-logic piece this phase needs already exists in the codebase; the only genuinely new code is the window-plumbing and layout. Resist the urge to "simplify" by copying guard/dialog logic instead of importing it — that is where accidental behavior drift (e.g. a different low-stock threshold comparison) would sneak in.

## Common Pitfalls

### Pitfall 1: First-scan event race (window doesn't exist yet)
**What goes wrong:** `emit()` called immediately after `new WebviewWindow(...)` is lost because the new window's JS hasn't mounted/listened yet.
**Why it happens:** `WebviewWindow`'s constructor is fire-and-forget from the JS side (webview provisioning happens asynchronously in the Rust core); Tauri does not queue events for not-yet-registered listeners.
**How to avoid:** Pass the first barcode via the creation URL's query string (Pattern 1); reserve the event channel for scans after both windows are confirmed alive.
**Warning signs:** The peek window opens but is stuck on the loading skeleton or shows a blank/not-found state on the very first scan, while every scan after that works fine.

### Pitfall 2: Sub-path SPA routing 404 in a packaged (non-dev) Tauri build
**What goes wrong:** A dedicated React Router route (e.g. `/peek`) works fine in `npm run dev` (Vite's dev server has built-in SPA fallback) but 404s when the peek window is created against a production `tauri build` binary, because Tauri's asset protocol has no automatic index.html fallback for unmatched paths.
**Why it happens:** Confirmed via `tauri-apps/tauri` GitHub issue #10931 — a maintainer-unresolved report of exactly this symptom (packaged Tauri + client-side router + direct sub-path navigation).
**How to avoid:** Don't introduce a new pathname at all. Use the existing root path (`/`) with a `?window=peek` query parameter, branching in `main.tsx`/`App.tsx` before any router renders (Pattern in Architecture Patterns / Recommended Project Structure).
**Warning signs:** Peek window works in `npm run dev`/`npm run tauri dev` but shows a blank/error window when tested against `npm run build` + `npm run tauri build` (or is untested against a production build at all — this is a real gap the plan's verification step should close).

### Pitfall 3: Missing capability entry for the `"peek"` window label
**What goes wrong:** `getCurrentWebviewWindow().hide()`, `.listen()`, or `.emit()` calls made from *inside* the peek window's own React code fail (silently rejected promise, or a console permission-denied error) even though `core:default` is already granted — because that grant is scoped to `"windows": ["main"]` only.
**Why it happens:** Tauri v2's capability system matches permissions by window label, not globally per-app. A new window label starts with zero permissions until explicitly added to some capability's `windows` array.
**How to avoid:** Pattern 4 above — add `"peek"` to the `windows` array in the same capability object (simplest: one shared capability covering both labels, rather than a second capability file).
**Warning signs:** Main window can create the peek window fine, but the peek window's own "Close" button does nothing, or its own scan-relay `emit()` throws.

### Pitfall 4: Duplicate window creation on rapid re-scans
**What goes wrong:** Calling `new WebviewWindow('peek', ...)` a second time while a window with that label already exists throws (Tauri enforces unique labels) rather than updating the existing one.
**Why it happens:** Not checking `WebviewWindow.getByLabel('peek')` before constructing.
**How to avoid:** Always check `getByLabel` first (Pattern 1); if non-null, `show()` + `setFocus()` + `emit()` instead of constructing again.
**Warning signs:** A rapid double-scan (or a scan immediately followed by another before the first window finishes provisioning) throws an unhandled promise rejection in the main window's console.

### Pitfall 5: Assuming a distinct kg/g/L unit enum exists
**What goes wrong:** Building a new "unit type" field or a liter-specific display path that doesn't correspond to anything in the actual schema.
**Why it happens:** The phase description's "size/unit (kg/g/L/piece)" phrasing reads like an enum, but `ProductSchema` (verified: `src/shared/lib/domain.ts:227-262`) only has `soldByWeight: boolean` — there is no stored L/kg/g distinction; `WeightEntryDialog` always works in kilograms (converting to grams internally) regardless of what the product is "actually" measured in.
**How to avoid:** Treat unit type as strictly binary — `soldByWeight` → weight path (kg, via `WeightEntryDialog`); otherwise → piece path (`QuantityControl`). This matches the already-approved UI-SPEC copy (`unitWeight` = "Sold by weight (kg)", `unitPiece` = "Sold by piece" — only two variants, not four).
**Warning signs:** A plan task that mentions adding a `unit` enum/column to the products table — out of scope and unnecessary for this phase.

### Pitfall 6: Auth/session assumption for the peek window's own Supabase queries
**What goes wrong:** The peek window's own `useLookupProductByBarcode` call (a fresh Supabase client module instance in a separate webview) fails RLS-protected reads because it isn't authenticated, even though the cashier is already logged in on the main window.
**Why it happens/what's actually likely:** Separate `WebviewWindow` instances of the *same* Tauri app typically share the same underlying webview data partition (same origin storage — `localStorage`/`IndexedDB` — is not per-window on Windows WebView2 or macOS WKWebView by default), so Supabase-js's default `localStorage`-backed session persistence should restore the same session automatically in the peek window without any extra plumbing. **This claim is `[ASSUMED]`** — it is standard WebView2/WKWebView behavior, not something verified against a running Tauri process this session (no Tauri dev server / packaged binary was launched during research).
**How to avoid:** Add an explicit verification task early in the plan (open the peek window in a real `tauri dev` run and confirm the product query succeeds without a fresh login) rather than discovering this at final verification. If session restore is NOT automatic, the fallback is to pass a short-lived access token via the creation URL query string alongside `barcode`.
**Warning signs:** Peek window renders the "Couldn't load product details" error state on every scan in a real dev/build run, but the main window's own product queries work fine.

## Code Examples

### Peek window entry branching (`main.tsx`)
```typescript
// Source: existing src/main.tsx (verified) — additive branch, no change to the
// existing App path when ?window=peek is absent
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/lib/i18n';
import { App } from './app/App';
import { PeekApp } from './app/PeekApp'; // NEW
import './app/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

const isPeek = new URLSearchParams(window.location.search).get('window') === 'peek';

createRoot(rootEl).render(
  <StrictMode>{isPeek ? <PeekApp /> : <App />}</StrictMode>
);
```

### `PeekApp.tsx` shell (reuses the same provider stack, skips the router)
```typescript
// Source: mirrors src/app/App.tsx (verified) minus Router/HelpSheet/AgentButton/
// AgentPanel/OfflineBanner/ClockDriftBanner — this window has no navigation and
// no offline-cart concerns of its own (D-04: no cart access at all)
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { AppConfigProvider } from './AppConfigProvider';
import { Providers } from './providers';
import { ProductPeekWindow } from '@widgets/ProductPeekWindow/ui/ProductPeekWindow';

export function PeekApp() {
  return (
    <ErrorBoundary>
      <AppConfigProvider>
        <Toaster richColors position="top-right" />
        <Providers>
          <ProductPeekWindow />
        </Providers>
      </AppConfigProvider>
    </ErrorBoundary>
  );
}
```

### E2E: simulating a second OS window with a `BroadcastChannel`-backed Tauri IPC mock

This is the one genuinely new pattern this phase needs for its E2E tests (there is no existing multi-window Playwright spec anywhere in `e2e/`). It extends the exact mock shape already used in `e2e/receipts/reprint.spec.ts` / `pdf-delivery.spec.ts` (`window.__TAURI__` + `window.__TAURI_INTERNALS__.invoke`), adding handlers for the three additional IPC commands this phase's JS calls, and bridging `emit`/`listen` across the two Playwright `Page`s via `BroadcastChannel` (same-origin, same browser context — the closest same-process analog to Tauri's real cross-window event relay, since both pages load `http://localhost:1520`).

```typescript
// e2e/helpers/tauriPeekMock.ts (NEW)
// Confirmed exact IPC command strings by reading node_modules/@tauri-apps/api's
// compiled .js sources (not just the .d.ts) this session:
//   webviewWindow.js  -> invoke('plugin:webview|create_webview_window', ...)
//   window.js         -> invoke('plugin:window|close'|'hide'|'show'|'set_focus', ...)
//   event.js          -> invoke('plugin:event|listen'|'unlisten'|'emit'|'emit_to', ...)
import type { Page } from '@playwright/test';

export async function injectPeekWindowMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    // Real Tauri backend relays events across windows; a BroadcastChannel of the
    // same origin/browser is the closest same-process stand-in for that relay
    // between two Playwright Pages representing "main" and "peek".
    const bus = new BroadcastChannel('tauri-peek-mock');
    const listeners = new Map<number, { event: string; cb: (arg: unknown) => void }>();
    let nextId = 1;

    bus.onmessage = (msg: MessageEvent<{ event: string; payload: unknown }>) => {
      for (const { event, cb } of listeners.values()) {
        if (event === msg.data.event) cb({ event: msg.data.event, id: 0, payload: msg.data.payload });
      }
    };

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
        if (cmd === 'plugin:event|listen') {
          const id = nextId++;
          const callbackId = args.handler as number;
          listeners.set(id, {
            event: args.event as string,
            cb: (payload) => (window as unknown as Record<string, unknown>)[`_${callbackId}`] &&
              (window[`_${callbackId}` as never] as (a: unknown) => void)(payload),
          });
          return Promise.resolve(id);
        }
        if (cmd === 'plugin:event|emit') {
          bus.postMessage({ event: args.event, payload: args.payload });
          return Promise.resolve(null);
        }
        // create_webview_window / close / hide / show / set_focus: the TEST
        // itself drives window count via context.newPage(), not this mock —
        // just acknowledge so the calling JS's await doesn't hang.
        return Promise.resolve(null);
      },
      transformCallback(callback: (arg: unknown) => void): number {
        const id = Math.floor(Math.random() * 1_000_000);
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = callback;
        return id;
      },
      unregisterCallback(id: number): void {
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = undefined;
      },
    };
  });
}
```

```typescript
// e2e/checkout/peek-window.spec.ts (shape only — planner fills in real assertions)
import { test, expect } from '../fixtures';
import { injectPeekWindowMock } from '../helpers/tauriPeekMock';
import { loginAs } from '../helpers/auth';

test('scanning a barcode opens a second window with product detail', async ({ page, context }) => {
  await injectPeekWindowMock(page);
  await page.goto('/');
  await loginAs(page, 'cashier');
  // ... trigger the scan on `page` (main window) ...

  // Simulate the "second window" Tauri would have created: the test itself
  // opens the analog page, since the mock's create_webview_window handler
  // cannot call Playwright's context.newPage() from inside page JS.
  const peekPage = await context.newPage();
  await injectPeekWindowMock(peekPage);
  await peekPage.goto('/?window=peek&barcode=<scanned-code>');

  expect(context.pages().length).toBe(2); // window-count assertion analog
  await expect(peekPage.getByText(/Product Details|<product name>/)).toBeVisible();
});
```

**Known limitation to flag for the plan, not to work around:** this simulates the *content and event-relay logic* faithfully, but it cannot assert genuinely OS-level facts (an actual second taskbar entry, real window decorations, real focus-stealing behavior). Per this project's CLAUDE.md carve-out for "the native Tauri window shell," those specific OS-chrome facts are the one category this repo already accepts cannot be Playwright-verified — the event relay, content-swap-on-rescan, and cart-mutation-on-add-to-cart logic above are *not* in that carve-out and must be asserted.

## State of the Art

Not applicable — this is the first use of this API in the repo, not a migration from an older pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Separate `WebviewWindow` instances of the same Tauri app share the same webview storage partition (so Supabase's `localStorage`-persisted session auto-restores in the peek window without extra plumbing) | Pitfall 6 | If wrong, every peek-window product query fails RLS/auth and the window always shows the error state — needs a real `tauri dev` verification early in the plan, with a token-passing fallback ready |
| A2 | Tauri's production asset protocol has no automatic SPA fallback for an unmatched sub-path route | Pitfall 2 / Anti-Patterns | Low risk if wrong (the recommended query-param-on-root-path approach avoids the question entirely either way) — this assumption only matters if the planner chooses the dedicated-`/peek`-route alternative instead of the recommended approach |

## Open Questions

1. **Does the peek window need its title bar to show the real product name, or is a static "Product Details" title (per UI-SPEC's `windowTitle` copy) sufficient?**
   - What we know: UI-SPEC explicitly says the window title is "static, set once at window creation."
   - What's unclear: whether a future phase might want the OS title bar/taskbar entry to show the product name for at-a-glance multi-window identification.
   - Recommendation: Ship the static title as UI-SPEC specifies; this is explicitly out of scope for this phase (UI-SPEC is an approved contract, not to be re-litigated in research).

2. **Exact peek window dimensions.**
   - What we know: UI-SPEC's layout is a single scrollable column, photo hero `max-w-[240px]`, detail panel, footer — comfortably fits an approximately 480×720 window.
   - What's unclear: no explicit dimensions were specified by the user (CONTEXT.md left this to Claude's discretion).
   - Recommendation: `width: 480, height: 720, minWidth: 400, minHeight: 600, resizable: true` as a starting point; adjust during UI verification if the photo hero or footer clips at the minimum size.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@tauri-apps/api` (`webviewWindow`, `event` submodules) | Window creation, cross-window events | ✓ | 2.10.1 (resolved) | — |
| Tauri Rust toolchain / `src-tauri` build | Any Tauri feature (already required project-wide) | ✓ (already required by every existing phase) | tauri crate `2` | — |
| Playwright | E2E verification (this project's mandatory testing policy) | ✓ | 1.59 (per CLAUDE.md) | — |

No new environment dependencies — everything this phase needs is already present in the repo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright v1.59 (E2E), Vitest v4 (unit) |
| Config file | `playwright.config.ts` (E2E, drives Chromium against `npm run dev` on port 1520 — NOT the packaged Tauri binary); `vitest.config.ts` (unit) |
| Quick run command | `npx playwright test e2e/checkout/peek-window.spec.ts` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PEEK-01 | Scan opens peek window with full product detail | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "opens a second window"` | ❌ Wave 0 |
| PEEK-02 | Qty/weight input + risky-add guard reuse | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "risky.*guard"` | ❌ Wave 0 |
| PEEK-03 | Add to Cart / Close behavior | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "Add to Cart|Close"` | ❌ Wave 0 |
| PEEK-04 | Rescan replaces content; main scan-to-search still fires | E2E | `npx playwright test e2e/checkout/peek-window.spec.ts -g "rescan"` | ❌ Wave 0 |
| `WeightEntryDialog` `onConfirm` override backward compatibility | Existing callers unaffected | Unit | `npx vitest run src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx` | ❌ Wave 0 (no existing test file for this component — verify before assuming coverage) |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/checkout/peek-window.spec.ts`
- **Per wave merge:** `npm run test:e2e` (full suite — a new capability grant or event-mock regression could break other windowed/Tauri-mocked specs)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/helpers/tauriPeekMock.ts` — the `BroadcastChannel`-backed IPC mock (Code Examples section) — new helper, no equivalent exists
- [ ] `e2e/checkout/peek-window.spec.ts` — new spec file covering PEEK-01..04
- [ ] Confirm whether `WeightEntryDialog` has zero existing unit tests today (grep found none) — if so, add one covering the new `onConfirm` override path alongside the default-behavior regression check
- [ ] A one-time manual (or scripted) `npm run tauri dev` smoke check of Pitfall 6 (auth session restore in the peek window) before building the full flow — cheaper to catch this assumption wrong in an hour than after all four requirements are implemented against a false premise

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (indirectly) | Peek window relies on the same Supabase session as main (Pitfall 6 / A1) — no new login surface introduced, but the assumption that session state is shared must be verified, not assumed at ship time |
| V4 Access Control | Yes | All data the peek window shows/mutates is already gated by existing RLS policies on `products`/`inventory` (read) and the cart-mutation RPC path (write, unchanged — peek window has no direct write path at all per D-04); no new access-control surface is introduced |
| V5 Input Validation | Yes | The scanned barcode string flows into `useLookupProductByBarcode`'s existing parameterized Supabase query (`.eq('barcode', code)`) — already safe against injection; the qty/weight inputs reuse `QuantityControl`'s existing `min`/`max` bounds and `WeightEntryDialog`'s existing `isValid` (0 < grams ≤ 50,000) check, both unchanged |
| V6 Cryptography | No | Nothing new to encrypt/hash in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malicious/compromised renderer using an over-broad capability grant to open arbitrary windows or read/write files | Elevation of Privilege | Capability grants added in this phase (Pattern 4) are the **minimum** needed — window create/close/hide/show/set-focus and the already-present event permissions — not a blanket `core:webview:default`/`core:window:default` broadening; do not add permissions "for convenience" beyond the five listed |
| Peek window silently trusting the barcode passed via URL query string without the same lookup/validation main uses | Tampering | The peek window must call the same `useLookupProductByBarcode` (parameterized, `is_active=true` filtered) rather than trusting any product data passed unvalidated through the window-creation URL — the URL should carry the raw scanned code only, never a serialized product object, so the peek window always re-derives trusted data from Supabase itself |
| Cart mutation event (`add-to-cart`) spoofed or replayed by other window content | Tampering | Low risk in this closed desktop app (only this app's own two windows exist, and Tauri's event system is process-internal, not network-exposed) — no additional mitigation needed beyond what's already true of the existing single-window cart mutation path |

## Sources

### Primary (HIGH confidence — verified directly against installed source/repo this session)
- `node_modules/@tauri-apps/api/webviewWindow.d.ts` / `.js` — `WebviewWindow` constructor, `getByLabel`, `getCurrent`, exact `invoke('plugin:webview|create_webview_window', ...)` command
- `node_modules/@tauri-apps/api/window.d.ts` / `.js` — `close`/`hide`/`show`/`setFocus`, exact `invoke('plugin:window|...')` command names
- `node_modules/@tauri-apps/api/event.d.ts` / `.js` — `emit`/`emitTo`/`listen`/`once`, exact `invoke('plugin:event|...')` command names, confirmed default global scope (`{kind:'Any'}`)
- `src-tauri/gen/schemas/acl-manifests.json` — exact permission identifiers and each plugin's `default_permission` set (confirms `core:default` does NOT include window-create/close/hide/show/set-focus or webview-create-webview-window, but DOES include event emit/listen)
- `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` — current single-window state
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`, `src/widgets/ProductGrid/ui/ProductGrid.tsx`, `src/entities/product/model/{productRiskFlag,useConfirmRiskyAdd}.ts`, `src/features/add-loose-weight-item/{model,ui}/*`, `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts`, `src/entities/tab/model/cartStore.ts`, `src/shared/lib/domain.ts` (ProductSchema), `src/shared/lib/useBarcodeScanner.ts`, `src/shared/ui/{QuantityControl,StatusBadge,MoneyDisplay}.tsx`, `src/app/{App,providers,AppConfigProvider,router}.tsx`, `src/main.tsx`, `vite.config.ts`, `index.html` — all read in full this session
- `e2e/receipts/reprint.spec.ts`, `e2e/receipts/pdf-delivery.spec.ts` — existing `window.__TAURI_INTERNALS__.invoke` mock pattern this phase's E2E work extends
- `playwright.config.ts` — confirmed E2E drives Chromium against `npm run dev` (port 1520), not a packaged Tauri binary

### Secondary (MEDIUM confidence)
- [GitHub: tauri-apps/tauri#10931](https://github.com/tauri-apps/tauri/issues/10931) — confirms the sub-path SPA-fallback gap in packaged Tauri v2 builds (Pitfall 2), via WebSearch + WebFetch this session

### Tertiary (LOW confidence — flagged in Assumptions Log, not presented as fact)
- Cross-window `localStorage`/session-sharing behavior for Tauri's `WebviewWindow` (A1/Pitfall 6) — based on general WebView2/WKWebView platform knowledge, not verified against a running instance of this app this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, exact version confirmed locally
- Architecture (window creation, capability grants, event relay): HIGH — every command name and permission identifier verified against the actual installed package source and this repo's generated ACL manifest, not inferred from documentation or training data
- Testing implications (E2E multi-window simulation): MEDIUM — the mock pattern extends a proven in-repo technique, but the specific `BroadcastChannel` bridging approach is newly designed for this phase, not copied from an existing spec
- Pitfalls: HIGH for 1/2/3/4/5 (each grounded in a specific verified file or external issue); MEDIUM for 6 (flagged as assumption, with a cheap early-verification step recommended)

**Research date:** 2026-08-26
**Valid until:** 30 days (stable platform API; re-verify only if `@tauri-apps/api` is upgraded past `2.10.x` before this phase is implemented)
