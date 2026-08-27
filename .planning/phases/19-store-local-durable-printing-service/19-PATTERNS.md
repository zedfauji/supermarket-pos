# Phase 19: Store-Local Durable Printing Service - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 17
**Analogs found:** 14 / 17 (3 have no in-repo analog — new Rust crate infra)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `broker/src/main.rs` (SCM entry) | service | event-driven | none (new tier) | no analog — see RESEARCH.md Pattern 4 |
| `broker/src/http.rs` | route/controller | request-response | `.planning/spikes/001-windows-print-broker/broker/src/main.rs` (spike's own handler) | exact (spike is the reference impl) |
| `broker/src/ledger.rs` | model/migration | CRUD | spike `main.rs` SQLite section + `src-tauri` has no SQLite precedent | role-match (spike only) |
| `broker/src/delivery.rs` | service | event-driven/batch | `src-tauri/src/commands/printer.rs` (`win_print` module, WinSpool calls) | exact (Win32 call sequence) |
| `broker/src/retry.rs` | utility | batch | spike main.rs retry loop | role-match (spike only) |
| `src-tauri/src/commands/printer.rs` (internals swap) | command/service | request-response | itself (existing file, modify in place) | exact |
| `src/shared/lib/pos-printer.ts` (internals swap) | utility/service | request-response | itself (existing file, modify in place) | exact |
| `src/shared/lib/result.ts` (add AppErrorCode values) | utility | — | itself (existing file, modify in place) | exact |
| `src/entities/print-job/model/types.ts` | model | CRUD | `src/entities/audit-log/model/types.ts` | exact |
| `src/entities/print-job/model/queries.ts` | model/service | CRUD (via Tauri `invoke`, not Supabase) | `src/entities/audit-log/model/queries.ts` | role-match (data source differs — broker HTTP via `invoke`, not `supabase.from`) |
| `src/shared/ui/PrintJobStatusBadge.tsx` | component | — | `src/shared/ui/StatusBadge.tsx` | exact |
| `src/features/reprint-receipt/ui/ReprintButton.tsx` (extend) | component | request-response | itself (existing file, modify in place) | exact |
| `src/widgets/PrintJobsTable/PrintJobsTable.tsx` | component | CRUD (read) | `src/widgets/AuditLogTable/AuditLogTable.tsx` | exact |
| `src/widgets/PrintJobsTable/PrintJobFilterBar.tsx` | component | — | `src/widgets/AuditLogTable/AuditLogFilterBar.tsx` | exact |
| `src/widgets/PrintJobsTable/PrintJobDetailSheet.tsx` | component | — | `src/widgets/AuditLogTable/AuditLogDetailSheet.tsx` | exact |
| `src/pages/audit/index.tsx` (add Tabs wrapper) | page | — | `src/pages/reports/index.tsx` (Tabs pattern) | exact |
| Confirm dialog ("Did this print?") | component | — | `src/shared/ui/ConfirmDialog.tsx` | exact |

## Pattern Assignments

### `broker/src/http.rs`, `ledger.rs`, `delivery.rs`, `retry.rs`, `main.rs` (new Rust crate)

**Analog:** `.planning/spikes/001-windows-print-broker/broker/src/main.rs` — this is the authoritative reference implementation per CONTEXT.md canonical_refs ("production code should build from this, not from scratch"). Read it directly during execution; do not re-derive from RESEARCH.md excerpts alone.

**Durable-accept-before-response** (spike `main.rs:167-179`, reproduced in RESEARCH.md Pattern 1):
```rust
let result = conn.execute(
    "INSERT INTO jobs (id, idempotency_key, printer_name, origin, payload, status, attempts, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'accepted', 0, ?6, ?6)",
    params![job_id, req.idempotency_key, req.printer_name, req.origin, payload, ts],
);
match result {
    Ok(_) => { /* record_event + return 200 job_id */ }
    Err(e) => return err_json(500, "persistence_failed", &format!("{e}"), None),
}
```

**Idempotency dedup before insert** (spike `main.rs:151-162`):
```rust
let existing: Option<(String, String)> = conn
    .query_row("SELECT id, status FROM jobs WHERE idempotency_key = ?1", params![req.idempotency_key],
        |r| Ok((r.get(0)?, r.get(1)?))).optional().unwrap_or(None);
if let Some((id, status)) = existing {
    record_event(conn, &id, "duplicate_submit", "idempotency_key already accepted; no new job created");
    return ok_json(&SubmitResp { job_id: id, status });
}
```

**Never blind-resubmit ambiguous handoff** (spike `main.rs:495-499`):
```rust
Ok(None) => {
    conn.execute("UPDATE jobs SET status='unknown', ... WHERE id=?2", params![ts, id]).ok();
    record_event(conn, &id, "ambiguous_handoff",
        "GetJob returned no data for this win32_job_id; marked unknown, will not auto-resubmit");
}
```

**SQLite durability pragmas** (spike `main.rs:61-64`, carry forward unchanged):
```rust
let conn = Connection::open(db_path()).expect("open sqlite db");
conn.pragma_update(None, "journal_mode", "WAL").ok();
conn.pragma_update(None, "synchronous", "FULL").ok();
```

**delivery.rs's WinSpool submission** must port (not reimplement) the exact `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter` sequence already proven twice in this repo — see next section.

---

### `src-tauri/src/commands/printer.rs` — WinSpool call sequence to port into `broker/src/delivery.rs`

**Analog:** itself, `win_print` module (lines 158-218) — same file also shows the `#[tauri::command]` → `Result<(), String>` boundary pattern that the migrated Tauri commands should keep using for their own (now broker-calling) internals.

**Win32 print sequence** (`src-tauri/src/commands/printer.rs:181-217`, named-printer variant — spike already extended this to take an explicit printer name and capture the job ID):
```rust
pub fn send_raw(bytes: &[u8]) -> Result<(), String> {
    let name = default_printer_name()?;
    let mut handle = PRINTER_HANDLE::default();
    unsafe {
        OpenPrinterW(&name, &mut handle, None)
            .map_err(|e| format!("OpenPrinter failed: {}", e.message()))?;
    }
    let mut doc_name: Vec<u16> = "Receipt\0".encode_utf16().collect();
    let mut datatype: Vec<u16> = "RAW\0".encode_utf16().collect();
    let doc_info = DOC_INFO_1W { pDocName: PWSTR(doc_name.as_mut_ptr()), pOutputFile: PWSTR::null(), pDatatype: PWSTR(datatype.as_mut_ptr()) };
    let job = unsafe { StartDocPrinterW(handle, 1, &doc_info) };
    if job == 0 { let _ = unsafe { ClosePrinter(handle) }; return Err("StartDocPrinter failed (returned job id 0).".to_string()); }
    let mut written: u32 = 0;
    let ok = unsafe { WritePrinter(handle, bytes.as_ptr().cast(), bytes.len() as u32, std::ptr::addr_of_mut!(written)) };
    unsafe { let _ = EndDocPrinter(handle); let _ = ClosePrinter(handle); }
    if ok.0 == 0 || written != bytes.len() as u32 { return Err("WritePrinter failed or incomplete write.".to_string()); }
    Ok(())
}
```
`delivery.rs` additionally needs `GetJobW` (status polling, JOB_INFO_2 bitfield per RESEARCH.md Don't Hand-Roll) — not present in `printer.rs` today; port from the spike's `win_print` module which already extended this exact pattern with job-ID capture and `GetJobW`.

**`#[tauri::command]` boundary + `Result<(), String>` convention** (`printer.rs:231-254`) — keep this shape for the migrated `print_receipt`/`print_raw_text`/`test_print`/`open_cash_drawer` commands; only their *internals* change from `try_send_raw` (direct WinSpool) to `submit_to_broker` (HTTP POST to broker, per RESEARCH.md Code Examples). Error strings returned here surface as the `e` in `pos-printer.ts`'s `catch (e)` blocks — keep them short/structured enough to map onto new `AppErrorCode`s client-side (see below).

---

### `src/shared/lib/pos-printer.ts` (internals swap, D-09)

**Analog:** itself — public API (`printReceipt`, `openCashDrawer`, `printRawText`, `testPrint`) is locked; only the body of each `invoke(...)` call site changes internally.

**Existing retry-loop + Result mapping pattern to preserve** (`pos-printer.ts:64-107`):
```typescript
export async function printReceipt(data: ReceiptData, settings: ReceiptSettings): Promise<Result<void>> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    ...
    for (let attempt = 1; attempt <= MAX_PRINT_ATTEMPTS; attempt++) {
      try {
        await invoke('print_receipt', { lines: ..., logoDataUrl: ..., paperWidthChars: ... });
        return ok(undefined);
      } catch (e) {
        lastError = e;
        logger.warn('printer.receipt.attempt_failed', { attempt, raw: String(e) });
        ...
      }
    }
    toast.error(i18n.t('featOrders:printer.printFailedAfterRetries', ...), { id: toastId });
    return err(tauriError(lastError instanceof Error ? lastError.message : 'Print failed', lastError));
  }
  ...
}
```
Note: this client-side `MAX_PRINT_ATTEMPTS` retry loop is now redundant with the broker's own D-10 per-failure-class retry — per RESEARCH.md this client loop is really only for the `invoke()` IPC call to the Rust command layer (fast, local), not network retries; the broker call inside the Rust command is a single attempt with a short connect-timeout (D-12), and broker-side retry happens after durable acceptance. Do not stack unbounded retries across both layers.

**Error-code mapping to add:** `tauriError(message, raw)` factory (`result.ts:360`) is the existing pattern for wrapping any Tauri/IPC-origin error; new broker-specific `AppErrorCode` values (broker-unreachable, job-rejected, job-unknown) should be added to the union in `result.ts:165-205` following the exact style of existing entries (short SCREAMING_SNAKE_CASE + inline comment), then used via a `err({ code: 'PRINT_BROKER_UNREACHABLE' as AppErrorCode, message, raw })` construction — same shape as `tauriError`.

---

### `src/entities/print-job/model/types.ts` + `queries.ts`

**Analog:** `src/entities/audit-log/model/` — structurally identical (types.ts re-exports/derives from a Zod-backed shape; queries.ts owns the query-key factory + fetch function), but the data source differs (RESEARCH.md Pitfall 5).

**types.ts pattern** (`src/entities/audit-log/model/types.ts`, full file — 2 lines):
```typescript
export type { AuditLog, AuditLogFilters } from '@shared/lib/domain';
```
Print-job types should follow the same "single source of truth in `domain.ts`, Zod-inferred" convention — add `PrintJobSchema`/`PrintJobFilters` to `src/shared/lib/domain.ts`, then re-export here exactly like this.

**queries.ts pattern — query-key factory + infinite query** (`src/entities/audit-log/model/queries.ts:20-23, 54-92`):
```typescript
export const auditKeys = {
  all: ['audit-logs'] as const,
  list: (filters: AuditLogFilters) => [...auditKeys.all, 'list', filters] as const,
};

export function useAuditLogs(filters: AuditLogFilters) {
  return useInfiniteQuery({
    queryKey: auditKeys.list(filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<AuditLog[]> => { /* fetch page */ },
    getNextPageParam: (lastPage, allPages) => lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  });
}
```
**Divergence required:** replace the `db.from('audit_logs').select(...)` Supabase call (`queries.ts:59-85`) with `await invoke('get_print_audit', { filters, pageParam })` (new Tauri command → broker `/audit` HTTP call, per RESEARCH.md system diagram) — same `useInfiniteQuery` shape, same query-key-factory convention (`printJobKeys.list(filters)`), different `queryFn` body. Do not copy the `db as any` Supabase-cast pattern — the broker path has no Supabase table at all, so no cast/`eslint-disable` for that reason is needed (Tauri `invoke` returns typed JSON to parse with Zod instead).

---

### `src/shared/ui/PrintJobStatusBadge.tsx`

**Analog:** `src/shared/ui/StatusBadge.tsx` — read this file directly for its exact prop shape/variant-mapping convention before writing the new badge; per UI-SPEC, the new badge deliberately overrides `StatusBadge`'s default `font-semibold` to `font-medium` to stay in the phase's 2-weight typography budget, so it is a sibling component (own file), not a `StatusBadge` prop-driven variant.

---

### `src/features/reprint-receipt/ui/ReprintButton.tsx` (extend, D-05)

**Analog:** itself — existing full file (58 lines) shown above; extension point is adding a `<PrintJobStatusBadge>` next to the existing `<POSButton>`, following the file's existing conventions: `useTranslation('wPanels')` namespace, `toast.error(t(...))` on failure, `busy` state via `useState`.

**Existing pattern to extend from** (`ReprintButton.tsx:25-58`, full component):
```tsx
export function ReprintButton({ payment }: ReprintButtonProps) {
  const { t } = useTranslation('wPanels');
  const [busy, setBusy] = useState(false);
  ...
  async function handleClick() {
    setBusy(true);
    try {
      const receipt = await queryClient.fetchQuery({ queryKey: paymentReceiptKeys.byTab(payment.tabId), queryFn: () => fetchReceiptDataForPayment(payment.tabId) });
      await printReceipt(receipt, settings ?? ReceiptSettingsSchema.parse({}));
    } catch {
      toast.error(t('paymentPane.reprintDataFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <POSButton variant="outline" size="sm" disabled={busy} onClick={() => { void handleClick(); }}>
      {busy ? t('paymentPane.reprinting') : t('paymentPane.reprint')}
    </POSButton>
  );
}
```
Add the job-status badge as a sibling element next to `<POSButton>` (per UI-SPEC "inline, next to the triggering control"), sourcing job status from a new `usePrintJob(jobId)` hook in `entities/print-job`, wired from the `job_id` now returned by `printReceipt`'s `Result` (D-05 requires `pos-printer.ts` to surface the broker's job ID somewhere — confirm exact return-shape addition during planning, since `printReceipt` currently returns `Result<void>`, not `Result<{jobId: string}>`).

---

### `src/widgets/PrintJobsTable/` (PrintJobsTable, PrintJobFilterBar, PrintJobDetailSheet)

**Analog:** `src/widgets/AuditLogTable/` (`AuditLogTable.tsx`, `AuditLogFilterBar.tsx`, `AuditLogDetailSheet.tsx`) — same `DataTable` + staged-filter-then-Apply + click-row-opens-Sheet composition, per UI-SPEC "same UI components as AuditLogTable, different data source."

**Table composition + a11y pattern** (`AuditLogTable.tsx:38-62`, imports lines 12-28):
```tsx
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLogs } from '@entities/audit-log';
import { DataTable } from '@shared/ui/DataTable';
import { EmptyState } from '@shared/ui/EmptyState';
import { EntityIdCell } from '@shared/ui/EntityIdCell';
import { AuditLogDetailSheet } from './AuditLogDetailSheet';
import { AuditLogFilterBar } from './AuditLogFilterBar';

export function AuditLogTable() {
  const { t } = useTranslation('wAdmin');
  const [staged, setStaged] = useState<AuditLogFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<AuditLogFilters>({});
  const [selectedRow, setSelectedRow] = useState<AuditLog | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useAuditLogs(appliedFilters);
  const rows = useMemo(() => (data?.pages ?? []).flat(), [data]);
  function openSheet(row: AuditLog) { setSelectedRow(row); setSheetOpen(true); }
  const columns: ColumnDef<AuditLog>[] = [ /* action column with sr-only "View diff" trigger */ ];
  ...
}
```
`PrintJobsTable` should follow this exactly (same `t('wAdmin:printJobsTable...')` namespace convention per UI-SPEC copy table, same `useMemo`-flattened infinite-query pages, same `openSheet` pattern), swapping `useAuditLogs` for the new `usePrintJobs` hook, and swapping the row's sr-only trigger label to `"View print job {jobId} from {createdAt}"` per UI-SPEC.

**Detail Sheet** (`AuditLogDetailSheet.tsx`) — reuse the right-side `Sheet` shape verbatim; per UI-SPEC the print-job version renders an **event timeline** (ordered list of timestamp + event label + optional error) instead of `JsonDiffViewer`'s before/after diff — read `AuditLogDetailSheet.tsx` directly for the `Sheet`/`SheetContent`/`SheetHeader` wiring to copy, but do not reuse `JsonDiffViewer` itself.

**Filter bar** (`AuditLogFilterBar.tsx`) — reuse the staged-filter-then-Apply UX/shape verbatim per UI-SPEC ("reuse that component's pattern/shape for a new `PrintJobFilterBar`, not a divergent filter UI"); read it directly for its exact `staged`/`onApply` prop contract.

---

### `src/pages/audit/index.tsx` (add Tabs wrapper, D-13)

**Analog:** `src/pages/reports/index.tsx` — Tabs composition pattern (imports + `Tabs defaultValue=...` wrapping `PageContainer` children).

**Current `audit/index.tsx`** (full file, to be extended, not replaced):
```tsx
import { useTranslation } from 'react-i18next';
import { AuditLogTable } from '@widgets/AuditLogTable';
import { PageContainer } from '@shared/ui';

export default function AuditPage() {
  const { t } = useTranslation('pages');
  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-auto">
        <PageContainer title={t('audit.title')} backTo="/home">
          <AuditLogTable />
        </PageContainer>
      </main>
    </div>
  );
}
```
**Tabs wrapper pattern to introduce** (`reports/index.tsx:14, 51-60`):
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
...
<Tabs defaultValue="auditLog">
  <TabsList>
    <TabsTrigger value="auditLog">{t('audit.tabs.auditLog')}</TabsTrigger>
    <TabsTrigger value="printJobs">{t('audit.tabs.printJobs')}</TabsTrigger>
  </TabsList>
  <TabsContent value="auditLog"><AuditLogTable /></TabsContent>
  <TabsContent value="printJobs"><PrintJobsTable /></TabsContent>
</Tabs>
```
No RBAC change needed (D-16) — the existing route-level `view_audit_log` gate already covers both tabs.

---

### Confirm dialog ("Did this print?", D-06)

**Analog:** `src/shared/ui/ConfirmDialog.tsx` — read directly for its exact prop contract (`title`, `description`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`, `variant`) before wiring; UI-SPEC already specifies `variant="default"` (neither answer destructive) and the exact copy keys (`common:printJobConfirm.*`).

