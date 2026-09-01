# Phase 24: Tax Configuration (Inclusive/Exclusive Toggle) - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 12
**Analogs found:** 12 / 12 (all are modify-in-place; every file already exists with a sibling field/branch to copy)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/lib/domain.ts` (`BillingSettingsSchema`) | model (Zod schema) | CRUD | itself — `taxRatePercent` field, same schema | exact (sibling field) |
| `src/entities/settings/model/queries.ts` (`DEFAULT_BILLING`) | model/query | CRUD | itself — existing `DEFAULT_BILLING` object | exact (sibling field) |
| `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` | component (admin form) | request-response | itself — `taxRatePercent` input/save wiring | exact (sibling field) |
| `src/widgets/PaymentModal/ui/PaymentForm.tsx` (tax calc ~179, 286-291, 771-772) | component (checkout calc) | transform | itself — existing additive `taxAmount`/`subtotalWithTax` useMemo | exact (branch the existing calc) |
| `supabase/migrations/2026090x_*_tax_inclusive.sql` (new migration, `CREATE OR REPLACE FUNCTION public.process_direct_sale_atomic`) | migration / service (RPC) | CRUD | `supabase/migrations/20260831000003_bank_transfers_schema.sql` (current live function body) | exact (must preserve 17-arg signature) |
| `supabase/functions/_shared/tax.ts` (new) | utility (Deno shared module) | transform | `supabase/functions/_shared/audit.ts` (cross-function shared import precedent) | role-match (new file, established import pattern) |
| `supabase/functions/process-direct-sale/index.ts` | service (edge function) | event-driven/request-response | itself — current `subtotal`/`total` receiptData construction (lines ~191, 201-202) | exact (add settings read + `decomposeTax` call) |
| `supabase/functions/process-payment/index.ts` | service (edge function) | event-driven/request-response | `process-direct-sale/index.ts` (same fix pattern) | exact (mirror fix, lines ~314-315, 327-328) |
| `supabase/functions/process-split-payment/index.ts` | service (edge function) | event-driven/request-response | `process-direct-sale/index.ts` (same fix pattern) | exact (mirror fix, lines ~335-336, 346-347) |
| `src/shared/lib/edge-function-contracts.ts` (`ReceiptDataSchema`) | model (Zod schema) | transform | itself — existing optional fields (`discountAmount`, `tenders`) as the optional-field convention | exact (add `taxAmount`/`taxRatePercent`/`taxInclusive` as `.optional()`) |
| `src/shared/lib/receipt-format.ts` (`buildThermalReceiptText`, lines ~220-223) | utility (text renderer) | transform | itself — existing `subtotal`/`total` line-push pattern | exact (insert new line between them) |
| `src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json` | config (i18n catalog) | CRUD | itself — existing `subtotal`/`total` keys | exact (sibling key `tax`) |
| `e2e/helpers/tax.ts` (new, recommended) or 6 spec files patched in place | test utility | transform | `e2e/checkout/atomic-rpc-guards.spec.ts` (`computeAuthoritativeTotal`) as the pattern to generalize; `e2e/helpers/auth.ts` as the shared-helper-file precedent | role-match |

## Pattern Assignments

### `src/shared/lib/domain.ts` — add `taxInclusive`

**Analog:** itself, `BillingSettingsSchema` (lines 811-819 per research)

```typescript
export const BillingSettingsSchema = z.object({
  taxRatePercent: z.number().min(0).max(100).default(16),
  paymentMethods: BillingPaymentMethodsSchema.default({ cash: true, bbvaCard: true, rappi: true }),
  firstHourMode: z.enum(['full', 'prorated']).default('prorated'),
  taxInclusive: z.boolean().default(true), // D-01: default ON
});
```

---

### `src/entities/settings/model/queries.ts` — `DEFAULT_BILLING`

**Analog:** itself (lines 63-67)

```typescript
const DEFAULT_BILLING: BillingSettings = {
  taxRatePercent: 16,
  paymentMethods: { cash: true, bbvaCard: true, rappi: true },
  firstHourMode: 'prorated',
  taxInclusive: true,
};
```

---

### `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` — add toggle

**Analog:** itself — full file read (251 lines). Copy the exact `taxRatePercent` thread end-to-end: local form type → `DEFAULT_FORM` → `useEffect` seed from `data.billing` → save payload → JSX control.

**Form type + default** (lines 13-27):
```typescript
type BillingForm = {
  taxRatePercent: string;
  paymentMethods: { cash: boolean; bbvaCard: boolean; rappi: boolean };
  firstHourMode: 'full' | 'prorated';
  taxInclusive: boolean; // NEW
};

