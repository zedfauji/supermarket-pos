---
status: resolved
trigger: "Fix useInventoryLog wrong reason schema dropping refund rows. useInventoryLog() (src/entities/inventory/model/queries.ts ~433-484) fetches last 100 stock_movements rows and parses each with InventoryLogSchema.parse({..., reason: row.reason, ...}). InventoryLogSchema's reason field is InventoryAdjustReasonSchema (domain.ts ~98): only 'sale'|'manual_adjustment'|'waste'|'delivery'|'correction'|'physical_count'|'expired'. stock_movements rows can legitimately have reason:'refund' (written by process-refund, exercised by e2e/payments/refund.spec.ts), which belongs to the wider StockMovementReasonSchema (domain.ts ~118, used by StockMovementSchema ~674) that also includes 'refund' plus already-removed bar-pos values. Bug: in the fetch loop (queries.ts ~466-480), InventoryLogSchema.parse(...) throwing for one row causes the catch block to return err(unknownError(e)) from the WHOLE queryFn, not skip just that row. MovementsTab.tsx only destructures { data: logs, isLoading } and never reads resultError, so the failure is silent — tab renders 'No log entries.' with no indication anything failed, even though the REST response contains the rows fine. User wants investigation, the appropriate fix applied (option a: parse against StockMovementSchema/StockMovementReasonSchema since that matches the real value space, adjusting InventoryLog consumer usage in MovementsTab.tsx; vs option b: skip-and-log the bad row plus surface resultError), and a unit test in src/entities/inventory asserting a stock_movements row with reason='refund' is NOT dropped by useInventoryLog(). Do not touch supabase/ or rbac.ts."
created: 2026-09-05T00:00:00Z
updated: 2026-09-05T00:00:00Z
---

## Current Focus

bug_class: "Bohrbug — fully deterministic given a 'refund' row inside the last-100 stock_movements window. No SBFL (no failing test existed before this session)."

reasoning_checkpoint:
  hypothesis: "useInventoryLog() parses stock_movements rows with InventoryLogSchema (narrow InventoryAdjustReasonSchema, non-nullable productId, .int() delta) instead of StockMovementSchema — the schema domain.ts explicitly declares for that table. A reason='refund' row makes .parse() throw; the catch's `return err(unknownError(e))` returns from the WHOLE queryFn, discarding all 100 rows. MovementsTab reads only { data, isLoading }, never resultError, so the tab renders the empty state with no error."
  confirming_evidence:
    - "queries.ts:466-481 — InventoryLogSchema.parse inside the for-loop; catch does `return err(unknownError(e))`, which exits the queryFn, not the iteration."
    - "domain.ts:622 InventoryLogSchema.reason = InventoryAdjustReasonSchema (7 values, no 'refund'); domain.ts:117-130 StockMovementReasonSchema includes 'refund'; domain.ts:670 comment declares StockMovementSchema the 'ledger table replacing inventory_log' — i.e. the schema OF stock_movements."
    - "supabase/migrations/20260825000001_restore_refunded_product_inventory.sql:28-29 — restore_inventory_on_refund_item trigger INSERTs reason='refund' into stock_movements on every refund_items row."
    - "supabase.types.ts:1632 — stock_movements.product_id is `string | null` (made nullable by migration 20260426000010), but InventoryLogSchema.productId is non-nullable UuidSchema: a second, independent parse-throw source."
    - "MovementsTab.tsx:45 destructures only { data: logs, isLoading }; the hook already exposes resultError (queries.ts:490) and nothing consumes it → line 99 falls through to the 'No log entries.' EmptyState."
    - "Independent live confirmation by a prior session, recorded in e2e/helpers/supabase.ts:151-168: REST 200 with correct embedded rows vs. an empty rendered UI; that session added a `delete().eq('reason','refund')` sweep as a test-only workaround and explicitly deferred the code fix."
  falsification_test: "Drive the queryFn with a mocked row batch containing reason='refund'. If the refund row AND its batch-mates come back in `data`, the hypothesis is wrong."
  fix_rationale: "Parse with StockMovementSchema — the schema that actually describes stock_movements' value space — so 'refund' and a null product_id are valid inputs, not exceptions. That is the root cause, not the symptom. Independently, safeParse-and-skip stops any single unparseable row from ever blanking the entire ledger again, and surfacing resultError in MovementsTab stops a genuine fetch failure from masquerading as 'no data'."
  blind_spots:
    - "Historical rows with now-dead bar-pos reasons (prep_production/prep_consumption/combo_component/void) parse fine under StockMovementSchema but have no entry in MovementsTab's REASON_LABEL_KEY — the current fallback would MISLABEL them as 'Manual Adjustment'. Mitigated by falling back to the raw reason string instead."
    - "Not touching the DB CHECK constraint (supabase/ is off-limits): a reason the DB accepts but StockMovementReasonSchema lacks would still be skipped — now logged and non-fatal instead of fatal."
    - "MovementsTab resolves product names from useInventory(); a refund row for a product absent from the inventory list still renders a short id. Pre-existing, out of scope."
  candidate_causes:
    - "code: wrong Zod schema chosen for the table (reason enum + nullable productId mismatch)"
    - "code: per-row parse failure aborts the whole batch (`return` inside a loop's catch)"
    - "code: MovementsTab drops resultError, converting every failure into a silent empty state"
    - "data: trigger-written reason='refund' rows legitimately present in the last-100 window"
    - "config/environment: ruled out — no deployment skew; repo HEAD reproduces deterministically"
  and_gate: "yes. The visible symptom requires BOTH a refund row in the last-100 window [data] AND the narrow schema [code]. The *silence* is a third necessary condition [code, MovementsTab]. Fixing only the schema leaves the next unparseable reason blanking the tab just as silently, so the fix must close the schema mismatch, the batch abort, and the swallowed error together."

