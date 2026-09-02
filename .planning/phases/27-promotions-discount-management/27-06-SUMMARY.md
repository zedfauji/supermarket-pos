---
phase: 27-promotions-discount-management
plan: 06
subsystem: pos-checkout
tags: [zustand, tanstack-query, offline, promotions, react, zod]

requires:
  - phase: 27-promotions-discount-management
    provides: "evaluateBestPromotion (Plan 01) and CheckoutPanel/cartStore live promotion-price wiring (Plan 03)"
provides:
  - "Cart-line promotion snapshot (promotionId, discountSnapshotAt) captured at add-to-cart time regardless of online/offline"
  - "Reconnect conflict detection: on offline->online transition, every promotion-sourced cart line is re-evaluated against freshly-refetched promotions/near-expiry data"
  - "priceConflict flag + blocking cashier-review UX (Process Payment disabled until the flagged line is tapped and resolved)"
affects: [checkout, promotions, offline-resilience]

actuals:
  tokens: 8215
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Local per-component offline->online transition effect (wasOnlineRef/transitionedOnline), mirroring OfflineQueueProcessor's pattern without touching the tab-offline-queue machinery"
    - "Cart-line freshness snapshot (promotionId + discountSnapshotAt) stamped only when a price override is actually supplied, never manufactured for a plain re-add"

key-files:
  created:
    - e2e/infra/offline-promotion-conflict.spec.ts
  modified:
    - src/shared/lib/domain.ts
    - src/entities/tab/model/cartStore.ts
    - src/entities/tab/model/cartStore.test.ts
    - src/entities/tab/ui/CartItem.tsx
    - src/entities/tab/ui/CartItem.test.tsx
    - src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx
    - src/shared/lib/i18n/locales/en-US/entities.json
    - src/shared/lib/i18n/locales/es-MX/entities.json

key-decisions:
  - "Conflict detection covers only real promotion-sourced lines (promotionId non-null) — the expiry-proximity auto-trigger (promotionId null) is intentionally NOT re-flagged on reconnect, since its config changes far less often than a promotion row's active state (specless-probe-fallback, plan's flagged assumption)."
  - "CartItem.tsx resolves its own tap-to-review price via a direct usePromotions/useSettings/evaluateBestPromotion call, matching the existing precedent (useNearExpiryAlerts) of entities/tab/ui reading cross-entity data directly rather than prop-drilling through CheckoutPanel."
  - "CheckoutPanel's reconnect effect explicitly calls promotionsQuery.refetch()/nearExpiryQuery.refetch() rather than relying solely on TanStack Query's own default refetchOnReconnect, so the comparison always uses data known-fresh as of the transition, not whatever the query cache happens to contain."

requirements-completed: [PROMO-08]

coverage:
  - id: D1
    description: "Cart line carries a promotion snapshot (promotionId, discountSnapshotAt) at add-to-cart time, independent of online/offline"
    requirement: PROMO-08
    verification:
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#addItem — promotion snapshot (PROMO-08)"
        status: pass
      - kind: e2e
        ref: "e2e/infra/offline-promotion-conflict.spec.ts#a promotion changed while offline flags the cart line on reconnect instead of silently re-pricing it"
        status: pass
    human_judgment: false
  - id: D2
    description: "On reconnect, a promotion-sourced cart line whose promotion changed or vanished is flagged (priceConflict), never silently re-priced or silently trusted"
    requirement: PROMO-08
    verification:
      - kind: unit
        ref: "src/entities/tab/model/cartStore.test.ts#flagPriceConflict / resolveConflict (PROMO-08)"
        status: pass
      - kind: e2e
        ref: "e2e/infra/offline-promotion-conflict.spec.ts#a promotion changed while offline flags the cart line on reconnect instead of silently re-pricing it"
        status: pass
    human_judgment: false
  - id: D3
    description: "A flagged line blocks Process Payment until the cashier taps the indicator to accept the fresh price"
    requirement: PROMO-08
    verification:
      - kind: unit
        ref: "src/entities/tab/ui/CartItem.test.tsx#shows a price-conflict indicator when item.priceConflict is true, and resolves it on tap"
        status: pass
      - kind: e2e
        ref: "e2e/infra/offline-promotion-conflict.spec.ts#a promotion changed while offline flags the cart line on reconnect instead of silently re-pricing it"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-09-02
status: complete
---

