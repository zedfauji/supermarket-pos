# Phase 30: Checkout Continuity, Settings Exit Guard & Cash Keypad - Research

**Researched:** 2026-09-08
**Domain:** Restart-safe client state, idempotent payment recovery, guarded React navigation, and accessible POS amount entry
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Phase Boundary

Make one terminal's unfinished direct-sale cart and Checkout draft survive an application restart,
reconcile any payment that was already submitted before permitting another attempt, protect every
editable Settings form from accidental loss on all exit paths, and add a touch-friendly cash
amount-tendered keypad. This phase does not add cart synchronization between terminals, persist
credentials or raw card data, change payment-provider behavior, or redesign Checkout beyond the
recovery and keypad surfaces.

#### Implementation Decisions

##### Restore experience and stale data
- **D-01:** After authentication, a saved active sale that had Checkout open must first show a
  blocking **Resume / Discard** confirmation; Checkout is not revealed until the cashier chooses.
- **D-02:** The confirmation must show a full basket preview: every product, quantity, saved price,
  total, and non-sensitive saved payment details.
- **D-03:** Resume preserves the saved basket snapshot. If catalog price, promotion, or stock changed,
  show saved versus current values and block payment until each conflict is explicitly accepted or
  the affected line is removed. Never silently reprice the restored sale.
- **D-04:** An unfinished sale is recoverable only while the caja session that owns it remains open.
  Closing that caja removes the persisted active cart, Checkout draft, and recovery state.
- **D-05:** Recovery is terminal-scoped, not cashier-scoped: any authenticated cashier on the same
  terminal may resume the saved sale while its caja session remains open.
- **D-06:** Persist the exact pre-submission Checkout draft needed to resume work, including payment
  method, tendered amount, split allocations, promotion/custom-discount choice, and applicable
  reference/customer fields. Never persist staff/manager PINs, credentials, or raw card data.
  Completing or explicitly discarding the sale clears the persisted sale. Cancelling Checkout clears
  only the Checkout-open marker/draft and retains the active cart.

##### Payment recovery outcomes
- **D-07:** If the app stopped after payment submission began, restart into a blocking recovery screen
  with the saved sale summary. Cart edits and all payment controls remain unavailable while status is
  being reconciled.
- **D-08:** If the backend confirms the payment completed, immediately open its existing receipt with
  normal print, email, and PDF actions. Do not automatically reprint it.
- **D-09:** If the backend confirms the attempt did not complete, restore the Checkout values and the
  original idempotency key. The cashier must deliberately press Pay to retry; never retry
  automatically or generate a new payment identity.
- **D-10:** If status is unknown because the backend is unreachable, stay blocked with only **Retry**
  and app close available. Do not allow Pay, cart edits, or Discard until status is resolved.

##### Settings exit details
- **D-11:** Every editable Settings tab participates in one exit guard. Dirty Settings tab switches,
  route/page navigation, and Tauri application close offer **Save / Discard / Stay**. Browser reload or
  window close uses the platform-native warning where an asynchronous custom dialog is unavailable.
- **D-12:** Save waits for the owning mutation. On success, automatically continue the originally
  attempted tab switch, navigation, or app close. Discard continues without saving; Stay cancels the
  attempted exit.
- **D-13:** Dirty state is event-based: after any edit, the form stays dirty until explicit Save or
  Discard, even if the cashier manually changes the value back to its original value.
- **D-14:** A failed Save keeps the confirmation dialog open, preserves the form values, and shows an
  inline actionable error while retaining Retry, Discard, and Stay.
- **D-15:** Escape, outside click, and the dialog close control all mean Stay: cancel the attempted exit
  and preserve the dirty form.

##### Cash keypad interaction
- **D-16:** The amount-tendered keypad opens when the cash amount field receives focus; it is not
  permanently visible and is not a separate modal.
- **D-17:** Use normal decimal entry: pressing `1`, `0`, `0` produces `100.00`; the decimal key enters
  cents. Include digits 0–9, decimal, Clear, and Backspace.
- **D-18:** Exact and quick-tender buttons remain. If a quick-tender preset is selected, the first
  subsequent keypad digit replaces that preset; later digits append normally.
- **D-19:** Physical keyboard and numpad digits, decimal, Backspace, and Delete mirror the on-screen
  controls. Enter must never trigger payment.
- **D-20:** Keypad controls are touch-sized, keyboard accessible, translated, and disabled while
  payment is processing. Their amount participates in the same Checkout-draft restoration as manual
  MoneyInput entry.

### the agent's Discretion
- Exact persisted store key, schema version, and migration mechanics, provided all restored payloads
  are schema-validated and malformed/obsolete data fails closed.
- The smallest shared dirty-form registration mechanism that lets each existing tab retain ownership
  of its values and async save mutation.
- Exact recovery-status query/RPC shape and polling details; the outcome state machine in D-07–D-10
  is fixed.
- Keypad component factoring, popover placement at responsive breakpoints, animation, and translated
  copy, while reusing existing input/button/keypad patterns.
- Exact automated-test split between colocated Vitest and Playwright, provided all Phase 30
  requirements receive automated coverage.

### Folded Todos

None.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `.planning/todos/pending/rename-cargo-package-bar-pos.md` — matched only on the generic keyword
  "pos"; Cargo/package naming is unrelated to Checkout continuity.
- `.planning/todos/pending/rotate-remote-supabase-db-password.md` — operational credential rotation is
  unrelated to this product behavior and remains a standalone pending task.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CART-01 | The active cart is stored in versioned, schema-validated terminal-local persistence after every cart change, alongside the already-persisted held-cart slot. After an application restart, the exact active cart is restored for any authenticated cashier on that terminal; malformed or obsolete persisted data fails closed to an empty cart instead of partially restoring untrusted lines. [VERIFIED: .planning/REQUIREMENTS.md:257] | Extend the existing single Zustand persisted cart envelope, validate the entire restored active-sale portion with Zod, and reconcile its caja owner after auth. |
| CART-02 | If Checkout was open when the application exited, it reopens after authentication with the same pre-submission payment state, including payment method, amount tendered, split-payment allocation, promotion/custom-discount selection, and applicable reference/customer fields. Staff or manager PINs, credentials, and raw card data are never persisted. [VERIFIED: .planning/REQUIREMENTS.md:258] | Add a sanitized Checkout draft contract and PaymentForm hydration/update callbacks; explicitly omit all authentication material. |
| CART-03 | Completing a sale or explicitly clearing the cart removes its persisted cart and Checkout draft. Cancelling Checkout returns to the selling screen and clears only the Checkout-open marker/draft while retaining the active cart. [VERIFIED: .planning/REQUIREMENTS.md:259] | Centralize lifecycle transitions in cart-store actions called by CheckoutPanel, PaymentForm completion, and caja reconciliation. |
| CART-04 | If the application exits after payment submission begins but before the result is shown, restart recovery reconciles that same attempt against the backend using its original idempotency identity before enabling another payment action. A completed attempt shows its existing receipt; an incomplete attempt resumes safely; recovery never silently creates a new payment identity that could duplicate the sale. [VERIFIED: .planning/REQUIREMENTS.md:260] | Persist the key before dispatch, query existing payment rows read-only using the base/split-leg identity plus caja, and retry only by an explicit Pay with the same key. |
| SET-01 | Every editable Settings tab reports whether it has unsaved changes. Switching Settings tabs, navigating to another route/page, or closing the Tauri application while changes are dirty presents **Save**, **Discard**, and **Stay** actions; browser reload/window-close surfaces the platform-native unsaved-changes warning where a custom asynchronous dialog is unavailable. [VERIFIED: .planning/REQUIREMENTS.md:264] | Use one active-form registration contract, controlled Settings tabs, React Router `useBlocker`, `useBeforeUnload`, and Tauri `onCloseRequested`. |
| SET-02 | **Save** waits for the relevant settings mutation to succeed before continuing the pending navigation or close. A failed save keeps the user on the current form with its values intact and an actionable error; **Discard** continues without saving; **Stay** cancels the pending exit. [VERIFIED: .planning/REQUIREMENTS.md:265] | Make each form's registered save return a structured success/error result and keep the controlled three-action dialog open until success. |
| KEYPAD-01 | Cash Checkout displays a touch-friendly keypad for the amount-tendered field only, with digits 0–9, decimal, clear, and backspace. Existing Exact and quick-tender buttons remain available; keypad controls are keyboard-accessible, have translated accessible labels, are disabled while payment is processing, and participate in CART-02 restart restoration. [VERIFIED: .planning/REQUIREMENTS.md:269] | Reuse the existing touch-key layout and decimal-buffer pattern in a non-modal anchored Popover, feeding the same persisted tendered value as manual entry. |
</phase_requirements>

## Summary

Phase 30 is three coordinated changes, not three unrelated UI patches. The cart and Checkout work needs one persisted, versioned active-sale envelope whose transitions are explicit: selling, pre-submission Checkout, submitted-but-unresolved, completed receipt, and cleared. The repository already has the right persistence pattern, but it currently persists only `heldCart`; the active `items` array and payment state are session-only. [VERIFIED: src/entities/tab/model/cartStore.ts:100-130] [VERIFIED: src/entities/tab/model/cartStore.ts:365-390]

The highest-risk boundary is the instant immediately before a direct-sale request. PaymentForm currently creates the idempotency key in memory and clears it on success, while `useCheckoutSale` forwards an override and caches it only in a React ref. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:459-520] [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:545-571] [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:81-145] The phase must persist the sanitized draft and original key synchronously before network dispatch, and must use a read-only backend check after restart. Calling the existing mutation as a "status check" is forbidden by the locked no-auto-retry outcome and could create a sale when no payment exists. The database already makes `payments.idempotency_key` non-null and unique, and split direct-sale replay recognizes either the base key or the verbatim derived key suffix `'-leg0'`. [VERIFIED: supabase/migrations/20260417000001_payment_processing.sql:14-24] [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203]

Settings protection should be implemented as one router-level feature coordinator, not separate dialogs in every form. It must accept the currently mounted form's event-based dirty flag, async save, discard/reset, pending exit target, and optional save warning. The current Settings parent uses uncontrolled tabs, and the editable Hardware tab is the easy-to-miss exception: its selects and checkboxes save immediately while free text saves on blur, so it currently cannot participate in explicit Save/Discard/Stay semantics. [VERIFIED: src/widgets/SettingsTabsPanel/index.tsx:133-176] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:66-97] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:162-288]

