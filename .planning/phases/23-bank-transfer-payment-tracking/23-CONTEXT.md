# Phase 23: Bank Transfer Payment Tracking - Context

**Gathered:** 2026-08-31 (via `/gsd-spike` sessions 002-005, not a live discuss-phase — decisions
below were locked during spiking with explicit user answers at each align checkpoint)
**Status:** Ready for planning

<domain>
## Phase Boundary

Cashier marks a completed sale as awaiting bank transfer (customer pays by SPEI account-to-account
transfer instead of cash/card, sometimes at checkout, sometimes later that evening). Admin/manager
manually confirms or disputes the transfer against their own banking app on the `/payments` page.
Replaces the current hand-written two-copy paper slip (customer name + phone) process. Bank
statement/PSP auto-reconciliation integration (Conekta/Clip) is explicitly a separate future phase
— out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Reference code
- **D-01:** 6-digit numeric payload + 1 Luhn (mod-10) check digit = 7 digits total. Fits SPEI's
  Banxico-standard `referencia numerica` field exactly (≤7 digits, numeric only). Generator/
  validator already implemented and unit-proven: `.planning/spikes/003-reference-code-design/reference-code.cjs`.
- **D-02:** Code must be unique only among the store's own currently-open pending-transfer sales
  (not globally/permanently unique) — reuse the `generateUniqueCode(pendingCodes)` pattern.
- **D-03:** Customer is told to put the code in the transfer's `referencia numérica` field
  primarily, falling back to `concepto` (freeform, ≤40 chars) if their bank doesn't expose the
  numeric field for a plain transfer. Never natural-language phrasing in a concepto-based code —
  MX banks' fraud/UIF filters actively scan concepto text (Spike 002 finding).

### Reconciliation model
- **D-04:** Bank statement data must **never** be imported into or synced with the POS, under any
  circumstance — this was stated explicitly and unconditionally by the user. No CSV import, no
  bank API pull, no PSP webhook in this phase.
- **D-05:** Reconciliation is always a manual admin/manager action inside the POS: they check their
  own banking app/statement outside the POS, then come back and confirm the matching sale by
  typing/selecting the reference code.
- **D-06:** Every confirm/dispute is an explicit manual tap — **no auto-confirm path exists
  anywhere**, even when a match looks completely unambiguous (e.g. only one pending sale at that
  amount). This was an explicit user answer, not an assumption: "Always require a manual
  tap-to-confirm, even obvious ones."

### State machine & RBAC
- **D-07:** States: `pending -> confirmed | disputed`. Cashier-originated (`markPendingTransfer`,
  any authenticated staff — mirrors how any cashier can create an order today), manager+/admin-
  gated terminal actions (`confirmTransfer`, `disputeTransfer`) — mirrors the existing
  `process_refund`/`reopen_tab` RBAC pattern (manager+ only) already in `src/shared/lib/rbac.ts`.
- **D-08:** A mistyped code is rejected by Luhn check-digit validation **before** it is ever
  compared to the sale's real code — surfaces as "please re-enter," never a silent wrong match.
- **D-09:** Every state transition is audit-logged (mirrors `recordAudit()` usage pattern used
  across existing edge functions).
- **D-10:** A dispute requires a required, audit-logged reason — no dispute with an empty reason.
  (Emerged during spike UI-build: the original idea implies a real non-payment outcome needs its
  own terminal state with a reason, not an open-ended pending-forever state.)

### `/payments` page UI
- **D-11:** Lives as a "Bank Transfers" tab on the existing `/payments` page (`PaymentsPage`/
  `PaymentPane`) — **not a new route.** Explicit user requirement.
- **D-12:** Lists every pay-later/bank-transfer sale regardless of state (pending/confirmed/
  disputed), with reference code, customer name/phone, elapsed time (oldest first; a pending sale
  past ~8h is visually flagged as stale), and status badge.
- **D-13:** Admin can export the pending+confirmed list to CSV for end-of-day final reconciliation
  — explicit user requirement. CSV cell-escaping must neutralize formula injection (CWE-1236),
  mirroring the existing `rowsToCsv` pattern in `src/shared/lib/exporters/csv.ts`.
- **D-14:** No native `alert()`/`confirm()`/`prompt()` anywhere in this UI — use a `ConfirmDialog`-
  style modal, consistent with the rest of the app (a spike draft used native `prompt()` for the
  dispute reason and this was corrected before shipping the spike demo).

### Claude's Discretion
- Exact copy/wording for empty states, tab labels beyond "Bank Transfers", and i18n key naming
  within the existing `wPanels`/`featOrders` namespace convention.
