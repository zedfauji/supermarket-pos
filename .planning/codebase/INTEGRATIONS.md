# External Integrations

**Analysis Date:** 2026-08-10

## APIs & External Services

**Payment Processing:**
- Stripe - Not integrated; cash/card payment processed via custom edge functions (`process-payment`, `process-split-payment`)
- BBVA Card - Payment method supported but no SDK integration; processed server-side
- Cash - Payment method (no external integration)

**Delivery Orders:**
- Rappi - Delivery order integration
  - SDK/Client: `@supabase/supabase-js` for webhook ingestion
  - Endpoints: Webhook incoming at `supabase/functions/rappi-webhook/index.ts`, sync outgoing via `rappi-sync-menu` edge function
  - Webhook verification: `VITE_RAPPI_WEBHOOK_SECRET` env var
  - Data: `rappi_orders` table, line items mapped to products via `RAPPI_LINE_ITEM_PRODUCT_ID`

**Messaging & Notifications:**
- Wasender (WhatsApp API) - Send WhatsApp notifications to waitlist parties
  - SDK/Client: Direct HTTP POST to `https://www.wasenderapi.com/api/send-message`
  - Auth: `WASENDER_API_KEY` bearer token (via edge function `send-waitlist-notification`)
  - Usage: Triggered when staff notifies a waitlist entry with phone number
  - Fallback: Manager desktop notification if no phone or API key missing
  - Implementation: `supabase/functions/send-waitlist-notification/index.ts`

**Email:**
- Resend - Send receipt emails
  - SDK/Client: Direct HTTP POST to `https://api.resend.com/emails`
  - Auth: `RESEND_API_KEY` bearer token (via edge function `send-receipt-email`)
  - Configuration: `RECEIPT_FROM_EMAIL` env var
  - Usage: Called from client via edge function when user requests receipt email
  - Implementation: `supabase/functions/send-receipt-email/index.ts`

**AI Integration:**
- Anthropic Claude API - Agent integration for diagnostics/code analysis
  - SDK/Client: `@anthropic-ai/sdk` v0.91.1
  - Usage: Opt-in diagnostic agent tools (`src/shared/lib/agent/`)
  - Auth: API key passed to agent runtime

## Data Storage

**Databases:**
- **Supabase PostgreSQL** (remote, managed)
  - Primary backend: all business data (tabs, orders, payments, staff, inventory, pool tables, caja sessions)
  - Connection: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (client-side, RLS enforced)
  - Client: `@supabase/supabase-js` (JavaScript) + Deno Supabase client (Edge Functions)
  - Auth: Supabase Auth with PostgreSQL RLS policies
  - Migrations: Located in `supabase/migrations/` directory
  - Schema: Generated types via `supabase gen types typescript` → `src/shared/lib/supabase.types.ts`

- **Local SQLite** (Tauri plugin, desktop only)
  - Not currently active; `@tauri-apps/plugin-sql` v2.4.0 is installed but rarely used
  - Purpose: Future offline-first local caching layer (not implemented as of Phase 25)

**File Storage:**
- Local filesystem only - No cloud storage integration (AWS S3, Google Cloud Storage, etc.)
- Tauri `@tauri-apps/plugin-fs` v2.5.0 for file access (dialog, read, write on desktop)
- Receipt PDFs generated in-memory, not persisted to disk

**Caching:**
- Client-side only via TanStack Query v5
  - No Redis or Memcached
  - Zustand stores cache Realtime subscription state
  - Offline queue via Zustand: `tabsStore.offlineQueue` (replayed on reconnect)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (custom, built on PostgreSQL + JWT)
  - Implementation: PIN-based login (staff enters email + PIN, signed in via `supabase.auth.signInWithPassword()`)
  - Session persistence: localStorage (via supabase-js built-in)
  - JWT validation: RLS policies on all tables enforce user context
  - Token refresh: Automatic via supabase-js `autoRefreshToken: true`
  - Admin operations: Service role key only (never in renderer; dev scripts only via `SUPABASE_SERVICE_ROLE_KEY`)

**RBAC:**
- Database-level: RLS policies on `profiles` role field
- Application-level: `src/shared/lib/rbac.ts` defines actions (`create_order`, `close_tab`, `adjust_inventory`, etc.)
- Roles: `bartender < manager < admin` (hierarchy enforced in app logic)
- PIN-gated actions: Manager/admin actions require PIN re-entry via `ManagerPinDialog`

## Monitoring & Observability

**Error Tracking:**
- None integrated (Sentry, Rollbar, etc. not used)
- Client-side: `src/shared/lib/logger.ts` captures errors, warnings, info, debug
- Error boundaries: `react-error-boundary` wraps components to prevent white screens
- Telemetry: `src/shared/lib/telemetry.ts` (disabled in production by default)

