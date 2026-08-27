# Deferred Items

## 04-04 reports regression suite failures

- `e2e/07-reports.spec.ts`: retained suite has four pre-existing failures unrelated to removed tabs: one ambiguous Voids & Refunds empty-state locator and three Staff Performance assertions against stale `order_items` fields/ambiguous empty-state locators. The pool-tables-dependent `bartender-initiated reason-required removal succeeds` test remains separately excluded by this plan.

  **Resolved in 04-05:** both the locator ambiguity and the underlying stale-`order_items`-column query bug (`useStaffMetrics`'s `fetchOrderItemsInRange`, which selected `created_by`/`price`/`tab_id`/`is_voided` — none of which exist on `order_items`) were fixed. See `04-05-PLAN.md`.

## 04-05: `tip-distribution-rpc.integration.test.ts` `p_closed_by: null` — deferred (out of scope)

04-VERIFICATION.md flagged (WARNING, not BLOCKER) that `src/entities/caja/model/tip-distribution-rpc.integration.test.ts` (lines ~331-528) has authenticated `close_caja_session` calls passing `p_closed_by: null`, which 04-04's `close_caja_session` migration now rejects with `PERMISSION_DENIED` for any authenticated caller whose `p_closed_by` doesn't equal `auth.uid()`.

Investigation (04-05 planning) found this file is already fully broken for a much larger, unrelated reason: it exercises `tip_distribution_entries`, a table that was dropped end-to-end in this project's Phase 1 (Strip & Rebrand) — confirmed absent from `src/shared/lib/supabase.types.ts`. The file predates the strip and was missed as an orphaned Vitest integration test (the Phase-1 decision log records the widget/settings-tab/E2E spec being deleted, but this `src/entities/**/*.integration.test.ts` file survived). Fixing the 6 `p_closed_by: null` call sites would not make this file pass — it would still fail against the dropped table.

**Deferred, not fixed, in 04-05:** this is Phase-1-strip cleanup debt (delete the orphaned file) entangled with a feature this project's roadmap has already fully removed, not Phase 4 REP-01/REP-02 scope. Per planner authority limits, this is a legitimate dependency-conflict deferral. Follow-up: delete `src/entities/caja/model/tip-distribution-rpc.integration.test.ts` in a future cleanup pass (or as part of a Phase-1-completeness audit), not as Phase 4 work.
