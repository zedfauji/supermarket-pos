# Codebase Concerns

**Analysis Date:** 2026-08-10

## Tech Debt

**Generated Types Workaround — Supabase Type Regen Backlog:**
- Issue: 148 instances of `as any` casts for Supabase tables/RPCs not yet in `supabase.types.ts`. These are temporary pre-regen casts blocking type safety across multiple features.
- Files: `src/features/manage-combos/ui/ComboBuilderForm.tsx`, `src/features/add-combo-to-tab/model/useAddComboToTab.ts`, `src/features/split-tab/model/useSplitTab.ts`, `src/features/notify-waitlist/model/useNotifyWaitlist.ts`, `src/features/adjust-stock-movement/ui/AdjustStockMovementDialog.tsx`, `src/features/manage-promotions/ui/PromotionBuilderForm.tsx`, `src/features/seat-waitlist-party/model/useSeatWaitlistParty.ts`, `src/features/toggle-permission/useMutationTogglePermission.ts`, `src/entities/open-unit/model/queries.ts`, `src/entities/inventory/model/queries.ts`, `src/entities/modifier-inventory-rule/model/queries.ts` (and 20+ others).
- Impact: Bypasses type checking on Supabase calls; errors only surface at runtime. CLAUDE.md documents this as an expected workflow ("Regenerate types ASAP with `npx supabase gen types typescript`"), but each unresolved cast is a window for data mutation bugs.
- Fix approach: Run `npx supabase gen types typescript --local > src/shared/lib/supabase.types.ts` to regenerate, then remove each `as any` cast and uncomment `/* eslint-disable */` comments.

**Missing Migration DOWN Scripts:**
- Issue: Pre-Phase-8 migrations (52 of 76 total) lack reversibility; DOWN scripts exist only from Phase 8 onward.
- Files: `supabase/migrations/` (all files before 20260210000000 approx).
- Impact: No automated rollback path on Supabase Cloud if a migration deployment fails or needs reverting. Manual intervention required for production incidents.
- Fix approach: Retroactively add DOWN scripts to critical pre-Phase-8 migrations (especially payment, tab, and inventory schema changes). Supabase Cloud has no automated rollback, so this is safety-first, not deployment automation.

**Large Component Files:**
- Issue: `src/widgets/PaymentModal/ui/PaymentForm.tsx` is 1124 lines — handles method selection (cash/card/Rappi), split payment (up to 4 legs), tip entry, receipt preview, and error recovery in one file.
- Files: `src/widgets/PaymentModal/ui/PaymentForm.tsx`, `src/features/manage-combos/ui/ComboBuilderForm.tsx` (632 lines), `src/features/manage-modifier-groups/ui/ModifierGroupEditor.tsx` (619 lines), `src/shared/lib/edge-function-contracts.ts` (1081 lines, contract definitions), `src/shared/lib/domain.ts` (2161 lines, Zod schemas).
- Impact: Difficult to test; harder to reason about state mutations; increased surface for refactoring errors. `PaymentForm` especially: 10+ state buckets (method, amount, tip, card reference, etc.), useReducer for split payment, three payment processor functions, receipt preview, and error handling.
- Fix approach: Extract split-payment UI logic into `SplitPaymentLegForm` (one-per-row component), move cash-specific logic (tendered/change) to a `CashPaymentSection` sub-component, and pull receipt preview into `<PaymentFormPreview>`. No behavior change, only composition.

**Large Zustand/TanStack Query Files:**
- Issue: `src/entities/tab/model/queries.ts` (810 lines), `src/entities/staff/model/queries.ts` (755 lines), `src/entities/caja/model/queries.ts` (593 lines), and `src/entities/product/model/queries.ts` (587 lines) each pack 6-12 query/mutation hooks into a single file.
- Impact: Harder to navigate; changes to one hook risk affecting others; tests must import the entire file even for single-hook checks.
- Fix approach: For files >600 lines, split into `queries.ts` (read-only queries) and `mutations.ts` (write operations). Example: `src/entities/tab/model/queries.ts` → `src/entities/tab/model/queries.ts` + `src/entities/tab/model/mutations.ts`.

## Known Bugs (Fixed)

