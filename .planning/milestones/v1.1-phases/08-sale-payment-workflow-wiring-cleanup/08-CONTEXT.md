# Phase 8: Sale/payment workflow wiring + cleanup - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Five independent wiring/cleanup fixes, bundled per ROADMAP.md ordering (sequenced after Phase 7's data-integrity work):

1. **SALE-02:** Staff creation has no UI at all today — build one, wired to the existing `create-staff` edge function, and add the caller-role check that function currently lacks entirely (it has no Bearer-auth check, no role check — anyone with the anon key can call it).
2. **SALE-04:** `useCheckoutSale.submit()` has zero offline guard — a checkout attempt while offline just hangs on `fetch()`. Add a fail-fast guard using the existing `isOnline()`/`networkOfflineError()` pattern.
3. **SALE-05:** Refund and checkout error paths can leak a raw Postgres/RPC error string to staff (confirmed: `useProcessRefund`'s `SUPABASE_ERROR` fallback passes `error.message` straight into a toast). Replace with translated staff-facing messages.
4. **SALE-06:** `useProcessRefund`'s `supabase as any` cast is stale (the `refunds` table has been in `supabase.types.ts` since Phase 7's DATA-03 regen) — remove it. Add Zod validation for the `p_items` jsonb RPC payload, which today has zero client-side shape/business-rule checking.
5. **OPS-01:** `src-tauri/tauri.conf.json`'s `identifier` is still the placeholder `com.yourcompany.barpos` — set it to `com.tajhouseofspices.supermarketpos` (value already decided, recorded in STATE.md).

</domain>

<decisions>
## Implementation Decisions

### Staff-creation UI (SALE-02)
- **D-01:** "Add Staff" is a button on `StaffDashboard` (`src/widgets/StaffDashboard/StaffDashboard.tsx`) that opens a dialog — no new route. Matches the existing `EditRoleDialog`/`EditLocaleDialog`/`ClockInModal` dialog pattern already used in this widget.
- **D-02:** The form captures Name, PIN, Role, and Locale. Locale is settable at creation time (not just via the existing post-creation `edit-staff-locale` feature) — `profiles.locale` already defaults to `es-MX` per `src/shared/lib/domain.ts` line 286, so this only requires extending the `create-staff` edge function's insert to accept an optional `locale` field.
- **D-03:** PIN entry is "PIN" + "Confirm PIN" fields, client-validated to match before submit — prevents a typo locking the new account before its first login.
- **D-04:** After creation, the account is forced through the existing `force-pin-change` feature on first login — the admin-set PIN is a temporary one, not the account's real PIN. No new mechanism needed, reuse what exists.

