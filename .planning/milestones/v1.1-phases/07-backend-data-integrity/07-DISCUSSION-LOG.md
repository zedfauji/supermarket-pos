# Phase 7: Backend data integrity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 07-backend-data-integrity
**Areas discussed:** Weighted-avg-cost edge cases, pool_tables removal strategy, Margin-report regression test scope, DATA-03 types regen bundling

---

## Weighted-avg-cost edge cases: zero-stock restock

| Option | Description | Selected |
|--------|-------------|----------|
| Formula naturally handles it | Weighted avg with old_qty=0 mathematically reduces to new_cost/new_expiry — no special-case code | |
| Explicit special-case | Add an explicit branch: if old quantity_on_hand=0, treat as a fresh insert, skip averaging math entirely | ✓ |

**User's choice:** Explicit special-case (CONTEXT.md D-02)
**Notes:** Cost math is identical either way, but expiry-date correctness genuinely requires the branch — a zero-stock row can carry a stale expiry_date from the sold-out batch, and blindly taking LEAST(old, new) would wrongly apply that stale date to fresh stock.

---

## Weighted-avg-cost edge cases: NULL expiry handling

| Option | Description | Selected |
|--------|-------------|----------|
| Real date wins over NULL | Treat NULL as "no known expiry"; any real date is more informative and kept (COALESCE(LEAST(old,new), old, new)) | ✓ |
| NULL wins (result is NULL) | If either batch's expiry is unknown, merged result is NULL — conservative | |

**User's choice:** Real date wins over NULL (CONTEXT.md D-03)
**Notes:** Loose-weight items (rice/atta/dals) legitimately have NULL expiry; preserving a known date from the other batch keeps more info for near-expiry alerting.

---

## pool_tables removal strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-remove from both functions | Delete all pool_tables code from settings-backup and settings-restore entirely | ✓ |
| Remove from backup, tolerate in restore | Stop writing pool_tables into new backups, but keep restore defensively ignoring it if present in old snapshots | |

**User's choice:** Hard-remove from both functions (CONTEXT.md D-04)
**Notes:** Pre-production data; no real backup depends on restoring pool_tables.

---

## Margin-report regression test scope

| Option | Description | Selected |
|--------|-------------|----------|
| Regression guard only | Snapshot report before/after receive_shipment, assert prior rows unchanged — matches roadmap's literal wording | ✓ |
| Also assert next-sale margin uses new weighted cost | Add a second assertion that a NEW sale after restock reflects the new weighted-average cost | |

**User's choice:** Regression guard only (CONTEXT.md D-06)
**Notes:** order_items already snapshots cost_price at sale time (confirmed in code), so historical margin is structurally already immune — test proves the new logic doesn't break that existing immunity.

---

## DATA-03 scope (types regen bundling)

| Option | Description | Selected |
|--------|-------------|----------|
| Leave DATA-03 in Phase 8 | Stick to roadmap's assignment — this phase's migration doesn't change receive_shipment's parameter signature | |
| Pull DATA-03 into this phase now | Regenerate types as part of this phase since it's already touching receive_shipment | ✓ |

**User's choice:** Pull DATA-03 into this phase now (CONTEXT.md D-05)
**Notes:** Roadmap-sequencing change, not new scope — DATA-03 was already a committed v1.1 requirement, just resequenced from Phase 8 to Phase 7. ROADMAP.md's Phase 7/8 sections need a corresponding edit at plan time.

---

## Claude's Discretion

- Whether the weighted-average migration is a new file vs. modifying the existing one further — planner's call, follow existing `CREATE OR REPLACE FUNCTION` pattern.
- Exact rounding/truncation approach for the weighted-average division at `numeric(10,2)` precision — standard Postgres rounding, no special requirement raised.

## Deferred Ideas

None — user stayed within DATA-01/DATA-02/DATA-03 scope.
