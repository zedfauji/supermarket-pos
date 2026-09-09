# Phase 30: Checkout Continuity, Settings Exit Guard & Cash Keypad - Context

**Gathered:** 2026-09-07
**Updated:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Make one terminal's unfinished direct-sale cart and Checkout draft survive an application restart,
reconcile any payment that was already submitted before permitting another attempt, protect every
editable Settings form from accidental loss on all exit paths, and add a touch-friendly cash
amount-tendered keypad. This phase does not add cart synchronization between terminals, persist
credentials or raw card data, change payment-provider behavior, or redesign Checkout beyond the
recovery and keypad surfaces.

</domain>

<decisions>
## Implementation Decisions

### Restore experience and stale data
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

### Payment recovery outcomes
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

### Settings exit details
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

### Cash keypad interaction
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

### Approved UI design contract
- **D-21:** `.planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-UI-SPEC.md`
  is the binding contract for exact copy, layout, focus behavior, responsive states, accessibility,
  and automated interaction acceptance. Reuse the existing Radix/shadcn primitives and keypad/input
  patterns identified there; add no new UI system or keypad dependency.

### the agent's Discretion
- Exact persisted store key, schema version, and migration mechanics, provided all restored payloads
  are schema-validated and malformed/obsolete data fails closed.
- The smallest shared dirty-form registration mechanism that lets each existing tab retain ownership
  of its values and async save mutation.
- Exact recovery-status query/RPC shape and polling details; the outcome state machine in D-07–D-10
  is fixed.
- Keypad component factoring and internal state ownership within the UI contract's fixed popover,
  responsive, motion, and translated-copy behavior.
- Exact automated-test split between colocated Vitest and Playwright, provided all Phase 30
  requirements receive automated coverage.

### Folded Todos

None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contracts
- `.planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-UI-SPEC.md` — approved,
  binding UI, interaction, copy, responsive, accessibility, and automated-acceptance contract.
- `.planning/phases/30-checkout-continuity-settings-exit-guard-cash-keypad/30-RESEARCH.md` — validated
  implementation constraints and reuse guidance supporting D-01 through D-21.

### Planning and requirements
- `.planning/PROJECT.md` — product scope and project-level constraints.
- `.planning/REQUIREMENTS.md` § Phase 30 Requirements — CART-01..04, SET-01..02, and KEYPAD-01,
  including required automated coverage.
- `.planning/ROADMAP.md` § Phase 30 — phase goal, dependency statement, and UI designation.

### Cart, caja, and Checkout recovery
- `src/shared/lib/domain.ts` — Zod-backed CartItem, payment, caja, and receipt domain shapes.
- `src/entities/tab/model/cartStore.ts` — active/held cart actions, current held-cart persistence,
  schema-validation pattern, and existing promotion-conflict actions.
- `src/entities/tab/model/cartStore.test.ts` — restart hydration, malformed payload, obsolete-version,
  and held-cart persistence test patterns.
- `src/entities/caja/model/store.ts` — persisted caja identity and the `clearCaja` lifecycle boundary.
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` — owns `paymentOpen`, cart clearing, conflict gating,
  and PaymentForm mounting for direct sales.
- `src/features/checkout-sale/model/useCheckoutSale.ts` — direct-sale processors, existing
  idempotency-key ref/override, and reset semantics.
- `src/features/checkout-sale/model/useCheckoutSale.test.ts` — processor and idempotency unit-test
  seam.
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` — current local Checkout draft, payment state machine,
  receipt transition, tendered amount, and quick-tender controls.
- `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` — current payment interaction coverage.
- `supabase/functions/process-direct-sale/index.ts` — client-to-database direct-sale boundary.
- `supabase/migrations/20260813000001_process_direct_sale_atomic.sql` — authoritative atomic direct-sale
  transaction and idempotency contract.
- `supabase/migrations/20260813000002_fix_direct_sale_split_idempotency.sql` — split-payment
  idempotency behavior that recovery must preserve.

### Settings exit protection
- `src/widgets/SettingsTabsPanel/index.tsx` — uncontrolled Settings tab composition and the common
  parent integration point for dirty-tab switching.
- `src/widgets/SettingsTabsPanel/SettingsTabsPanel.test.tsx` — role-filtered tab composition tests.
- `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx` — representative local dirty flag and
  async settings mutation.
- `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` — dirty form with an existing nested
  confirmation flow.
