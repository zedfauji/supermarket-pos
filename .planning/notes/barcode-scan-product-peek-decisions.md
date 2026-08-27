---
title: Barcode Scan Product Peek — key decisions
date: 2026-08-26
context: /gsd-explore session, captured before v1.4 phase planning
---

# Barcode Scan Product Peek — key decisions

Decisions locked during exploration, for `/gsd-discuss-phase 18` / `/gsd-plan-phase 18` to build from:

- **Window mechanics**: real separate Tauri OS window (`webviewWindow::Builder` or equivalent), not a modal/overlay in the main window. User explicitly chose this over the simpler overlay option, aware of the added window-lifecycle/focus complexity.
- **Trigger scope**: `/pos` only for v1. Global (any-screen) scanning was considered and explicitly deferred — see seed `barcode-peek-global-rollout`.
- **Coexistence with existing scan behavior**: `/pos` already has a scan-to-search flow (`useBarcodeScanner`, highlights matching `ProductCard`, no auto-add — see 2026-08-26 session S497-S502 in claude-mem). This peek window does NOT replace that flow. Both fire on the same scan event: the peek window opens/updates AND the main window's search-highlight still runs behind it.
- **Rescan-while-open behavior**: scanning a new barcode while the peek window is open replaces its content in place (no manual close needed) rather than opening a second window or requiring dismiss-then-rescan.
- **Quantity/weight entry**: happens inside the peek window itself (qty stepper or weight input depending on product unit type), not deferred to post-add cart editing. Needs to reuse whatever component already handles loose-weight qty entry in the cart/checkout flow rather than building a second one.
- **Stock/expiry guards**: peek window's "Add to Cart" reuses the existing out-of-stock confirm gate and near-expiry alert already used at checkout — no new guard implementation.

## Open questions for planning

- Exact Tauri IPC/event mechanism for main-window → peek-window product data and peek-window → main-window "add to cart" command (likely `tauri::Emitter`/`listen` or a shared Zustand store synced via events — needs research given this is the first multi-window feature in the codebase).
- Window sizing/positioning defaults, and what happens if the cashier closes the peek window via the OS close button vs. the in-app Close button (should behave the same).
- Whether the peek window needs its own instance of the Supabase client/query cache or can share the main window's (Tauri multi-window apps typically run separate webview contexts).