**MoneyDisplay Double-Dollar Prefix (Phase 24):**
- What happened: `MoneyDisplay` rendered `$` literal + `formatMoney()`'s already-`$`-prefixed output, producing `$$50.00`.
- Files: All 44 call sites in `src/` (across reports, payment forms, inventory, etc.).
- Status: Fixed in Phase 24. `formatMoney()` is now the sole source of `$` prefix.

**Locale Leakage in Staff Rows (Phase 21):**
- What happened: Switching locale in one staff member's row in the `/staff` page leaked to other rows.
- Files: `src/widgets/StaffTable/StaffTableRow.tsx` (now mounts `EditLocaleDialog` per target instead of once per page).
- Status: Fixed in Phase 21 via per-target component remount.

**Pool Table Orphaning on Timer Stop (Pre-commit):**
- What happened: Calling `stop-pool-timer` orphaned the tab from the table screen.
- Files: `src/features/stop-pool-timer/` (RPC and mutation logic).
- Status: Fixed pre-commit; tab now remains linked to table on timer stop.

## Security Considerations

**CSV Formula Injection (CWE-1236):**
- Risk: Report exports could include user-entered text starting with `=`, `+`, `-`, `@`, tab, or CR, causing formula execution in Excel/Sheets.
- Files: `src/shared/lib/exporters/csv.ts` (generic serializer), all 17 report exports in `src/features/export-report/` and `src/widgets/` admin tabs.
- Current mitigation: `sanitizeCsvCell()` prefixes any dangerous-start with `'` (quote), neutralizing the formula. Phase 24 UAT hardened this.
- Recommendations: No action needed; mitigation is in place. Add a comment in `sanitizeCsvCell()` referencing CWE-1236 for future maintainers.

**Supabase Service Role Key in Renderer (None):**
- Risk: Service-role API key in client code would bypass RLS; all payment/mutation operations run via `invoke('process_payment', ...)` (Tauri IPC to backend), not direct client Supabase calls.
- Files: None — architecture correctly isolates service-role operations.
- Current mitigation: Tauri backend + anon-key-only client. `process-payment` and `process-split-payment` edge functions are the sole payment processors.

**Sensitive Data in Logs:**
- Risk: Logger could capture PIN, card numbers, or payment tokens if not sanitized.
- Files: `src/shared/lib/logger.ts` (structured logger), `src/shared/lib/logger.test.ts` (sanitization tests).
- Current mitigation: `sanitizePayload()` redacts `pin`, `cardNumber`, `token`, and nested sensitive keys. Audit-log redaction also in place.
- Recommendations: Verify that `logger.info('payment.processed', { payment })` never emits full payment object in production. Current code path is correct, but add a comment warning future callers.

## Performance Bottlenecks

**Report Aggregation RPCs vs Client-Side Aggregation:**
- Problem: Phase 24 migrated `get_peak_hours_report`, `get_voids_report`, `get_deletions_pre_report`, `get_deletions_post_report`, `get_modifier_popularity_report`, `get_payment_methods_report` from client-side aggregation to bounded server-side RPCs. Large reports (e.g., full month of orders) now hit the DB instead of aggregating in-memory.
- Files: `supabase/migrations/20260721000002_peak_hours_and_voids_rpc.sql`, `supabase/migrations/20260721000003_modifier_popularity_rpc.sql`, `supabase/migrations/20260721000004_payment_methods_rpc.sql`, `supabase/migrations/20260721000006_deletions_reports_rpc.sql`, and corresponding `src/features/export-report/model/useExportReport.ts`.
- Cause: Database cursor operations are faster for large datasets than transferring raw rows and aggregating in JS. However, complex CTEs (e.g., unnest for `order_items.modifier_ids` in popularity report) can be expensive for multi-month queries.
- Improvement path: Add query-time date-range filtering to RPCs (currently applied client-side after fetch). Consider indexes on `(caja_session_id, order_date)` and `(modifier_ids)` for popularity queries. Monitor RPC execution times via `supabase_functions_requested_duration_ms` in observability.