# Phase 27 Plan 06: Offline Promotion Conflict Detection (PROMO-08) Summary

**A promotion-discounted cart line survives an offline/online round trip without ever being silently re-priced: it's stamped with a promotion snapshot at add time, re-checked against fresh data on reconnect, and blocks checkout behind an explicit cashier review if the underlying promotion changed or disappeared.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-02
- **Tasks:** 2/2 completed
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- `CartItemSchema` gained `promotionId`/`discountSnapshotAt`/`priceConflict` (all optional — no persisted-cart migration needed); `cartStore.addItem`/`addWeightedItem` stamp the snapshot only when a real price override is supplied, and two new actions (`resolveConflict`, `flagPriceConflict`) drive the conflict lifecycle.
- `CheckoutPanel` runs a headless offline->online transition effect that refetches promotions/near-expiry data and re-evaluates every promotion-sourced cart line via `evaluateBestPromotion`, flagging any line whose result changed or vanished.
- `CartItem` renders a destructive-variant tap-to-review indicator (distinct from the amber near-expiry badge) that recomputes the fresh price at tap time and clears the flag; Process Payment stays disabled while any line is flagged.
- E2E spec proves the full loop against a real checkout: cached-data display while offline, server-side promotion change simulating "changed elsewhere while offline," conflict flag + blocked checkout on reconnect, tap-to-resolve, and the sale completing at the fresh (not stale) price.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cart-line promotion snapshot + reconnect conflict detection** - `022baeb` (feat)
2. **Task 2: E2E proof of PROMO-08** - `0434933` (test)

_Task 1 is `type="tracer"` per the plan; its own `<verify>` (typecheck + the two unit test files) was re-run and passed before Task 2, satisfying the tracer feedback gate (workflow.human_verify_mode is `end-of-phase` with an automated-only verify block, so no checkpoint was needed)._

## Files Created/Modified

- `src/shared/lib/domain.ts` - `CartItemSchema` extended with `promotionId`, `discountSnapshotAt`, `priceConflict` (all `.optional()`, no default — `exactOptionalPropertyTypes` requires this to keep existing literal `CartItem` constructions compiling)
- `src/entities/tab/model/cartStore.ts` - `addItem`/`addWeightedItem` take an optional 4th `promotionId` arg and stamp the snapshot; new `resolveConflict`/`flagPriceConflict` actions
- `src/entities/tab/model/cartStore.test.ts` - snapshot-stamping and conflict-lifecycle unit coverage
- `src/entities/tab/ui/CartItem.tsx` - `priceConflict` indicator (destructive `POSButton`, `AlertTriangle` icon) with tap-to-resolve, reading `usePromotions`/`useSettings` directly (matches existing `useNearExpiryAlerts` cross-entity precedent in this file)
- `src/entities/tab/ui/CartItem.test.tsx` - indicator-renders-and-resolves-on-tap test
- `src/widgets/CheckoutPanel/ui/CheckoutPanel.tsx` - reconnect-detection effect, `resolvePromotionMatch` (renamed from `resolveUnitPrice`) now threads `promotionId` through every add-to-cart call site, Process Payment disabled on `hasPriceConflict`
- `src/shared/lib/i18n/locales/{en-US,es-MX}/entities.json` - `cartItem.priceConflict` key
- `e2e/infra/offline-promotion-conflict.spec.ts` - new PROMO-08 E2E proof (created)

## Decisions Made

See `key-decisions` in frontmatter. No decisions required a plan deviation.

## Deviations from Plan

None - plan executed exactly as written. `resolveUnitPrice` was renamed to `resolvePromotionMatch` (returns the full `PromotionMatch` instead of just a number) to thread `promotionId` through the same call sites already responsible for the unit-price override — this is the plan's own instruction ("stored alongside the existing unitPrice override"), not a new scope item.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

PROMO-08 is closed. Wave 3 (this plan, and 27-05 before it) is complete; only Wave 4 (27-07, E2E scenario matrix + phase-gate) remains for Phase 27. No blockers carried forward — the plan's own flagged assumption (expiry-trigger lines are not re-flagged on reconnect) is documented as intentional scope, not a gap, and left for the store to revisit only if it proves insufficient in practice.

---
*Phase: 27-promotions-discount-management*
*Completed: 2026-09-02*

## Self-Check: PASSED

All created/modified files and both task commit hashes (`022baeb`, `0434933`) verified present.
