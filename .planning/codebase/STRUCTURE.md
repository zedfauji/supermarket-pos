# Codebase Structure

**Analysis Date:** 2026-08-10

## Directory Layout

```
bar-pos/
├── .agents/                    # Agent skill definitions (GSD)
├── .planning/                  # GSD phase plans, state, docs
│   ├── codebase/              # Codebase maps (ARCHITECTURE.md, STACK.md, etc)
│   ├── phases/                # Per-phase plans
│   └── specs/                 # Spec documents
├── .kiro/                     # kiro CLI configuration
├── .cursor/                   # Cursor AI / Claude Code settings
├── e2e/                       # Playwright E2E test suite (61 specs)
│   ├── helpers/              # Test utilities (auth, fixtures)
│   ├── visual/               # Visual regression snapshots
│   └── *.spec.ts             # Test files (01-ci.spec.ts, 02-caja.spec.ts, etc)
├── eslint-rules/             # Custom ESLint rules (FSD boundary enforcement)
├── public/                    # Static assets (served as-is)
├── scripts/                   # Utility scripts (setup-ubuntu.sh, etc)
├── src/                       # Main React source code (Feature-Sliced Design)
│   ├── app/                  # App layer (root component, routing, providers)
│   ├── pages/                # Pages layer (route containers)
│   ├── widgets/              # Widgets layer (composite panels)
│   ├── features/             # Features layer (user actions)
│   ├── entities/             # Entities layer (domain models)
│   ├── shared/               # Shared layer (utilities, primitives)
│   ├── test/                 # Shared test setup
│   ├── assets/               # Images, icons
│   └── main.tsx              # React root entry point
├── src-tauri/                # Tauri 2 desktop shell (Rust)
│   ├── src/
│   ├── capabilities/         # Tauri capability permissions
│   ├── icons/               # App icons
│   └── tauri.conf.json      # Desktop app config
├── supabase/                 # Backend (PostgreSQL + Edge Functions)
│   ├── migrations/           # SQL migration files (numbered, timestamped)
│   ├── functions/            # Edge functions (TypeScript)
│   └── config.toml          # Supabase local dev config
├── .eslintrc.js             # ESLint config (FSD boundaries, i18next/no-literal-string)
├── .prettierrc               # Prettier formatting rules
├── eslint.config.js         # ESLint flat config
├── playwright.config.ts     # Playwright E2E config
├── tsconfig.json            # TypeScript config (strict mode, exactOptionalPropertyTypes)
├── vite.config.ts           # Vite build config
├── package.json             # Dependencies + scripts
├── CLAUDE.md                # Claude Code project instructions (this file)
├── FSD-STRUCTURE.md         # Detailed FSD layer patterns
├── DOMAIN-CONTRACTS.md      # Entity model contracts
├── SUPABASE-CONTRACTS.md    # Supabase API/RPC contracts
└── README.md                # Getting started guide
```

## Directory Purposes

**`.agents/` (Orchestration):**
- Purpose: GSD phase orchestration and planning
- Contains: Skill definitions for `/gsd-plan-phase`, `/gsd-execute-phase`, etc
- Key files: `skills/SKILL.md`, `rules/`, `definitions/`

**`.planning/` (Project State):**
- Purpose: Centralized project roadmap, state, and decision history
- Contains: `STATE.md` (current phase), `ROADMAP.md`, `PROJECT.md`, phase docs
- Key files:
  - `.planning/STATE.md` — Current phase, blockers, UAT status
  - `.planning/ROADMAP.md` — Milestones 1–N with feature list
  - `.planning/codebase/` — Maps (ARCHITECTURE.md, STACK.md, etc)
  - `.planning/audits/` — Cross-phase audits, gap closure notes
  - `.planning/decisions/` — ADRs (Architecture Decision Records)

**`e2e/` (Playwright Test Suite):**
- Purpose: Automated end-to-end testing via Playwright
- Contains: 61 test spec files covering all user journeys
- Key files:
  - `e2e/helpers/auth.ts` — Login utility (loginAs(page, 'admin'))
  - `e2e/visual/` — Visual regression golden images
  - `e2e/*.spec.ts` — Test files (01-ci, 02-caja, 03-tab-order, etc)