**Logs:**
- Client-side structured logging to browser console
  - Logger: `src/shared/lib/logger-instance.ts` (singleton)
  - Levels: error, warn, info, debug
  - Context: Terminal ID, app version, user, action
- Server-side: Supabase Edge Function logs (visible via `supabase functions list` and logs viewer in dashboard)
- Audit log table: `audit_logs` captures all sensitive operations (orders, payments, refunds, staff changes)

## CI/CD & Deployment

**Hosting:**
- Desktop app: Shipped via GitHub Releases + auto-updater
- Backend: Supabase Cloud (managed PostgreSQL, Auth, Edge Functions)
- Edge Functions: Deployed to Supabase via `supabase functions deploy <function-name>`

**CI Pipeline:**
- GitHub Actions (not visible in this repo scan; likely in `.github/workflows/`)
- Tauri build job: Builds Windows .msi and macOS .dmg, signs, publishes to Releases
- E2E tests: Run manually before releases (Playwright, 61 specs)
- No automated PR checks visible (lint, typecheck, unit tests run locally)

**Release Process:**
- Manual: Developer runs Tauri build on Windows for signed .msi
- GitHub Releases: Artifact uploaded with `latest.json` for auto-updater
- Updater config: `src-tauri/tauri.conf.json` points to `https://github.com/zedfauji/bola8pos/releases/latest/download/latest.json`
- Public key in tauri.conf for signature verification

## Environment Configuration

**Required env vars (runtime, client-side):**
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key (for RLS as authenticated user)

**Optional env vars (runtime, client-side):**
- `VITE_TERMINAL_ID` - POS terminal identifier (defaults to 'POS-1')
- `VITE_APP_VERSION` - App version for logging (defaults to '0.0.0')
- `VITE_RAPPI_WEBHOOK_SECRET` - Webhook signature verification for Rappi

**Server-only env vars (never in renderer, dev scripts only):**
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin DB access
- `WASENDER_API_KEY` - WhatsApp API key (set via `supabase secrets set`)
- `RESEND_API_KEY` - Email API key (set via `supabase secrets set`)

**Secrets location:**
- Local dev: `.env.local` (gitignored; never committed)
- Supabase Edge Functions: `supabase secrets set KEY=value` (stored in Supabase vault)
- GitHub Actions: Repository secrets (for release signing)
- Tauri auto-updater public key: Hardcoded in `src-tauri/tauri.conf.json` (not sensitive)

## Webhooks & Callbacks

**Incoming:**
- Rappi webhook: `POST /functions/v1/rappi-webhook` (Supabase Edge Function)
  - Payload: Delivery order JSON with items, customer, total
  - Validation: `VITE_RAPPI_WEBHOOK_SECRET` signature verification (Zod schema: `RappiWebhookBodySchema`)
  - Processing: Parsed into `rappi_orders` table, triggers order creation via `create_order_with_items` RPC

**Outgoing:**
- Rappi sync: Periodic `rappi-sync-menu` edge function polls/syncs menu categories and products to Rappi
  - Trigger: Manual via app menu or scheduled (not clear from code scan)
  - Direction: Unidirectional → Rappi (one-way sync)
- Waitlist notifications: Triggered by `notify-waitlist` feature, calls `send-waitlist-notification` edge function
  - Direction: Outbound to WhatsApp (Wasender API)
- Receipts: User-initiated email via `send-receipt-email` edge function
  - Direction: Outbound to Resend → recipient email

**Supabase Realtime (bidirectional subscriptions):**
- Pool tables: `pool_tables_changes` channel (initialized in `src/entities/pool-table/model/store.ts`)
- Waitlist: `waitlist_entries_changes` + `waitlist_notifications_changes` (via `WaitlistRealtimeListener`)
- Caja sessions: `caja_sessions_changes` (via `CajaListener`)
- Rappi orders: `rappi_orders_changes` (via `RappiRealtimeBridge`)
- Broadcast events: Manager notifications (e.g., `waitlist.notified` broadcast on `waitlist` channel)

## Data Contracts

**API Contracts:**
- Edge Functions: Request/response schemas defined in `src/shared/lib/edge-function-contracts.ts`
  - Examples: `processPaymentCall()`, `processSplitPaymentCall()`, `sendWaitlistNotificationCall()`
  - Each includes Zod schema validation, error handling, retry logic

**Database Contracts:**
- Supabase RPC calls: Defined in migration DDL files under `supabase/migrations/`
  - Examples: `create_order_with_items()`, `close_caja_session()`, `process_split_payment_atomic()`
  - Return types: Zod-inferred from response schemas

**Entity Types:**
- Single source of truth: `src/shared/lib/domain.ts` (Zod schemas for all domain objects)
- Generated: `src/shared/lib/supabase.types.ts` (via `supabase gen types typescript`)
- Pattern: `type Tab = z.infer<typeof TabSchema>` (never manual interface definitions)

---

*Integration audit: 2026-08-10*
