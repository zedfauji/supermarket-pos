<!-- refreshed: 2026-08-10 -->
# Architecture

**Analysis Date:** 2026-08-10

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    React 19 Application                             │
│                      Tauri 2 Desktop Shell                          │
├────────────────┬───────────────────────────────────────────────────┤
│ App Layer      │ App.tsx → Providers → Router (React Router v6)    │
│ `src/app/`     │ • ErrorBoundary wraps entire tree                 │
│                │ • TanStack Query + Zustand setup                  │
│                │ • Authentication + Realtime listeners init        │
├────────────────┼───────────────────────────────────────────────────┤
│ Pages Layer    │ Route-matched page containers (thin, no logic)    │
│ `src/pages/`   │ Composes widgets + features for each route        │
│                │ Owns page-level state + navigation                │
├────────────────┼───────────────────────────────────────────────────┤
│ Widgets Layer  │ Composite UI panels (OrderPanel, KdsBoard, etc)   │
│ `src/widgets/` │ Composes features + entities into operational     │
│                │ surfaces (PaymentModal, PoolTableGrid, etc)       │
├────────────────┼───────────────────────────────────────────────────┤
│ Features Layer │ One action per folder: useCloseTab, useAddItem    │
│ `src/features/`│ Exports 1 mutation hook + 1 UI component          │
│                │ Handles RPC calls, optimistic updates, errors     │
├────────────────┼───────────────────────────────────────────────────┤
│ Entities Layer │ Domain models: Tab, Product, Staff, Payment       │
│ `src/entities/`│ Each has model/ (store, queries, types) + ui/     │
│                │ Zustand stores + TanStack Query hooks             │
├────────────────┼───────────────────────────────────────────────────┤
│ Shared Layer   │ Zero business logic                               │
│ `src/shared/`  │ • `lib/domain.ts` — single source of truth (Zod)  │
│                │ • `lib/result.ts` — Result<T,E> error handling    │
│                │ • `ui/` — shadcn components + custom primitives   │
│                │ • Config + utilities                              │
└────────────────┴───────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    Data Layer (Supabase)                            │
│  PostgreSQL + Auth + Realtime + RLS + Edge Functions               │
│  `supabase/migrations/`, `supabase/functions/`                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App | Root component, ErrorBoundary, provider setup | `src/app/App.tsx` |
| Providers | TanStack Query, Zustand stores, auth state, listeners | `src/app/providers.tsx` |
| Router | React Router v6 setup, lazy-loaded pages, route guards | `src/app/router.tsx` |
| ProtectedRoute | Auth guard wrapping protected routes | `src/app/ProtectedRoute.tsx` |
| Realtime Listeners | Zustand subscriptions to Supabase Realtime | `src/app/CajaListener.tsx`, `src/app/PoolRealtimeListener.tsx`, `src/app/WaitlistRealtimeListener.tsx` |
| OfflineQueueProcessor | Replay queued mutations on reconnect | `src/app/OfflineQueueProcessor.tsx` |
| Pages | Route containers; compose widgets + features | `src/pages/{route}/index.tsx` |
| Widgets | Composite panels (OrderPanel, PaymentModal, KdsBoard) | `src/widgets/{Widget}/index.ts` |
| Features | Mutation hooks + UI components (one per action) | `src/features/{action-name}/index.ts` |
| Entities | Domain models (Tab, Product, Staff, etc) | `src/entities/{entity}/model/`, `src/entities/{entity}/ui/` |
| Shared Lib | Utilities, validation, error handling, logging | `src/shared/lib/` |
| Shared UI | Design system components (Button, Badge, Modal) | `src/shared/ui/` |
| Supabase | Database, auth, realtime subscriptions, edge functions | `supabase/migrations/`, `supabase/functions/` |

## Pattern Overview

**Overall:** Feature-Sliced Design (FSD) with strict enforcement via `eslint-plugin-boundaries`. Import direction is strictly downward-only: `app → pages → widgets → features → entities → shared`.

**Key Characteristics:**
- Single source of truth for domain types in `src/shared/lib/domain.ts` (all Zod schemas)
- Error handling via `Result<T, E>` type — every async operation returns this, forcing explicit error checks
- State split: Zustand for UI/local state + Realtime subscriptions, TanStack Query for server state
- Mutations always go through feature hooks (custom hooks, not bare tanstack calls)
- All Supabase queries wrapped in `supabaseQuery()` helper for error normalization
- Version-based optimistic locking for tabs (bump_version_on_update trigger)

## Layers

