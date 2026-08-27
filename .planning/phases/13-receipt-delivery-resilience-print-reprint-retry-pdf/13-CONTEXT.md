# Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF) - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Receipt delivery — print, reprint, retry, PDF, email — becomes resilient to printer failure, and every delivery path (print, reprint, retry-on-failure, PDF download, PDF email attachment) gets reproducible automated test evidence. This is a resumed v1.2 phase (paused 2026-08-19 when v1.3 took priority; requirements/roadmap were left intact for resumption). No new schema; touches `receipt-format.ts`, `pos-printer.ts`, `email-receipt.ts`, `send-receipt-email` edge function, `printer.rs`, and adds a reprint entry point + PDF generation.

Out of scope: a full outbound transactional email service beyond the existing Resend integration (RCP-05, explicitly deferred — see REQUIREMENTS.md v2).

</domain>

<decisions>
## Implementation Decisions

### Reprint entry point (RCP-01)
- **D-01:** Add a "Reprint" action to each row of the existing "recent payments" list in `PaymentPane` (`src/widgets/PaymentPane/ui/PaymentPane.tsx`) on `/payments`. Reuses the query already powering that list — no new "last completed sale" state needed. The list is already sorted with most-recent first, satisfying "most recently completed sale" directly.

### Retry behavior (RCP-04)
- **D-02:** On print failure, retry automatically 2-3 times before surfacing to the cashier. Retry logic belongs inside `printReceipt` (`src/shared/lib/pos-printer.ts`) itself — the single call site all callers (`ReceiptPreview.tsx`, `PaymentForm.tsx` ×3) already route through — not duplicated per caller.
- **D-03:** Show a visible "Retrying print (N/3)..." status during retry attempts (toast or inline indicator), followed by a final success/failure toast. This is new UI state — today's print/drawer failures are fire-and-forget with a single `toast.error` on the final outcome (`PaymentForm.tsx` `logHardwareFail`); that silent pattern is being upgraded, not reused, for the retry sequence specifically.

### Printer failure never blocks a sale (RCP-02)
- **Confirmed existing behavior, not a new decision:** `PaymentForm.tsx handlePrimary`/`handleSplitPrimary` already call `printReceipt` in a detached `void (async () => {...})()` block *after* `setStep('receipt')` and `onPaymentSuccess()` — the sale is already recorded and the UI already reflects success before printing is attempted. RCP-02's job in this phase is test coverage (mock the Tauri `print_receipt` invoke to reject/throw and assert the sale still completes), not new production code, though the retry work (D-02/D-03) sits inside this same async block.

