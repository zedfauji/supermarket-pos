---
title: Promotions phase — bar-pos prior art and dead-field trap
date: 2026-09-01
context: gsd-explore session, topic "promotions and discount management module"
---

## Bar-pos era promotions engine — don't resurrect its shape

A full promotions engine existed in this repo's bar-pos era and was deliberately dropped in the Phase 1 pivot:

- Built 2026-07-10 (`20260710000004...`): `promotions` schema, `is_promotion_available_fn`, `applied_promotions` table, `evaluate_promotions_rpc`, plus a `migrate_happy_hour_data` migration folding old per-category "happy hour" pricing into it.
- Dropped 2026-08-10: `20260810000008_drop_promotions.sql`, same day as the combos/recipes/ingredients/modifier-rules drop (Phase 1).
- That engine was **combo/pool-tightly-coupled** — `evaluate_promotions_rpc` explicitly excluded combo parents (`v_is_combo IS TRUE OR v_combo_slot_id IS NOT NULL`) and had a `pool_grant` variant tied to pool-table sessions. None of that maps to a supermarket. Treat the old migrations only as a naming/pitfall reference (its own migration comments call out at least 6 numbered pitfalls), not a schema to restore.

## Stale dead-field trap in `domain.ts` — don't anchor on these

`src/shared/lib/domain.ts` still carries fields from the dropped engine, with misleading comments:

- `CategorySchema.happyHourStart` / `happyHourEnd` / `happyHourPrice` (:182-187) and `ProductSchema.happyHourPrice` (:240) — comment says "DEPRECATED — superseded by the promotions engine (Phase 20, D-01)." That "Phase 20" refers to the **old pre-pivot bar-pos roadmap numbering**, not this repo's current Phase 20 (Store Deployment Installer). These fields are always-null vestiges awaiting a cleanup pass (referenced as "Plan 20-11," not yet run as of this writing).
- `ProductSchema.isCombo` / `comboEligible` / `comboPriceOverride` (:252-256) are similarly vestigial — the drop migration comment (`20260810000006:30`) confirms "nothing can ever write is_combo=true ... again," but the columns remain in the DB and generated types.

Whoever plans/executes Phase 25 (Promotions & Discount Management) should build the new promotion entity fresh, not reuse or extend these fields — and should not be confused by the stale "Phase 20" comment into thinking a promotions engine is currently wired up. A separate cleanup pass to physically drop these dead fields is out of scope for Phase 25.
