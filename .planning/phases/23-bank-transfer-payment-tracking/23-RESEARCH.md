# Phase 23: Bank Transfer Payment Tracking - Research

**Researched:** 2026-08-31
**Domain:** Supabase (Postgres RPC + RLS) schema/RPC extension, React/FSD widget composition, RBAC-gated state machine — no new external dependencies
**Confidence:** HIGH (all schema/RPC/component claims verified by reading the actual source this session; the one open design choice — sibling table vs. columns — is a recommendation, not a locked fact)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reference code**
- D-01: 6-digit numeric payload + 1 Luhn (mod-10) check digit = 7 digits total. Generator/validator already implemented and unit-proven: `.planning/spikes/003-reference-code-design/reference-code.cjs`.
- D-02: Code must be unique only among the store's own currently-open pending-transfer sales (not globally/permanently unique) — reuse the `generateUniqueCode(pendingCodes)` pattern.
- D-03: Customer is told to put the code in the transfer's `referencia numérica` field primarily, falling back to `concepto` (freeform, ≤40 chars) if their bank doesn't expose the numeric field. Never natural-language phrasing in a concepto-based code.

**Reconciliation model**
- D-04: Bank statement data must never be imported into or synced with the POS, under any circumstance. No CSV import, no bank API pull, no PSP webhook in this phase.
- D-05: Reconciliation is always a manual admin/manager action inside the POS — they check their own banking app/statement outside the POS, then confirm the matching sale by typing/selecting the reference code.
- D-06: Every confirm/dispute is an explicit manual tap — no auto-confirm path exists anywhere, even for an unambiguous match.

**State machine & RBAC**
- D-07: States `pending -> confirmed | disputed`. Cashier-originated (`markPendingTransfer`, any authenticated staff), manager+/admin-gated terminal actions (`confirmTransfer`, `disputeTransfer`) — mirrors the existing `process_refund`/`reopen_tab` RBAC pattern.
- D-08: A mistyped code is rejected by Luhn check-digit validation before it is ever compared to the sale's real code.
- D-09: Every state transition is audit-logged (mirrors `record_audit()`/`recordAudit()` usage pattern).
- D-10: A dispute requires a required, audit-logged reason — no dispute with an empty reason.

**`/payments` page UI**
- D-11: Lives as a "Bank Transfers" tab on the existing `/payments` page (`PaymentsPage`/`PaymentPane`) — not a new route.
- D-12: Lists every pay-later/bank-transfer sale regardless of state, with reference code, customer name/phone, elapsed time (oldest first; pending past ~8h visually flagged as stale), and status badge.
- D-13: Admin can export the pending+confirmed list to CSV for end-of-day final reconciliation — CSV cell-escaping must neutralize formula injection (CWE-1236), mirroring `rowsToCsv` in `src/shared/lib/exporters/csv.ts`.
- D-14: No native `alert()`/`confirm()`/`prompt()` anywhere in this UI — use a `ConfirmDialog`-style modal.

### Claude's Discretion
- Exact copy/wording for empty states, tab labels beyond "Bank Transfers", and i18n key naming within the existing `wPanels`/`featOrders` namespace convention.
- Whether the "stale" pending threshold (spike used 8h) is hardcoded or a configurable setting — follow whatever pattern `receipt_settings`/near-expiry-alert config already uses for similar "configurable threshold" values in this codebase.
- Exact DB column names/types for the new pending-transfer fields (spike used `referenceCode, amount, customerName, customerPhone, status, createdAt, createdBy, confirmedBy, confirmedAt, disputeReason` — real migration should follow existing `payments`/`tabs` table naming conventions, not necessarily these exact names).

### Deferred Ideas (OUT OF SCOPE)
- PSP-based auto-reconciliation (Conekta/Clip unique-CLABE-per-sale, webhook-driven auto-confirm) — future phase once transaction volume justifies the ~$12.50 MXN+IVA/txn cost.
- WhatsApp confirmation send-out to the customer — later integration.
- Bank statement import in any form — ruled out permanently, not merely deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

This phase has no formal `REQUIREMENTS.md` entries yet — CONTEXT.md's D-01..D-14 are the binding spec. Proposed requirement-ID-shaped labels for the planner/traceability table, derived 1:1 from the locked decisions above (no new scope invented):

| ID | Description | Research Support |
|----|-------------|------------------|
| BTP-01 | Generate a 7-digit (6-digit payload + Luhn check digit) reference code per pending-transfer sale, unique among currently-open pending codes | `reference-code.cjs` reused verbatim (Code Examples); `generateUniqueCode` pattern documented |
| BTP-02 | Cashier can mark a completed sale as awaiting bank transfer at checkout, generating the code and printing/showing it to the customer | Architecture §"Checkout integration"; `process_direct_sale_atomic`/`process_payment_atomic` extension path documented |
| BTP-03 | Manager/admin can confirm a pending transfer by entering the reference code, validated via Luhn before comparing to the real code | `process_refund` RPC pattern (auth.uid() role check) reused; Code Examples §2 |
| BTP-04 | Manager/admin can dispute a pending transfer with a required reason | Same RPC pattern, mirrors `process_refund`'s reason-required shape |
| BTP-05 | No auto-confirm path exists anywhere — confirm/dispute are always an explicit manager+ RPC call gated by `ManagerPinDialog` | `ManagerPinDialog`/`RefundSheet` pattern documented (Code Examples §3) |
| BTP-06 | Every transition (mark pending / confirm / dispute) is audit-logged with a new `AuditActionSchema` entry | `record_audit()` SQL signature + `AuditActionSchema` CI-enforced list documented (Pitfall 1) |
| BTP-07 | "Bank Transfers" tab added to `/payments` page listing pending/confirmed/disputed sales, oldest-first, with stale-pending (~8h) visual flag | `PaymentsPage`/`PaymentPane`/`RefundsList` exact tab-injection point documented (Architecture) |
| BTP-08 | CSV export of pending+confirmed list, reusing `rowsToCsv`/`csvToBytes` + Tauri file-save dialog (not a browser Blob download) | `useExportReport.ts` real pattern documented (Code Examples §4) — spike's browser `<a download>` is NOT what to replicate |
| BTP-09 | New RBAC action(s) added to `src/shared/lib/rbac.ts`, manager+-gated | Exact `STAFF_ACTIONS`/`MANAGER_EXTRA` insertion point documented |
| BTP-10 | Bank statement data never imported/synced — no new integration surface with any bank/PSP API | No code path introduces this; confirmed no existing bank-API client in the codebase |
</phase_requirements>

## Summary