### PDF delivery mechanism (RCP-03)
- **D-04:** Build both delivery paths — standalone PDF download (pure client-side, `@react-pdf/renderer`, already a dependency via `src/shared/lib/exporters/pdf.tsx`) **and** email attachment (extends `send-receipt-email` edge function to accept and forward a base64 PDF attachment to Resend, which already supports attachments in its API).
- **D-05:** The PDF's receipt body (items, totals, tenders) is a plain monospace rendering of `buildThermalReceiptText`'s exact string output — not a re-derived table/styled layout computed independently from `ReceiptData`. This directly satisfies RCP-03's explicit text: "reusing the existing `receipt-format.ts` formatting logic rather than a second, divergent formatter." — **Reversibility:** costly — **rationale:** once print/email/PDF all read from one shared string, switching the PDF to an independently-derived layout later means auditing all three paths for drift risk, not just adding a new renderer.
  - *Note:* a styled report-style PDF layout (like `exporters/pdf.tsx`'s CajaReport tables) was discussed and explicitly rejected for this reason — a table-based layout would need to re-derive line-item/total structure from `ReceiptData` directly, creating exactly the second, divergent formatter RCP-03 rules out. A styled *shell* (logo/header treatment) around the same monospace text block remains open to the planner if it doesn't touch the receipt body content itself.

### Claude's Discretion
- Exact retry delay/backoff (fixed interval vs. short exponential backoff) between the 2-3 print attempts — not discussed; planner should pick a small fixed delay (e.g. 500ms-1s) unless research surfaces a reason for backoff — this is IPC to a local printer, not a network call.
- Exact wording/i18n keys for the "Retrying print (N/3)..." status and final toasts — follows the existing `featOrders`/`common` namespace conventions already used by `logHardwareFail` in `PaymentForm.tsx`.
- Whether the retry loop distinguishes failure reasons (offline vs. out-of-paper vs. disconnected) for different retry/backoff behavior, or treats all `printReceipt` failures uniformly — not raised as a gray area; default to uniform retry handling unless research finds the Tauri/Rust layer already differentiates these (per ROADMAP.md Success Criterion 2's "offline/out-of-paper/disconnected" framing, these are simulated as generic invoke failures, not distinct error codes).
- Exact UI placement/copy for the "Reprint" action within a `PaymentPane` row (icon button vs. labeled button, confirmation dialog or not) — no `UI hint` flagged in ROADMAP.md for this phase, so this stays a planner/implementation call unless it turns out non-trivial enough to warrant `/gsd-ui-phase 13`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` §RCP-01..04 — locked requirement text; §v2 Requirements RCP-05 — explicitly deferred (do not build a general email service)
- `.planning/ROADMAP.md` §"Phase 13" — goal, 4 success criteria, `Depends on: Nothing (sequenced last to reuse the print/email E2E mocking harness this phase builds...)`

### Project-level decisions
- `.planning/PROJECT.md` §Active — v1.2 (Phases 11-13) resumption note; Phase 11 (Security Hardening) checkpoint archived under `.planning/milestones/v1.2-phases/` (separate, unrelated phase — no dependency on this one)
- `.planning/STATE.md` §Decisions — v1.2 phase-structure rationale: "Phase 13 merges receipt print/email E2E coverage and PDF delivery (RCP-01..04) into one Receipt Delivery & Resilience phase since they share the same files (`receipt-format.ts`, `pos-printer.ts`, `send-receipt-email`) and E2E mocking harness"

### Prior phase context (directly relevant — same files)
- `.planning/phases/15-receipt-designer-layout-branding-logo-printing/15-PATTERNS.md` — most recent phase to touch `receipt-format.ts`/`pos-printer.ts`/`email-receipt.ts`/`printer.rs`; documents the current `buildThermalReceiptText(receipt, locale, settings)` signature (now requires `settings` as a third, required param) and the Rust `Result<_, String>` + non-fatal `eprintln!` error-handling idiom in `printer.rs` — both must be respected by any retry/PDF work touching these files.
- `.planning/phases/15-receipt-designer-layout-branding-logo-printing/15-RESEARCH.md` — receipt formatter internals (LINE-width closures, sanitize() pattern) if PDF text embedding needs to touch formatter internals.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/lib/pos-printer.ts` `printReceipt()` — single call site for all print flows (`ReceiptPreview.tsx`, `PaymentForm.tsx` ×3); retry logic (D-02) belongs here, once.
- `src/shared/lib/receipt-format.ts` `buildThermalReceiptText(receipt, locale, settings)` — single source of truth for receipt content; PDF (D-05) must call this, not re-derive structure.
- `src/shared/lib/exporters/pdf.tsx` (`@react-pdf/renderer`'s `Document`/`Page`/`Text`/`pdf()`) — existing PDF-generation pattern already in the codebase (used for report exports); reuse the `pdf()` blob-generation call for the standalone-download path.
- `src/features/export-report/model/useExportReport.ts` / `ui/ExportButtons.tsx` — existing pattern for triggering a client-side PDF blob download; mirror for the new "Download PDF" receipt action.
- `src/widgets/PaymentPane/ui/PaymentPane.tsx` — existing "recent payments" list/query (lines ~179+) is the reprint entry point (D-01); already has row-level actions precedent (refund/editTicket/reopenTab/editItems in the same widget).
- `supabase/functions/send-receipt-email/index.ts` — existing Resend call (`BodySchema` currently only `email` + `receiptPlainText`); extend `BodySchema` with an optional base64 attachment field and add it to the Resend API payload's `attachments` array.
- `src/shared/lib/edge-function-contracts.ts` `callSendReceiptEmail` — client-side contract to extend alongside the edge function's `BodySchema`.

### Established Patterns
- Fire-and-forget post-payment hardware calls (`void (async () => {...})()` in `PaymentForm.tsx`) — sale completion is never gated on print/drawer success; the retry/status work (D-02/D-03) extends this block, doesn't change its non-blocking nature.
- `Result<T>` (`ok`/`err`) return type on every async operation (`src/shared/lib/result.ts`) — `printReceipt`'s retry wrapper must still resolve to a single `Result<void>`.
- Edge function pattern: Bearer-auth check → Zod `BodySchema.safeParse` → external API call → `jsonResponse` — `send-receipt-email`'s attachment extension follows this exact existing shape, no new pattern.

### Integration Points
- `send-receipt-email` request/response contract changes on both the Deno function and `edge-function-contracts.ts` — must stay backward-compatible (attachment field optional) since other non-PDF email sends may still call it without one.
- `printReceipt`'s retry wrapper is purely internal to `pos-printer.ts` — no signature change needed for callers, they already just check `Result<void>.ok`.

</code_context>

<specifics>
## Specific Ideas

No specific visual/UI references given — reprint action placement and retry-status copy are left to planner/implementation discretion (see Claude's Discretion above).

</specifics>

<deferred>
## Deferred Ideas

None raised — discussion stayed within the four selected implementation-decision areas (reprint entry point, PDF delivery mechanism, retry visibility, PDF format). No scope-creep redirects were needed. RCP-05 (full outbound email service) remains explicitly out of scope per REQUIREMENTS.md, unchanged.

</deferred>

---

*Phase: 13-Receipt Delivery & Resilience (Print, Reprint, Retry, PDF)*
*Context gathered: 2026-08-24*