- `src/widgets/SettingsTabsPanel/tabs/EmailReceiptsSettingsTab.tsx` — dirty receipt-email settings.
- `src/widgets/SettingsTabsPanel/tabs/LanguageSettingsTab.tsx` — cashier-accessible dirty setting and
  staff-owned save mutation.
- `src/widgets/SettingsTabsPanel/tabs/LockSettingsTab.tsx` — dirty terminal-lock setting with a
  distinct mutation.
- `src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx` — dirty setting with local validation.
- `src/app/router.tsx` — BrowserRouter route boundary where route-exit blocking must integrate.
- `src/widgets/AppShell/ui/Sidebar.tsx` — primary NavLink and programmatic navigation exits.

### Cash keypad and accessibility
- `src/shared/ui/MoneyInput.tsx` — decimal input and integer-cent parsing/display behavior.
- `src/shared/ui/PINKeypad.tsx` — existing accessible 3-column touch keypad and hardware-key pattern.
- `src/features/add-loose-weight-item/ui/WeightEntryDialog.tsx` — existing decimal keypad interaction
  pattern.
- `src/shared/lib/i18n/locales/en-US/wPanels.json` — English Checkout labels and quick-tender copy.
- `src/shared/lib/i18n/locales/es-MX/wPanels.json` — Spanish Checkout labels and quick-tender copy.
- `src/shared/lib/i18n/locales/en-US/settings.json` — English Settings navigation copy.
- `src/shared/lib/i18n/locales/es-MX/settings.json` — Spanish Settings navigation copy.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useCartStore` already uses Zustand persistence with a version, `partialize`, migration, Zod
  validation on merge, and fail-closed hydration for the held-cart slot. Extend this established
  pattern for active-sale persistence instead of creating a second persistence framework.
- `flagPriceConflict` and `resolveConflict` already preserve the saved line price until explicit
  review, matching D-03's stale-data behavior.
- `useCheckoutSale` already accepts an idempotency-key override and keeps the same key across an
  in-memory retry; persistence/recovery should carry that identity across restart rather than replace
  the transaction path.
- `MoneyInput`, `PINKeypad`, and `WeightEntryDialog` provide the decimal parsing, touch sizing,
  accessible grouping, and physical-key handling patterns needed for the cash keypad.

### Established Patterns
- Cart state belongs to `entities/tab`; route-level Checkout composition stays in `CheckoutPanel`,
  while payment behavior stays in `PaymentForm`/`checkout-sale`.
- Settings forms currently own local draft, dirty, validation, and mutation state. Successful saves
  clear their local dirty flag; failed saves preserve the form. The parent panel currently has no
  contract for observing or invoking those operations.
- Direct-sale completion clears the cart only after the receipt flow finishes; cancelling PaymentForm
  resets the in-memory idempotency key and closes Checkout without clearing the cart.
- The codebase uses translated labels and shared touch-sized controls; new recovery/dialog/keypad copy
  must be added to both `en-US` and `es-MX` catalogs.

### Integration Points
- Persist active cart changes in `cartStore`, but coordinate Checkout draft and recovery-attempt state
  at the existing `CheckoutPanel` / `PaymentForm` boundary.
- Validate a restored sale against the current caja after authentication; caja close is the
  authoritative cleanup trigger.
- Reconciliation connects the persisted idempotency identity to the existing direct-sale backend and
  receipt model before PaymentForm can expose another submission action.
- Settings tab changes are intercepted at controlled `Tabs`; route exits at the React Router/AppShell
  boundary; browser reload with `beforeunload`; native desktop close at the Tauri window boundary.

</code_context>

<specifics>
## Specific Ideas

- The restore prompt should feel like a sale handoff: cashier sees the complete saved basket and
  payment draft before deciding whether to resume or discard.
- The unknown-payment state intentionally has no manager bypass; preventing a duplicate charge takes
  priority over unblocking the terminal.
- The keypad is an amount-entry aid only. It does not replace Exact/quick-tender controls and never
  acts as a payment-submit control.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- `.planning/todos/pending/rename-cargo-package-bar-pos.md` — matched only on the generic keyword
  "pos"; Cargo/package naming is unrelated to Checkout continuity.
- `.planning/todos/pending/rotate-remote-supabase-db-password.md` — operational credential rotation is
  unrelated to this product behavior and remains a standalone pending task.

</deferred>

---

*Phase: 30-checkout-continuity-settings-exit-guard-cash-keypad*
*Context gathered: 2026-09-07; updated: 2026-09-08*
