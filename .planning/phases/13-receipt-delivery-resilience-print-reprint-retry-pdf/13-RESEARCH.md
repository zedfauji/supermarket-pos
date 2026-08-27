# Phase 13: Receipt Delivery & Resilience (Print, Reprint, Retry, PDF) - Research

**Researched:** 2026-08-24
**Domain:** Tauri desktop IPC resilience (print retry), PDF generation from an existing text formatter, Resend email attachments, Playwright/Vitest hardware-failure mocking
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add a "Reprint" action to each row of the existing "recent payments" list in `PaymentPane` (`src/widgets/PaymentPane/ui/PaymentPane.tsx`) on `/payments`. Reuses the query already powering that list — no new "last completed sale" state needed. The list is already sorted with most-recent first, satisfying "most recently completed sale" directly.
- **D-02:** On print failure, retry automatically 2-3 times before surfacing to the cashier. Retry logic belongs inside `printReceipt` (`src/shared/lib/pos-printer.ts`) itself — the single call site all callers (`ReceiptPreview.tsx`, `PaymentForm.tsx` ×3) already route through — not duplicated per caller.
- **D-03:** Show a visible "Retrying print (N/3)..." status during retry attempts (toast or inline indicator), followed by a final success/failure toast. This is new UI state — today's print/drawer failures are fire-and-forget with a single `toast.error` on the final outcome (`PaymentForm.tsx` `logHardwareFail`); that silent pattern is being upgraded, not reused, for the retry sequence specifically.
- **Confirmed existing behavior, not a new decision (RCP-02):** `PaymentForm.tsx handlePrimary`/`handleSplitPrimary` already call `printReceipt` in a detached `void (async () => {...})()` block *after* `setStep('receipt')` and `onPaymentSuccess()` — the sale is already recorded and the UI already reflects success before printing is attempted. RCP-02's job in this phase is test coverage (mock the Tauri `print_receipt` invoke to reject/throw and assert the sale still completes), not new production code, though the retry work (D-02/D-03) sits inside this same async block.
- **D-04:** Build both delivery paths — standalone PDF download (pure client-side, `@react-pdf/renderer`, already a dependency via `src/shared/lib/exporters/pdf.tsx`) **and** email attachment (extends `send-receipt-email` edge function to accept and forward a base64 PDF attachment to Resend, which already supports attachments in its API).
- **D-05:** The PDF's receipt body (items, totals, tenders) is a plain monospace rendering of `buildThermalReceiptText`'s exact string output — not a re-derived table/styled layout computed independently from `ReceiptData`. This directly satisfies RCP-03's explicit text: "reusing the existing `receipt-format.ts` formatting logic rather than a second, divergent formatter." — **Reversibility:** costly — **rationale:** once print/email/PDF all read from one shared string, switching the PDF to an independently-derived layout later means auditing all three paths for drift risk, not just adding a new renderer.
  - *Note:* a styled report-style PDF layout (like `exporters/pdf.tsx`'s CajaReport tables) was discussed and explicitly rejected for this reason — a table-based layout would need to re-derive line-item/total structure from `ReceiptData` directly, creating exactly the second, divergent formatter RCP-03 rules out. A styled *shell* (logo/header treatment) around the same monospace text block remains open to the planner if it doesn't touch the receipt body content itself.

### Claude's Discretion

- Exact retry delay/backoff (fixed interval vs. short exponential backoff) between the 2-3 print attempts — not discussed; planner should pick a small fixed delay (e.g. 500ms-1s) unless research surfaces a reason for backoff — this is IPC to a local printer, not a network call.
- Exact wording/i18n keys for the "Retrying print (N/3)..." status and final toasts — follows the existing `featOrders`/`common` namespace conventions already used by `logHardwareFail` in `PaymentForm.tsx`.
- Whether the retry loop distinguishes failure reasons (offline vs. out-of-paper vs. disconnected) for different retry/backoff behavior, or treats all `printReceipt` failures uniformly — not raised as a gray area; default to uniform retry handling unless research finds the Tauri/Rust layer already differentiates these (per ROADMAP.md Success Criterion 2's "offline/out-of-paper/disconnected" framing, these are simulated as generic invoke failures, not distinct error codes).
- Exact UI placement/copy for the "Reprint" action within a `PaymentPane` row (icon button vs. labeled button, confirmation dialog or not) — no `UI hint` flagged in ROADMAP.md for this phase, so this stays a planner/implementation call unless it turns out non-trivial enough to warrant `/gsd-ui-phase 13`.

### Deferred Ideas (OUT OF SCOPE)

None raised — discussion stayed within the four selected implementation-decision areas (reprint entry point, PDF delivery mechanism, retry visibility, PDF format). No scope-creep redirects were needed. RCP-05 (full outbound email service) remains explicitly out of scope per REQUIREMENTS.md, unchanged.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RCP-01 | A cashier can reprint the receipt for the most recently completed sale. | **Gap found and closed by this research (see Pitfall 1):** `ReceiptData` is never persisted — it only exists transiently in the payment-processing response. Reprint requires a NEW read path that reconstructs `ReceiptData` from `payments`/`tabs`/`orders`/`order_items`/`products`/`categories`/`profiles`, keyed by `payment.tabId`. RLS already permits this read for any `close_tab`/`view_all_tabs`-capable role (cashier+) with no new edge function required — see Code Examples §1 and Architecture Pattern 1. |
| RCP-02 | A receipt printer failure never blocks or rolls back a completed sale — verified by an automated test simulating printer failure. | Existing behavior confirmed correct (`PaymentForm.tsx:426-445`, `507-525` — fire-and-forget `void (async () => {...})()` after `setStep('receipt')`/`onPaymentSuccess()`). This phase's job is test coverage only — see Pitfall 2 for the exact mock shape required (`window.__TAURI__` + `window.__TAURI_INTERNALS__.invoke`, not just one or the other). |
| RCP-03 | A completed sale's receipt can be delivered as a PDF (email attachment and/or standalone download), reusing `receipt-format.ts`. | `@react-pdf/renderer` (already a dependency, `^4.5.1`) can render a monospace `<Text>` block containing `buildThermalReceiptText`'s exact output — no re-derivation. Standalone download follows the existing `useExportReport.ts` Tauri `save()`/`writeFile()` pattern. Email attachment extends `send-receipt-email`'s `BodySchema` with an optional base64 field and Resend's documented `attachments: [{ content, filename }]` array — see Code Examples §2/§3. |
| RCP-04 | A transient printer failure is automatically retried 2-3 times before being surfaced as a failure. | Retry loop belongs inside `printReceipt` (`pos-printer.ts:50-71`), the sole call site every caller already routes through. The existing Vitest harness (`pos-printer.test.ts`) already mocks `invoke` via `vi.mocked(invoke).mockRejectedValue(...)`/`mockResolvedValue(...)` and toggles `window.__TAURI__` — this is the natural, cheapest place to assert retry count (`expect(invoke).toHaveBeenCalledTimes(3)`), not a Playwright E2E test — see Validation Architecture and Code Examples §4. |
</phase_requirements>

## Summary

This phase touches five files that already exist and follow established patterns — it is a "wire up + extend" phase, not greenfield, matching Phase 15's framing for the same file set. The single genuinely new problem is **RCP-01's data-availability gap**: `ReceiptData` is built once, server-side, inside the `process-direct-sale` edge function's `buildSaleReceipt()` helper, and is never written to any table — it exists only in the HTTP response the client already discarded by the time a cashier clicks "Reprint" on a row in `PaymentPane`'s payment-history list. Reprint therefore requires a new **read-only** reconstruction of `ReceiptData` from `payments` + `tabs` + `orders` + `order_items` + `products` + `categories` + `profiles`, keyed by `payment.tabId`. Because Row-Level Security already grants SELECT on every one of those tables to any role holding `close_tab`/`view_all_tabs` (the same role gate that already lets a cashier see the "recent payments" list at all), the leanest implementation is a **client-side TanStack Query hook doing a direct Supabase join**, not a new edge function — `buildSaleReceipt()` in `process-direct-sale/index.ts` is the pattern to mirror (same joins, same field shapes), but it should NOT be called from the client; it runs server-role and is scoped to the *paying* cashier's own shift/caja, which is wrong for a reprint that may happen in a different shift.

The second load-bearing finding is a **test-harness gotcha that will silently produce false-positive tests if missed**: `pos-printer.ts`'s `isTauri()` gate checks `'__TAURI__' in window`, but the real `invoke()` function from `@tauri-apps/api/core` reads from `window.__TAURI_INTERNALS__.invoke` — two different globals. Playwright E2E tests for RCP-02/RCP-04 must inject **both** (`window.__TAURI__ = {}` to pass the gate, `window.__TAURI_INTERNALS__.invoke` to intercept the actual command) or the app silently falls through to the browser `window.open()` print-preview fallback and never exercises the Tauri failure path at all. The existing `25-export-reports.spec.ts` hand-rolls exactly this dual-injection shape for `plugin:dialog|save`/`plugin:fs|write_file` — extend that same `addInitScript` pattern for `print_receipt`/`open_cash_drawer`.

Third, RCP-04's specific ask ("verified by an automated test asserting retry count") is best satisfied by a **Vitest unit test**, not Playwright — `pos-printer.test.ts` already has the exact `vi.mocked(invoke)` mocking scaffold this needs, and asserting `invoke` call counts is far more direct and less flaky at the unit level than driving a full checkout through Playwright to observe retry toasts. RCP-02 (sale survives print failure) is the one criterion that benefits from a real Playwright E2E pass, since it needs to assert on-screen "sale completed" state, not just a function's return value.

**Primary recommendation:** Add retry-with-backoff inside `printReceipt` (Vitest-tested), build a client-side `ReceiptData` reconstruction query for reprint (no new edge function), render the PDF as a monospace `<Text>` wrapping `buildThermalReceiptText`'s output verbatim, and extend `send-receipt-email`'s existing Zod `BodySchema` with an optional attachment field passed straight through to Resend's `attachments` array.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reprint receipt-data reconstruction | API / Backend (RLS-gated Supabase read) | Frontend Server — none, this is a Tauri SPA | Data already lives in Postgres; RLS already authorizes the read for cashier+ roles — no new backend surface needed, just a client-side join query |
| Print retry loop | Browser / Client (`pos-printer.ts`, calls Tauri IPC) | — | `printReceipt` is a `shared/lib` function with no server dependency; retry is pure client-side control flow around an IPC call |
| Retry status UI ("Retrying N/3...") | Browser / Client (React state + toast) | — | Transient UI state, not persisted, not shared across terminals |
| PDF generation (bytes) | Browser / Client (`@react-pdf/renderer`, runs in the Tauri webview) | — | `pdf().toBlob()` executes entirely client-side; matches existing `exporters/pdf.tsx` pattern for reports |
| PDF standalone download | Browser / Client (`@tauri-apps/plugin-dialog` + `plugin-fs`) | — | Same Tauri-native save-dialog pattern already used by `useExportReport.ts` |
| PDF email attachment | API / Backend (`send-receipt-email` edge function → Resend) | Browser / Client (base64-encodes bytes before POST) | The edge function is the only place holding `RESEND_API_KEY`; client only prepares/uploads bytes |
| Printer hardware I/O (ESC/POS encode + send) | Native / Tauri Rust (`printer.rs`) | — | Unchanged this phase — `print_receipt` already exists; only the *caller's* retry behavior changes |

## Standard Stack

No new external packages are required — every capability in this phase is served by dependencies already installed and already used for an adjacent purpose.

### Core (already installed, reused)
| Library | Version (verified installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-pdf/renderer` | `^4.5.1` [VERIFIED: package.json:46] | Renders `ReceiptData` → PDF bytes | Already the project's sole PDF-generation library (`src/shared/lib/exporters/pdf.tsx`); a second PDF library would violate "Don't Hand-Roll" |
| `@tauri-apps/api` | `^2` [VERIFIED: package.json:50] | `invoke()` for `print_receipt`, retry target | Already the sole Tauri IPC bridge in the app |
| `@tauri-apps/plugin-dialog` | `^2.7.0` [VERIFIED: package.json:51] | Native "Save PDF" dialog | Already used identically by `useExportReport.ts` |
| `@tauri-apps/plugin-fs` | `^2.5.0` [VERIFIED: package.json:52] | Writes PDF bytes to the chosen path | Already used identically by `useExportReport.ts` |
| `sonner` | `^2.0.7` [VERIFIED: package.json:79] | Retry-status / success / failure toasts | Already the app's sole toast library (`toast.error`/`toast.success` used throughout `PaymentForm.tsx`) |
| `vitest` | `^4.1.4` [VERIFIED: package.json:142] | Unit test for retry-count assertion | Already the project's unit test runner; `pos-printer.test.ts` already exists |
| `@playwright/test` | `^1.59.1` [VERIFIED: package.json:90] | E2E test for RCP-02 (sale survives print failure) | Project-mandated E2E framework per CLAUDE.md |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side RLS-gated join for reprint data | A new edge function mirroring `buildSaleReceipt()` | An edge function adds a network hop, a new `verify_jwt` surface, and duplicates logic that RLS already makes safe to run client-side; only justified if reprint later needs data the client should never see directly (not the case here — the client already reads `payments`/`orders`/`order_items` directly elsewhere, e.g. `usePayments()`, refund flows) |
| `@react-pdf/renderer` monospace `<Text>` for receipt body | A canvas/image-based renderer (render the `<pre>` DOM node to an image) | Canvas rasterization would produce a blurry, non-selectable, non-accessible PDF and is exactly the "second, divergent formatter" risk D-05 rules out — `<Text>` with a monospace `fontFamily` reproduces the exact string with real, copyable text |
| Fixed retry delay | Exponential backoff | Explicitly left to planner discretion in CONTEXT.md; a local USB/serial printer failure does not benefit from backoff the way a network call does — a fixed ~500ms-1s delay is simpler and sufficient |

**Installation:** None — no `npm install` needed this phase.

## Package Legitimacy Audit

**Not applicable this phase — no new packages are installed.** Every library used (`@react-pdf/renderer`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `sonner`) is already present in `package.json` and already exercised by existing, shipped code paths (`exporters/pdf.tsx`, `useExportReport.ts`, `PaymentForm.tsx`). The Package Legitimacy Gate protocol was checked and skipped per its own trigger condition ("Every phase that installs external packages") — this phase does not.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │         PaymentPane (/payments)               │
                    │  "Recent Payments" list — row-level actions   │
                    └───────────────┬─────────────────────────────┘
                                    │ click "Reprint" on a row (payment.tabId)
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  NEW: useReceiptDataForPayment(tabId)          │
                    │  Client-side Supabase join (RLS-gated):        │
                    │  payments + tabs + orders + order_items         │
                    │  + products + categories + profiles             │
                    │  → reconstructs ReceiptData (mirrors            │
                    │    buildSaleReceipt() shape, no staff/shift     │
                    │    filter — reprint isn't a live-payment call)  │
                    └───────────────┬─────────────────────────────┘
                                    │ ReceiptData
                                    ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                    ReceiptData (in memory)                      │
        │   same shape whether freshly paid (PaymentForm) or reprint-      │
        │   reconstructed — every downstream consumer below is unchanged   │
        └──────┬───────────────┬───────────────────┬──────────────────────┘
               │               │                     │
               ▼               ▼                     ▼
   ┌───────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
   │ printReceipt()      │ │ PDF standalone     │ │ Email w/ PDF          │
   │ pos-printer.ts       │ │ download            │ │ attachment            │
   │                      │ │                     │ │                       │
   │ buildThermalReceipt- │ │ buildThermalReceipt-│ │ buildThermalReceipt-  │
   │ Text() → lines       │ │ Text() → <Text>     │ │ Text() → base64 PDF   │
   │ NEW: retry loop       │ │ (monospace) in a     │ │ bytes → POST to       │
   │ (2-3 attempts,        │ │ react-pdf Document   │ │ send-receipt-email    │
   │ toast "Retrying N/3") │ │ → pdf().toBlob()      │ │ (extended BodySchema) │
   │                       │ │ → save()+writeFile()  │ │                       │
   │ Tauri invoke          │ │ (Tauri plugin-dialog  │ │ Deno edge fn → Resend │
   │ ('print_receipt')     │ │ + plugin-fs, same     │ │ API attachments:      │
   │                       │ │ pattern as             │ │ [{content, filename}]│
   │ ── failure path ──►   │ │ useExportReport.ts)   │ │                       │
   │ sale already recorded,│ │                       │ │                       │
   │ UI already shows      │ │                       │ │                       │
   │ success (unchanged,   │ │                       │ │                       │
   │ pre-existing)         │ │                       │ │                       │
   └───────────────────────┘ └──────────────────────┘ └───────────────────────┘
```

### Recommended Project Structure

No new directories. Modified/added files only:

```
src/
├── shared/lib/
│   ├── pos-printer.ts          # MODIFY: add retry loop inside printReceipt()
│   ├── receipt-format.ts       # UNCHANGED (D-05: PDF must call this, not fork it)
│   ├── email-receipt.ts        # MODIFY: accept optional pdfBase64 param, thread to callSendReceiptEmail
│   ├── edge-function-contracts.ts  # MODIFY: extend send-receipt-email request/response with optional attachment field
│   └── exporters/
│       └── receipt-pdf.tsx     # NEW (or extend pdf.tsx): renders buildThermalReceiptText() output as monospace <Text>
├── entities/payment/model/
│   └── queries.ts              # MODIFY: add useReceiptDataForPayment(tabId) — the reprint reconstruction join
├── widgets/PaymentPane/ui/
│   └── PaymentPane.tsx         # MODIFY: add ReprintButton to PaymentHistoryList row actions
└── features/
    └── reprint-receipt/         # NEW (optional, if UI-SPEC decides a dedicated feature folder is warranted)
        └── ui/ReprintButton.tsx

supabase/functions/send-receipt-email/
└── index.ts                    # MODIFY: BodySchema += optional base64 attachment field, forward to Resend attachments[]

e2e/
└── 56-receipt-delivery-resilience.spec.ts   # NEW: RCP-01/02/03 E2E coverage (see Validation Architecture)

src/shared/lib/
└── pos-printer.test.ts         # MODIFY: add retry-count Vitest cases (RCP-04)
```

### Pattern 1: Client-side ReceiptData reconstruction for reprint (RCP-01)

**What:** A TanStack Query hook that runs the same joins `buildSaleReceipt()` runs server-side in `process-direct-sale/index.ts`, but as a plain authenticated Supabase client read (RLS-gated), keyed by `tabId` alone — no staff/shift/caja filter, because a reprint is not re-authorizing a live payment, it's reading an already-completed, RLS-visible record.

**When to use:** Any time `ReceiptData` is needed for a sale that has already completed and whose original response payload is gone (reprint, and potentially a future "view past receipt" feature).

**Verified RLS basis** [VERIFIED: supabase/migrations/20260510000001_rls_rewrite_phase13.sql:683-695, 525-530, 350-351]:
```sql
CREATE POLICY "payments_select_bartender" ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'close_tab')
    AND is_deleted = FALSE AND get_user_role() != 'kitchen'
  );

CREATE POLICY "orders_select_bartender" ON orders
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'view_all_tabs')
    AND is_deleted = FALSE
  );

CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);
```
`payments` is gated on the `close_tab` action, `tabs`/`orders`/`order_items` on `view_all_tabs` — both are already granted to the cashier role by default (this is the same read every cashier already performs to populate the `usePayments()` list PaymentPane renders `Reprint` buttons onto). `products`/`categories` SELECT is open to all authenticated roles (needed for the POS grid). No new RLS policy is required.

**Example (mirrors `buildSaleReceipt()`'s field shapes exactly — verified against the live edge function):**
```typescript
// Source: mirrors supabase/functions/process-direct-sale/index.ts buildSaleReceipt()
// (read this file's exact field mapping before writing the client-side version —
// receiptNumber = tabId.slice(0,8).toUpperCase(), modifierNames always [], etc.)
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
      // ... same items/tenders/subtotal/total derivation as buildSaleReceipt()
    },
  });
}
```

**Split-sale note:** `usePayments()` returns one row per tender leg (multiple `payments` rows can share one `tab_id`). Reprint from ANY leg's row must reconstruct the same single sale-level receipt (grouping all legs into `receiptData.tenders`, matching `buildSaleReceipt()`'s existing behavior) — do not reprint a single leg's amount as if it were the whole sale (this was CR-03, a real bug fixed in a prior phase; don't reintroduce it here).

### Pattern 2: Retry loop inside `printReceipt` (RCP-04)

**What:** Wrap the existing Tauri `invoke('print_receipt', ...)` call in a bounded retry loop (2-3 attempts) with a fixed delay between attempts, emitting a status callback/toast on each retry.

**When to use:** Only the Tauri branch of `printReceipt` — the web-fallback branch (`printReceiptWebFallback`) has no failure mode worth retrying (it's a synchronous `window.open()`+`document.write()`).

**Existing function to modify** [VERIFIED: src/shared/lib/pos-printer.ts:50-71]:
```typescript
export async function printReceipt(
  data: ReceiptData,
  settings: ReceiptSettings
): Promise<Result<void>> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('print_receipt', {
        lines: receiptDataToPrinterLines(data, settings),
        logoDataUrl: settings.logoDataUrl,
        paperWidthChars: settings.paperWidthChars,
      });
      return ok(undefined);
    } catch (e) {
      logger.warn('printer.receipt.failed', { raw: String(e) });
      return err(tauriError(e instanceof Error ? e.message : 'Print failed', e));
    }
  }
  logger.info('printer.receipt.web_fallback', { receiptNumber: data.receiptNumber });
  printReceiptWebFallback(data, settings);
  return ok(undefined);
}
```
Retry shape (fixed delay, discretion per CONTEXT.md): loop up to `MAX_ATTEMPTS = 3`, catch each failure, call an optional `onRetry?: (attempt: number, max: number) => void` callback (wired to the "Retrying print (N/3)..." toast by the caller) before each re-attempt, return `err(tauriError(...))` only after the final attempt is exhausted.

### Pattern 3: PDF body reuses `buildThermalReceiptText` verbatim (RCP-03 / D-05)

**What:** A minimal `@react-pdf/renderer` `Document`/`Page` wrapping ONE monospace `<Text>` node containing the exact string `buildThermalReceiptText(receipt, locale, settings)` returns — no per-field `<View>`/`<Text>` table construction (that would be the "second, divergent formatter" D-05 explicitly forbids).

**Existing pattern to copy the plumbing shape of, NOT the table layout** [VERIFIED: src/shared/lib/exporters/pdf.tsx:20-46, 233-245]:
```typescript
// Source: src/shared/lib/exporters/pdf.tsx (docToBytes + styles.page pattern)
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
`@react-pdf/renderer`'s built-in `Courier`/`Courier-Bold` are core PDF standard fonts (no font file bundling needed) and preserve the fixed-width column alignment `buildThermalReceiptText` was built for — this is the one place a genuinely monospace font matters, unlike the existing report PDFs which use `Helvetica`.

### Pattern 4: Resend attachment forwarding (RCP-03 email path)

**What:** Extend `send-receipt-email`'s Zod `BodySchema` with an optional base64 field; when present, add it to the Resend request's `attachments` array alongside the existing plain-text body.

**Existing function to modify** [VERIFIED: supabase/functions/send-receipt-email/index.ts:5-8, 79-91]:
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
**Resend's documented attachment shape** [CITED: resend.com/docs/dashboard/emails/attachments]:
```json
{
  "attachments": [
    { "content": "base64EncodedContent", "filename": "receipt.pdf" }
  ]
}
```
Add `pdfBase64: z.string().max(2_000_000).optional()` (cap generously above a realistic receipt PDF's size — this repo's precedent for capping base64 payloads server-side is `printer.rs`'s `MAX_LOGO_DECODED_BYTES`; apply the same discipline here) to `BodySchema`, and conditionally spread `attachments: [{ content: body.pdfBase64, filename: 'receipt.pdf' }]` into the Resend POST body only when present — keep the field optional so existing plain-text-only callers (`sendReceiptByEmail` today) remain valid with no client change required unless they opt into the PDF path.

### Anti-Patterns to Avoid

- **Re-deriving receipt line items independently for the PDF:** Building a `<View>`/`<Table>` structure from `ReceiptData.items` directly (like `exporters/pdf.tsx`'s report docs do) instead of embedding `buildThermalReceiptText`'s string output is exactly the "second, divergent formatter" D-05 was written to prevent — any future formatting change (new field, i18n string, column width) would need to be applied twice and will eventually drift.
- **Calling `process_direct_sale_atomic` or any payment RPC again for reprint:** These are mutation-idempotent-on-write RPCs; reprint is a pure read. Do not attempt to "replay" the sale to get `ReceiptData` back — reconstruct it via SELECT only (Pattern 1).
- **Retrying inside every caller (`PaymentForm.tsx` ×3, `ReceiptPreview.tsx`) instead of inside `printReceipt` itself:** D-02 is explicit about this — duplicating the loop at 4 call sites is the textbook case this decision rules out.
- **Mocking only `window.__TAURI_INTERNALS__.invoke` in Playwright E2E and assuming the print path is exercised:** See Pitfall 2 — without also setting `window.__TAURI__`, `isTauri()` returns `false` and the whole test silently exercises the browser fallback instead, producing a green test that proves nothing about RCP-02/RCP-04.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF byte generation | A second PDF library or a canvas-rasterization-of-DOM approach | `@react-pdf/renderer` (`pdf().toBlob()`), already used by `exporters/pdf.tsx` | Already installed, already proven to produce selectable/accessible text output, avoids a second rendering engine in the bundle |
| Retry/backoff scheduling | A generic retry utility/library (`p-retry`, `async-retry`) | A ~15-line hand-written loop inside `printReceipt` | 2-3 fixed-delay attempts around one IPC call does not justify a new dependency; the existing codebase has zero retry-library precedent anywhere |
| Base64 encoding of PDF bytes for email | A manual byte-to-base64 loop | `btoa(String.fromCharCode(...bytes))` or, cleaner, the `Buffer`-free `Uint8Array` → base64 idiom already used implicitly by `printer.rs`'s `base64::prelude::*` on the Rust side (client-side: reuse whatever helper — if none exists client-side yet, a single `uint8ArrayToBase64` utility in `shared/lib` is the smallest correct unit, not a library) | Base64-encoding a `Uint8Array` is a solved one-liner; no dependency needed |
| Receipt data reconstruction for reprint | A new edge function replaying `buildSaleReceipt()` server-role | A client-side RLS-gated join query (Pattern 1) | RLS already authorizes every table read involved; an edge function here would add latency and a maintenance surface for zero additional security value |

**Key insight:** Every piece of this phase already has a working analog somewhere in the codebase (`exporters/pdf.tsx` for PDF, `useExportReport.ts` for Tauri save-dialog flow, `pos-printer.test.ts` for invoke mocking, `25-export-reports.spec.ts` for Playwright IPC mocking, `send-receipt-email/index.ts` for the edge function shape). The work here is threading existing patterns through one new problem (reprint data) and one new IPC failure-handling loop (retry), not inventing new architecture.

## Common Pitfalls

### Pitfall 1: `ReceiptData` does not exist anywhere after the payment response is discarded

**What goes wrong:** A naive RCP-01 implementation assumes some table already stores the full `ReceiptData` shape (items, tenders, cashier name, etc.) and just needs a `SELECT` — it doesn't. `ReceiptData` is assembled once, in-memory, inside `process-direct-sale/index.ts`'s `buildSaleReceipt()` [VERIFIED: supabase/functions/process-direct-sale/index.ts:99-219, quote: `return { receiptNumber: tabId.slice(0, 8).toUpperCase(), tabId, customerName: tab.customer_name ?? 'Walk-in', items, subtotal, tipAmount, total: Math.round((subtotal + tipAmount) * 100) / 100, paymentMethod: firstLeg.method, processedAt: firstLeg.processed_at, squareReceiptUrl: null, cashierName: cashier?.name ?? 'Staff', barName: Deno.env.get('BAR_NAME') ?? 'Supermarket POS', barAddress: Deno.env.get('BAR_ADDRESS') ?? '', tenderedAmount: soleTender?.tenderedAmount ?? null, changeAmount: soleTender?.changeAmount ?? null, terminalReference: soleTender?.terminalReference, tenders };`], and `process_direct_sale_atomic` (the SQL RPC) [VERIFIED: supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql:138-140, quote: `RETURN jsonb_build_object('ok', true, 'tabId', v_tab_id, 'paymentId', v_result->>'paymentId', 'paymentGroupId', v_result->>'paymentGroupId', 'paymentIds', v_result->'paymentIds', 'idempotent', COALESCE((v_result->>'idempotent')::boolean, false));`] only returns identifiers, never the receipt body.

**Why it happens:** The original design never needed reprint, so nobody persisted the derived view — it's cheap to recompute from `orders`/`order_items` on the one path (checkout) that needed it.

**How to avoid:** Build the reconstruction as a client-side read (Pattern 1), not a new write-time persistence layer (storing a JSON snapshot of every receipt at payment time would be a bigger, unrequested change — and per the ladder, recomputing from already-durable `order_items`/`payments` rows is strictly simpler than adding a new persisted column/table just for reprint).

**Warning signs:** If the plan proposes a new `receipts` table or a `receipt_snapshot jsonb` column on `payments`/`tabs`, stop — that is solving a problem RLS-gated recomputation already solves for free, and D-05's "don't create a second source of truth" spirit applies here too (a stored snapshot could drift from the live formatter's output if `receipt-format.ts` changes later; recomputing at reprint time always reflects current settings/i18n).

### Pitfall 2: Two different Tauri globals gate two different things — mocking only one produces a silently-passing, meaningless E2E test

**What goes wrong:** `pos-printer.ts`'s `isTauri()` checks `'__TAURI__' in window` [VERIFIED: src/shared/lib/pos-printer.ts:13-15, quote: `function isTauri(): boolean { return typeof window !== 'undefined' && '__TAURI__' in window; }`], but the real `invoke()` implementation reads from `window.__TAURI_INTERNALS__.invoke` [VERIFIED: node_modules/@tauri-apps/api/core.js:202, quote: `return window.__TAURI_INTERNALS__.invoke(cmd, args, options);`]. A Playwright test that only injects `window.__TAURI_INTERNALS__` (e.g. by copying `@tauri-apps/api/mocks`'s `mockIPC`, which sets ONLY `__TAURI_INTERNALS__` [VERIFIED: node_modules/@tauri-apps/api/mocks.js:4-9, quote: `function mockInternals() { window.__TAURI_INTERNALS__ = ... window.__TAURI_EVENT_PLUGIN_INTERNALS__ = ...; }`]) will see `isTauri()` return `false` in the app, causing `printReceipt` to silently take the `printReceiptWebFallback` branch (`window.open()` popup) instead of calling `invoke('print_receipt', ...)` at all — the mocked failure/success never gets exercised, and the test passes for the wrong reason.

**Why it happens:** `@tauri-apps/api/mocks` (`mockIPC`) is designed for Vitest unit tests running Node-side, where `window.__TAURI__` isn't a meaningful signal — but this app's own `isTauri()` gate predates/is independent of that helper and checks a different property.

**How to avoid:** In any new Playwright spec for this phase, inject BOTH globals via `page.addInitScript()`, mirroring the existing hand-rolled pattern already proven in this repo:
```typescript
// Source: extends the exact pattern in e2e/25-export-reports.spec.ts injectTauriMocks()
await page.addInitScript(() => {
  (window as any).__TAURI__ = {}; // passes pos-printer.ts's isTauri() gate
  (window as any).__TAURI_INTERNALS__ = {
    invoke(cmd: string, args: unknown): Promise<unknown> {
      if (cmd === 'print_receipt') {
        // toggle resolve/reject here per test case
      }
      return Promise.resolve();
    },
  };
});
```

**Warning signs:** A new E2E test "passes" but never actually asserts on retry-toast text, or the printer-failure test passes even when you comment out the retry logic entirely — both are signs the mock isn't intercepting the real code path.

### Pitfall 3: `print_receipt`'s Rust-side file fallback can mask a "real" printer failure as `Ok(())`

**What goes wrong:** On the Rust side, `print_receipt` falls back to writing the ESC/POS bytes to a temp file and returns `Ok(())` whenever `try_send_raw` fails [VERIFIED: src-tauri/src/commands/printer.rs:239-248, quote: `match try_send_raw(&bytes) { Ok(()) => Ok(()), Err(e) => { eprintln!("[printer] WARNING: {e}"); write_fallback_bytes(&bytes) } }`], and `write_fallback_bytes` itself only errors on filesystem failure, not printer failure [VERIFIED: src-tauri/src/commands/printer.rs:143-156]. On non-Windows dev machines it *always* takes this branch [VERIFIED: src-tauri/src/commands/printer.rs:249-253, quote: `#[cfg(not(target_os = "windows"))] { eprintln!("[printer] WARNING: non-Windows host; writing receipt bytes to temp file"); write_fallback_bytes(&bytes) }`]. This means a genuine hardware failure on the real target (Windows/WebView2) is not guaranteed to reject the JS-side `invoke()` promise at all in every failure mode — some Windows `WritePrinter` failures do propagate as `Err` (see `win_print::send_raw`'s explicit `Err(...)` returns), but the design intent is graceful degradation, not guaranteed rejection.

**Why it happens:** The Rust layer was deliberately built to never lose a receipt (falls back to a file a human can recover), which is good production behavior but means "the invoke rejected" and "the printer actually failed" are not the same event.

**How to avoid:** For RCP-02/RCP-04 test purposes, simulate failure at the JS/Tauri `invoke()` boundary (mock `invoke` to reject), exactly as CONTEXT.md's confirmed-existing-behavior note already specifies — do not attempt to simulate a "real" printer-absent condition and expect the Rust fallback to surface it as a JS-side rejection, because by design it often won't.

### Pitfall 4: Split-sale reprint must reconstruct ONE receipt, not one per leg

**What goes wrong:** `usePayments()` returns one row per `payments` table record; a split-tender sale produces multiple rows sharing one `tab_id`. A reprint implementation that naively builds `ReceiptData` from the single clicked `payment` row (ignoring sibling legs) will reproduce the exact bug already fixed once in this codebase (CR-03: "a split sale previously showed one leg's amount as the whole sale's total") [CITED: supabase/functions/process-direct-sale/index.ts:187-190, in-repo comment explaining the fix].

**Why it happens:** It's tempting to treat "the payment row the user clicked" as the unit of reprint, since that's the UI affordance — but the receipt's unit of truth is the tab/sale, not the individual tender leg.

**How to avoid:** Group by `tabId` when reconstructing (Pattern 1 already does this, mirroring `buildSaleReceipt()`), so clicking Reprint on any leg of a split sale reproduces the same one full-sale receipt with all `tenders`.

## Code Examples

### 1. Retry loop shape for `printReceipt` (RCP-04)

```typescript
// Source: extends src/shared/lib/pos-printer.ts printReceipt()
const MAX_PRINT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700; // fixed delay — local IPC to a USB/serial printer, not a network call

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

### 2. Vitest retry-count assertion (RCP-04's actual "automated test asserting retry count")

```typescript
// Source: extends src/shared/lib/pos-printer.test.ts's existing describe('printReceipt') block
it('retries print_receipt up to 3 times before failing (RCP-04)', async () => {
  (window as unknown as { __TAURI__: unknown }).__TAURI__ = {};
  vi.mocked(invoke).mockRejectedValue(new Error('Printer offline'));

  const onRetry = vi.fn();
  const result = await printReceipt(sampleReceipt(), defaultReceiptSettings(), onRetry);

  expect(result.ok).toBe(false);
  expect(invoke).toHaveBeenCalledTimes(3);
  expect(onRetry).toHaveBeenCalledTimes(2); // called before attempts 2 and 3, not after the final failure
});

it('succeeds after a transient failure on attempt 2', async () => {
  (window as unknown as { __TAURI__: unknown }).__TAURI__ = {};
  vi.mocked(invoke)
    .mockRejectedValueOnce(new Error('busy'))
    .mockResolvedValueOnce(undefined);

  const result = await printReceipt(sampleReceipt(), defaultReceiptSettings());
  expect(result.ok).toBe(true);
  expect(invoke).toHaveBeenCalledTimes(2);
});
```

### 3. Playwright E2E for RCP-02 (sale survives print failure — needs real UI assertion, not just a function return value)

```typescript
// Source: extends the dual-injection pattern proven in e2e/25-export-reports.spec.ts
test('a printer failure never blocks a completed sale', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__TAURI__ = {};
    (window as any).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) =>
        cmd === 'print_receipt'
          ? Promise.reject(new Error('Printer offline'))
          : Promise.resolve(),
    };
  });
  await loginAs(page, 'cashier');
  // ... drive checkout to completion via scan/cart/pay ...
  await expect(page.getByTestId('receipt-preview')).toBeVisible(); // sale UI shows success
  await expect(page.getByText(/print.*fail/i)).toBeVisible(); // failure surfaced, not swallowed silently
});
```

### 4. Resend attachment payload shape (RCP-03 email path)

```typescript
// Source: supabase/functions/send-receipt-email/index.ts, extended per Resend's documented attachments array
const BodySchema = z.object({
  email: z.string().trim().email(),
  receiptPlainText: z.string().min(1).max(50_000),
  pdfBase64: z.string().max(2_000_000).optional(), // ~1.5MB decoded ceiling, generous for a text receipt PDF
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Print/drawer failures were fire-and-forget, single final `toast.error`, no retry | Bounded automatic retry (2-3 attempts) with visible per-attempt status | This phase (RCP-04, D-02/D-03) | Reduces cashier friction from transient printer hiccups (paper-out cleared mid-jam, USB re-enumeration) without silently losing print jobs |
| Receipt delivery = print + email(plain text) only | + PDF (download and/or email attachment), same underlying formatter | This phase (RCP-03) | Gives the owner an archival/emailable artifact without maintaining a second layout engine |
| No reprint capability at all | Reprint from the recent-payments list, any past sale visible under RLS | This phase (RCP-01) | Closes a real operational gap — paper jams/misprints previously had no recovery path short of re-running the whole sale |

**Deprecated/outdated:** None — this phase does not remove or replace any existing capability, it adds resilience and one new delivery channel around code paths introduced by earlier phases (Phase 2 direct-sale checkout, Phase 15 receipt designer).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A fixed ~500ms-1s delay between retry attempts is sufficient/appropriate (vs. exponential backoff) | Architecture Pattern 2, Standard Stack Alternatives | Low — explicitly left to planner discretion in CONTEXT.md; if a real printer needs longer recovery time (e.g. USB re-enumeration can take 1-2s), the fixed delay may need tuning after real-hardware UAT, but this is a config-value change, not an architecture change |
| A2 | `printReceipt`'s retry-status callback (`onRetry`) is the right integration point for the "Retrying N/3..." toast, rather than a separate polling/event-based mechanism | Code Example 1 | Low — this is the minimal-surface-area option (no new event bus); if the planner's UI-SPEC wants a persistent inline indicator instead of a toast, the callback signature still supports it, just a different consumer |
| A3 | `2,000,000` chars is a safe upper bound for `pdfBase64` in the edge function `BodySchema` | Code Example 4 | Low — a receipt PDF (one page, monospace text, no images unless the store logo is embedded in the shell) is unlikely to exceed a few hundred KB decoded; if a future styled shell embeds the logo image, this cap may need raising, but the current D-05 scope (plain monospace body) stays well under it |

## Open Questions (RESOLVED)

1. **Should the PDF include the store logo (a styled shell), or stay pure monospace text?**
   - What we know: D-05 explicitly leaves a "styled shell (logo/header treatment) around the same monospace text block" open to the planner, as long as it doesn't touch the receipt body content.
   - What's unclear: Whether `receipt_settings.logoDataUrl` (already used for thermal printing per Phase 15) should also render at the top of the PDF.
   - Recommendation: Start without the logo (simplest correct implementation satisfying RCP-03's literal text); note it as a natural, low-risk follow-up since the data (`settings.logoDataUrl`) is already available to whichever component builds the PDF.
   - RESOLVED: No logo — Plan 13-03 implements pure monospace `<Text>` output only (verified by its `grep -n "View\|StyleSheet.create"` acceptance check).

2. **Does the "Reprint" action need a manager PIN gate, matching Refund/Reopen/Edit siblings in the same `PaymentPane` row?**
   - What we know: `RefundButton`/`ReopenTabButton`/`EditTicketButton` in `PaymentPane.tsx` are all plain, ungated buttons at the row level (the PIN gate in `PaymentPane` guards the *payment form* for a still-open tab, not these completed-sale actions) — reprinting a receipt is a strictly lower-risk, non-destructive action than any of them.
   - What's unclear: Whether the planner should add any confirmation at all.
   - Recommendation: No PIN gate, no confirmation dialog — reprint is read-only and non-destructive, consistent with how `RefundButton`/`ReopenTabButton` are themselves ungated at the row-click level (their downstream sheets/dialogs, not row clicks, are where any gating happens).
   - RESOLVED: No PIN gate, no confirmation dialog — Plan 13-02 implements `ReprintButton` as a plain, ungated row action.

## Environment Availability

Skipped — this phase has no new external tool/service dependency beyond what's already installed and configured (Resend, Supabase, Tauri, all already in use by adjacent, shipped features).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (unit) | Vitest 4.1.4 [VERIFIED: package.json:142], config at `vitest.config.ts` |
| Framework (E2E) | Playwright 1.59.1 [VERIFIED: package.json:90], config at `playwright.config.ts` |
| Quick run (unit) | `npx vitest run src/shared/lib/pos-printer.test.ts` |
| Quick run (E2E) | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts` |
| Full suite | `npm run test` (unit) + `npm run test:e2e` (E2E, per CLAUDE.md's mandatory-automated-testing policy — no manual UAT for this project) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RCP-01 | Reprint reconstructs and reprints the most recent sale's exact receipt content | E2E (Playwright) | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts -g "reprint"` | ❌ Wave 0 — new spec file |
| RCP-01 | `useReceiptDataForPayment` correctly reconstructs `ReceiptData` from a known DB fixture (incl. split-sale grouping, Pitfall 4) | Unit/integration (Vitest) | `npx vitest run src/entities/payment/model/queries.test.ts` | ❌ Wave 0 — new test file, likely needs a Supabase local-stack integration test given the multi-table join (mirror `split-payment-rpc.integration.test.ts`'s existing pattern) |
| RCP-02 | Simulated printer failure never blocks/rolls back a completed sale | E2E (Playwright) | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts -g "never blocks"` | ❌ Wave 0 — new spec file |
| RCP-03 | PDF download triggers with correct receipt content | E2E (Playwright), reusing `25-export-reports.spec.ts`'s dialog/fs mock pattern | `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts -g "pdf download"` | ❌ Wave 0 |
| RCP-03 | PDF email attachment payload sent to Resend matches expected shape | Unit (Vitest, edge function logic) or integration test hitting a mocked Resend endpoint | `npx vitest run supabase/functions/send-receipt-email/index.test.ts` (new) | ❌ Wave 0 — no existing test file for this edge function |
| RCP-04 | Transient failure retried 2-3 times, then surfaced as failure | Unit (Vitest) | `npx vitest run src/shared/lib/pos-printer.test.ts -t "retries"` | ❌ Wave 0 — extends existing `pos-printer.test.ts` (file exists, new test cases needed) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/shared/lib/pos-printer.test.ts` (fast, <5s, covers RCP-04 directly)
- **Per wave merge:** `npm run test` (full Vitest suite) + `npx playwright test e2e/56-receipt-delivery-resilience.spec.ts`
- **Phase gate:** `npm run test` + `npm run test:e2e` full green before `/gsd-verify-work`, per CLAUDE.md's non-negotiable automated-testing policy

### Wave 0 Gaps
- [ ] `e2e/56-receipt-delivery-resilience.spec.ts` — new spec covering RCP-01 (reprint), RCP-02 (sale survives print failure), RCP-03 (PDF download trigger); needs the dual `window.__TAURI__` + `window.__TAURI_INTERNALS__` mock helper (Pitfall 2) — consider extracting a shared `e2e/helpers/tauriMocks.ts` since this is now needed by both this phase and (retroactively) `25-export-reports.spec.ts`
- [ ] `src/shared/lib/pos-printer.test.ts` — extend with retry-count and retry-then-succeed cases (RCP-04); file and mocking scaffold already exist
- [ ] A test for `useReceiptDataForPayment` (RCP-01) — given it's a multi-table Supabase join, this likely needs an integration test against the local Supabase stack (mirror `src/entities/payment/model/split-payment-rpc.integration.test.ts`'s existing pattern) rather than a pure-mock unit test, to actually catch join/RLS mistakes
- [ ] `supabase/functions/send-receipt-email/index.ts` has no existing test file at all — Wave 0 should decide whether to add one (asserting the Resend payload shape with attachment present/absent) or cover it purely via the Playwright E2E path

## Security Domain

### Applicable ASVS Categories (Level 1, per `.planning/config.json` `security_asvs_level: 1`)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No new auth surface — reuses existing Supabase session/Bearer token for both the reprint read and the edge function call |
| V3 Session Management | No | Unchanged |
| V4 Access Control | Yes | Reprint's `ReceiptData` reconstruction must go through RLS-gated Supabase client reads (Pattern 1), never a service-role bypass — every table involved (`payments`, `tabs`, `orders`, `order_items`) already has role-gated SELECT policies (`close_tab`/`view_all_tabs` actions) that correctly scope this to cashier+ roles, matching who can already see the recent-payments list at all |
| V5 Input Validation | Yes | `send-receipt-email`'s extended `BodySchema` must Zod-validate the new `pdfBase64` field (size cap, per Code Example 4) exactly like every other field in this codebase's edge functions; the PDF-generation client code should not trust `ReceiptData` fields beyond what `receipt-format.ts`'s existing `sanitize()` already applies (D-05 reuses the same formatter, so this is inherited "for free," not a new control to write) |
| V6 Cryptography | No | No new cryptographic surface — base64 encoding of PDF bytes is transport encoding, not a security control |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Reprint reconstruction reads another store's/cashier's data (cross-tenant/cross-shift leak) | Information Disclosure | Not applicable — single-store app, RLS is role-based not tenant-based; the existing `payments_select_bartender`/`orders_select_bartender` policies (role + `is_deleted = FALSE`) are the correct and sufficient boundary, already proven by the existing recent-payments list using the identical read pattern |
| Oversized/malformed `pdfBase64` payload sent to `send-receipt-email`, causing excessive Resend API cost or a crashed function | Denial of Service | Zod `.max(2_000_000)` cap on the new field (Code Example 4), mirroring the existing `receiptPlainText.max(50_000)` and `printer.rs`'s `MAX_LOGO_DECODED_BYTES` precedent for capping attacker-influenced payload sizes before they reach an expensive operation |
| A malicious/malformed `ReceiptData` (e.g. from a tampered reprint query) injecting control characters into the printed/PDF/emailed output | Tampering | Already mitigated — `buildThermalReceiptText` routes every free-text field through `sanitize()` (imported from `groupOrderItemsForReceipt.ts`), and D-05's requirement that PDF reuse this exact function means the PDF path inherits this sanitization automatically; no new sanitization code needs to be written |

## Sources

### Primary (HIGH confidence — read this session)
- `src/shared/lib/pos-printer.ts` — `printReceipt`, `isTauri()`, retry insertion point
- `src/shared/lib/pos-printer.test.ts` — existing Vitest mocking scaffold for `invoke`/`window.__TAURI__`
- `src/shared/lib/receipt-format.ts` — `buildThermalReceiptText` signature and behavior
- `src/shared/lib/email-receipt.ts`, `src/features/process-payment/ui/EmailReceiptDialog.tsx` — existing email UX
- `supabase/functions/send-receipt-email/index.ts` — edge function to extend
- `supabase/functions/process-direct-sale/index.ts` (`buildSaleReceipt`) — the exact shape reprint must reconstruct
- `supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql` — confirms the RPC never returns receipt content
- `supabase/migrations/20260510000001_rls_rewrite_phase13.sql` — RLS policies proving cashier-role read access to `payments`/`tabs`/`orders`/`order_items`/`profiles`
- `src/entities/payment/model/queries.ts` (`usePayments`) — existing recent-payments read pattern to extend
- `src/widgets/PaymentPane/ui/PaymentPane.tsx` — reprint entry point (D-01)
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` — confirmed fire-and-forget print block (RCP-02 pre-existing behavior)
- `src/shared/lib/exporters/pdf.tsx`, `src/features/export-report/model/useExportReport.ts` — PDF generation and Tauri save-dialog patterns to reuse
- `src-tauri/src/commands/printer.rs` — Rust fallback-to-file behavior (Pitfall 3)
- `node_modules/@tauri-apps/api/core.js`, `node_modules/@tauri-apps/api/mocks.js` — confirms `window.__TAURI_INTERNALS__.invoke` vs. `window.__TAURI__` gate mismatch (Pitfall 2)
- `e2e/25-export-reports.spec.ts` — existing dual-global Tauri IPC mocking pattern to extend
- `src/shared/lib/domain.ts` — `ReceiptSettingsSchema` field definitions
- `.planning/phases/13-receipt-delivery-resilience-print-reprint-retry-pdf/13-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — requirement text and phase history

### Secondary (MEDIUM confidence)
- [Resend attachments documentation](https://resend.com/docs/dashboard/emails/attachments) — `attachments: [{ content, filename }]` payload shape [CITED]

### Tertiary (LOW confidence)
None — every claim in this document is either verified against a file read this session or cited to an official source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, every library already installed and used for an adjacent purpose in this exact codebase
- Architecture (reprint data reconstruction): HIGH — verified against both the RPC SQL and the edge function's exact field-construction code, plus the specific RLS policies that authorize the client-side read
- Pitfalls (Tauri mocking mismatch, Rust fallback masking): HIGH — verified against `node_modules` source and the existing `e2e/25-export-reports.spec.ts` precedent, not inferred

**Research date:** 2026-08-24
**Valid until:** 30 days (stable, internal-codebase-driven research; no fast-moving external dependency versions pinned beyond what's already installed)