The cash keypad should be a small focused input feature, reused for the main cash tendered field and every split-cash tendered field, but never for a split allocation amount. Existing quick tender remains beside the main field. A string editing buffer is necessary because the current numeric MoneyInput contract cannot represent an intermediate trailing decimal, and it deliberately refuses prop-driven display updates while focused. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:1099-1128] [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:1261-1307] [VERIFIED: src/shared/ui/MoneyInput.tsx:16-31] [VERIFIED: src/shared/ui/MoneyInput.tsx:75-112]

**Primary recommendation:** Plan the phase in dependency order: persisted sale contract and state machine; read-only reconciliation and receipt recovery; Checkout recovery UI/stale validation; shared Settings exit coordinator and form adapters; then the cash keypad and full automated coverage.

## Project Constraints (from AGENTS.md)

- Keep application orchestration in `app/`, route composition in `pages/`, large UI composition in `widgets/`, user actions in `features/`, domain state/queries in `entities/`, and cross-cutting primitives in `shared/`. [VERIFIED: AGENTS.md:3-12]
- Use aliases `@app`, `@pages`, `@widgets`, `@features`, `@entities`, and `@shared`; Tauri code is under `src-tauri/`, Supabase work under `supabase/`, and browser E2E under `e2e/`. The alias values are quoted verbatim from the source. [VERIFIED: AGENTS.md:12]
- TypeScript formatting is `2-space indentation`, semicolons, single quotes, and `100-character` print width; components/directories use PascalCase, functions/variables use camelCase, and tests use `*.test.ts(x)`. These values are quoted verbatim. [VERIFIED: AGENTS.md:25-27]
- Keep domain behavior in its entity or feature owner, not in a page or widget. [VERIFIED: AGENTS.md:27]
- Add colocated Vitest coverage for changed UI/model behavior; integration tests are explicitly named and run separately because they access Supabase; all user-facing verification is automated with headless Playwright, with no manual-only acceptance. [VERIFIED: AGENTS.md:29-31]
- Run lint, typecheck, and the narrowest relevant tests before handoff; use focused scoped Conventional Commits; never commit `.env.local`, credentials, or generated test reports. [VERIFIED: AGENTS.md:16-23] [VERIFIED: AGENTS.md:31-35]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Active-cart and Checkout-draft durability | Browser / Client | Database / Storage (localStorage) | The sale is explicitly terminal-local; the existing entity store already owns cart state and uses Zustand persistence. [VERIFIED: src/entities/tab/model/cartStore.ts:10-13] [VERIFIED: src/entities/tab/model/cartStore.ts:365-390] |
| Caja ownership reconciliation | Browser / Client | API / Backend | The client waits for the authenticated open-caja query and clears a mismatched/closed sale; `useCurrentCaja` currently fetches one row whose status is verbatim `'open'`. [VERIFIED: src/entities/caja/model/queries.ts:61-103] |
| Payment-attempt reconciliation | Browser / Client query | Database / Storage | A read-only RLS-protected query establishes whether the original key has durable payment rows; the payment mutation itself remains unchanged. [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:680-708] [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203] |
| Receipt reconstruction | Browser / Client | Database / Storage | Reuse `fetchReceiptDataForPayment(tabId)`, which reconstructs one sale receipt from persisted tab, payment, order, and settings rows. [VERIFIED: src/entities/payment/model/queries.ts:111-149] [VERIFIED: src/entities/payment/model/queries.ts:158-227] |
| Stale price/promotion/stock review | Browser / Client | API / Backend | UI comparison/review is client-owned, while the direct-sale RPC remains authoritative at submission. The product query already returns catalog fields plus `inventory(quantity_on_hand, low_stock_threshold)`. [VERIFIED: src/entities/product/model/queries.ts:136-161] |
| Settings dirty-form coordination | Browser / Client | Tauri native window API | The provider blocks tab/router exits and browser unload; Tauri supplies a distinct cancellable native close request. [CITED: https://reactrouter.com/api/hooks/useBlocker] [CITED: https://reactrouter.com/api/hooks/useBeforeUnload] [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] |
| Cash amount keypad | Browser / Client | — | Amount editing, focus, keyboard handling, localization, and Popover placement are frontend responsibilities. [VERIFIED: src/shared/ui/MoneyInput.tsx:64-140] [VERIFIED: src/shared/ui/PINKeypad.tsx:35-88] |

## Standard Stack

Use the repository's installed stack without adding or upgrading dependencies. Installed versions below were read from `package-lock.json`; each installed release was also confirmed in the npm registry on 2026-09-08. The registry had newer releases for several packages, but upgrading them is outside this phase and would add unrelated risk. [VERIFIED: npm registry]

### Core

| Library | Installed version | Installed release published | Purpose | Why standard here |
|---------|-------------------|-----------------------------|---------|-------------------|
| React | `19.2.5` | 2026-04-08 | Providers, controlled UI, hooks | Existing application runtime; no state framework change is needed. [VERIFIED: package-lock.json:18484-18485] [VERIFIED: npm registry] |
| Zustand | `5.0.12` | 2026-03-16 | Versioned terminal-local cart/recovery persistence | Existing cart-store middleware already uses `version`, `partialize`, `migrate`, and `merge`. [VERIFIED: package-lock.json:22197-22198] [VERIFIED: src/entities/tab/model/cartStore.ts:365-390] [VERIFIED: npm registry] |
| Zod | `4.4.3` | 2026-05-04 | Fail-closed persisted and wire-contract validation | The cart and product domain are already Zod-backed. [VERIFIED: package-lock.json:22166-22167] [VERIFIED: src/shared/lib/domain.ts:234-279] [VERIFIED: src/shared/lib/domain.ts:1131-1146] [VERIFIED: npm registry] |
| React Router DOM | `7.18.3` | 2026-08-28 | SPA navigation blocking and browser unload hook | `useBlocker` is supported in Declarative mode and supplies proceed/reset; `useBeforeUnload` covers the native browser event. [VERIFIED: package-lock.json:18757-18758] [CITED: https://reactrouter.com/api/hooks/useBlocker] [CITED: https://reactrouter.com/api/hooks/useBeforeUnload] [VERIFIED: npm registry] |
| `@tauri-apps/api` | `2.10.1` | 2026-02-03 | Native close request interception | `onCloseRequested` returns an unlisten function and supports synchronous `event.preventDefault()`. [VERIFIED: package-lock.json:7537-7538] [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] [VERIFIED: npm registry] |
| Supabase JS | `2.103.0` | 2026-04-09 | Authenticated, RLS-protected reconciliation and receipt reads | Existing backend client and query conventions; no payment-provider change is needed. [VERIFIED: package-lock.json:7182-7183] [VERIFIED: npm registry] |

### Supporting

| Library | Installed version | Installed release published | Purpose | When to use |
|---------|-------------------|-----------------------------|---------|-------------|
| `@radix-ui/react-alert-dialog` | `1.1.15` | 2025-08-13 | Accessible blocking recovery and three-action exit dialog foundation | Use a purpose-built controlled dialog, not the two-action ConfirmDialog. [VERIFIED: package-lock.json:3163-3164] [CITED: https://www.radix-ui.com/primitives/docs/components/alert-dialog] [VERIFIED: npm registry] |
| `radix-ui` Popover | `1.4.3` | 2025-08-13 | Non-modal anchored keypad surface | Reuse the existing shared Popover wrapper around the tendered field. [VERIFIED: package-lock.json:18269-18270] [VERIFIED: src/shared/ui/popover.tsx:1-37] [CITED: https://www.radix-ui.com/primitives/docs/components/popover] [VERIFIED: npm registry] |
| TanStack Query | `5.99.0` | 2026-04-11 | Reconciliation/receipt query lifecycle | Use for explicit reconciliation retries and error/loading state. [VERIFIED: package-lock.json:7488-7489] [VERIFIED: src/entities/payment/model/queries.ts:13-16] [VERIFIED: npm registry] |
| Vitest | `5.0.0` | 2026-09-03 | Unit and real-Supabase integration tests | Colocated state/UI tests and explicit integration project. [VERIFIED: package-lock.json:21547-21548] [VERIFIED: vitest.config.ts:53-99] [VERIFIED: npm registry] |
| Playwright | `1.59.1` | 2026-04-01 | Headless restart/navigation/keypad acceptance | Existing browser E2E runner is headless Chromium with one worker. [VERIFIED: package-lock.json:3033-3034] [VERIFIED: playwright.config.ts:43-105] [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Extending the existing persisted cart store | A second Checkout localStorage store | Rejected: two independently written stores can represent different moments and complicate clear/cancel/caja transitions; CONTEXT explicitly directs extending the established pattern. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:161-169] |
| Stable `useBlocker` plus a controlled dialog | `unstable_usePrompt` | Rejected: the prompt API is experimental and uses `window.confirm`, so it cannot provide Save/Discard/Stay or async Save. [CITED: https://reactrouter.com/api/hooks/usePrompt] |
| RLS-protected read-only payment lookup | Calling `process-direct-sale` to inspect status | Rejected: `process-direct-sale` invokes the mutating atomic RPC after validation; an absent key would create a sale. [VERIFIED: supabase/functions/process-direct-sale/index.ts:302-343] |
| Existing Radix Popover | A new keypad/modal package | Rejected: Popover already supplies anchor, focus, collision, outside-interaction, and non-modal behavior. [CITED: https://www.radix-ui.com/primitives/docs/components/popover] |

**Installation:** None. Do not change dependencies for Phase 30. [VERIFIED: package.json:38-104]

## Package Legitimacy Audit

No external package installation is recommended, so the package-legitimacy gate is not applicable. Existing package identities are already locked by `package-lock.json`; this phase should not run an install or upgrade task. [VERIFIED: package-lock.json:3033-3034] [VERIFIED: package-lock.json:22166-22198]

**Packages removed due to SLOP verdict:** none.

**Packages flagged as suspicious:** none.

## Architecture Patterns

### System Architecture Diagram

```text
Authentication succeeds
        |
        v
Open-caja query reaches a definitive result ---------> no matching open caja
        |                                                        |
        |                                                        v
        |                                              clear active persisted sale
        v
Hydrate + validate one terminal-local sale envelope
        |
        +--> active cart only ------------------------------> selling screen
        |
        +--> Checkout draft, not submitted
        |         |
        |         v
        |    blocking basket/draft preview
        |         +--> Discard --> clear active sale
        |         +--> Resume  --> refresh catalog/promotions/stock
        |                               |
        |                               +--> conflicts --> explicit accept/remove --> Checkout
        |                               +--> none -------------------------------> Checkout
        |
        +--> submitted attempt
                  |
                  v
        lock cart and all payment actions
                  |
                  v
        authenticated read-only payment lookup (Supabase/RLS)
                  |
                  +--> payment exists --> reconstruct receipt --> manual actions only
                  +--> no payment -----> restore draft + same key --> deliberate Pay
                  +--> query error ----> unknown, keep locked -----> Retry status / app close

Settings form edit --> active-form registration --> one exit coordinator
                                                   |
                 +---------------------------------+-------------------------------+
                 |                                 |                               |
             tab switch                     SPA route/navigation            Tauri close request
                 |                                 |                               |
        controlled Tabs request                useBlocker                  preventDefault immediately
                 +---------------------------------+-------------------------------+
                                                   |
                                            Save / Discard / Stay
                                                   |
                      +----------------------------+----------------------------+
                      |                            |                            |
              await owner save             owner reset + continue       cancel pending exit
                      |
                failure stays open

Browser hard reload/close --> useBeforeUnload --> browser-native warning only

Cash tender input focus --> non-modal anchored Popover --> shared decimal intent reducer
                                                        --> same numeric tendered state
                                                        --> persisted Checkout draft
```

The diagram's client/backend split follows the existing BrowserRouter, Supabase client, cart store, and receipt query boundaries. [VERIFIED: src/app/router.tsx:48-123] [VERIFIED: src/entities/tab/model/cartStore.ts:10-13] [VERIFIED: src/entities/payment/model/queries.ts:111-149]

### Recommended Project Structure

The new path names below are planning recommendations, not claims that the files already exist.

```text
src/
├── app/
│   └── router.tsx                              # mount exit-guard provider inside BrowserRouter
├── entities/
│   └── tab/model/
│       ├── cartStore.ts                        # one persisted sale envelope and lifecycle actions
│       └── cartStore.test.ts                   # hydration/version/fail-closed/lifecycle tests
├── features/
│   ├── checkout-sale/model/
│   │   ├── directSaleRecovery.ts               # sanitized draft schemas + pure transitions
│   │   └── reconcileDirectSale.ts              # read-only original-key/caja lookup
│   ├── guard-settings-exit/
│   │   ├── model/SettingsExitGuardProvider.tsx # registration, blocker, unload, Tauri close
│   │   ├── model/useSettingsFormGuard.ts        # active form adapter API
│   │   └── ui/SettingsExitDialog.tsx            # controlled Save/Discard/Stay dialog
│   └── cash-tender-keypad/
│       ├── model/cashTenderBuffer.ts            # pure decimal/preset replacement reducer
│       └── ui/CashTenderInput.tsx               # MoneyInput + anchored Popover/keypad
├── widgets/
│   ├── CheckoutPanel/ui/CheckoutPanel.tsx       # startup recovery precedence and blocking surfaces
│   ├── PaymentModal/ui/PaymentForm.tsx          # draft hydration/emission and submit checkpoint
│   └── SettingsTabsPanel/                       # controlled tabs plus per-form registration adapters
└── shared/
    └── lib/i18n/locales/{en-US,es-MX}/          # recovery, guard, and keypad copy

e2e/
├── payments/checkout-continuity.spec.ts
├── payments/cash-tender-keypad.spec.ts
└── settings/settings-exit-guard.spec.ts
```

This placement keeps domain persistence in `entities`, user workflows in `features`, application-wide router orchestration in `app`, and composition in `widgets`, matching the repository's required layer ownership. [VERIFIED: AGENTS.md:3-12] [VERIFIED: AGENTS.md:27]

### Component Responsibilities

| Component | Responsibility | Must not own |
|-----------|----------------|--------------|
| Cart entity store | Persist and validate active items, held slot, caja owner, sanitized Checkout draft, unresolved attempt identity, and conflict acknowledgements as one envelope; expose explicit clear/cancel/submit/recovery actions. | Network reconciliation or receipt UI. The current store's verbatim state is only `items` and `heldCart`. [VERIFIED: src/entities/tab/model/cartStore.ts:10-13] |
| Checkout-sale recovery feature | Define the sanitized draft boundary, save the submission checkpoint before dispatch, perform read-only status lookup, and map results into the locked recovery outcomes. | New charge logic or automatic retries. The existing submit path already accepts `idempotencyKeyOverride`. [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:96-145] |
| CheckoutPanel | Wait for authenticated caja reconciliation, select the correct blocking/resume/receipt screen, invoke stale-data comparison, and prevent scan/cart controls while recovery is locked. | Persistence parsing and payment SQL. [VERIFIED: src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx:105-119] |
| PaymentForm | Hydrate and emit pre-submit form state; render the CashTenderInput; request a durable submission checkpoint immediately before calling a processor. | Owning terminal persistence or deciding startup recovery. Its current relevant state is local React state and a ref. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:204-238] |
| ReceiptPreview | Render recovered receipt and its explicit print, email, PDF, and Done actions. | Automatic recovered printing. The component's controls invoke these actions only on button activation. [VERIFIED: src/features/process-payment/ui/ReceiptPreview.tsx:14-17] [VERIFIED: src/features/process-payment/ui/ReceiptPreview.tsx:28-107] |
| Settings exit-guard feature | Hold one active form registration and one pending exit; arbitrate tab, route, sign-out, browser unload, and Tauri close. | Settings field values or mutations. Those remain owned by the tab forms. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:28-65] |
| Settings form adapters | Report event-based dirty, perform validation/mutation, return success/error, reset on discard, and optionally describe a save warning. | Navigation. |
| CashTenderInput/keypad | Own the raw decimal buffer and preset-replacement intent; update the numeric tender value; keep its Popover/focus/keyboard behavior local. | Payment submission. The current submit controls are separate `type="button"` controls. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:1402-1444] |

### Pattern 1: One Versioned, Fully Validated Sale Envelope

Extend the existing cart persistence configuration; do not add another localStorage system. Keep `items` and `heldCart` in the same Zustand store and add active-sale metadata that owns the caja identity, Checkout-open marker, sanitized draft, unresolved submission identity, and recovery conflict acknowledgements. Persist only data, never functions or derived selectors. The current configuration's exact key and version values are `'direct-sale-held-cart'` and `1`; retain the key to preserve the held-cart slot and bump its version for the new envelope. [VERIFIED: src/entities/tab/model/cartStore.ts:100-108]

Validate the whole active-sale portion atomically. If any active item, draft field, attempt field, or ownership field fails Zod parsing, restore no active sale; never salvage valid-looking lines from a corrupt array. The current held-cart normalizer already follows this fail-closed behavior and logs only an issue count. [VERIFIED: src/entities/tab/model/cartStore.ts:110-123]

Use an explicit migration only for the known prior held-only shape; initialize the new active-sale portion empty while preserving a valid held slot. All unknown versions fail closed. Zustand officially defines `partialize`, `version`, `migrate`, `merge`, and `onRehydrateStorage`; a version mismatch is not used unless migration handles it. [CITED: https://zustand.docs.pmnd.rs/reference/middlewares/persist]

The envelope must whitelist the pre-submit fields that already exist in PaymentForm: payment method, `tenderedAmount`, `cardReference`, `cardChargeOverride`, `customerName`, `customerPhone`, `discountType`, `discountValue`, `discountExpanded`, `selectedPromotionId`, `isSplitMode`, and the split rows' method/allocation/tendered/reference fields. These field names are quoted from the implementation. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:204-238] Explicitly omit `authorizingManagerPin`, PIN-dialog state, receipt state, processing/errors, and any auth/session credentials. The verbatim manager credential field is `authorizingManagerPin`; the code already resets it whenever authorization resets. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:214-228]

Persist the custom discount selection but not authorization. On restore, the cashier must re-authorize any manager-gated discount or below-cost override before Pay can be enabled; otherwise excluding the PIN while restoring `managerOverride` would claim authorization that cannot be independently reverified. The backend currently forwards the entered `managerPin` for server-side re-verification. [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:133-141] [VERIFIED: supabase/functions/process-direct-sale/index.ts:42-49]

### Pattern 2: Explicit Lifecycle Actions, Not Incidental Field Clearing

Create store-level transitions for the following behaviors and route every caller through them:

| Trigger | Active items | Checkout draft/open marker | Unresolved attempt | Held slot |
|---------|--------------|----------------------------|--------------------|-----------|
| Cart mutation | update and persist | preserve if valid for the cart | reject while unresolved | preserve |
| Open Checkout | preserve | write current sanitized draft and open marker | empty | preserve |
| Cancel Checkout | preserve | clear | clear pre-submit identity | preserve |
| Explicit clear / restore-dialog Discard | clear | clear | clear only when no unresolved payment exists | preserve |
| Payment submission starts | freeze | preserve exact draft | persist original key before request | preserve |
| Reconciliation says incomplete | preserve | restore | retain original key for deliberate retry | preserve |
| Receipt Done / known completed cleanup | clear | clear | clear | preserve |
| Owning caja closes or differs after auth | clear | clear | clear | preserve |

These transition outcomes come directly from D-04 and D-06; the held slot is left unchanged because the locked cleanup list names the persisted active cart, Checkout draft, and recovery state, not the separate held sale. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:29-37]

Caja validation must wait for a definitive authenticated query result rather than trusting the separately persisted caja cache. `useCurrentCaja` fetches the open row and then synchronizes `useCajaStore`; a stale cached `currentCaja` can exist before that effect runs. [VERIFIED: src/entities/caja/model/store.ts:24-53] [VERIFIED: src/entities/caja/model/queries.ts:61-103] Put the cross-entity cleanup in app/Checkout orchestration, and also invoke it after successful close; the close mutation currently calls only `clearCaja()`. [VERIFIED: src/entities/caja/model/queries.ts:261-283]

### Pattern 3: Persist-before-Dispatch Idempotency Checkpoint

Immediately before calling any direct-sale processor, generate or reuse the idempotency key, store the sanitized draft plus submitted-attempt marker, and only then send the request. Current code creates the exact prefixes `'payment_cash'`, `'payment_card'`, `'payment_bank_transfer'`, and `'payment_split'` in an in-memory ref immediately before processor calls. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:459-520] [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:621-639]

The current Zustand middleware's synchronous storage path calls `storage.setItem` after each state update and returns that call internally. [VERIFIED: node_modules/zustand/esm/middleware.mjs:356-371] Wrap the submission-checkpoint action in error handling appropriate to synchronous localStorage; if persistence throws, roll the in-memory attempt back, show an actionable error, and do not dispatch the payment. This is required because a request sent with an unpersisted key cannot be safely identified after a crash. The project localStorage rule also requires versioned/minimal data and `try/catch`. [VERIFIED: .agents/skills/vercel-react-best-practices/rules/client-localstorage-schema.md:1-26]

Do not clear the submitted marker merely because a request rejects ambiguously. A known server response may transition to resumable state, but a transport failure after dispatch must run reconciliation before Pay is exposed again. Current PaymentForm keeps its ref after a failure but immediately exposes its form again for non-offline errors, so the plan must distinguish definitive application rejection from unknown transport outcome. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:545-568]

### Pattern 4: Read-only Reconciliation with the Existing Payment Identity

Implement a dedicated query helper, not a new charge endpoint. Under the current authenticated Supabase client, look up the minimum payment identity fields using both the exact persisted base key and the exact split first-leg derivation `base + '-leg0'`; bind the result to the persisted caja through its tab. The current atomic function uses exactly those two forms for replay detection. [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203]

This can remain a client query because current RLS grants authenticated non-kitchen staff with the `close_tab` permission SELECT access to non-deleted payment rows, and equivalent permission-based access to tabs. The verbatim permission/action is `'close_tab'`; the excluded role is `'kitchen'`. [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:484-514] [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:680-695] Select minimum fields and use parameterized Supabase filters such as `.in(...)`; do not interpolate the key into a raw `.or(...)` string.

Map outcomes narrowly:

| Query result | UI state | Allowed next action | Identity rule |
|--------------|----------|---------------------|---------------|
| Matching payment and caja | Existing receipt | Receipt print/email/PDF/Done | No payment call |
| Successful query, no matching payment | Restored Checkout | Cashier may press Pay | Reuse persisted key |
| Network/query/auth/shape error | Blocking unknown screen | Retry reconciliation or close app | Keep persisted key; no edit/Pay/Discard |
| Matching key under a different caja | Blocking integrity error | Retry/close only | Never reveal or reuse mismatched sale |

After a completed lookup, pass the returned tab identity to `fetchReceiptDataForPayment`, which already groups all payment rows for a tab into one `tenders` array and builds a full receipt. [VERIFIED: src/entities/payment/model/queries.ts:111-149] [VERIFIED: src/entities/payment/model/queries.ts:175-227] Render `ReceiptPreview` directly for recovered completion. Do not execute PaymentForm's normal success branch, because that branch automatically opens the cash drawer and prints; recovered completion must not reprint automatically. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:567-596] [VERIFIED: src/features/process-payment/ui/ReceiptPreview.tsx:28-107]

The unique payment-key index remains the final duplicate barrier if an original transaction commits just after an apparently empty read. [VERIFIED: supabase/migrations/20260417000001_payment_processing.sql:19-24] A retry still uses the same key, so it cannot become a second payment identity.

### Pattern 5: Startup Recovery Precedence and Locking

After authentication and open-caja resolution, apply this precedence:

1. Invalid envelope or caja mismatch/closure clears the active sale.
2. A submitted attempt bypasses the Resume/Discard prompt and enters blocking reconciliation.
3. A pre-submission Checkout draft shows the full Resume/Discard basket-and-payment preview.
4. An active cart without Checkout restores directly to selling.
5. No active sale starts empty.

This ordering is required to prevent a submitted attempt from being accidentally discarded before its status is known. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:22-49]

