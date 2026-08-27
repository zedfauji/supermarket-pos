---
phase: 09-reopen-and-edit-a-completed-sale
verified: 2026-08-18T19:10:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 1
override_ref: .planning/verification-overrides.md#phase-9--reopen-and-edit-a-completed-sale-2026-08-18
human_verification:
  - test: "Decide whether CR-01 (client-only ManagerPinDialog gate with no server-side role check on create_order_with_items/remove_tab_item for reopened-sale edits) needs a follow-up fix before shipping, or is an accepted risk carried forward from the pre-existing D-07 design (remove_tab_item deliberately has no role gate; create_order_with_items never had one)."
    expected: "A human/team decision: either (a) accept as pre-existing architectural risk (matches phase's own threat model T-09-01/T-09-05 'accept' disposition) and open a follow-up ticket, or (b) require CR-01's fix (conditional AUTH_FORBIDDEN check when tabs.reopened_at IS NOT NULL) before Phase 9 is considered fully closed."
    resolution: "Accepted per .planning/verification-overrides.md — not a Phase 9 regression, matches D-05/D-07 and RESEARCH.md Open Question 2's explicit out-of-scope call. Tracked as a deferred item in STATE.md for a future security-hardening phase."
    why_human: "This is a security-posture/risk-acceptance judgment call, not something a grep/test can resolve — the phase's own PLAN/CONTEXT/threat-model documents explicitly scoped this out as 'not a regression introduced by this phase,' but the code review still flagged it Critical. Whether that acceptance is sufficient for this project is a product/security decision, not a code-correctness question."
---

# Phase 9: Reopen-and-edit a completed sale Verification Report