next_action: "TDD red phase: add a `describe('useInventoryLog')` block to src/entities/inventory/model/queries.test.ts asserting a reason='refund' row is returned, and run it to confirm it FAILS before any fix."

## Symptoms

expected: "MovementsTab shows all stock_movements rows including refund rows generated by process-refund."
actual: "Refund rows silently vanish from the Movements tab; UI shows 'No log entries.' with no error, even though REST response contains the rows."
errors: "InventoryLogSchema.parse(...) throws a ZodError when reason='refund' (not in InventoryAdjustReasonSchema); caught but the catch returns err() from the whole queryFn instead of skipping just the bad row."
reproduction: "Process a refund (e2e/payments/refund.spec.ts flow) which writes a stock_movements row with reason='refund', then open Inventory > Movements tab — the whole batch (last 100 rows) fails to parse/render silently."
started: "Not dated by reporter — discovered via direct network inspection confirming REST response is fine but UI renders empty."

## Eliminated

- hypothesis: "Deployment/environment skew (like the Phase 27 discount-guard incident in the knowledge base) rather than a code defect."
  evidence: "The defect is visible at repo HEAD by reading queries.ts:466-481 against domain.ts:618-625 — no deployed artifact is involved, and the parse happens client-side. Ruled out before testing."
  timestamp: 2026-09-05

## Evidence

- timestamp: 2026-09-05
  checked: "src/entities/inventory/model/queries.ts:433-494 (useInventoryLog)"
  found: "Fetches stock_movements (limit 100), then per row `InventoryLogSchema.parse({ id, productId, quantityDelta, reason, staffId, createdAt })` inside try/catch whose catch does `return err(unknownError(e))`."
  implication: "The `return` is inside the queryFn, not the loop — one bad row discards all 100. Confirms the abort mechanism."

- timestamp: 2026-09-05
  checked: "src/shared/lib/domain.ts:98-130, 618-636, 668-690"
  found: "InventoryLogSchema.reason = InventoryAdjustReasonSchema (7 values, no 'refund'); productId = non-nullable UuidSchema; quantityDelta = z.number().int(). StockMovementSchema (documented 'ledger table replacing inventory_log') uses StockMovementReasonSchema (12 values incl. 'refund'), nullable productId, plain z.number() delta."
  implication: "StockMovementSchema is the ledger's source of truth; InventoryLogSchema is the legacy pre-rename shape, still correct for the adjust-inventory mutation's return value but wrong for reading the table. Answers the reporter's open question: fix (a) is right."

- timestamp: 2026-09-05
  checked: "supabase/migrations/20260825000001_restore_refunded_product_inventory.sql, supabase.types.ts:1626-1638"
  found: "restore_inventory_on_refund_item trigger INSERTs reason='refund'; product_id column is nullable (`string | null`)."
  implication: "Two independent parse-throw sources exist against real DB rows, not just one. Widening to StockMovementSchema covers both."

- timestamp: 2026-09-05
  checked: "src/widgets/InventoryPagePanel/ui/MovementsTab.tsx:45, 99-104, 147"
  found: "Only { data: logs, isLoading } destructured — resultError exists on the hook and is never read, so any error renders the 'No log entries.' EmptyState. REASON_LABEL_KEY has no 'refund' key and line 147 falls back to the 'Manual Adjustment' label."
  implication: "Confirms the silence. Also means simply widening the schema would render refund rows MISLABELLED as manual adjustments — the label fallback has to change with the fix."

- timestamp: 2026-09-05
  checked: "e2e/helpers/supabase.ts:151-168"
  found: "A prior session confirmed this live (REST 200 with rows vs. empty UI) while writing e2e/inventory/inventory-hub.spec.ts, and added `admin.from('stock_movements').delete().eq('reason','refund')` to resetTestData as a test-only containment, explicitly noting the real fix was out of scope for that plan."
  implication: "Independent reproduction by direct network inspection. That sweep is a workaround that hides the bug from E2E and should be removed once the fix lands."

