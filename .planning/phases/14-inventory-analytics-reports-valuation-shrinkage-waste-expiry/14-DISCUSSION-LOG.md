# Phase 14: Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 14-Inventory Analytics Reports (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover)
**Areas discussed:** Data capture gap, Cost basis, Turnover calc, Reason list, Historical data, Report placement, Valuation date-range behavior

---

## Data capture gap (shrinkage/expiry reason codes)

| Option | Description | Selected |
|--------|-------------|----------|
| Add minimal reason-picker UI | Add a reason dropdown to the existing manual-adjust dialog, adding 'expired' as a new enum value. Reports work going forward; past adjustments stay uncategorized. | ✓ |
| Reports only, no new capture UI | Build reports strictly against existing reason codes as-is; shrinkage/expiry reports will show ~zero data until a future phase adds capture UI. | |

**User's choice:** Add minimal reason-picker UI
**Notes:** Only real path to real report data — `waste` enum value exists but is never set by any UI; `expired` doesn't exist yet.

---

## Cost basis (valuation vs. Product Sales margin)

| Option | Description | Selected |
|--------|-------------|----------|
| Document the difference in-UI | Each report states its own formula inline; no reconciliation attempt. | |
| Cross-link with an explanation | Same as above, plus an explicit note/tooltip on the valuation report explaining why it won't match Product Sales margins. | ✓ |

**User's choice:** Cross-link with an explanation

---

## Turnover average-inventory calculation

| Option | Description | Selected |
|--------|-------------|----------|
| Current value as approximation | Use current on-hand valuation as a stand-in for "average inventory," explicitly labeled as approximation. | |
| Reconstruct from movement log | Walk `stock_movements` backward to approximate inventory value at period start, then average start+end. | ✓ |

**User's choice:** Reconstruct from movement log
**Notes:** More implementation work but avoids labeling every turnover number as a rough approximation. This reconstruction logic is shared with Valuation's "as of date" behavior (see below).

---

## Reason picker — which values to expose

| Option | Description | Selected |
|--------|-------------|----------|
| Waste, Expired, Correction, Other | Curated subset; delivery/physical_count stay system-only. | |
| Full enum exposed | Expose every reason value (waste, expired, delivery, correction, manual_adjustment, physical_count), even though delivery/physical_count are normally system-set. | ✓ |

**User's choice:** Full enum exposed

---

## Historical (pre-feature) adjustment data

| Option | Description | Selected |
|--------|-------------|----------|
| Include as 'unclassified', don't guess | Pre-Phase-14 manual_adjustment rows appear under a separate 'unclassified adjustments' line. | ✓ |
| Exclude pre-feature adjustments entirely | Shrinkage/expiry reports only count adjustments made after this phase ships. | |

**User's choice:** Include as 'unclassified', don't guess

---

## Report placement in Reports page

| Option | Description | Selected |
|--------|-------------|----------|
| New 'Inventory' tab group | 4 separate top-level tabs (Valuation, Shrinkage/Waste, Expiry-Loss, Turnover) under a new tab group. | |
| Single combined 'Inventory Analytics' tab | One tab with internal sub-sections for all 4 reports on one scrollable page. | ✓ |

**User's choice:** Single combined 'Inventory Analytics' tab

---

## Valuation report and the shared date-range picker

| Option | Description | Selected |
|--------|-------------|----------|
| Valuation ignores date range | Always shows current on-hand state regardless of page's date filter. | |
| Valuation respects date range as 'as of end date' | Reconstructs stock value as of the end of the selected range using the movement log — reuses the same reconstruction logic needed for turnover. | ✓ |

**User's choice:** Valuation respects date range as 'as of end date'

---

## Claude's Discretion

- Breakdown-level UI details (product vs. category grouping/toggle, table vs. chart presentation) — default to product rows + category subtotal + store total, matching `ProductSalesPanel`'s existing pattern.
- Exact reason-picker widget layout/copy (dropdown vs. radio, ordering) — full enum must be exposed per the decision above, but presentation is Claude's call.

## Deferred Ideas

- Category-level shrinkage/turnover breakdown as the default view — already tracked as a v2 Requirement, not re-opened.
- Trend view (week-over-week/month-over-month) — already tracked as a v2 Requirement, not re-opened.
- A dedicated "write off expired stock" action tied to the near-expiry-alert flow — not requested; D-01's minimal reason-picker on the existing manual-adjust dialog covers the capture gap without a new workflow.