const DEFAULT_FORM: BillingForm = {
  taxRatePercent: '16',
  paymentMethods: { cash: true, bbvaCard: true, rappi: true },
  firstHourMode: 'prorated',
  taxInclusive: true, // NEW — matches D-01
};
```

**Seed from server data** (`useEffect`, lines 44-62) — add `taxInclusive: data.billing.taxInclusive` inside the `setForm({...})` object when `!dirty`.

**Save payload — the pitfall to avoid** (lines 74-95): `save()` builds `value: {...}` from scratch and upserts wholesale (no partial merge) — omitting `taxInclusive` here will silently reset it to `DEFAULT_FORM`'s value on every save:
```typescript
const result = await updateSetting.mutateAsync({
  key: 'billing',
  value: {
    taxRatePercent,
    paymentMethods: form.paymentMethods,
    firstHourMode: form.firstHourMode,
    taxInclusive: form.taxInclusive, // NEW — must be included or saves reset it
  },
});
```

**JSX control** — copy the existing `firstHourMode` two-button toggle pattern (lines 145-184, `POSButton variant={active ? 'default' : 'outline'}`) for a boolean on/off toggle, or a single `POSButton` with `onClick={() => { setDirty(true); setForm(c => ({...c, taxInclusive: !c.taxInclusive})); }}`. Gate stays `ProtectedAction action="manage_products"` (lines 98-102) — this is a pre-existing gate-naming quirk (should arguably be `manage_settings` per CLAUDE.md) but Security Domain research flags it explicitly as out of scope; do not "fix" it silently in this phase.

---

### `src/widgets/PaymentModal/ui/PaymentForm.tsx` — mode-aware calc

**Analog:** itself (lines 286-291, current exclusive-only code, per research `[VERIFIED]`)

```typescript
// current (exclusive-only):
const taxAmount = useMemo(() => {
  if (method === 'rappi') return 0;
  return Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
}, [afterDiscount, method, taxRatePercent]);
const subtotalWithTax = Math.round((afterDiscount + taxAmount) * 100) / 100;
const runningTotal = subtotalWithTax;
```

Branch on `taxInclusive` read from `useSettings()` (same read-path as `taxRatePercent` today):
```typescript
const { subtotal, taxAmount, total } = useMemo(() => {
  if (method === 'rappi') return { subtotal: afterDiscount, taxAmount: 0, total: afterDiscount };
  if (taxInclusive) {
    const subtotal = Math.round((afterDiscount / (1 + taxRatePercent / 100)) * 100) / 100;
    const taxAmount = Math.round((afterDiscount - subtotal) * 100) / 100; // subtract, don't re-derive
    return { subtotal, taxAmount, total: afterDiscount };
  }
  const taxAmount = Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
  return { subtotal: afterDiscount, taxAmount, total: Math.round((afterDiscount + taxAmount) * 100) / 100 };
}, [afterDiscount, method, taxRatePercent, taxInclusive]);
```
Also update the display line at `~771-772` (`paymentForm.taxLabel`) to read from the same values.

---

### Migration: `process_direct_sale_atomic` RPC

**Analog:** `supabase/migrations/20260831000003_bank_transfers_schema.sql` — current live function body (verified `[VERIFIED]` in research; this is the ONLY authoritative copy — do not target the two migrations CONTEXT.md named, they're superseded, see Pitfall 1)

**Critical:** copy the exact current 17-parameter signature from `20260831000003` (`p_customer_phone text DEFAULT NULL::text` is the newest arg) — `CREATE OR REPLACE FUNCTION` with a mismatched signature creates a silent second overload instead of replacing the live one.

**Current tax section:**
```sql
v_subtotal := ROUND(v_subtotal, 2);
SELECT COALESCE((value->>'taxRatePercent')::numeric, 16) INTO v_tax_rate FROM settings WHERE key = 'billing';
v_tax_rate := COALESCE(v_tax_rate, 16);
v_tax := ROUND(v_subtotal * (v_tax_rate / 100.0), 2);
v_derived_total := ROUND(v_subtotal + v_tax, 2);
```

**Mode-aware replacement:**
```sql
SELECT COALESCE((value->>'taxRatePercent')::numeric, 16), COALESCE((value->>'taxInclusive')::boolean, true)
  INTO v_tax_rate, v_tax_inclusive FROM settings WHERE key = 'billing';
