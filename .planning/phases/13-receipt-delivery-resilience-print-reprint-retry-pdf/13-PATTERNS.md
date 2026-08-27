# Phase 13: Receipt Delivery & Resilience - Pattern Map

**Mapped:** 2026-08-24
**Files analyzed:** 9 (5 modify, 4 new)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/lib/pos-printer.ts` (MODIFY: add retry loop in `printReceipt`) | utility (hardware IPC) | request-response w/ retry | itself — modify in place | exact (self) |
| `src/shared/lib/exporters/receipt-pdf.tsx` (NEW) | utility (file I/O / transform) | transform | `src/shared/lib/exporters/pdf.tsx` | exact (same lib, same `pdf()`/`docToBytes` plumbing) |
| `src/shared/lib/email-receipt.ts` (MODIFY: thread `pdfBase64`) | service | request-response | itself — modify in place | exact (self) |
| `src/shared/lib/edge-function-contracts.ts` (MODIFY: extend `callSendReceiptEmail` body) | utility (contract/client) | request-response | itself — modify in place | exact (self) |
| `supabase/functions/send-receipt-email/index.ts` (MODIFY: accept `pdfBase64`, forward to Resend) | route (edge function) | request-response | itself — modify in place | exact (self) |
| `src/entities/payment/model/queries.ts` (MODIFY: add `useReceiptDataForPayment(tabId)`) | model/hook (TanStack Query) | CRUD (read/join) | `usePayments()` in same file; `buildSaleReceipt()` in `supabase/functions/process-direct-sale/index.ts` | exact (query pattern) / exact (field-shape source) |
| `src/features/reprint-receipt/ui/ReprintButton.tsx` (NEW) | component (feature button) | request-response | `EditTicketButton`/`ReopenTabButton` in `src/widgets/PaymentPane/ui/PaymentPane.tsx` | exact |
| `src/widgets/PaymentPane/ui/PaymentPane.tsx` (MODIFY: insert `ReprintButton` in row action group) | component (widget) | request-response | itself — modify in place | exact (self) |
| `src/widgets/PaymentModal/ui/ReceiptPreview.tsx` (MODIFY: add "Download PDF" button) | component | file-I/O (client-side blob → Tauri save) | `src/features/export-report/ui/ExportButtons.tsx` + `useExportReport.ts` | exact (Tauri save-dialog pattern) |
| `src/shared/lib/pos-printer.test.ts` (MODIFY: retry-count Vitest cases) | test | — | itself — extend existing `describe('printReceipt')` block | exact (self) |
| `e2e/56-receipt-delivery-resilience.spec.ts` (NEW) | test (E2E) | event-driven (IPC mock) | `e2e/25-export-reports.spec.ts` (dual Tauri-global injection) | exact |

## Pattern Assignments

### `src/shared/lib/pos-printer.ts` (utility, request-response w/ retry)

**Analog:** itself, `printReceipt` at lines 50-71 (current code, no retry yet)

**Current imports** (lines 1-12):
```typescript
import type { ReceiptSettings } from '@shared/lib/domain';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import { getCurrentLocale } from '@shared/lib/i18n';
import { logger } from '@shared/lib/logger-instance';
import { buildThermalReceiptText } from '@shared/lib/receipt-format';
import type { Result } from '@shared/lib/result';
import { ok, err, tauriError } from '@shared/lib/result';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}
```

**Core pattern to modify — add bounded retry loop** (RESEARCH.md Code Example 1, verified against live `printReceipt` at pos-printer.ts:50-71):
```typescript
const MAX_PRINT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700; // fixed delay — local IPC to USB/serial printer, not network

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function printReceipt(
  data: ReceiptData,
  settings: ReceiptSettings,
  onRetry?: (attempt: number, max: number) => void
): Promise<Result<void>> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_PRINT_ATTEMPTS; attempt++) {
      try {
        await invoke('print_receipt', {
          lines: receiptDataToPrinterLines(data, settings),
          logoDataUrl: settings.logoDataUrl,
          paperWidthChars: settings.paperWidthChars,
        });
        return ok(undefined);
      } catch (e) {
        lastError = e;
        logger.warn('printer.receipt.attempt_failed', { attempt, raw: String(e) });
        if (attempt < MAX_PRINT_ATTEMPTS) {
          onRetry?.(attempt, MAX_PRINT_ATTEMPTS);
          await delay(RETRY_DELAY_MS);
        }
      }
    }
    return err(tauriError(lastError instanceof Error ? lastError.message : 'Print failed', lastError));
  }
  logger.info('printer.receipt.web_fallback', { receiptNumber: data.receiptNumber });
  printReceiptWebFallback(data, settings);
  return ok(undefined);
}
```

**Error handling pattern:** `Result<T>` via `ok()`/`err()`/`tauriError()` from `@shared/lib/result` — unchanged shape, only the loop around the try/catch changes. Callers still just check `.ok`.

**Callers to leave signature-compatible** (no change required unless wiring the toast): `ReceiptPreview.tsx`, `PaymentForm.tsx` (×3 fire-and-forget `void (async () => {...})()` blocks) — each may optionally pass `onRetry` to wire the stable-id toast sequence per UI-SPEC's Interaction Contract.

---

### `src/shared/lib/exporters/receipt-pdf.tsx` (NEW — utility, transform)

**Analog:** `src/shared/lib/exporters/pdf.tsx` (lines 1-60 read — imports + `styles`/`fmt`/`pdfT` plumbing pattern)

**Imports pattern to copy** (pdf.tsx lines 1-16):
```typescript
/* eslint-disable @typescript-eslint/no-unsafe-argument, react-refresh/only-export-components */
import { Document, Page, Text, StyleSheet, pdf } from '@react-pdf/renderer';
import React from 'react';
import { buildThermalReceiptText } from '@shared/lib/receipt-format';
import { getCurrentLocale } from '@shared/lib/i18n';
import type { ReceiptData } from '@shared/lib/edge-function-contracts';
import type { ReceiptSettings } from '@shared/lib/domain';
```

**Core pattern — DO NOT copy pdf.tsx's `<View>`/table-row layout (styles.tableHeader/row/cell).** D-05 explicitly forbids re-deriving line items. Use ONE monospace `<Text>` block wrapping `buildThermalReceiptText`'s verbatim output (RESEARCH.md Pattern 3 / Code Example, verified against pdf.tsx's `styles.page`/`docToBytes` shape):
```typescript
const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Courier' }, // Courier = monospace, matches thermal output
});