This phase is a schema-and-RPC extension of the existing payments/RBAC/audit machinery, not a new subsystem — every mechanism it needs (manager+-gated RPC pattern, `record_audit()`, `ManagerPinDialog`, `rowsToCsv`, a page-level `Tabs` widget slot) already exists in the codebase and was read this session. The one real design decision left to the planner is schema shape: **add a sibling table** (e.g. `bank_transfers`, FK'd 1:1 to `payments.id`, mirroring the existing `refunds` table's relationship to `payments`) rather than adding new nullable columns to `payments` itself or reusing `payments.status`'s CHECK-constraint pattern. The sibling-table path avoids re-touching the ~5 existing payment-summing call sites (`process_payment_atomic`, `process_split_payment_atomic`, `get_caja_report`, `close_caja_session`, `process_refund`) that a prior phase (the `reopened_void` status value) had to patch when it added a second `payments.status` value — see Pitfall 2.

The harder architectural question is checkout integration: `process_direct_sale_atomic` today **always** requires the underlying `process_payment_atomic`/`process_split_payment_atomic` call to leave `tabs.status = 'paid'`, and only accepts `p_method IN ('cash','card')` (or split legs) — there is no existing "sale finalized, payment deferred" path anywhere in this codebase (`hold-sale` is a client-only, unpersisted cart hold, not a completed-sale state). The real-world workflow ("bill generated, customer pays by transfer sometimes same evening") means the sale itself must complete at checkout time (receipt prints, inventory decrements) with the reference code generated then — reconciliation status is a property of the payment record, tracked separately from `tabs.status`. This requires: adding `'bank_transfer'` to the `payment_method` Postgres enum, whitelisting it in `process_payment_atomic`/`process_split_payment_atomic`/`process_direct_sale_atomic`'s method checks, and treating a `bank_transfer` payment as an ordinary completed payment row (tab closes normally) with its *reconciliation* state tracked in the new sibling table. See Pitfall 3 for the reporting-inflation consequence this has and why it needs an explicit planner decision.

**Primary recommendation:** Add `payment_method` enum value `'bank_transfer'`; store the reference code in the payments table's existing `reference_number` column (already free-text, ≤64 chars, already used for card auth codes — no new column needed for the code itself); add one new sibling table `bank_transfers` (id, payment_id FK, status, customer_phone, created_by, confirmed_by, confirmed_at, disputed_by, disputed_at, dispute_reason — customer *name* is already on `tabs.customer_name`, don't duplicate it) for the state machine; add two new manager+-gated RPCs (`confirm_transfer_payment`, `dispute_transfer_payment`) following `process_refund`'s exact auth/audit shape; add a `"bankTransfers"` `TabsTrigger`/`TabsContent` to `src/pages/payments/index.tsx` alongside the existing `"payments"`/`"refunds"` tabs, with a new `BankTransfersList` widget mirroring `src/widgets/RefundsList/index.tsx`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reference code generation + Luhn validation | API / Backend (Postgres RPC) | Browser (client-side pre-validation for fast typo feedback) | Server-side RPC is the authority (matches `process_refund`'s "RPC re-checks role/state via auth.uid()" pattern); client can optionally run the same pure Luhn check for instant UI feedback before the round-trip |
| Mark-pending state write | API / Backend | — | Happens inside the existing checkout RPC chain (`process_direct_sale_atomic` → `process_payment_atomic`), which is already `SECURITY DEFINER` Postgres |
| Confirm/dispute state transition | API / Backend | — | Manager+ RBAC gate must be server-enforced (`auth.uid()` role check inside the RPC, same as `process_refund`), not client-only |
| Bank Transfers tab list/CSV export | Browser / Client (React widget) | — | Read-only list rendering + Tauri-native file-save dialog, same tier as the existing `RefundsList`/`useExportReport` |
| Audit trail | API / Backend (`record_audit()` SQL helper) | — | All existing state-transition RPCs call `record_audit()` from inside the same transaction; no reason to diverge |
| Database / Storage (schema) | Database / Storage | — | New sibling table + enum value, RLS policies |

## Standard Stack

No new external packages are required for this phase — every primitive needed already exists in the codebase (Postgres RPC pattern, `xlsx`-backed CSV exporter, shadcn `Tabs`/`AlertDialog`, Tauri `plugin-dialog`/`plugin-fs`). This section documents the **existing** in-repo pieces this phase must reuse, verified by reading each file this session.

### Core (existing, reused)