- Run: `npm run test:e2e` (requires dev server running)

**`src/app/` (App Layer — Bootstrap):**
- Purpose: Root component, routing, providers, global setup
- Contains: React root, route definitions, auth guards, realtime listeners
- Key files:
  - `App.tsx` — Root component (ErrorBoundary → AppConfigProvider → Providers → Router)
  - `router.tsx` — React Router v6 route definitions, lazy page imports
  - `providers.tsx` — TanStack Query + Zustand + auth setup
  - `ProtectedRoute.tsx` — Auth guard wrapper (redirect to /login if not authenticated)
  - `CajaListener.tsx`, `PoolRealtimeListener.tsx`, `WaitlistRealtimeListener.tsx` — Realtime subscription components
  - `OfflineQueueProcessor.tsx` — Replay queued mutations on reconnect
  - `AppConfigProvider.tsx` — App-wide config (terminal ID, receipt settings)
  - `globals.css` — Global styles (Tailwind, CSS variables, dark mode)

**`src/pages/` (Pages Layer — Route Containers):**
- Purpose: Thin route containers; one per route
- Pattern: Each folder exports a default component (lazy-loaded)
- Folders (one per route):
  - `pages/home/` — HomePage (dashboard, big-box nav)
  - `pages/pos/` — PosPage (order entry + cart)
  - `pages/pool-tables/` — PoolTablesPage (grid of pool tables)
  - `pages/pool-table-status/` — TableStatusPage (single table detail)
  - `pages/inventory/` — InventoryPage (stock management)
  - `pages/staff/` — StaffPage (staff roster + roles)
  - `pages/reports/` — ReportsPage (operational reports)
  - `pages/settings/` — SettingsPage (receipt + hardware config)
  - `pages/kds/` — KdsPage (kitchen KDS board)
  - `pages/kds-bar/` — KdsBarPage (bar KDS board)
  - `pages/audit/` — AuditPage (audit log)
  - `pages/login/` — LoginPage (PIN login)
  - And 11 more...
- Convention: Default export is the page component; Storybook stories optional

**`src/widgets/` (Widgets Layer — Composite Panels):**
- Purpose: Multi-component operational panels
- Pattern: Each folder is one widget; exports 1+ components
- Examples:
  - `widgets/OrderPanel/` — Cart + product grid (exports CartPanel, ActiveTabSelector)
  - `widgets/PaymentModal/` — Payment entry dialog
  - `widgets/KdsBoard/` — Kitchen display system board
  - `widgets/PoolTableGrid/` — Grid of pool tables with timers
  - `widgets/TabDrawer/` — Tab selector drawer
  - `widgets/CajaDashboard/` — Caja session dashboard
  - `widgets/StaffDashboard/` — Staff roster + management
  - `widgets/SettingsTabsPanel/` — Settings tabs UI
  - And 20+ more operational panels
- Convention: No business logic; composes features + entities

**`src/features/` (Features Layer — User Actions):**
- Purpose: One user-facing action per folder
- Pattern: Each folder exports 1 custom hook (the mutation) + optionally 1 UI component
- Examples:
  - `features/add-item-to-tab/` — useAddItemToTab() hook + ModifierSheet UI
  - `features/close-tab/` — useCloseTab() hook
  - `features/process-payment/` — useProcessPayment() hook
  - `features/open-tab/` — useOpenTab() hook
  - `features/void-order/` — useVoidOrder() hook
  - `features/split-tab/` — useSplitTab() hook (4 split modes)
  - `features/process-refund/` — useProcessRefund() hook + RefundSheet
  - `features/manager-pin-gate/` — useManagerPinGate() hook + ManagerPinDialog
  - And 40+ more user actions
- Convention: Hook returns `{ doAction, isLoading, error }` or similar
- Pattern: Hook calls `supabaseQuery()` + invalidates TanStack Query on success