Locking must be behavioral, not only visual. While an attempt is reconciling or unknown, reject/no-op cart mutation actions and do not install barcode/add-to-cart event paths, because CheckoutPanel currently registers Tauri add-to-cart events independently of what it renders. [VERIFIED: src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx:174-214] Payment controls and explicit clear/discard must be absent from the blocking screen.

### Pattern 6: Recovery-specific Stale-data Records

On Resume, refresh all active products plus promotions and near-expiry data, then compare every saved line—not only promotion-sourced lines. The current reconnect effect only revisits items that have a `promotionId`, and its conflict state is a single boolean. [VERIFIED: src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx:121-169] That is insufficient for D-03's saved-versus-current price, promotion, and stock display.

Add a recovery conflict record per line that carries the saved and current catalog price, evaluated promotion identity/price, and quantity-on-hand snapshot, plus acknowledgement state. The saved CartItem already contains a full Product snapshot, `unitPrice`, optional `promotionId`, and optional `quantityOnHand`; those names are quoted verbatim from the schemas. [VERIFIED: src/shared/lib/domain.ts:234-279] [VERIFIED: src/shared/lib/domain.ts:1131-1146] The live `useProducts` result includes `basePrice`, active status filtering, and joined inventory quantity. [VERIFIED: src/entities/product/model/queries.ts:70-94] [VERIFIED: src/entities/product/model/queries.ts:136-161]