---

## Shared Patterns

### Result<T>/AppError convention
**Source:** `src/shared/lib/result.ts` (`ok`/`err`/`tauriError`, `AppErrorCode` union lines 165-205)
**Apply to:** every new frontend function touching the broker (`pos-printer.ts` internals, `entities/print-job/model/queries.ts`, new Tauri commands' TS call sites). New error codes needed: broker-unreachable, job-rejected (auth/payload/persistence 4xx), job-unknown — add to the `AppErrorCode` union first, following the existing inline-comment style, before using them.

### Tauri `#[tauri::command]` boundary
**Source:** `src-tauri/src/commands/printer.rs:231-254, 256-285`
**Apply to:** all migrated print commands and any new commands added for the Print Jobs audit read path (`get_print_audit`, `get_print_job`) — keep the `Result<T, String>` return shape; Rust-side error strings become the `e` caught in TS `invoke()` call sites.

### DataTable + staged-filter + Sheet composition
**Source:** `src/widgets/AuditLogTable/` (all 4 files)
**Apply to:** `PrintJobsTable`, `PrintJobFilterBar`, `PrintJobDetailSheet` — identical shape, different query hook and different Sheet body content (timeline vs. diff).

### Windows Service / WinSpool delivery
**Source:** `.planning/spikes/001-windows-print-broker/broker/src/main.rs` (full file — read directly, it is the canonical reference per CONTEXT.md) + `src-tauri/src/commands/printer.rs`'s `win_print` module (proven `OpenPrinterW`/`StartDocPrinterW`/`WritePrinter` sequence)
**Apply to:** every file in the new `broker/` crate — this is the single most load-bearing analog in the phase; do not reimplement the Win32 sequence or SQLite ledger schema from scratch.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `broker/src/main.rs` (SCM `define_windows_service!` entry point) | service | event-driven | No Windows Service registration exists anywhere in this repo today — spike's `main.rs` used a bare foreground loop, not real SCM registration (D-01 requires the real `windows-service` crate API); consult `docs.rs/windows-service` directly per RESEARCH.md Assumption A3, not just the spike |
| `broker/install/` (sc.exe / `ServiceManager::create_service` registration + NSIS `hooks.nsh`) | config/install script | — | No installer-hook (`bundle.windows.nsis.installerHooks`) precedent in this repo's `src-tauri/tauri.conf.json` today; build directly from RESEARCH.md Pattern 5's cited Tauri v2 docs shape |
| `broker/src/config.rs` (broker-config.json: retention window, per-failure-class retry policy, port) | config | file-I/O | No existing local-file (non-Supabase) config-loading pattern in this codebase to mirror; nearest conceptual sibling is `receipt_settings` (Supabase-backed, wrong storage layer) — write from RESEARCH.md D-10/D-14 requirements directly |

## Metadata

**Analog search scope:** `src/shared/lib/`, `src/shared/ui/`, `src/entities/audit-log/`, `src/widgets/AuditLogTable/`, `src/pages/audit/`, `src/pages/reports/`, `src/features/reprint-receipt/`, `src-tauri/src/commands/printer.rs`, `.planning/spikes/001-windows-print-broker/broker/`
**Files scanned:** ~15 read in full or targeted excerpt
**Pattern extraction date:** 2026-08-26
