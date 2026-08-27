# Milestones

## v1.1 Pre-Launch Hardening (Shipped: 2026-08-18)

**Phases completed:** 6 phases, 25 plans, 51 tasks

**Key accomplishments:**

- Deleted the orphaned `src/features/void-order/` feature folder, dropped `void_order` from rbac.ts's client-side Action union, and removed its edge-function contract exports/registry entry and audit-coverage allowlist entry — the frontend/shared-lib half of SALE-01, with `npm run typecheck && npm run lint && npm run test` green after every task.
- Removed the void-order feature's backend/DB surface: a new forward migration deletes its two `role_permissions` grant rows (historical seeding migration left untouched), the `supabase/functions/void-order/` edge function directory is gone, and both locale catalogs' `voidOrder` i18n key blocks are removed — the backend/DB half of SALE-01, with `npm run typecheck && npm run lint && npm run test` green (1098 passed) after all three tasks.
- Deleted the dead void-order E2E spec and its two already-skipped RBAC dialog tests, added the one new Playwright test that actually proves the control is unreachable (SC1), and ran the phase's full SC1-SC5 verification gate — closing out SALE-01's E2E surface.
- Bearer-authenticated `agent-proxy` Supabase Edge Function now fronts every Anthropic call; `brain.ts`/`vision.ts` fully off `@anthropic-ai/sdk` — real key provisioning (Task 4) intentionally deferred by the user until shipping.
- Activated the long-dormant `receipt_settings` RLS policy SQL against a genuinely-created table, and added the client query/mutation pair the next plan repoints every consumer onto.
- Repointed the last 4 client consumers of receipt settings from the generic `settings` table onto `receipt_settings`, fixed a DELETE-policy gap that predated this plan (admin-only instead of manager+admin), and proved cashier-read-only / manager+admin-full-CRUD with a service-role integration test.
- 1. [Rule 3 - Blocking issue] Missing/stale generated Supabase types for `suppliers`/`shipments`/`receive_shipment`/`inventory.cost_price`+`expiry_date`
- Deleted the dangling `pool_tables` SELECT/upsert code from both settings-backup and settings-restore edge functions (dropped table from Phase 1's schema strip) and added a Playwright E2E spec proving both functions round-trip a backup end-to-end.
- 1. [Rule 3 - Blocking issue] Fresh worktree checkout had no `node_modules`
- `useCheckoutSale.submit()` fails fast on `isOnline()` before any fetch(), and `PaymentForm` shows a dedicated blocking dialog (Try Again/Cancel) instead of hanging or discarding the `NETWORK_OFFLINE` error code.
- ProcessRefundInputSchema (Zod, in domain.ts) validates the process_refund RPC's p_items jsonb payload client-side — fail-fast on empty/malformed/duplicate refund lines before any network call — while removing both `as any` casts left over from before the Phase 7 supabase.types.ts regen.
- Translated the unmapped-error fallback in useRemoveTabItem, useReopenTab, useEditPaidTab, and useMutationCreateCajaEntry so a cashier/manager never sees raw `relation "..." does not exist`-shaped Postgres text in a toast — only the already-actionable, already-mapped error codes (NOT_FOUND, TAB_NOT_OPEN, CAJA_CLOSED, AUTH_FORBIDDEN, REOPEN_CAP_EXCEEDED, TAB_NOT_EDITABLE, STALE_VERSION, duplicate/FK/RLS, etc.) were left untouched.
- useProcessRefund.ts's confirmed raw-Postgres-error leak (ROADMAP SC3's literal example) is fixed by returning a translated `featOrders:processRefund.genericError` message from the SUPABASE_ERROR fallback branch instead of `error.message`, RefundSheet.tsx's now-dead empty-string ternary is removed, and a new Playwright test forces the exact failure path via `page.route()` RPC interception to prove the fix end to end.
- Replaced the placeholder Tauri app identifier `com.yourcompany.barpos` with the real, decided value `com.tajhouseofspices.supermarketpos` in `src-tauri/tauri.conf.json`
- Closed a critical elevation-of-privilege gap by adding Bearer-JWT + admin/manager role verification to create-staff/index.ts, and built the previously-nonexistent "Add Staff" dialog on StaffDashboard that exercises it end-to-end.
- `useAddItemToTab` thin RPC wrapper + `EditReopenedItemsPanel` Sheet (add-item side) wired into `PaymentPane` via a new live-status-gated `EditItemsButton`, proven by an `e2e/48-reopen-closed-ticket.spec.ts` fixture rebuilt on `process_direct_sale_atomic`.
- Added one integration test proving `edit_paid_tab`'s existing `TAB_NOT_EDITABLE` guard already rejects a reopened (`status='open'`) sale — zero production code changed.
- `RemoveTabItemDialog`/`useRemoveTabItem` wired into `EditReopenedItemsPanel` behind a dedicated per-item `ManagerPinDialog`, reproducing the deleted `TableStatusPanel`'s two-step orchestration, proven end-to-end by a new SC-3 Playwright block that runs green alongside the phase's existing SC-1/SC-2 coverage.
- Suppliers panel now shows a TableRowSkeleton while `useSuppliers()` fetches and a `role="alert"` message on failure, proven by a new Playwright spec intercepting the Supabase REST call — closing QA-01.
- Hand-authored `.storybook/main.ts`/`preview.ts` (the repo never had a working Storybook config despite 15 pre-existing `.stories.tsx` files) plus 6 new stories for EmptyState, ConfirmDialog, POSButton, DataTable, MoneyDisplay, and MoneyInput — `npm run build-storybook` now exits 0 with all 23 story files.
- Dedicated Vitest characterization test for the direct-sale payment mutation hook, mocking its 3 Zustand-store dependencies plus the edge-function call and connectivity check, covering offline/caja-closed/cash/card/split-success/malformed-envelope/propagated-error paths — closes QA-04 with zero hook changes.
- Runnable `pg_dump` backup script for the self-hosted fallback path, plus a two-scenario (self-hosted / Supabase Cloud) DR doc grounded in `supabase/config.toml`'s D-06 comment and `settings-backup`'s verified 5-table scope — closes OPS-02.
- Shared `src/shared/ui/EntityIdCell.tsx` primitive: payment/tab/staff entity IDs render as real `react-router-dom` links (exact-Set allowlist), every other entityType renders plain copy-only mono text, all with a copy-to-clipboard button and full-ID tooltip — built via strict RED/GREEN TDD.
- PaymentPane and StaffDashboard now read `?id=` query params — a client-side ID filter on `/payments` and a `getRowClassName`-driven highlight+scroll on `/staff` — proven end-to-end with a new Playwright spec, independent of the `EntityIdCell` link source that will point at them.
- EntityIdCell (plan 10-05) composed into AuditLogTable, EditHistoryTable, and both Reports Deletions surfaces, with Playwright proving the full click-through into PaymentPane/StaffDashboard's `?id=` handling from plan 10-06 — QA-03 closed end-to-end.

---
