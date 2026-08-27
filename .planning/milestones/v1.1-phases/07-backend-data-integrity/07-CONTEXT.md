# Phase 7: Backend data integrity - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent backend correctness fixes, bundled per blast-radius ordering (sequenced after Phase 6 security hardening, functionally unrelated to it):

1. **DATA-01:** `receive_shipment`'s `ON CONFLICT (product_id) DO UPDATE` currently does a dumb overwrite (`cost_price = EXCLUDED.cost_price, expiry_date = EXCLUDED.expiry_date`) — restocking a product before the prior batch sells out silently destroys the prior batch's cost/expiry data. Fix: weighted-average `cost_price` + earliest-expiry-wins `expiry_date`, within the existing one-row-per-product `inventory` model (no lot/batch tracking).
2. **DATA-02:** `settings-backup`/`settings-restore` edge functions still query/upsert the dropped `pool_tables` table (removed from the schema in Phase 1) — both functions currently hard-fail against the live schema.
3. **DATA-03 (pulled forward from Phase 8 per user decision, see D-05):** Regenerate `supabase.types.ts` to include `suppliers`/`shipments`/`receipt_settings`/`receive_shipment`, removing the `as any` workaround cast in `src/entities/settings/model/queries.ts`.

</domain>

<decisions>
## Implementation Decisions