Reuse `resolveConflict` for accepted price/promotion changes; it already updates price, line total, promotion, freshness, and clears the conflict only after an explicit caller action. [VERIFIED: src/entities/tab/model/cartStore.ts:292-310] Extend the model for stock acknowledgement. A product missing from the active catalog or lacking a usable inventory record should remain payment-blocking and be removal-only, because there is no current value that can safely replace its saved snapshot.

### Pattern 7: One Active Settings Form Contract

Mount a Settings exit-guard provider inside `BrowserRouter` and around the application route tree so `useBlocker` has router context and Sidebar sign-out can participate. The present `BrowserRouter` directly wraps Help, AgentPanel, Suspense, and Routes. [VERIFIED: src/app/router.tsx:48-123] Each mounted editable form registers an interface containing owner identity, event-based dirty, saving status, async save result, discard/reset, and optional save-warning content. Keep only one active owner; reject or log duplicate active registrations.

The coordinator owns a single pending exit continuation. A controlled Settings `Tabs` request stores the next tab; React Router stores its blocked navigation; Tauri stores a native-close continuation; sign-out stores a callback that performs logout only after the decision. React Router documents the exact blocker states `'unblocked'`, `'blocked'`, and `'proceeding'`, plus `proceed()` and `reset()`, and explicitly notes that hard reload/cross-origin navigation is not covered. [CITED: https://reactrouter.com/api/hooks/useBlocker]

Do not rely on route blocking alone for actions with side effects before navigation. Sidebar currently calls `logout()` before `navigate('/login')`; a route blocker would keep the URL on Settings after authentication was already cleared. [VERIFIED: src/widgets/AppShell/ui/Sidebar.tsx:155-175] Route sign-out through the pending-exit coordinator so the side effect runs only after Save/Discard.

For browser reload/window close, register `useBeforeUnload` only while dirty, call `preventDefault()`, and set `returnValue` for legacy compatibility. Browsers show generic platform-controlled copy and the event is not universally reliable, which is why it supplements rather than replaces synchronous persistence. [CITED: https://reactrouter.com/api/hooks/useBeforeUnload] [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event]

For Tauri, register `getCurrentWindow().onCloseRequested`, call `event.preventDefault()` immediately when dirty, then open the same custom guard. Await Save; on success or Discard, set a one-shot bypass and call `getCurrentWindow().close()`. Tauri documents that `close()` emits another close-request event, so the bypass prevents recursion; cleanup the returned unlisten function on unmount. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#close] The current capability grants verbatim permission `'core:window:allow-close'` but not force-destroy permission, so use `close()`, not `destroy()`. [VERIFIED: src-tauri/capabilities/default.json:9-21]

### Pattern 8: Save/Discard/Stay Is a Controlled Async State Machine

Build a purpose-specific SettingsExitDialog from existing AlertDialog primitives. Do not widen ConfirmDialog: it has only confirm/cancel and a window-level Enter handler that invokes confirm, while this guard needs three actions and must not turn an incidental Enter into Save. [VERIFIED: src/shared/ui/ConfirmDialog.tsx:26-51] [VERIFIED: src/shared/ui/ConfirmDialog.tsx:111-135]

Keep the AlertDialog root controlled. Render Save as a normal button rather than an auto-closing AlertDialog Action: set saving, await the registered result, continue/close only on success, and otherwise retain the dialog, draft, pending exit, and inline error. Radix officially documents controlled operation, focus trapping, Title/Description announcements, Esc close, and programmatic close after async submission. [CITED: https://www.radix-ui.com/primitives/docs/components/alert-dialog]

Map root dismissal/Escape, overlay interaction, and an explicit close control to the same Stay handler: call blocker reset/cancel continuation, clear the pending exit, and leave the form dirty. AlertDialog prevents outside pointer dismissal by default in its installed source, so the purpose-built overlay must deliberately treat an overlay pointer action as Stay if the locked outside-click behavior is to close the guard. [VERIFIED: node_modules/@radix-ui/react-alert-dialog/src/alert-dialog.tsx:107-136]

Form adapters must return a structured result rather than showing a toast and returning `void`, because only the owning form knows whether validation or mutation succeeded. Existing General, Email, Language, Lock, and Near Expiry saves all preserve dirty state on failure and clear it on success, so their mutation code can be retained behind the contract. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:48-65] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/EmailReceiptsSettingsTab.tsx:37-50] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/LanguageSettingsTab.tsx:36-47] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx:21-28] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx:25-37]

Special adapters:

- Billing registers `dirty || labelsDirty`, saves only dirty sections sequentially, and clears each flag only after its mutation succeeds. Its current two flags are verbatim `dirty` and `labelsDirty`. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:37-71] If tax-inclusive mode changed, surface the existing tax warning as registration metadata inside the shared guard and invoke a confirmed save path, avoiding nested dialogs. The current direct Save already has a nested confirmation. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:215-246]
- Hardware must change from optimistic auto-save/blur-save to a local event-dirty draft with one explicit async Save, then register it like other forms. Its current `patchReceipt` mutates on select/checkbox changes and free-text blur. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:66-97] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:162-288] Logo upload is an immediate standalone mutation, so there is no unsaved logo value to register after it completes. [VERIFIED: src/features/upload-logo/ui/LogoUploader.tsx:14-51]
- Email's `testRecipient` is an operational test-send input, while only `fromEmail` is persisted by Save; do not pretend Save persists the test recipient. These field names and mutation payload are quoted verbatim. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/EmailReceiptsSettingsTab.tsx:17-50]
- Backup exposes create/restore actions and a restore confirmation, but no editable draft, so it does not register dirty state. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/BackupSettingsTab.tsx:17-51]

Discard should reset local fields to the last loaded server values before clearing dirty, even though most continuations unmount the form. This prevents a rare failed/cancelled continuation from leaving unsaved values marked pristine.

### Pattern 9: Focus-scoped Cash Tender Buffer