**App Layer:**
- Purpose: Bootstrap the entire application — providers, routing, global setup
- Location: `src/app/`
- Contains: Root component (App.tsx), route definitions, auth guards, realtime listeners, offline queue processor
- Depends on: All other layers (providers inject all singletons)
- Used by: Nothing (top layer)

**Pages Layer:**
- Purpose: Route containers — one page per route, thin with no business logic
- Location: `src/pages/{route}/`
- Contains: Page component (usually default export), Storybook stories
- Depends on: Widgets, Features, Entities (to read data + dispatch mutations)
- Used by: Router (app layer)

**Widgets Layer:**
- Purpose: Composite operational panels composing 2+ features or entities
- Location: `src/widgets/{PanelName}/`
- Contains: Panel component, sub-components, Storybook stories
- Depends on: Features (for mutations), Entities (for data + UI), Shared UI
- Used by: Pages, other Widgets

**Features Layer:**
- Purpose: Encapsulate one user-facing action (e.g., add item, close tab, process payment)
- Location: `src/features/{action-name}/`
- Contains: Custom hook (the "mutation" — usually default export), optional UI component
- Depends on: Entities (to read/update domain state), Shared (utils + Result + Supabase client)
- Used by: Widgets, Pages
- Pattern: Each folder exports one hook (`useAddItemToTab`, `useCloseTab`, etc)

**Entities Layer:**
- Purpose: Domain business models (Tab, Product, Staff, Inventory, etc)
- Location: `src/entities/{entity}/model/` + `src/entities/{entity}/ui/`
- Contains:
  - `model/store.ts` — Zustand store for UI state + Realtime subscriptions
  - `model/queries.ts` — TanStack Query hooks for server data
  - `model/types.ts` — Type re-exports from domain.ts
  - `ui/` — Entity cards/rows (TabCard, ProductCard, StaffRow)
- Depends on: Shared (domain types, utils, UI primitives)
- Used by: Features, Widgets, Pages

**Shared Layer:**
- Purpose: No business logic; utilities and primitives
- Location: `src/shared/`
- Contains:
  - `lib/domain.ts` — Master Zod schemas (Tab, Product, Staff, Payment, etc) — **single source of truth**
  - `lib/result.ts` — Result<T, E> type + error constructors + utilities
  - `lib/supabase.ts` — Supabase client singleton + supabaseQuery() wrapper
  - `lib/rbac.ts` — Role-based access control constants + canPerformAction()
  - `lib/logger.ts` — Structured logging
  - `lib/i18n/` — i18n setup (react-i18next with 10 namespaces)
  - `ui/` — shadcn components (Button, Modal, Table) + custom primitives (POSButton, MoneyDisplay, ConfirmDialog)
  - Utilities: formatting, math (billing, split, tip distribution), validation
- Depends on: Nothing (bottom layer)
- Used by: All layers

## Data Flow

### Primary Request Path (e.g., Adding Item to Tab)

1. **User clicks "Add Item"** → ProductGrid component (`src/widgets/OrderPanel/ProductGrid.tsx`)
2. **ModifierSheet pops** → `useAddItemToTab()` hook from `src/features/add-item-to-tab/index.ts`
3. **Hook calls mutation**:
   - Calls `supabaseQuery()` → wraps Supabase RPC call `add_item_to_tab` with error handling
   - Returns `Result<void, AppError>`
4. **Optimistic update**:
   - Hook calls `cartStore.addItem()` (Zustand local state)
   - UI updates immediately
5. **Server response arrives**:
   - `supabaseQuery()` either returns `ok(data)` or `err(error)`
   - Feature hook checks `result.ok` and either:
     - Toasts success, invalidates TanStack Query `tabKeys`
     - Toasts error, optionally reverts Zustand state
6. **TanStack Query refetch**:
   - `queryClient.invalidateQueries()` triggers refetch of `useTab(activeTabId)`
   - Store subscription refreshes from database
7. **Component re-renders** with fresh data

### Tab Lifecycle (Open → Close → Pay → Paid)

1. **Open Tab** → `useOpenTab()` hook
   - Calls `create_tab` RPC
   - Zustand `openTab()` adds to store
   - TanStack Query invalidates
2. **Add Items** → `useAddItemToTab()` hook per item
   - Each updates cart store + server
3. **Close Tab** → `useCloseTab()` hook
   - Fetches tab version (versioning constraint)
   - UPDATEs tab.status = 'closed' with version bump
   - Clears cart selection