function ReceiptDoc({ text }: { text: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text>{text}</Text>
      </Page>
    </Document>
  );
}

async function docToBytes(doc: React.ReactElement): Promise<Uint8Array> {
  const blob = await pdf(doc as any).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

export async function receiptToPdfBytes(
  receipt: ReceiptData,
  settings: ReceiptSettings
): Promise<Uint8Array> {
  const text = buildThermalReceiptText(receipt, getCurrentLocale(), settings);
  return docToBytes(React.createElement(ReceiptDoc, { text }));
}
```

**Tauri save-dialog pattern to reuse for the "Download PDF" button** (mirror `src/features/export-report/model/useExportReport.ts` — same `@tauri-apps/plugin-dialog` `save()` + `@tauri-apps/plugin-fs` `writeFile()` sequence already used for report PDFs; do not hand-roll a new save flow).

---

### `src/shared/lib/email-receipt.ts` (MODIFY — service, request-response)

**Analog:** itself, full current file (27 lines, read in full):
```typescript
import type { ReceiptSettings } from '@shared/lib/domain';
import { callSendReceiptEmail, type ReceiptData } from '@shared/lib/edge-function-contracts';
import { ReceiptEmailSchema } from '@shared/lib/email-schema';
import { getCurrentLocale } from '@shared/lib/i18n';
import { buildThermalReceiptText } from '@shared/lib/receipt-format';
import type { Result } from '@shared/lib/result';
import { err } from '@shared/lib/result';
import type { AppError } from '@shared/lib/supabase-contracts';

export async function sendReceiptByEmail(
  data: ReceiptData,
  email: string,
  settings: ReceiptSettings
): Promise<Result<void, AppError>> {
  const parsed = ReceiptEmailSchema.safeParse(email);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Enter a valid email address';
    return err({ code: 'VALIDATION_ERROR', message: msg });
  }

  return callSendReceiptEmail({
    email: parsed.data,
    receiptPlainText: buildThermalReceiptText(data, getCurrentLocale(), settings),
  });
}
```

**Modification pattern:** generate `receiptToPdfBytes(data, settings)`, base64-encode (one-liner: `btoa(String.fromCharCode(...bytes))`, no new dependency — see RESEARCH.md Don't Hand-Roll), and thread as `pdfBase64` into the `callSendReceiptEmail` payload. Per UI-SPEC's PDF Email Attachment Contract: if PDF generation throws, swallow and send the email WITHOUT the attachment (do not let PDF failure block the email `Result` — wrap in try/catch and set `pdfBase64: undefined` on failure, let the caller distinguish via a returned flag or just proceed silently since email success/failure is still the primary `Result`).

---

### `src/shared/lib/edge-function-contracts.ts` (MODIFY — utility/contract)

**Analog:** itself — extend `callSendReceiptEmail`'s request body type with `pdfBase64?: string`. Follow the exact existing shape of any other edge-function contract function in this file (Zod-validated request type mirrored client + server side, `AppError`-typed `Result`).

---

### `supabase/functions/send-receipt-email/index.ts` (MODIFY — route/edge function, request-response)

**Analog:** itself, current `BodySchema` and Resend payload (RESEARCH.md Code Example 4, verified lines 5-8, 79-91):
```typescript
const BodySchema = z.object({
  email: z.string().trim().email(),
  receiptPlainText: z.string().min(1).max(50_000),
});
// ...
body: JSON.stringify({
  from: fromEmail,
  to: [body.email],
  subject: 'Your receipt',
  text: body.receiptPlainText,
}),
```

**Modification pattern:**
```typescript
const BodySchema = z.object({
  email: z.string().trim().email(),
  receiptPlainText: z.string().min(1).max(50_000),
  pdfBase64: z.string().max(2_000_000).optional(), // cap mirrors printer.rs's MAX_LOGO_DECODED_BYTES discipline
});
// ...
const resendPayload: Record<string, unknown> = {
  from: fromEmail,
  to: [body.email],
  subject: 'Your receipt',
  text: body.receiptPlainText,
};
if (body.pdfBase64) {
  resendPayload['attachments'] = [{ content: body.pdfBase64, filename: 'receipt.pdf' }];
}
```

**Edge function pattern (unchanged, follow exactly):** Bearer-auth check → Zod `BodySchema.safeParse` → external API call → `jsonResponse`. No new pattern introduced.

---

### `src/entities/payment/model/queries.ts` (MODIFY — model/hook, CRUD read/join)

**Analog 1 (query hook shape):** `usePayments()` / `paymentKeys` in same file (lines 1-40 read):
```typescript
/* eslint-disable @typescript-eslint/no-explicit-any, ... */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/lib/supabase';
import { PaymentSchema } from './types';
import type { Payment } from './types';

