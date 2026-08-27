# Phase 10: Quality debt & ops documentation - Research

**Researched:** 2026-08-18
**Domain:** Mechanical UI wiring (loading/error states, entity-ID cross-linking), Storybook infra, Vitest hook testing, ops/DR documentation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**QA-03 — Entity ID cross-linking**
- **D-01:** Ship both copy-to-clipboard AND real navigation links, not copy-only. — Reversibility: reversible — UI-only, no schema/contract impact.
- **D-02:** Only `payment`/`tab` entity IDs and `staff` entity IDs get real navigation links. All other `entityType` values (settings, caja_session, product, order_item, etc.) get copy-to-clipboard only — no detail page exists for them and building one is out of scope.
- **D-03:** `payment`/`tab` IDs link to `/payments`, pre-filtered/searched to that ID. The Payments page currently has no search/filter-by-ID — this phase adds one (scoped narrowly: filter the existing payments list by ID, not a new search UI paradigm).
- **D-04:** `staff` entity IDs link to `/staff`, filtered or scrolled to that staff member. Same narrow-scope approach — reuse/extend existing list rendering, don't build a new staff detail page.
- Apply this consistently across all three surfaces that show entity IDs: Audit Log (`AuditLogTable`, no entity-ID column currently — needs one added), Edit History (`EditHistoryTable`, already truncates entityId at `.slice(0, 8)`), and Reports (confirmed by this research to be TWO widgets — `DeletionsPostCloseReport` and `DeletionsPreSendPanel` — not fully enumerated at discussion time).

**QA-01 — Suppliers page loading/error states**
- **D-05:** Reuse `TableRowSkeleton` (`src/shared/ui/LoadingSkeletons.tsx`) for the loading state — render a few skeleton rows in place of the `<ul>` supplier list while `useSuppliers()` is loading. No new skeleton component.
- **D-06:** Error state follows the exact pattern already established in `InventoryPagePanel` (`src/widgets/InventoryPagePanel.tsx` ~line 223): `resultError ? <p role="alert" className="text-sm text-destructive">{resultError.message}</p> : null`. `useSuppliers()` already exposes `isLoading`/`resultError` — `SupplierListPanel.tsx` currently only destructures `data`, so this is purely wiring, no query changes needed.

**QA-02 & QA-04 — Storybook + payment hook test**
- **D-07:** Proceed with the described mechanical approach, no changes requested:
  - 6 new `.stories.tsx` files next to their components in `src/shared/ui/`, following the conventions of existing stories (e.g. `Button.stories.tsx`).
  - `useCheckoutSale.test.ts` in `src/features/checkout-sale/model/`, mirroring `src/features/process-refund/model/useProcessRefund.test.ts`'s approach: mock the cart/staff/caja Zustand stores and `callProcessDirectSale` (from `@shared/lib/edge-function-contracts`), assert success and failure paths across cash/card/split payment processors.

**OPS-02 — DB backup/disaster-recovery doc**
- **D-08:** Production hosting (self-hosted Supabase Docker stack vs. Supabase Cloud) is genuinely undecided — do not assume either. The doc must cover BOTH scenarios rather than picking one:
  - Self-hosted: no managed PITR exists; document what's actually available today (nothing automated) and the recommended mechanism.
  - Supabase Cloud: document which project tier is needed for adequate PITR coverage, once/if that path is chosen.
