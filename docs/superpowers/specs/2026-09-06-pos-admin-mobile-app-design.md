# POS Admin Mobile App — Design Spec

Date: 2026-09-06 · Branch: `claude/pos-admin-mobile-app-c90538` · Location: `mobile-admin/`

## Purpose

A companion iOS/Android app for the store owner (admin) and managers of the supermarket POS.
It answers, from anywhere: *How is the store doing right now? Is the register open? Who is
working? What needs attention (low stock, near expiry, pending bank transfers)?* — and lets the
admin do the few actions that genuinely happen away from the counter.

It is **not** a second checkout terminal. Checkout, inventory adjustment, receiving, product
CRUD and settings stay on the desktop POS.

## Non-negotiables (from the user)

1. `main` is never touched. All work lives on this branch/worktree.
2. Nothing is deployed to the remote Supabase project. **The app uses only tables, RLS policies
   and RPCs that already exist** — zero migrations, zero edge functions. Dev/testing runs against
   the local Supabase stack (`127.0.0.1:54321`, reachable from the Android emulator as
   `10.0.2.2:54321`).
3. Decisions are made autonomously and non-destructively. Every judgment call is listed as a
   `Ruling` at the bottom.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Expo SDK (latest) + React Native + TypeScript strict | One codebase iOS+Android; same language/ecosystem as the desktop app; Expo Go / dev build works without Xcode on Windows |
| Navigation | `expo-router` (file-based, bottom tabs + stack) | Bundled with Expo default template |
| Server state | `@tanstack/react-query` v5 | Same as desktop; caching + pull-to-refresh |
| Backend | `@supabase/supabase-js` v2 | Same project, same RLS, same RPCs |
| Session storage | `expo-secure-store` (Keychain / Keystore) | Auth token never in plain AsyncStorage |
| Validation | `zod` | Every RPC/table row parsed at the trust boundary |
| Styling | `StyleSheet` + one `theme.ts` token file | No NativeWind/Tamagui — ponytail rung 4; keeps Metro config stock |
| Charts | Hand-rolled `View`-based bars (hourly, top products) | No chart lib; two chart types only |
| Realtime | One Supabase Realtime channel on `payments` | Dashboard auto-refreshes when a sale lands |

The mobile app has its own `package.json` and **does not import from `../src`** (different bundler,
different zod major, Tauri-flavoured `import.meta.env`). It carries lean copies of the row
schemas it needs in `mobile-admin/src/lib/schemas.ts`.

## Auth

- Login screen: **email + 4-digit PIN**. Same credential the desktop uses:
  `supabase.auth.signInWithPassword({ email, password: pin })`.
- After sign-in, read own `profiles` row. Only `admin` and `manager` roles may enter; cashier/kitchen
  get a friendly "this app is for managers" screen and are signed out.
- Session persisted in SecureStore; auto-refresh on. Sign out from the Settings tab.
- RBAC in the app mirrors `src/shared/lib/rbac.ts` for the two roles used: confirm/dispute bank
  transfer is manager+ (both roles), everything else read-only for both. No new actions invented.

## Information architecture (bottom tabs)

```
Today      Sales      Inventory      Team      More
```

### 1. Today (home)
- Header: store name (`settings.general.barName`), date, caja status pill (OPEN since 08:12 by
  Ana / CLOSED).
- KPI tiles: **Sales today** (sum of non-refund `payments.amount` since local midnight), **Tickets**
  (count of distinct `tab_id`), **Avg ticket**, **Refunds today**.
- "Needs attention" list, each row tappable:
  - Pending bank transfers (`bank_transfers.status='pending'`) → Bank transfers screen
  - Low stock (`inventory.quantity_on_hand <= low_stock_threshold`) → Inventory › Low stock
  - Near expiry (`inventory.expiry_date <= today + N`, N from `settings.near_expiry`, default 14) → Inventory › Near expiry
- On shift now: avatars/names of `shifts` with `clock_out IS NULL`.
- Last 5 sales (tab, time, total, method).
- Realtime: subscribe to `payments` INSERT → invalidate today queries.

### 2. Sales
- Range chips: Today · Yesterday · 7 days · 30 days · Custom (native date pickers).
- Summary: revenue, tickets, avg ticket, refunds.
- Payment methods: `get_payment_methods_report` — horizontal stacked bar + list.
- By hour: `get_peak_hours_report` — 24-bar chart, busiest hour highlighted.
- Top products: `get_product_sales_report` top 10 by revenue, with units + margin %.
- By category: `get_category_revenue_report`.
- **Transactions** sub-screen: paginated list of paid tabs (`tabs.status='paid'` joined to `payments`), search by ticket/customer; detail shows line items (`order_items` + `products.name`), payments, refunds.

### 3. Inventory (read-only)
- Segments: Low stock · Near expiry · Search.
- Low stock: product, on hand vs threshold, cost, sorted by deficit.
- Near expiry: product, expiry date, days left, on hand; red < 3 days, amber < 14.
- Search: by name/barcode/SKU; row → Product detail: price, cost, margin, stock, expiry,
  category, last 20 `stock_movements` with reason + staff name.

