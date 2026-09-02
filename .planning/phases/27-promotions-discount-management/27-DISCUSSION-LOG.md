# Phase 27: Promotions & Discount Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 27-promotions-discount-management
**Areas discussed:** Expiry-discount tier table, Scope conflict resolution, Floor-guard behavior, Promo management UI home + manual-apply interaction

---

## Expiry-discount tier table

| Option | Description | Selected |
|--------|-------------|----------|
| Tiered steps | e.g. 14d→10%, 7d→20%, 3d→40% | |
| Single flat threshold | One days/percent pair, no escalation | ✓ (after conflict resolution) |
| Continuous formula | Smooth function of days-remaining | |

**User's choice:** Single flat threshold. (Initially also selected the tiered defaults for a
follow-up question, which contradicted this — a clarifying question was asked and the user
confirmed flat was correct, dropping the tiered numbers.)
**Notes:** Rate scope: Global table (not per-category). Editability: Admin-editable in Settings.
Default value: 14 days → 15% off (reuses the existing near-expiry-alert 14-day default).

---

## Scope conflict resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Best price always wins | Regardless of scope specificity | ✓ |
| Product-level always overrides category | Explicit specificity precedence | |

**User's choice:** Best price always wins — uniformly across product/category/expiry-trigger, one pool.
**Notes:** Expiry-proximity auto-discount does NOT get special priority over manual promotions —
same rule applies to all. Tie-break (identical scope + amount): most recently created promotion
wins; no explicit admin-priority/ordering field.

---

## Floor-guard behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Cap at cost, discount reduced | Silent auto-adjustment | |
| Reject the promotion entirely | Item sells undiscounted | |
| Block checkout, require manager override | Manager-PIN gate to proceed below cost | ✓ |

**User's choice:** Block checkout, require manager PIN override.
**Notes:** Floor is exactly cost (0% margin), not a configurable minimum-margin percentage —
no settings surface for a margin target the store hasn't asked for.

---

## Promo management UI home + manual-apply interaction

| Option | Description | Selected |
|--------|-------------|----------|
| New "Promotions" tab on Settings | Sibling to BillingSettingsTab | |
| New standalone page/route (/promotions) | Own nav entry, own route guard | ✓ |
| Sub-section of /inventory | Grouped with product/category mgmt | |

**User's choice:** New standalone `/promotions` route.
**Notes:** Nav entry lives on the Home dashboard big-box nav (admin-only), alongside
/inventory, /suppliers, /staff. Manual-apply field question: applying an existing promotion at
payment **coexists** with (does not overwrite) the existing whole-sale discountType/discountValue
field on PaymentSchema — the existing field stays the ad-hoc/custom manager-PIN path; a new
field/relation tracks which specific promotion(s) applied, preserving audit/refund-restore fidelity.

---

## Claude's Discretion

- Exact DB schema/table naming for the new promotion entity (no bar-pos-era reference reusable).
- Exact route-guard component name (follow `AuditRoute`/`ReportsRoute` convention).
- Exact copy/wording for the `/promotions` page, below-cost override dialog, and the Settings
  expiry-discount field.
- Exact schema shape for the per-line promotion snapshot (new columns vs. join table).
- Whether discount/promotion evaluation math is centralized in one shared function reused by
  client + RPC (strongly recommended per Phase 24's `decomposeTax()` precedent, but not locked).

## Deferred Ideas

- Per-category expiry-discount rates — revisit only if category decay urgency actually diverges.
- Tiered/escalating expiry discount — the shape gestured at before the flat-threshold conflict
  resolved; could resurface as a future enhancement.
- Explicit admin-priority/ordering field for tie-breaks — deferred as unnecessary complexity.
- Configurable minimum-margin floor (above cost) — deferred, floor stays exactly cost.
- Batch/lot-level expiry tracking — already tracked separately, `.planning/seeds/batch-lot-expiry-tracking.md`.

### Reviewed Todos (not folded)
- Rename Cargo package (bar-pos→supermarket-pos) — unrelated infra/branding.
- Rotate remote Supabase database password — unrelated infra credential.
- Fix CI tauri-build broker order — unrelated CI/build infra.
- Migrate env-production to GitHub Environment — unrelated deployment infra.
