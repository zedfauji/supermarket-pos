# Phase 10: Quality debt & ops documentation - Pattern Map

**Mapped:** 2026-08-18
**Files analyzed:** 17 (5 new-mechanical, 1 new-shared-component, 6 new stories, 2 new config, 1 new test, 2 new ops artifacts)
**Analogs found:** 15 / 17 (2 have no analog — `.storybook/` config, OPS-02 doc/script are net-new categories)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/widgets/SupplierListPanel.tsx` | component (widget) | request-response (query loading/error) | `src/widgets/InventoryPagePanel.tsx` | exact (same `resultError`/`isLoading` convention) |
| `src/shared/ui/EntityIdCell.tsx` | component (shared primitive) | transform (render cell from entityType/entityId) | `src/shared/ui/LoadingSkeletons.tsx` (shared/ui primitive shape) + `ProtectedAction.tsx` (local `TooltipProvider` pattern) | role-match, no direct prior "ID cell" analog |
| `src/widgets/AuditLogTable/AuditLogTable.tsx` | component (widget, table) | CRUD (read-only table + column def) | itself (existing `ColumnDef` array to extend) | exact — edit in place |
| `src/widgets/EditHistoryTable/EditHistoryTable.tsx` | component (widget, table) | CRUD (read-only table + column def) | itself (existing `ticket` column at ~line 100) | exact — edit in place |
| `src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx` | component (widget, table) | CRUD (read-only) | `AuditLogTable.tsx` (`ColumnDef` shape) | role-match |
| `src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx` | component (widget, table) | CRUD (read-only) | `AuditLogTable.tsx` (`ColumnDef` shape) | role-match |
| `src/widgets/PaymentPane/ui/PaymentPane.tsx` | component (widget) | request-response (client-side filter + query-param seed) | `src/shared/ui/SearchInput.tsx` (controlled filter input to reuse) | role-match — first `useSearchParams` usage in repo |
| `src/widgets/StaffDashboard/StaffDashboard.tsx` | component (widget) | request-response (scroll+highlight via query-param) | `src/shared/ui/DataTable.tsx` (`getRowClassName` prop, already exists) | role-match — first `useSearchParams` usage in repo |
| `src/shared/ui/EmptyState.stories.tsx` | test (Storybook story) | transform (props → rendered story) | `src/shared/ui/Button.stories.tsx` | exact |
| `src/shared/ui/ConfirmDialog.stories.tsx` | test (Storybook story) | transform | `src/shared/ui/Button.stories.tsx` | exact |
| `src/shared/ui/POSButton.stories.tsx` | test (Storybook story) | transform | `src/shared/ui/Button.stories.tsx` | exact |
| `src/shared/ui/DataTable.stories.tsx` | test (Storybook story) | transform | `src/shared/ui/Button.stories.tsx` | exact |
| `src/shared/ui/MoneyDisplay.stories.tsx` | test (Storybook story) | transform | `src/shared/ui/Button.stories.tsx` | exact |
| `src/shared/ui/MoneyInput.stories.tsx` | test (Storybook story) | transform | `src/shared/ui/Button.stories.tsx` | exact |
| `.storybook/main.ts` / `.storybook/preview.ts` | config | — | none (repo gap, hand-author per installed addon versions) | no analog |
| `src/features/checkout-sale/model/useCheckoutSale.test.ts` | test (Vitest unit) | event-driven (mutation hook, mocked stores + edge fn) | `src/features/process-refund/model/useProcessRefund.test.ts` + `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts` | exact (mocking shape) |
| `docs/database-backup-and-disaster-recovery.md` | config/doc | — | none (first ops doc of this kind) | no analog |
| `scripts/backup-db.sh` | utility (shell script) | file-I/O (pg_dump) | `scripts/setup-ubuntu.sh` (header/guard style) | role-match |

## Pattern Assignments

### `src/widgets/SupplierListPanel.tsx` (component, request-response)

**Analog:** `src/widgets/InventoryPagePanel.tsx` (~line 223) and `src/entities/supplier/model/queries.ts` (query already returns the needed shape).

**Query shape already exposed** (`src/entities/supplier/model/queries.ts:73-79`):
```ts
const result = query.data;
return {
  ...query,
  data: result?.ok ? result.data : undefined,
  resultError: result && !result.ok ? result.error : undefined,
  isEmpty: query.isSuccess && !!result?.ok && result.data.length === 0,
};
```

**Error pattern to copy verbatim** (`src/widgets/InventoryPagePanel.tsx:223-227`):
```tsx
{resultError ? (
  <p className="text-sm text-destructive" role="alert">
    {resultError.message}
  </p>
) : null}
```

**Loading pattern** — `TableRowSkeleton` (`src/shared/ui/LoadingSkeletons.tsx:67-80`):
```tsx
export function TableRowSkeleton({ columns = 4, className }: TableRowSkeletonProps) { /* ... */ }
```
Usage (2 columns matches the current supplier row shape — name + action buttons):
```tsx
if (isLoading) {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRowSkeleton key={i} columns={2} />
      ))}
    </div>
  );
}
```

**Current destructure to change** (`SupplierListPanel.tsx:21`): `const { data: suppliers } = useSuppliers();` → add `isLoading, resultError`. Purely additive wiring, no new component, no query change.

---

### `src/shared/ui/EntityIdCell.tsx` (new shared component, transform)

**No direct analog** for an "entity ID cell" — this is genuinely new. Compose from two existing patterns:

**Tooltip must be locally wrapped** — no app-root `TooltipProvider` exists. Pattern from `src/widgets/ProtectedAction.tsx:46-53` (local `TooltipProvider` wrapping a single trigger/content pair) — replicate exactly around the new cell rather than assuming a global provider.

**Copy-to-clipboard:** native `navigator.clipboard.writeText()`, no library — wrap the call in the project's `Result<T>` convention (`src/shared/lib/result.ts`) rather than a bare try/catch-and-ignore.

**Link target rule (D-02, exact-string match, not fuzzy):**
```ts
const LINKABLE_TYPES = new Set(['payment', 'tab', 'staff']); // exact literals only — see Pitfall 2
```
Verified literals actually written to `audit_logs.entity_type`: `'staff'` (`supabase/functions/create-staff/index.ts:134`), `'payment'` (`supabase/migrations/20260511000002_rpc_audit_wiring.sql:10-11` comment), `'tab'` (`supabase/migrations/20260703000002_wire_transfer_tab_stock_movement_audit.sql:11` comment). Non-linkable confirmed examples: `'caja_session'`, `'settings'`.

**Route targets:**
- `payment`/`tab` → `/payments?id={id}`
- `staff` → `/staff?id={id}`
- everything else → copy-only, plain mono text, no `<Link>`

**FSD constraint:** lives in `shared/ui/`, so it may only import from `shared/lib/` and other `shared/ui/` primitives plus `react-router-dom`'s `Link` — must NOT import from `entities/`/`widgets/`. Do not embed `AuditLog`/`Payment`/`Staff` domain types in its prop signature; accept plain `entityType: string`, `entityId: string | undefined` (note `exactOptionalPropertyTypes` — use `entityId: string | undefined`, not `entityId?: string`).

---

### `src/widgets/AuditLogTable/AuditLogTable.tsx` (widget, CRUD table) — add entity-ID column

**Analog:** itself — extend the existing `ColumnDef` array (imports already shown, `src/widgets/AuditLogTable/AuditLogTable.tsx:1-20`):
```tsx
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuditLogs } from '@entities/audit-log';
import type { AuditLog, AuditLogFilters } from '@entities/audit-log';
import { useStaffList } from '@entities/staff';
import { DataTable } from '@shared/ui/DataTable';
```
No entity-ID column exists today (verified) — add one using the new `EntityIdCell` inside a `ColumnDef.cell`, e.g. `cell: ({ row }) => <EntityIdCell entityType={row.original.entityType} entityId={row.original.entityId ?? undefined} />`. Preserve the existing DOM/a11y contract noted in the file's doc comment (locked by `e2e/38-audit-logs.spec.ts`) — do not remove the existing action-string `<TableCell>` or the sr-only diff trigger.

---

### `src/widgets/EditHistoryTable/EditHistoryTable.tsx` (widget, CRUD table) — extend ticket column

**Analog:** itself, `ticket` column at lines ~98-101:
```tsx
{
  id: 'ticket',
  header: t('editHistoryTable.columnTicket'),
  cell: ({ row }) => row.original.entityId?.slice(0, 8) ?? '—',
},
```
Replace the truncated `.slice(0, 8)` render with `<EntityIdCell entityType="tab" entityId={row.original.entityId ?? undefined} />` (Edit History is tab-scoped, so `entityType` is always `'tab'` here per D-04's allowlist — always linkable).

---

### `src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx` and `src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx` (widgets, CRUD tables)

**Analog:** `AuditLogTable.tsx`'s `ColumnDef` shape (same `@tanstack/react-table` `ColumnDef` pattern).

`DeletionsPreSendPanel.tsx:25-28` (verified) currently:
```ts
{
  accessorKey: 'orderId',
  header: t('deletionsPreSendPanel.columnOrderId'),
}
```
`orderId` is `order_items`-scoped (`DeletionsPreRowSchema.orderId: UuidSchema`, `src/shared/lib/domain.ts:1026-1027`) — NOT in D-02's allowlist, so this column gets `<EntityIdCell entityType="order_item" entityId={...} />` → copy-only, no link (any non-`payment/tab/staff` string works since the allowlist check is exact-match).

`DeletionsPostCloseReport.tsx`'s `tabId` column → `entityType="tab"` → real link to `/payments?id={id}` per D-03 (a closed tab is payment-history-adjacent).

---

### `src/widgets/PaymentPane/ui/PaymentPane.tsx` (widget) — ID filter (D-03)

**Analog:** `src/shared/ui/SearchInput.tsx` — already a controlled `value`/`onChange` component used elsewhere; reuse directly rather than building a new filter input.

`PaymentHistoryList` renders plain `<div>` rows (`data-testid="payment-row-${payment.id}"`, already present) — **not** `DataTable`, so add a local filter state seeded from `useSearchParams().get('id')` on mount, then `payments.filter(p => p.id.includes(filterValue.trim()))`. This is the first `useSearchParams` usage in the codebase (grep confirmed no prior usage beyond `Link`/`Navigate`/`useLocation`/`useNavigate`).

---

### `src/widgets/StaffDashboard/StaffDashboard.tsx` (widget) — scroll+highlight (D-04)

**Analog:** `src/shared/ui/DataTable.tsx`'s existing `getRowClassName` prop (already supported, unused elsewhere for this purpose) — verified `DataTable.tsx` manages `globalFilter` via internal `React.useState` with no controllable `value` prop, so do NOT attempt to prefill the search box (Pitfall 4). Instead:
```tsx
// read useSearchParams().get('id'), find matching row, pass to getRowClassName:
getRowClassName={(row) => (row.staff.id === targetId ? 'bg-accent/40' : undefined)}
```
Plus a `useEffect` + ref calling `.scrollIntoView()` for the matched row.

---

### 6× `src/shared/ui/*.stories.tsx` (test, transform)

**Analog:** `src/shared/ui/Button.stories.tsx:1-36` (verified verbatim):
```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';

const meta = {
  title: 'Shared/UI/Button',
  component: Button,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: { /* ... */ },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Button', variant: 'default' } };
