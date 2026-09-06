# POS Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver restart-safe checkout, unsaved-settings protection, store branding, and touch payment entry locally.

**Architecture:** Extend Zustand persistence and the existing payment contract; use explicit dirty-form registration and supported navigation blocking; reuse the store settings and MoneyInput controls. Preserve FSD boundaries and avoid new dependencies.

**Tech Stack:** React 19, TypeScript, Zustand, React Router 7, Tauri 2, Vitest.

**Spec:** docs/superpowers/specs/2026-09-05-pos-usability-design.md

## Global Constraints

- Work only in D:/Projects/Code/supermarket-pos-worktrees/pos-usability on codex/pos-usability.
- Do not modify main, push, deploy, or access live data for testing.
- Defer Playwright E2E. Use existing Vitest component/unit tests, lint, typecheck, and a local production build.
- Reuse installed dependencies and existing FSD layers, touch controls, and English/Spanish translations.
- Never persist manager PINs, credentials, or an authorization grant. Never automatically charge a recovered sale.

## Task 1: Recover active carts and interrupted checkout safely

**Ownership:** src/entities/tab/model/cartStore.ts and colocated tests; src/features/checkout-sale/model/*; src/widgets/CheckoutPanel/ui/*; related payment contract/schema and PaymentForm changes only where required for recovery; English/Spanish checkout messages. Follow every cart mutation and payment call path before editing.

**Interfaces:** Consume CartItemSchema, useCartStore, callProcessDirectSale and its existing request/result schemas. Preserve existing processor method signatures; extend useCheckoutSale and cart state only for recovery UI/lifecycle. Subsequent keypad work uses PaymentForm unchanged processor interfaces.

- [ ] Add failing tests for active/held-cart hydration and legacy migration, checkout reopening, malformed storage, durable idempotency across remount, known rejection, unknown outcome, success-before-receipt-dismissal, original staff/shift/register scoping, and storage-write failure before dispatch. Use existing test fixtures and mocked transport, not live Supabase.

```ts
// Extend the real existing cartStore persistence tests:
const savedItems = useCartStore.getState().items;
useCartStore.setState({ items: [] });
// Restore the saved storage envelope before hydration in the actual fixture.
await useCartStore.persist.rehydrate();
expect(useCartStore.getState().items).toEqual(savedItems);
// Hook test: remount after a transport failure and verify the original key survives.
expect(secondRequest.idempotencyKey).toBe(firstRequest.idempotencyKey);
```

- [ ] Run the focused tests and capture expected RED evidence.
- [ ] Extend validated/versioned persistence, retaining legacy held carts and scoping to backend/terminal. Persist submission identity/context before network dispatch. Use existing server idempotency and read-only reconciliation where possible; do not re-submit automatically. Block cart editing and starting another sale while an unknown payment remains unresolved. Never persist PINs. Mark known success durably before receipt/hardware side effects. Provide actionable localized recovery UI.
- [ ] Run focused cart/hook/checkout/payment regression tests, typecheck and changed-file lint; capture GREEN evidence and self-review.
- [ ] Commit only owned changes with a scoped Conventional Commit. Report implementation, test commands/results, and any concrete limitation.

## Task 2: Protect unsaved settings across navigation

**Ownership:** src/widgets/SettingsTabsPanel/**, shared dirty-form hook/provider, src/app/router.tsx and app navigation/close integration if needed, settings translations, and colocated tests. Preserve settings query public interfaces for the branding task.

**Interfaces:** Introduce useUnsavedSettings registration in the settings widget (or a lower-layer generic unsaved-form context) with dirty boolean and save(): Promise<boolean>. The provider owns pending navigation and Save/Discard/Stay; tabs own data and validation. Use installed React Router data router/useBlocker if supported; preserve all existing paths, overlays and lazy loading.

- [ ] Write failing component/hook tests for tab switch with edits, Stay, Discard, awaited Save, failed/invalid Save, successful explicit save, history/route blocking, beforeunload, and Tauri close cleanup. Inspect and cover all explicit-save settings forms.

```tsx
await user.type(screen.getByLabelText(/store name/i), ' changed');
await user.click(screen.getByRole('tab', { name: /hardware/i }));
expect(screen.getByRole('alertdialog')).toBeVisible();
await user.click(screen.getByRole('button', { name: /stay/i }));
expect(screen.getByLabelText(/store name/i)).toHaveValue('Original changed');
```

- [ ] Run focused tests to record RED.
- [ ] Implement explicit dirty/save registration and navigation protection; failed save keeps edits/destination. Prevent refetch from erasing dirty forms. Use browser-native unload prompt and Tauri close interception without duplicate handlers.
- [ ] Run settings/router relevant tests, typecheck and changed-file lint; record GREEN and commit owned changes.

## Task 3: Display configured store branding before login

**Ownership:** src/pages/login/index.tsx and tests, src/widgets/LogoImage if needed, src/entities/settings model branding cache and queries, and branding translations. Coordinate against Task 2's settings forms instead of duplicating form changes.

**Interfaces:** Cache only { name: string, logoDataUrl: string | null } under a backend/terminal-scoped versioned key; validate on read and protect against storage errors. Populate from genuinely fetched existing settings and successful saves, not fallback/default/unauthenticated responses. Login renders cache when server data is unavailable. No anonymous RLS changes.

- [ ] Add failing tests for configured store name, large uncropped logo, missing/broken logo fallback, cached branding after query failure/restart, cache isolation and invalid payload, and updates after successful saving.

```tsx
expect(screen.getByRole('heading', { name: 'Demo Store' })).toBeVisible();
expect(screen.getByTestId('app-logo')).toHaveAttribute('src', logoDataUrl);
// Unit cache test: a failed/no-data settings read must retain previous branding.
expect(readStoreBranding()).toEqual({ name: 'Demo Store', logoDataUrl });
```

- [ ] Record RED, implement validated non-sensitive cache and responsive left-panel branding using existing components, preserve auth flow.
- [ ] Run branding/login/settings tests and changed-file lint/typecheck, record GREEN, self-review and commit.

## Task 4: Add checkout money keypad

**Ownership:** src/widgets/PaymentModal/ui/PaymentForm.tsx and tests, src/shared/ui money keypad and tests, and English/Spanish keypad messages. Preserve Task 1 recovery and processor behavior.

**Interfaces:** Reuse MoneyInput amount conventions. Prefer a controlled MoneyKeypad with value string, onValueChange(string), disabled boolean, and accessible field label; the parent owns amount conversion/active field. Support cash and split amount/tender fields. No global keystroke handler and no PINKeypad behavior changes.

- [ ] Add failing tests for decimal entry (12.34), duplicate decimal/third fractional digit rejection, backspace, clear, disabled keys, active split field targeting, quick tender then keypad use, and no automatic submission.

```tsx
for (const digit of ['1', '2', '.', '3', '4']) {
  await user.click(screen.getByRole('button', { name: digit, exact: true }));
}
expect(screen.getByLabelText(/cash received/i)).toHaveValue('12.34');
expect(processors.processCashPayment).not.toHaveBeenCalled();
```

- [ ] Record RED. Implement a small accessible keypad with 44px minimum keys, two-decimal validation and existing input limits; retain physical keyboard and quick/exact tender behavior.
- [ ] Run keypad and PaymentForm regression tests, typecheck and changed-file lint; record GREEN, self-review and commit.

## Completion

- [ ] Review each task for spec and quality, fix actionable findings.
- [ ] Run full unit suite once, lint, typecheck, and local production build; separate pre-existing issues from regressions.
- [ ] Run whole-branch review, verify main checkout unchanged and no pushes/deployments, retain local worktree and commits.
- [ ] Record E2E follow-ups: restart during basket/payment/receipt, all settings exit paths, branded pre-auth screen, keypad cash and split sales.