### create-staff edge function caller-role check (SALE-02)
- **D-05:** Follow the Bearer-auth verification pattern already established in `supabase/functions/process-payment/index.ts` (lines 92-121): check `Authorization: Bearer` header present → verify via `${SUPABASE_URL}/auth/v1/user` (not `admin.auth.getUser()`, which fails on ES256-signed tokens per that function's existing comment) → then look up the caller's `profiles.role` and reject unless `admin` or `manager`. The current `create-staff/index.ts` has none of this — it accepts `{ name, role, pin }` from any caller with an anon key.

### Offline-checkout guard (SALE-04)
- **D-06 — scope:** Guard only `useCheckoutSale.submit()` (direct-sale checkout) before it calls `callProcessDirectSale`. The legacy tab-based `callProcessPayment`/`callProcessSplitPayment` path is not touched — no UI currently calls it for a fresh sale (it's only reachable via Phase 9's not-yet-built reopen-and-edit work).
- **D-07 — check location:** The `isOnline()` check lives inside `useCheckoutSale.submit()`, matching the existing per-mutation-hook pattern already used in `src/entities/tab/model/queries.ts` (lines 347-348, 529-530) and `src/features/remove-tab-item/useRemoveTabItem.ts` (line 34-35) — not pushed into `edge-function-contracts.ts`, which is a raw fetch wrapper with no `isOnline()` usage today.
- **D-08 — surface:** A separate blocking dialog (following the `ConfirmDialog`-style shared/ui pattern) appears when checkout is attempted while offline — **not** an extension of the existing ambient `OfflineBanner` (`src/shared/ui/OfflineBanner.tsx`), which is a passive status indicator for the offline mutation queue, a different UX purpose than interrupting an in-progress checkout action. Also not the generic toast-error path used for other checkout failures — user explicitly wants this distinct from both existing offline-adjacent UI pieces.

### Error-message translation (SALE-05)
- **D-09:** Unmapped Postgres/RPC errors (`SUPABASE_ERROR`, `UNKNOWN_ERROR`) render a single generic translated fallback message (e.g. "Something went wrong, please try again or ask a manager") — raw `error.message` never reaches the UI. Full error detail still goes to `logger.error` for debugging, only the user-facing string is genericized.
- **D-10 — scope of the sweep:** Not limited to `RefundSheet`'s known `SUPABASE_ERROR` leak. Also audit/fix:
  - `useCheckoutSale`'s existing `UNKNOWN_ERROR` i18n messages (`paymentIncomplete`, `rappiUnavailable`, `rappiNotSupported`) — confirm these are complete and no raw error leaks through `callProcessDirectSale`'s error path.
  - `edge-function-contracts.ts`'s error-mapping functions (e.g. `mapProcessPaymentEdgeError`) — check for any pass-through of a raw edge-function `error.message` without a translated wrapper.
  - A full grep sweep of `featOrders`/`wPanels` for any other `toast.error(result.error.message)`-shaped call rendering an unmapped backend string, not just the two spots found during discussion.

### Refund payload Zod validation (SALE-06)
- **D-11 — cast removal:** Remove `const db = supabase as any` from `src/entities/refund/model/queries.ts` and `src/features/process-refund/model/useProcessRefund.ts` — the `refunds` table has been in `supabase.types.ts` since Phase 7's DATA-03 regen (confirmed: `refunds:` appears at line 1098 of the current generated file). The stale "not yet in supabase.types.ts until Phase 6" comments in both files are inaccurate and should be removed too.
- **D-12 — schema strictness:** `z.array` of `{ order_item_id: uuid, qty: positive int, amount: positive number, restock: boolean }`, non-empty array; plus `originalPaymentId` as uuid and `reason` as `RefundReasonSchema` (already exists at `src/shared/lib/domain.ts` line 1377). Basic business rules (qty > 0, amount > 0, non-empty items) are included — cross-row rules that require DB state (`REFUND_EXCEEDS_ORIGINAL`, `ITEM_NOT_IN_ORIGINAL_ORDER`) stay server-side in the `process_refund` RPC, not duplicated client-side.
- **D-13 — schema location:** User's preference is `src/entities/refund/model/types.ts`. **Planner note — soft conflict with project convention:** that file currently states "Never define types here — infer from Zod schemas [in domain.ts]" and only re-exports `Refund`/`RefundItem`/`RefundReason` from `domain.ts`. Since `ProcessRefundInput` is the RPC-call shape for a single mutation (not a domain entity), planner's call on whether to: (a) define the new Zod schema directly in `domain.ts` per the stated single-source-of-truth convention and re-export the inferred type via `entities/refund/model/types.ts` (satisfies both the user's import-location preference and the codebase convention), or (b) define it directly in `entities/refund/model/types.ts` per the user's literal answer. Option (a) is recommended — it satisfies the user's actual concern (schema lives near where it's used/imported) without breaking the stated codebase rule.
- **D-14 — validation failure handling:** `useProcessRefund`'s `mutationFn` calls `safeParse` on the input before the RPC call; on failure, returns `err({ code: 'VALIDATION_ERROR', ... })` immediately — same `Result<T>`/`err()` convention as every other mutation hook in this codebase (`.parse()` + throw was explicitly rejected as inconsistent).

### OPS-01 (Tauri identifier)
- **D-15:** Change `src-tauri/tauri.conf.json`'s `identifier` field from `com.yourcompany.barpos` to `com.tajhouseofspices.supermarketpos` — value already decided by the user (recorded in STATE.md), no further discussion needed. Direct config-file inspection is the verification method (not Playwright-testable, consistent with this project's documented exception for config-value/document facts).