**`src/entities/` (Entities Layer — Domain Models):**
- Purpose: Business domain entities (Tab, Product, Staff, Payment, etc)
- Pattern: Each entity has a folder with `model/` and `ui/` subdirectories
- Key entities:
  - `entities/tab/` — Orders and tab lifecycle
    - `model/store.ts` — Zustand store for UI state + offline queue
    - `model/queries.ts` — TanStack Query hooks (useTab, useOpenTabs)
    - `model/types.ts` — Type re-exports from domain.ts
    - `ui/TabCard.tsx`, `TabDetail.tsx` — Tab entity UI components
  - `entities/product/` — Menu products
  - `entities/staff/` — Staff accounts + roles
  - `entities/payment/` — Payment records
  - `entities/inventory/` — Stock levels
  - `entities/caja/` — Cash register sessions
  - `entities/pool-tables/` — Pool table resources
  - And 15+ more domain entities
- Convention: No UI logic in model/; UI components in ui/
- Pattern: Queries use TanStack Query (caching, background refetch)

**`src/shared/lib/` (Shared Lib — Utilities):**
- Purpose: No business logic; utilities and infrastructure
- Key files:
  - **`domain.ts`** — Master Zod schemas (Tab, Product, Staff, Payment, Order, etc) — SINGLE SOURCE OF TRUTH
  - **`result.ts`** — Result<T, E> type + ok/err constructors + utilities + error codes
  - **`supabase.ts`** — Supabase client singleton + `supabaseQuery()` wrapper
  - **`rbac.ts`** — Role-based access control (UserRole enum, canPerformAction())
  - **`logger.ts`** — Structured logging (Logger instance)
  - **`i18n/`** — i18n setup (react-i18next, 10 namespaces, es-MX + en-US)
  - `domain-helpers.ts` — Helpers for domain types (groupOrderItems, etc)
  - `format.ts` — Formatting utilities (formatMoney, formatTime, etc)
  - `split-math.ts` — Bill-split calculations
  - `tip-distribution-math.ts` — Tip-split allocations
  - `depletion.ts` — Ingredient depletion calculations
  - `category-tree.ts` — Category hierarchy traversal
  - `useBarcodeScanner.ts` — Barcode scanner hook
  - `useAppUpdater.ts` — Tauri app auto-update hook
  - `useServerTimeDrift.ts` — Clock drift detection
  - `version-error.ts` — Optimistic locking error handling

**`src/shared/ui/` (Shared UI — Design System):**
- Purpose: Reusable UI primitives and components
- Contains:
  - **shadcn components** (generated, auto-imported): Button, Modal, Dialog, Input, Select, Table, Tabs, etc
  - **Custom components** (hand-written):
    - `POSButton.tsx` — POS-optimized button (larger touch targets, focus-visible ring)
    - `MoneyDisplay.tsx` — Formatted currency display with $ prefix
    - `MoneyInput.tsx` — Currency input with validation
    - `ConfirmDialog.tsx` — Confirmation modal with destructive variants
    - `StatusBadge.tsx` — Status pills (open, closed, pending, etc)
    - `DataTable.tsx` — Generic table component (sortable, filterable)
    - `PageContainer.tsx` — Page layout wrapper
    - `ProtectedAction.tsx` — RBAC-gated button/action component
  - **Custom directories**:
    - `CategoryTreePicker/` — Category hierarchy picker
    - `IngredientAutocomplete/` — Ingredient autocomplete
    - `PersonCard/` — Staff/user card display
    - `SubTabColumn/` — Split-tab column display
- Convention: All new primitives must have Storybook stories

**`src/test/` (Test Setup):**
- Purpose: Shared test utilities
- Contains: Vitest setup, React Testing Library helpers, fixtures

**`src/assets/` (Static Assets):**
- Purpose: Images, icons, logos
- Contains: Vite-imported assets

**`supabase/migrations/` (Database Schema):**
- Purpose: SQL schema migrations
- Convention: Numbered and timestamped (e.g., `20230101120000_initial_schema.sql`)
- Key tables:
  - `profiles` — Staff accounts + roles
  - `tabs` — Orders (with version field for optimistic locking)
  - `order_items` — Line items
  - `products` — Menu catalog
  - `pool_tables` — Pool table resources
  - `pool_sessions` — Pool session tracking
  - `payments` — Payment records
  - `inventory` — Stock levels
  - `caja_sessions` — Cash register sessions
  - `audit` — Audit log
  - And more...