**Open Units Inventory Materialization:**
- Problem: `consume_open_unit` RPC recalculates remaining quantities via unnest-CTE for every call. High-frequency order entry can trigger hundreds of calls per service.
- Files: `supabase/migrations/20260729000003_consume_open_unit_rpc.sql`, `src/entities/open-unit/model/consume-open-unit.integration.test.ts`.
- Cause: Open units are a many-to-many with `products` (via `product_open_units`); the join is not materialized in an `open_units_inventory` cache table.
- Improvement path: Consider a denormalized `open_units_inventory(product_id, unit_id, quantity_available)` table with triggers to keep it in sync. This trades write complexity for read-time speed. Profile first with `EXPLAIN ANALYZE` on a realistic order-entry sequence.

**Pool Session State Updates:**
- Problem: `update_pool_session_timer` (atomic RPC) locks the entire `pool_sessions` row for the duration of the UPDATE; concurrent timer ticks on the same table block each other.
- Files: `supabase/migrations/20260807000001_pool_session_atomic_rpcs.sql`.
- Cause: PostgreSQL row-level locking during multi-row atomic writes (tab balance update + pool session update + audit).
- Improvement path: Partition by `resource_id` if multi-table concurrency becomes observable. For now, pool-table sessions are low-concurrency (one timer per table), so locking is acceptable. Monitor `pg_stat_statements` lock wait times if user-reported slowness emerges.

## Fragile Areas

**Split-Tab Sub-Tab Pattern:**
- Files: `src/features/split-tab/model/useSplitTab.ts`, `src/features/split-tab/ui/SplitTabSheet.tsx` (840 lines).
- Why fragile: Split-tab creates synthetic `sub_tabs` that shadow the parent tab; each sub-tab has its own `balance`, `items`, and `payments`. If parent-tab mutations (e.g., `add_item_to_tab`) bypass the split-tab RPC, the sub-tabs become stale. Similarly, if a split-tab sub-tab is re-opened or transferred without fully settling, the parent tab and sub-tabs can diverge.
- Safe modification: All tab mutations must call `useSplitTab`'s `splitTabMutation` hook if `isSplitMode` is true. Add a lint rule or runtime check to prevent direct parent-tab mutations during split. Test concurrency: open tab, split it, mutate each sub-tab in quick succession, verify no race conditions in `close_tab` settlement.
- Test coverage: `e2e/34-split-bill.spec.ts`, `e2e/41-split-payment.spec.ts` cover the happy path. Gaps: splitting after a tab already has refunds, splitting then voiding one leg but not others, concurrent split-tab mutations from two terminals.

**Multi-Payment Split-Payment Atomic RPC:**
- Files: `src/shared/lib/edge-function-contracts.ts`, `supabase/migrations/20260715000001_split_payment_atomic_v1.sql`, `src/widgets/PaymentModal/ui/PaymentForm.tsx` split-mode state machine.
- Why fragile: `process_split_payment_atomic` bundles up to 4 payment methods in one RPC call. If the RPC fails partway (e.g., one leg succeeds, next fails), the caller must retry the entire batch or manually settle the partial state. No built-in idempotency key; if the caller retries the same 4 legs and one succeeded offline, it will retry the already-completed leg.
- Safe modification: Add idempotency key to `process_split_payment_atomic` signature (e.g., `split_payment_id` ULID + `leg_index`), so retries on the same leg are no-ops. Test: make a split payment, simula a network timeout after leg 2 succeeds, verify that retrying all 4 legs doesn't double-process leg 2.
- Test coverage: `e2e/41-split-payment.spec.ts`, `e2e/05-payments.spec.ts` cover the atomic happy path and error recovery. Gaps: partial completion recovery (resume after leg 2 of 4), idempotency on retry, offline recovery after one leg completes.

