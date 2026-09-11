---
phase: 33-login-screen-store-branding
plan: 01
subsystem: auth
tags: [zod, supabase, rls, i18n, react, playwright]

# Dependency graph
requires: []
provides:
  - "GeneralSettingsSchema.storeName (renamed from barName) + storeLogoPath (nullable), repo-wide rename across 30 files"
  - "settings_select_branding_anon RLS policy (anon SELECT scoped to key='general')"
  - "LoginPage desktop hero branch reading general.storeName, data-testid=login-store-name"
affects: [33-02-storage-and-logo-upload, 33-03-logo-upload-ui-and-verification]

actuals:
  tokens: 42000
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Anon-scoped RLS SELECT policy pinned to a single settings key (mirrors profiles_select_anon precedent)"
    - "Idempotent JSONB key rewrite migration guarded by `value ? 'oldKey'`"

key-files:
  created:
    - supabase/migrations/20260911000001_store_branding_settings.sql
  modified:
    - src/shared/lib/domain.ts
    - src/entities/settings/model/queries.ts
    - src/entities/payment/model/queries.ts
    - src/shared/lib/edge-function-contracts.ts
    - src/shared/lib/receipt-format.ts
    - src/shared/lib/buildStartTicketText.ts
    - src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx
    - src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx
    - src/pages/login/index.tsx
    - supabase/functions/process-payment/index.ts
    - supabase/functions/process-split-payment/index.ts
    - supabase/functions/process-direct-sale/index.ts

key-decisions:
  - "Renamed the Deno edge functions' barName variable/JSON-key (process-payment, process-split-payment, process-direct-sale) to storeName alongside the client-side ReceiptDataSchema rename — not in this plan's files_modified list, but required to keep ProcessPaymentEnvelopeSchema.safeParse() from failing on every real payment response (Rule 1 bug, see Deviations)."
  - "Task 2 (apply migration to local DB) and Task 3 (Playwright proof) could not run: this machine's Docker Desktop daemon is not reachable, so the local Supabase stack is down and the plan's own precondition for Task 2 is unmet."

requirements-completed: []

coverage:
  - id: D1
    description: "Repo-wide barName -> storeName rename (domain schema, settings/payment queries, edge-function contract, receipt/ticket formatters, GeneralSettingsTab, HardwareSettingsTab mock, i18n labels, 16 test/stories fixtures) plus storeLogoPath added to GeneralSettingsSchema"
    requirement: "STORE-01"
    verification:
      - kind: unit
        ref: "npm run typecheck"
        status: pass
      - kind: unit
        ref: "npm run lint"
        status: pass
      - kind: unit
        ref: "npm run test (1492 passed, 15 pre-existing todo)"
        status: pass
      - kind: unit
        ref: "src/shared/lib/domain.test.ts#GeneralSettingsSchema"
        status: pass
    human_judgment: false
  - id: D2
    description: "settings_select_branding_anon RLS migration (anon SELECT on settings scoped to key='general') + idempotent barName->storeName JSONB key rewrite"
    requirement: "STORE-01"
    verification:
      - kind: other
        ref: "grep counts against supabase/migrations/20260911000001_store_branding_settings.sql (see Verification section) — file authored and grep-verified; NOT applied to a live database (Task 2 blocked)"
        status: unknown
    human_judgment: true
    rationale: "Task 2's precondition (local Supabase stack up and reachable) is unmet on this machine (Docker Desktop daemon unreachable) — the migration has never actually been run against Postgres, only statically verified by grep. A human (or a later executor run once Docker is up) must run `npx supabase migration up --local` and confirm the anon-read/row-rewrite behavior for real before this deliverable can be trusted."
  - id: D3
    description: "LoginPage desktop brand-panel hero branch (configured storeName -> size-32 tile + text-3xl name; unconfigured -> unchanged size-11/t('login.brand') markup), data-testid=login-store-name on both branches"
    requirement: "STORE-02"
    verification:
      - kind: unit
        ref: "grep counts against src/pages/login/index.tsx (login-store-name x2, size-10 x1, LiveTimeDisplay x2, login.tagline x1) — see Verification section"
        status: pass
      - kind: e2e
        ref: "e2e/settings/store-branding.spec.ts — NOT YET WRITTEN (Task 3 not started, blocked behind Task 2)"
        status: unknown
    human_judgment: true
    rationale: "Component code is typechecked/linted/unit-tested but has no automated browser-level proof yet: Task 3 (the Playwright spec that is this deliverable's actual acceptance test per CLAUDE.md's automated-testing policy) never ran because it depends on Task 2's now-applied migration/RLS policy existing in a live database."

duration: ~35min (Task 1 only; Tasks 2-3 not started)
completed: 2026-09-11
status: halted
---

# Phase 33 Plan 01: Login Screen Store Branding (rename + hero wiring) Summary

**Repo-wide `barName` → `storeName` rename (30 files, incl. 3 Deno edge functions) landed and green; the login-screen hero branch reads `general.storeName`, but the settings migration was never applied and the Playwright proof was never run because this machine's Docker/local-Supabase stack is down.**