**`supabase/functions/` (Edge Functions):**
- Purpose: Backend logic (RPCs, webhooks)
- Key functions:
  - `process_payment/` — Process tab payment atomically
  - `process_split_payment_atomic/` — Multi-method payment
  - `close_caja_session/` — End-of-day cash register close
  - And more...

## Key File Locations

**Entry Points:**
- `src/main.tsx` — React root (React DOM entry point)
- `src-tauri/src/main.rs` — Tauri desktop shell (Rust entry)
- `src/app/App.tsx` — Root React component
- `src/app/router.tsx` — Route definitions

**Configuration:**
- `tsconfig.json` — TypeScript config (strict mode, path aliases, exactOptionalPropertyTypes)
- `vite.config.ts` — Vite build config (dev server port 1420, Tauri integration)
- `playwright.config.ts` — Playwright test config (headless: false for local dev)
- `eslint.config.js` — ESLint rules (FSD boundaries, i18next/no-literal-string)
- `.prettierrc` — Prettier formatting
- `package.json` — Dependencies + npm scripts (test, build, lint, etc)

**Core Logic:**
- `src/shared/lib/domain.ts` — Master Zod schemas (types single source of truth)
- `src/shared/lib/result.ts` — Error handling (Result<T,E> type)
- `src/shared/lib/supabase.ts` — Database client + supabaseQuery() wrapper
- `src/shared/lib/rbac.ts` — Role-based access control

**State Management:**
- `src/entities/tab/model/store.ts` — Tab Zustand store (UI state + offline queue)
- `src/entities/staff/model/store.ts` — Staff Zustand store (auth state)
- `src/entities/caja/model/store.ts` — Caja Zustand store

**Queries (Server State):**
- `src/entities/tab/model/queries.ts` — Tab TanStack Query hooks
- `src/entities/product/model/queries.ts` — Product queries
- `src/entities/payment/model/queries.ts` — Payment queries
- And one per entity

**Authentication:**
- `src/app/ProtectedRoute.tsx` — Route guard
- `src/app/providers.tsx` — Auth state sync (Supabase → Zustand)
- `src/pages/login/` — PIN login page

**Testing:**
- `e2e/helpers/auth.ts` — E2E login helper (loginAs function)
- `e2e/visual/` — Visual regression golden images
- `e2e/*.spec.ts` — 61 Playwright specs
- `src/**/*.test.ts` / `src/**/*.test.tsx` — Vitest unit tests

## Naming Conventions

**Files:**
- Page components: `src/pages/{route}/index.tsx` (lazy-loaded)
- Feature hooks: `src/features/{action-name}/index.ts` (default export is the hook)
- Entity stores: `src/entities/{entity}/model/store.ts`
- Entity queries: `src/entities/{entity}/model/queries.ts`
- Entity types: `src/entities/{entity}/model/types.ts` (re-exports from domain.ts)
- Entity UI: `src/entities/{entity}/ui/{ComponentName}.tsx`
- Widgets: `src/widgets/{WidgetName}/index.ts` (exports all components)
- Unit tests: `{filename}.test.ts` or `{filename}.test.tsx` (co-located)
- E2E tests: `e2e/{number}-{name}.spec.ts` (numbered sequentially)
- Storybook: `{filename}.stories.tsx` (co-located with component)

**Variables:**
- camelCase for functions, variables, component props
- PascalCase for React components and types
- UPPER_SNAKE_CASE for constants (enums, fixed values)
- Prefixed hooks: `use*` (useTab, useAddItemToTab, useStaffStore)
- Store selectors: Arrow functions in render: `useTabStore(s => s.activeTabId)`

**Directories:**
- kebab-case for folder names: `add-item-to-tab`, `order-panel`, `pool-tables`
- One entity/feature per folder
- No plurals for single-entity folders (use `tab` not `tabs`, `product` not `products`)

