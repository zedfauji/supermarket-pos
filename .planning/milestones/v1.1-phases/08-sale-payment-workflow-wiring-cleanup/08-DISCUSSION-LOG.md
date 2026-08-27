# Phase 8: Sale/payment workflow wiring + cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-17
**Phase:** 08-sale-payment-workflow-wiring-cleanup
**Areas discussed:** Staff-creation UI, Offline-checkout guard scope, Error-message translation strategy, Refund payload Zod validation depth

---

## Staff-creation UI

| Option | Description | Selected |
|--------|-------------|----------|
| Button on StaffDashboard | New POSButton opens a dialog, matches existing EditRoleDialog/EditLocaleDialog/ClockInModal pattern | ✓ |
| New page/route | Separate /staff/new route | |

**User's choice:** Button on StaffDashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Name, PIN, Role | Matches create-staff edge function's current accepted fields exactly | |
| Name, PIN, Role, Locale | Also sets profiles.locale at creation, extends edge function's insert | ✓ |

**User's choice:** Name, PIN, Role, Locale

| Option | Description | Selected |
|--------|-------------|----------|
| Enter once + confirm field | Standard PIN + Confirm PIN, client-validates match before submit | ✓ |
| Enter once, no confirmation | Simpler form, but a typo means the account is unusable until reset | |

**User's choice:** Enter once + confirm field

| Option | Description | Selected |
|--------|-------------|----------|
| Force PIN change on first login | Reuse existing force-pin-change feature | ✓ |
| PIN is permanent as entered | Simpler, but admin knows every staff member's permanent PIN | |

**User's choice:** Force PIN change on first login

**Notes:** No further questions — moved directly to next area.

---

## Offline-checkout guard scope

| Option | Description | Selected |
|--------|-------------|----------|
| Direct-sale checkout only | Guard useCheckoutSale.submit() only — the only checkout path with a UI today | ✓ |
| Direct-sale + legacy process-payment/split-payment | Also guard callProcessPayment/callProcessSplitPayment preemptively for Phase 9 | |

**User's choice:** Direct-sale checkout only

| Option | Description | Selected |
|--------|-------------|----------|
| In useCheckoutSale.submit() | Same layer as existing isOnline() checks in queries.ts/useRemoveTabItem.ts | ✓ |
| Inside callProcessDirectSale itself | Push into edge-function-contracts.ts for all callers | |

**User's choice:** In useCheckoutSale.submit()

| Option | Description | Selected |
|--------|-------------|----------|
| Same toast/error path as other checkout failures | Reuse networkOfflineError(), no new UI component | |
| Dedicated offline modal/banner | Distinct blocking modal separate from the toast error path | ✓ |

**User's choice:** Dedicated offline modal/banner

**Follow-up:** Asked whether to reuse/extend the existing `OfflineBanner` component or build a separate dialog, since a banner already exists for the offline mutation queue.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate blocking dialog on checkout attempt | ConfirmDialog-style modal, distinct from the passive ambient banner | ✓ |
| Extend OfflineBanner with a checkout-specific variant | Reuses one component but couples two different UX purposes | |

**User's choice:** Separate blocking dialog on checkout attempt

**Notes:** User confirmed the offline-blocked message should be visually and structurally distinct from both the existing ambient `OfflineBanner` and the generic toast-error path.

---

## Error-message translation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Generic translated fallback message | Single translated "something went wrong" string for SUPABASE_ERROR/UNKNOWN_ERROR, raw error.message never shown; full detail still logged | ✓ |
| Per-error-code translated messages | Enumerate every known Postgres error code with its own message — open-ended scope | |

**User's choice:** Generic translated fallback message

| Option | Description | Selected (multiSelect) |
|--------|-------------|----------|
| checkout-sale's UNKNOWN_ERROR fallbacks | Audit existing i18n messages for completeness | ✓ |
| callProcessDirectSale/callProcessPayment edge-error mapping | Audit edge-function-contracts.ts for raw pass-through | ✓ |
| Any other raw error.message in featOrders/wPanels showing in a toast | Full grep sweep beyond the two known spots | ✓ |

**User's choice:** All three — full sweep scope, not limited to RefundSheet's known leak.

**Notes:** No further questions — moved directly to next area.

---

## Refund payload Zod validation depth

| Option | Description | Selected |
|--------|-------------|----------|
| Shape + basic business rules | z.array with uuid/positive-int/positive-number/boolean fields, non-empty array, RefundReason enum | ✓ |
| Shape only, no business rules | Just type-check structure, rely entirely on RPC for qty/amount checks | |

**User's choice:** Shape + basic business rules

| Option | Description | Selected |
|--------|-------------|----------|
| src/entities/refund/model/types.ts | Scoped to the refund entity, matches where ProcessRefundInput is entity-adjacent | ✓ |
| src/shared/lib/domain.ts | Central with every other Zod schema | |

**User's choice:** src/entities/refund/model/types.ts

**Notes:** This file currently states "Never define types here — infer from Zod schemas [in domain.ts]" and only re-exports from domain.ts. Flagged as a soft conflict for the planner in CONTEXT.md (D-13) — recommended resolution is to define the schema in domain.ts per convention and re-export the type via this file, satisfying both the user's stated location preference and the codebase's single-source-of-truth rule.

| Option | Description | Selected |
|--------|-------------|----------|
| Return a VALIDATION_ERROR Result before the RPC call | safeParse in mutationFn, same Result<T>/err() pattern as every other mutation hook | ✓ |
| Throw and let an error boundary catch it | .parse() instead — inconsistent with codebase convention | |

**User's choice:** Return a VALIDATION_ERROR Result before the RPC call

**Notes:** User confirmed ready for context after this — no additional gray areas explored.

---

## Claude's Discretion

- Exact wording of the generic fallback error message and the offline-blocking dialog's copy — must go through i18n, no hardcoded literals.
- Whether the offline-blocking dialog is a new component or a thin wrapper around `ConfirmDialog` — favor less new code.
- Whether `create-staff`'s stale `${staffId}@barpos.local` synthetic email domain gets touched — out of scope unless it blocks something at plan time.
- Whether the new `ProcessRefundInput` Zod schema is defined directly in `domain.ts` (recommended) or in `entities/refund/model/types.ts` per the user's literal answer — see refund-schema-location note above.

## Deferred Ideas

None — discussion stayed within the five items ROADMAP.md already scoped for this phase (SALE-02, SALE-04, SALE-05, SALE-06, OPS-01).
