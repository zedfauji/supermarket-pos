# Phase 24: Tax Configuration (Inclusive/Exclusive Toggle) - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the double-taxation bug (store's shelf prices already include tax, but checkout always adds
tax again on top) by adding an admin-configurable `taxInclusive` boolean to billing settings
(TAX-01). When on, checkout math decomposes tax backward from the already-inclusive total
(TAX-02); when off, checkout keeps today's additive math for stores whose prices exclude tax
(TAX-03). Both the client calc and the two server-side anti-tamper RPCs must apply the same
mode-aware formula (TAX-04). Receipts (thermal/PDF/email) show a decomposed subtotal + tax line
matching the active mode (TAX-05). No per-product/category tax control — this stays a single
global rate + mode, matching the existing `taxRatePercent` model.

</domain>

<decisions>
## Implementation Decisions

### Default & rollout
- **D-01:** `taxInclusive` defaults to **ON** on upgrade — matches the confirmed reality that this
  store's shelf prices already include tax, so the bug is fixed the moment the migration ships
  with no separate admin action required. — **Reversibility:** reversible — it's a settings-table
  boolean with a plain UI toggle; an admin can flip it back to `off` any time from Billing Settings.
- **D-02:** No remediation for already-completed sales that were overcharged tax under the old
  additive-on-top math. This phase is a forward-looking code fix, not a financial cleanup/refund
  exercise — explicit user call, not an oversight.

### Receipt tax line
- **D-03:** Receipts currently show **no tax line at all** (thermal/PDF/email all print
  subtotal + total only — confirmed by reading `receipt-format.ts` and `ReceiptDataSchema`, which
  has no `taxAmount` field today). Build the breakdown fresh so it **always** shows
  subtotal + tax + total, in both inclusive and exclusive mode — same 3-line shape everywhere,
  just different math feeding it. — **Reversibility:** reversible — additive UI/schema field, no
  data migration on existing receipts (historical receipts aren't regenerated).

### Toggle scope
- **D-04:** Keep both modes (inclusive AND exclusive) even though this is a single-store product
  whose prices are confirmed tax-inclusive today — TAX-01..03 already lock in a real toggle with
  both states in REQUIREMENTS.md; build it as specified rather than narrowing to inclusive-only.
  The exclusive branch mostly reuses the existing (currently-buggy-when-misapplied) additive math
  already in `PaymentForm.tsx` and the two RPCs, so it isn't meaningfully extra work.

### Claude's Discretion
- Exact receipt line labels/wording (e.g. "IVA incl." vs "Impuesto") within the existing
  `receipt` i18n namespace — not locked by discussion, follow existing label conventions in
  `receipt.json`.
- Whether the two duplicated server-side tax formulas (`process_direct_sale_atomic` and its
  cost-snapshot variant) get de-duplicated into a shared SQL function as part of this migration,
  or just both patched in place with identical logic — flagged as a smell in prior exploration but
  not a locked requirement; planner's call based on migration complexity.
- Report/margin impact: scouted and found **no report widget currently reads `subtotal`/tax
  fields** — reports sum `payments.amount`/order totals, which are unaffected by whether that
  total was computed inclusively or additively. Treat report changes as out of scope unless
  research surfaces an actual dependency.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner) MUST read these before planning.**

### Requirements & bug record
- `.planning/REQUIREMENTS.md` §TAX-01..05 (lines 221-225, v1.10) — locked requirements this phase
  must satisfy
- `.planning/notes/tax-double-counting-bug.md` — root-cause writeup from the `/gsd-explore`
  session that spawned this phase; names every file in the current (buggy) additive-tax code path

### Client tax calc
- `src/widgets/PaymentModal/ui/PaymentForm.tsx:179,286-290,771-772` — current additive
  `taxAmount`/`subtotalWithTax` calc and the `paymentForm.taxLabel` display line; needs to become
  mode-aware
- `src/shared/lib/domain.ts:812` — `BillingSettingsSchema.taxRatePercent` (default 16); add
  `taxInclusive` boolean alongside it
- `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` — admin-only (`manage_settings`)
  Billing Settings form; add the toggle here next to the existing rate field

### Server-side authoritative tax calc (anti-tamper — must match client exactly)
- `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql:153-156` —
  `process_direct_sale_atomic` RPC's additive tax recompute
- `supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql:100-103` —
  duplicated additive tax recompute in the cost-snapshot variant

### Receipt rendering (no tax line exists in any of these today — net-new)
- `src/shared/lib/edge-function-contracts.ts:50-90` — `ReceiptDataSchema` (`subtotal`/`total`
  only, no `taxAmount`/`taxRatePercent`/`taxInclusive` field — needs extending)
- `src/shared/lib/receipt-format.ts:220-223` — `buildThermalReceiptText`, where the new tax line
  goes between subtotal and total
- `src/shared/lib/exporters/receipt-pdf.tsx`, `src/shared/lib/email-receipt.ts`,
  `src/features/process-payment/ui/ReceiptPreview.tsx` — other receipt render paths that need the
  same tax line added
- `src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json` — where new tax-line label keys go

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `BillingSettingsSchema`/`BillingSettingsTab.tsx` — existing admin-only settings form pattern;
  the new `taxInclusive` toggle is a straightforward sibling field to `taxRatePercent`, same
  validation/save flow.
- `formatMoneyIn` (`src/shared/lib/format.ts`) — existing money-formatting helper already used
  throughout `receipt-format.ts`; reuse for the new tax line.

### Established Patterns
- Zod schema in `domain.ts` is the single source of truth for the settings shape (CLAUDE.md
  convention) — add `taxInclusive` there first, then thread the type through queries/UI/RPC.
- Server-side RPCs independently recompute totals and reject the client-submitted total on
  mismatch (anti-tamper) — the mode-aware formula must be duplicated correctly in **both** RPCs or
  valid inclusive-mode sales will be rejected (this is explicitly called out in TAX-04).

### Integration Points
- `src/entities/settings/model/queries.ts` — settings query/mutation hook surface, needs the new
  field threaded through
- Checkout flow (`PaymentForm.tsx`) reads `appSettings?.billing.taxRatePercent` today; same
  read-path gains `taxInclusive`

</code_context>

<specifics>
## Specific Ideas

No specific UI/wording mockups given — user deferred receipt-line copy to Claude's discretion
(see Decisions). The core ask was explicit: back-calculate tax from already-inclusive prices
rather than adding tax on top (`subtotal = total / (1 + rate/100)`, `tax = total - subtotal`),
confirmed verbatim in REQUIREMENTS.md TAX-02.

</specifics>

<deferred>
## Deferred Ideas

- **Per-product/category tax override** — out of scope; confirmed no such concept exists in the
  schema today and nothing in this discussion asked for one. If ever needed, it's a separate
  future phase.
- **Refund/adjustment for historically overcharged sales** — explicitly ruled out for this phase
  (D-02), not lost — could resurface as a manual admin ask, but is not planned work here.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase 24` returned zero matches).

</deferred>

---

*Phase: 24-tax-configuration-inclusive-exclusive-toggle*
*Context gathered: 2026-08-31*