Create one CashTenderInput used by the main cash `tenderedAmount` and each split row's cash `tenderedAmount`; do not attach it to split `amount`. Those field names and placements are quoted from PaymentForm. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:1099-1128] [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:1261-1307]

Refactor MoneyInput minimally so this feature can control its raw display text while preserving the existing numeric `value`/`onChange` behavior for every other caller. A raw string buffer is necessary for intermediate values such as a trailing decimal; the current parser immediately converts text to a number and the component intentionally ignores prop changes while focused. [VERIFIED: src/shared/ui/MoneyInput.tsx:41-49] [VERIFIED: src/shared/ui/MoneyInput.tsx:75-112]

Put decimal editing in a pure reducer shared by pointer and keyboard intents. Digits append normally, decimal is unique, Backspace removes one character, Delete/Clear resets, and blur formats two decimals. After Exact/quick tender, mark the buffer as preset-selected; the next digit or decimal starts a new buffer, then subsequent keys append. These are the locked exact behaviors. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:65-76]

Use the existing shared Popover as a controlled, non-modal anchored surface. Radix Popover supports controlled open, optional Anchor, automatic collision placement, customizable focus, and outside-interaction callbacks. [CITED: https://www.radix-ui.com/primitives/docs/components/popover] Open on input focus; prevent open auto-focus from unexpectedly moving the caret; close on Escape/outside; allow Tab to reach each keypad button.

Handle physical keyboard input only while this tender control is active/open, not with an always-on window listener. The existing PIN and weight keypads demonstrate the necessary add/remove-listener symmetry, but their global window listeners would collide if copied while the focused input also handles the same key. [VERIFIED: src/shared/ui/PINKeypad.tsx:70-88] [VERIFIED: src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:62-79] Every key button must be `type="button"`, translated by aria-label, touch-sized using the established `h-16`/three-column visual pattern, and disabled with processing. The existing PIN keypad's exact touch class starts `'h-16 w-full'`. [VERIFIED: src/shared/ui/PINKeypad.tsx:35-38]

Consume Enter in the active keypad/input path without invoking payment; keep payment as a separate `type="button"`. The current primary and cancel controls are already buttons rather than form submits. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:1402-1444]

### Anti-Patterns to Avoid

- **Multiple persistence owners:** Do not let PaymentForm and cartStore write separate sale snapshots; lifecycle operations will tear across keys.
- **Partial recovery:** Do not restore individually valid cart lines out of an invalid envelope; malformed or obsolete active state must become empty.
- **Ref-only submission identity:** Do not rely on either PaymentForm's or useCheckoutSale's React ref across process restart. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:238] [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:87-88]
- **Mutation-as-status-query:** Do not invoke `process-direct-sale` automatically during recovery.
- **Receipt through normal success effects:** Do not send recovered completion through the automatic drawer/print branch.
- **Render-only lock:** Do not leave scan/event/store mutation paths live behind a visually blocking screen.
- **Dirty by equality comparison:** Do not clear dirty when a user manually reverts a value; only explicit Save or Discard clears it.
- **Patching every NavLink:** Do not add per-link confirmation logic; use Router's blocker and a coordinator for pre-navigation side effects.
- **Logging out before blocking:** Do not mutate auth state and then hope `useBlocker` can undo it.
- **Reusing ConfirmDialog:** Its two-action and Enter-confirm semantics contradict this exit guard.
- **Ignoring Hardware:** Auto-save and blur-save are editable settings behavior and must be refactored into the common contract.
- **Numeric-only keypad state:** A number cannot preserve decimal-entry intent or trailing decimal text.
- **Global keypad listener:** It can double-handle focused input events and intercept unrelated payment controls.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Versioned JSON persistence | Ad hoc `JSON.parse`/`JSON.stringify` scattered across components | Existing Zustand `persist` plus one Zod merge/normalization boundary | The middleware already supplies partialization/version/migration/hydration hooks; Zod supplies full-shape validation. [CITED: https://zustand.docs.pmnd.rs/reference/middlewares/persist] |
| SPA route interception | Click handlers on Sidebar links and every programmatic navigate call | React Router `useBlocker` | It owns browser history transitions and exposes proceed/reset state. [CITED: https://reactrouter.com/api/hooks/useBlocker] |
| Browser hard-close dialog | Custom async modal in `beforeunload` | `useBeforeUnload` and the browser-native prompt | Browsers restrict this event to a generic platform string and may not reliably fire it. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event] |
| Native close interception | Rust window hooks or process termination | Tauri JS `onCloseRequested` plus allowed `close()` | The installed API supplies a cancellable event and unlisten lifecycle; the capability already allows close. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] [VERIFIED: src-tauri/capabilities/default.json:9-21] |
| Accessible modal mechanics | Focus trap, announcements, and Escape behavior from scratch | Existing Radix AlertDialog primitives | Radix provides controlled state, focus trapping, accessible Title/Description, and keyboard behavior. [CITED: https://www.radix-ui.com/primitives/docs/components/alert-dialog] |
| Floating keypad geometry | Manual absolute positioning and viewport math | Existing Radix Popover wrapper | Popover supplies anchoring, side/alignment, collision, focus, and outside interactions. [CITED: https://www.radix-ui.com/primitives/docs/components/popover] |
| Completed receipt reconstruction | Persisting an entire response receipt or rebuilding another receipt mapper | Existing `fetchReceiptDataForPayment` and ReceiptPreview | Existing code already groups split legs and provides print/email/PDF actions. [VERIFIED: src/entities/payment/model/queries.ts:111-227] [VERIFIED: src/features/process-payment/ui/ReceiptPreview.tsx:28-107] |
| New payment retry path | A second payment processor or newly generated key | Existing direct-sale processors with `idempotencyKeyOverride` | The current path already forwards the same identity to the authoritative atomic RPC. [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:96-145] |
| Decimal editing in React effects | Derived-state synchronization and string/number effects spread through PaymentForm | One pure cash-tender buffer reducer | Both on-screen and physical keys need identical deterministic intent handling; pure transitions are directly unit-testable. |

**Key insight:** the deceptively hard parts are ownership and transition ordering. The libraries already solve persistence hooks, navigation state, native close events, accessible dialogs, and anchored overlays; Phase 30 should supply only the domain-specific sale/exit/keypad state machines.

## Common Pitfalls

### Pitfall 1: Trusting the Persisted Caja Cache During Startup

**What goes wrong:** A stale locally persisted caja appears open for a moment, so the app offers a sale that belongs to a closed or different caja.

**Why it happens:** `useCajaStore` itself is persisted, while the authoritative `useCurrentCaja` query updates it later in an effect. [VERIFIED: src/entities/caja/model/store.ts:24-53] [VERIFIED: src/entities/caja/model/queries.ts:61-103]

**How to avoid:** Gate all recovery UI until auth and the current-caja query have definitively succeeded; compare persisted owner ID to the returned open caja and clear on null/mismatch.

**Warning signs:** The recovery prompt flashes before caja loading completes, or tests can recover after seeding a closed persisted caja.

### Pitfall 2: Dispatching Before the Key Is Durably Stored

**What goes wrong:** The backend completes a payment, the app crashes, and restart has no identity with which to reconcile it.

**Why it happens:** Both current idempotency holders are React refs, and the key is generated directly before the processor call. [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.ts:87-126] [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:459-520]

**How to avoid:** Make persistence of the submission checkpoint a precondition of the network call; on storage failure, do not submit.

**Warning signs:** A test can observe `callProcessDirectSale` before the persisted attempt exists, or a storage-throw test still reaches the mock processor.

### Pitfall 3: Treating Every Payment Error as Definitively Incomplete

**What goes wrong:** A network interruption exposes Pay immediately even though the original request may still commit.

**Why it happens:** The current failure branch retains the in-memory key but returns to interactive payment UI for most errors. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:545-565]

**How to avoid:** Classify explicit server rejection separately from ambiguous transport/receipt-fetch failures; ambiguous results enter the same blocking reconciliation state used after restart.

**Warning signs:** Pay is enabled after a timed-out request without a status read, or a new key appears after any failed submitted attempt.

### Pitfall 4: Replaying Under a Different Cashier to Discover Status

**What goes wrong:** A recovered sale completed under cashier A, cashier B calls the mutation with the same key, and the RPC returns the exact error code `'IDEMPOTENCY_UNAUTHORIZED'` because existing replay is staff/shift-bound.

**Why it happens:** The current atomic function compares the existing tab's staff, shift, and caja to the supplied identities before returning an idempotent result. [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203]

**How to avoid:** Use the read-only RLS lookup for status. If a deliberate retry by another cashier races with the original transaction and receives that code, return to reconciliation; do not generate a new key.

**Warning signs:** Cross-cashier recovery calls `process-direct-sale` automatically, or the code treats that error as permission to replace the identity.

### Pitfall 5: Reusing the Normal Success Branch for Recovered Receipts

**What goes wrong:** Restart reconciliation finds a completed cash sale and opens the drawer/prints it again.

**Why it happens:** PaymentForm's normal success effect performs those hardware actions automatically. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:567-596]

**How to avoid:** Render ReceiptPreview directly with the reconstructed receipt; all output actions then remain deliberate button clicks. [VERIFIED: src/features/process-payment/ui/ReceiptPreview.tsx:28-107]

**Warning signs:** Recovery tests observe `openCashDrawer` or `printReceipt` before the user activates a receipt action.

### Pitfall 6: Reset Effects Overwrite a Restored Draft

**What goes wrong:** PaymentForm mounts with restored values, then its existing tab-change reset effect replaces them with defaults.

**Why it happens:** The effect resets every payment/draft field whenever `tab.id` or enabled-method dependencies change. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:240-271]

**How to avoid:** Initialize once from a validated `initialDraft` and make resets distinguish a new sale from recovery; test hydration after all effects settle.

**Warning signs:** The Resume preview is correct but Checkout opens on cash/zero/default values.

### Pitfall 7: Promotion-only Stale Validation

**What goes wrong:** Restored non-promoted price or stock changes reach Pay without review.

**Why it happens:** Current reconnect logic skips every line without `promotionId` and records only `priceConflict`. [VERIFIED: src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx:121-169] [VERIFIED: src/shared/lib/domain.ts:1140-1145]

**How to avoid:** Compare all lines against a freshly fetched catalog/inventory and promotion evaluation; store displayable saved/current conflict detail and require acknowledgement/removal.

**Warning signs:** Tests only cover deleted promotions, or the UI cannot render the old and new stock values together.

