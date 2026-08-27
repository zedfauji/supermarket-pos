---
phase: 18-barcode-scan-product-peek-window
reviewed: 2026-08-26T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - e2e/checkout/peek-window.spec.ts
  - e2e/helpers/tauriPeekMock.ts
  - playwright.config.ts
  - src-tauri/capabilities/default.json
  - src/app/PeekApp.tsx
  - src/features/add-loose-weight-item/ui/WeightEntryDialog.test.tsx
  - src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx
  - src/features/open-product-peek-window/model/useProductPeekWindow.test.ts
  - src/features/open-product-peek-window/model/useProductPeekWindow.ts
  - src/main.tsx
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/shared/lib/pos-printer.ts
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx
  - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
  - src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-08-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

The peek-window feature (barcode scan → secondary window with product detail →
relay add-to-cart back to the main checkout) is well-tested at the unit and
E2E level for the paths the tests actually exercise, and the Tauri capability
plumbing (mock IPC, `WebviewWindow` reuse) is carefully thought through with
extensive inline rationale. However, tracing the full cross-window event
contract (`ensurePeekWindowShown` → `emit(BARCODE_SCANNED_EVENT)` →
`ProductPeekWindow`) surfaces a real functional bug: the window-reuse path's
whole purpose (refresh content on a second scan while the window is already
open) is dead code, because nothing in `ProductPeekWindow` ever listens for
that event. A second, related gap is that `ProductPeekWindow`'s own barcode
scanner is never disabled while its `WeightEntryDialog` is open, unlike the
equivalent guard that already exists in `CheckoutPanel` (`scannerEnabled`)
for the exact same class of problem — meaning the fix pattern for this was
already known in this codebase but not carried over symmetrically to the new
window.

## Critical Issues

### CR-01: Reusing an already-open peek window never updates its displayed product

**File:** `src/features/open-product-peek-window/model/useProductPeekWindow.ts:40-57`
**Issue:** `ensurePeekWindowShown`'s own doc comment states it "reuses [the window] (show + focus + relay) on every subsequent scan while it already exists." When the window already exists, it calls `existing.show()`, `existing.setFocus()`, then `emit(BARCODE_SCANNED_EVENT, { code })` (line 56) — intending to push the newly scanned barcode into the already-open window so it can refresh its content.

However, `ProductPeekWindow` (`src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx`) never calls `listen(BARCODE_SCANNED_EVENT, ...)`. It only reads `barcode` from `window.location.search` once on mount (lines 240-251), and its own `useBarcodeScanner` (lines 256-261) only reacts to a scan performed *while the peek window itself has OS focus* (and, on that path, relays the code back out via `emit(BARCODE_SCANNED_EVENT, ...)` at line 259 — i.e. the same event name is used peek→main, but nothing consumes the main→peek direction). Only `CheckoutPanel` listens for `BARCODE_SCANNED_EVENT` (line 75), which is the peek→main direction.

Net effect: a cashier scans item A (peek window opens showing A) → scans item B from the main POS screen while A's peek window is still open → the existing window is shown/focused (so it visually pops to the front) but **keeps displaying product A**, not B. The "reuse" flow silently fails; the only way `ProductPeekWindow` ever shows a different product is a brand-new `WebviewWindow` construction with a new `?barcode=` query string, which only happens once per app lifetime (subsequent scans always take the `existing !== null` branch).

Every E2E scenario in `e2e/checkout/peek-window.spec.ts` sidesteps this: each test does `context.newPage()` + `page.goto('/?window=peek&barcode=...')` directly rather than driving a real "scan from main while peek is already open" sequence through `ensurePeekWindowShown`, so this regression has no test coverage and would ship silently.

**Fix:** Add a listener in `ProductPeekWindow` symmetric to `CheckoutPanel`'s, guarded the same way (`isTauri()`):
```tsx
useEffect(() => {
  if (!isTauri()) return undefined;
  const unlisten = listen<{ code: string }>(BARCODE_SCANNED_EVENT, event => {
    void loadProduct(event.payload.code);
  });
  return () => {
    void unlisten.then(fn => fn());
  };
}, [loadProduct]);
```
(Also add an E2E test that drives the real reuse path — main-window scan while a peek window from a prior scan is still open — instead of only ever opening peek windows via a fresh `goto`.)