**Types:**
- Always defined in `src/shared/lib/domain.ts` as Zod schemas
- Inferred with `z.infer<typeof Schema>` pattern
- Never defined in entity-level type files (those only re-export)
- Never defined as manual interfaces

## Where to Add New Code

**New Route/Page:**
1. Create `src/pages/{route-name}/index.tsx` — export default PageComponent
2. Add route to `src/app/router.tsx` — lazy(() => import(…))
3. Add to navbar/navigation in relevant widget

**New Feature (User Action):**
1. Create `src/features/{action-name}/index.ts` — export custom hook (e.g., useAddToCart)
2. Hook should:
   - Accept action parameters
   - Call `supabaseQuery()` with Supabase RPC/mutation
   - Invalidate TanStack Query on success
   - Return `{ doAction, isLoading, error }` or similar
3. Optional: add `ui/{Component}.tsx` if feature needs UI
4. Use in widgets or pages

**New Entity (Domain Model):**
1. Add Zod schema to `src/shared/lib/domain.ts`
2. Create `src/entities/{entity}/model/store.ts` — Zustand store if needs UI state
3. Create `src/entities/{entity}/model/queries.ts` — TanStack Query hooks for server data
4. Create `src/entities/{entity}/model/types.ts` — Re-export domain types
5. Create `src/entities/{entity}/ui/` — UI components (Cards, rows, detail panels)
6. Export from `src/entities/{entity}/index.ts`

**New Widget (Composite Panel):**
1. Create `src/widgets/{WidgetName}/index.ts`
2. Add sub-components in same folder (e.g., `CartPanel.tsx`, `ProductGrid.tsx`)
3. Compose features + entities
4. Export from index.ts
5. Use in pages

**New Shared Utility:**
1. Add to appropriate file in `src/shared/lib/`:
   - Domain type? → `domain.ts`
   - Error handling? → `result.ts`
   - Formatting? → `format.ts`
   - Math? → `{domain}-math.ts`
2. Export from barrel file if appropriate

**New UI Primitive:**
1. Create `src/shared/ui/{ComponentName}.tsx`
2. Add Storybook story: `src/shared/ui/{ComponentName}.stories.tsx`
3. Add unit tests (optional): `src/shared/ui/{ComponentName}.test.tsx`
4. Export from `src/shared/ui/index.ts` (if creating barrel)

**New Database Table:**
1. Create migration in `supabase/migrations/{timestamp}_description.sql`
2. Add Zod schema to `src/shared/lib/domain.ts`
3. Create entity folder in `src/entities/{entity}/`
4. Regenerate types: `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts`

**New E2E Test:**
1. Create `e2e/{number}-{description}.spec.ts` (number in sequence: 50, 51, 52…)
2. Use helpers from `e2e/helpers/` (auth, fixtures)
3. Use Playwright API (page.goto, page.click, page.fill, etc)
4. Assert with `expect()`
5. Add to `.planning/specs/e2e-test-checklist.md` if critical

## Special Directories

**`graphify-out/`:**
- Purpose: Knowledge graph output from `/graphify` skill
- Generated: Auto-updated via GSD mapper
- Committed: Yes (git-tracked)
- Use: Query via `graphify query "<question>"` for code navigation

**`e2e-results/`:**
- Purpose: Playwright test artifacts (videos, traces, HTML reports)
- Generated: On every `npm run test:e2e` run
- Committed: No (.gitignore)
- View: `npm run test:e2e:report` opens HTML report

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: `npm ci` or `npm install`
- Committed: No (.gitignore)
- Platform-specific: Yes (different for Windows vs Linux)

**`.planning/codebase/`:**
- Purpose: Codebase maps (architecture, structure, stack, conventions, testing, concerns)
- Generated: `/gsd-map-codebase` skill with `--focus {tech|arch|quality|concerns}`
- Committed: Yes
- Update: Regenerate when major code changes occur, or run manually

**`.husky/`:**
- Purpose: Git pre-commit hooks
- Committed: No (.gitignore on this project; hooks would run in CI)
- Note: Hooks inert locally (husky can't self-install from `bar-pos/` when git root is parent)

---

*Structure analysis: 2026-08-10*