```
Each new story: `title: 'Shared/UI/<ComponentName>'`, one `Default` story minimum plus variant stories matching each component's real prop surface. `EmptyState` requires `icon: LucideIcon`, `title: string`, optional `description`/`action`/`className` (verified `EmptyState.tsx` props, lines 1-25 above) — `action` needs a `{ label, onClick }` object, not a raw handler prop.

Components using `useTranslation` (MoneyDisplay, MoneyInput, EmptyState's action button, ConfirmDialog) resolve automatically once `.storybook/preview.ts` imports the i18n singleton module-scope side effect (`src/shared/lib/i18n/index.ts`), same approach as `src/shared/lib/test-setup.ts` for Vitest — no `<I18nextProvider>` wrapper needed.

**No analog for `.storybook/main.ts`/`preview.ts`** — hand-author (do not run `npx storybook init`), matching installed addon versions: `@storybook/react-vite`, `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/addon-onboarding`, `@chromatic-com/storybook` (all verified in `package.json`). `preview.ts` must import `src/app/globals.css` (Tailwind) and `src/shared/lib/i18n/index.ts`.

---

### `src/features/checkout-sale/model/useCheckoutSale.test.ts` (test, Vitest unit)

**Analog:** `src/features/process-refund/model/useProcessRefund.test.ts` (verified, lines 1-40 above) for overall test-file structure (imports, `QueryClientProvider` wrapper helper, `makeQueryClient`, Vitest globals `vi.mocked(supabase.rpc)`); `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts:11-15` for the selector-passthrough Zustand mock shape:
```ts
const mockAddItem = vi.fn();
vi.mock('@entities/tab/model/cartStore', () => ({
  useCartStore: (selector: (state: { addItem: typeof mockAddItem }) => unknown) =>
    selector({ addItem: mockAddItem }),
}));
```

`useCheckoutSale.ts` reads three stores (`src/features/checkout-sale/model/useCheckoutSale.ts:72-76`, verified):
```ts
const items = useCartStore(state => state.items);
const staff = useStaffStore(state => state.currentStaff);
const shift = useStaffStore(state => state.currentShift);
const caja = useCajaStore(state => state.currentCaja);
const isCajaOpen = useCajaStore(state => state.isCajaOpen);
```
Mock the exact module specifiers the hook imports (`@entities/staff`, `@entities/caja` barrels — NOT the underlying store files) or the mock silently fails to intercept. Also mock `@shared/lib/edge-function-contracts` (`callProcessDirectSale`) and `@shared/lib/connectivity` (`isOnline`). Full skeleton is in `10-RESEARCH.md` §"Code Examples: QA-04" — copy verbatim as the test's mock setup, then add assertions for: offline → `err(networkOfflineError())`; no open caja/staff/shift → `err({code:'CAJA_CLOSED'})`; `callProcessDirectSale` success → `ok({paymentId, ...})` from `processCashPayment`/`processCardPayment`/`processSplitPayment`; `callProcessDirectSale` failure → propagated `err`.

---

### `scripts/backup-db.sh` (utility, file-I/O)

**Analog:** `scripts/setup-ubuntu.sh` — header/guard style (`set -euo pipefail`, `cd "$(dirname "$0")/.."`, OS/dependency guard-and-exit pattern rather than silent failure).

Full skeleton (from `10-RESEARCH.md` §"Code Examples: OPS-02"):
```bash
#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the target Postgres connection string}"
cd "$(dirname "$0")/.."
mkdir -p backups
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$DATABASE_URL" --format=custom --file="backups/backup-${timestamp}.dump"
echo "Backup written to backups/backup-${timestamp}.dump"
```
Add a `command -v pg_dump` guard (matching `scripts/setup-ubuntu.sh`'s dependency-check convention) that exits with a clear error rather than a cryptic `pg_dump: command not found`.

---

### `docs/database-backup-and-disaster-recovery.md` (doc)

**No analog** — first doc of this kind in the repo. Ground it in two verified facts, not assumptions:
1. `supabase/config.toml:5-10` D-06 comment (self-hosted, no linked Cloud `project_id` — quote verbatim, do not assume Cloud is the target).
2. `supabase/functions/settings-backup/index.ts:68-86` — verified scope is 5 config-ish tables only (`settings`, `categories`, `products`, `modifiers`, `product_modifiers`), explicitly NOT `orders`/`payments`/`inventory`/`suppliers`/`shipments`/`caja_sessions`/`profiles`/`audit_logs`. State plainly that `BackupSettingsTab` is not a substitute for full-DB DR (D-10).

Structure: two clearly labeled sections (self-hosted / Supabase Cloud), per D-08 — do not pick one. Any Supabase Cloud PITR tier/day-count claim must be marked `[ASSUMED — verify against current pricing]` unless fetched live at drafting time (Assumption A3).

## Shared Patterns

### Error display (query `resultError` → `role="alert"`)
**Source:** `src/widgets/InventoryPagePanel.tsx:223-227`
**Apply to:** `SupplierListPanel.tsx` (QA-01) — the project's one established error-UI convention, verbatim reuse.

### Loading skeleton
**Source:** `src/shared/ui/LoadingSkeletons.tsx:67-80` (`TableRowSkeleton`)
**Apply to:** `SupplierListPanel.tsx` (QA-01).

### Local `TooltipProvider` wrapping
**Source:** `src/widgets/ProtectedAction.tsx:46-53`
**Apply to:** `EntityIdCell.tsx` — no app-root provider exists, every usage wraps its own.

### Zustand selector-passthrough mocking in Vitest
**Source:** `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts:11-15`
**Apply to:** `useCheckoutSale.test.ts` (QA-04), extended to 3 stores.

### Storybook story shape
**Source:** `src/shared/ui/Button.stories.tsx:1-36`
**Apply to:** all 6 new `.stories.tsx` files (QA-02).

### Shell script header/guard style
**Source:** `scripts/setup-ubuntu.sh`
**Apply to:** `scripts/backup-db.sh` (OPS-02).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.storybook/main.ts` / `.storybook/preview.ts` | config | — | Repo has never had a working Storybook config (Pitfall 1) — hand-author from installed addon versions in `package.json`, not from a codebase analog |
| `docs/database-backup-and-disaster-recovery.md` | doc | — | First DR/ops doc in this repo; ground in `supabase/config.toml` + `settings-backup` source facts instead of a prior doc |
| `src/shared/ui/EntityIdCell.tsx` | component | transform | No prior "entity ID cell" component exists; composed from two separate existing patterns (Tooltip wrapping + clipboard) rather than one direct analog |

## Metadata

**Analog search scope:** `src/shared/ui/`, `src/widgets/{InventoryPagePanel,SupplierListPanel,AuditLogTable,EditHistoryTable,DeletionsPostCloseReport,DeletionsPreSendPanel,PaymentPane,StaffDashboard,ProtectedAction}`, `src/features/{process-refund,scan-barcode-to-cart,checkout-sale}/model/`, `src/entities/supplier/model/queries.ts`, `scripts/`, `supabase/config.toml`, `supabase/functions/settings-backup/`
**Files scanned:** ~20 (all read directly this session or in the upstream research session per 10-RESEARCH.md Sources)
**Pattern extraction date:** 2026-08-18
