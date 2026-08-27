---
phase: 18-barcode-scan-product-peek-window
plan: 03
subsystem: testing
tags: [playwright, e2e, tauri, broadcastchannel, multi-window, cross-window-events]

requires:
  - phase: 18-01
    provides: "ensurePeekWindowShown/BARCODE_SCANNED_EVENT/ADD_TO_CART_EVENT constants, CheckoutPanel scan/relay wiring"
  - phase: 18-02
    provides: "PeekApp.tsx + ProductPeekWindow widget mounted behind ?window=peek&barcode=<code>"
provides:
  - "e2e/helpers/tauriPeekMock.ts — injectPeekWindowMock(page)/getPeekMockCalls(page, cmd?), a BroadcastChannel-backed Tauri IPC mock letting two Playwright Pages stand in for real main+peek WebviewWindows"
  - "e2e/checkout/peek-window.spec.ts — 8 passing E2E tests proving PEEK-01..04 end-to-end against live Supabase data"
  - "isTauri() exported from pos-printer.ts, now also gating ensurePeekWindowShown and CheckoutPanel's cross-window listen() effect"
  - "playwright.config.ts Windows-compatible agent-browser Chrome auto-detection (binary-existence check, not just directory-name sort)"
affects: []

actuals:
  tokens: 6100
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Two Playwright Pages in one BrowserContext, bridged by a same-origin BroadcastChannel, as the closest same-process analog to Tauri's real cross-window event relay for E2E"
    - "isTauri() runtime gate on any @tauri-apps/api call reachable from a plain (non-Tauri) browser tab, so the Playwright suite (which always drives npm run dev, never a packaged Tauri binary) never no-ops incorrectly nor crashes on missing window.__TAURI_INTERNALS__"

key-files:
  created:
    - e2e/helpers/tauriPeekMock.ts
    - e2e/checkout/peek-window.spec.ts
  modified:
    - src/shared/lib/pos-printer.ts
    - src/features/open-product-peek-window/model/useProductPeekWindow.ts
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - playwright.config.ts

key-decisions:
  - "Guarded ensurePeekWindowShown and CheckoutPanel's BARCODE_SCANNED_EVENT/ADD_TO_CART_EVENT listen() effect with isTauri() (Rule 1 bug fix) — Plan 18-01's unconditional Tauri IPC calls broke every pre-existing barcode-scan E2E test the instant this plan's real Playwright run exercised them for the first time (uncaught 'Cannot read properties of undefined' from window.__TAURI_INTERNALS__ being absent in a plain browser tab). The peek-window spec explicitly injects the same window.__TAURI__ global this gate checks for, so real cross-window coverage is unaffected."
  - "Fixed playwright.config.ts's agent-browser Chrome auto-detection to check platform() (chrome.exe on Windows vs chrome on Linux/macOS) and existsSync() before trusting a discovered ~/.agent-browser/browsers/chrome-* directory name (Rule 3 blocking fix) — without this, no Playwright test could launch at all on this Windows machine."
  - "tauriPeekMock.ts extends 18-RESEARCH.md's reference implementation with two handlers the research sketch omitted, both found via real Playwright runs against the actual app: plugin:window|get_all_windows must resolve an array (WebviewWindow.getByLabel()'s .map() throws on null), and plugin:event|unlisten must actually remove the listener (React 18 StrictMode's dev-mode mount/cleanup/remount double-invoke otherwise leaves a stale listener that double-fires every relayed event — confirmed by a cart quantity of 6 instead of 3 before the fix)."
  - "Added window.__TAURI_INTERNALS__.metadata.currentWindow/currentWebview to the mock — getCurrentWebviewWindow() (used by ProductPeekWindow's Close button and every successful Add to Cart's onClose) reads this synchronously before ever calling invoke(), which 18-RESEARCH.md's reference sketch did not anticipate since it never exercised the Close path."

requirements-completed: [PEEK-01, PEEK-02, PEEK-03, PEEK-04]