### Pitfall 8: A Route Blocker Cannot Undo Earlier Side Effects

**What goes wrong:** The Settings route stays visible after the user chooses Stay, but the cashier is already logged out.

**Why it happens:** Sidebar currently runs `logout()` before `navigate('/login')`; the blocker sees only the latter. [VERIFIED: src/widgets/AppShell/ui/Sidebar.tsx:172-175]

**How to avoid:** Put sign-out itself in the exit coordinator's deferred continuation.

**Warning signs:** Stay leaves the login screen, clears staff state, or closes another overlay unrelated to the pending route.

### Pitfall 9: Pending Exit Gets Replaced

**What goes wrong:** While the guard is open, a second click overwrites the original tab/route/close target, so Save continues somewhere unexpected.

**Why it happens:** Multiple exit sources can fire while one controlled dialog is active.

**How to avoid:** Accept exactly one pending exit; disable or ignore later exit requests until Save/Discard/Stay resolves it.

**Warning signs:** Dialog copy or destination changes while it is already open.

### Pitfall 10: Save Returns `void`, So the Coordinator Guesses

**What goes wrong:** The guard closes and navigation proceeds after validation or mutation failure.

**Why it happens:** Existing form saves display a toast and return without a shared success value. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:48-65] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx:25-37]

**How to avoid:** Each adapter returns a structured result with translated actionable failure copy; only success clears dirty and invokes the continuation.

**Warning signs:** Tests must infer success from `isPending`, or a failed save unmounts the form.

### Pitfall 11: Tauri Close Recursion or Force-destroy

**What goes wrong:** Calling `close()` after Discard reopens the guard forever, or using `destroy()` bypasses capability/security expectations.

**Why it happens:** Tauri documents that `close()` emits another close-request event; current capabilities grant only `'core:window:allow-close'`. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#close] [VERIFIED: src-tauri/capabilities/default.json:9-21]

**How to avoid:** Use a one-shot bypass for the second event and cleanup the listener; do not request force-destroy permission.

**Warning signs:** Two dialogs appear, close never completes, or a capability-file edit adds destroy.

### Pitfall 12: Hardware and Billing Do Not Fit a Naive One-save Adapter

**What goes wrong:** Hardware silently remains auto-save, or Billing saves one dirty section and discards the other.

**Why it happens:** Hardware currently uses optimistic mutation/blur persistence, while Billing has two separate flags and save paths. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx:66-97] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:37-105] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:248-299]

**How to avoid:** Refactor Hardware into explicit draft/save; make Billing's exit save sequentially commit all dirty sections and surface the tax warning within the shared guard.

**Warning signs:** A tab-switch test passes for General but there is no Hardware/Billing scenario.

### Pitfall 13: Keypad and Input Both Handle One Physical Key

**What goes wrong:** One digit appears twice, Backspace removes two characters, or typing elsewhere changes tendered cash.

**Why it happens:** Existing keypad patterns attach window listeners, while MoneyInput independently handles input text. [VERIFIED: src/shared/ui/PINKeypad.tsx:70-88] [VERIFIED: src/shared/ui/MoneyInput.tsx:91-98]

**How to avoid:** Route pointer and keyboard intents through one focus-scoped reducer and stop handling when the Popover is closed/disabled.

**Warning signs:** `1`, `0`, `0` becomes an unexpected amount, or key events fire while card/reference controls are focused.

### Pitfall 14: Quick Tender Loses Replacement Intent

**What goes wrong:** Selecting a preset and then pressing `1` appends to the preset instead of replacing it.

**Why it happens:** The numeric tender value alone cannot distinguish preset selection from manual input.

**How to avoid:** Persist a transient `presetArmed` editing flag in the CashTenderInput; consume it on the first subsequent keypad/physical numeric intent. The behavior itself is locked. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:68-73]

**Warning signs:** Unit tests assert only resulting numbers and omit preset-then-digit sequences.

## Code Examples

The snippets below are constrained patterns. Existing discrete values are quoted verbatim beside their repository source; new domain schema values should be defined and Zod-validated in the implementation task rather than copied blindly from this research.

### Existing Persist/Validate Boundary to Extend

The current source-of-truth values are verbatim key `'direct-sale-held-cart'`, version `1`, and property `heldCart`. [VERIFIED: src/entities/tab/model/cartStore.ts:100-108]

```typescript
// Source: src/entities/tab/model/cartStore.ts:365-390
{
  name: HELD_CART_STORE_NAME,
  version: HELD_CART_STORE_VERSION,
  partialize: state => ({ heldCart: state.heldCart }),
  migrate: (_persistedState, version) => {
    if (version !== HELD_CART_STORE_VERSION) return { heldCart: null };
    return _persistedState as { heldCart: unknown };
  },
  merge: (persistedState, currentState) => ({
    ...currentState,
    heldCart: normalizePersistedHeldCart(
      (persistedState as { heldCart?: unknown } | undefined)?.heldCart
    ),
  }),
}
```

The Phase 30 action should extend this single boundary with a whole-envelope safe parse; it should not repeat this snippet in a second store.

### Router Blocker Drives a Controlled Dialog

React Router's documented blocker state values are verbatim `'blocked'`, `'proceeding'`, and `'unblocked'`; the documented continuations are `proceed()` and `reset()`. [CITED: https://reactrouter.com/api/hooks/useBlocker]

```typescript
// Source pattern: https://reactrouter.com/api/hooks/useBlocker
const blocker = useBlocker(isDirty);

if (blocker.state === 'blocked') {
  // Save success or Discard:
  blocker.proceed();

  // Stay:
  blocker.reset();
}
```

The real coordinator must keep the pending target stable, await the owner save result, and clear its active dirty registration before `proceed()`.

### Tauri Close Guard with One-shot Re-entry

The exact installed import is `@tauri-apps/api/window`, and the allowed operation is verbatim `'core:window:allow-close'`. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] [VERIFIED: src-tauri/capabilities/default.json:9-15]

```typescript
// Source APIs: Tauri 2 window reference
const appWindow = getCurrentWindow();
const unlisten = await appWindow.onCloseRequested(event => {
  if (allowCloseOnce.current) {
    allowCloseOnce.current = false;
    return;
  }
  if (!activeFormRef.current?.isDirty) return;

  event.preventDefault();
  requestNativeCloseDecision();
});

// After awaited Save success or Discard:
allowCloseOnce.current = true;
await appWindow.close();

// Effect cleanup:
unlisten();
```

`close()` deliberately emits a second close request, hence the one-shot bypass. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#close]

### Read-only Original-key Lookup Skeleton

The database identifiers below are verbatim `payments`, `idempotency_key`, `tab_id`, `payment_group_id`, `tabs`, and `caja_session_id`; split replay uses the verbatim suffix `'-leg0'`. [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203]

```typescript
// Recommended Supabase query shape; read-only and parameterized.
const lookupKeys = [idempotencyKey, `${idempotencyKey}-leg0`];
const { data, error } = await supabase
  .from('payments')
  .select('tab_id, payment_group_id, tab:tabs!inner(caja_session_id)')
  .in('idempotency_key', lookupKeys)
  .eq('tab.caja_session_id', cajaSessionId)
  .order('processed_at', { ascending: true })
  .limit(1)
  .maybeSingle();
```

Validate the returned shape before mapping it to recovery state. A query error maps to unknown; successful `data === null` maps to incomplete; a row maps to receipt reconstruction.

### Controlled Async Alert Dialog Action

