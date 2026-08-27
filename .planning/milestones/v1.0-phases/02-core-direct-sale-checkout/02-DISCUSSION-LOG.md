# Phase 2: Core Direct-Sale Checkout - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-11
**Phase:** 2-Core Direct-Sale Checkout
**Areas discussed:** Hold/park a sale, Loose-weight item entry, Unknown/unmatched barcode, Receipt & payment finish flow

---

## Hold/park a sale

| Option | Description | Selected |
|--------|-------------|----------|
| No — linear only | Strictly scan→pay→done, no held-sale concept | |
| Yes — single hold slot | One in-progress cart can be set aside and resumed | ✓ |
| Yes — multiple named holds | Several sales held simultaneously, labeled | |

**User's choice:** Yes — single hold slot

| Follow-up | Options | Selected |
|-----------|---------|----------|
| New sale while one is held | Start a new sale ✓ / Lock the register | Start a new sale |
| Auto-expiry | No auto-expiry ✓ / Expire after N minutes | No auto-expiry |
| Stock reservation while held | No reservation ✓ / Reserve stock while held | No reservation — decrement at payment |
| PIN gate to clear a held sale | No PIN gate ✓ / Require manager PIN | No PIN gate |

**Notes:** All follow-ups took the recommended option.

---

## Loose-weight item entry

| Question | Options | Selected |
|----------|---------|----------|
| How weight is entered | Search + manual weight entry ✓ / Barcode + manual weight / Preset weight buttons | Search + manual weight entry |
| Per-kg price source | Existing sale price field ✓ / Separate per-kg price field | Existing sale price field (per-UoM) |
| Editing weight after add | Same edit UX as quantity ✓ / Remove and re-add only | Same edit UX as quantity |
| Case→piece breakdown location | Inventory-side only ✓ / Checkout can trigger it | Inventory-side only |

**Notes:** All questions took the recommended option.

---

## Unknown/unmatched barcode

| Question | Options | Selected |
|----------|---------|----------|
| Behavior on no match | Error toast + stay on search ✓ / Prompt to quick-create product | Error toast + fall back to manual search |
| Logging failed scans | No logging (recommended) / Log to audit trail ✓ | Log to audit trail |

**User's choice:** Log to audit trail — deviated from the recommended "no logging" option.
**Notes:** User explicitly wants visibility into which barcodes keep failing so the catalog can be backfilled later.

---

## Receipt & payment finish flow

| Question | Options | Selected |
|----------|---------|----------|
| Receipt after payment | Auto-print always (recommended) / Prompt print/email/skip | Auto-print, plus explicit email/skip/WhatsApp options |
| Split-payment UI | Carry over as-is ✓ / Simplify to single-method | Carry over as-is |
| Post-sale screen | Immediately clear to fresh cart / Brief success confirmation, then clear ✓ | Brief success confirmation, then clear |

**User's choice (receipt delivery):** Free-text — "Auto Print, however option to email, skip or send it through WhatsApp."
**Follow-up:** WhatsApp delivery flagged as new integration work (no reusable WhatsApp infra survived the Phase 1 waitlist strip). Asked whether to include in Phase 2 or defer.
**Resolution:** Defer to its own phase (recommended) — Phase 2 ships auto-print + email + skip only.

---

## Claude's Discretion

- Exact schema/naming for adapting the kept `tabs`/`order_items` plumbing for direct-sale checkout, and how the held sale is represented underneath.
- UI layout/component structure for the numeric weight keypad and hold/resume banner.
- Where in the audit log the failed-scan events surface.
- Exact wording/duration of the post-sale success confirmation.

## Deferred Ideas

- WhatsApp receipt delivery — new WhatsApp Business API/Twilio-style integration required; candidate for a future phase/milestone alongside the already-deferred v2 AI invoice intake work.