const db = supabase as any; // pre-regen cast, per project convention (CLAUDE.md "Missing generated types workaround")

export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
};
```

**Analog 2 (field-shape source of truth — mirror exactly, do not invent new field mappings):** `buildSaleReceipt()` in `supabase/functions/process-direct-sale/index.ts:99-219` — this is the canonical `ReceiptData` construction (`receiptNumber = tabId.slice(0,8).toUpperCase()`, `customerName ?? 'Walk-in'`, `cashierName ?? 'Staff'`, `tenders` array grouping). New `useReceiptDataForPayment(tabId)` must reproduce this shape via client-side joins, not re-derive independently.

**New hook pattern** (RESEARCH.md Pattern 1, adapt to this file's `db`/`mapPaymentRow` conventions):
```typescript
export function useReceiptDataForPayment(tabId: string | null) {
  return useQuery({
    queryKey: ['payment', 'receipt-data', tabId],
    enabled: tabId !== null,
    queryFn: async (): Promise<ReceiptData> => {
      const [{ data: tab }, { data: payments }, { data: orders }] = await Promise.all([
        db.from('tabs').select('customer_name, staff_id').eq('id', tabId).maybeSingle(),
        db.from('payments')
          .select('amount, tip_amount, method, processed_at, tendered_amount, reference_number')
          .eq('tab_id', tabId).order('processed_at', { ascending: true }),
        db.from('orders')
          .select('status, order_items(quantity, unit_price, modifier_price_delta, weight_grams, products(name, category_id, categories(name)))')
          .eq('tab_id', tabId),
      ]);
      const { data: cashier } = await db.from('profiles').select('name').eq('id', tab.staff_id).maybeSingle();
      // group ALL payments rows sharing this tabId into one receiptData.tenders array —
      // do NOT reprint a single leg as the whole sale (Pitfall 4 / CR-03 regression)
    },
  });
}
```

**RLS basis (no new policy needed):** `payments_select_bartender` gated on `close_tab` action, `orders_select_bartender` gated on `view_all_tabs`, `profiles_select_authenticated` open — all already granted to cashier+ role, same gate `usePayments()` already relies on.

---

### `src/features/reprint-receipt/ui/ReprintButton.tsx` (NEW — component)

**Analog:** `EditTicketButton`/`ReopenTabButton` in `src/widgets/PaymentPane/ui/PaymentPane.tsx` (lines 49-90, structurally read via grep — sibling row-action buttons, `variant="outline"`, `POSButton size="sm"`, no confirmation dialog):
```typescript
interface EditTicketButtonProps { /* payment, onEdit */ }
function EditTicketButton({ payment, onEdit }: EditTicketButtonProps) {
  // POSButton size="sm" variant="outline", onClick calls the action prop directly, no dialog
}
```

**Core pattern for `ReprintButton`:** on click, call `useReceiptDataForPayment(payment.tabId)` (or trigger its refetch), then `printReceipt(receiptData, settings, onRetry)` — same shared function, inheriting retry/toast automatically. Busy state disables the button + swaps label to "Reprinting…" (`wPanels:paymentPane.reprinting`). No PIN gate, no confirm dialog (matches `EditTicketButton`/`ReopenTabButton`, per UI-SPEC).

**Insertion point in `PaymentPane.tsx`** (verified, line 213-217):
```typescript
<div className="flex items-center gap-2">
  <EditTicketButton payment={payment} onEdit={onEdit} />
  <ReopenTabButton payment={payment} onReopen={onReopen} />
  {/* insert <ReprintButton payment={payment} /> FIRST, before EditTicketButton, per UI-SPEC placement */}
  <RefundButton payment={payment} onRefund={onRefund} />