**Phase Goal:** A manager can reopen a completed/paid sale and add or remove its line items using the already-existing reopen/order RPCs, without loosening `edit_paid_tab`'s guard.
**Verified:** 2026-08-18T19:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A manager can reopen a completed/paid sale via `reopen_tab` and status becomes `open` (SC-1) | ✓ VERIFIED | Independently re-ran `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-1"` — both SC-1 tests (manager happy path + bartender-negative PIN gate) pass against the live app/Supabase. |
| 2 | On a reopened sale, a manager can add a new line item through `features/add-item-to-tab/` (thin wrapper over `create_order_with_items`/`useMutationAddOrder`), and the item appears in the sale total (SC-2) | ✓ VERIFIED | Independently re-ran `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-2"` — passes. Confirmed `useAddItemToTab` (`src/features/add-item-to-tab/model/useAddItemToTab.ts`) calls `useMutationAddOrder` (not `supabase.rpc` directly), submitting all pending rows in one call. Unit tests re-run independently: 3/3 pass. |
| 3 | On a reopened sale, a manager can remove a line item via `remove_tab_item` with `RemoveTabItemDialog`/`useRemoveTabItem` rewired (SC-3) | ✓ VERIFIED | Independently re-ran `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-3"` — passes. Confirmed `EditReopenedItemsPanel.tsx` imports and mounts `RemoveTabItemDialog` from `@features/remove-tab-item/ui/RemoveTabItemDialog` (unmodified), gated behind a second, independent `ManagerPinDialog` instance (`requiredAction="reopen_tab"`). |
| 4 | `e2e/48-reopen-closed-ticket.spec.ts` passes end-to-end, seeded from `process_direct_sale_atomic`, not hand-built rows (SC-4) | ✓ VERIFIED | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts --list` enumerates exactly 4 tests (SC-1 x2, SC-2, SC-3); all 4 independently re-run green (see above). `grep -c "from('tabs').insert"` and `grep -c "seedPaidTab(db"` both return 0; `seedPaidTabViaDirectSale` (calling `process_direct_sale_atomic` via the service-role client) is the sole seed path, confirmed by source inspection. |
| 5 | `edit_paid_tab`'s existing status guard is unchanged and still structurally excludes reopened (`status='open'`) sales, confirmed by test coverage (SC-5) | ✓ VERIFIED | `supabase/migrations/20260719000001_edit_paid_tab_rpc.sql` unchanged (`git log` shows no commits touching this file since the pre-pivot rename); guard text `IF v_status NOT IN ('paid', 'closed') THEN ... 'TAB_NOT_EDITABLE'` confirmed present. New regression test `SC-5: TAB_NOT_EDITABLE is returned when the tab is status=open` independently re-run in isolation (`npx vitest run ... -t "SC-5"`) — 1 passed. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/features/add-item-to-tab/model/useAddItemToTab.ts` | Thin wrapper over `useMutationAddOrder` | ✓ VERIFIED | Exports `useAddItemToTab` returning `{ addItems, isPending }`; delegates to `useMutationAddOrder().mutateAsync`, no direct `supabase.rpc` call. |
| `src/features/add-item-to-tab/model/useAddItemToTab.test.ts` | Unit coverage | ✓ VERIFIED | 3 tests, all pass (re-run independently). |
| `src/features/add-item-to-tab/index.ts` | Barrel exporting only `useAddItemToTab` | ✓ VERIFIED | Exports `useAddItemToTab` + `AddItemToTabInput` type; does not touch `ui/ModifierSheet.tsx`. |
| `src/widgets/PaymentPane/ui/EditReopenedItemsPanel.tsx` | Sheet widget, add+remove sides | ✓ VERIFIED | 328 lines; read-only existing-item list with remove trigger, addedRows inline-add UX, two independent `ManagerPinDialog` mounts, `RemoveTabItemDialog` mount, version-conflict handling via `handleVersionError`. |
| `src/widgets/PaymentPane/ui/PaymentPane.tsx` | `EditItemsButton` + panel wiring | ✓ VERIFIED | `EditItemsButton` gated on `payment.isRefund !== true && tab?.status === 'open'` (live `useTab` query, not a payment-status heuristic); `editItemsTarget` state mounts `EditReopenedItemsPanel`. |
| `src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts` | SC-5 regression test | ✓ VERIFIED | New `it('SC-5: ...')` case present, asserts `data.code === 'TAB_NOT_EDITABLE'`; passes in isolation. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `PaymentPane.tsx` `EditItemsButton` | `EditReopenedItemsPanel` | `useTab(payment.tabId)` status gate → `setEditItemsTarget` | ✓ WIRED | Confirmed by source read + passing SC-1→SC-2 flow (button appears only after reopen, live status invalidated via a fix landed in this phase — `tabKeys.detail()` invalidation added to `useReopenTab.ts`). |
| `EditReopenedItemsPanel` Save | `useAddItemToTab().addItems` | `ManagerPinDialog requiredAction="reopen_tab"` → `onSuccess` → `handleSubmit` | ✓ WIRED | Confirmed by source read + passing SC-2 E2E. |
| `EditReopenedItemsPanel` row "Remove" | `RemoveTabItemDialog`/`useRemoveTabItem` | second `ManagerPinDialog requiredAction="reopen_tab"` → `showRemoveConfirm` | ✓ WIRED | Confirmed by source read + passing SC-3 E2E. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC-1 reopen flow | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-1"` | 2 passed | ✓ PASS |
| SC-2 add-item flow | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-2"` | 1 passed | ✓ PASS |
| SC-3 remove-item flow | `npx playwright test e2e/48-reopen-closed-ticket.spec.ts -g "SC-3"` | 1 passed | ✓ PASS |
| SC-5 guard regression | `npx vitest run src/features/edit-paid-tab/model/edit-paid-tab-rpc.integration.test.ts -t "SC-5"` | 1 passed, 9 skipped | ✓ PASS |
| `useAddItemToTab` unit tests | `npx vitest run src/features/add-item-to-tab/model/useAddItemToTab.test.ts` | 3 passed | ✓ PASS |
| No regression in reopen-tab/PaymentPane units | `npx vitest run src/features/reopen-tab/model/useReopenTab.test.ts src/widgets/PaymentPane/ui/PaymentPane.test.tsx` | 11 passed | ✓ PASS |
| Typecheck | `npm run typecheck` | clean | ✓ PASS |
| Lint | `npm run lint` | clean (max-warnings 0; only pre-existing unrelated boundaries-plugin config warning) | ✓ PASS |

All checks above were re-executed independently by this verifier against the live dev server (port 1520) and local Supabase (port 8000), not taken from SUMMARY.md/09-REVIEW.md claims.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SALE-03 | 09-01, 09-02, 09-03 | Manager can reopen a completed/paid sale and edit its line items (add/remove) via existing RPCs; `48-reopen-closed-ticket.spec.ts` passes | ✓ SATISFIED | All 5 roadmap SCs independently verified above. `.planning/REQUIREMENTS.md` still shows SALE-03 as `[ ]`/"Not started" (line 19/104) — this is stale bookkeeping expected to be updated by the phase-close workflow after this verification, not a code gap. |