## Performance

- **Duration:** ~35 min (Task 1 only)
- **Tasks:** 1 of 3 completed
- **Files modified:** 30 (Task 1) + 1 new migration file

## Accomplishments
- `GeneralSettingsSchema.barName` (`.min(1).max(120)`) renamed to `storeName` (`.max(120).default('')`, dropping `.min(1)` so the unconfigured state is representable), plus a new nullable `storeLogoPath` field, both inside the existing `settings.value` JSONB blob for `key='general'`.
- The rename propagated through every real consumer: `entities/settings/model/queries.ts` (`DEFAULT_GENERAL`), `entities/payment/model/queries.ts` (the client-constructed receipt-data fallback), `edge-function-contracts.ts`'s `ReceiptDataSchema`, `receipt-format.ts`'s `PreChequeData`/thermal-receipt renderer, `buildStartTicketText.ts`'s `StartTicketOpts`, `GeneralSettingsTab.tsx` (field/label/id/save payload), `HardwareSettingsTab.tsx`'s preview mock, both `wAdmin.json` locales' `storeNameLabel` key, and 16 co-located `.test.ts`/`.test.tsx`/`.stories.tsx` fixtures.
- `LoginPage`'s desktop brand-panel first child now branches on `general.storeName` (read via `useSettings()`): a non-empty name renders a `size-32` hero tile (`ShoppingBasket` fallback icon — no logo yet, that's plan 02/03) plus the name at `text-3xl font-semibold`; an empty/pending name renders today's exact `size-11`/`t('login.brand')` markup, byte-identical. Both branches carry `data-testid="login-store-name"`. Mobile header and the date/clock/tagline block are untouched.
- New migration `supabase/migrations/20260911000001_store_branding_settings.sql`: an anon-scoped `SELECT` RLS policy (`settings_select_branding_anon`, `USING (key = 'general')`) so the pre-auth login screen can read the row, plus the idempotent `barName`→`storeName` JSONB key rewrite for any already-saved row.
- Added a `GeneralSettingsSchema` describe block to `src/shared/lib/domain.test.ts` covering the plan's five required behaviors (empty storeName accepted, 120-char boundary accepted, 121-char rejected, unicode round-trip, `storeLogoPath` defaults to `null` when absent).

## Task Commits

1. **Task 1: End-to-end "the login screen shows the store's real name"** - `0a9fd10` (feat)

**Task 2 (apply migration) and Task 3 (Playwright proof) did not run — see Issues Encountered.**