- Whether "stale" pending threshold (spike used 8h as an illustrative default) is hardcoded or a
  configurable setting — follow whatever pattern `receipt_settings`/near-expiry-alert config
  already uses for similar "configurable threshold" values in this codebase.
- Exact DB column names/types for the new pending-transfer fields (spike used
  `referenceCode, amount, customerName, customerPhone, status, createdAt, createdBy, confirmedBy,
  confirmedAt, disputeReason` — real migration should follow existing `payments`/`tabs` table
  naming conventions in this codebase, not necessarily these exact names).

</decisions>

<specifics>
## Specific Ideas

- Original real-world problem (verbatim from user): cashier generates the bill, customer pays by
  account-to-account transfer, sometimes at checkout and sometimes later that night; admin checks
  their bank statement later and confirms by amount; if unconfirmed, cashier writes the customer's
  name and phone number on one of two paper copies of the receipt. This phase digitizes exactly
  that existing workflow — it does not invent a new payment concept.
- Store manages multiple bank accounts (Banorte confirmed, others unspecified) — nothing in this
  phase should assume a single bank, even though no bank-side integration is being built now.
- WhatsApp send-out of a payment confirmation message to the customer is planned as a **later**
  integration, explicitly stated as out of scope for this phase.
- "Use as many subagents as possible" to research bank integration options was the user's explicit
  instruction during spiking — already executed in Spike 002; the resulting PARTIAL verdict
  (no cheap automated path exists yet; Conekta/Clip are the real future option) is locked findings
  for this phase, not something to re-investigate.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning.**

### Spike findings (idea key: `bank-transfer-payment-tracking`)
- `.planning/spikes/MANIFEST.md` — idea section with full Requirements list (source of truth for
  all D-01..D-14 decisions above)
- `.planning/spikes/002-bank-integration-research/README.md` — why bank-side automation is out of
  scope for this phase, and what the real future upgrade path looks like
- `.planning/spikes/003-reference-code-design/README.md` + `reference-code.cjs` — reference code
  algorithm, already implemented and self-tested; reuse directly rather than re-deriving
- `.planning/spikes/004-transfer-state-model/README.md` + `state-model.cjs` — state machine +
  RBAC-gate design, already implemented and self-tested; reuse the shape directly
- `.planning/spikes/005-payments-transfer-view/README.md` + `bank-transfers-tab.html` — UI shape,
  already built and click-tested end-to-end via browser automation

### Existing codebase patterns to mirror
- `src/shared/lib/rbac.ts` — `cashier < manager < admin` hierarchy; `process_refund`/`reopen_tab`
  are the existing manager+-gated terminal-action precedent
- `src/shared/lib/exporters/csv.ts` (`rowsToCsv`) — CSV formula-injection guard to reuse for the
  new export, not reimplement
- `src/shared/lib/domain.ts` — Zod schemas are the single source of truth for new domain types;
  infer types from Zod, don't hand-write interfaces (CLAUDE.md convention)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `payments` table (existing): new pending-transfer fields likely belong here as columns, or on a
  sibling table joined 1:1 — real schema choice deferred to planner (see Claude's Discretion above)
- `recordAudit()` pattern: reuse for every state transition (mark pending / confirm / dispute)
- `ConfirmDialog` (`shared/ui`): reuse instead of building a new modal primitive for confirm/dispute

### Established Patterns
- Manager-PIN-gated destructive/terminal actions (`process_refund`, `reopen_tab`): confirm/dispute
  on a pending transfer should follow the same manager+ gate shape
- `rowsToCsv` CSV export pattern already used in Reports — reuse for the Bank Transfers export

### Integration Points
- `/payments` page (`PaymentsPage`/`PaymentPane`) — new tab, not a new route
- Checkout flow (`checkout-sale` feature) — needs a "bank transfer" payment path that marks a sale
  pending instead of completing it outright, generating the reference code at that point
- i18n: new strings go in the `wPanels` (payments panel) and/or `featOrders` namespaces per the
  existing 10-namespace scheme in CLAUDE.md

</code_context>

<deferred>
## Deferred Ideas

- **PSP-based auto-reconciliation** (Conekta or Clip unique-CLABE-per-sale, webhook-driven
  auto-confirm) — explicitly flagged in Spike 002 as a viable future phase once transaction volume
  justifies the ~$12.50 MXN+IVA/txn cost. Do not build in this phase.
- **WhatsApp confirmation send-out** to the customer — explicitly stated by the user as a later
  integration, separate from this phase.
- **Bank statement import in any form** — not deferred, actually ruled out permanently by the user
  ("will not be shared with the POS in any case"). Listed here only so a future planner doesn't
  accidentally reintroduce it as a "natural next step."

</deferred>

---

*Phase: 23-bank-transfer-payment-tracking*
*Context gathered: 2026-08-31*
