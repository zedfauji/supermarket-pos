# Phase 9: Reopen-and-edit a completed sale - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 09-reopen-and-edit-a-completed-sale
**Areas discussed:** Edit surface, PIN gating, Remove-item UI reuse, Entry point, Add-item shape

---

## Edit surface (where reopen→edit lives)

| Option | Description | Selected |
|--------|-------------|----------|
| New panel in PaymentPane | Inline item-editing panel/sheet on /payments once a tab flips to status='open', styled like EditPaidTabDialog but wired to create_order_with_items + remove_tab_item | ✓ |
| Send manager to /pos with the tab loaded | Reopen navigates to direct-sale checkout with the tab pre-loaded as active cart | |

**User's choice:** New panel in PaymentPane (recommended option).
**Notes:** Keeps the reopen→edit workflow on one screen; avoids reintroducing tab-awareness into /pos, which is explicitly a "no tab concept" page per CLAUDE.md's routes table.

---

## PIN gating

| Option | Description | Selected |
|--------|-------------|----------|
| PIN per action | Every add-item save and every item removal gets its own ManagerPinDialog + requiredAction check, matching existing reopen_tab/remove_tab_item/edit_paid_tab pattern | ✓ |
| One PIN unlocks a short edit session | The reopen PIN authorizes subsequent adds/removes within the same UI session, no re-prompting | |

**User's choice:** PIN per action (recommended option).
**Notes:** Consistent with existing per-action PIN-gate pattern across the codebase; more auditable (each add/remove produces its own manager-approved audit_logs entry).

---

## Remove-item UI reuse

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse RemoveTabItemDialog as-is | Already built, tested, calls the correct remove_tab_item RPC with correct error handling; just needs a new parent to compose it with ManagerPinDialog | ✓ |
| Rebuild inline to match EditPaidTabDialog | Replace the separate ConfirmDialog-per-removal with a remove button directly on each row, for visual consistency with the add side | |

**User's choice:** Reuse RemoveTabItemDialog as-is (recommended option).
**Notes:** RemoveTabItemDialog/useRemoveTabItem confirmed functional and tested via codebase scout — not orphaned-and-broken like void-order was, just never composed into a live parent since TableStatusPanel (its originally intended parent) was deleted in Phase 1's bar-pos strip.

---

## Entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-open the edit panel on reopen success | ReopenTabDialog's success closes it and immediately opens the new edit panel for the same tab | |
| New standalone button on the row | A separate "Edit items" button appears on the payment row once reopened, decoupled from the reopen action, matching EditTicketButton/RefundButton's per-row-action pattern | ✓ |

**User's choice:** New standalone button on the row (non-default option — user picked this over the recommended auto-open).
**Notes:** Decouples reopen from edit; consistent with how other per-row actions (Refund, Edit ticket) already work independently in PaymentPane.

---

## Add-item shape

| Option | Description | Selected |
|--------|-------------|----------|
| Inline row, PIN-gated on save | Product/qty/price picked inline (EditPaidTabDialog's addedRows pattern), single ManagerPinDialog confirms the whole pending add on Save | ✓ |
| Per-item PIN confirm, same as remove | Every individual add gets its own immediate ManagerPinDialog + RPC call, mirroring RemoveTabItemDialog exactly | |

**User's choice:** Inline row, PIN-gated on save (recommended option).
**Notes:** Reconciled with the "PIN per action" answer as meaning per save-action (submitting create_order_with_items), not per keystroke — add and remove intentionally end up with slightly different PIN cadence (one PIN per save for add, one PIN per item for remove), which is fine since they're separate features.

---

## Claude's Discretion

- New panel component name/location under `src/widgets/PaymentPane/` vs. a new feature folder.
- Whether the new panel is a `Sheet` or a different shared/ui primitive.
- `add-item-to-tab/`'s internal structure (mutation hook wrapping `useMutationAddOrder` vs. calling `create_order_with_items` directly).
- i18n namespace placement for the new "Edit items" button and panel copy.
- Test fixture switch from hand-built rows to a `process_direct_sale_atomic`-originated fixture (SC-4) — implementation detail, not a product decision.

## Deferred Ideas

None — discussion stayed within Phase 9's SALE-03 scope. Re-closing/re-paying a reopened sale was named explicitly as out of scope (not currently in ROADMAP.md/REQUIREMENTS.md at all), not deferred to a named future phase.