**Tip Distribution Largest-Remainder Allocation:**
- Files: `supabase/migrations/20260715000002_tip_distribution_config.sql` (contains `close_caja_session` trigger), `src/widgets/SettingsTabsPanel/tabs/TipDistributionSettingsTab.tsx`.
- Why fragile: Largest-remainder allocation for floor/bar/kitchen tip split is a known-exact algorithm, but edge cases exist: if tips sum to a value that doesn't divide evenly by 100 cents, rounding errors accumulate. If admin changes `tip_distribution` settings mid-session (e.g., switches from 34/33/33 to 50/25/25), the snapshot only reflects the final configuration, not historical changes within the session.
- Safe modification: Test edge cases: $1.01 tips (1 cent to allocate), $0.99 tips (can't allocate 1 cent, zero out remainder), mixed rounding over 100+ tips in a session. Add a comment in the RPC explaining the tiebreaker (floor > bar > kitchen). Do NOT allow mid-session settings changes; enforce that settings are read-only during an active caja session.
- Test coverage: `e2e/42-tip-distribution.spec.ts` covers the happy path and rounding. Gaps: settings change during session, 0-tip orders (skip allocation), very small tips (<$0.10).

**Resource Table Refactoring (pool_tables → resources):**
- Files: `supabase/migrations/20260728000001_rename_pool_tables_to_resources.sql`, `src/entities/resource/`, `src/entities/pool-session/`.
- Why fragile: Large schema rename with data migration. Tables renamed, columns added (is_temp, floating support). Old `pool_tables` references might linger in trigger logic, RLS policies, or client-side code.
- Safe modification: Grep for `pool_table` in migrations, SQL, and client code. Verify all foreign keys, indexes, and RLS policies reference `resources`, not `pool_tables`. Add a migration down script that rolls back the rename (create `pool_tables` view aliasing `resources` for compatibility, or reverse the rename if no data was written post-migration).
- Test coverage: `e2e/04-pool-timer.spec.ts`, `e2e/24-pool-advanced.spec.ts` verify pool operations. Gaps: verify that old queries/RPCs still work post-rename, test the floating resource lifecycle fully.

## Scaling Limits

**Offline Queue Processing:**
- Current capacity: `tabsStore.offlineQueue` is an in-memory array; no limit on queue size documented.
- Limit: If a user is offline for >1 hour with high order-entry (e.g., 100+ items added), the queue grows unbounded. App memory could exhaust on a lower-spec device (WebView2 on older Windows).
- Scaling path: Cap queue size to 500 pending actions; if exceeded, warn the user and drop oldest items (risky but practical). Alternatively, persist queue to IndexedDB via Tauri's SQL plugin, backing up to local SQLite for recovery on restart.

**Supabase Realtime Connections:**
- Current capacity: App opens subscriptions in `src/app/PoolRealtimeListener.tsx`, `src/app/WaitlistRealtimeListener.tsx`, and multiple Zustand stores (tabs, inventory, rappi orders). Each subscription is a WebSocket connection.
- Limit: Supabase Cloud Free tier has a limit on concurrent connections per project. Multi-tab support (e.g., two terminals running the same app) would double connection count.
- Scaling path: Implement connection pooling or use a shared `broadcast` channel instead of per-subscription Realtime. Investigate Supabase's connection limits for the pricing tier in use and document the max-terminals constraint.

**Report Export Size:**
- Current capacity: Full-month reports on large venues (1000+ orders) export to CSV/Excel without pagination.
- Limit: Excel files have a 1M-row hard limit; large months might approach it. CSV export is unbounded.
- Scaling path: Add date-range filtering UI to all report tabs (currently only in backend RPCs). Offer "export by day" instead of "export by month" for large datasets. Consider streaming CSV instead of loading all rows in-memory.

## Dependencies at Risk

**@react-pdf/renderer (Deprecated in favor of Chromium rendering):**
- Risk: Library is not actively maintained; PDF output may drift from browser rendering. Alternative: use Chromium's built-in PDF export (via Tauri / window.print()).
- Impact: Receipts, pre-cheques, and reports generate PDFs via this lib. If rendering breaks, migration requires rewriting PDF templates.
- Migration plan: Phase the migration: (1) Add a `usePdfEngine: 'chromium' | 'react-pdf'` setting; (2) Implement Chromium-based PDF export as an alternative; (3) Default to Chromium for new installs; (4) Retire react-pdf once 100% of users have switched.

**Supabase JS Client (@supabase/supabase-js ^2.103.0):**
- Risk: Major version bump to v3 may introduce breaking changes in Auth or Realtime API.
- Impact: All Auth calls, RPC invocations, and subscription logic depend on this.
- Migration plan: Monitor Supabase release notes. Test v3 against a feature branch before upgrading. Supabase usually provides a migration guide.

**Tauri Framework (@tauri-apps/* ^2):**
- Risk: Tauri 2 is relatively recent (released late 2024). Plugin stability may vary (sql, dialog, shell, updater are in use).
- Impact: If a plugin breaks, Tauri app cannot run.
- Migration plan: Pin plugin versions in package.json. Monitor Tauri security advisories. Have a fallback to web-only mode if Tauri breaks mid-deployment (probably not feasible, but document the risk).

**i18next (26.3.6 — pinned, non-caret):**
- Risk: Pinned to exact version (not ^26.3.6); new locales or breaking changes in 27.x won't auto-update. Manually bumping is required.
- Impact: If i18next 27 requires namespace restructuring, entire i18n layer must be re-authored.
- Migration plan: When i18next 27 is released and deemed stable (6+ months of real-world use), plan a phase to upgrade, test locale switching and receipt rendering thoroughly.

## Missing Critical Features

**Idempotency for Payment Operations:**
- Problem: Split-payment RPC and edge function lack idempotency keys. Retrying after a crash can double-charge.
- Blocks: Safe retry logic for payment edge cases (network timeout, service restart mid-process).
- Priority: High — payment data integrity is non-negotiable.

**Rollback for Database Migrations:**
- Problem: Pre-Phase-8 migrations (52 of 76) have no DOWN scripts. Production deployment rollback is manual.
- Blocks: Fast incident response; any migration issue requires manual SQL execution.
- Priority: Medium — affects production reliability, not app functionality.

**Max-Terminals Constraint Documentation:**
- Problem: Realtime subscriptions scale with terminal count; no documented limit or multi-terminal testing.
- Blocks: Scaling to 5+ concurrent terminals.
- Priority: Medium — applies only to large venues.

## Test Coverage Gaps

**Offline Queue Recovery:**
- What's not tested: Queueing 50+ mutations, going offline, network reconnect, verify all are replayed in order without duplicates.
- Files: `src/shared/lib/network.ts` (offline detection), `src/app/OfflineQueueProcessor.tsx` (replay logic).
- Risk: High — silent data loss or duplicate writes if replay fails.
- Priority: High.

**Concurrent Mutations on Same Tab:**
- What's not tested: Two terminals (or two staff users) mutating the same tab simultaneously (e.g., one adds item, other processes payment). Verify version-number conflict detection catches it.
- Files: `src/entities/tab/model/queries.ts` (expectedVersion check), `src/shared/lib/version-error.ts` (conflict resolution).
- Risk: Medium — race conditions can silently corrupt tab state.
- Priority: Medium. `e2e/39-concurrent-edits.spec.ts` covers basic concurrent-edit retry; extend it to payment-critical paths.

**Open Units Inventory Depletion Edge Cases:**
- What's not tested: Open unit with 0.01 kg remaining, order requires 0.02 kg (should fail), but another unit exists with 0.05 kg (should succeed by switching units). Verify depletion correctly prioritizes units.
- Files: `supabase/migrations/20260729000004_deplete_for_order_item_v5_open_units.sql`, `src/entities/tab/model/depletion.integration.test.ts`.
- Risk: Medium — partial fulfillment or incorrect unit selection.
- Priority: Medium.

**Locale Switching During Active Checkout:**
- What's not tested: User changes locale (via Settings) while PaymentForm is open. Verify receipt and payment flow complete without locale-mismatch errors.
- Files: `src/shared/lib/i18n/index.ts` (language change), `src/widgets/PaymentModal/ui/PaymentForm.tsx` (receipt rendering).
- Risk: Low — unlikely scenario, but can corrupt receipt output.
- Priority: Low.

**Pool Session Concurrency at Timer Expiry:**
- What's not tested: Pool session timer expires (server-side cron or client-side timeout), while client attempts to add an item to the tab. Verify tab balance is updated correctly and timer doesn't restart.
- Files: `src/features/stop-pool-timer/model/useStopPoolTimer.ts`, `src/app/PoolRealtimeListener.tsx`.
- Risk: Medium — timer restart can cause overbilling.
- Priority: Medium.

---

*Concerns audit: 2026-08-10*