Radix documents controlled state and programmatic close after an async form operation. [CITED: https://www.radix-ui.com/primitives/docs/components/alert-dialog]

```typescript
// Keep Save as a normal button inside controlled AlertDialog.Content.
async function onSaveForExit() {
  setSaving(true);
  const result = await activeForm.save();
  setSaving(false);

  if (!result.ok) {
    setInlineError(result.error.message);
    return;
  }

  continuePendingExit();
}
```

The implementation should use the repository's existing `Result`/translated error conventions rather than inventing a boolean-only error channel. [VERIFIED: src/shared/lib/result.ts:1-80]

## State of the Art

| Older/local approach | Current recommended approach | Evidence/when | Impact for Phase 30 |
|----------------------|------------------------------|---------------|---------------------|
| Component-specific raw localStorage parsing | Zustand persist with `partialize`, version/migration, merge, and an application Zod validation boundary | Current Zustand 5 docs and existing cart store. [CITED: https://zustand.docs.pmnd.rs/reference/middlewares/persist] [VERIFIED: src/entities/tab/model/cartStore.ts:365-390] | Extend one envelope and preserve fail-closed hydration. |
| `window.confirm`/experimental router prompt | Stable `useBlocker` with application-owned controlled dialog | React Router marks `unstable_usePrompt` experimental; `useBlocker` exposes proceed/reset. [CITED: https://reactrouter.com/api/hooks/usePrompt] [CITED: https://reactrouter.com/api/hooks/useBlocker] | Enables async Save plus three explicit choices. |
| Always-installed unload listener | Conditional `beforeunload` listener only while dirty | MDN recommends attaching only when unsaved changes exist and documents generic browser copy. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event] | Meets browser behavior without degrading every navigation. |
| Treat native close like browser unload | Tauri cancellable `onCloseRequested` plus deferred `close()` | Tauri 2 official Window API. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#close] | Supports the same async Save/Discard/Stay dialog on desktop. |
| Retry after ambiguous payment failure | Read-only reconciliation, then deliberate same-key retry | Existing unique idempotency index and atomic replay lookup. [VERIFIED: supabase/migrations/20260417000001_payment_processing.sql:19-24] [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203] | Prevents a new payment identity and duplicate sale. |
| Modal/permanent keypad | Non-modal controlled Popover anchored to the focused field | Current Radix Popover API. [CITED: https://www.radix-ui.com/primitives/docs/components/popover] | Preserves form context, collision handling, and keyboard navigation. |
| Global hardware-key listener | Focus/open-scoped shared intent reducer | Existing global keypad listeners show cleanup pattern but also the collision risk. [VERIFIED: src/shared/ui/PINKeypad.tsx:70-88] [VERIFIED: src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx:62-79] | One pointer/keyboard behavior, no double input or accidental submit. |

**Deprecated/outdated for this phase:**

- `unstable_usePrompt`: do not use; its unstable browser-confirm contract cannot meet the locked async three-action UX. [CITED: https://reactrouter.com/api/hooks/usePrompt]
- `unload`: do not use for guarding data; it is non-cancelable for this purpose and follows `beforeunload`. [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/unload_event]
- Tauri `destroy()`: do not use; it forces close without `closeRequested`, and the repository has no destroy capability. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#destroy] [VERIFIED: src-tauri/capabilities/default.json:9-21]

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| — | None. All factual claims are repository-verified or cited from official documentation; design choices are explicit recommendations within the discretion granted by CONTEXT.md. | — | — |

## Open Questions

No planning blocker remains. The planner should carry these non-blocking verification points into task acceptance criteria:

1. **How should an absent/inactive product or missing inventory row be resolved?**
   - What we know: D-03 requires review of catalog/promotion/stock changes, while the live product query returns active products only. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:26-28] [VERIFIED: src/entities/product/model/queries.ts:136-161]
   - What's unclear: The locked text does not distinguish an acknowledgeable changed value from an unavailable product with no safe current value.
   - Recommendation: Show saved-versus-unavailable detail and require removal; do not offer Accept when the backend cannot price/stock the line.

2. **How much backend polling is needed before declaring an attempt incomplete?**
   - What we know: A successful read with no matching payment is the only safe incomplete signal, and the unique key prevents a second identity. [VERIFIED: supabase/migrations/20260417000001_payment_processing.sql:19-24]
   - What's unclear: No latency budget is locked.
   - Recommendation: Perform one immediate read and one short bounded follow-up before exposing Pay; never poll indefinitely. Even after incomplete, the deliberate retry must use the same key.

3. **Should a stock drop below requested quantity permit acknowledgement?**
   - What we know: D-03 says stock changes can be accepted or the line removed, while the server remains authoritative. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:26-28] [VERIFIED: supabase/functions/process-direct-sale/index.ts:309-343]
   - What's unclear: The recovery copy for insufficient current stock is not specified.
   - Recommendation: Allow acknowledgement only as an explicit decision but keep server validation authoritative; label the shortage clearly and test the eventual server rejection path. If product/inventory is absent, use removal-only as above.

## Environment Availability

The probes below were run on 2026-09-08 without reading or printing credential values. [VERIFIED: environment probe 2026-09-08]

| Dependency | Required by | Available | Version/status | Fallback |
|------------|-------------|-----------|----------------|----------|
| Node.js | Vite/Vitest/build | Yes | `v25.8.0` | — [VERIFIED: environment probe 2026-09-08] |
| npm | scripts and registry checks | Yes | `11.11.0` | — [VERIFIED: environment probe 2026-09-08] |
| Rust compiler / Cargo | Tauri production build | Yes | `rustc 1.98.1`; `cargo 1.98.1` | — [VERIFIED: environment probe 2026-09-08] |
| Tauri CLI | Native close verification/build | Yes | `tauri-cli 2.10.1` | Mock JS API in unit tests; production build remains available. [VERIFIED: environment probe 2026-09-08] |
| Supabase CLI | Backend/local integration | Yes | `2.116.0` | — [VERIFIED: environment probe 2026-09-08] |
| Playwright CLI | Headless acceptance | Yes | `1.59.1` | — [VERIFIED: environment probe 2026-09-08] |
| Docker CLI | Local Supabase | Yes | `28.3.3` | — [VERIFIED: environment probe 2026-09-08] |
| Docker Desktop/Linux engine | Local Supabase service | No | Named-pipe engine unavailable during probe | Start Docker Desktop before local integration/E2E; otherwise use only a confirmed isolated remote test project. [VERIFIED: environment probe 2026-09-08] |
| Unit test configuration | Wave 0/unit work | Yes | jsdom unit project in `vitest.config.ts` | — [VERIFIED: vitest.config.ts:53-78] |
| Integration test environment variables | Real-Supabase tests | Config file present, values intentionally not inspected | `.env.local` exists; setup validates URL/service key at runtime | Stop with actionable setup error if absent/unreachable. [VERIFIED: src/test/global-setup.ts:5-36] |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** the local Supabase service was not running because the Docker engine was unavailable. Start Docker Desktop before schema/RPC or local E2E verification. Do not redirect destructive integration fixtures to a production project. [VERIFIED: environment probe 2026-09-08] [VERIFIED: e2e/global-setup.ts:48-55]

## Validation Architecture

Nyquist validation, TDD mode, UI review, and security enforcement are enabled; the exact values are `"nyquist_validation": true`, `"tdd_mode": true`, `"ui_review": true`, and `"security_enforcement": true`. [VERIFIED: .planning/config.json:20-53]

### Test Framework

| Property | Value |
|----------|-------|
| Unit/integration framework | Vitest `5.0.0`; jsdom unit and integration projects. [VERIFIED: package-lock.json:21547-21548] [VERIFIED: vitest.config.ts:53-99] |
| Browser E2E | Playwright `1.59.1`, headless Chromium, one worker. [VERIFIED: package-lock.json:3033-3034] [VERIFIED: playwright.config.ts:43-99] |
| Config files | `vitest.config.ts`; `playwright.config.ts`. [VERIFIED: vitest.config.ts:1-103] [VERIFIED: playwright.config.ts:1-105] |
| Quick unit command | `npm test -- src/entities/tab/model/cartStore.test.ts src/features/checkout-sale/model/useCheckoutSale.test.ts src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx src/widgets/PaymentModal/ui/PaymentForm.test.tsx` [VERIFIED: package.json:15-17] |
| Narrow integration command | `npm exec vitest run --project integration src/features/checkout-sale/model/reconcileDirectSale.integration.test.ts --reporter=dot` [VERIFIED: vitest.config.ts:80-97] |
| Narrow E2E command | `npm run test:e2e -- e2e/payments/checkout-continuity.spec.ts e2e/settings/settings-exit-guard.spec.ts e2e/payments/cash-tender-keypad.spec.ts --project=chromium` [VERIFIED: package.json:29-33] [VERIFIED: playwright.config.ts:94-105] |
| Full phase gate | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, then `npm run test:e2e`. [VERIFIED: AGENTS.md:16-23] |

### Phase Requirements to Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| CART-01 | Every cart mutation persists active cart; restart restores exact valid state for another cashier; malformed/obsolete/partial payload restores empty; held slot migration remains safe. | Unit + E2E | `npm test -- src/entities/tab/model/cartStore.test.ts`; `npm run test:e2e -- e2e/payments/checkout-continuity.spec.ts --project=chromium` | Existing store test needs extension; E2E is Wave 0. [VERIFIED: src/entities/tab/model/cartStore.test.ts:1-220] |
| CART-02 | Resume preview and PaymentForm restore all whitelisted draft fields after reload, while serialized bytes exclude PIN/credential/raw-card fields. | Unit + E2E | `npm test -- src/widgets/PaymentModal/ui/PaymentForm.test.tsx`; same continuity E2E | Existing PaymentForm test needs extension; E2E is Wave 0. [VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.test.tsx:1-80] |
| CART-03 | Complete/clear/discard remove active envelope; Cancel Checkout clears draft/open marker only; caja close/mismatch clears active recovery. | Unit + component | `npm test -- src/entities/tab/model/cartStore.test.ts src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` | Store test exists; CheckoutPanel test is Wave 0. |
| CART-04 | Submitted key is stored before dispatch; completed/incomplete/unknown map correctly; same key crosses restart; completed recovery does not auto-print; database contains no duplicate. | Unit + real-Supabase integration + E2E | `npm test -- src/features/checkout-sale/model/useCheckoutSale.test.ts`; narrow integration and continuity E2E commands above | Existing hook test needs extension; reconciliation integration/E2E are Wave 0. [VERIFIED: src/features/checkout-sale/model/useCheckoutSale.test.ts:1-60] |
| SET-01 | Every editable persisted form registers event-dirty; tab, route, sign-out, Tauri close show three actions; browser unload is prevented while dirty; Escape/outside/X mean Stay. | Component + E2E | `npm test -- src/features/guard-settings-exit/model/SettingsExitGuardProvider.test.tsx src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx`; narrow Settings E2E above | Provider test/E2E are Wave 0; panel test exists. [VERIFIED: src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx:1-99] |
| SET-02 | Save awaits success and continues once; failed validation/mutation stays open with preserved values/error; Discard resets/continues; Stay cancels; Billing dual dirty and Hardware explicit save work. | Component + E2E | same Settings unit/E2E commands | Wave 0 plus extensions to existing tab tests. [VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx:1-80] [VERIFIED: src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.test.tsx:1-80] |
| KEYPAD-01 | Main and split cash tender only; decimal/clear/backspace/Delete/digits; preset replacement; disabled processing; translated aria; Enter no Pay; restored amount. | Pure unit + component + E2E | `npm test -- src/features/cash-tender-keypad/model/cashTenderBuffer.test.ts src/features/cash-tender-keypad/ui/CashTenderInput.test.tsx src/widgets/PaymentModal/ui/PaymentForm.test.tsx`; narrow keypad E2E above | New reducer/component/E2E are Wave 0; PaymentForm test exists. |

### Required Assertions Beyond Happy Paths

- Inspect the raw persisted JSON and assert forbidden field names/known PIN test values are absent, not merely that restored state omits them.
- Inject malformed nested product, split leg, money, and attempt values; assert the entire active sale becomes empty and no partial line survives.
- Make the storage adapter throw at submission checkpoint; assert the processor is never called.
- Simulate a transport error after processor invocation; assert cart and Pay remain locked until reconciliation.
- Seed both single-tender base key and split `'-leg0'` rows; assert one sale-level receipt and no automatic drawer/print call. The suffix is verbatim from the atomic function. [VERIFIED: supabase/migrations/20260904000001_promotion_targets_recurrence.sql:187-203]
- Resume under a different authenticated cashier; assert the same local sale/draft and read-only completed lookup, never mutation replay for discovery.
- Exercise each Settings exit source and all Save/Discard/Stay branches, including save rejection and repeated close/navigation clicks.
- Assert dirty remains true after editing back to the original value.
- Assert Hardware and both Billing dirty sections participate; assert Backup does not register a draft.
- Exercise pointer, top-row digits, numpad digits, decimal, Backspace, Delete, Clear, Exact/preset-then-digit, Tab focus order, Escape, and Enter.
- Run accessibility assertions for dialog name/description, live recovery status, keypad group name, translated key labels, focus return, and disabled processing.

### Sampling Rate

- **Per task commit:** Run the narrowest affected unit file(s), then `npm run typecheck` and `npm run lint`. [VERIFIED: AGENTS.md:16-23] [VERIFIED: AGENTS.md:29-31]
- **Per wave merge:** Run all Phase 30 unit files; run the reconciliation integration test for backend/query waves and the three narrow Playwright specs for UI waves.
- **Phase gate:** Run lint, typecheck, full unit, real-Supabase integration, and full headless Playwright suites before `$gsd-verify-work`. [VERIFIED: AGENTS.md:16-23] [VERIFIED: AGENTS.md:29-31]

### Wave 0 Gaps

- [ ] Extend `src/entities/tab/model/cartStore.test.ts` for active envelope, migration, corruption, caja, clear/cancel, and submitted lock.
- [ ] Add `src/features/checkout-sale/model/directSaleRecovery.test.ts` for schema whitelisting and pure transition precedence.
- [ ] Add `src/features/checkout-sale/model/reconcileDirectSale.integration.test.ts` for base/split key, caja binding, RLS, completed/incomplete, and duplicate count.
- [ ] Add `src/widgets/CheckoutPanel/ui/CheckoutPanel.test.tsx` for resume/discard/reconciling/unknown/recovered receipt/no auto-print.
- [ ] Extend `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` for draft hydration, persist-before-call, same-key retry, and keypad placement.
- [ ] Add `src/features/guard-settings-exit/model/SettingsExitGuardProvider.test.tsx` for blocker, beforeunload, mocked Tauri close, recursion bypass, failed save, and side-effect deferral.
- [ ] Extend Settings panel/form tests for controlled tab switching, every editable owner, Hardware explicit save, and Billing combined save.
- [ ] Add `src/features/cash-tender-keypad/model/cashTenderBuffer.test.ts` and `src/features/cash-tender-keypad/ui/CashTenderInput.test.tsx`.
- [ ] Add `e2e/payments/checkout-continuity.spec.ts`, `e2e/settings/settings-exit-guard.spec.ts`, and `e2e/payments/cash-tender-keypad.spec.ts`.

The framework is already installed; no Wave 0 package task is needed. [VERIFIED: package.json:90-104]

## Security Domain

Security enforcement is enabled at ASVS Level `1`. [VERIFIED: .planning/config.json:47-49] OWASP describes ASVS categories including authentication, session management, access control, validation, cryptography, error handling, data protection, business logic, and APIs. [CITED: https://devguide.owasp.org/en/06-verification/01-guides/03-asvs/]

### Applicable ASVS Categories

| ASVS category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | Yes | Do not reveal recovery until a Supabase-authenticated staff session exists; never persist PINs or credentials. The edge function currently rejects missing/invalid bearer auth. [VERIFIED: supabase/functions/process-direct-sale/index.ts:268-300] |
| V3 Session Management | Yes | Recovery may cross cashier logins, but authentication state itself remains owned by the existing staff/Supabase session; defer logout until guarded exit resolves. [VERIFIED: src/widgets/AppShell/ui/Sidebar.tsx:155-175] |
| V4 Access Control | Yes | Use existing payment/tab RLS and bind lookup to caja; never use service-role credentials in client code. Current SELECT policies are permission/role constrained. [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:484-514] [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:680-695] |
| V5 Validation, Sanitization and Encoding | Yes | Zod-validate the whole persisted envelope and reconciliation response; retain server-side BodySchema validation for mutations. [VERIFIED: src/shared/lib/domain.ts:1131-1146] [VERIFIED: supabase/functions/process-direct-sale/index.ts:6-67] |
| V6 Stored Cryptography | No new cryptographic storage | Do not encrypt credentials into localStorage or invent crypto. Persist only the allowed non-secret sale draft; keep using the existing generated idempotency identity. The generator uses `crypto.randomUUID()`. [VERIFIED: src/shared/lib/domain-helpers.ts:102-116] |
| V7 Error Handling and Logging | Yes | Log event codes/issue counts, not full persisted drafts, PINs, customer phone, or raw backend bodies; show translated actionable errors. Existing invalid-held logging records only `issueCount`. [VERIFIED: src/entities/tab/model/cartStore.ts:110-123] |
| V8 Data Protection | Yes | Minimize/whitelist localStorage and clear it at completion/discard/caja close. OWASP's client-side data protection control says browser storage must not contain sensitive data. [CITED: https://cornucopia.owasp.org/taxonomy/asvs-4.0.3/08-data-protection/02-client-side-data-protection] |
| V11 Business Logic | Yes | Enforce submitted-attempt locking, original-key reuse, no manager bypass for unknown status, and explicit retry. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:39-49] |
| V13 API and Web Service | Yes | Reconciliation is authenticated, read-only, minimum-field, RLS-filtered, shape-validated, and caja-bound. |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Tampered or obsolete localStorage injects malformed product/payment state | Tampering | Whole-envelope Zod `safeParse`, version gate/migration, and fail closed to empty; never partial restore. [VERIFIED: src/entities/tab/model/cartStore.ts:108-123] |
| Credential/PIN/customer data over-persisted or logged | Information disclosure | Explicit schema whitelist; negative raw-JSON tests; exclude manager/staff PIN, auth tokens, raw card data; redact structured logs. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:33-37] |
| Stolen/reused idempotency key probes another caja | Spoofing / information disclosure | Authenticated RLS query, caja join/filter, minimum returned identity, mismatch fail closed. [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:680-695] |
| Crash/timeout followed by new-key payment duplicates a sale | Tampering / repudiation | Persist original key before dispatch, block ambiguous state, read-only reconcile, same-key deliberate retry, unique database index. [VERIFIED: supabase/migrations/20260417000001_payment_processing.sql:19-24] |
| Recovered receipt leaks another sale | Information disclosure | Validate key+caja result under current RLS before receipt reconstruction; never accept a persisted tab ID alone as authorization. |
| Stale local price/promotion/stock bypasses review | Tampering | Fresh authoritative queries, saved/current display, acknowledgement/removal gate, existing server-side direct-sale validation remains final authority. [VERIFIED: src/entities/product/model/queries.ts:136-161] [VERIFIED: supabase/functions/process-direct-sale/index.ts:302-343] |
| Unknown payment status bypassed by manager or UI shortcut | Elevation of privilege / business logic abuse | No bypass; entity actions reject mutation while unresolved; recovery screen exposes only Retry status and close. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:48-49] |
| Settings Save race proceeds before mutation result | Tampering | Await owning structured result, allow one pending exit, keep dialog/draft on failure. |
| Tauri close recursion or listener leak | Denial of service | One-shot close bypass and returned unlisten cleanup. [CITED: https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested] |
| Keypad event crosses focus boundaries or Enter submits | Tampering / accidental action | Focus-scoped handler, shared intent reducer, explicit `type="button"`, disabled processing, Enter consumed without payment. [VERIFIED: .planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-CONTEXT.md:65-76] |

