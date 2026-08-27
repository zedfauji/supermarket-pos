# Phase 5: Delete void-order feature - Context

**Gathered:** 2026-08-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the orphaned void-order feature end-to-end — client component, edge function, RBAC seed rows/Action type, i18n keys, and its E2E spec — while leaving `orders.status='voided'` and the report RPCs that still read it (`get_voids_report`, `close_caja_session`) completely untouched. After this phase, refund is the only staff-facing reversal path for a completed order.

</domain>

<decisions>
## Implementation Decisions

### RBAC removal
- **D-01:** `void_order` is removed in two places, not one: (1) a new forward migration `DELETE`s the `('manager', 'void_order')` / `('admin', 'void_order')` rows from `role_permissions` (the seeding migration, `20260510000001_rls_rewrite_phase13.sql`, is in the past and must not be edited); (2) `'void_order'` is dropped entirely from the `Action` type/`ACTIONS` array in `src/shared/lib/rbac.ts` — not kept as a reserved/unused value. — **Reversibility:** costly — re-adding requires a new migration re-inserting the seed rows plus reverting the type change; no data loss risk since it's a pure permission grant, not user data.

### Edge function
- **D-02:** `supabase/functions/void-order/` is deleted outright — no live callers remain after the client-side removal, no stub kept.

### Test cleanup — full sweep
- **D-03:** Delete the feature's own tests with the feature folder: `src/features/void-order/model/useVoidOrder.test.tsx`, `src/features/void-order/ui/VoidOrderDialog.test.tsx`.
- **D-04:** Update every incidental reference so the suite is green with void-order fully removed, not left for CI to discover:
  - `src/shared/lib/edge-function-contracts.test.ts` — remove assertions covering the `void-order` registry entry, `VoidOrderRequestSchema`/`VoidOrderResponseSchema`, `callVoidOrder`.
  - `src/shared/lib/__tests__/audit-edge-coverage.test.ts` — remove `void-order` from whatever coverage list/table it audits.
  - `src/shared/lib/rbac.test.ts` — remove `void_order`-action assertions.
  - `e2e/helpers/supabase.ts` — delete the `seedVoidableOrder` helper (used only by the spec being deleted; confirmed via grep, no other spec references it).
  - Full sweep also includes: `src/shared/lib/edge-function-contracts.ts` (remove `VoidOrderRequestSchema`/`VoidOrderResponseSchema`/`callVoidOrder`/registry entry), `src/features/void-order/` (whole folder, including `index.ts`), `src/shared/lib/i18n/locales/{es-MX,en-US}/featOrders.json` (remove the `voidOrder` key block in both).
  - Re-run `npm run test` and `npm run typecheck` after the sweep to confirm nothing else breaks.

### Claude's Discretion
- The exact form of the "automated grep/lint check returns zero matches" required by the phase's Success Criteria #2 (e.g. a one-off grep run during verification vs. a persisted script) — planner/executor decides based on what's cheapest to verify and doesn't need to persist as a new script unless reuse is likely.
- Commit granularity (single commit vs. split by area: RBAC/migration, edge function, client feature+i18n, test cleanup).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §SALE-01 — the locked requirement text for this phase
- `.planning/ROADMAP.md` §"Phase 5: Delete void-order feature" — goal, success criteria, dependency note (sequenced first specifically to shrink the diff surface on `rbac.ts`/`edge-function-contracts.ts` before Phase 6+ touch them)

### Project-level
- `.planning/PROJECT.md` — "Active" requirements list, testing policy (automated Playwright E2E only, no manual UAT)

No external ADRs/specs beyond the above — requirements fully captured in REQUIREMENTS.md/ROADMAP.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### What's being deleted (confirmed via grep, 2026-08-16)
- `src/features/void-order/` — `model/useVoidOrder.ts` + `.test.tsx`, `ui/VoidOrderDialog.tsx` + `.test.tsx`, `index.ts`. **Zero live importers of `VoidOrderDialog`/`useVoidOrder` outside their own folder** — confirmed orphaned.
- `supabase/functions/void-order/` — the edge function directory.
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` lines ~304, ~322 — the `role_permissions` seed rows (`('manager', 'void_order')`, `('admin', 'void_order')`). This migration is historical — removal happens via a new migration, not an edit to this file.
- `src/shared/lib/edge-function-contracts.ts` lines ~708-787, ~1224-1227 — `VoidOrderRequestSchema`, `VoidOrderResponseSchema`, `callVoidOrder`, and the `'void-order'` registry entry.
- `src/shared/lib/rbac.ts` lines 20, 48 — `'void_order'` in the Action type/ACTIONS array.
- `src/shared/lib/i18n/locales/{es-MX,en-US}/featOrders.json` line 85 — `voidOrder` key block (both locales).
- `e2e/18-void-order.spec.ts` — the whole spec file (confirmed self-skipping per prior audit).
- `e2e/helpers/supabase.ts` — `seedVoidableOrder` helper, used only by the spec above.

### Must NOT be touched — confirmed untouched
- `orders.status = 'voided'` enum value and any rows carrying it.
- `get_voids_report` and `close_caja_session` RPCs (still read `status='voided'`).
- `src/widgets/VoidRefundPanel/` — a **separate, read-only report widget** over `useVoidRefundReport`/`orders.status='voided'`. Not related to the `void-order` feature/dialog; confirmed no import relationship. Stays as-is.
- `src/features/void-open-unit/` — a distinct feature (voiding a case→piece unit breakdown), unrelated to void-**order**. Not in scope.
- `e2e/35-refund.spec.ts` — must keep passing unchanged, confirming refund remains the sole reversal path.
- `supabase/config.toml` — grepped, has no `void-order` reference to clean up.
- No CI workflow files reference `void-order` or the spec being deleted.

### Integration points
- RBAC: `Action` type and `ACTIONS` array live in `src/shared/lib/rbac.ts`; `role_permissions` table is the DB-side grant list read at runtime — both need to move together (D-01).
- Edge function contracts: single registry object in `edge-function-contracts.ts` maps action names to schemas/callers — deletion is a matter of removing one registry entry plus its schema/caller exports.

</code_context>

<specifics>
## Specific Ideas

No specific UI/behavior preferences — this is a subtractive/cleanup phase with success criteria already fully specifying the "why" and "what must remain true." No new UI to design.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep suggestions came up.

</deferred>

---

*Phase: 5-delete-void-order-feature*
*Context gathered: 2026-08-16*