coverage:
  - id: D1
    description: "Scanning a barcode and opening a second Page at ?window=peek&barcode=<code> shows the resolved product's full detail (name, price, SKU, barcode, stock status) against live Supabase data, with context.pages().length === 2"
    requirement: "PEEK-01"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#scanning a barcode and opening the peek window shows full product detail (PEEK-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Adjusting quantity in the peek window and clicking Add to Cart relays across the BroadcastChannel mock bus to the real cartStore, applying the exact quantity set"
    requirement: "PEEK-02"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#Add to Cart with an adjusted quantity relays to the real main-window cart (PEEK-02/PEEK-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A zero-price product gates through the same risky-add confirm toast the main ProductGrid uses, with the cart unaffected until Add anyway is clicked"
    requirement: "PEEK-02"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#a zero-price product still gates through the risky-add confirm toast (prohibition: no guard bypass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A sold-by-weight product opens WeightEntryDialog inside the peek window and relays weightGrams (not qty) to a correctly weighted cart line"
    requirement: "PEEK-02"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#a sold-by-weight product opens WeightEntryDialog and relays a weighted line (PEEK-02 weight path)"
        status: pass
    human_judgment: false
  - id: D5
    description: "An unmatched barcode renders the peek window's Product not found EmptyState with no Add to Cart button, Close still available"
    requirement: "PEEK-01"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#an unmatched barcode shows Product not found, no Add to Cart rendered"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rescanning a different barcode in the peek window replaces its displayed content entirely and relays to the main window's search box, while the main window's own independent scan still fires unaffected"
    requirement: "PEEK-04"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#rescanning a different barcode replaces peek content and relays to main, while main's own independent scan still fires (PEEK-04)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Clicking Close records a window-hide IPC call and never an add-to-cart emit; the cart is provably unaffected"
    requirement: "PEEK-03"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#Close dismisses with zero cart mutation"
        status: pass
    human_judgment: false
  - id: D8
    description: "A second Page opened in the same BrowserContext as an already-logged-in main Page, with no login step of its own, renders real product content — closing RESEARCH.md's cross-window Supabase session-restore assumption"
    requirement: "PEEK-01"
    verification:
      - kind: e2e
        ref: "e2e/checkout/peek-window.spec.ts#a second window in the same browser context restores the session without a fresh login (closes RESEARCH.md Assumption A1 / Pitfall 6)"
        status: pass
    human_judgment: false

duration: 90min
completed: 2026-08-27
status: complete
---

# Phase 18 Plan 03: E2E Verification of the Barcode Scan Product Peek Window Summary

**8 passing Playwright tests proving Plan 18-01's main-window plumbing and Plan 18-02's peek-window widget actually interoperate live against real Supabase data, via a new BroadcastChannel-backed two-Page Tauri IPC mock — plus two Rule 1/Rule 3 fixes (an isTauri() runtime gate and a Windows Chrome-path fix) that were required just to get a Playwright test running on this environment at all.**

## Performance

