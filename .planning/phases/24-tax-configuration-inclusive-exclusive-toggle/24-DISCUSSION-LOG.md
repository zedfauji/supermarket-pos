# Phase 24: Tax Configuration (Inclusive/Exclusive Toggle) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 24-tax-configuration-inclusive-exclusive-toggle
**Areas discussed:** Default toggle value, Past-sale remediation, Receipt tax line, Exclusive-mode necessity

---

## Default toggle value

| Option | Description | Selected |
|--------|-------------|----------|
| Default ON (inclusive) | Matches confirmed reality — shelf prices already include tax; bug fixed the moment this ships, no separate action needed | ✓ |
| Default OFF (exclusive) | Preserves today's additive math as default; admin must flip it manually to fix the overcharge bug | |

**User's choice:** Default ON (inclusive)
**Notes:** —

---

## Past-sale remediation

| Option | Description | Selected |
|--------|-------------|----------|
| No remediation | Code fix only, going forward; no refunds/adjustments to already-closed sales | ✓ |
| Flag for manual review | Note affected date range/overcharge total somewhere for the owner to decide separately | |

**User's choice:** No remediation
**Notes:** —

---

## Receipt tax line

| Option | Description | Selected |
|--------|-------------|----------|
| Always show subtotal + tax + total | Same 3-line shape regardless of mode — inclusive decomposes backward, exclusive keeps today's addition | ✓ |
| Only show it in exclusive mode | Inclusive-mode receipts stay total-only (as today); exclusive-mode receipts gain the breakdown line | |

**User's choice:** Always show subtotal + tax + total
**Notes:** Scouted `receipt-format.ts` / `ReceiptDataSchema` before asking — confirmed no tax line exists on any receipt today (thermal/PDF/email), so this is new build either way.

---

## Exclusive-mode necessity

| Option | Description | Selected |
|--------|-------------|----------|
| Keep both modes (per TAX-01..03) | Requirements already lock in a toggle with both states — build as specified | ✓ |
| Discuss dropping exclusive mode | Flag exclusive mode as possibly unnecessary scope for a single-store product | |

**User's choice:** Keep both modes (per TAX-01..03)
**Notes:** —

---

## Claude's Discretion

- Exact receipt tax-line wording/labels within the existing `receipt` i18n namespace.
- Whether to de-duplicate the two server-side tax-calc RPCs into a shared function or patch both in place.
- Report/margin impact — scouted and found no report widget reads tax fields; treated as out of scope pending research confirmation.

## Deferred Ideas

- Per-product/category tax override — confirmed no such concept exists in schema; not requested.
- Refund/adjustment for historically overcharged sales — explicitly ruled out for this phase, not lost as an idea.