v_tax_rate := COALESCE(v_tax_rate, 16);
IF v_tax_inclusive THEN
  v_derived_total := v_subtotal;
  v_tax := ROUND(v_subtotal - ROUND(v_subtotal / (1 + v_tax_rate / 100.0), 2), 2);
ELSE
  v_tax := ROUND(v_subtotal * (v_tax_rate / 100.0), 2);
  v_derived_total := ROUND(v_subtotal + v_tax, 2);
END IF;
```
The anti-tamper check below (`abs(p_amount - v_derived_total) > 0.01`) needs no change.

---

### `supabase/functions/_shared/tax.ts` (new)

**Analog:** `supabase/functions/_shared/audit.ts` — cross-function import precedent. Consumers import via `import { recordAudit } from '../_shared/audit.ts'` (verified in `admin-reset-pin/index.ts:4`, `create-staff/index.ts:4`).

```typescript
// supabase/functions/_shared/tax.ts
export function decomposeTax(chargedAmount: number, taxRatePercent: number, taxInclusive: boolean) {
  if (taxInclusive) {
    const subtotal = Math.round((chargedAmount / (1 + taxRatePercent / 100)) * 100) / 100;
    return { subtotal, taxAmount: Math.round((chargedAmount - subtotal) * 100) / 100, total: chargedAmount };
  }
  const taxAmount = Math.round((chargedAmount * taxRatePercent) / (100 + taxRatePercent) * 100) / 100;
  const subtotal = Math.round((chargedAmount - taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total: chargedAmount };
}
```
Import in each of the 3 edge functions: `import { decomposeTax } from '../_shared/tax.ts';`

---

### `process-direct-sale/index.ts`, `process-payment/index.ts`, `process-split-payment/index.ts`

**Analog:** each other — identical bug, identical fix, per research Finding 5. All three currently do zero reads of `settings`.

**Current (buggy) pattern, `process-direct-sale/index.ts:191,201-202`:**
```typescript
const subtotal = Math.round(legs.reduce((sum, leg) => sum + Number(leg.amount), 0) * 100) / 100;
// ...
subtotal, total: subtotal,
```

**Fix — add a settings read + `decomposeTax` call before building `receiptData`:**
```typescript
const { data: billingRow } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
const billing = billingRow?.value as { taxRatePercent?: number; taxInclusive?: boolean } | null;
const taxRatePercent = billing?.taxRatePercent ?? 16;
const taxInclusive = billing?.taxInclusive ?? true;
const chargedAmount = /* existing total/amount variable */;
const { subtotal, taxAmount, total } = decomposeTax(chargedAmount, taxRatePercent, taxInclusive);
// receiptData: { ...subtotal, taxAmount, taxRatePercent, taxInclusive, total, ... }
```
Same fix mirrors into `process-payment/index.ts:314-315,327-328` (`const subtotal = body.amount; const total = subtotal;`) and `process-split-payment/index.ts:335-336,346-347` (`const subtotal = Number(legRow.amount); const total = subtotal;`).

---

### `src/shared/lib/edge-function-contracts.ts` — `ReceiptDataSchema`

**Analog:** itself — existing optional-field convention (`discountAmount: MoneySchema.nullable().optional()`, `tenders: z.array(...).optional()`, lines 78-89)

```typescript
export const ReceiptDataSchema = z.object({
  // ...existing fields...
  subtotal: MoneySchema,
  total: MoneySchema,
  // NEW, optional per exactOptionalPropertyTypes convention — when building objects by hand use `field: value | undefined`, never `field?:`
  taxAmount: MoneySchema.optional(),
  taxRatePercent: z.number().optional(),
  taxInclusive: z.boolean().optional(),
  // ...
});
```

---

### `src/shared/lib/receipt-format.ts` — new tax line

**Analog:** itself (lines 220-223)

```typescript
lines.push(divider(width));
lines.push(lineLeftRight(tr('receipt.subtotal'), formatMoneyIn(locale, receipt.subtotal), width));
if (receipt.taxAmount != null) {
  lines.push(lineLeftRight(tr('receipt.tax'), formatMoneyIn(locale, receipt.taxAmount), width));
}
lines.push(lineLeftRight(tr('receipt.total'), formatMoneyIn(locale, receipt.total), width));
```
Reuse `formatMoneyIn` exactly as the existing subtotal/total lines do — no new formatting helper.

---

### `src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json`

**Analog:** itself — existing `subtotal`/`total` keys (`es-MX/receipt.json:6-7`)

```json
// es-MX
"tax": "Impuesto",
// en-US
"tax": "Tax",
```

---

### E2E tax helper (Pitfall 3 — 6 specs affected)

**Analog:** `e2e/checkout/atomic-rpc-guards.spec.ts` lines 17-37 (own duplicated helper) and `e2e/helpers/auth.ts` (shared-helper-file precedent: `import { loginAs } from '../helpers/auth'`)

Current per-spec duplicated helper (identical in all 6 files):
```typescript
async function getTaxRatePercent(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const rate = (data?.value as { taxRatePercent?: number } | null)?.taxRatePercent;
  return typeof rate === 'number' ? rate : 16;
}
function computeAuthoritativeTotal(subtotal: number, taxRatePercent: number): number {
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}
```
Recommended: extract to `e2e/helpers/tax.ts` (mirroring `helpers/auth.ts` / `helpers/supabase.ts` as sibling shared-helper files), add `taxInclusive` read + branch:
```typescript
export async function getBillingTaxConfig(admin: SupabaseClient) {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const v = data?.value as { taxRatePercent?: number; taxInclusive?: boolean } | null;
  return { taxRatePercent: v?.taxRatePercent ?? 16, taxInclusive: v?.taxInclusive ?? true };
}
export function computeAuthoritativeTotal(subtotal: number, taxRatePercent: number, taxInclusive: boolean): number {
  if (taxInclusive) return subtotal; // subtotal here means "catalog price total", already the charged total
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}
```
Re-point all 6 specs (`atomic-rpc-guards`, `full-day-soak`, `reopen-closed-ticket`, `report-tabs`, `loose-weight-hold-sale`, `offline`) at this shared helper, replacing their local copies and the hardcoded `* 1.16` literal at `atomic-rpc-guards.spec.ts:123,644`.

---

## Shared Patterns

### Zod-first schema field addition
**Source:** `src/shared/lib/domain.ts` (`BillingSettingsSchema`)
**Apply to:** Every place `taxInclusive` needs to exist — schema first, then thread through `DEFAULT_BILLING`, `BillingSettingsTab.tsx` form state, `PaymentForm.tsx` read, RPC's `settings` read, edge functions' `settings` read. No hand-written parallel TS interface anywhere (CLAUDE.md convention).

### Rounding discipline (subtotal first, tax by subtraction)
**Source:** Pattern 1 in RESEARCH.md, applied identically in SQL, client TS, and the new `_shared/tax.ts`
**Apply to:** `PaymentForm.tsx`, `process_direct_sale_atomic`, `_shared/tax.ts` — always compute `subtotal` by division first, then `taxAmount = total - subtotal` by subtraction. Never independently round both `subtotal` and `taxAmount` from `total` via two separate formulas — the anti-pattern called out in RESEARCH.md that causes `subtotal + taxAmount !== total` by a cent.

### `exactOptionalPropertyTypes` for new optional receipt fields
**Source:** CLAUDE.md TypeScript Gotchas + existing `ReceiptDataSchema` optional fields (`discountAmount`, `changeAmount`)
**Apply to:** Any hand-built `ReceiptData` object literal in the 3 edge functions — write `taxAmount: number | undefined`, never `taxAmount?: number`, when constructing programmatically.

### Cross-edge-function shared code via `_shared/`
**Source:** `supabase/functions/_shared/audit.ts` + relative-import precedent (`../_shared/audit.ts`)
**Apply to:** `_shared/tax.ts`, imported identically by `process-direct-sale`, `process-payment`, `process-split-payment`.

## No Analog Found

None — every file in scope already exists with a directly analogous sibling field/branch/import precedent to copy. `_shared/tax.ts` and `e2e/helpers/tax.ts` are net-new files, but both have a clear same-directory precedent (`_shared/audit.ts`, `e2e/helpers/auth.ts`) rather than needing an external pattern.

## Metadata

**Analog search scope:** `src/shared/lib/`, `src/entities/settings/`, `src/widgets/SettingsTabsPanel/`, `src/widgets/PaymentModal/`, `supabase/migrations/`, `supabase/functions/`, `e2e/checkout/`, `e2e/helpers/`
**Files scanned:** 12 target files + their direct analogs (all read directly or sourced from RESEARCH.md's `[VERIFIED]` excerpts, which were independently confirmed against live source this session)
**Pattern extraction date:** 2026-08-31