## Files Created/Modified
- `supabase/migrations/20260911000001_store_branding_settings.sql` - anon SELECT policy + idempotent JSONB key rewrite
- `src/shared/lib/domain.ts` - `GeneralSettingsSchema.storeName`/`storeLogoPath`
- `src/shared/lib/domain.test.ts` - new `GeneralSettingsSchema` describe block (5 cases)
- `src/entities/settings/model/queries.ts` - `DEFAULT_GENERAL.storeName`/`storeLogoPath`
- `src/entities/payment/model/queries.ts` - receipt-data fallback reads `general?.storeName`
- `src/shared/lib/edge-function-contracts.ts` - `ReceiptDataSchema.storeName`
- `src/shared/lib/edge-function-contracts.test.ts` - fixture rename
- `src/shared/lib/receipt-format.ts` / `.test.ts` - `PreChequeData.storeName`, thermal receipt renderer
- `src/shared/lib/buildStartTicketText.ts` / `.test.ts` - `StartTicketOpts.storeName`
- `src/shared/lib/email-receipt.test.ts`, `src/shared/lib/pos-printer.test.ts`, `src/shared/lib/payment-processor.test.ts`, `src/shared/lib/exporters/receipt-pdf.test.ts` - fixture renames
- `src/features/process-payment/ui/EmailReceiptDialog.test.tsx`, `ReceiptPreview.stories.tsx`, `ReceiptPreview.test.tsx`, `src/features/reprint-receipt/ui/ReprintButton.test.tsx` - fixture renames
- `src/widgets/PaymentModal/PaymentModal.stories.tsx`, `PaymentModal.test.tsx`, `ui/PaymentForm.test.tsx` - fixture renames
- `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx` - `storeName` field, `storeLogoPath` carried through hydrate/save, `settings-store-name` id/label
- `src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` - preview-mock key rename
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` - `generalSettingsTab.storeNameLabel`
- `src/pages/login/index.tsx` - hero/fallback branch, `useSettings()` read, `login-store-name` testid
- `supabase/functions/process-payment/index.ts`, `process-split-payment/index.ts`, `process-direct-sale/index.ts` - `barName` variable/JSON-key renamed to `storeName` (see Deviations)

## Decisions Made
- Kept `barAddress`/`BAR_ADDRESS`/`BAR_NAME` env var names unchanged — RESEARCH.md explicitly scopes those as out of this phase (DEP-04, a separate milestone), only the `barName` *field name* was renamed.
- Left `src/widgets/LogoImage/index.tsx` and the receipt-only `logoDataUrl`/`headerLine2` fields untouched, per D-01/D-09's explicit separation between the two logo concepts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renamed `barName` to `storeName` in the three Deno edge functions that populate `ReceiptDataSchema`**
- **Found during:** Task 1, while grounding the rename against real call sites
- **Issue:** `edge-function-contracts.ts`'s `ProcessPaymentEnvelopeSchema` (and its split/direct-sale siblings) uses `.safeParse()` on the actual HTTP response body from `supabase/functions/process-payment`, `process-split-payment`, and `process-direct-sale`. Those three Deno functions independently build their own response object with a JSON key literally named `barName` (sourced from the `BAR_NAME` env var, unrelated mechanism to `general.storeName`). Renaming `ReceiptDataSchema.barName` (required field) to `storeName` without also renaming the Deno functions' output key would have made every real payment/checkout response fail `safeParse`, and `callProcessPayment`/its siblings return `VALIDATION_ERROR: 'Unexpected response from payment service'` for every successful payment in production.
- **Fix:** Renamed the local `barName` variable and its corresponding JSON-response key to `storeName` in `process-payment/index.ts`, `process-split-payment/index.ts`, and `process-direct-sale/index.ts`. Left `BAR_NAME`/`BAR_ADDRESS` env var names and `barAddress` untouched (out of this phase's scope per RESEARCH.md).
- **Files modified:** `supabase/functions/process-payment/index.ts`, `supabase/functions/process-split-payment/index.ts`, `supabase/functions/process-direct-sale/index.ts`
- **Verification:** `npm run typecheck`/`lint`/`test` all pass (these Deno files aren't part of the Vitest/tsc project, so no direct test coverage here — verified by code inspection and cross-referencing the exact shape `ProcessPaymentEnvelopeSchema`/`ProcessPaymentSuccessSchema` require).
- **Committed in:** `0a9fd10` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Necessary to prevent the rename from breaking the live payment/checkout flow. No scope creep — same mechanical rename, just extended to the 3 files the plan's own `files_modified` list missed.

## Issues Encountered

**Task 2 (apply the migration) is blocked: Docker Desktop / the local Supabase stack is not running on this machine.**

`npx supabase status` fails with `LegacyStatusDbInspectError: ... open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`, and `docker version`/`docker ps` confirm the Docker daemon itself is unreachable. Task 2's own `<precondition>` is explicit: *"The local Supabase stack is running and reachable (`npx supabase status` reports the stack up)"*. Per the executor protocol, an unmet precondition halts the task — it is never auto-approved, even in auto mode, and the fix (starting Docker Desktop, which this sandboxed agent cannot do — it's a GUI application, and the harness explicitly blocks PowerShell/process-management commands from a worktree-isolated agent) is a human action, not something to route around.

Because Task 2 never ran, its downstream Task 3 (the Playwright proof, `e2e/settings/store-branding.spec.ts`) also never ran — it needs the anon RLS policy live in the database it targets. **`e2e/settings/store-branding.spec.ts` does not exist yet.**

**What is proven right now:** the rename compiles, lints clean, and all 1492 existing unit tests (plus 5 new `GeneralSettingsSchema` cases) pass. The migration file's SQL is authored and its shape was verified with the plan's exact `grep` acceptance criteria (see below) — but it has never actually executed against a Postgres instance, so the anon-read policy and the JSONB key rewrite are unverified at runtime.

### Migration grep verification (static only, not run against a live DB)
```
settings_select_branding_anon: 2 (DROP + CREATE)
TO anon: 1
key = 'general': 3
jsonb_build_object('storeName': 1
ALTER TABLE count: 0
```

## User Setup Required

**Start Docker Desktop, then resume this plan from Task 2.** Once `npx supabase status` reports the stack up:
1. `npx supabase migration up --local` (applies `20260911000001_store_branding_settings.sql`).
2. Confirm the `general` settings row's JSONB `value` has a `storeName` key and no `barName` key (service-role read).
3. Confirm an anon-key client can read `settings` filtered to `key='general'` (1 row) but not `key='billing'` (0 rows).
4. Proceed to Task 3: write and run `e2e/settings/store-branding.spec.ts` per the plan's exact spec (configured/unconfigured/unicode cases, `test.describe.serial`, the policy-drop probe in `<verify>`).

## Next Phase Readiness

- **Not ready for plan 33-02/33-03.** Both depend on `storeLogoPath` and the `store-branding` bucket; `storeLogoPath` is already in `domain.ts`/`GeneralSettingsTab.tsx` (this plan), but the settings-table RLS/migration this plan introduces has not been proven live, and STORE-02's actual acceptance test (Playwright) has not been written or run — CLAUDE.md's testing policy treats an unrun `<verify>` as an open item, not a pass.
- This plan's code changes are safe to build on top of once Docker/local Supabase is available — no architectural risk was found, only an environment-availability blocker.

---
*Phase: 33-login-screen-store-branding*
*Completed: 2026-09-11 (partial — halted before Task 2)*