### Weighted-average-cost formula (DATA-01)
- **D-01:** When the existing inventory row has `quantity_on_hand > 0`, merge as: `cost_price = (old_qty * old_cost + new_qty * new_cost) / (old_qty + new_qty)` (rounded to `numeric(10,2)`, matching the column's existing precision), `expiry_date = LEAST(old_expiry, new_expiry)` treating NULL as "no info" (see D-02 for NULL semantics).
- **D-02 — explicit zero-stock special case:** When the existing row's `quantity_on_hand = 0` (prior batch fully sold out), do **not** run it through the weighted-average/earliest-wins formula — explicitly replace `cost_price` and `expiry_date` with the new shipment's values outright. — **Rationale (user-confirmed, not just code clarity):** a zero-stock row can still be carrying a stale `expiry_date` from the sold-out batch; blindly taking `LEAST(old_expiry, new_expiry)` in that case would incorrectly apply an irrelevant expired-batch date to fresh stock. The cost-averaging math technically reduces to the same result at `old_qty=0`, but the explicit branch is required for the expiry-date correctness, not just readability.
- **D-03 — NULL expiry semantics:** A real date always wins over NULL when merging (`COALESCE` semantics: if one side is NULL, take the other side's date; only NULL if *both* are NULL). Loose-weight items (rice/atta/dals sold by kg) legitimately have `expiry_date = NULL`; treating NULL as "unknown" rather than "no expiry, discard the other's" preserves more information for near-expiry alerting.

### pool_tables removal (DATA-02)
- **D-04:** Hard-remove all `pool_tables` code from both `settings-backup/index.ts` and `settings-restore/index.ts` — stop `SELECT`ing it into the backup snapshot, stop reading/upserting it on restore, drop the `pool_tables` field from the `Snapshot` type in `settings-restore/index.ts`. No backward-compat tolerance for old backup snapshots that still contain a `pool_tables` key (this is pre-production data; no real backup depends on restoring pool_tables). — **Reversibility:** reversible if a real historical backup with pool_tables data ever needs to be restored (would need a one-off manual DB fix at that point, not a code path).

### DATA-03 scope (pulled forward)
- **D-05:** User confirmed pulling DATA-03 (types regen for `suppliers`/`shipments`/`receipt_settings`/`receive_shipment`, removing the `as any` cast in `src/entities/settings/model/queries.ts`) into this phase, rather than leaving it in Phase 8 as ROADMAP.md currently has it. Rationale: this phase already touches `receive_shipment`'s migration; bundling avoids a second types-regen pass. **Planner/downstream note:** ROADMAP.md's Phase 7 "Requirements" line and Phase 8's Success Criterion #5 should be updated to reflect DATA-03 moving to Phase 7 — this is a roadmap-sequencing change, not new scope (DATA-03 was already a committed v1.1 requirement, just resequenced).
- Regenerating types requires whatever DB access path Phase 6 used (`npx supabase gen types typescript --local` doc'd in CLAUDE.md, or against the live Supabase project — no `project_id` link exists locally per `supabase/config.toml`; check how Phase 6's `receipt_settings` migration was verified live for the working access pattern).

### Margin-report regression test scope (Success Criterion #2)
- **D-06:** Test is a **regression guard only**: snapshot the Product Sales Margin report before a `receive_shipment` call, call it, snapshot again, assert prior rows are unchanged. This is sufficient because `order_items` already snapshots `cost_price` at sale time (confirmed in code — `20260818000002_order_items_cost_price_snapshot.sql` / `20260818000003_process_direct_sale_atomic_cost_snapshot.sql`), so historical margin is structurally already immune to a later `inventory.cost_price` change. The test proves the new weighted-avg logic doesn't accidentally break that existing immunity — it does **not** need to additionally assert that a NEW sale after the restock picks up the new weighted-average cost (that's normal `process_direct_sale_atomic` behavior, not something DATA-01 changes).

### Claude's Discretion
- Whether the weighted-average migration is a new file (`202608XX..._receive_shipment_weighted_avg_cost.sql`) replacing the function body again (matches the existing pattern of `20260817000002_receive_shipment_atomicity.sql` doing the same for a prior fix) — planner's call, but follow the existing `CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT service_role` pattern from that migration.
- Exact rounding/truncation approach for the weighted-average division if `numeric(10,2)` produces a repeating decimal (e.g., 2-for-3 split) — standard Postgres `numeric` rounding is acceptable, no special banker's-rounding requirement was raised.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` (DATA-01, DATA-02, DATA-03 definitions, lines 26-28)
- `.planning/ROADMAP.md` §"Phase 7: Backend data integrity" (lines 138-149) — success criteria; note D-05 pulls DATA-03 forward from Phase 8 (ROADMAP.md lines 151-166 will need a corresponding edit)

### receive_shipment (DATA-01)
- `supabase/migrations/20260817000002_receive_shipment_atomicity.sql` — current full function body; the `ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand = ..., cost_price = EXCLUDED.cost_price, expiry_date = EXCLUDED.expiry_date` at lines 42-47 is the exact bug to fix
- `supabase/migrations/20260817000001_suppliers_receiving_expiry.sql` — original `receive_shipment` + `inventory`/`shipments` schema this evolved from
- `supabase/migrations/20260818000002_order_items_cost_price_snapshot.sql` and `20260818000003_process_direct_sale_atomic_cost_snapshot.sql` — proof that historical margin already reads a sale-time cost snapshot, not live `inventory.cost_price` (grounds D-06's regression-only test scope)
- `src/entities/tab/model/product-sales-report.integration.test.ts`, `src/entities/tab/model/queries-reports.ts` — existing margin report query/tests to extend for the D-06 regression test

### settings-backup / settings-restore (DATA-02)
- `supabase/functions/settings-backup/index.ts` — `pool_tables` SELECT at line 71, snapshot field at line 91
- `supabase/functions/settings-restore/index.ts` — `pool_tables` in `Snapshot` type (lines 19-24), read at line 100, upsert block at lines 124-132

### DATA-03 (types regen)
- `src/entities/settings/model/queries.ts` — the `as any` cast to remove once `receipt_settings` types exist
- `src/shared/lib/supabase.types.ts` — target file to regenerate
- CLAUDE.md "Missing generated types workaround" section — documents the `const db = supabase as any` pattern and the `npx supabase gen types typescript --local > ...` regen command

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The weighted-average/earliest-expiry merge logic is pure SQL inside the existing `receive_shipment` function's per-item loop (lines 37-50 of `20260817000002_receive_shipment_atomicity.sql`) — no new tables, no new RPC, just replace the `ON CONFLICT DO UPDATE SET` clause and read the pre-update row first (need a `SELECT ... FOR UPDATE` of the current `inventory` row before the upsert to get `old_qty`/`old_cost`/`old_expiry` for the formula, since `EXCLUDED` only exposes the new values).
- `service-role Vitest test pattern` from Phase 6's RLS integration test (env-guard, `createAuthStaff`, `signInClient`, `describe.skipIf`) is reusable for the `receive_shipment` weighted-avg integration test — same "call the RPC as service-role/authenticated staff, assert the resulting row" shape.

### Established Patterns
- Migrations that patch a `SECURITY DEFINER` RPC use `CREATE OR REPLACE FUNCTION` + explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role` (see `20260817000002_receive_shipment_atomicity.sql` lines 61-62) — follow exactly for the new migration.
- Edge functions in this repo use a shared `json()` response helper and manual Bearer-token/service-role client split (see `settings-backup/index.ts` lines 1-45) — the `pool_tables` removal is a pure deletion within this existing structure, no pattern change needed.

### Integration Points
- `receive_shipment` is called exclusively from `src/features/receive-shipment/` (per CLAUDE.md's feature list) — no client-side change needed for DATA-01/DATA-02, the fix is entirely server-side (SQL migration + edge function edit).
- DATA-03's types regen affects any file currently using `supabase as any` for `suppliers`/`shipments`/`receipt_settings`/`receive_shipment` — grep confirmed only `src/entities/settings/model/queries.ts` currently has this cast for `receipt_settings`; check for others touching `suppliers`/`shipments`/`receive_shipment` at plan time.

</code_context>

<specifics>
## Specific Ideas

No UI/UX changes — this phase is entirely backend (SQL migration + edge function fixes + generated types), consistent with ROADMAP.md having no "UI hint" for Phase 7.

</specifics>

<deferred>
## Deferred Ideas

None raised — user stayed within DATA-01/DATA-02/DATA-03 scope for this phase.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope (`todo.match-phase 07` returned 0 matches).

</deferred>

---

*Phase: 07-backend-data-integrity*
*Context gathered: 2026-08-17*