- timestamp: 2026-09-05
  checked: "TDD red phase — new describe('useInventoryLog') block in src/entities/inventory/model/queries.test.ts, run against unmodified queries.ts"
  found: "3 of 4 new tests FAILED (refund row, null product_id row, malformed-row skip) — all with `result.current.data` never becoming defined, i.e. the queryFn returned err and the whole batch was discarded. The 4th (fetch-error surfacing) passed, since that path already returned a Result correctly."
  implication: "Falsification test executed and did NOT falsify: the mechanism is exactly as hypothesised, and one refund row demonstrably discards its batch-mates."

## Resolution

root_cause: "useInventoryLog() validated stock_movements rows with InventoryLogSchema instead of StockMovementSchema — the schema domain.ts declares for that table. Two field-level mismatches (reason: InventoryAdjustReasonSchema has no 'refund'; productId: non-nullable while the column is nullable since migration 20260426000010) made real ledger rows unparseable; the restore_inventory_on_refund_item trigger writes a reason='refund' row on every refund. AND-gate, three necessary conditions: (1) a refund row inside the last-100 window [data], (2) the narrow schema making it throw [code], (3) the loop's catch doing `return err(...)` from the queryFn rather than skipping the row, which converted one bad row into a total batch loss [code]. A fourth condition made it invisible rather than merely broken: MovementsTab.tsx never read the resultError the hook already exposed, so every failure rendered as the 'No log entries.' empty state."

fix: "queries.ts — parse each row with StockMovementSchema via safeParse; on failure log inventory.log.row_parse_failed and skip that row only, so no single row can ever blank the ledger again; queryFn return type widened from Result<InventoryLog[]> to Result<StockMovement[]>. (InventoryLogSchema is left in place at queries.ts:382, the adjust-inventory mutation's read-back of the row it just wrote — that call site controls its own input and its narrow value space is genuinely correct.) MovementsTab.tsx — consume resultError and render it via the same `role=alert` destructive-text pattern StockTab.tsx:314 already uses, suppress the empty state while an error is showing, handle the now-nullable productId, add a 'refund' reason label + filter chip, and fall back to the raw reason string instead of mislabelling unknown reasons as 'Manual Adjustment'. wAdmin catalogs — added reasonOptionRefund (en-US 'Refund' / es-MX 'Reembolso'). e2e/helpers/supabase.ts — the refund sweep stays (test-data isolation between specs) but its comment no longer claims an unfixed app bug and now points at the unit-test regression guard."

verification:
  signal_regression_test:
    result: pass
    evidence: "RED: 3 new tests failed against unmodified code. GREEN after fix: 11/11 in queries.test.ts."
  signal_mutation_at_fix_site:
    result: pass
    evidence: "Mutation A (reinstate `return err(...)` inside the loop) → 'skips a genuinely malformed row' FAILED. Mutation B (swap StockMovementSchema back to InventoryLogSchema) → 'keeps a row with reason=refund' and 'keeps a row whose product_id is null' both FAILED. Each half of the fix is independently guarded; no surviving mutant."
  signal_full_unit_suite:
    result: pass
    evidence: "npm run test — 144 files passed, 1410 tests passed, 0 failed."
  signal_typecheck_lint:
    result: pass
    evidence: "npm run typecheck clean; npm run lint (eslint src --max-warnings 0) clean. The 27 eslint errors in e2e/helpers/supabase.ts are pre-existing (reproduced with the file stashed) and outside the lint gate's `src` scope."
  signal_no_deletion_only_diff:
    result: pass
    evidence: "Substantive schema + error-handling change plus new coverage: 343 insertions across 7 files."
  guardrail_verdict: accepted
  not_covered: "No Playwright assertion was added for the rendered Movements tab. E2E cannot be executed in this session (needs the dev server plus real Supabase E2E credentials), and shipping an unrun spec is worse than shipping none. The defect is a client-side Zod parse, which the mutation-verified unit test pins at exactly the fault site."

files_changed:
  - "src/entities/inventory/model/queries.ts — StockMovementSchema + safeParse skip-and-log; return type now Result<StockMovement[]>"
  - "src/entities/inventory/model/queries.test.ts — new describe('useInventoryLog') with 4 tests (refund row, null productId, malformed-row skip, fetch-error surfacing)"
  - "src/widgets/InventoryPagePanel/ui/MovementsTab.tsx — surfaces resultError, nullable productId, refund label + filter, honest unknown-reason fallback"
  - "src/shared/lib/i18n/locales/en-US/wAdmin.json — reasonOptionRefund"
  - "src/shared/lib/i18n/locales/es-MX/wAdmin.json — reasonOptionRefund"
  - "e2e/helpers/supabase.ts — comment now describes the sweep as test isolation, not a live app bug"

commit: 36193d7