### Claude's Discretion
- Exact wording of the generic fallback error message (D-09) and the offline-blocking dialog's copy (D-08) — planner/executor's call, must go through i18n (`react-i18next`, no hardcoded literals per the project's `i18next/no-literal-string` lint gate).
- Whether the new offline-blocking dialog is a fully new component or a thin wrapper around the existing `ConfirmDialog` (D-08) — planner's call, follow whichever produces less new code per this project's lazy/no-speculative-abstraction convention.
- Whether `create-staff`'s stale `${staffId}@barpos.local` synthetic email domain gets touched — not requested by SALE-02, out of scope unless it blocks something else at plan time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` (SALE-02, SALE-04, SALE-05, SALE-06, OPS-01 definitions, lines 18-32)
- `.planning/ROADMAP.md` §"Phase 8: Sale/payment workflow wiring + cleanup" (lines 161-175) — success criteria

### Staff creation (SALE-02)
- `supabase/functions/create-staff/index.ts` — current function body, no auth/role check at all
- `supabase/functions/process-payment/index.ts` lines 92-121 — Bearer-auth verification pattern to follow (ES256 gotcha documented inline)
- `src/widgets/StaffDashboard/StaffDashboard.tsx` — existing dialog-based admin actions (`EditRoleDialog`, `EditLocaleDialog`, `ClockInModal`, `ForcePinChangeDialog`) to match
- `src/features/force-pin-change/` — existing feature to reuse for post-creation forced PIN change
- `src/features/edit-staff-locale/` — existing locale-edit feature for the field-shape reference
- `src/shared/lib/domain.ts` line 286 — `LocaleSchema.default('es-MX')` on the `profiles` schema

### Offline-checkout guard (SALE-04)
- `src/features/checkout-sale/model/useCheckoutSale.ts` — `submit()` function to guard, no `isOnline()` call today
- `src/shared/lib/connectivity.ts` — `isOnline()` / `useOnlineStatus()` source
- `src/shared/lib/result.ts` lines 229, 520, 564 — `networkOfflineError()` and existing usage pattern
- `src/entities/tab/model/queries.ts` lines 347-348, 529-530 — existing per-mutation `isOnline()` guard pattern to replicate
- `src/features/remove-tab-item/useRemoveTabItem.ts` lines 4, 8, 34-35 — another existing guard instance
- `src/shared/ui/OfflineBanner.tsx` — existing ambient offline UI, explicitly NOT to be extended for this (D-08)
- `src/shared/ui/ConfirmDialog.tsx` — pattern to follow for the new blocking dialog

### Error messages (SALE-05)
- `src/features/process-refund/ui/RefundSheet.tsx` lines 176-183 — confirmed raw-error toast site
- `src/features/process-refund/model/useProcessRefund.ts` — `SUPABASE_ERROR` fallback source
- `src/features/checkout-sale/model/useCheckoutSale.ts` — existing `UNKNOWN_ERROR` i18n messages to audit
- `src/shared/lib/edge-function-contracts.ts` — `mapProcessPaymentEdgeError` and similar error-mapping functions to audit (function defined around line 165)
- `src/shared/lib/result.ts` — `AppError`/`AppErrorCode` union, `err()`/`ok()` helpers

### Refund payload validation (SALE-06)
- `src/entities/refund/model/queries.ts` — `as any` cast (line 17) to remove, stale comment (lines 9-10) to correct
- `src/features/process-refund/model/useProcessRefund.ts` — `as any` cast (line 17) to remove, `p_items` payload to validate
- `src/entities/refund/model/types.ts` — current re-export-only file (see D-13 for placement discussion)
- `src/shared/lib/domain.ts` lines 1377-1422 — `RefundReasonSchema`, `Refund`/`RefundItem` schemas already defined here
- `src/shared/lib/supabase.types.ts` line 1098 — confirms `refunds` table type now exists (post-Phase-7 DATA-03)
- `src/features/process-refund/process-refund-rpc.integration.test.ts` — existing RPC test coverage, extend for the new Zod validation path

### Tauri identifier (OPS-01)
- `src-tauri/tauri.conf.json` line 5 — `identifier` field to change
- `.planning/STATE.md` — records the decided real value `com.tajhouseofspices.supermarketpos` and that this was deliberately left untouched during Phase 1's rebrand

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConfirmDialog` (`src/shared/ui/ConfirmDialog.tsx`) — has a `confirmClassName` passthrough (per CLAUDE.md's touch-target sweep notes) and is the established modal pattern; base for the new offline-blocking dialog (D-08).
- `force-pin-change` feature — directly reusable for D-04, no new mechanism.
- `networkOfflineError()` in `result.ts` — already returns the correctly-shaped `AppError`, just needs to be called from a new call site.
- Bearer-auth + role-check pattern in `process-payment/index.ts` — directly transplantable into `create-staff/index.ts`.

### Established Patterns
- Mutation hooks return `Result<T, AppError>` via `err()`/`ok()` from `result.ts` — every new/changed code path in this phase (staff creation, offline guard, refund validation) must follow this, not throw.
- `isOnline()` guards are checked once, synchronously, right before the network call inside the mutation hook itself — not centralized in a shared wrapper.
- Edge functions in this repo share a Bearer-token-then-service-role-client split (`process-payment/index.ts`), and a `recordAudit()` call for sensitive mutations (`create-staff/index.ts` already does this for staff creation — keep it).
- i18n: all new UI strings go through `react-i18next`, namespaced per FSD layer (`featOrders`/`wAdmin`/`staff` per CLAUDE.md's namespace table) — the lint gate (`i18next/no-literal-string`) will fail on any hardcoded string in the new dialog/form.

### Integration Points
- New staff-creation feature composes into `StaffDashboard` (a widget), following FSD: new `src/features/create-staff/` folder with a mutation hook + dialog UI, consumed by `src/widgets/StaffDashboard/StaffDashboard.tsx`.
- The offline-blocking dialog is triggered from within `useCheckoutSale.submit()`'s call site (likely `PaymentForm` or wherever `submit` is invoked) — planner should trace the actual call site since `useCheckoutSale` itself returns processor functions, not a dialog.
- `src/shared/lib/edge-function-contracts.ts`'s `SENSITIVE_EDGE_FUNCTIONS` audit-coverage test (`src/shared/lib/__tests__/audit-edge-coverage.test.ts` line 22) already lists `create-staff` and `settings-restore` — the new caller-role check must not break that existing audit-coverage assertion.

</code_context>

<specifics>
## Specific Ideas

No specific visual/copy references given beyond what's captured in the decisions above — PIN-confirm and force-pin-change flows should feel like natural extensions of the existing `ClockInModal`/`ForcePinChangeDialog` interactions already in `StaffDashboard`.

</specifics>

<deferred>
## Deferred Ideas

None raised — discussion stayed within the five bundled SALE-02/04/05/06/OPS-01 items already scoped by ROADMAP.md.

### Reviewed Todos (not folded)
None — `todo.match-phase 08` was not run with matches to review during this session; STATE.md's "Pending Todos" section is empty ("None yet").

</deferred>

---

*Phase: 08-sale-payment-workflow-wiring-cleanup*
*Context gathered: 2026-08-17*
