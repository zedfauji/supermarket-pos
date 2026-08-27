---
phase: 10-quality-debt-ops-documentation
reviewed: 2026-08-19T02:32:02Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - .storybook/main.ts
  - .storybook/preview.ts
  - docs/database-backup-and-disaster-recovery.md
  - e2e/38-audit-logs.spec.ts
  - e2e/47-edit-paid-tab.spec.ts
  - e2e/57-suppliers-loading-error.spec.ts
  - e2e/58-entity-id-crosslink.spec.ts
  - scripts/backup-db.sh
  - src/features/checkout-sale/model/useCheckoutSale.test.ts
  - src/shared/lib/i18n/locales/en-US/common.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/en-US/wPanels.json
  - src/shared/lib/i18n/locales/es-MX/common.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/wPanels.json
  - src/shared/ui/ConfirmDialog.stories.tsx
  - src/shared/ui/DataTable.stories.tsx
  - src/shared/ui/EmptyState.stories.tsx
  - src/shared/ui/EntityIdCell.test.tsx
  - src/shared/ui/EntityIdCell.tsx
  - src/shared/ui/MoneyDisplay.stories.tsx
  - src/shared/ui/MoneyInput.stories.tsx
  - src/shared/ui/POSButton.stories.tsx
  - src/widgets/AuditLogTable/AuditLogTable.test.tsx
  - src/widgets/AuditLogTable/AuditLogTable.tsx
  - src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx
  - src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.test.tsx
  - src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx
  - src/widgets/EditHistoryTable/EditHistoryTable.tsx
  - src/widgets/PaymentPane/ui/PaymentPane.test.tsx
  - src/widgets/PaymentPane/ui/PaymentPane.tsx
  - src/widgets/StaffDashboard/StaffDashboard.test.tsx
  - src/widgets/StaffDashboard/StaffDashboard.tsx
  - src/widgets/SupplierListPanel.tsx
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
status: clean
resolution: |
  All 6 blocking findings (CR-01, WR-01..WR-05) fixed and verified in commit 33aa16d:
  - CR-01: added backups/ to .gitignore
  - WR-01: 44px touch target (min-h-11 min-w-11) on EntityIdCell copy button
  - WR-02: guard `'clipboard' in navigator` before calling navigator.clipboard.writeText
  - WR-03: encodeURIComponent on entityId in /payments?id= and /staff?id= routes
  - WR-04: PaymentPane now re-seeds the ?id= filter on param change via render-phase
    state adjustment (not an effect, to avoid the cascading-render lint rule)
  - WR-05: gitignore .storybook/* with explicit !main.ts/!preview.ts negations
  IN-01 (missing request-shape assertion in useCheckoutSale.test.ts) left as-is —
  informational, non-blocking, doesn't affect QA-04's pass/fail coverage.
  Re-verified: npm run typecheck, npm run lint, npm run test (1148 passed),
  npx playwright test e2e/57-suppliers-loading-error.spec.ts e2e/58-entity-id-crosslink.spec.ts (4 passed).
---

# Phase 10: Code Review Report

**Reviewed:** 2026-08-19T02:32:02Z
**Depth:** standard
**Files Reviewed:** 32 (+ `e2e/helpers/supabase.ts` inspected for context per the review's own focus areas, not counted in the 32)
**Status:** clean (all blocking findings fixed — see `resolution` in frontmatter)

## Summary

Reviewed all five quality-debt/ops items (QA-01..04, OPS-02). The mechanical pieces (Storybook stories, i18n catalogs, the `useCheckoutSale` unit test, the Suppliers loading/error wiring, the `seedClosedTab` idempotency-key fix) are sound — i18n JSON is valid and key-parallel across both locales with no leftover placeholder text, `EntityIdCell`'s `LINKABLE_TYPES` allowlist is an exact `Set` with no fuzzy matching and no XSS surface (IDs are DB-sourced, never reflected unsanitized from the `?id=` query string into HTML), and `scripts/backup-db.sh` is a properly fail-fast (`set -euo pipefail`), injection-safe wrapper around `pg_dump` with no hardcoded credentials.

The issues found cluster around two things the executors' own deviation notes under-verified: (1) the new `backups/` output directory this phase introduces has no corresponding `.gitignore` entry, creating a real path to committing full-database dumps (staff PINs, payments, audit logs) into git history; and (2) the two new `useSearchParams`-driven UI surfaces (`EntityIdCell`'s copy button, `PaymentPane`'s ID filter) each have a small but genuine correctness/accessibility gap relative to the phase's own UI-SPEC and to the sibling `StaffDashboard` implementation, which got the equivalent logic right.

## Critical Issues

### CR-01: `backups/` (created by the new backup script) is not gitignored — real path to committing full DB dumps

**File:** `.gitignore` (repo root of `supermarket-pos/`, no `backups/` entry anywhere in the file); produced by `scripts/backup-db.sh:14`
**Issue:** OPS-02 adds `scripts/backup-db.sh`, which creates `backups/` at the repo root and writes timestamped `pg_dump --format=custom` dumps into it (`backups/backup-<timestamp>.dump`). A `pg_dump` of this schema contains `profiles` (staff PINs), `payments`, `orders`, `audit_logs`, `suppliers` — i.e. exactly the sensitive data the RLS/RBAC layers in the rest of this codebase are built to protect. Nothing in `.gitignore` excludes `backups/`, so a developer who runs the script locally and then does a broad `git add` (`git add -A`, `git add .`, an IDE "stage all") will silently stage a raw database dump for commit. Once committed, purging binary PII from git history requires a history rewrite — this is a data-exposure risk, not just a style nit, and it is a direct, easily-fixed omission introduced by this phase's own new script.
**Fix:**
```gitignore
# scripts/backup-db.sh output — full DB dumps (PII: staff PINs, payments, audit logs), never commit
backups/
```
Add this alongside the other "Test / CI outputs" / credential-adjacent entries in `.gitignore`.

## Warnings

### WR-01: Copy-ID button's hit target is 32×32px, not the UI-SPEC's mandated 44px minimum

**File:** `src/shared/ui/EntityIdCell.tsx:79-88`
**Issue:** 10-UI-SPEC.md (Spacing Scale section) explicitly requires: "the copy-icon button uses the project's existing 44px minimum touch target (`touchSize` convention already established for `Button`/`POSButton`) ... the hit target, not the visible box, must meet 44px." `EntityIdCell.tsx` imports the base `Button` from `./button` (not `POSButton`) and renders it with `size="icon"` and no `touchSize` prop. `size="icon"` resolves to `size-8` (32×32px) in `buttonVariants` (`src/shared/ui/button.tsx`), and the base `Button` component doesn't even accept a `touchSize` prop — that convention lives only on `POSButton` (`src/shared/ui/POSButton.tsx`), which this file doesn't use. The copy button's actual clickable area is therefore 32×32px, well under the 44px accessibility floor this same phase's spec commits to.
**Fix:** Either switch to `POSButton` with `touchSize="default"`, or wrap the icon button in an explicit `min-h-11 min-w-11` (44px) hit-target class:
```tsx
<Button
  type="button"
  variant="ghost"
  size="icon"
  className="min-h-11 min-w-11"
  aria-label={t('common:copyId')}
  data-testid="copy-entity-id-button"
  onClick={handleCopy}
>
```

### WR-02: Unguarded `navigator.clipboard` access can throw synchronously, bypassing the error-toast path entirely

**File:** `src/shared/ui/EntityIdCell.tsx:56-69`
**Issue:** `handleCopy` calls `navigator.clipboard.writeText(entityId).then(...).catch(...)`. This correctly handles a *rejected* clipboard promise (permission denied) — covered by the "shows an error toast ... when clipboard write rejects" test. But if `navigator.clipboard` itself is `undefined` (insecure/non-HTTPS context, or a webview/browser build without the Clipboard API — a real possibility across the Windows WebView2 / Ubuntu webkit2gtk split this app explicitly supports per CLAUDE.md), then `navigator.clipboard.writeText` throws a synchronous `TypeError` *before* any promise exists, so `.catch()` never runs. The click silently fails: no toast, error only in devtools console — precisely the "silent no-op" failure mode 10-UI-SPEC.md's backstop clause for this exact scenario says must NOT happen ("verify ... that a rejected `navigator.clipboard.writeText` triggers the error toast, not a silent no-op"). The existing test suite only covers the rejected-promise case, not the clipboard-API-absent case.
**Fix:**
```tsx
const handleCopy = () => {
  if (!navigator.clipboard) {
    toast.error(t('common:copyIdFailed'));
    return;
  }
  navigator.clipboard
    .writeText(entityId)
    .then(() => { ... })
    .catch(() => { toast.error(t('common:copyIdFailed')); });
};
```

### WR-03: Entity ID is interpolated into the route/query string without `encodeURIComponent`

**File:** `src/shared/ui/EntityIdCell.tsx:39`
**Issue:** `const route = isStaff ? `/staff?id=${entityId}` : `/payments?id=${entityId}`;` builds the link target via raw template interpolation. Today `entityId` values are DB-generated UUIDs, so this happens to be safe, but nothing in `EntityIdCellProps` (`entityType: string; entityId: string | undefined`) constrains the value to a UUID shape — any future caller passing a non-UUID identifier (or any value containing `&`, `#`, `%`, `?`, or whitespace) would silently produce a malformed URL/query param (e.g. truncating at an embedded `&`, or corrupting sibling query params). This is exactly the kind of defensive gap the review's "no unbounded/undefensive query-param handling" focus calls out.
**Fix:**
```tsx
const route = isStaff ? `/staff?id=${encodeURIComponent(entityId)}` : `/payments?id=${encodeURIComponent(entityId)}`;
```

### WR-04: `PaymentPane`'s ID filter is seeded from the URL only once — doesn't react to `?id=` changing while mounted (unlike `StaffDashboard`'s equivalent)

**File:** `src/widgets/PaymentPane/ui/PaymentPane.tsx:141-142`
**Issue:**
```ts
const [searchParams] = useSearchParams();
const [filterValue, setFilterValue] = useState(() => (searchParams.get('id') ?? '').trim());
```
`filterValue` is derived from `searchParams` only inside the `useState` lazy initializer, which runs exactly once per mount. If the `id` query param changes while `PaymentHistoryList` stays mounted — e.g. the user edits `/payments?id=A` to `/payments?id=B` directly in the URL bar, or navigates browser back/forward between two `/payments?id=...` history entries without leaving the `/payments` route — the filter box and the displayed row set silently keep showing the *original* id's results. Contrast with `StaffDashboard.tsx:40` (`const targetStaffId = searchParams.get('id');`), which correctly re-reads `searchParams` on every render and stays reactive. This is a direct inconsistency between the two `useSearchParams` consumers this phase adds, and the one that's wrong is the one covered by "correctness" in this review's focus areas. Existing tests (`e2e/58-entity-id-crosslink.spec.ts`, `PaymentPane.test.tsx`'s "seeds the ID filter" test) only exercise a fresh mount with the id already in `initialEntries`/first navigation, so this gap isn't caught by current coverage.
**Fix:** Either drop the local state and derive `filterValue` directly from `searchParams.get('id')` each render (mirroring `StaffDashboard`), or add a `useEffect` that re-syncs on `searchParams` change:
```ts
const [filterValue, setFilterValue] = useState(() => (searchParams.get('id') ?? '').trim());
useEffect(() => {
  setFilterValue((searchParams.get('id') ?? '').trim());
}, [searchParams]);
```

### WR-05: `.storybook/` files are tracked via manual force-add with no matching `.gitignore` exception (unlike the parallel `docs/` fix in the same phase)

**File:** `.gitignore` (`.storybook/` entry under "AI / IDE tool configs", no negation added); introduced by commit `c7e32fd` (feat(10-02))
**Issue:** The root `.gitignore` still globally ignores `.storybook/`. `.storybook/main.ts` and `.storybook/preview.ts` are nonetheless tracked in git (confirmed via `git ls-files`), which only happens because they were added with `git add -f` at commit time — the commit that introduced them touched no `.gitignore` line. Compare with the same phase's OPS-02 doc commit (`760cb35`), which fixed the equivalent problem for `docs/database-backup-and-disaster-recovery.md` correctly: it changed the blanket `docs/` directory-ignore to `docs/*` (a per-entry ignore, which negation patterns can actually apply to — Git can't un-ignore a file inside a directory-level ignore) and added an explicit `!docs/database-backup-and-disaster-recovery.md` exception. `.storybook/` got no equivalent treatment. Practically: any future file added under `.storybook/` (a `manager.ts`, a decorators file, a new addon's config) will be silently swallowed by `git status`/`git add .` and require another manual force-add, which is easy to forget and will look like the file was never created.
**Fix:** Mirror the `docs/` fix — narrow the ignore and add explicit exceptions:
```gitignore
.storybook/*
!.storybook/main.ts
!.storybook/preview.ts
```

## Info

### IN-01: `useCheckoutSale.test.ts` success-path tests never assert the outgoing request shape

**File:** `src/features/checkout-sale/model/useCheckoutSale.test.ts:150-208`
**Issue:** The `processCashPayment`/`processCardPayment`/`processSplitPayment` success tests all assert only the *mapped return value* from a hardcoded `mockCallProcessDirectSale.mockResolvedValue(...)`; none of them assert `mockCallProcessDirectSale` was called with the expected request payload (tab id, amounts, tender/method, staff/caja ids). A regression that silently drops or mis-maps a field going *into* the edge-function call (e.g. wrong `tabId`, missing `cajaSessionId`) would not be caught by this suite, only a regression in the *response* mapping would be.
**Fix:** Add an assertion per test, e.g.:
```ts
expect(mockCallProcessDirectSale).toHaveBeenCalledWith(
  expect.objectContaining({ tabId: 'tab-1', amountTendered: 10, changeDue: 0 })
);
```

---

_Reviewed: 2026-08-19T02:32:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