- **D-09:** In addition to the doc, write a runnable pg_dump backup script (e.g. `scripts/backup-db.sh`) covering the self-hosted fallback path — ready to wire into a cron job later, not wired in yet (that's a deploy-time decision, out of scope here).
- **D-10:** This is distinct from the existing `BackupSettingsTab`/`useSettingsBackups` feature (`src/widgets/SettingsTabsPanel/tabs/BackupSettingsTab.tsx`, `supabase/functions/settings-backup`) — that feature backs up receipt/terminal *settings* only, not the full database (products, orders, inventory, etc.). Do not conflate the two; OPS-02 is about full-database DR, and the doc should explicitly note the settings-backup feature is NOT a substitute.

### Claude's Discretion
- Exact wording/structure of the OPS-02 doc (this research confirmed the actual current Supabase `config.toml` D-06 comment and the settings-backup feature's real scope, so the doc can state verified facts, not assumptions).
- Exact search/filter UI mechanism added to `/payments` and `/staff` for D-03/D-04 — this research confirmed the least-invasive shapes: a local client-side filter input for `/payments` (which has no `DataTable`), and a `useSearchParams`-driven scroll+highlight (not a search-box prefill, since `DataTable`'s search state is uncontrolled) for `/staff`.
- Where entity IDs currently appear in Reports (QA-03) — this research confirmed two locations: `DeletionsPostCloseReport.tsx` (`tabId` column) and `DeletionsPreSendPanel.tsx` (`orderId` column), both under `/reports`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No matching pending todos were surfaced by cross-reference.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|----------------------|
| QA-01 | Suppliers page shows a loading indicator during fetch and an error state on failure, instead of silently rendering blank | Pattern 1/2 (verified `resultError`/`TableRowSkeleton` reuse), Code Examples §QA-01 — exact before/after diff for `SupplierListPanel.tsx` |
| QA-02 | Storybook stories exist and render without error for EmptyState, ConfirmDialog, POSButton, DataTable, MoneyDisplay, MoneyInput | Pattern 3 (verified story shape from `Button.stories.tsx`), Pitfall 1 (Storybook config gap — Wave 0 blocker), all 6 component prop signatures verified/read this session |
| QA-03 | Audit Log, Edit History, and Reports display entity IDs as copyable and/or clickable links to the related record | Pattern 5 (query-param filter/scroll), Pitfall 2 (exact `entityType` literals), Pitfall 3 (two Reports surfaces, not one), Pitfall 4 (`DataTable` uncontrolled search), Pitfall 5 (`TooltipProvider` wrapping) |
| QA-04 | The payment mutation hook (`useCheckoutSale`) has a dedicated Vitest unit test exercising success and failure paths | Pattern 4 (verified 3-store mocking shape), Code Examples §QA-04 (test skeleton grounded in the hook's actual imports) |
| OPS-02 | A database backup/disaster-recovery plan document exists, confirming the Supabase project tier's actual PITR/backup coverage | Pitfall 6 (verified `config.toml` D-06 hosting-ambiguity quote, verified `settings-backup` scope), Code Examples §OPS-02 (script skeleton), Assumptions Log A2/A3 |
</phase_requirements>

## Summary

This phase is five independent, small quality-debt items with no new user-facing capability. Nothing here requires a new dependency, a new architectural pattern, or a new backend endpoint — every piece reuses code that already exists in the repo. The main research value in this phase is **not** "what library to use" (there is none to choose) but **exact file/line grounding** so the planner doesn't invent scope: where entity IDs actually appear in Reports (two locations, not one), what `entityType` string values are actually written to `audit_logs` (verified against migration SQL and edge-function source), and — most importantly — a genuine infrastructure gap discovered during research: **Storybook has never been initialized in this repo.** `.storybook/` is listed in `.gitignore` and does not exist on disk, yet `vitest.config.ts` and `package.json`'s `storybook`/`build-storybook` scripts assume it exists. QA-02 cannot be verified ("stories exist and render without error... verified by an automated Storybook test-runner/build check") until a Wave 0 task scaffolds `.storybook/main.ts` + `.storybook/preview.ts`.

The other four items are pure wiring: QA-01 is two lines in `SupplierListPanel.tsx` reusing an existing skeleton and an existing error pattern verbatim. QA-04 is a new Vitest file mirroring an existing test's mocking style, adjusted for `useCheckoutSale`'s three Zustand-store dependency instead of one. QA-03 touches three widgets (`AuditLogTable`, `EditHistoryTable`, plus **two** Reports widgets — `DeletionsPostCloseReport` AND `DeletionsPreSendPanel`, which CONTEXT.md's discussion had not fully enumerated) and needs a small, additive filter mechanism on `/payments` and `/staff` that this phase is the first to introduce (`useSearchParams` from the already-installed `react-router-dom`). OPS-02 is two artifacts — a markdown doc and a `pg_dump` shell script — grounded in the verified `supabase/config.toml` D-06 comment (self-hosted, no linked Cloud project) and the verified scope of the existing `settings-backup` edge function (5 tables only, none of which are transactional data).

**Primary recommendation:** Execute all five items as pure wiring/documentation with zero new dependencies; insert one Wave 0 task to scaffold missing `.storybook/` config before QA-02's story files are written, since no story can be verified without it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Suppliers loading/error UI (QA-01) | Frontend (React widget) | — | Pure client-side rendering of query state already returned by `useSuppliers()`; no backend change |
| Storybook stories (QA-02) | Build tooling / dev-only | — | Never ships in the Tauri bundle; isolated `.storybook/` + `*.stories.tsx` concern |
| Entity-ID copy/link (QA-03) | Frontend (React widgets) | Client-side routing (React Router) | Copy-to-clipboard is pure browser API; navigation links are client-side `react-router-dom` routing with a query-param filter, no new backend endpoint |
| Payment mutation hook test (QA-04) | Frontend (Vitest unit test) | — | Tests an existing client-side hook (`useCheckoutSale`) in isolation with mocked stores/edge-function call |
| DB backup/DR doc + script (OPS-02) | Database / Ops | Documentation | `pg_dump` operates directly against Postgres; the doc is a project-artifact, not app code |

## Package Legitimacy Audit

**Not applicable — no new packages are installed by this phase.** Every capability (native `navigator.clipboard`, `react-router-dom`'s `useSearchParams`, `lucide-react`'s `Copy`/`Check` icons, `@storybook/react-vite` scaffolding) is already an installed dependency; `pg_dump` is a system Postgres client tool, not an npm/pip/cargo package.

Verified installed versions (from `package.json`, read this session):
- `react-router-dom`: `^6.28.0` [VERIFIED: package.json] — `useSearchParams` has been stable public API since v6.0, no version gap.
- `storybook` / `@storybook/react-vite` / `@storybook/addon-vitest`: `^10.3.5` [VERIFIED: package.json]
- `lucide-react`: already a dependency (icon set used throughout `shared/ui`) — `Copy`/`Check` are standard icons in the installed set (same icon family already used for e.g. `ClipboardList`, `Loader2` seen in `AuditLogTable.tsx`).

## Architecture Patterns

### System Architecture Diagram

```
QA-01 (Suppliers loading/error)
  useSuppliers() [existing, returns isLoading/resultError/isEmpty]
        │
        ▼
  SupplierListPanel.tsx  ──▶  isLoading? render <TableRowSkeleton> x3-4
                          ──▶  resultError? render <p role="alert">
                          ──▶  (existing) isEmpty? render <EmptyState>
                          ──▶  else render existing <ul> list

QA-03 (Entity-ID cross-linking)
  audit_logs row { entityType: string, entityId: uuid|null }
        │
        ▼
  AuditLogTable.tsx / EditHistoryTable.tsx / DeletionsPostCloseReport.tsx / DeletionsPreSendPanel.tsx
        │  new shared cell renderer: <EntityIdCell entityType entityId />
        ├─▶ entityType ∈ {'payment','tab'} → <Link to="/payments?id={id}"> + copy button
        ├─▶ entityType === 'staff'          → <Link to="/staff?id={id}">    + copy button
        └─▶ any other entityType            → plain mono text + copy button only
                │
                ▼
  /payments (PaymentPane.tsx)          /staff (StaffDashboard.tsx)
    useSearchParams().get('id')          useSearchParams().get('id')
    → filter/scroll+highlight            → filter/scroll+highlight
    PaymentHistoryList (custom divs,     DataTable (already `searchable`,
    NOT DataTable — needs a new          but ID isn't a rendered column;
    local filter input + state)          query-param prefill needs a
                                          local effect, not DataTable's
                                          internal search state)

QA-04 (useCheckoutSale test)
  useCheckoutSale.ts
    reads: useCartStore.items, useStaffStore.currentStaff/currentShift,
           useCajaStore.currentCaja/isCajaOpen
    calls: callProcessDirectSale() [edge-function-contracts.ts]
        │
        ▼
  useCheckoutSale.test.ts (new)
    vi.mock the 3 stores + callProcessDirectSale
    assert processCashPayment/processCardPayment/processSplitPayment
    success + failure (network offline, caja closed, edge-function error) paths

OPS-02 (DR doc + script)
  docs/database-backup-and-disaster-recovery.md (new)   scripts/backup-db.sh (new)
    grounds itself in:                                    pg_dump $DATABASE_URL > backup.sql
    - supabase/config.toml D-06 comment (self-hosted,     (not wired into cron — deploy-time
      no linked Cloud project_id)                          decision, out of scope per D-09)
    - settings-backup edge function's verified scope
      (settings/categories/products/modifiers/
      product_modifiers only — NOT orders/payments/
      inventory/suppliers/etc.)
```

### Recommended Project Structure

No new directories. Files touched/added, by FSD layer:

```
src/widgets/SupplierListPanel.tsx                  # QA-01, edit in place
src/shared/ui/EmptyState.stories.tsx               # QA-02, new
src/shared/ui/ConfirmDialog.stories.tsx            # QA-02, new
src/shared/ui/POSButton.stories.tsx                # QA-02, new
src/shared/ui/DataTable.stories.tsx                # QA-02, new
src/shared/ui/MoneyDisplay.stories.tsx             # QA-02, new
src/shared/ui/MoneyInput.stories.tsx               # QA-02, new
.storybook/main.ts                                 # QA-02, new — Wave 0 gap
.storybook/preview.ts                              # QA-02, new — Wave 0 gap
src/shared/ui/EntityIdCell.tsx                     # QA-03, new — shared cell renderer (avoids
                                                    #   4x duplicated copy/link/tooltip logic)
src/widgets/AuditLogTable/AuditLogTable.tsx         # QA-03, edit — add entityId column
src/widgets/EditHistoryTable/EditHistoryTable.tsx   # QA-03, edit — extend ticket column
src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx  # QA-03, edit — tabId column
src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx        # QA-03, edit — orderId column
src/widgets/PaymentPane/ui/PaymentPane.tsx          # QA-03, edit — add ID filter input + useSearchParams
src/widgets/StaffDashboard/StaffDashboard.tsx       # QA-03, edit — read useSearchParams, scroll/highlight
src/features/checkout-sale/model/useCheckoutSale.test.ts  # QA-04, new
docs/database-backup-and-disaster-recovery.md       # OPS-02, new
scripts/backup-db.sh                                # OPS-02, new
```

### Pattern 1: Error display (`resultError` → `role="alert"`)
**What:** The project's one established error-UI convention.
**When to use:** Any query-driven panel with a Result-shaped error field.
**Example (verified — read this session):**
```tsx
// Source: src/widgets/InventoryPagePanel.tsx:223-227 (verified, quoted verbatim)
{resultError ? (
  <p className="text-sm text-destructive" role="alert">
    {resultError.message}
  </p>
) : null}
```
`useSuppliers()` (`src/entities/supplier/model/queries.ts:73-79`, verified) already returns this shape:
```ts
// Source: src/entities/supplier/model/queries.ts:73-79 (verified, quoted verbatim)
const result = query.data;
return {
  ...query,
  data: result?.ok ? result.data : undefined,
  resultError: result && !result.ok ? result.error : undefined,
  isEmpty: query.isSuccess && !!result?.ok && result.data.length === 0,
};
```
`SupplierListPanel.tsx:21` currently only destructures `{ data: suppliers }` — QA-01 is adding `isLoading, resultError` to that same destructure and two conditional blocks. No query-layer change needed.

### Pattern 2: Loading skeleton (`TableRowSkeleton`)
**What:** Reusable skeleton row, already `role="status"` + `aria-label={t('loading.generic')}` (i18n key already translated both locales).
**Example (verified — read this session):**
```tsx
// Source: src/shared/ui/LoadingSkeletons.tsx:67-80 (verified, quoted verbatim signature)
export function TableRowSkeleton({ columns = 4, className }: TableRowSkeletonProps) { /* ... */ }
```
D-05 says render "a few skeleton rows" — `<TableRowSkeleton columns={2} />` × 3 in place of the `<ul>` while `useSuppliers().isLoading` is true (2 columns matches the current 2-visual-column supplier row: name + action buttons).

### Pattern 3: Storybook story shape
**Example (verified — read this session):**
```tsx
// Source: src/shared/ui/Button.stories.tsx:1-36 (verified, quoted verbatim pattern)
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
All 6 new stories follow `title: 'Shared/UI/<ComponentName>'`. Components needing `useTranslation` (MoneyDisplay, MoneyInput, EmptyState via its action button, ConfirmDialog) will resolve translations automatically once `.storybook/preview.ts` imports the i18n singleton (`src/shared/lib/i18n/index.ts`, verified — calls `i18n.use(initReactI18next).init(...)` at module scope, so any module that imports it activates the global i18next instance with no `<I18nextProvider>` wrapper needed, same as `src/shared/lib/test-setup.ts`'s approach for Vitest).

### Pattern 4: Zustand-store mocking in a Vitest hook test
**Example (verified — read this session):**
```ts
// Source: src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts:11-15 (verified, quoted verbatim)
const mockAddItem = vi.fn();
vi.mock('@entities/tab/model/cartStore', () => ({
  useCartStore: (selector: (state: { addItem: typeof mockAddItem }) => unknown) =>
    selector({ addItem: mockAddItem }),
}));
```
`useCheckoutSale.ts` (verified, read this session) reads from **three** stores, not one:
```ts
// Source: src/features/checkout-sale/model/useCheckoutSale.ts:72-76 (verified, quoted verbatim)
const items = useCartStore(state => state.items);
const staff = useStaffStore(state => state.currentStaff);
const shift = useStaffStore(state => state.currentShift);
const caja = useCajaStore(state => state.currentCaja);
const isCajaOpen = useCajaStore(state => state.isCajaOpen);
```
The test must `vi.mock` `@entities/tab/model/cartStore`, `@entities/staff/model/store`, and `@entities/caja` (or `@entities/caja/model/store`) each with a selector-passthrough shape, plus `vi.mock('@shared/lib/edge-function-contracts')` to control `callProcessDirectSale`'s resolved value — mirroring `useProcessRefund.test.ts`'s `supabase.rpc` mock but for a `fetch`-based edge-function call instead of an RPC call. Store field names confirmed this session:
```ts
// Source: src/entities/caja/model/store.ts:10-12 (verified, quoted verbatim)
currentCaja: CajaSession | null;
isCajaOpen: boolean;
```
```ts
// Source: src/entities/staff/model/store.ts:11-12 (verified, quoted verbatim)
currentStaff: Staff | null;
currentShift: Shift | null;
```
Success/failure paths to cover per D-07: `submit()` returns `err(networkOfflineError())` when `isOnline()` is false (mock `@shared/lib/connectivity`); returns `err({code:'CAJA_CLOSED'...})` when no open caja/staff/shift; on `callProcessDirectSale` success, `processCashPayment`/`processCardPayment` return `ok({paymentId, ...})`; on `callProcessDirectSale` failure (or a success envelope missing `paymentId`/`receiptData`), they return the underlying `err` (or a synthesized `UNKNOWN_ERROR` per lines 155-161, verified).

### Pattern 5: Query-param-driven filter/scroll (new to this codebase)
**What:** No FSD layer currently uses `useSearchParams` — grep of every non-test `.tsx` importing `react-router-dom` (verified this session) shows only `Link`, `Navigate`, `useLocation`, `useNavigate`. This phase introduces the first instance.
**Least-invasive shape confirmed by reading both target surfaces:**
- **`/payments`** (`PaymentPane.tsx`, verified): `PaymentHistoryList` renders payments as plain `<div>` rows (`data-testid={`payment-row-${payment.id}`}`, already present, verified), **not** `DataTable`. Add a local `SearchInput`-style filter (reuse `src/shared/ui/SearchInput.tsx`, verified — already a controlled `value`/`onChange` component used elsewhere) above the list, filtering the `payments` array client-side by `payment.id.includes(filterValue)`. On mount, seed the filter's initial value from `useSearchParams().get('id')`.
- **`/staff`** (`StaffDashboard.tsx`, verified): already renders via `<DataTable searchable searchPlaceholder={...} />` (verified, line ~204-210), but `DataTable`'s search state is **fully internal** (`React.useState` inside `DataTable.tsx`, no controlled `value` prop exposed — verified by reading `DataTable.tsx` in full) and its default global-filter only matches columns that exist in `columns` (`staff.id` is not one of them). Pre-filling ID-based search into `DataTable`'s built-in search box is **not possible without changing `DataTable`'s public API**, which is out of this phase's narrow scope. The least-invasive approach: read `useSearchParams().get('id')` in `StaffDashboard`, find the matching row in `rows`, and scroll+highlight it (e.g. `getRowClassName` prop — already exists on `DataTable`, verified — returning a highlight class when `row.staff.id === targetId`, plus a `useEffect` calling `.scrollIntoView()` via a ref/data-attribute). This avoids modifying `DataTable.tsx` at all.

### Anti-Patterns to Avoid
- **Don't add a new "detail page" for payments/staff.** D-01/D-02/D-03/D-04 are explicit: reuse the existing list views with filter/scroll, not a new `/payments/:id` or `/staff/:id` route.
- **Don't build a generic "entity ID column" abstraction spanning unrelated tables.** D-02 limits real navigation to exactly `payment`/`tab`/`staff`; every other `entityType` renders copy-only. Resist the urge to add a lookup table mapping every `entityType` to a route "for completeness" — no such routes exist and building them is explicitly out of scope.
- **Don't run `npx storybook init` blindly.** It may overwrite/duplicate configuration or attempt interactive prompts inconsistent with this repo's existing story files. Since 15 `.stories.tsx` files already exist and work against `@storybook/react-vite`, hand-author `.storybook/main.ts`/`preview.ts` matching the already-installed addon versions (`@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/addon-onboarding`, `@chromatic-com/storybook`) rather than an interactive scaffold.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading skeleton for Suppliers list | A new skeleton component | `TableRowSkeleton` (`src/shared/ui/LoadingSkeletons.tsx`) | Already exists, already i18n'd, already used elsewhere — D-05 |
| Error display for Suppliers list | A new error banner/toast pattern | `role="alert"` `<p>` pattern from `InventoryPagePanel.tsx` | The project's one established convention — D-06 |
| Copy-to-clipboard | A clipboard-polyfill library | Native `navigator.clipboard.writeText()` wrapped in existing `Result<T>` error handling | Zero dependency, Tauri/WebView2 both support the Clipboard API in a secure context |
| ID-based filtering on `/payments` | A new search/query library | Plain `Array.prototype.filter` on the already-fetched `payments` array (100-row `.limit(100)` cap per `usePayments()`, verified) | Dataset is small and already client-side; no pagination/server-filter machinery needed |
| Staff highlight-on-navigate | A new "jump to row" component | `DataTable`'s existing `getRowClassName` prop + a scroll ref | Prop already exists and is unused elsewhere for this purpose — no API change needed |
| DB backup mechanism | A custom Node/TS backup script or a new backup-as-a-service dependency | `pg_dump` (bundled with any Postgres install/Supabase CLI) | Postgres's own dump tool is the standard, dependency-free DR primitive; D-09 explicitly asks for a `pg_dump` script |

**Key insight:** Every one of QA-01/02/03/04's building blocks already exists in `src/shared/ui/`. The only genuinely new infrastructure in this entire phase is (a) the `.storybook/` config directory (a gap, not a feature) and (b) `useSearchParams`-driven filtering (net-new but using an already-installed router API, not a new library).

## Common Pitfalls

### Pitfall 1: Storybook has no config directory — QA-02 will silently fail verification
**What goes wrong:** Writing all 6 `.stories.tsx` files and declaring QA-02 done, then discovering `npm run storybook` / `npm run build-storybook` / `npm run test:storybook` cannot run because there is no `.storybook/main.ts`.
**Why it happens:** `.storybook/` is listed in `.gitignore` (`.gitignore:59`, verified this session) and does not exist anywhere on disk in this checkout (verified via `find`), yet 15 existing `.stories.tsx` files already exist and `vitest.config.ts:25` (verified) references `path.join(dirname, '.storybook')` as `configDir` for the opt-in `RUN_STORYBOOK_TESTS=1` Vitest project. This means Storybook has apparently never actually been runnable in this environment/repo history — likely bootstrapped from a template that generated `.stories.tsx` files without ever committing the config.
**How to avoid:** Add a Wave 0 task: hand-author `.storybook/main.ts` (framework: `@storybook/react-vite`, stories glob `../src/**/*.stories.@(ts|tsx)`, addons matching `package.json`'s installed `@storybook/addon-a11y`/`addon-docs`/`addon-onboarding`, `@chromatic-com/storybook`) and `.storybook/preview.ts` (import `src/app/globals.css` for Tailwind, import `src/shared/lib/i18n/index.ts` for the i18next singleton). Verify via `npm run build-storybook` (static build must succeed with zero errors) — this is the concrete automated check QA-02's success criterion demands, since `test:storybook`'s Playwright-backed project is opt-in behind an env var this project's CI may not set.
**Warning signs:** `npm run storybook` / `npm run build-storybook` erroring with "no configuration found" or similar.

### Pitfall 2: `entityType` is a free-form string, not an enum — exact literal matching required
**What goes wrong:** Assuming `entityType` has a fixed TypeScript union and building a switch/lookup against invented values.
**Why it happens:** `AuditLogSchema.entityType` is `z.string().min(1)` (`src/shared/lib/domain.ts:1464`, verified) — no enum. The actual literal strings are scattered across edge functions and RPC-wiring SQL comments.
**How to avoid:** Match on the exact verified literals: `'staff'` (`supabase/functions/create-staff/index.ts:134`, verified), `'payment'` (`supabase/migrations/20260511000002_rpc_audit_wiring.sql:10-11` comment, verified: `process_payment_atomic -> ... entity_type 'payment'`), `'tab'` (`supabase/migrations/20260703000002_wire_transfer_tab_stock_movement_audit.sql:11` comment, verified: `entity_type 'tab'`), plus confirmed non-linkable examples `'caja_session'` and `'settings'` (`AuditLogTable.test.tsx:59` and `supabase/functions/settings-restore/index.ts:136`, both verified). D-02's allowlist (`payment`, `tab`, `staff`) should be implemented as an exact-string `Set` check, not a fuzzy/case-insensitive match.
**Warning signs:** A link renders (or fails to render) for an `entityType` value that doesn't match what's actually written to the table — verify against real audit-log rows if available, not just source-code literals.

### Pitfall 3: Reports has TWO entity-ID surfaces, not one
**What goes wrong:** Wiring only `DeletionsPostCloseReport.tsx` (the one file the UI-SPEC calls out by name) and missing `DeletionsPreSendPanel.tsx`, which also renders a raw entity ID.
**Why it happens:** `DeletionsPreSendPanel.tsx:25-28` (verified, read this session) has an `orderId` column (`accessorKey: 'orderId'`, `header: t('deletionsPreSendPanel.columnOrderId')`) rendering the raw UUID with no truncation or link — same shape gap as `DeletionsPostCloseReport`'s `tabId` column. Both widgets are mounted on `/reports` (`src/pages/reports/index.tsx:5-6,133,140`, verified) under the "Deletions Pre" and "Deletions Post" tabs respectively.
**How to avoid:** Apply the shared `EntityIdCell`-style treatment to both. Per D-02, `DeletionsPreSendPanel`'s `orderId` is an `order_items`-scoped identifier (verified: `DeletionsPreRowSchema.orderId: UuidSchema` at `src/shared/lib/domain.ts:1026-1027`, distinct from `payment`/`tab`/`staff`) — it should get **copy-to-clipboard only**, same treatment as any other non-allowlisted `entityType`, not a real link (no `/order-items/:id` page exists or is being built).
**Warning signs:** QA-03's Playwright spec passing for `DeletionsPostCloseReport` but the `DeletionsPreSendPanel` tab still showing raw untruncated/non-copyable UUIDs.

### Pitfall 4: `DataTable`'s search state cannot be externally controlled
**What goes wrong:** Trying to pass a `value` prop into `DataTable`'s `searchable` mode to pre-fill from a query param, and finding no such prop exists.
**Why it happens:** `DataTable.tsx` (verified, read in full) manages `globalFilter` via internal `React.useState`, with no `value`/`initialValue` prop exposed on `DataTableProps<T>`.
**How to avoid:** For `/staff`, don't fight `DataTable`'s search box — use the scroll+highlight approach via `getRowClassName` (already a supported prop) instead of trying to route a query param into the search input.
**Warning signs:** A hacky `key={searchParam}`-remount trick or a `DataTable.tsx` API change creeping into what should be an additive-only phase.

### Pitfall 5: Tooltip needs its own `TooltipProvider` wrapper — no global one exists
**What goes wrong:** Using `<Tooltip>`/`<TooltipTrigger>`/`<TooltipContent>` for the full-ID-on-hover requirement (UI-SPEC "long-text/overflow" row) without a `TooltipProvider` ancestor, causing Radix to throw or silently no-op.
**Why it happens:** Grep confirms (verified this session) there is no app-root `<TooltipProvider>` in `App.tsx` — every existing usage (`ProtectedAction.tsx:46-53`, `CajaDashboard.tsx:366-386`) wraps its own local `<TooltipProvider>`.
**How to avoid:** Wrap the new `EntityIdCell` component (or the table row it's used in) in its own local `<TooltipProvider>`, following the `ProtectedAction.tsx` pattern exactly.
**Warning signs:** Tooltip content never appears on hover/focus in manual/E2E testing despite correct JSX structure.

### Pitfall 6: OPS-02 doc must not assume a hosting target that hasn't been decided
**What goes wrong:** Writing the DR doc as if Supabase Cloud is the production target (the more common default), silently contradicting the repo's own recorded decision.
**Why it happens:** `supabase/config.toml:5-10` (verified, quoted verbatim) states: *"D-06 (REVISED): self-hosted Supabase stack on localhost:8000, not a linked Supabase Cloud project — there is no cloud project_id to `supabase link` against... The prior value ('shsrhxleopmovzpzqmex') was the live production bar project and must never be restored here."* Production hosting is explicitly unresolved per `10-CONTEXT.md` D-08.
**How to avoid:** Structure the doc with two clearly-labeled sections (self-hosted / Cloud) rather than picking one, exactly as D-08 specifies. Explicitly state the settings-backup feature is NOT a substitute (D-10) — grounded in the verified fact that `supabase/functions/settings-backup/index.ts:68-86` (verified, quoted below) only snapshots 5 config-ish tables, none of which are `orders`, `payments`, `inventory`, `suppliers`, `shipments`, `caja_sessions`, `profiles`, or `audit_logs`:
```ts
// Source: supabase/functions/settings-backup/index.ts:68-86 (verified, quoted verbatim)
const [settingsRes, categoriesRes, productsRes, modifiersRes, productModifiersRes] = await Promise.all([
  serviceClient.from('settings').select('*').order('key'),
  serviceClient.from('categories').select('*').order('sort_order'),
  serviceClient.from('products').select('*').order('name'),
  serviceClient.from('modifiers').select('*').order('sort_order'),
  serviceClient.from('product_modifiers').select('*'),
]);
```
**Warning signs:** The doc reads as if a Cloud plan/tier has already been chosen, or claims the settings-backup feature already covers full-database DR.

## Code Examples

### QA-01: Wiring loading + error into `SupplierListPanel.tsx`
```tsx
// Adapt src/widgets/SupplierListPanel.tsx — current destructure (verified, line 21):
//   const { data: suppliers } = useSuppliers();
// becomes:
const { data: suppliers, isLoading, resultError } = useSuppliers();

// Insert before the existing `if (suppliers?.length === 0)` empty-state branch:
if (isLoading) {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRowSkeleton key={i} columns={2} />
      ))}
    </div>
  );
}

// Insert inside the main return's <section>, above the <ul> (matches
// InventoryPagePanel.tsx:223-227 verbatim):
{resultError ? (
  <p className="text-sm text-destructive" role="alert">
    {resultError.message}
  </p>
) : null}
```

### QA-04: `useCheckoutSale.test.ts` skeleton (mocking shape only — fill in assertions per D-07)
```ts
// Source pattern: src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts (verified)
// + src/features/process-refund/model/useProcessRefund.test.ts (verified)
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockItems = vi.fn(() => []);
vi.mock('@entities/tab/model/cartStore', () => ({
  useCartStore: (selector: (s: { items: unknown[] }) => unknown) => selector({ items: mockItems() }),
}));

const mockStaffState = { currentStaff: null as unknown, currentShift: null as unknown };
vi.mock('@entities/staff', () => ({
  useStaffStore: (selector: (s: typeof mockStaffState) => unknown) => selector(mockStaffState),
}));

const mockCajaState = { currentCaja: null as unknown, isCajaOpen: false };
vi.mock('@entities/caja', () => ({
  useCajaStore: (selector: (s: typeof mockCajaState) => unknown) => selector(mockCajaState),
}));

vi.mock('@shared/lib/edge-function-contracts', () => ({
  callProcessDirectSale: vi.fn(),
}));

vi.mock('@shared/lib/connectivity', () => ({ isOnline: vi.fn(() => true) }));

// NOTE: verify the exact re-export paths (`@entities/staff` vs `@entities/staff/model/store`,
// `@entities/caja` vs `@entities/caja/model/store`) at implementation time by checking each
// entity's `index.ts` barrel — useCheckoutSale.ts itself imports `useStaffStore` from
// '@entities/staff' and `useCajaStore` from '@entities/caja' (verified,
// src/features/checkout-sale/model/useCheckoutSale.ts:2-3), so mock the SAME module specifiers
// the hook imports, not the underlying store file, or the mock will not intercept the real call.
```

### OPS-02: `scripts/backup-db.sh` shape
```bash
#!/usr/bin/env bash
set -euo pipefail
# Full-database pg_dump for the self-hosted fallback path (D-09).
# NOT wired into cron yet — that is a deploy-time decision, out of scope here.
# Requires DATABASE_URL to be set (see docs/database-backup-and-disaster-recovery.md).
: "${DATABASE_URL:?Set DATABASE_URL to the target Postgres connection string}"
cd "$(dirname "$0")/.."
mkdir -p backups
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
pg_dump "$DATABASE_URL" --format=custom --file="backups/backup-${timestamp}.dump"
echo "Backup written to backups/backup-${timestamp}.dump"
```
(Style matches `scripts/setup-ubuntu.sh`'s verified header conventions: `set -euo pipefail`, `cd "$(dirname "$0")/.."`.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Suppliers list renders blank during fetch/error | Suppliers list shows skeleton + `role="alert"` error, matching Inventory | This phase (QA-01) | Consistent loading/error UX across `/inventory` and `/suppliers` |
| Entity IDs shown truncated/plain-text only | Entity IDs copyable everywhere, clickable for payment/tab/staff | This phase (QA-03) | First cross-page ID-navigation pattern in the codebase |
| No DR/backup documentation | `docs/database-backup-and-disaster-recovery.md` + `scripts/backup-db.sh` | This phase (OPS-02) | Closes OPS-02; production data-loss posture is now explicit, not assumed |

**Deprecated/outdated:** None — this phase closes gaps, it doesn't replace a previously-working mechanism.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The exact re-export module specifiers for `useStaffStore`/`useCajaStore` mocking in `useCheckoutSale.test.ts` are `@entities/staff` and `@entities/caja` (barrel imports), matching what `useCheckoutSale.ts` itself imports — this was read directly from the hook's import lines this session, so confidence is HIGH, but the barrel `index.ts` files were not opened to confirm they re-export the store hook by that exact name (only the store files themselves were read). | Code Examples §QA-04 | If the barrel doesn't re-export `useStaffStore`/`useCajaStore` under those names, `vi.mock` on the barrel path silently fails to intercept and the test hits the real Zustand store — low risk, caught immediately by a failing/undefined-behavior test run |
| A2 | `pg_dump --format=custom` (vs. plain SQL) is the recommended format for the DR doc/script — a general Postgres best-practice, not verified against this project's specific Postgres version or any team preference. | Code Examples §OPS-02 | Low risk — `--format=custom` is restorable via `pg_restore` and is strictly more flexible than plain SQL; if the team prefers plain `.sql` dumps for human readability, this is a one-flag change |
| A3 | DR doc's "which Supabase Cloud tier provides adequate PITR" claim (if included as a specific tier name/day count) would be `[ASSUMED]` unless cross-checked against Supabase's current pricing page — this research did not fetch that page. Flag this explicitly in the doc rather than stating a specific tier as fact. | OPS-02 doc drafting | Medium — stating a wrong tier/day-count as verified fact would misrepresent actual PITR coverage; the doc must either verify this via a web fetch at drafting time or clearly mark it as unconfirmed |

## Open Questions (RESOLVED)

1. **RESOLVED — Should `EntityIdCell` be a single new shared component, or four separate inline implementations?**
   - What we know: The copy/link/tooltip logic is identical across `AuditLogTable`, `EditHistoryTable`, and both Deletions report widgets — only the `entityType`/`entityId` values and the surrounding column config differ.
   - What's unclear: Whether `src/shared/ui/` (cross-cutting) or a `wAdmin`-scoped shared file is the right home, given 3 of 4 usages are `wAdmin`-namespaced widgets and one (`AuditLogTable`) is imported into a second widget (`EditHistoryTable`) already.
   - Recommendation: Put it in `src/shared/ui/EntityIdCell.tsx` (cross-cutting primitive, consistent with `TableRowSkeleton`/`SearchInput` living there) so all four consuming widgets — spanning both `wAdmin`-namespaced tables and Reports panels — can import it without an `wAdmin`→`wAdmin` cross-widget dependency; keep the i18n strings themselves in each consuming widget's existing namespace per the UI-SPEC's copywriting contract (`common` for the copy button, `wAdmin` for the aria-labels).

2. **RESOLVED — Exact production hosting decision for OPS-02 (self-hosted vs. Supabase Cloud).**
   - What we know: `supabase/config.toml`'s D-06 comment confirms self-hosted is the *current* local-dev target; CONTEXT.md D-08 says this is genuinely undecided for production.
   - What's unclear: Whether the user will decide before this phase's doc is written, or whether the doc should ship covering both scenarios indefinitely.
   - Recommendation: Per D-08, write the doc covering both scenarios now; do not block this phase on the hosting decision being made.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `pg_dump` (Postgres client tools) | OPS-02's `scripts/backup-db.sh` | Not verified in this sandboxed research session (no shell access to check `pg_dump --version` against the target deploy host) | — | Document the exact package (`postgresql-client` on Debian/Ubuntu, matching `scripts/setup-ubuntu.sh`'s apt-based conventions) as a prerequisite in the DR doc; the script should fail fast with a clear message if `pg_dump` is missing, not fail silently |
| `.storybook/` config | QA-02 | ✗ (confirmed absent this session — see Pitfall 1) | — | No fallback — must be scaffolded as a Wave 0 task; this is a hard blocker for QA-02's verification, not an optional nice-to-have |

**Missing dependencies with no fallback:**
- `.storybook/main.ts` + `.storybook/preview.ts` — must be created before any of QA-02's 6 story files can be verified to "render without error."

**Missing dependencies with fallback:**
- `pg_dump` on the deploy host — document as a prerequisite; the script itself should `command -v pg_dump` guard and exit with a clear error (matching `scripts/setup-ubuntu.sh`'s OS-guard style, verified) rather than fail cryptically.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 (unit) + Playwright 1.59 (E2E) — both verified in `package.json` |
| Config file | `vitest.config.ts` (unit/integration/storybook projects) + `playwright.config.ts` (E2E, `channel: 'chrome'`, `headless: true`) |
| Quick run command | `npx vitest run src/features/checkout-sale/model/useCheckoutSale.test.ts` |
| Full suite command | `npm run test` (unit) + `npm run test:e2e` (E2E) + `npm run build-storybook` (QA-02 gate) |

### Phase Requirement → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| QA-01 | Suppliers page shows skeleton while loading, `role="alert"` on fetch failure | E2E (Playwright, mocked slow/failed request) | `npx playwright test e2e/<new-or-existing-suppliers-spec>.spec.ts` | ❌ Wave 0 — no existing Suppliers loading/error spec found under `e2e/53-supplier-receiving.spec.ts` (not opened this session; planner should check before assuming a new file is needed) |
| QA-02 | 6 Storybook stories render without error | Automated Storybook build check | `npm run build-storybook` (must exit 0, zero errors) | ❌ Wave 0 — `.storybook/` itself is the gap (Pitfall 1); story files are ✅ once written |
| QA-03 | Copy/link entity IDs work in Audit Log, Edit History, Reports; `/payments`+`/staff` filter | E2E (Playwright — copy via `navigator.clipboard` assertion, navigation via `page.goto`/URL assertion) | `npx playwright test e2e/38-audit-logs.spec.ts` (extend) + new spec for Reports/payments/staff filter | ⚠️ Partially exists — `e2e/38-audit-logs.spec.ts` already covers `AuditLogTable`'s DOM/a11y contract (referenced in `AuditLogTable.tsx`'s own doc comment, verified) and will need extension, not full creation |
| QA-04 | `useCheckoutSale` success + failure paths | Vitest unit | `npx vitest run src/features/checkout-sale/model/useCheckoutSale.test.ts` | ❌ New file, per D-07 |
| OPS-02 | DR doc + script exist, doc matches verified production reality | Direct inspection (doc + config fact, not E2E-testable — explicitly noted in ROADMAP.md per STATE.md) | N/A (manual/direct file-existence + content check) | ❌ New files |

### Sampling Rate
- **Per task commit:** run the specific new/changed test file (`npx vitest run <file>` or the targeted Playwright spec).
- **Per wave merge:** `npm run typecheck && npm run lint && npm run test` (unit) + `npm run build-storybook` (QA-02 gate).
- **Phase gate:** Full suite green (`npm run test`, `npm run test:e2e`, `npm run build-storybook`) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `.storybook/main.ts` + `.storybook/preview.ts` — required before any QA-02 story can be verified (Pitfall 1).
- [ ] Confirm whether `e2e/53-supplier-receiving.spec.ts` already exercises `/suppliers` loading/error states, or whether QA-01 needs a net-new spec file (not opened this session — flagged for the planner to check before scoping the E2E task).
- [ ] Confirm whether a Reports-specific E2E spec file exists for `DeletionsPreSendPanel`/`DeletionsPostCloseReport` beyond `e2e/38-audit-logs.spec.ts` (not opened this session).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | No | This phase touches no auth flow |
| V3 Session Management | No | — |
| V4 Access Control | No | Entity-ID links reuse existing RBAC-gated pages (`/payments`, `/staff`) unchanged; no new permission surface is introduced |
| V5 Input Validation | Yes | The `?id=` query param read via `useSearchParams` must be treated as untrusted input: only used for client-side array `.filter()`/row-matching (never interpolated into a Supabase query string or RPC call), so no injection surface exists — but the filter value should still be normalized (trimmed) before comparison |
| V6 Cryptography | No | No crypto/secrets touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Reflected query-param value rendered into DOM (`?id=<script>`) | Tampering / Information Disclosure | The `id` param is only ever used for `.includes()`/`===` string comparison against existing data (never rendered back verbatim as HTML) — React's default JSX escaping covers any incidental render, no `dangerouslySetInnerHTML` is introduced anywhere in this phase |
| `pg_dump` connection string containing credentials committed to the script or docs | Information Disclosure | `scripts/backup-db.sh` reads `DATABASE_URL` from the environment (never hardcoded); the DR doc must explicitly instruct never to commit a real connection string, consistent with this repo's existing `.env.local`-based secret convention |

## Sources

### Primary (HIGH confidence — all read directly this session)
- `src/widgets/InventoryPagePanel.tsx`, `src/widgets/SupplierListPanel.tsx`, `src/entities/supplier/model/queries.ts`, `src/shared/ui/LoadingSkeletons.tsx` — QA-01 grounding
- `src/shared/ui/Button.stories.tsx`, `package.json`, `vitest.config.ts`, `.gitignore` — QA-02 grounding (incl. the Storybook config gap)
- `src/widgets/AuditLogTable/AuditLogTable.tsx`, `src/widgets/EditHistoryTable/EditHistoryTable.tsx`, `src/widgets/DeletionsPostCloseReport/DeletionsPostCloseReport.tsx`, `src/widgets/DeletionsPreSendPanel/DeletionsPreSendPanel.tsx`, `src/pages/reports/index.tsx`, `src/pages/payments/index.tsx`, `src/pages/staff/index.tsx`, `src/widgets/PaymentPane/ui/PaymentPane.tsx`, `src/widgets/StaffDashboard/StaffDashboard.tsx`, `src/shared/ui/DataTable.tsx`, `src/shared/ui/SearchInput.tsx`, `src/shared/ui/tooltip.tsx`, `src/shared/lib/domain.ts` (AuditLogSchema, DeletionsPreRowSchema), `supabase/functions/create-staff/index.ts`, `supabase/functions/settings-restore/index.ts`, `supabase/migrations/20260511000002_rpc_audit_wiring.sql`, `supabase/migrations/20260703000002_wire_transfer_tab_stock_movement_audit.sql`, `supabase/migrations/20260428000001_recipes_tables.sql` — QA-03 grounding
- `src/features/process-refund/model/useProcessRefund.test.ts`, `src/features/checkout-sale/model/useCheckoutSale.ts`, `src/features/scan-barcode-to-cart/model/useScanBarcodeToCart.test.ts`, `src/entities/caja/model/store.ts`, `src/entities/staff/model/store.ts`, `src/shared/lib/edge-function-contracts.ts` — QA-04 grounding
- `supabase/config.toml`, `src/widgets/SettingsTabsPanel/tabs/BackupSettingsTab.tsx`, `supabase/functions/settings-backup/index.ts`, `scripts/setup-ubuntu.sh` — OPS-02 grounding
- `.planning/phases/10-quality-debt-ops-documentation/10-CONTEXT.md`, `.planning/phases/10-quality-debt-ops-documentation/10-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `./CLAUDE.md` — phase scope and project constraints

### Secondary (MEDIUM confidence)
- None — this phase required no external/web research; every fact needed was already present in the repository.

### Tertiary (LOW confidence)
- A3 in the Assumptions Log (Supabase Cloud PITR tier specifics) — flagged, not resolved, since it requires an external pricing-page fetch that would need to happen at doc-drafting time to stay current.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all reused code read directly this session
- Architecture: HIGH — every integration point (Suppliers panel, Audit/EditHistory/Reports tables, Payments/Staff pages, checkout-sale hook, settings-backup function) was opened and read in full
- Pitfalls: HIGH — the Storybook config gap, the two-Reports-surfaces gap, and the `DataTable` uncontrolled-search-state gap were all discovered by direct file inspection, not inferred

**Research date:** 2026-08-18
**Valid until:** No external dependency; valid until the underlying files change (self-invalidating on next commit to any of the Sources listed above). Recommend re-grounding entity-ID literal-string claims (Pitfall 2) if new audit-log-writing code is added to the codebase before this phase executes.

## Project Constraints (from CLAUDE.md)

- **No manual/human UAT.** Every verification in this phase must be automated Playwright E2E or Vitest — no `checkpoint:human-verify`, no `human_needed` terminal state. OPS-02 is the one item this repo's own conventions already treat as a "direct inspection" fact-check rather than E2E-testable behavior (confirmed by `.planning/STATE.md`'s decision log: *"OPS-01... and OPS-02... are the only v1.1 success criteria not verified via Playwright/Vitest — both are inherently config-value/document facts"*), and the phase's own Success Criteria list states this explicitly for OPS-02.
- **Headless Playwright by default** (`playwright.config.ts`, `channel: 'chrome'`, `headless: true`) — any new QA-01/QA-03 E2E specs must run headless.
- **FSD import boundaries** (`app → pages → widgets → features → entities → shared`) — the new `EntityIdCell` belongs in `shared/ui/`; it must not import from `widgets/`/`features/`/`entities/` (only from `shared/lib/` and other `shared/ui/` primitives, plus `react-router-dom`'s `Link`).
- **`exactOptionalPropertyTypes: true`** — any new prop types (e.g. `EntityIdCellProps`) must use `field: string | undefined`, not `field?: string`, for any prop that can genuinely be omitted by a caller passing an explicit `undefined`.
- **No `any` without a same-line justification comment** — none of this phase's work should need `any`; all touched types (`AuditLog`, `Payment`, `Staff`, `DeletionsPreRow`, `DeletionsPostRow`) already have full Zod-derived types.
- **`i18next/no-literal-string: error`** on `shared/ui`, `entities`, `features`, `widgets`, `pages` — every new string (copy-button aria-label, toast messages, filter placeholder, aria-labels for the new links) must go through `t()`, added to both `es-MX` (byte-identical to source literal per the repo's i18n catalog rule) and `en-US` locale JSON files in the correct namespace per CLAUDE.md's namespace table (`common` for copy/toast, `wAdmin` for Audit/EditHistory/Reports aria-labels, `wPanels` for the `/payments` filter placeholder).
- **Commit convention:** Conventional Commits, `<type>(<phase-or-ticket-id>): <description>`, no `--no-verify`.
- **Generated files never hand-edited:** `src/shared/ui/` shadcn components would be regenerated via `npx shadcn@latest add <component>` if a new primitive were needed — not applicable here since no new shadcn component is required (UI-SPEC confirms: "No new shadcn components are required for this phase").
