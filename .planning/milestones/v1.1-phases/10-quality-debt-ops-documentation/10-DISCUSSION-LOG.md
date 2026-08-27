# Phase 10: Quality debt & ops documentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-18
**Phase:** 10-quality-debt-ops-documentation
**Areas discussed:** Entity ID cross-linking (QA-03), DB backup/DR reality (OPS-02), Suppliers loading/error UI (QA-01), Storybook & payment-hook test approach (QA-02, QA-04)

---

## QA-03 scope

| Option | Description | Selected |
|--------|-------------|----------|
| Copy-to-clipboard only | Add copy icon/button next to each entity ID, no new routes/search | |
| Copy + real navigation links | Also add ID-based filtering/search to Payments so IDs become clickable | ✓ |

**User's choice:** Copy + real navigation links.
**Notes:** Bigger scope than the recommended minimal option, but explicitly chosen.

## QA-03 link targets

| Option | Description | Selected |
|--------|-------------|----------|
| payment/tab IDs → Payments page only | Add search/filter to /payments; everything else stays copy-only | |
| payment/tab → Payments AND staff → Staff page | Same, plus staff entity IDs link to /staff filtered/scrolled to that staff member | ✓ |

**User's choice:** payment/tab → Payments AND staff → Staff page.
**Notes:** All other entity types (settings, caja_session, product, order_item, etc.) remain copy-only — no detail page exists for them.

---

## OPS-02 prod hosting

| Option | Description | Selected |
|--------|-------------|----------|
| Self-hosted (same stack as dev) | Doc assumes self-hosted stack, recommends pg_dump mechanism | |
| Supabase Cloud (undecided/TBD) | Doc covers both scenarios since hosting isn't actually decided | ✓ |

**User's choice:** Supabase Cloud (undecided/TBD) — i.e., hosting is genuinely unresolved; doc must cover both paths.

## OPS-02 scope

| Option | Description | Selected |
|--------|-------------|----------|
| Doc only | Markdown doc covering both scenarios, no new scripts | |
| Doc + pg_dump script | Same doc, plus a runnable backup script for the self-hosted fallback | ✓ |

**User's choice:** Doc + pg_dump script.
**Notes:** Script isn't wired into a cron job yet — that's a deploy-time decision, out of scope for this phase.

---

## Loading style (QA-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse TableRowSkeleton | Existing skeleton component, zero new components | ✓ |
| Simple spinner | Existing LoadingSpinner, less visual noise | |

**User's choice:** Reuse TableRowSkeleton.
**Notes:** Error state confirmed to follow InventoryPagePanel's existing `resultError` → `role="alert"` pattern exactly (not presented as a separate choice — it was already the only established convention in the codebase).

---

## QA-02/04 approach

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, proceed as described | 6 Storybook stories + useCheckoutSale.test.ts mirroring useProcessRefund.test.ts | ✓ |
| Let me add something | User wanted to specify additional coverage | |

**User's choice:** Yes, proceed as described.
**Notes:** No changes requested — mechanical work following established patterns.

---

## Claude's Discretion

- Exact wording/structure of the OPS-02 doc (verify `supabase/config.toml` D-06 comments before drafting).
- Exact search/filter UI mechanism added to `/payments` and `/staff` (query param vs. search box).
- Exact locations where entity IDs currently appear in Reports (confirm during research).

## Deferred Ideas

None — discussion stayed within phase scope.