| Piece | Location | Purpose | Verified |
|-------|----------|---------|----------|
| `payment_method` Postgres enum | `src/shared/lib/supabase.types.ts:1924` | Discriminates payment method; needs `'bank_transfer'` added | `[VERIFIED: src/shared/lib/supabase.types.ts:1924]` — `payment_method: "cash" \| "card" \| "tab_transfer" \| "rappi"` |
| `payments.reference_number` column | `src/shared/lib/supabase.types.ts:673` | Free-text ≤64-char field, currently used for card auth codes (`PaymentForm.tsx:433` `{ referenceNumber: row.cardReference.trim() }`) — reusable for the 7-digit transfer code | `[VERIFIED: src/shared/lib/supabase.types.ts:673]` — `reference_number: string \| null` |
| `payments.status` CHECK-constrained text column | `supabase/migrations/20260720000002_payments_status_column.sql:24-26` | Existing precedent for a second lifecycle dimension on `payments` — **do not** extend this for transfer states (see Pitfall 2) | `[VERIFIED: supabase/migrations/20260720000002_payments_status_column.sql:24-26]` — `ALTER TABLE payments ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reopened_void'));` |
| `refunds` sibling table (schema precedent) | `src/shared/lib/supabase.types.ts:1207-1248` | Exact precedent for "new lifecycle sibling table FK'd 1:1 to `payments`" — mirror this shape for `bank_transfers` | `[VERIFIED: src/shared/lib/supabase.types.ts:1207-1248]` — `refunds.original_payment_id` FK → `payments.id`, `refunds.created_by` FK → `profiles.id` |
| `record_audit()` SQL helper | `supabase/migrations/20260703000001_record_audit_terminal_id.sql:47-56` | 8-arg signature: `record_audit(p_action, p_entity_type, p_entity_id, p_before, p_after, p_source, p_terminal_id, p_user_id)` | `[VERIFIED: supabase/migrations/20260703000001_record_audit_terminal_id.sql:47-56]` |
| `recordAudit()` TS helper (edge functions only) | `supabase/functions/_shared/audit.ts`, called from `supabase/functions/admin-reset-pin/index.ts:137-145` | `recordAudit(supabaseAdmin, { action, entityType, entityId, before, after, source, actorId })` — only relevant if this phase builds an edge function, not a plain RPC | `[VERIFIED: supabase/functions/admin-reset-pin/index.ts:137-145]` — `await recordAudit(supabaseAdmin, { action: 'permission.admin_pin_reset', entityType: 'staff', entityId: targetStaffId, before: null, after: {...}, source: 'edge', actorId: authUser.id })` |
| `AuditActionSchema` | `src/shared/lib/audit-actions.ts:18-72` | Master enum of valid `record_audit` action strings, CI-enforced by `audit-actions.test.ts` | `[VERIFIED: src/shared/lib/audit-actions.ts:18-72]` — existing `// Payments` group: `'payment.process', 'payment.process_split', 'payment.refund'` |
| `STAFF_ACTIONS` / RBAC | `src/shared/lib/rbac.ts:13-32, 45-55` | Add new action string(s) here, in `MANAGER_EXTRA` set | `[VERIFIED: src/shared/lib/rbac.ts:13-32]` — full quoted list in Code Examples §3 |
| `ManagerPinDialog` | `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` | `{ open, onOpenChange, requiredAction, onSuccess }` — `requiredAction` is a `StaffAction` string | `[VERIFIED: src/features/process-refund/ui/RefundSheet.tsx:322-330]` |
| `ConfirmDialog` | `src/shared/ui/ConfirmDialog.tsx:26-51` | `{ open, title, description, onConfirm, onCancel, confirmDisabled, children }` — `children` slot fits the code-entry/dispute-reason input, `confirmDisabled` gates submit until valid | `[VERIFIED: src/shared/ui/ConfirmDialog.tsx:26-51]` |
| `rowsToCsv` / `csvToBytes` | `src/shared/lib/exporters/csv.ts:15-28` | `rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string` — uses `xlsx`'s `json_to_sheet`/`sheet_to_csv` for RFC-4180 escaping + its own `sanitizeCsvCell` for CWE-1236 formula-injection prefix escaping | `[VERIFIED: src/shared/lib/exporters/csv.ts:1-24]` — full text quoted in Code Examples §4 |
| Tauri file-save (real export mechanism) | `src/features/export-report/model/useExportReport.ts:1-2, 515-524` | `save()` from `@tauri-apps/plugin-dialog` + `writeFile()` from `@tauri-apps/plugin-fs` — **not** a browser `Blob`/`<a download>` (that's what the spike HTML used, browser-only, wrong for this Tauri app) | `[VERIFIED: src/features/export-report/model/useExportReport.ts:515-524]` |
| `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` | `src/pages/payments/index.tsx:5, 15-26` | Exact injection point for the new "Bank Transfers" tab | `[VERIFIED: src/pages/payments/index.tsx:1-29]` — full file quoted in Architecture |
| `settings` key-value table + Zod pattern | `src/entities/settings/model/queries.ts:79, 217-246` | Precedent for a configurable threshold value (`near_expiry` key, `{thresholdDays: 14}` shape) — reuse this pattern if the stale-pending threshold becomes configurable | `[VERIFIED: src/entities/settings/model/queries.ts:79]` — `const DEFAULT_NEAR_EXPIRY: NearExpirySettings = { thresholdDays: 14 };` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New sibling table `bank_transfers` | New nullable columns directly on `payments` (`transfer_status`, `transfer_customer_phone`, `transfer_confirmed_by`, ...) | Avoids a JOIN, but pollutes `payments` with ~6 columns meaningful only to one payment method, and risks the same "must audit every summing site" churn the `reopened_void` status value caused (Pitfall 2) — rejected |
| New sibling table | Extend `payments.status` CHECK constraint with `'pending_transfer'`/`'transfer_confirmed'`/`'transfer_disputed'` values | `payments.status`'s existing two values (`'completed'`/`'reopened_void'`) already required a companion migration patching 5 call sites (Pitfall 2) to exclude `'reopened_void'`; adding transfer semantics to the same column conflates two orthogonal lifecycles (voided-by-reopen vs. reconciliation-pending) — rejected |
| Plain RPC for confirm/dispute (`process_refund` pattern) | Supabase Edge Function (`admin-reset-pin` pattern) | `process_refund` — the pattern D-07 explicitly says to mirror — is a plain RPC with `auth.uid()` role check, not an edge function; edge functions in this codebase are reserved for cases needing `service_role`/dual-write across `auth.users` (see `admin-reset-pin`). Recommend plain RPC unless the planner finds a service-role need |

**Installation:** None — no new packages.

**Version verification:** N/A — no new external dependencies introduced this phase.

## Package Legitimacy Audit

Not applicable. This phase introduces zero new npm/pip/cargo packages — it exclusively extends existing Postgres schema/RPCs and reuses existing React/shadcn/Tauri primitives already present in `package.json`. No Package Legitimacy Gate run was needed.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Checkout (existing)                    Reconciliation (new, /payments)
────────────────────                   ──────────────────────────────
PaymentForm.tsx                        PaymentsPage (Tabs: Payments | Refunds | Bank Transfers ←NEW)
  │ cashier picks "Bank Transfer"         │
  ▼                                       ▼
useCheckoutSale → callProcessDirectSale  BankTransfersList (NEW widget, mirrors RefundsList)
  │ (edge function)                        │ usePendingTransfers() query
  ▼                                        │
process-direct-sale (edge fn)              ├─ row: reference code, customer name (tabs.customer_name)
  │ invoke RPC                             │        + phone, elapsed time, status badge
  ▼                                        │
process_direct_sale_atomic (RPC)           ├─ [Confirm] → ConfirmDialog (code input, Luhn-validated
  │ method='bank_transfer' now allowed     │              client-side, then server-side)
  ▼                                        │     → ManagerPinDialog (requiredAction=confirm_transfer_payment)
process_payment_atomic (RPC, extended)     │     → confirm_transfer_payment RPC
  │ INSERT payments (method='bank_transfer', │        (auth.uid() role check, Luhn re-check,
  │   reference_number=<7-digit code>)     │         UPDATE bank_transfers SET status='confirmed',
  │ tabs.status = 'paid' (sale finalized,  │         PERFORM record_audit('payment.transfer_confirmed', ...))
  │   receipt prints, inventory decrements)│
  ▼                                        ├─ [Dispute] → ConfirmDialog (reason input, required)
INSERT bank_transfers (NEW sibling table)  │     → ManagerPinDialog (requiredAction=dispute_transfer_payment)
  status='pending', payment_id=<new row>,  │     → dispute_transfer_payment RPC
  customer_phone, created_by               │        (auth.uid() role check, reason required,
  PERFORM record_audit(                    │         UPDATE bank_transfers SET status='disputed',
    'payment.transfer_marked_pending', ...)│         PERFORM record_audit('payment.transfer_disputed', ...))
  │                                        │
  ▼                                        └─ [Export CSV] → useExportReport-style hook
Receipt prints with reference code                → rowsToCsv(rows, BANK_TRANSFERS_CSV_COLUMNS)
  (customer told to use it as SPEI                → save() + writeFile() (Tauri, not Blob)
   referencia numérica)
```

A reader can trace: cashier picks bank-transfer method at checkout → sale finalizes normally (receipt, inventory) → a `bank_transfers` row is created `pending` → later, on `/payments` → Bank Transfers tab, manager+ taps Confirm or Dispute → RPC re-validates role + Luhn + writes the terminal state → audit row written in the same transaction.

### Recommended Project Structure

```
src/
├── features/
│   ├── mark-pending-transfer/          # NEW — cashier-side checkout integration
│   │   └── model/useMarkPendingTransfer.ts   (if separated from useCheckoutSale;
│   │                                           more likely folded into the existing
│   │                                           checkout-sale feature's method branch)
│   └── confirm-dispute-transfer/       # NEW — manager+ RPC calls
│       ├── model/useConfirmTransfer.ts
│       ├── model/useDisputeTransfer.ts
│       └── ui/ConfirmTransferDialog.tsx    (wraps ConfirmDialog, code input, Luhn check)
│       └── ui/DisputeTransferDialog.tsx    (wraps ConfirmDialog, reason input)
├── entities/
│   └── bank-transfer/                  # NEW entity — mirrors entities/refund/
│       └── model/
│           ├── types.ts                (Zod schema, inferred type)
│           └── queries.ts              (usePendingTransfers, useAllTransfers)
├── widgets/
│   └── BankTransfersList/              # NEW — mirrors widgets/RefundsList/index.tsx
│       └── index.tsx
└── pages/
    └── payments/index.tsx              # EDIT — add third TabsTrigger/TabsContent
```

### Pattern 1: Manager+-gated terminal-action RPC (mirror `process_refund`)

**What:** A plain Postgres RPC, `SECURITY DEFINER`, that re-checks the caller's role via `auth.uid()` server-side (never trusts the client-side `ManagerPinDialog` gate alone), performs the state transition, and calls `record_audit()` in the same transaction.
**When to use:** `confirm_transfer_payment` and `dispute_transfer_payment`.
**Example (real code, this session, `process_refund`'s auth-check shape — reuse verbatim for the new RPCs):**
```sql
-- Source: supabase/migrations/20260828000001_drop_tip_amount.sql:653-661 (process_refund)
-- 1. Verify caller is manager or admin
SELECT id INTO v_staff_id FROM profiles
WHERE id = auth.uid()
  AND role IN ('manager', 'admin');

IF NOT FOUND THEN
  RAISE EXCEPTION 'AUTH_FORBIDDEN: manager or admin role required';
END IF;
```

### Pattern 2: Client re-auth gate before firing the mutation (mirror `RefundSheet`)

**What:** The UI opens `ManagerPinDialog` with `requiredAction` set to the new RBAC action; only on `onSuccess` does it fire the mutation. The RPC's own server-side role check (Pattern 1) remains the sole authority — the PIN dialog is UX, not the security boundary.
**When to use:** Confirm/Dispute buttons on the Bank Transfers tab.
**Example:**
```tsx
// Source: src/features/process-refund/ui/RefundSheet.tsx:322-330 (real code, this session)
<ManagerPinDialog
  open={pinOpen}
  onOpenChange={setPinOpen}
  requiredAction="process_refund"
  onSuccess={() => {
    setPinOpen(false);
    void handleSubmitRefund();
  }}
/>
```

### Pattern 3: New page-level tab injection (mirror `RefundsList` on `PaymentsPage`)

**What:** `src/pages/payments/index.tsx` already composes two tabs via shadcn `Tabs`; add a third.
**Example (real code, this session — full current file):**
```tsx
// Source: src/pages/payments/index.tsx (verbatim, this session)
<Tabs defaultValue="payments" className="flex flex-1 flex-col overflow-hidden">
  <TabsList className="mx-4 mt-2 mb-0 w-fit">
    <TabsTrigger value="payments">{t('payments.tabs.payments')}</TabsTrigger>
    <TabsTrigger value="refunds">{t('payments.tabs.refunds')}</TabsTrigger>
    {/* NEW: <TabsTrigger value="bankTransfers">{t('payments.tabs.bankTransfers')}</TabsTrigger> */}
  </TabsList>
  <TabsContent value="payments" className="flex flex-1 overflow-hidden">
    <PaymentPane />
  </TabsContent>
  <TabsContent value="refunds" className="flex flex-1 overflow-hidden p-4">
    <RefundsList />
  </TabsContent>
  {/* NEW: <TabsContent value="bankTransfers" className="flex flex-1 overflow-hidden p-4">
        <BankTransfersList />
      </TabsContent> */}
</Tabs>
```
The i18n label lives in `pages.json` → `payments.tabs.*` (verified this session: `{ "title": "Payments", "tabs": { "payments": "Payments", "refunds": "Refunds" } }`), not in `wPanels.json`.

### Anti-Patterns to Avoid

- **Browser `Blob`/`<a download>` CSV export (what the spike HTML does):** Spike 005's `bank-transfers-tab.html` uses `URL.createObjectURL(blob)` + a synthetic `<a>` click — that is a plain-browser pattern and will not produce a native save dialog inside the Tauri desktop shell the way `useExportReport.ts` does. Use `save()` (`@tauri-apps/plugin-dialog`) + `writeFile()` (`@tauri-apps/plugin-fs`) instead — verified real pattern in Code Examples §4.
- **Hand-rolled CSV cell escaping (what the spike HTML does):** Spike 005's inline `csvCell()` function duplicates what `rowsToCsv`/`sanitizeCsvCell` already do (RFC-4180 quoting via `xlsx` + CWE-1236 formula-prefix escaping). Reuse `rowsToCsv`, don't reimplement.
- **Native `prompt()`/`confirm()`/`alert()`:** Explicitly forbidden by D-14. `ConfirmDialog`'s `children` slot covers both the code-entry and dispute-reason-entry cases.
- **Trusting `ManagerPinDialog` as the security boundary:** It is a client-side UX gate only. The RPC must independently re-check `auth.uid()` role, exactly like `process_refund` and `close_caja_session` already do — CLAUDE.md's Blockers/Concerns log flags at least two existing RPCs (`create_order_with_items`, `remove_tab_item`) that skip this and are tracked as a known gap; do not repeat that mistake here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Luhn check-digit generation/validation | A new Luhn implementation | `.planning/spikes/003-reference-code-design/reference-code.cjs` — already unit-proven (1000+ generated codes, 100% single-digit-error catch rate, documented 09↔90 transposition blind spot) | D-01 explicitly says reuse the design; re-deriving risks reintroducing a subtle Luhn off-by-one |
| CSV formula-injection escaping | A new `csvCell()`-style sanitizer | `rowsToCsv`/`sanitizeCsvCell` in `src/shared/lib/exporters/csv.ts` | Already handles CWE-1236 (`=,+,-,@,\t,\r` prefix) and RFC-4180 quoting via `xlsx`; the spike's inline version is a demo-only duplicate |
| Manager+ RBAC re-auth UI | A new PIN-entry component | `ManagerPinDialog` (`src/features/manager-pin-gate`) | Already wired to `STAFF_ACTIONS`/`canAccess`, already used by `process_refund`/`reopen_tab`/`close_tab` |
| Confirm/reason-entry modal | A new dialog primitive | `ConfirmDialog` (`src/shared/ui/ConfirmDialog.tsx`) — has a `children` slot for arbitrary body content and `confirmDisabled` for validation-gating | Already keyboard-accessible (Enter/Escape), already respects the idle-screen-lock guard (`useLockStateStore`) |
| Audit trail write | A new audit table/insert | `record_audit()` SQL helper, called via `PERFORM record_audit('payment.transfer_confirmed', 'payment', v_payment_id, v_before, v_after, 'rpc')` from inside the new RPC | Already truncates oversized payloads, already captures `terminal_id`, already CI-enforced against `AuditActionSchema` |

**Key insight:** Every mechanical piece of this feature (Luhn math, CSV escaping, manager re-auth, confirm dialogs, audit writes, tabbed page composition) already has exactly one canonical implementation in this codebase. The only genuinely new code is: the `bank_transfers` table + its two migrations, two new RPCs, and the React composition gluing existing widgets together in a new arrangement.

## Common Pitfalls

### Pitfall 1: A new `record_audit()` action string that isn't added to `AuditActionSchema` first fails CI, not at runtime

**What goes wrong:** `src/shared/lib/__tests__/audit-actions.test.ts` greps every migration file for `PERFORM record_audit('...'` calls and every edge function for `recordAudit(...action: '...')` calls, and fails the whole Vitest suite if the action string isn't in `AuditActionSchema.options`.
**Why it happens:** `AuditActionSchema` (`src/shared/lib/audit-actions.ts`) is a hand-maintained enum, deliberately treated as the single source of truth ("Add new actions here before adding `record_audit()` calls to RPCs" — file's own docstring).
**How to avoid:** Add the three new action strings (e.g. `payment.transfer_marked_pending`, `payment.transfer_confirmed`, `payment.transfer_disputed`) to `AuditActionSchema` in the SAME plan/commit as the migration that calls them, following the existing `// Payments` group's naming (`payment.process`, `payment.refund`).
**Warning signs:** `npm run test` fails with "not in AuditActionSchema" — this is a fast, deterministic CI gate, not a subtle bug.

### Pitfall 2: `payments.status` already carries lifecycle meaning ('completed'/'reopened_void') — adding transfer states to it would require re-auditing 5 existing call sites

**What goes wrong:** `payments.status` was extended once already (the `reopened_void` value, `supabase/migrations/20260720000002_payments_status_column.sql`), and that single addition required a companion migration (`20260720000005_fix_payment_sums_exclude_reopened_void.sql`) patching `process_payment_atomic`, `process_split_payment_atomic`, `get_caja_report`, `close_caja_session`, and `process_refund` — every place that sums `payments.amount` — to exclude the new value. A `pending`/`confirmed`/`disputed` set of values on the same column would force the same audit again, and the two lifecycles (voided-by-reopen vs. reconciliation-pending) are semantically orthogonal (a payment can in principle be both).
**Why it happens:** `payments.status` reads like a generic status field, but every existing consumer treats "anything other than `'reopened_void'`" as "counts toward revenue" — silently adding a third meaning changes that invariant everywhere at once.
**How to avoid:** Keep transfer-reconciliation state in the new sibling table (`bank_transfers.status`), not on `payments.status`. `payments.status` stays exactly `'completed' | 'reopened_void'`.
**Warning signs:** If a future plan proposes `ALTER TABLE payments ... CHECK (status IN (..., 'pending_transfer', ...))`, that is the exact anti-pattern this pitfall warns against — grep `p.status IS DISTINCT FROM 'reopened_void'` first (5 hits, verified this session) to see the blast radius.

### Pitfall 3: A still-`pending` bank-transfer payment inflates `get_caja_report`'s revenue/staff totals before it is actually confirmed as received money

**What goes wrong:** `get_caja_report`'s `v_total_revenue`/`v_cash_sales`/`v_card_sales`/`v_rappi_sales` aggregate (and the per-staff `salesTotal`) sums `payments.amount` unconditionally by method, excluding only `is_deleted`/`reopened_void` rows (verified this session, `supabase/migrations/20260828000001_drop_tip_amount.sql:919-930, 990-1008`). If a `bank_transfer` payment row is inserted at checkout time (per the Primary Recommendation, so the sale finalizes normally), its amount is counted as revenue immediately — even while its `bank_transfers.status` is still `'pending'` and might later become `'disputed'` (no money actually received).
**Why it happens:** This phase's decisions (D-01..D-14) never explicitly address whether caja/reports should treat a pending transfer as revenue yet — it's a real gap between "sale is finalized" (yes, immediately) and "money is confirmed received" (not until manager confirms).
**How to avoid:** This needs an explicit planner/user decision, not a silent default. Two reasonable options: (a) leave `get_caja_report`/`get_payment_methods_report` unchanged — a bank-transfer sale is bill-generated revenue the same as a cash sale is upon completion, and a later `disputed` outcome is handled the same way an unresolved discrepancy always is (manual follow-up, possibly a `process_refund`); or (b) add a `bank_transfer_pending` breakout column to the caja/report aggregates so admin can see "how much of today's revenue is still unconfirmed." Flagged in Open Questions below — do not resolve silently in the plan without surfacing it.
**Warning signs:** A store owner asks "why does today's revenue not match what's actually in the bank" and the answer turns out to be an unresolved pending or disputed transfer baked into `totalRevenue`.

### Pitfall 4: `payment_method` is a real Postgres ENUM type, not a text CHECK — adding a value has transaction-timing rules

**What goes wrong:** `ALTER TYPE payment_method ADD VALUE 'bank_transfer'` must be committed before the new value can be referenced by name in the same migration's later statements (pre-PG12 this was a hard error; modern Postgres relaxed this but the safe, portable pattern used elsewhere in Postgres tooling is still to add the value in its own transaction). This project's migrations wrap `BEGIN; ... COMMIT;` around each change (`payments_status_column.sql` shown as the pattern).
**Why it happens:** `payment_method` is confirmed (this session, `supabase.types.ts:1924, 2059`) to be a genuine enum type (`Database["public"]["Enums"]["payment_method"]`), unlike `payments.status`, which is a plain `text` + CHECK column (`payments_status_column.sql:24-26`) — the two extension mechanisms are NOT the same, and the CI/migration pattern that worked for `status` does not directly apply to `payment_method`.
**How to avoid:** Put `ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'bank_transfer';` in its own migration file (or its own leading statement/transaction), separate from the migration that whitelists `'bank_transfer'` inside `process_payment_atomic`'s `IF p_method NOT IN (...)` check.
**Warning signs:** `unsafe use of new value "bank_transfer" of enum type payment_method` Postgres error at migration-apply time.

### Pitfall 5: `hold-sale` is not a "deferred payment" precedent — don't reuse its pattern

**What goes wrong:** The phase description explicitly asks whether `hold-sale` shows how "sale done, payment pending" is handled today. It does not: `useHoldSale.ts` (verified this session, full file) is a pure Zustand cart hold (`heldCart`/`holdCart`/`resumeHeld`/`discardHeld`) — nothing is persisted to the database, no tab/order/payment rows exist until the held cart is resumed and paid normally. There is no existing "sale is finalized but payment is outstanding" state anywhere in the schema.
**Why it happens:** The names sound similar ("held" vs "pending"), but `hold-sale` operates entirely before checkout; this phase needs a state that exists entirely after checkout.
**How to avoid:** Design `bank_transfer` as a payment method that DOES complete the sale (tab reaches `'paid'`, receipt prints, inventory decrements) exactly like `cash`/`card` do today — only the *reconciliation* (did the money actually arrive) is deferred, tracked in the new sibling table, not the sale itself.

## Code Examples

### 1. Reference code generation + validation (reuse verbatim, D-01/D-02)

```javascript
// Source: .planning/spikes/003-reference-code-design/reference-code.cjs (verified, read this session)
function luhnCheckDigit(payloadDigits) {
  let sum = 0;
  const digits = payloadDigits.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

function generateCode(randomFn = Math.random) {
  let payload = '';
  for (let i = 0; i < 6; i++) payload += Math.floor(randomFn() * 10);
  return payload + String(luhnCheckDigit(payload));
}

function isValidCode(code) {
  if (!/^\d{7}$/.test(code)) return false;
  const payload = code.slice(0, 6);
  const check = Number(code[6]);
  return luhnCheckDigit(payload) === check;
}

function generateUniqueCode(pendingCodes, randomFn = Math.random) {
  let code;
  let attempts = 0;
  do {
    code = generateCode(randomFn);
    attempts++;
    if (attempts > 1000) throw new Error('pending-code space exhausted — widen payload length');
  } while (pendingCodes.has(code));
  return code;
}
```
Port this into `supabase/migrations/` as a PL/pgSQL function (server-side generation is the authority per Pattern 1), and/or into `src/shared/lib/` as a pure TS module for instant client-side typo feedback before the RPC round-trip — either way, this exact algorithm, not a re-derivation.

### 2. Manager+ role check + audit (real code, mirror for `confirm_transfer_payment`)

```sql
-- Source: supabase/migrations/20260828000001_drop_tip_amount.sql:639-766 (process_refund, verified this session)
CREATE OR REPLACE FUNCTION public.process_refund(p_original_payment_id uuid, p_items jsonb, p_reason text, p_manager_pin text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_id uuid;
  ...
BEGIN
  -- 1. Verify caller is manager or admin
  SELECT id INTO v_staff_id FROM profiles
  WHERE id = auth.uid()
    AND role IN ('manager', 'admin');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTH_FORBIDDEN: manager or admin role required';
  END IF;
  ...
  -- AUDIT: record refund (Phase 14-03)
  PERFORM record_audit(
    'payment.refund',
    'payment',
    p_original_payment_id,
    to_jsonb(v_payment),
    v_refund_row,
    'rpc'
  );
  RETURN v_refund_id;
END;
$function$;
```

### 3. RBAC action registration (real code, `src/shared/lib/rbac.ts:13-55`, verified this session — full current arrays)

```typescript
export const STAFF_ACTIONS = [
  'create_order',
  'view_own_tabs',
  'view_all_tabs',
  'clock_in',
  'clock_out',
  'close_tab',
  'view_reports',
  'adjust_inventory',
  'manage_products',
  'manage_staff',
  'manage_settings',
  'delete_tab',
  'view_all_shifts',
  'manage_caja',
  'process_refund',
  'view_audit_log',
  'edit_paid_tab',
  'reopen_tab',
  // NEW: 'confirm_transfer_payment', 'dispute_transfer_payment',
] as const;

const MANAGER_EXTRA: ReadonlySet<StaffAction> = new Set([
  'close_tab',
  'view_reports',
  'adjust_inventory',
  'manage_products',
  'manage_caja',
  'process_refund',
  'view_audit_log',
  'edit_paid_tab',
  'reopen_tab',
  // NEW: 'confirm_transfer_payment', 'dispute_transfer_payment',
]);
```
`markPendingTransfer` needs no new RBAC action — it happens inside the existing checkout flow, gated the same way `create_order` already is (any cashier).

### 4. Real CSV export mechanism (Tauri-native, not browser Blob — mirror for D-13)

```typescript
// Source: src/features/export-report/model/useExportReport.ts (verified this session, real pattern)
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { csvToBytes, rowsToCsv, type CsvColumn } from '@shared/lib/exporters/csv';

const BANK_TRANSFERS_CSV_COLUMNS: CsvColumn<BankTransferCsvRow>[] = [
  { key: 'referenceCode', header: 'Reference Code' },
  { key: 'customerName', header: 'Customer' },
  { key: 'customerPhone', header: 'Phone' },
  { key: 'amount', header: 'Amount' },
  { key: 'status', header: 'Status' },
  { key: 'createdAt', header: 'Created At' },
  { key: 'confirmedBy', header: 'Confirmed By' },
];

// inside the export handler:
const bytes = csvToBytes(rowsToCsv(rows, BANK_TRANSFERS_CSV_COLUMNS));
const filePath = await save({
  defaultPath: `bank-transfers-${dateStr}.csv`,
  filters: [{ name: 'CSV', extensions: ['csv'] }],
});
if (filePath === null) return; // user cancelled
await writeFile(filePath, bytes);
```

### 5. `payments.reference_number` — the existing column to reuse for the code, not a new column

```typescript
// Source: src/widgets/PaymentModal/ui/PaymentForm.tsx:433 (verified this session)
// Existing usage: card auth-code reference
? { referenceNumber: row.cardReference.trim() }
// New usage for this phase: the same field carries the 7-digit Luhn code
// { referenceNumber: generatedCode }  // e.g. "4829016"
```

## State of the Art

Not applicable in the traditional "library version" sense — this is a same-codebase pattern-reuse phase, not a framework/library integration. The one genuinely evolving piece is the `payment_method` enum, which has drifted since bar-pos: `'tab_transfer'` and `'rappi'` are both bar-pos-era leftovers (`'tab_transfer'` is unused by any current RPC — confirmed no RPC whitelist accepts it; `'rappi'` is still actively used as a live payment-method label, seemingly repurposed for a different meaning than its name suggests, per `BillingSettingsTab.tsx`'s `enabledMethods.bbvaCard`/`rappi` toggles). Do not reuse `'tab_transfer'` for the bank-transfer feature despite the name-collision temptation — it is semantically a different (removed) bar-pos concept and its DB enum value is a dead leftover, not a hook to build on.

**Deprecated/outdated:**
- `'tab_transfer'` payment_method enum value — present in the DB type but not accepted by any current RPC (`process_payment_atomic`/`process_split_payment_atomic` both check `IF v_method NOT IN ('cash', 'card', 'rappi')`, verified this session). Do not confuse with this phase's bank transfer.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The sale should finalize (tab reaches `'paid'`, receipt prints, inventory decrements) at the moment the cashier picks "bank transfer" as the payment method, with only *reconciliation* deferred — not the sale itself. | Summary, Architecture, Pitfall 5 | If the real intent is closer to a genuinely unpaid/open sale until confirmed (more like a layaway), the schema/RPC design (sibling table on a completed `payments` row) is wrong and needs to instead extend `tabs.status` with a new "awaiting transfer" value, which is a much bigger blast radius (every `tabs.status = 'open'`/`'paid'` check across the codebase). CONTEXT.md's "customer name+phone on paper slip, replaces receipt reconciliation" framing supports A1, but this was not one of the explicitly locked D-01..D-14 decisions — confirm with the user/planner before committing to schema. |
| A2 | A `bank_transfer` payment counts toward `get_caja_report`/`get_payment_methods_report` revenue totals immediately at checkout, same as cash/card, with no special exclusion while `pending`. | Pitfall 3 | If the store owner expects "pending" transfers to be excluded from daily revenue until confirmed, `get_caja_report`'s 5 summing call sites need the same kind of `status IS DISTINCT FROM` filter the `reopened_void` precedent used — a real design decision, not resolved by CONTEXT.md's locked decisions. |
| A3 | `bank_transfers` (new sibling table name) is a reasonable name; CONTEXT.md explicitly says exact column/table names are Claude's Discretion, "not necessarily" the spike's names. | Architecture, Standard Stack | Low risk — purely cosmetic, easy to rename in a plan review. |

## Open Questions

1. **Does a pending/disputed bank-transfer sale count as revenue in caja/report totals before confirmation?**
   - What we know: `get_caja_report`/`get_payment_methods_report` sum `payments.amount` unconditionally per method (excluding only `is_deleted`/`reopened_void`); no existing "exclude while unconfirmed" filter exists for any payment method.
   - What's unclear: CONTEXT.md's D-01..D-14 never address this — it's a genuine gap between "sale is legally final" (yes) and "money is confirmed received" (deferred).
   - Recommendation: Surface this explicitly to the user/planner before locking the plan; Pitfall 3 lays out both options.

2. **Should `markPendingTransfer` be reachable only at checkout time, or also later on an already-completed cash/card sale (e.g. a customer who initially said "cash" but actually wants to transfer)?**
   - What we know: CONTEXT.md's real-world description says "sometimes at checkout and sometimes later that night" — but this reads as "the transfer arrives late," not "the payment-method choice is made late." The sale itself (bill) is generated at checkout in every case per the original problem statement.
   - What's unclear: Whether the planner should scope `markPendingTransfer` purely into the `checkout-sale`/`PaymentForm` flow (recommended, simpler) or also expose it as a retroactive action from `PaymentPane`'s payment-history rows (more flexible, more RPC surface).
   - Recommendation: Scope to checkout-time only unless the user confirms the retroactive case is needed — it's not in the locked decisions.

3. **Is the "stale ~8h" pending threshold hardcoded or configurable (Claude's Discretion, unresolved)?**
   - What we know: The `settings` key-value table + Zod schema pattern (`near_expiry` key, `{thresholdDays: 14}`) is the established precedent for a configurable threshold.
   - What's unclear: Whether this specific value is worth the extra Settings-tab UI for a v1 of this feature.
   - Recommendation: Hardcode 8h as a named constant for this phase (matches spike default), following the "don't over-build Claude's Discretion items" bias — add a Settings toggle only if the user asks in review.

## Environment Availability

Not applicable — no new external tools, services, or runtimes are required. This phase only touches the existing Supabase project (already available in every dev/CI environment per `CLAUDE.md`) and existing npm dependencies.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4 (unit) + Playwright 1.59 (E2E) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (E2E) |
| Quick run command | `npx vitest run src/path/to.test.ts` |
| Full suite command | `npm run test` (unit), `npm run test:e2e` (E2E) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BTP-01 | Reference code generation/uniqueness/Luhn validation | unit | `npx vitest run src/shared/lib/bank-transfer-code.test.ts` | ❌ Wave 0 (new file, port `.planning/spikes/003-reference-code-design/reference-code.cjs`'s self-check assertions) |
| BTP-02 | Checkout with `bank_transfer` method finalizes sale + creates pending row | integration/E2E | `npx playwright test e2e/checkout/` (extend existing file) or new `e2e/payments/bank-transfer-checkout.spec.ts` | ❌ Wave 0 |
| BTP-03/BTP-04 | Confirm/dispute RPC — role gate, Luhn re-check, audit write | RPC integration test | mirror `src/features/process-refund/process-refund-rpc.integration.test.ts` pattern | ❌ Wave 0 (new `*.integration.test.ts`) |
| BTP-05 | No auto-confirm path — every transition requires the RPC call explicitly | unit + RPC integration | assert RPC requires explicit `p_entered_code`/`p_reason` args; no code path calls confirm/dispute without user input | Covered by BTP-03/04 tests |
| BTP-06 | Audit trail for all 3 transitions | unit (CI gate) | `npx vitest run src/shared/lib/__tests__/audit-actions.test.ts` (existing file — auto-covers new action strings once added to `AuditActionSchema` + migrations) | ✅ exists |
| BTP-07/BTP-12 | Bank Transfers tab UI — list, stale flag, badges | component + E2E | new `src/widgets/BankTransfersList/BankTransfersList.test.tsx` + `e2e/payments/bank-transfers-tab.spec.ts` | ❌ Wave 0 |
| BTP-08 | CSV export — CWE-1236 escaping, correct rows | unit | mirror `src/shared/lib/exporters/csv.test.ts` | ✅ pattern exists, extend or add a case |
| BTP-09 | RBAC gating (cashier cannot confirm/dispute) | unit | extend `src/shared/lib/rbac.test.ts` | ✅ pattern exists |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>`
- **Per wave merge:** `npm run test` (full unit suite)
- **Phase gate:** `npm run test:e2e` full suite green before `/gsd-verify-work`, per this project's mandatory-automated-testing policy (no `human_needed` terminal states, no manual UAT — see CLAUDE.md).

### Wave 0 Gaps
- [ ] `src/shared/lib/bank-transfer-code.test.ts` (or equivalent) — ports the spike's Luhn self-check assertions into a real Vitest file
- [ ] RPC integration test file(s) for `confirm_transfer_payment`/`dispute_transfer_payment` — mirror `src/features/process-refund/process-refund-rpc.integration.test.ts`'s structure (requires `.env.local` + remote Supabase, per that file's existing convention)
- [ ] `e2e/payments/bank-transfers-tab.spec.ts` — new spec file in the existing `e2e/payments/` folder, following `e2e/payments/refund.spec.ts`'s exact conventions (`getServiceClient()` seeding, `loginAs(page, role)`, PINKeypad button-clicking for `ManagerPinDialog`, `requireIntegrationEnv()` gate)
- [ ] No new test framework/config needed — both Vitest and Playwright are already fully configured for this project.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new surface) | Reuses existing Supabase Auth session; no new auth flow |
| V3 Session Management | No | No new session concept |
| V4 Access Control | Yes | Server-side `auth.uid()` role check inside the new RPCs (Pattern 1), never trusting the client-side `ManagerPinDialog` alone — mirrors `process_refund`'s and `close_caja_session`'s existing pattern |
| V5 Input Validation | Yes | Zod schema for the new entity (`src/entities/bank-transfer/model/types.ts`), server-side Luhn re-validation inside the RPC (never trust client-side Luhn check alone — D-08), `dispute_reason` non-empty check server-side (D-10) |
| V6 Cryptography | No | No cryptographic operation — Luhn is a checksum, not a security control (explicitly documented in the spike as catching *typos*, not fraud) |
| V7 Error Handling & Logging | Yes | `record_audit()` for every transition (D-09), structured `AppErrorCode` mapping in the TS mutation hook (mirror `useProcessRefund.ts`'s `AUTH_FORBIDDEN`/`VALIDATION_ERROR` mapping) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client bypasses `ManagerPinDialog` and calls the RPC directly with a forged role claim | Elevation of Privilege | Server-side `auth.uid()` → `profiles.role IN ('manager','admin')` check inside the RPC itself (Pattern 1) — this is the actual security boundary, not the dialog |
| CSV formula injection via customer name/phone fields | Tampering | `rowsToCsv`'s existing `sanitizeCsvCell` (CWE-1236 prefix escaping) — reuse, don't hand-roll |
| Reference-code guessing (a malicious actor tries random 7-digit codes to falsely confirm a sale they didn't pay for) | Spoofing | Not fully mitigated by Luhn alone (Luhn is a typo-catcher, ~1-in-10 codes are Luhn-valid by chance within a small pending set) — but every confirm still requires manager+ role AND matching the exact code to a specific pending sale (`enteredCode !== record.referenceCode` check in the spike's state model, verified this session) AND is audit-logged with actor identity, so a false confirm is attributable after the fact even if not preventable in real time. This residual risk is inherent to the manual-reconciliation design the user explicitly chose (D-04/D-05) over any automated bank-verified alternative — not a gap this phase can close without contradicting D-04. |

## Sources

### Primary (HIGH confidence — read this session)
- `D:/Projects/Code/supermarket-pos/src/shared/lib/supabase.types.ts` — `payments`, `tabs`, `refunds` table shapes, `payment_method`/`tab_status` enums (lines 656-758, 1207-1248, 1560-1620, 1924, 2059)
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql` and `20260828000001_drop_tip_amount.sql` — current `process_direct_sale_atomic`, `process_payment_atomic`, `process_split_payment_atomic`, `process_refund`, `close_caja_session`, `get_caja_report`, `get_payment_methods_report` definitions
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260720000002_payments_status_column.sql`, `20260703000001_record_audit_terminal_id.sql` — `payments.status` CHECK precedent, `record_audit()` signature
- `D:/Projects/Code/supermarket-pos/src/shared/lib/rbac.ts`, `src/shared/lib/audit-actions.ts`, `src/shared/lib/__tests__/audit-actions.test.ts` — RBAC action registry, audit action CI gate
- `D:/Projects/Code/supermarket-pos/src/features/process-refund/model/useProcessRefund.ts`, `src/features/process-refund/ui/RefundSheet.tsx` — manager+-gated mutation pattern
- `D:/Projects/Code/supermarket-pos/src/shared/ui/ConfirmDialog.tsx`, `src/features/manager-pin-gate/ui/ManagerPinDialog.tsx` — reusable dialog primitives
- `D:/Projects/Code/supermarket-pos/src/shared/lib/exporters/csv.ts`, `src/features/export-report/model/useExportReport.ts` — real CSV export mechanism (Tauri-native, not browser Blob)
- `D:/Projects/Code/supermarket-pos/src/pages/payments/index.tsx`, `src/widgets/PaymentPane/ui/PaymentPane.tsx`, `src/widgets/RefundsList/index.tsx` — page/tab composition
- `D:/Projects/Code/supermarket-pos/src/features/hold-sale/model/useHoldSale.ts` — confirmed NOT a "deferred payment" precedent
- `D:/Projects/Code/supermarket-pos/src/entities/settings/model/queries.ts` — configurable-threshold pattern precedent (`near_expiry`)
- `D:/Projects/Code/supermarket-pos/supabase/functions/admin-reset-pin/index.ts` — freshest edge-function precedent (Phase 22, not used as the primary pattern since D-07 points to `process_refund` instead, but read for comparison)
- `.planning/spikes/003-reference-code-design/reference-code.cjs`, `.planning/spikes/004-transfer-state-model/state-model.cjs`, `.planning/spikes/005-payments-transfer-view/bank-transfers-tab.html` — required reading, already-validated designs per task instructions

### Secondary (MEDIUM confidence)
- None — this research was entirely codebase-grounded; no web search was needed since Spike 002 already closed the external bank-integration research and this pass was scoped to codebase-implementation only.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack / existing-pattern reuse: HIGH — every cited file/line was read this session, not recalled from training data
- Architecture (schema shape recommendation): HIGH on "what exists today," MEDIUM on "sibling table is the right shape" (a reasoned recommendation following the closest in-repo precedent, `refunds`, not a locked decision — flagged as such)
- Pitfalls: HIGH — Pitfalls 1, 2, 4, 5 are directly sourced from reading the actual migrations/tests; Pitfall 3 is a genuine open gap in the locked decisions, flagged as an Open Question, not asserted as fact

**Research date:** 2026-08-31
**Valid until:** No external time pressure (no library-version drift risk since zero new dependencies) — safe to treat as valid through this phase's full planning+execution window; re-verify only if `payments`/`tabs` schema changes land from another phase in the meantime.