### 4. Team
- Now: open shifts with clock-in time and elapsed duration.
- Staff list: name, role, active flag, last clock-in.
- Staff detail: shift history (last 30) with hours, and sales attributed (`tabs.staff_id`) for the
  selected range.
- Caja sessions: current session (opening cash, entries in/out, expected cash) and history with
  closing difference (`closing_cash - expected`) colour-coded.

### 5. More
- **Bank transfers** (the one write feature): pending list → detail (amount, customer phone,
  created by, age) → **Confirm** (enter the code the customer gave; calls
  `confirm_transfer_payment(p_payment_id, p_entered_code)`) or **Dispute** (reason; calls
  `dispute_transfer_payment`). Confirmed/disputed history below.
- **Audit log**: last 100 `audit_logs` rows (action, entity, actor name, time), filter by entity.
- **Refunds**: `refunds` joined to payment + actor.
- **Settings**: signed-in user, role, store name, Supabase URL (dev only, editable — points at
  local stack by default), sign out.

## Data access rules

- All reads go through `useQuery` hooks in `src/features/<tab>/queries.ts`; each hook returns
  `Result<T>` (`ok/err` mirror of the desktop's `result.ts`) and Zod-parses rows.
- Money is displayed with `Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`.
- Dates: local device timezone; "today" = local midnight → now, sent as ISO to RPCs.
- Realtime: exactly one channel, torn down on sign-out.
- RLS is the authority. If a query is denied for a manager, the screen shows the error, it does not
  try a different path.

## Error handling

- Network offline → banner at top of every screen (NetInfo from `@react-native-community/netinfo`
  if already in the Expo template; otherwise Supabase error → "You're offline" banner). Queries
  retry on reconnect via React Query defaults.
- Auth expired → redirect to login.
- Confirm/dispute failures show the RPC's message inline; nothing is retried automatically (RPC is
  idempotent server-side but we do not assume).

## Testing

- Unit (Jest via `jest-expo`): schema parsing, money/date helpers, KPI aggregation, RBAC gate.
- Device: Android emulator (API 35, x86_64) driven by the `mobile` MCP — login, each tab renders
  data from the local Supabase seed, confirm-transfer happy path.
- iOS: cannot run a simulator on Windows (Xcode/macOS only). Verified path is Expo Go on a
  physical iPhone scanning the dev-server QR; EAS Build can produce an `.ipa` from Windows.

## Out of scope (v1)

Push notifications (needs a server), checkout, inventory edits, receiving, product/promotion
CRUD, staff role edits, settings edits, offline write queue, biometric unlock, dark/light toggle
(dark only, matching the desktop default).

## Rulings

- R1 Expo over bare RN / Flutter / Kotlin+Swift: single TS codebase, no Xcode needed to develop on
  Windows, shares mental model with the desktop app.
- R2 No shared package with `../src`: avoids Metro/Vite/zod-version coupling; the mobile schemas
  are a strict subset and are marked as such.
- R3 Login is email + PIN (not staff-picker + PIN like the desktop): avoids listing all staff
  pre-auth on a device that leaves the store.
- R4 Only write action is bank-transfer confirm/dispute: it is the one manager action that
  naturally happens on a phone (checking the bank app), has an existing audited RPC, and is safe.
- R5 Read-only inventory/team/caja: adjustments and edits need the audit context and PIN gates the
  desktop already provides; duplicating them adds risk, not value.
- R6 Dark theme only, colours lifted from the desktop's Counter design tokens for brand continuity.
- R7 Dev target is the local Supabase stack; the remote project's URL/anon key are never written
  into the repo. The Settings screen shows the server read-only; switching is an `.env` edit
  (a runtime-editable URL would require re-creating the Supabase client — not worth it for v1).
- R8 Session storage is AsyncStorage, not SecureStore: Supabase's session JSON exceeds
  SecureStore's 2 KB per-key limit on Android. Upgrade path: LargeSecureStore (AES key in
  SecureStore, ciphertext in AsyncStorage) if a security review asks for it.
- R9 UI copy is English with en-US date/time formatting; money stays es-MX/MXN. The desktop
  defaults to es-MX; the owner reads English and this is a one-person admin tool.
- R10 Status semantics learned from live data, not the spec's assumptions: a completed direct
  sale leaves `tabs.status='closed'` (`'paid'` is legacy); `payments.status` is only ever
  `'completed'` or `'reopened_void'` (DB CHECK); a pending/disputed bank transfer is
  `bank_transfers.status` on a `'completed'` payment. Revenue therefore counts completed
  payments including not-yet-confirmed transfers, matching the desktop caja report, and the
  Today screen surfaces the pending-transfer count separately.
- R11 No custom date range in v1 (Today/Yesterday/7d/30d chips only) — avoids a date-picker
  dependency; add `@react-native-community/datetimepicker` when someone asks.
- R12 The Expo template's `NativeTabs` (unstable) was replaced with the stable `Tabs` from
  expo-router; the template's example screens, hooks and CSS were deleted.