### Security Verification Gates

- Persisted-state tests must scan serialized bytes for forbidden values and inject untrusted nested payloads.
- Reconciliation integration must prove no result without authentication, no caja mismatch disclosure, base/split lookup parity, and one durable payment identity after a retry race.
- No client change may import or expose `SUPABASE_SERVICE_ROLE_KEY`; integration setup may use it only in test infrastructure already designated for real-Supabase tests. [VERIFIED: src/test/global-setup.ts:11-18]
- Logs and inline errors must not contain the idempotency key, PIN, full customer details, or raw persisted envelope.
- Tauri capability changes are unnecessary; adding force-destroy or broader permissions should fail review. [VERIFIED: src-tauri/capabilities/default.json:9-21]

## Sources

### Primary (HIGH confidence)

- Repository source-of-truth files: `cartStore.ts`, `domain.ts`, `useCheckoutSale.ts`, `PaymentForm.tsx`, `CheckoutPanel.tsx`, Settings tabs/panel, Router/Sidebar, receipt query/preview, Tauri capabilities, direct-sale Edge Function, current SQL migrations, test configs, and AGENTS.md—all opened in this session.
- npm registry checks on 2026-09-08 for installed versions and publish timestamps of React, Zustand, Zod, React Router DOM, Tauri API, Supabase JS, TanStack Query, Radix packages, Vitest, and Playwright. [VERIFIED: npm registry]
- Installed package source for Zustand persistence and Radix AlertDialog outside-pointer behavior, used only where official public docs did not expose the implementation detail. [VERIFIED: node_modules/zustand/esm/middleware.mjs:356-371] [VERIFIED: node_modules/@radix-ui/react-alert-dialog/src/alert-dialog.tsx:107-136]

### Secondary (MEDIUM confidence, official documentation fetched through websearch fallback)

- https://zustand.docs.pmnd.rs/reference/middlewares/persist — persist options, version mismatch, migration, merge, and hydration hooks.
- https://reactrouter.com/api/hooks/useBlocker — Declarative-mode SPA blocker, states, proceed/reset, and hard-reload limitation.
- https://reactrouter.com/api/hooks/useBeforeUnload — browser beforeunload hook.
- https://reactrouter.com/api/hooks/usePrompt — unstable browser-confirm wrapper status.
- https://v2.tauri.app/reference/javascript/api/namespacewindow/#oncloserequested — cancellable close request and unlisten lifecycle.
- https://v2.tauri.app/reference/javascript/api/namespacewindow/#close — close emits closeRequested.
- https://www.radix-ui.com/primitives/docs/components/alert-dialog — controlled async dialog, focus trap, announcements, and Escape behavior.
- https://www.radix-ui.com/primitives/docs/components/popover — controlled non-modal Popover, Anchor, focus, collision, and outside-interaction API.
- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event — platform-native warning limitations and conditional listener guidance.
- https://devguide.owasp.org/en/06-verification/01-guides/03-asvs/ and https://cornucopia.owasp.org/taxonomy/asvs-4.0.3/08-data-protection/02-client-side-data-protection — ASVS categories and client-side storage control.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every dependency/version was read from the lockfile and confirmed in the npm registry; no new package is proposed.
- Architecture: HIGH — recommendations follow opened current control flow, schemas, RLS, database constraints, and locked CONTEXT decisions.
- External API details: MEDIUM — official docs were fetched through the required websearch fallback after Context7 was selected but unavailable; the seam classified verified websearch as MEDIUM.
- Pitfalls: HIGH — each critical failure mode is tied to current code behavior or a locked recovery outcome.
- Validation: HIGH — existing Vitest/Playwright configuration and current related tests were inspected; all missing Phase 30 files are explicitly Wave 0.
- Security: HIGH for repository controls, MEDIUM for ASVS categorization — repo policies/config were opened; OWASP pages were fetched from official sources.

**Research date:** 2026-09-08

**Valid until:** 2026-10-08. Revalidate React Router/Tauri/Radix APIs only if dependencies change; repository-specific findings remain valid until the cited files change.
