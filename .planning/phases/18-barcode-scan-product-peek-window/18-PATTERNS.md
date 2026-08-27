# Phase 18: Barcode Scan Product Peek Window - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 11 new/modified
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main.tsx` | config/bootstrap | request-response (route branch) | `src/main.tsx` (itself, modified) | exact |
| `src/app/PeekApp.tsx` | provider | request-response | `src/app/App.tsx` | exact (minus Router/OfflineBanner/ClockDriftBanner) |
| `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` | component | request-response + event-driven | `src/widgets/ProductGrid/ui/ProductGrid.tsx` (`selectProduct` pattern), `src/entities/product/ui/ProductCard.tsx` (header/price markup) | role-match |
| `src/features/open-product-peek-window/model/useProductPeekWindow.ts` | hook/service | event-driven | `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` (hook shape); `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` (scanner wiring + listener additions) | role-match |
| `src/shared/lib/tauriPeekEvents.ts` (optional typed wrapper) | utility | event-driven | none in-repo (first Tauri multi-window usage) — pattern is dictated by RESEARCH.md Pattern 1/2 code directly | no analog (new territory) |
| `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` | component | CRUD (mutation) | itself (modified — add `onConfirm` override) | exact |
| `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` | component | request-response + event-driven | itself (modified — add `listen('barcode-scanned')`, `listen('add-to-cart')`, `ensurePeekWindowShown` call) | exact |
| `src-tauri/capabilities/default.json` | config | — | itself (modified — add `"peek"` window label + 5 permissions) | exact |
| `src-tauri/tauri.conf.json` | config | — | not modified per RESEARCH.md recommendation (lazy `WebviewWindow`, no static entry) — confirm in plan | n/a |
| `e2e/helpers/tauriPeekMock.ts` | test utility | event-driven (mock) | `e2e/receipts/reprint.spec.ts` (`injectPrintMock` — dual `__TAURI__`/`__TAURI_INTERNALS__` init-script mock) | role-match |
| `e2e/checkout/peek-window.spec.ts` | test | request-response + event-driven | `e2e/receipts/reprint.spec.ts`, `e2e/receipts/pdf-delivery.spec.ts` (structure: `beforeEach` → `resetTestState`/`openCaja`/`injectMock`/`loginAs`, then role-based locator assertions) | role-match |

## Pattern Assignments

### `src/main.tsx` (bootstrap, modified)

**Analog:** itself (current content shown below in full — file is 16 lines)

**Current full content:**
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/lib/i18n';
import { App } from './app/App';
import './app/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

**Change pattern (RESEARCH.md Code Examples, verified against this exact file):** add a `PeekApp` import and branch on `new URLSearchParams(window.location.search).get('window') === 'peek'` before calling `createRoot(...).render(...)`. Keep the `#root` null-check and `import './app/globals.css'` unchanged — both windows share the same CSS bundle.

---

### `src/app/PeekApp.tsx` (new)

**Analog:** `src/app/App.tsx` (full file, 23 lines, read above)

```typescript
import { Toaster } from 'sonner';
import { ClockDriftBanner } from '@shared/ui/ClockDriftBanner';
import { ErrorBoundary } from '@shared/ui/ErrorBoundary';
import { OfflineBanner } from '@shared/ui/OfflineBanner';
import { AppConfigProvider } from './AppConfigProvider';
import { Providers } from './providers';
import { Router } from './router';

export function App() {
  return (
    <ErrorBoundary>
      <AppConfigProvider>
        <OfflineBanner />
        <Toaster richColors position="top-right" />
        <Providers>
          <ClockDriftBanner />
          <Router />
        </Providers>
      </AppConfigProvider>
    </ErrorBoundary>
  );
}
```