No orphaned requirements — REQUIREMENTS.md's phase-mapping table lists only SALE-03 against Phase 9.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any file modified by this phase | — | Clean |

### Code Review Findings (09-REVIEW.md) — independently re-confirmed, not blocking the roadmap's 5 success criteria

- **CR-01 (Critical, re-confirmed):** `create_order_with_items` (`supabase/migrations/20260428000003_create_order_with_items_v2.sql`) and `remove_tab_item` (`supabase/migrations/20260721000005_remove_tab_item_rpc.sql`) both `GRANT EXECUTE ... TO authenticated` with **no server-side role check** distinguishing "editing a reopened, previously-paid sale" from "editing a normal in-progress open tab." Grep-confirmed: neither file contains an `auth.uid()`/role lookup gate; `remove_tab_item`'s own migration comment explicitly documents this is deliberate (D-07, matching normal bartender-accessible item removal). The client-side `ManagerPinDialog` gate added by this phase is real UX but not a security boundary — any authenticated cashier session could call these RPCs directly on a reopened tab's id and bypass the PIN prompt entirely. This mirrors the phase's own threat model (T-09-01, T-09-05, both dispositioned "accept" with the rationale "not a regression introduced by this phase" since neither RPC had a role check before this phase reused them). **Routed to human verification below** — whether this pre-existing-risk acceptance is sufficient is a product/security judgment call, not resolvable by grep or test.
- **CR-02 (Critical, RESOLVED during phase execution):** The panel's copy originally claimed "Each save is recorded and manager-approved," which was misleading for the add-item path (`create_order_with_items` writes no `record_audit` row, unlike `remove_tab_item` which does). Commit `2adacb3` changed the copy in both locales to "Every change requires manager approval" (dropping the false "recorded" claim) — confirmed by diff inspection. This resolves the misleading-copy issue; the underlying audit-log gap for add-item still exists but is no longer misrepresented to the operator.
- **WR-01 (Warning, re-confirmed):** `EditReopenedItemsPanel.tsx:243-247` — `<Input type="number" min={0} ...>` with `onChange` handler `Number(e.target.value) || 0`. Confirmed: `min={0}` is HTML-attribute-only (doesn't block a typed `-5`), and `create_order_with_items`'s migration has no `unit_price >= 0` check. A manually-typed negative price would pass through uncaught. Non-blocking for this phase's 5 roadmap SCs (none mention price-floor validation) but a real gap.
- **WR-02, WR-03, IN-01:** Re-read, non-blocking (message-substring error classification in `useReopenTab.ts`; duplicated add-row JSX between `EditReopenedItemsPanel` and `EditPaidTabDialog`; no dedicated component test for the new panel). None affect the roadmap's 5 success criteria.

### Human Verification Required

### 1. CR-01 risk-acceptance decision

**Test:** Review `09-REVIEW.md`'s CR-01 finding and this report's re-confirmation of it (no server-side role check on `create_order_with_items`/`remove_tab_item` for reopened-sale edits — PIN gate is client-side UX only).
**Expected:** A recorded decision — either accept as pre-existing architectural risk (consistent with the phase's own threat model) and file a follow-up ticket, or require a fix (conditional `AUTH_FORBIDDEN` check gated on `tabs.reopened_at IS NOT NULL`) before treating SALE-03 as fully closed.
**Why human:** Security risk-acceptance for a money-adjacent, previously-completed-sale-editing path is a product/security judgment call. The phase's own docs (CONTEXT.md D-05/D-07, threat model T-09-01/T-09-05) already argue this is not a regression, but the code review still flags it Critical — the roadmap's 5 stated success criteria are all met and don't mention this requirement, so it doesn't block `gaps_found`, but it should not be silently passed over either.

### Gaps Summary

None of the roadmap's 5 success criteria have gaps — all were independently re-verified against the running app/local Supabase, not taken on SUMMARY.md's word. The single open item is CR-01, a pre-existing-architecture security risk that the phase's own design docs explicitly (and consistently) scoped as accepted, but which code review flagged Critical enough to warrant an explicit human sign-off rather than silent pass-through.

---

_Verified: 2026-08-18T19:10:00Z_
_Verifier: Claude (gsd-verifier)_
