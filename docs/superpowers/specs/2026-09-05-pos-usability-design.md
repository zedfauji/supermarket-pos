# POS usability package

Implement features 7, 9, 10, and 14 from the user's list. The user authorized autonomous design and execution, a separate worktree, local-only changes, and deferring E2E. No further design/implementation confirmations are required.

## Constraints

- Work only in D:/Projects/Code/supermarket-pos-worktrees/pos-usability on codex/pos-usability.
- Do not modify main, push, deploy, or access live data for testing.
- Defer Playwright E2E. Use existing Vitest component/unit tests, lint, typecheck, and a local production build.
- Reuse installed dependencies and existing FSD layers, touch controls, and English/Spanish translations.
- Never persist manager PINs, credentials, or an authorization grant. Never automatically charge a recovered sale.

## Cart and checkout recovery

Extend the existing local cart persistence instead of adding a backend draft service. Preserve active and held baskets, quantities, notes, weights, and promotion snapshots across restart. Validate stored data, migrate the existing version without losing held sales, and isolate recovery by configured backend and terminal. Keep a stable sale identity and checkout-open state.

The important boundary is submission: persist a stable idempotency key and original request context before sending a payment. Preserve unresolved attempts across restart, navigation, and closing checkout; block basket mutation/new payment identity until the attempt is resolved. Reconciliation must use the existing server contract and original staff/shift/register context, must not silently submit a new charge, and must distinguish known rejection from an unknown outcome. Known successful payments must never return as chargeable carts, even if the app stops before the receipt is dismissed. Retain/recover the receipt or a safe completed-sale state. Storage failures must be surfaced before a payment is dispatched without recovery protection. Draft tender values are optional; preserving the sale and safe payment lifecycle is required.

## Unsaved settings

Use a shared dirty-form registration and navigation guard rather than DOM inspection. Every settings tab with explicit Save registers its dirty state and awaited save action. Include General, Billing/payment labels, Hardware, Email, Near expiry, and Lock timeout; inspect Language for any explicit-save flow. Backup actions are operations, not unsaved forms. Internal tab changes, app navigation including history, and normal Tauri window close offer Save and leave, Discard, and Stay. Save failures or validation failures keep the form and pending destination intact. Browser refresh/close uses its native unload confirmation. Successful save updates the dirty baseline immediately; server refetch must not erase current edits. Router may be converted to the installed data router to use supported blocking APIs if required, preserving all routes and overlays.

## Login branding

Show the configured store name (settings.general.barName) and a substantially larger, uncropped store logo on the existing left panel, retaining a compact mobile layout and sign-in controls. Reuse existing receipt logo storage. Provide a small validated cache of non-sensitive branding for pre-auth/offline rendering; never broaden database anonymous permissions or expose general settings. A failed or unauthenticated query must not overwrite known branding with defaults. Follow successful settings saves and scope cache to backend/terminal. Fall back gracefully for absent/broken logos and empty names.

## Checkout keypad

Add an accessible decimal money keypad for checkout payment entry using the current PaymentForm and MoneyInput. Cover cash tender and split tender amounts; make the active field clear, support digits, decimal, backspace and clear, and preserve ordinary keyboard entry and exact/quick tender buttons. Keys are at least 44px. Enforce two decimal places, nonnegative finite values and existing amount limits; disable during processing. Do not make Enter or a digit submit a payment. Keep card/reference text fields as ordinary text inputs and avoid global key listeners.

## Validation and completion

Run meaningful red/green tests for recovery, payment ambiguity/completion, settings navigation and failed saving, branding fallback/cache, and keypad entry. Run relevant existing suites and final lint/typecheck/build. Document baseline failures separately. Keep local commits and a short E2E follow-up checklist; no live deployment.

## Research references and baseline

React Router's supported [useBlocker](https://reactrouter.com/api/hooks/useBlocker) provides custom in-app navigation blocking. The installed React Router implementation requires a data router. Browser refresh/close needs a separate beforeunload listener. Tauri's installed @tauri-apps/api/window.js onCloseRequested awaits the handler and destroys the window unless prevented; the [window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) documents listener disposal.

Hardware settings will use explicit Save for the entire local draft, including logo selection, so a blur or independent logo mutation cannot defeat the Save/Discard choice. Sign-out must defer logout until the dirty-settings decision is resolved. Existing tax-inclusive confirmation is retained when saving billing from the leave dialog.

Baseline at 0fbef1e: unit suite 1411 passed, 4 failed, 15 todo (142 passing files, 2 failed, 2 skipped). Failures concern receipt promotion validation/rendering and ASCII quantity separators. Typecheck has four existing receipt discount/promotion field errors. Lint exits 0 with existing configuration warnings. Locked install requires --legacy-peer-deps due Storybook/Vitest peer mismatch; validation uses bundled Node 24.19.0. No credentials or live backend were used.