**Peek variant:** keep `ErrorBoundary` → `AppConfigProvider` → `Toaster` → `Providers` exactly (same provider order — `Providers` almost certainly wraps the TanStack QueryClient + i18n context the peek window's own `useLookupProductByBarcode`/`useConfirmRiskyAdd` need). Drop `OfflineBanner` (peek window has no offline-cart concept, D-04) and `ClockDriftBanner` (no payment/caja concerns there) and `Router` (single view, no navigation) — replace `<Router />` with `<ProductPeekWindow />`. Keep `Toaster` — `useConfirmRiskyAdd` needs its own `<Toaster/>` mounted in this separate React root (UI-SPEC explicit requirement).

---

### `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx` (new)

**Analog 1 — guard/select pattern:** `src/widgets/ProductGrid/ui/ProductGrid.tsx` lines 56-68 (`selectProduct`):
```typescript
const selectProduct = (product: Product) => {
  const commit = () => {
    if (product.soldByWeight) weightEntry.openFor(product);
    else onSelect(product);
    onSearchChange('');
  };
  const flag = getProductRiskFlag(product);
  if (flag) {
    confirmRiskyAdd(flag, product, commit);
    return;
  }
  commit();
};
```
Mirror this shape exactly for the peek window's "Add to Cart" commit, swapping `onSelect(product)` (piece path) for `emit('add-to-cart', {product, qty})` and `weightEntry.openFor(product)` for opening `WeightEntryDialog` with the `onConfirm` override (Pattern 3 below). `onSearchChange('')` has no peek-window equivalent — omit.

**Analog 2 — header/price markup:** `src/entities/product/ui/ProductCard.tsx` lines 48-62 (category dot + name + price) — reuse verbatim per UI-SPEC step 2/3/4:
```tsx
<div className="flex items-center gap-2">
  <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: category.color }} aria-hidden="true" />
  <span className="text-xs text-muted-foreground">{category.name}</span>
</div>
...
<h3 className="w-full truncate text-lg font-semibold">{product.name}</h3>
<MoneyDisplay amount={displayPrice} size="lg" />
```
UI-SPEC overrides: product name becomes `text-2xl font-heading font-semibold truncate` (not `text-lg`), `MoneyDisplay size="xl" className="font-semibold"` (not `size="lg"`).

**Analog 3 — `QuantityControl` usage** (`src/shared/ui/QuantityControl.tsx`, full file read above): props are `{ value, min = 1, max = 99, onChange, disabled, className }`. UI-SPEC step 6 confirms `min={1} max={99}` matching `CartItem`'s existing bounds (defaults already match — no override needed).

**Analog 4 — `StatusBadge` usage** (`src/shared/ui/StatusBadge.tsx`, full file read above): pass `status="inv_in_stock" | "inv_low_stock" | "inv_out_of_stock"` (existing `InventoryStockBadgeStatus` union, lines 18/90-105) — the "Don't Hand-Roll" table in RESEARCH.md flags that the stock-tier *decision* function (`stockTier()` in `InventoryRow.tsx:37-42`) is not exported/reusable as-is (operates on `Inventory` not `Product`), so inline a 3-line equivalent using `product.quantityOnHand`/`product.lowStockThreshold` with the same comparisons, then pass the resulting tier string into `StatusBadge`.

**Analog 5 — `EmptyState`/`CardSkeleton`** (`src/shared/ui/EmptyState.tsx:44`, `LoadingSkeletons.tsx:30`): `EmptyState({ icon, title, description, action, className })`, `CardSkeleton({ height = 200, className })` — both exported from `src/shared/ui/index.ts`. Not-found state: `<EmptyState icon={PackageSearch} title={...} description={...} />` (no `action` per UI-SPEC). Loading state: `<CardSkeleton height={~360} />` sized for photo+3 lines per UI-SPEC.

---

### `src/features/open-product-peek-window/model/useProductPeekWindow.ts` (new)

**Analog — hook shape:** `src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts` (full file, 66 lines, read above) — same shape: a hook returning callback(s) built with `useCallback`, no local component state, pure orchestration. Follow this file's structure (one `useCallback`-wrapped async function per exported action) rather than a class or a store.

**Core pattern (from RESEARCH.md Pattern 1, verified against installed `@tauri-apps/api@2.10.1`):**
```typescript
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';

async function ensurePeekWindowShown(code: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel('peek');
  if (existing === null) {
    new WebviewWindow('peek', {
      url: `/?window=peek&barcode=${encodeURIComponent(code)}`,
      title: 'Product Details',
      width: 480, height: 720, minWidth: 400, minHeight: 600,
      resizable: true, center: true,
    });
    return;
  }
  await existing.show();
  await existing.setFocus();
  await emit('barcode-scanned', { code });
}
```

**Integration point in `CheckoutPanel.tsx`** — additive `useEffect` alongside the existing `useBarcodeScanner` call (lines 33-38 today):
```typescript
useEffect(() => {
  const unlistenPromise = listen<{ code: string }>('barcode-scanned', (event) => {
    setSearch(event.payload.code); // identical call to the existing local onScan
  });
  return () => { void unlistenPromise.then(unlisten => { unlisten(); }); };
}, []);
```
Plus a second listener for `add-to-cart` that calls the existing `addItem`/`addWeightedItem` cart-store actions already destructured in `CheckoutPanel` (lines 43-49: `addItem`, and `useCartStore(state => state.addWeightedItem)` pattern from `WeightEntryDialog.tsx:36`).

---

### `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` (modified)

**Current signature and confirm logic** (full file read above, lines 11-18 props, 69-74 confirm):
```typescript
export interface WeightEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  mode: 'add' | 'edit';
  initialWeightGrams?: number;
  tempId?: string;
}
...
const confirm = () => {
  if (!isValid) return;
  if (mode === 'edit' && tempId) updateWeightedItem(tempId, weightGrams);
  else addWeightedItem(product, weightGrams);
  onOpenChange(false);
};
```

**Modification (RESEARCH.md Pattern 3, exact diff shape):** add optional `onConfirm?: (weightGrams: number) => void` to the props interface; in `confirm()`, branch: `if (onConfirm) { onConfirm(weightGrams); } else if (mode === 'edit' && tempId) { updateWeightedItem(...) } else { addWeightedItem(...) }`. All existing callers (`ProductGrid.tsx:117-126`, `CheckoutPanel.tsx:147-158`) pass no `onConfirm` — zero behavior change for them (backward-compatible, additive prop only — note `exactOptionalPropertyTypes: true` means declare as `onConfirm?: (weightGrams: number) => void` is fine since it's a function type, not a mutation-input string/value prop the CLAUDE.md gotcha warns about).

Peek window usage: `onConfirm={(weightGrams) => { void emit('add-to-cart', { product, weightGrams }); void getCurrentWebviewWindow().hide(); }}`.

---

### `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` (modified)

**Current scanner wiring** (lines 29-38, full file read above) — DO NOT touch this block; add listeners alongside it:
```typescript
const scannerEnabled = !paymentOpen && !weightEntry.isOpen && editingWeightItemId === null;
useBarcodeScanner({
  enabled: scannerEnabled,
  onScan: code => { setSearch(code); },
});
```
Add: (1) a call to `ensurePeekWindowShown(code)` inside the existing `onScan` callback (main window's local scan both sets search AND opens/relays to peek — D-01 asymmetry noted in RESEARCH.md); (2) the two new `listen()` `useEffect`s described above.

---

### `src-tauri/capabilities/default.json` (modified)

**Current full content** (read above, 17 lines):
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:allow-save",
    "fs:allow-write-file",
    "notification:default",
    "updater:default",
    "process:allow-restart"
  ]
}
```

**Required change (RESEARCH.md Pattern 4, verified against `src-tauri/gen/schemas/acl-manifests.json`):** add `"peek"` to `windows`, and add exactly these 5 permissions (no more — RESEARCH.md's Security Domain section explicitly warns against broadening beyond the minimum): `core:webview:allow-create-webview-window`, `core:window:allow-close`, `core:window:allow-hide`, `core:window:allow-show`, `core:window:allow-set-focus`. `core:default` already grants `core:event:default` (emit/listen/emit_to/unlisten) — no new event permission needed.

---

### `e2e/helpers/tauriPeekMock.ts` (new)

**Analog:** `e2e/receipts/reprint.spec.ts` lines 18-42 (`injectPrintMock`, full function read above) — same dual-global shape: `window.__TAURI__ = {}` (passes `isTauri()` gates) + `window.__TAURI_INTERNALS__` object implementing `invoke`/`transformCallback`/`unregisterCallback`. Extend the `invoke` switch with `plugin:event|listen`, `plugin:event|emit`, and no-op acks for `plugin:webview|create_webview_window`/`plugin:window|close|hide|show|set_focus`, bridged across Playwright `Page`s via `BroadcastChannel` (RESEARCH.md Code Examples has the full ~55-line implementation ready to use verbatim — copy from there, not re-derived here).

---

### `e2e/checkout/peek-window.spec.ts` (new)

**Analog:** `e2e/receipts/reprint.spec.ts` full `describe` structure (lines 50-58 `beforeEach`, then per-test locator assertions) — `test.describe(...) → beforeEach: requireIntegrationEnv() → resetTestState() → openCaja(500) → injectMock(page) → page.goto('/') → loginAs(page, 'cashier')`. Same helper imports: `../fixtures`, `../helpers/auth` (`loginAs`), `../helpers/requireEnv`, `../helpers/supabase`. Second-window simulation uses `context.newPage()` + a second `injectPeekWindowMock(peekPage)` + `peekPage.goto('/?window=peek&barcode=<code>')` (RESEARCH.md Code Examples spec-shape example, lines ~452-473 of RESEARCH.md).

## Shared Patterns

### Barcode scanner hook (reused verbatim, both windows)
**Source:** `src/shared/lib/useBarcodeScanner.ts` (full file, 73 lines, read above)
**Apply to:** `CheckoutPanel.tsx` (already using it, unchanged) and the new `ProductPeekWindow.tsx` (new third instantiation — same `{ onScan, enabled }` API, no modification needed).

### Risky-add confirmation gate (reused verbatim)
**Source:** `src/entities/product/model/useConfirmRiskyAdd.ts` (full file, 49 lines, read above) + `src/entities/product/model/productRiskFlag.ts` (`getProductRiskFlag`, full file, 22 lines, read above)
**Apply to:** `ProductPeekWindow.tsx`'s commit path — call exactly as `ProductGrid.selectProduct` does (`const flag = getProductRiskFlag(product); if (flag) { confirmRiskyAdd(flag, product, commit); return; } commit();`).

### Tauri IPC mock for E2E (dual-global init script)
**Source:** `e2e/receipts/reprint.spec.ts` lines 18-42
**Apply to:** `e2e/helpers/tauriPeekMock.ts` — same `__TAURI__`/`__TAURI_INTERNALS__` shape, extended per RESEARCH.md's full implementation.

### Cart mutation API (destination for `add-to-cart` event, unchanged)
**Source:** `src/entities/tab/model/cartStore.ts` — `addItem: (product: Product, modifiers: Modifier[], unitPrice?: number) => void` (line 21), `addWeightedItem: (product: Product, weightGrams: number) => void` (line 24)
**Apply to:** `CheckoutPanel.tsx`'s new `listen('add-to-cart')` handler — call `addItem(product, [])` for the piece path (matches existing `ProductGrid` `onSelect` call at `CheckoutPanel.tsx:82-84`) and `addWeightedItem(product, weightGrams)` for the weight path — no store API changes needed.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/shared/lib/tauriPeekEvents.ts` (optional typed emit/listen wrapper) | utility | event-driven | First Tauri multi-window/event-relay code in this repo — no prior typed-event-wrapper convention exists; follow RESEARCH.md's Pattern 1/2 code directly instead of an in-repo analog. Planner should decide if this file is even needed (could inline the two event names as string literals in the two call sites instead — YAGNI candidate). |

## Metadata

**Analog search scope:** `src/widgets/{ProductGrid,CheckoutPanel}/ui/`, `src/entities/product/{model,ui}/`, `src/entities/tab/model/`, `src/features/{add-loose-weight-item,lookup-product-by-barcode}/`, `src/shared/ui/`, `src/shared/lib/useBarcodeScanner.ts`, `src/app/`, `src/main.tsx`, `src-tauri/capabilities/default.json`, `e2e/receipts/`
**Files scanned:** 15 read in full, plus RESEARCH.md's already-verified excerpts of `src-tauri/gen/schemas/acl-manifests.json` and `node_modules/@tauri-apps/api` sources (not re-read — already primary-sourced in RESEARCH.md)
**Pattern extraction date:** 2026-08-26