### CR-02: ProductPeekWindow's barcode scanner is never disabled while WeightEntryDialog is open

**File:** `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx:256-261`, `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:48-65`
**Issue:** `CheckoutPanel` explicitly gates its scanner while a weight dialog owns the register: `scannerEnabled = !paymentOpen && !weightEntry.isOpen && editingWeightItemId === null` (`CheckoutPanel.tsx:37`), with an inline comment calling this out as required (CHK-01). `ProductPeekWindow` does not carry the same guard: `useBarcodeScanner({ onScan: ... })` is called unconditionally with no `enabled` option, so it stays fully active even while `PeekProductDetail`'s `WeightEntryDialog` is open (`weightDialogOpen === true`).

`useBarcodeScanner` (`src/shared/lib/useBarcodeScanner.ts`) attaches a global `window` `keydown` listener that only skips events when `e.target` is an editable form element — a `<Button>` keypad tile (as used by `WeightEntryDialog`'s keypad) does not qualify, so a real USB-HID barcode scan performed while the weight dialog is open will simultaneously: (1) feed every digit into `WeightEntryDialog`'s own global keydown handler (`WeightEntryDialog.tsx:48-65`), corrupting the in-progress weight value with barcode digits, and (2) fire `useBarcodeScanner`'s `onScan` in `ProductPeekWindow`, which calls `loadProduct(newCode)` — replacing the entire displayed product (and its underlying data) while the `WeightEntryDialog` for the *old* product is still mounted and open, referencing stale `product`/`onConfirm` closures.

**Fix:** Lift `weightDialogOpen` (and ideally the risky-add-confirm-open state) up to `ProductPeekWindow` and gate the scanner the same way `CheckoutPanel` does:
```tsx
useBarcodeScanner({
  enabled: !weightDialogOpen,
  onScan: code => { ... },
});
```

## Warnings

### WR-01: TOCTOU race in `ensurePeekWindowShown` can attempt to create two windows with the same label

**File:** `src/features/open-product-peek-window/model/useProductPeekWindow.ts:40-52`
**Issue:** `const existing = await WebviewWindow.getByLabel(PEEK_WINDOW_LABEL); if (existing === null) { new WebviewWindow(PEEK_WINDOW_LABEL, ...); return; }`. If two scans occur in quick succession (plausible with a fast HID scanner scanning multiple items back-to-back before the first `getByLabel()` await resolves), both invocations can observe `existing === null` and both construct a `new WebviewWindow('peek', ...)`. The constructor call is not awaited/stored, so the second construction's rejection (Tauri rejects creating a window with a label that already exists) becomes an unhandled promise rejection, and behavior of the "losing" window creation is undefined.
**Fix:** Serialize calls with a module-level in-flight promise/lock, e.g.:
```ts
let pending: Promise<void> | null = null;
export async function ensurePeekWindowShown(code: string): Promise<void> {
  if (pending) await pending;
  pending = ensurePeekWindowShownInner(code).finally(() => { pending = null; });
  return pending;
}
```

### WR-02: Peek window is granted the full main-window Tauri capability set (violates least privilege)

**File:** `src-tauri/capabilities/default.json:5-22`
**Issue:** The single `default` capability lists `"windows": ["main", "peek"]` and grants both windows the same permission set, including `dialog:allow-save`, `fs:allow-write-file`, `updater:default`, and `process:allow-restart`. The peek window only ever needs to hide/show/focus itself and listen/emit two named events — it has no legitimate use for filesystem writes, save dialogs, the updater, or process restart. In Tauri's capability model, permissions apply uniformly to every window listed in one capability file, so scoping requires a second, minimal capability entry for `peek`.
**Fix:** Split into two capability files — keep `default.json` for `main` with its full permission set, and add a `peek.json` capability scoped to `["peek"]` with only `core:window:allow-hide`, `core:window:allow-show`, `core:window:allow-set-focus`, and the event permissions actually used.

### WR-03: Fire-and-forget `emit`/`listen` calls without error handling

**File:** `src/features/open-product-peek-window/model/useProductPeekWindow.ts:56`; `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx:45, 75-96`; `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx:112, 202, 259`
**Issue:** Several async Tauri IPC calls are invoked with `void` and no `.catch()`: `void ensurePeekWindowShown(code)` (which itself does an un-try/caught `await emit(...)` on line 56), `void emit(ADD_TO_CART_EVENT, ...)` (×2), `void emit(BARCODE_SCANNED_EVENT, ...)`, and the `listen(...).then(unlisten => unlisten())` chains in `CheckoutPanel`. If any of these promises reject in production (e.g. a transient IPC failure), the result is an unhandled promise rejection with no user-facing feedback and no logging — the codebase's own `printReceipt`/`openCashDrawer` (`pos-printer.ts`) demonstrate the established pattern of wrapping Tauri `invoke` calls in try/catch and surfacing failures via `logger`/`toast`, which this phase's IPC calls do not follow.
**Fix:** Wrap each with a `.catch(e => logger.warn('peek_window.ipc_failed', { raw: String(e) }))` (or equivalent), matching the error-handling convention already used in `pos-printer.ts`.

### WR-04: `loadProduct` has no guard against out-of-order async resolution on rapid rescans

**File:** `src/widgets/ProductPeekWindow/ui/ProductPeekWindow.tsx:218-238`
**Issue:** `loadProduct` sets `product` to `undefined` (loading) then awaits `lookup(code)` and calls `setProduct(result)` on resolution, with no request-id/`AbortController` check. `useLookupProductByBarcode.lookup` (`src/features/lookup-product-by-barcode/model/useLookupProductByBarcode.ts`) hits Supabase over the network on any cache miss, so two rapid rescans (barcode A then B) can resolve out of order — if A's network round-trip is slower than B's, the window ends up displaying stale product A after the user already scanned B. `PeekApp`/E2E tests never scan two different uncached barcodes back-to-back fast enough to catch this in practice, but a busy cashier scanning quickly is a realistic trigger.
**Fix:** Track a generation counter or the in-flight code and ignore stale resolutions:
```tsx
const requestRef = useRef(0);
const loadProduct = useCallback(async (code: string) => {
  const id = ++requestRef.current;
  setHasError(false);
  setProduct(undefined);
  try {
    const result = await lookup(code.trim());
    if (requestRef.current === id) setProduct(result);
  } catch {
    if (requestRef.current === id) setHasError(true);
  }
}, [lookup]);
```

## Info

### IN-01: Magic number for max weight

**File:** `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:46`
**Issue:** `const isValid = weightGrams > 0 && weightGrams <= 50_000;` — the 50kg ceiling is an inline literal with no named constant or comment explaining why 50kg was chosen.
**Fix:** `const MAX_WEIGHT_GRAMS = 50_000; // ponytail: 50kg heaviest plausible loose-sale item, revisit if a bulk sack SKU needs more` and reference it in both the validity check and the `50.001` test.

### IN-02: Duplicate digit-entry logic between the global keydown handler and the button `append()` handler

**File:** `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:48-65` vs `67-71`
**Issue:** Two independent code paths build up the same `value` string — the `window` `keydown` listener (physical numpad typing) and `append()` (on-screen keypad button clicks) — with slightly different logic (the keydown path doesn't dedupe consecutive digits the same way `append` does, though today they happen to produce the same result). Any future change to input rules (e.g., a max-digit cap) has to be made in both places or will silently diverge.
**Fix:** Route both through a single `appendChar(key)` helper.

### IN-03: Test mock's random callback IDs risk a low-probability collision

**File:** `e2e/helpers/tauriPeekMock.ts:115-119`
**Issue:** `transformCallback` generates IDs via `Math.floor(Math.random() * 1_000_000)` rather than an incrementing counter (as `listen`'s `nextId` already does two lines above, at line 47). Two callbacks colliding on the same random ID would silently overwrite one global (`window[_id]`), causing one listener's payload to route to the wrong callback — a rare but avoidable source of test flakiness.
**Fix:** Use an incrementing counter (mirroring `nextId`) instead of `Math.random()`.

---

_Reviewed: 2026-08-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
