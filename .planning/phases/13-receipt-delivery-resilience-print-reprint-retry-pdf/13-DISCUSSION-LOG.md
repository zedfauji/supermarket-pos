# Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-24
**Phase:** 13-Receipt Delivery & Resilience (Print, Reprint, Retry, PDF)
**Areas discussed:** Reprint entry point, PDF delivery mechanism, Retry visibility to cashier, PDF visual format

---

## Reprint entry point

| Option | Description | Selected |
|--------|-------------|----------|
| PaymentPane recent-payments row | Add a 'Reprint' action to each row in the existing 'recent payments' list on /payments — reuses existing query, no new state | ✓ |
| Post-checkout receipt screen only | Add a 'Reprint' button next to Print/Email on the receipt screen right after checkout | |
| Both | Reprint on both surfaces | |

**User's choice:** PaymentPane recent-payments row (Recommended option).
**Notes:** None — recommended option accepted as-is.

---

## PDF delivery mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Both | Standalone download (client-side, @react-pdf/renderer) plus email attachment (extends send-receipt-email edge function) | ✓ |
| Standalone download only | Client-side only, no edge function changes | |
| Email attachment only | Extend send-receipt-email only, no download button | |

**User's choice:** Both (Recommended option).
**Notes:** None — recommended option accepted as-is.

---

## Retry visibility to cashier

| Option | Description | Selected |
|--------|-------------|----------|
| Silent until final failure | Matches existing fire-and-forget pattern, only a final toast.error on failure | |
| Show retrying status | Visible "Retrying print (N/3)..." indicator during attempts, then final success/failure toast | ✓ |

**User's choice:** Show retrying status — explicitly chose the non-recommended option, upgrading past today's silent pattern.
**Notes:** New UI state, no existing precedent in the print flow for a visible retry indicator; captured as D-03 in CONTEXT.md.

---

## PDF visual format

| Option | Description | Selected |
|--------|-------------|----------|
| Plain-text monospace block | Embed buildThermalReceiptText's exact output as monospace text — zero drift from print/email | |
| Styled report-style layout | Table-based layout like exporters/pdf.tsx's report PDFs, deriving structure from ReceiptData independently | (initially selected, then reconsidered) |

**User's choice:** Initially selected "Styled report-style layout." Claude flagged that this conflicts with RCP-03's locked requirement text ("reusing the existing `receipt-format.ts` formatting logic rather than a second, divergent formatter") and asked for reconciliation. Offered: (a) styled shell around the same text content, (b) knowingly deviate and flag it, (c) revert to plain-text monospace. User chose (c) — plain-text monospace, matching RCP-03 literally.
**Notes:** Final decision recorded as D-05 in CONTEXT.md, with a note that a styled *shell* (logo/header) around the same monospace body remains open to the planner if it doesn't touch receipt body content.

---

## Claude's Discretion

- Exact retry delay/backoff between print attempts (fixed vs. exponential) — default to a small fixed delay unless research finds a reason for backoff.
- Exact i18n copy/keys for the retry status and toasts — follow existing `featOrders`/`common` namespace conventions.
- Whether retry logic distinguishes failure reasons (offline/out-of-paper/disconnected) or treats all failures uniformly — default to uniform handling.
- Exact UI placement/copy for the Reprint action in a PaymentPane row — no `UI hint` flagged for this phase in ROADMAP.md.

## Deferred Ideas

None — discussion stayed within the four selected areas. RCP-05 (full outbound email service) remains explicitly out of scope, unchanged from REQUIREMENTS.md.