</div>
```
Note: UI-SPEC says `ReprintButton` should be the **first** button in the group (leftmost) — insert before `EditTicketButton`, not after `ReopenTabButton` as the raw line order above might suggest.

---

### `src/widgets/PaymentModal/ui/ReceiptPreview.tsx` (MODIFY — add "Download PDF" button)

**Analog:** `src/features/export-report/ui/ExportButtons.tsx` + `src/features/export-report/model/useExportReport.ts` — existing busy-label-swap + Tauri save-dialog trigger pattern (`Loader2` spinner import already used for busy state, per UI-SPEC's Design System table — reuse verbatim).

**Core pattern:** add 4th `POSButton touchSize="large"` between "Email Receipt" and "Done" in the existing button row; add `flex-wrap` to the row's className; on click call `receiptToPdfBytes()` then the same `plugin-dialog`/`plugin-fs` save sequence `useExportReport.ts` already uses. Busy label "Generating…", single attempt (no retry — client-side rendering, not IPC-flaky).

---

## Shared Patterns

### `Result<T>` error handling
**Source:** `src/shared/lib/result.ts` (`ok`/`err`/`tauriError`)
**Apply to:** `printReceipt`, `sendReceiptByEmail`, `useReceiptDataForPayment` (query hooks conventionally throw inside `queryFn` and let TanStack Query surface the error — check `usePayments()`'s existing error convention in the same file before deciding throw-vs-Result for the new hook).

### Toast sequence (sonner, stable `id`)
**Source:** UI-SPEC Interaction Contract, precedent `logHardwareFail` in `PaymentForm.tsx`
**Apply to:** all 5 `printReceipt` call sites (`ReceiptPreview.tsx`, `PaymentForm.tsx` ×3, `ReprintButton.tsx`) — wire `onRetry` to `toast.loading(msg, { id: \`print-${data.receiptNumber}\` })`, final outcome to `toast.success`/`toast.error` with the same `id`. First-attempt success stays silent (no toast).

### `receipt-format.ts` `buildThermalReceiptText(receipt, locale, settings)` as single source of truth
**Source:** `src/shared/lib/receipt-format.ts` (UNCHANGED this phase)
**Apply to:** print (`pos-printer.ts`), PDF (`receipt-pdf.tsx`), email (`email-receipt.ts`) — all three must call this same function, never re-derive `ReceiptData` structure independently (D-05).

### Tauri dual-global E2E mock injection
**Source:** `e2e/25-export-reports.spec.ts` (`addInitScript` pattern)
**Apply to:** `e2e/56-receipt-delivery-resilience.spec.ts` — must inject BOTH `window.__TAURI__ = {}` (passes `isTauri()` gate) AND `window.__TAURI_INTERNALS__.invoke` (intercepts the real IPC call), per RESEARCH.md Pitfall 2:
```typescript
await page.addInitScript(() => {
  (window as any).__TAURI__ = {};
  (window as any).__TAURI_INTERNALS__ = {
    invoke: (cmd: string) =>
      cmd === 'print_receipt' ? Promise.reject(new Error('Printer offline')) : Promise.resolve(),
  };
});
```

### Vitest `invoke` mocking scaffold
**Source:** `src/shared/lib/pos-printer.test.ts` (existing `describe('printReceipt')` block, `vi.mocked(invoke).mockRejectedValue`/`mockResolvedValueOnce`)
**Apply to:** new retry-count assertion cases (RCP-04) — extend, don't rewrite, the existing file's mocking scaffold.

## No Analog Found

None — every file in this phase's scope has a strong existing analog in the codebase (RESEARCH.md's "Key insight": this phase threads existing patterns through one new problem, not new architecture).

## Metadata

**Analog search scope:** `src/shared/lib/`, `src/shared/lib/exporters/`, `src/entities/payment/model/`, `src/widgets/PaymentPane/ui/`, `src/widgets/PaymentModal/ui/`, `src/features/export-report/`, `supabase/functions/send-receipt-email/`, `supabase/functions/process-direct-sale/`, `e2e/`
**Files scanned:** 6 read directly this session (`pos-printer.ts` head, `queries.ts` head, `PaymentPane.tsx` grep, `exporters/pdf.tsx` head, `email-receipt.ts` full) + prior RESEARCH.md verified reads (`process-direct-sale/index.ts`, `send-receipt-email/index.ts`, `printer.rs`, `25-export-reports.spec.ts`, RLS migration)
**Pattern extraction date:** 2026-08-24
</content>