- **Duration:** ~90 min (heavy on investigation: environment setup, root-causing three separate blockers before any test could pass)
- **Completed:** 2026-08-27
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- `e2e/helpers/tauriPeekMock.ts`: `injectPeekWindowMock(page)` extends the existing `injectPrintMock` dual-global pattern with a `BroadcastChannel('tauri-peek-mock')` bridge, letting two Playwright `Page`s in one `BrowserContext` stand in for Tauri's real main+peek `WebviewWindow`s — the one genuinely new E2E technique this phase needed, per 18-RESEARCH.md's Validation Architecture. `getPeekMockCalls(page, cmd?)` reads back every recorded `invoke()` call for assertions (e.g. a `plugin:window|hide` after Close).
- `e2e/checkout/peek-window.spec.ts`: 8 tests, all passing, proving PEEK-01 through PEEK-04 end-to-end against live Supabase data — full product detail on open, adjusted-quantity Add to Cart relay, zero-price risky-add gate, sold-by-weight `WeightEntryDialog` path, unmatched-barcode empty state, rescan-replaces-content plus main's independent scan, Close's zero-mutation guarantee, and cross-window Supabase session restore with no explicit login on the second page.
- Found and fixed a real regression in already-merged Plan 18-01 code: `CheckoutPanel`'s `ensurePeekWindowShown` call and its `BARCODE_SCANNED_EVENT`/`ADD_TO_CART_EVENT` listener effect ran unconditionally, throwing on every scan/mount when `window.__TAURI_INTERNALS__` doesn't exist (i.e. every existing E2E test, all of which drive `npm run dev` in a plain browser tab, not a packaged Tauri binary). Exported `isTauri()` from `pos-printer.ts` and gated both call sites — this is what this plan's Task 2 acceptance criterion ("the whole `e2e/checkout/` folder still passes") is designed to catch, and it did.
- Found and fixed a Windows-specific bug in `playwright.config.ts`'s agent-browser Chrome-for-Testing auto-detection: it assumed the binary is named `chrome` (true on Linux/macOS) and never checked the file actually exists, so a stale `~/.agent-browser/browsers/chrome-*` directory entry silently broke every Playwright launch on this machine. No Playwright test could run at all until this was fixed.
- `tauriPeekMock.ts` extends 18-RESEARCH.md's reference sketch with two handlers discovered only by actually running the real app under Playwright: `plugin:window|get_all_windows` must resolve an array (not `null`, or `WebviewWindow.getByLabel()`'s `.map()` throws), and `plugin:event|unlisten` must actually remove the listener (React 18 StrictMode's dev-mode mount/cleanup/remount double-invoke otherwise leaves a stale listener that double-fires every relayed event — first surfaced as a cart quantity of 6 instead of the expected 3).

## Task Commits

Each task was committed atomically:

1. **Deviation fix (prerequisite for both tasks' own `<verify>` to run at all):** `894b004` (fix) — `isTauri()` guards + `playwright.config.ts` Windows Chrome-path fix
2. **Task 1: tauriPeekMock.ts** - `49de095` (feat)
3. **Task 2: peek-window.spec.ts** - `343fc9b` (test)
4. **Deviation documentation:** `a2eb4f5` (docs) — logged the 11 pre-existing, unrelated `e2e/checkout/` failures found during the required full-folder regression run

**Plan metadata:** (this commit, made after this SUMMARY)

## Files Created/Modified

- `e2e/helpers/tauriPeekMock.ts` — new: `injectPeekWindowMock(page)`, `getPeekMockCalls(page, cmd?)`
- `e2e/checkout/peek-window.spec.ts` — new spec file, 8 tests covering PEEK-01..04 and the cross-window session-restore assumption
- `src/shared/lib/pos-printer.ts` — exported the previously-private `isTauri()`
- `src/features/open-product-peek-window/model/useProductPeekWindow.ts` — `ensurePeekWindowShown` now no-ops outside a real Tauri runtime
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` — cross-window listener effect now no-ops outside a real Tauri runtime
- `playwright.config.ts` — Windows-compatible (`chrome.exe`) + existence-checked agent-browser Chrome auto-detection

## Decisions Made

See `key-decisions` in frontmatter above — all four decisions are deviation fixes required to get this plan's own verification running, not scope additions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ensurePeekWindowShown`/`CheckoutPanel`'s listener effect threw outside a real Tauri runtime**
- **Found during:** Task 2 (first attempt at running `e2e/checkout/barcode-scan-search.spec.ts` to confirm no baseline regression, before writing the new spec)
- **Issue:** Plan 18-01's `CheckoutPanel.tsx` calls `ensurePeekWindowShown(code)` on every scan and registers `listen()` for two peek-window events unconditionally. Both call `window.__TAURI_INTERNALS__.invoke`/`transformCallback`, which don't exist in a plain browser tab (this project's entire Playwright suite drives `npm run dev`, never a packaged Tauri binary). Every existing barcode-scan E2E test failed `fixtures.ts`'s zero-`pageerror` assertion the moment this plan actually ran them.
- **Fix:** Exported `isTauri()` from `pos-printer.ts` (already the canonical definition, reused rather than reimplemented) and added an `if (!isTauri()) return` guard to `ensurePeekWindowShown` and to `CheckoutPanel`'s listener-registering effect.
- **Files modified:** `src/shared/lib/pos-printer.ts`, `src/features/open-product-peek-window/model/useProductPeekWindow.ts`, `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx`
- **Verification:** `npm run typecheck`/`npm run lint` clean; `npx playwright test e2e/checkout/barcode-scan-search.spec.ts -g "scan adds a catalog product to the cart"` no longer throws a pageerror (a separate, pre-existing assertion failure remains — see Deferred Items below)
- **Committed in:** `894b004`

**2. [Rule 3 - Blocking] `playwright.config.ts`'s Chrome auto-detection is Linux/macOS-only and trusts a stale directory entry**
- **Found during:** Task 2, first attempt to run any Playwright test at all
- **Issue:** `findAgentBrowserChrome()` assumed the binary is named `chrome` (it's `chrome.exe` on Windows) and never checked the file exists on disk before returning the path, so a stale `~/.agent-browser/browsers/chrome-150.0.7871.46` directory (present but incomplete/wrong-named binary) caused every Playwright launch to fail with "executable doesn't exist," with no fallback to Playwright's own bundled Chromium despite CLAUDE.md documenting that fallback.
- **Fix:** Added `platform()`-aware binary naming and an `existsSync()` check before trusting the discovered path, falling back to `undefined` (Playwright's bundled Chromium) when the binary isn't actually present — matches CLAUDE.md's documented behavior.
- **Files modified:** `playwright.config.ts`
- **Verification:** `npx playwright test` now launches successfully on this Windows machine
- **Committed in:** `894b004`

**3. [Rule 1 - Bug] `tauriPeekMock.ts`'s naive transcription of 18-RESEARCH.md's reference sketch crashed/double-fired in practice**
- **Found during:** Task 2, iterating against real Playwright runs of the new spec
- **Issue:** (a) `WebviewWindow.getByLabel()` calls `invoke('plugin:window|get_all_windows')` and `.map()`s the result — resolving `null` (the research sketch's generic fallback) threw an uncaught exception. (b) `getCurrentWebviewWindow()` (used by every Close/successful-Add-to-Cart path) synchronously reads `window.__TAURI_INTERNALS__.metadata.currentWindow/currentWebview.label` before ever calling `invoke()` — absent in the research sketch, so Close/Add-to-Cart threw. (c) `listen()`'s cleanup (`_unlisten`) synchronously reads `window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` — absent in the sketch, and fires on every `useEffect` under React 18 StrictMode's dev-mode double-invoke, not just on a real unmount. (d) The mock never implemented `plugin:event|unlisten` to actually remove a listener from its internal Map, so StrictMode's stale first-mount listener survived and double-fired every relayed event (observed as a cart quantity of 6 instead of 3).
- **Fix:** Added `metadata` to `__TAURI_INTERNALS__`, resolved `[]` for `get_all_windows`, stubbed `__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener` as a no-op, and implemented `plugin:event|unlisten` to actually delete the Map entry.
- **Files modified:** `e2e/helpers/tauriPeekMock.ts`
- **Verification:** All 8 tests in `e2e/checkout/peek-window.spec.ts` pass; the quantity-doubling bug reproduced and disappeared exactly as expected once `unlisten` was implemented
- **Committed in:** `49de095` (folded into Task 1's own commit — discovered while iterating on the same file, before Task 2's spec commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 3 blocking environment/config fix) — all were prerequisites for this plan's own `<verify>` commands to run at all, not scope additions. No architectural changes, no Rule 4 escalations.
**Impact on plan:** None on scope. The `isTauri()` fix is arguably the single most valuable outcome of this plan beyond the 8 new tests themselves — it's a real bug in already-shipped Phase 18 code that would have broken barcode scanning for anyone running this app outside a packaged Tauri binary (e.g. any future E2E work, or `npm run dev` itself).

## Issues Encountered

**Pre-existing, out-of-scope `e2e/checkout/` failures found during the required full-folder regression run** (documented in full in `deferred-items.md` and logged to `.planning/WINDOWS.md` as ledger entries #36/#37):

- **9 tests in `barcode-scan-search.spec.ts`** fail because they assert the pre-Phase-18 direct scan-to-cart UX (`onScan` used to imply an immediate cart mutation or inline "Product not found" text). Phase 18 (already merged via Plan 18-01, confirmed via diffing against `main` before this plan touched any file) intentionally redesigned this: scanning now only populates the search box and opens the peek window; the actual guarded add-to-cart flow this spec describes now lives in the peek window, covered instead by this plan's own `peek-window.spec.ts`. A follow-up plan should retire/rewrite these 9 assertions.
- **2 tests in `atomic-rpc-guards.spec.ts`** fail with `Margarita not found` — a bar-pos-era product name absent from Phase 17's Indian-grocery seed catalog. Entirely unrelated to barcode scanning; a stale fixture reference.

Both were confirmed pre-existing (not introduced by this plan) by diffing `CheckoutPanel.tsx` against `main` before any 18-03 edits, and are out of this plan's file scope (`e2e/helpers/tauriPeekMock.ts`, `e2e/checkout/peek-window.spec.ts`) per the executor's scope-boundary rule.

**Environment setup required** (mirroring 18-01/18-02's own deviations for this worktree): copied `.env.local` from the main checkout, ran `npm ci` (this worktree shipped with no `node_modules`), confirmed the local Supabase stack was already running (`npx supabase status`), started `npm run dev` in the background, and ran `npx playwright install chromium` before the `playwright.config.ts` Chrome-path fix made the pre-installed agent-browser binary discoverable.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PEEK-01 through PEEK-04 are now proven end-to-end, not just inferred from two separately-passing unit-level plans — this closes Phase 18.
- The `isTauri()` fix is a real production-code improvement that should be carried forward: any future Tauri-only IPC call added to a widget reachable from the plain web/dev-server context should follow the same guard pattern.
- Follow-up work (not blocking this phase, logged in `deferred-items.md`/`WINDOWS.md`): update `barcode-scan-search.spec.ts` to match the new scan-opens-peek-window UX, and fix the stale `Margarita` fixture in `atomic-rpc-guards.spec.ts`.
- No blockers for phase closure.

---
*Phase: 18-barcode-scan-product-peek-window*
*Completed: 2026-08-27*

## Self-Check: PASSED

All 6 created/modified files confirmed present on disk; all 4 task commits
(`894b004`, `49de095`, `343fc9b`, `a2eb4f5`) confirmed present in
`git log --oneline`.