4. **Process Payment** → `useProcessPayment()` edge function
   - Calls `process_payment` edge function with payment details
   - Edge function atomically inserts Payment row + updates tab.status = 'paid'
   - TanStack Query refreshes tabs
5. **Tab History** → `useTab(tabId)` query reads from cache

### State Management Patterns

**Zustand Stores** (UI + offline state):
- `tabStore` — activeTabId, selectedTabId, offlineQueue, tab drawer state
- `cartStore` — items being added in current cart session (temporary)
- `staffStore` — currentStaff, isAuthenticated, permissions
- `cajaStore` — currentCajaSession, isCajaOpen

Stores are populated via:
- Manual actions: `store.setActiveTab(id)`, `store.openTab(tab)`
- Realtime subscriptions: `CajaListener`, `PoolRealtimeListener`, etc subscribe to Supabase Realtime and call `store.handleRealtimeUpdate()`

**TanStack Query** (server state):
- Query hooks live in `entities/{entity}/model/queries.ts`
- Example: `useTab(tabId)` fetches from Supabase, caches, auto-refetches on stale
- Mutations are NOT in TanStack (they're in features), but mutations invalidate queries
- Offline mode: networkMode: 'offlineFirst' allows reads from stale cache while offline

**Offline Queue** (`tabStore.offlineQueue`):
- When offline, `useOpenTab()`, `useAddItemToTab()`, etc push `{ actionType, tabId, ... }` to queue
- `OfflineQueueProcessor` subscribes to online status and replays on reconnect
- Each queued action carries an `expectedVersion` to drop stale actions

## Key Abstractions

**Result<T, E>:**
- Purpose: Explicit error handling; every async operation returns this
- Examples: `src/features/close-tab/index.ts`, `src/features/process-payment/index.ts`
- Pattern: `const result = await mutation(); if (!result.ok) { handle error } else { use result.data }`

**AppError:**
- Purpose: Unified error type with code + message
- Codes: `NETWORK_OFFLINE`, `AUTH_REQUIRED`, `VALIDATION_ERROR`, `TAB_ALREADY_CLOSED`, `STALE_VERSION`, etc
- Example: `{ code: 'VALIDATION_ERROR', message: 'Invalid item quantity' }`

**Zod Schemas (domain.ts):**
- Purpose: Single source of truth for all domain types
- Example: `TabSchema`, `OrderSchema`, `PaymentSchema`, `ProductSchema`
- Every entity type is inferred from Zod: `type Tab = z.infer<typeof TabSchema>`

**Zustand Store Pattern:**
- Setup: `export const useTabStore = create<State & Actions>()(persist(...))`
- Reads: Hook call inside component: `const activeTabId = useTabStore(s => s.activeTabId)`
- Writes: Call store action: `useTabStore.getState().setActiveTab(id)`
- Realtime: Listener component calls `store.handleRealtimeUpdate(payload)` on subscription message

**Feature Hook Pattern:**
- Exports: One custom hook + optionally one UI component
- Hook returns: `{ doAction, isLoading, error }`
- Example: `useCloseTab()` returns `{ closeTab, isClosing }`

## Entry Points

**Web/Browser Entry:**
- Location: `src/main.tsx`
- Initializes: React root, loads i18n, renders App
- Sequence: main.tsx → App.tsx → ErrorBoundary → AppConfigProvider → Providers → Router

**Tauri Desktop Entry:**
- Location: `src-tauri/src/main.rs` (Rust side)
- Sequence: Rust main → Vite dev server or production build → main.tsx
- Tauri IPC: Available via `@tauri-apps/api` (used for app updates, window control, file dialogs)

**Route Entry Points:**
- `/login` — LoginPage (public)
- `/home` — HomePage (protected)
- `/pos` — PosPage (protected)
- `/pool-tables` — PoolTablesPage (protected)
- `/pool-tables/:tableId` — TableStatusPage (protected)
- `/inventory` — InventoryPage (protected, manager+)
- `/staff` — StaffPage (protected, manager+)
- `/reports` — ReportsPage (protected, manager+, wrapped in ReportsRoute gate)
- `/settings` — SettingsPage (protected)
- `/kds` — KdsPage (protected, kitchen+, wrapped in KdsRoute gate)
- `/kds-bar` — KdsBarPage (protected, bartender+, wrapped in KdsBarRoute gate)
- `/audit` — AuditPage (protected, admin, wrapped in AuditRoute gate)

**Authentication:**
- Supabase auth session checked in `providers.tsx` via `supabase.auth.onAuthStateChange()`
- Session persisted in `useStaffStore` (Zustand)
- Protected routes guarded by `<ProtectedRoute>` wrapper

## Architectural Constraints

- **Threading:** Single-threaded event loop (React + browser JavaScript). Async/await for I/O.
- **Global state:** Three Zustand stores are module-level singletons: `useTabStore`, `useStaffStore`, `useCartStore`, `useCajaStore`. Initialization happens once in `Providers.tsx`. Persisted stores survive page reloads.
- **Circular imports:** None detected. FSD layer isolation prevents cycles.
- **Import boundaries:** ESLint enforces one-way: `app → pages → widgets → features → entities → shared`. A boundary violation is a hard lint error.
- **Versioning:** Tabs use optimistic locking via `version` column + `bump_version_on_update` trigger. Every tab UPDATE must increment version and match current version, else `STALE_VERSION` error.
- **Realtime subscriptions:** Initialized in entity stores (not components). Subscription created once, unsubscribed on store cleanup. Handled via `CajaListener`, `PoolRealtimeListener`, `WaitlistRealtimeListener` in app layer.
- **Offline mode:** `OfflineQueueProcessor` watches online status; queues mutations while offline, replays on reconnect. Some queries fall back to stale cache.
- **React Strict Mode:** Enabled in production (no effect). Double-invokes effects to detect issues.

## Anti-Patterns

### Async Mutation Without Result Wrapper

**What happens:** A feature hook calls Supabase directly without checking the response:
```typescript
const { data } = await supabase.from('tabs').select('*')
// data could be null, error exists on the response but is ignored
```

**Why it's wrong:** Silent failures; errors get swallowed; UI doesn't know what went wrong.

**Do this instead:** Wrap all Supabase calls in `supabaseQuery()` helper from `src/shared/lib/result.ts`:
```typescript
const result = await supabaseQuery(() =>
  supabase.from('tabs').select('*')
)
if (!result.ok) {
  toast.error(result.error.message)
  return result
}
const data = result.data
```

### Defining Entity Types Outside domain.ts

**What happens:** A component or entity defines its own type interface:
```typescript
interface Tab {
  id: string
  name: string
}
// elsewhere, a different Tab type with different fields exists
```

**Why it's wrong:** Multiple conflicting definitions; schema validation disconnected from types; Zod validation is bypassed.

**Do this instead:** Define once in `src/shared/lib/domain.ts` as a Zod schema:
```typescript
export const TabSchema = z.object({
  id: UuidSchema,
  name: z.string(),
})
export type Tab = z.infer<typeof TabSchema>
```
Then import: `import { Tab, TabSchema } from '@shared/lib/domain'`

### Feature Hook Without TanStack Query Invalidation

**What happens:** A feature mutation succeeds but doesn't invalidate the query cache:
```typescript
await supabaseQuery(() =>
  supabase.from('tabs').update({ status: 'closed' }).eq('id', tabId)
)
toast.success('Closed')
// UI still shows stale data; doesn't refetch
```

**Why it's wrong:** UI becomes inconsistent with server; user sees out-of-date information.

**Do this instead:** Invalidate the query key after mutation:
```typescript
const result = await mutation()
if (result.ok) {
  await queryClient.invalidateQueries({ queryKey: tabKeys.all })
  toast.success('Closed')
}
```

### Zustand Store Writes Inside Component Render

**What happens:** A component calls `store.setState()` during render:
```typescript
export function MyComponent() {
  const store = useTabStore()
  // ❌ BAD: This runs on every render
  store.setActiveTab('123')
  return <div>...</div>
}
```

**Why it's wrong:** Infinite loops; race conditions; store writes become unpredictable.

**Do this instead:** Use effects or event handlers:
```typescript
export function MyComponent() {
  const setActiveTab = useTabStore(s => s.setActiveTab)
  useEffect(() => {
    setActiveTab('123')
  }, [])
  return <div>...</div>
}
```

### Hardcoded Supabase Service Role in Frontend

**What happens:** A component imports and uses the service role key:
```typescript
import { SUPABASE_SERVICE_ROLE_KEY } from '@shared/lib/env'
const admin = createClient(url, SUPABASE_SERVICE_ROLE_KEY)
```

**Why it's wrong:** Service role bypasses all RLS; any leaked key compromises the entire database.

**Do this instead:** Use the anon key (with RLS enforced):
```typescript
const client = createClient(url, SUPABASE_ANON_KEY)
// All queries are RLS-protected by user's auth token
```
For admin operations, call an edge function that uses the service role server-side.

---

*Architecture analysis: 2026-08-10*
