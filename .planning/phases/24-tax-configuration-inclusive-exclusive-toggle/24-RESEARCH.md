# Phase 24: Tax Configuration (Inclusive/Exclusive Toggle) - Research

**Researched:** 2026-08-31
**Domain:** Internal codebase change (Zod schema + React form + Postgres RPC + Deno edge functions + receipt text builder). No new external library/API involved.
**Confidence:** HIGH — every claim below was verified by reading the actual current source, not the historical files CONTEXT.md pointed at (several of which are stale — see Finding 1).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `taxInclusive` defaults to **ON** on upgrade — matches the confirmed reality that this
  store's shelf prices already include tax, so the bug is fixed the moment the migration ships
  with no separate admin action required. — **Reversibility:** reversible — it's a settings-table
  boolean with a plain UI toggle; an admin can flip it back to `off` any time from Billing Settings.
- **D-02:** No remediation for already-completed sales that were overcharged tax under the old
  additive-on-top math. This phase is a forward-looking code fix, not a financial cleanup/refund
  exercise — explicit user call, not an oversight.
- **D-03:** Receipts currently show **no tax line at all** (thermal/PDF/email all print
  subtotal + total only — confirmed by reading `receipt-format.ts` and `ReceiptDataSchema`, which
  has no `taxAmount` field today). Build the breakdown fresh so it **always** shows
  subtotal + tax + total, in both inclusive and exclusive mode — same 3-line shape everywhere,
  just different math feeding it. — **Reversibility:** reversible — additive UI/schema field, no
  data migration on existing receipts (historical receipts aren't regenerated).
- **D-04:** Keep both modes (inclusive AND exclusive) even though this is a single-store product
  whose prices are confirmed tax-inclusive today — TAX-01..03 already lock in a real toggle with
  both states in REQUIREMENTS.md; build it as specified rather than narrowing to inclusive-only.
  The exclusive branch mostly reuses the existing (currently-buggy-when-misapplied) additive math
  already in `PaymentForm.tsx` and the two RPCs, so it isn't meaningfully extra work.

### Claude's Discretion
- Exact receipt line labels/wording (e.g. "IVA incl." vs "Impuesto") within the existing
  `receipt` i18n namespace — not locked by discussion, follow existing label conventions in
  `receipt.json`.
- Whether the two duplicated server-side tax formulas (`process_direct_sale_atomic` and its
  cost-snapshot variant) get de-duplicated into a shared SQL function as part of this migration,
  or just both patched in place with identical logic — flagged as a smell in prior exploration but
  not a locked requirement; planner's call based on migration complexity.
  **Research correction: this discretion point is moot** — there is no longer a second,
  separately-callable "cost-snapshot variant." Both migrations CONTEXT.md named define the *same*
  function name and were each superseded by later `DROP FUNCTION`/`CREATE FUNCTION` redefinitions;
  exactly one live `process_direct_sale_atomic` exists today (see Finding/Pitfall 1). Write the
  mode-aware formula once, in that one function.
- Report/margin impact: scouted and found **no report widget currently reads `subtotal`/tax
  fields** — reports sum `payments.amount`/order totals, which are unaffected by whether that
  total was computed inclusively or additively. Treat report changes as out of scope unless
  research surfaces an actual dependency.
  **Research confirms this holds** — verified `get_caja_report`/`get_payment_methods_report`
  aggregate from `payments.amount` only, and grepped `src/widgets/CajaReportPanel`,
  `PaymentMethodsReport`, `features/export-report` for `subtotal`/`taxAmount`/`taxRatePercent`
  with zero matches.

### Deferred Ideas (OUT OF SCOPE)
- **Per-product/category tax override** — out of scope; confirmed no such concept exists in the
  schema today and nothing in this discussion asked for one. If ever needed, it's a separate
  future phase.
- **Refund/adjustment for historically overcharged sales** — explicitly ruled out for this phase
  (D-02), not lost — could resurface as a manual admin ask, but is not planned work here.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAX-01 | Billing settings gains a `taxInclusive` boolean toggle (admin-only), alongside `taxRatePercent`. | `BillingSettingsSchema` current shape verified (`domain.ts:811-819`); exact field to add + form/save-payload wiring gaps identified in `BillingSettingsTab.tsx` (Pitfall 6) and `DEFAULT_BILLING` (`queries.ts:63-67`). |
| TAX-02 | Inclusive mode: total unchanged, tax decomposed backward (`subtotal = total/(1+rate/100)`, `tax = total-subtotal`). | Exact current additive-only formula verified in both `PaymentForm.tsx:286-291` and the live SQL body; mode-aware replacement formula given in Pattern 1, with the rounding-order rule (subtotal first, tax by subtraction) called out as the correctness-critical detail. |
| TAX-03 | Exclusive mode: keep today's additive math unchanged. | Verified this is a no-op — the exclusive branch is a verbatim copy of the current code (Pattern 1's exclusive branch = existing lines, unchanged). |
| TAX-04 | Server RPC(s) recompute tax mode-aware and anti-tamper-check against it; must not reject valid inclusive-mode sales. | Located and read the single live RPC definition (not two, per Finding/Pitfall 1) and its exact anti-tamper comparison lines; confirmed no other RPC (`process_payment_atomic`/`process_split_payment_atomic`) contains tax math that also needs patching. |
| TAX-05 | Receipts (thermal/PDF/email) show decomposed subtotal+tax line matching active mode. | Traced the full data flow from RPC → all 3 receipt-building edge functions (all currently buggy, not just the one CONTEXT.md named) → single shared `buildThermalReceiptText` render path used by all 4 UI surfaces (Pattern 2, Pitfall 2, Open Question 1). |
</phase_requirements>

## Summary

This phase is a pure internal refactor: no new dependency, no new architectural layer. The
work touches five points that all currently share one bug — every place that computes
"tax" assumes shelf prices are tax-exclusive and adds tax on top. The single most important
research finding is that **CONTEXT.md's canonical_refs for the server-side RPC are stale**:
the two migration files it names (`20260816000001` and `20260818000003`) were each superseded
by later `DROP FUNCTION` + `CREATE FUNCTION` redefinitions of the *same* function
(`process_direct_sale_atomic`), most recently in `20260831000003_bank_transfers_schema.sql`
(same day as this phase's CONTEXT.md). There is **one** live function today, not two — the
"cost-snapshot variant" was folded into the main function back in `20260818000003` and never
existed as a second, separately-callable RPC. This resolves CONTEXT.md's discretion question
("shared SQL helper vs. duplicate the formula in two RPCs") as moot: write the mode-aware tax
formula in exactly one place, the current `process_direct_sale_atomic` body, via a fresh
`CREATE OR REPLACE FUNCTION` migration that carries forward the *current* (`20260831000003`)
16-argument signature unchanged.

The second major finding is that the "receipt has no tax line" story in CONTEXT.md is caused by
something more specific than "nobody built it yet": **all three payment-completing edge
functions** (`process-direct-sale`, `process-payment`, `process-split-payment`) independently
set `receiptData.subtotal = receiptData.total = <amount actually charged>` — there is no tax
math in any of them today, and none of them currently reads the `settings` table at all. Adding
the tax line is therefore an edge-function change (compute `subtotal`/`taxAmount` from
`billing.taxRatePercent`/`taxInclusive` before returning `receiptData`), not a
`receipt-format.ts`-only change. All four client render paths (`ReceiptPreview.tsx`, thermal
print, PDF, email) already funnel through the single `buildThermalReceiptText()` function, so
that part of CONTEXT.md's framing ("4 render paths need the same tax line") is accurate and
simple — one function, one place to add the line.

The third finding is a live regression risk: six Playwright E2E specs each hand-roll an
identical `computeAuthoritativeTotal()` helper that hardcodes the additive formula
(`total = subtotal * 1.16`-equivalent) to predict what the RPC will charge. Since D-01 flips the
default to `taxInclusive = true` on the very migration that ships this phase, every one of these
specs will start asserting the wrong expected total the moment the migration runs, unless the
planner updates all six in the same phase.

**Primary recommendation:** One migration (`CREATE OR REPLACE FUNCTION public.process_direct_sale_atomic(...)`, current 16-arg signature) makes the RPC mode-aware; one edge-function change (a small shared `_shared/tax.ts` helper) makes all three receipt-building edge functions mode-aware and adds `subtotal`/`taxAmount`/`taxRatePercent`/`taxInclusive` to `ReceiptData`; `buildThermalReceiptText` gets one new line; `PaymentForm.tsx`'s three tax lines (~179, 286-290, 771-772) become mode-aware; and six e2e spec helpers + ~4 unit-test fixture files get updated for the new default.

## Project Constraints (from CLAUDE.md)

- **No manual/human-verify checkpoints.** Every verification of this phase's work must be an
  automated Playwright assertion in `e2e/` — this rules out any `checkpoint:human-verify` for
  confirming receipt output or tax math visually; use the property-based/snapshot tests in
  Validation Architecture instead.
- **Zod-first types.** `taxInclusive` must be added to `BillingSettingsSchema` in `domain.ts`
  first; never hand-write a parallel TS interface for it.
- **`exactOptionalPropertyTypes: true`.** If `taxAmount`/`taxRatePercent`/`taxInclusive` are added
  to `ReceiptDataSchema` as optional, mutation/construction sites must write
  `taxAmount: number | undefined`, never `taxAmount?: number`, when building the object
  programmatically (schema-level `.optional()` is fine; it's object *literals* built by hand that
  must follow this rule).
- **No `any` without a same-line justification comment.** Not expected to be needed for this
  phase — no missing generated-types workaround applies here (`settings`/`billing` value column
  is already `jsonb`, already handled via existing `db = supabase as any` pattern only where it
  already exists).
- **Commit convention:** `fix(24): <description>` or `feat(24): <description>` per Conventional
  Commits, ticket-id-scoped to this phase.
- **RPC pattern:** alter via `CREATE OR REPLACE FUNCTION` when the signature is unchanged
  (verified this phase's case — signature is unchanged, only the tax section of the body changes
  — see Pitfall 1 for the exact current signature to preserve).
- **i18n namespace rules:** the new tax-line label belongs in the `receipt` namespace
  (`src/shared/lib/i18n/locales/{es-MX,en-US}/receipt.json`), sibling to the existing
  `receipt.subtotal`/`receipt.total` keys — never introduce a second i18n mechanism.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `taxInclusive` setting storage/shape | API/Backend (Postgres `settings` table via Zod schema) | Browser/Client (form) | Single source of truth is the Zod schema in `domain.ts`, mirrored into the `settings` row; the admin form is a thin editor over it (existing `BillingSettingsTab` pattern). |
| Client-side checkout tax display (pre-payment preview) | Browser/Client (`PaymentForm.tsx`) | — | Must mirror server math exactly for UX (shown before submit) but is never authoritative — server always recomputes. |
| Authoritative tax computation + anti-tamper total check | API/Backend (`process_direct_sale_atomic` RPC) | — | This RPC already owns 100% of the current (buggy) tax math; it is the sole authority the client total is checked against. |
| Receipt tax line composition (`subtotal`/`taxAmount`/`total`) | API/Backend (3 Deno edge functions: `process-direct-sale`, `process-payment`, `process-split-payment`) | Browser/Client (`receipt-format.ts` text rendering) | The numbers must be computed once, server-side, from the same settings row the RPC used — the client only formats/prints what it's given. |
| Receipt text/PDF/email rendering of the new line | Browser/Client (`buildThermalReceiptText`) | — | Single existing function already shared by all 4 render surfaces (thermal, PDF, email, in-app preview). |
| Report/margin math | Database/Storage (`get_caja_report`, `get_payment_methods_report`) | — | **Confirmed out of scope** — verified these RPCs aggregate from `payments.amount` only, never `subtotal`/tax fields (Finding 7). |

## Standard Stack

No new dependency is needed for this phase — Zod (already `^4`), the existing Postgres/plpgsql
RPC pattern, and the existing Deno edge-function runtime cover everything. `npm view`/registry
checks are not applicable; skip Package Legitimacy Audit (no new packages).

### Reused (no new install)
| Library/Utility | Where | Purpose in this phase |
|---|---|---|
| Zod v4 | `src/shared/lib/domain.ts` | Add `taxInclusive: z.boolean()` to `BillingSettingsSchema` |
| `formatMoneyIn` | `src/shared/lib/format.ts` | Format the new tax line's amount, same as every other receipt line |
| plpgsql `ROUND(x, 2)` | `process_direct_sale_atomic` | Same rounding convention already used for `v_subtotal`/`v_tax`/`v_derived_total` |
| Client `Math.round(x * 100) / 100` | `PaymentForm.tsx` | Same rounding convention already used for `taxAmount`/`subtotalWithTax` |

## Package Legitimacy Audit

Not applicable — this phase installs no new packages. No `npm view`/registry check required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────┐
│ BillingSettingsTab.tsx   │  admin toggles taxInclusive ──┐
└───────────┬──────────────┘                               │
            │ useMutationUpdateSetting({key:'billing',...}) │
            ▼                                               ▼
   ┌──────────────────┐                          settings table (key='billing')
   │  settings table   │◄─────────────────────────────────┘
   └─────────┬─────────┘
             │ read by BOTH paths below (must derive identical numbers)
    ┌────────┴─────────────────────────────────────────┐
    ▼                                                    ▼
PaymentForm.tsx (client preview, NOT authoritative)   process_direct_sale_atomic RPC (authoritative)
  - taxRatePercent/taxInclusive from useSettings()       - re-reads settings.billing row
  - mode-aware taxAmount/subtotalWithTax                 - re-derives v_subtotal from catalog prices
  - shown to cashier before submit                       - mode-aware v_tax/v_derived_total
    │                                                     - rejects p_amount if it disagrees >$0.01
    │ submit(amount = subtotalWithTax) via                │ (anti-tamper guard — TAX-04)
    │ callProcessDirectSale (edge fn)                     ▼
    └───────────────────────────────────────────►  process-direct-sale edge function
                                                            │ calls RPC, then buildSaleReceipt()
                                                            │ buildSaleReceipt must ALSO read
                                                            │ settings.billing (currently doesn't)
                                                            │ to populate subtotal/taxAmount/total
                                                            ▼
                                                     ReceiptData (subtotal, taxAmount,
                                                     taxRatePercent, taxInclusive, total)
                                                            │
                          ┌─────────────────────────────────┼───────────────────────────┐
                          ▼                                 ▼                            ▼
                 buildThermalReceiptText()      receiptToPdfBytes() wraps        sendReceiptByEmail()
                 (in-app ReceiptPreview,         buildThermalReceiptText's       wraps the same text
                  thermal print via Rust)        exact text output in one PDF    output as plaintext body
```

Note: `process-payment` and `process-split-payment` edge functions have the *identical*
`subtotal = total = amount` bug (Finding 5) for the generic tab-payment path (reopen/edit-paid-tab
receipts) — they are drawn out of this diagram for clarity but must receive the same fix; see
Common Pitfalls.

### Recommended structure for the new logic
No new files/folders needed at the FSD layer — this is field-additions to existing
files. One new file is worth adding at the edge-function layer:

```
supabase/functions/
└── _shared/
    ├── audit.ts          # existing precedent for cross-function Deno imports
    └── tax.ts            # NEW — decomposeTax(amount, ratePercent, inclusive) helper,
                           #       imported by process-direct-sale, process-payment,
                           #       process-split-payment (see Pattern 2)
```

### Pattern 1: Mode-aware tax formula (client + SQL, must match exactly)

**What:** Two branches of one formula, selected by `taxInclusive`.
**When to use:** Anywhere tax is derived from a total/subtotal for checkout or receipt display.

```ts
// Exclusive (today's existing math, unchanged) — TAX-03
// afterDiscount is the sum of catalog prices, tax-exclusive by definition when off
const taxAmount = Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
const total = Math.round((afterDiscount + taxAmount) * 100) / 100;

// Inclusive (new) — TAX-02
// afterDiscount IS the total already (prices include tax) — do not add anything
const total = afterDiscount; // unchanged, already rounded to cents by catalog prices
const subtotal = Math.round((total / (1 + taxRatePercent / 100)) * 100) / 100;
const taxAmount = Math.round((total - subtotal) * 100) / 100; // NOT re-derived from rate — avoids a 1¢ drift vs. total
```

`[VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.tsx:286-291]` current exclusive-only code:
```
const taxAmount = useMemo(() => {
  if (method === 'rappi') return 0;
  return Math.round(afterDiscount * (taxRatePercent / 100) * 100) / 100;
}, [afterDiscount, method, taxRatePercent]);
const subtotalWithTax = Math.round((afterDiscount + taxAmount) * 100) / 100;
const runningTotal = subtotalWithTax;
```

```sql
-- Source: supabase/migrations/20260831000003_bank_transfers_schema.sql (current live function body)
-- [VERIFIED: supabase/migrations/20260831000003_bank_transfers_schema.sql — extracted via
--  `awk '/^CREATE FUNCTION public.process_direct_sale_atomic/,/^\$\$;/'`]
v_subtotal := ROUND(v_subtotal, 2);
SELECT COALESCE((value->>'taxRatePercent')::numeric, 16) INTO v_tax_rate FROM settings WHERE key = 'billing';
v_tax_rate := COALESCE(v_tax_rate, 16);
v_tax := ROUND(v_subtotal * (v_tax_rate / 100.0), 2);
v_derived_total := ROUND(v_subtotal + v_tax, 2);
```

Mode-aware replacement (exclusive branch = verbatim existing lines above; inclusive branch is new):
```sql
SELECT COALESCE((value->>'taxRatePercent')::numeric, 16), COALESCE((value->>'taxInclusive')::boolean, true)
  INTO v_tax_rate, v_tax_inclusive FROM settings WHERE key = 'billing';
v_tax_rate := COALESCE(v_tax_rate, 16);
IF v_tax_inclusive THEN
  v_derived_total := v_subtotal;                                    -- no addition, TAX-02
  v_tax := ROUND(v_subtotal - ROUND(v_subtotal / (1 + v_tax_rate / 100.0), 2), 2);
ELSE
  v_tax := ROUND(v_subtotal * (v_tax_rate / 100.0), 2);              -- unchanged, TAX-03
  v_derived_total := ROUND(v_subtotal + v_tax, 2);
END IF;
```
The anti-tamper checks immediately below (`abs(p_amount - v_derived_total) > 0.01`) need no
change — they already compare against whatever `v_derived_total` ends up being.

### Pattern 2: Shared tax-decomposition helper for edge functions (recommended, not in CONTEXT.md)

**What:** A `_shared/tax.ts` module (mirroring the existing `_shared/audit.ts` cross-function
import precedent) exporting one pure function used by all three payment-completing edge
functions when building `receiptData`.
**When to use:** Anywhere `receiptData.subtotal`/`total` is currently set from a raw payment
amount with no tax math (all three edge functions today).

`[VERIFIED: supabase/functions/_shared/audit.ts exists; imported cross-function]` —
`[VERIFIED: supabase/functions/admin-reset-pin/index.ts:4]` `import { recordAudit } from '../_shared/audit.ts'` proves the relative cross-function import pattern this recommendation reuses.

```ts
// supabase/functions/_shared/tax.ts (new)
export function decomposeTax(chargedAmount: number, taxRatePercent: number, taxInclusive: boolean) {
  if (taxInclusive) {
    const subtotal = Math.round((chargedAmount / (1 + taxRatePercent / 100)) * 100) / 100;
    return { subtotal, taxAmount: Math.round((chargedAmount - subtotal) * 100) / 100, total: chargedAmount };
  }
  // chargedAmount already includes additive tax by the time it reaches receipt-building
  // (it's `amount` == what the RPC charged, i.e. subtotal+tax) — same backward pass, since
  // process_direct_sale_atomic's p_amount is always v_derived_total either way.
  const taxAmount = Math.round((chargedAmount * taxRatePercent) / (100 + taxRatePercent) * 100) / 100;
  const subtotal = Math.round((chargedAmount - taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total: chargedAmount };
}
```
**Why one helper instead of three copies:** the three edge functions (`process-direct-sale`,
`process-payment`, `process-split-payment`) each build their own `receiptData` object
independently — `[VERIFIED: supabase/functions/process-direct-sale/index.ts:191,201-202]`
`const subtotal = Math.round(legs.reduce((sum, leg) => sum + Number(leg.amount), 0) * 100) / 100; ... subtotal, total: subtotal,`,
`[VERIFIED: supabase/functions/process-payment/index.ts:314-315,327-328]`
`const subtotal = body.amount; const total = subtotal; ... subtotal, total,`, and
`[VERIFIED: supabase/functions/process-split-payment/index.ts:335-336,346-347]`
`const subtotal = Number(legRow.amount); const total = subtotal; ... subtotal, total,`.
Deno edge functions in this repo already share code via relative imports from `_shared/`
(established pattern, see `[VERIFIED: supabase/functions/create-staff/index.ts:4]`
`import { recordAudit } from '../_shared/audit.ts'`), so this is the "don't hand-roll it three
times" option, not a new architectural concept.

**Important:** all three edge functions currently do **zero** reads of the `settings` table.
Each will need one added query (`admin.from('settings').select('value').eq('key','billing').maybeSingle()`) before calling `decomposeTax()`.

### Anti-Patterns to Avoid
- **Re-deriving `taxAmount` from `rate` on both sides of a subtraction:** compute
  `subtotal` first, then `taxAmount = total - subtotal` (not `total * rate/(100+rate)` and
  separately `total / (1+rate/100)`) — two independent roundings of the same total can disagree
  by a cent and make `subtotal + taxAmount !== total` on the printed receipt. Pattern 1 above
  already does this correctly for the RPC's `v_tax`/`v_derived_total`; the edge-function
  `decomposeTax` helper's inclusive branch does it correctly (`subtotal` first, `taxAmount` from
  subtraction) but its **exclusive** branch needs the same discipline — see Common Pitfalls.
- **Patching only `process-direct-sale`'s edge function:** the identical bug exists in
  `process-payment` and `process-split-payment` (Finding 5) — those two build `receiptData` for
  the reopen-tab/edit-paid-tab/generic-split flows still reachable from `/payments`
  (`PaymentPane`). Fixing one and not the others produces receipts with a tax line on direct
  sales but not on reopened/edited sales.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Money rounding | A new rounding helper | Existing `Math.round(x * 100) / 100` (client) / `ROUND(x, 2)` (SQL) convention, already used at every existing tax/discount line in this codebase | Consistency is what keeps the ±$0.01 anti-tamper tolerance from ever tripping — introducing a different rounding strategy anywhere in the chain is the exact bug class TAX-04 exists to prevent. |
| Cross-edge-function code sharing | Copy-paste the tax formula into 3 `index.ts` files | `_shared/tax.ts` (Pattern 2), following the existing `_shared/audit.ts` import precedent | This repo already has the plumbing (relative imports work in Supabase Edge Functions); duplicating a money formula 3x is the "smell" CONTEXT.md already flagged, just at the edge-function layer instead of the SQL layer. |

**Key insight:** The two duplicated-formula risks in this codebase are not where CONTEXT.md
placed them (SQL — turns out there's only one copy there) but where nobody looked: the three
edge functions, and six copy-pasted e2e test helpers (Finding 6). Both are real "don't
hand-roll it three/six times" opportunities the planner should take.

## Common Pitfalls

### Pitfall 1: CONTEXT.md's SQL canonical_refs point at dead code
**What goes wrong:** A migration written against `20260816000001_direct_sale_authoritative_totals.sql:153-156` or `20260818000003_process_direct_sale_atomic_cost_snapshot.sql:100-103` as "the function to patch" will `CREATE OR REPLACE FUNCTION` with a **16-parameter** signature that doesn't match Postgres's function-overload resolution against the actual, currently-registered 17-parameter signature (`p_customer_phone` was added in `20260831000003`), silently creating a second overloaded function instead of replacing the live one — the app keeps calling the old buggy one.
**Why it happens:** `process_direct_sale_atomic` has been redefined via `DROP FUNCTION` + `CREATE FUNCTION` three times after the two migrations CONTEXT.md names (`20260828000001_drop_tip_amount.sql` dropped `p_tip_amount`; `20260831000003_bank_transfers_schema.sql` added `p_customer_phone`). `[VERIFIED: supabase/migrations/20260831000003_bank_transfers_schema.sql:376-380]` — `DROP FUNCTION IF EXISTS public.process_direct_sale_atomic(...); CREATE FUNCTION public.process_direct_sale_atomic(p_staff_id uuid, ..., p_customer_name text DEFAULT 'Walk-in'::text, p_customer_phone text DEFAULT NULL::text)` is the current live signature.
**How to avoid:** The new migration must copy the exact current 17-parameter signature (verified above) and use `CREATE OR REPLACE FUNCTION` (safe here since the signature is unchanged — only the body's tax section changes).
**Warning signs:** `\df process_direct_sale_atomic` in psql showing two overloads after the migration runs; or a checkout that silently keeps double-charging tax after the "fix" ships.

### Pitfall 2: `receiptData.subtotal` is not actually a subtotal today
**What goes wrong:** Code (or a planner) assumes `receiptData.subtotal` already holds a pre-tax number that just needs a `taxAmount` field added alongside it.
**Why it happens:** In all three edge functions, `subtotal` is set to the exact same value as `total` — the full charged amount — with a variable named `subtotal` purely for schema-shape reasons, not because any tax was excluded. `[VERIFIED: supabase/functions/process-direct-sale/index.ts:191,196-202]` quoted above.
**How to avoid:** Treat `receiptData.subtotal` as needing to be **recomputed** from scratch via `decomposeTax()`, not incrementally extended.
**Warning signs:** A receipt printing `Subtotal: $116.00 / Tax: $16.00 / Total: $116.00` (subtotal and total identical, tax line just decorative) instead of `Subtotal: $100.00 / Tax: $16.00 / Total: $116.00`.

### Pitfall 3: Six e2e specs hardcode the additive formula and will start failing the moment `taxInclusive` defaults to true
**What goes wrong:** `e2e/checkout/atomic-rpc-guards.spec.ts`, `e2e/soak/full-day-soak.spec.ts`, `e2e/tabs/reopen-closed-ticket.spec.ts`, `e2e/reports/report-tabs.spec.ts`, `e2e/inventory/loose-weight-hold-sale.spec.ts`, and `e2e/infra/offline.spec.ts` each define an identical `computeAuthoritativeTotal(subtotal, taxRatePercent)` helper: `[VERIFIED: e2e/checkout/atomic-rpc-guards.spec.ts:34-36]` `function computeAuthoritativeTotal(subtotal: number, taxRatePercent: number): number { const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100; ... }` (additive-only, no inclusive branch) plus a hardcoded literal `[VERIFIED: e2e/checkout/atomic-rpc-guards.spec.ts:123,644]` `Math.round(Number(product.base_price) * 1.16 * 100) / 100`. Once D-01 ships `taxInclusive = true` as the default, the real RPC will charge `product.base_price` unchanged (no ×1.16), and every one of these assertions will fail.
**Why it happens:** Copy-pasted test helper, never centralized (no `e2e/helpers/tax.ts` exists today, unlike the existing `e2e/helpers/auth.ts` precedent).
**How to avoid:** In the same phase, either (a) update all 6 copies to also read `taxInclusive` from settings and branch, or (b) extract one `e2e/helpers/tax.ts` (following the `helpers/auth.ts` precedent) and re-point all 6 specs at it — recommended, since it's the same DRY opportunity as Pattern 2 and prevents a 7th copy next time tax logic changes.
**Warning signs:** `npm run test:e2e` failing broadly across checkout/soak/tabs/reports/inventory/infra folders immediately after this phase's migration ships, with amounts off by exactly the tax percentage.

### Pitfall 4: Existing unit-test receipt fixtures assert `subtotal === total`
**What goes wrong:** `[VERIFIED: src/shared/lib/receipt-format.test.ts:23-24,67,107-108,155-156,446,477,494,510]` — e.g. `subtotal: 90, total: 90` — roughly a dozen fixtures in this one file alone hardcode subtotal and total as the same number, because that has always been true until now. If TAX-05's "always show subtotal + tax + total" is implemented by making `taxAmount` a required field on `ReceiptDataSchema`, every one of these fixtures becomes invalid at Zod-parse or produces a nonsensical `Tax: $0.00` / `Subtotal: $90.00 / Total: $90.00` line.
**How to avoid:** Either make the new fields optional (mirroring how `discountAmount`/`tenders` are already optional on `ReceiptDataSchema`, only rendered `if (receipt.taxAmount != null)`) and update fixtures incrementally, or budget time to update all fixture files (`receipt-format.test.ts`, `receipt-pdf.test.ts`, `email-receipt.test.ts`, `ReceiptPreview.test.tsx`/`.stories.tsx`) in the same phase if D-03's "always show" is implemented as a hard requirement.
**Warning signs:** `npm run test` failures in `src/shared/lib/receipt-format.test.ts` immediately after `buildThermalReceiptText` is changed.

### Pitfall 5: `PaymentForm.test.tsx` / `PaymentModal.test.tsx` set `taxRatePercent: 0` deliberately
**What goes wrong:** `[VERIFIED: src/widgets/PaymentModal/ui/PaymentForm.test.tsx:41,45]` — `// taxRatePercent=0 keeps assertions simple — no tax arithmetic needed. taxRatePercent: 0,` and the identical pattern in `[VERIFIED: src/widgets/PaymentModal/PaymentModal.test.tsx:30,35]`. With `taxRatePercent: 0`, `taxInclusive`'s branch is a no-op either way (division by `1 + 0/100 = 1`), so these two files likely need **no** behavior change — but they will need a `taxInclusive` field added to their settings mocks once it's a non-optional field on `BillingSettingsSchema` (Zod parse of the mock object would otherwise apply the schema default, which is harmless, but confirm mock objects aren't asserted for exact shape elsewhere).
**How to avoid:** Add `taxInclusive: true` (or `false`, doesn't matter given rate 0) to these mocks preemptively rather than relying on Zod's default silently filling the gap.

### Pitfall 6: `BillingSettingsTab.tsx`'s save handler doesn't currently touch `firstHourMode`/other fields it doesn't own defensively
**What goes wrong:** `[VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:81-88]` — `save()` builds the whole `value: { taxRatePercent, paymentMethods: form.paymentMethods, firstHourMode: form.firstHourMode }` object from local form state and upserts it wholesale (`onConflict: 'key'`) — there's no partial-patch merge. Adding `taxInclusive` to the form's local state (`BillingForm` type, `DEFAULT_FORM` constant) and to this save payload is required, or every billing settings save from this tab will silently reset `taxInclusive` back to whatever `DEFAULT_FORM` says.
**How to avoid:** Add `taxInclusive: boolean` to `BillingForm`, seed it from `data.billing.taxInclusive` in the `useEffect` at `[VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:44-62]`, and include it in the `save()` payload — same pattern as `taxRatePercent`.

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. No renamed identifiers, no
runtime state relocation. (The Zod schema gets a new field with a default, which existing
`settings` rows will simply not have until first written — `parseBilling()`'s
`BillingSettingsSchema.safeParse` fallback-to-`DEFAULT_BILLING` behavior already handles a
missing key gracefully, and D-01 requires the *default itself* to be `true`.)

## Code Examples

### Adding the field to the Zod schema (single source of truth)
```ts
// src/shared/lib/domain.ts — [VERIFIED: src/shared/lib/domain.ts:811-819]
// current:
export const BillingSettingsSchema = z.object({
  taxRatePercent: z.number().min(0).max(100).default(16),
  paymentMethods: BillingPaymentMethodsSchema.default({ cash: true, bbvaCard: true, rappi: true }),
  firstHourMode: z.enum(['full', 'prorated']).default('prorated'),
});
// add (D-01: default true):
//   taxInclusive: z.boolean().default(true),
```

### `DEFAULT_BILLING` in the settings query layer also needs the field
```ts
// src/entities/settings/model/queries.ts — [VERIFIED: src/entities/settings/model/queries.ts:63-67]
const DEFAULT_BILLING: BillingSettings = {
  taxRatePercent: 16,
  paymentMethods: { cash: true, bbvaCard: true, rappi: true },
  firstHourMode: 'prorated',
};
// needs: taxInclusive: true,
```

### The receipt-text insertion point
```ts
// src/shared/lib/receipt-format.ts — [VERIFIED: src/shared/lib/receipt-format.ts:221-223]
lines.push(divider(width));
lines.push(lineLeftRight(tr('receipt.subtotal'), formatMoneyIn(locale, receipt.subtotal), width));
lines.push(lineLeftRight(tr('receipt.total'), formatMoneyIn(locale, receipt.total), width));
// new tax line goes between these two, using a new `receipt.tax` i18n key
// (existing keys confirmed: [VERIFIED: src/shared/lib/i18n/locales/es-MX/receipt.json:6-7]
//  "subtotal": "Subtotal", "total": "Total" — sibling pattern to follow for the new key)
```

## State of the Art

Not applicable in the external sense (no library/framework version drift involved). Internally,
the "state of the art" for this exact function has moved three times since the migrations
CONTEXT.md cites — see Pitfall 1's migration timeline. The planner should treat
`20260831000003_bank_transfers_schema.sql` as the only authoritative current definition of
`process_direct_sale_atomic`.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `process_direct_sale_atomic` additive-only tax, 16-arg sig, no `p_customer_phone` | Same additive-only tax bug, 17-arg sig with `p_customer_phone`/`bank_transfer` support | `20260831000003_bank_transfers_schema.sql` (2026-08-31, day of this phase's context) | Any new migration must match the 17-arg signature or risk creating a duplicate overload (Pitfall 1). |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `es-MX`/`en-US` label text for the new `receipt.tax` i18n key — left to Claude's Discretion per CONTEXT.md, no locked wording. Suggest `"Impuesto"` (es-MX) / `"Tax"` (en-US) as the plain, unambiguous choice, matching the register of neighboring keys (`"Subtotal"`, `"Total"`) rather than `"IVA incl."` which presumes a specific tax regime name. | Code Examples / Pattern (receipt line) | Low — cosmetic only, easily changed post-hoc since it's a fresh field with no historical receipts to reconcile (D-03's own reversibility note). |
| A2 | Recommending `taxInclusive` be stored as `boolean` (not enum `'inclusive' \| 'exclusive'`) in the Zod schema, matching the field name and REQUIREMENTS.md's own wording (`taxInclusive boolean toggle`, TAX-01). | Code Examples | Low — REQUIREMENTS.md TAX-01 already says "boolean toggle" verbatim, so this is a direct requirement read, not really an assumption; flagged only because the exact literal `z.boolean().default(true)` call itself wasn't found pre-written anywhere in the repo (it's new code, not a verified existing pattern). |

**If this table is empty:** N/A — see above; both assumptions are low-risk styling choices, not architectural risk.

## Open Questions

1. **Should `process-payment` and `process-split-payment` edge functions be fixed in this phase, or is `process-direct-sale` alone sufficient to satisfy TAX-05?**
   - What we know: TAX-05 says "printed/PDF/email receipts show the decomposed subtotal + tax line" without restricting to direct-sale checkout. CONTEXT.md's phase description focuses on "checkout" (direct-sale) specifically. But `process-payment`/`process-split-payment` build receipts for the still-reachable reopen-tab/edit-paid-tab/generic-split flows on `/payments` (`PaymentPane`), and have the byte-identical bug (Finding 5).
   - What's unclear: whether shipping inconsistent receipts (tax line on fresh checkout sales, none on reopened/edited ones) is acceptable for v1 of this phase or must be closed now.
   - Recommendation: fix all three in this phase via the shared `_shared/tax.ts` helper (Pattern 2) — the marginal cost is low (one shared helper + 3 call sites + 3 settings reads) versus shipping a visibly inconsistent receipt experience across the app's two payment surfaces.

2. **Does the anti-tamper guard's ±$0.01 tolerance still hold with the inclusive-mode backward-decomposition rounding path?**
   - What we know: the exclusive-mode path is unchanged (already proven safe at $0.01 tolerance in production). The inclusive-mode path never re-adds anything to `v_subtotal` to get `v_derived_total` (they're equal), so there's no new rounding step in the number the anti-tamper check compares against — only the *displayed* `subtotal`/`tax` split (which the guard doesn't check) gains a rounding step.
   - What's unclear: none, functionally — flagged only so the planner writes an explicit test case (e.g. `taxRatePercent = 16`, some odd-cent `base_price` like `$12.37`) proving `subtotal + taxAmount === total` to the cent in inclusive mode, since `subtotal` is derived by division (non-exact) then `taxAmount` by subtraction.
   - Recommendation: add one property-based test (`fast-check`, already a dependency per CLAUDE.md) asserting `Math.round((subtotal + taxAmount) * 100) === Math.round(total * 100)` for the inclusive branch over a range of totals/rates.

## Environment Availability

Skipped — this phase has no external dependencies beyond the already-running local Supabase
stack and Deno edge-function runtime, both already required by and working in this codebase for
every other payment-related phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (E2E) — both already configured |
| Config file | `supermarket-pos/vitest.config.ts` (unit), `supermarket-pos/playwright.config.ts` (E2E) |
| Quick run command | `npx vitest run src/shared/lib/receipt-format.test.ts` / `npx playwright test e2e/checkout/atomic-rpc-guards.spec.ts` |
| Full suite command | `npm run test` (unit) / `npm run test:e2e` (E2E) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TAX-01 | `taxInclusive` boolean persists via admin form | unit | `npx vitest run src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.test.tsx` | ✅ (needs new assertions, file exists) |
| TAX-02 | Inclusive mode: total unchanged, tax decomposed backward | unit + property | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` | ✅ Wave 0 gap: add a `taxInclusive: true, taxRatePercent: 16` fixture case (existing tests all use `taxRatePercent: 0`, see Pitfall 5) |
| TAX-03 | Exclusive mode: additive math unchanged | unit | `npx vitest run src/widgets/PaymentModal/ui/PaymentForm.test.tsx` | ✅ existing coverage largely applies (rate 0 case is degenerate for both modes — needs a nonzero-rate exclusive case too) |
| TAX-04 | RPC rejects/accepts totals matching the active mode | E2E | `npx playwright test e2e/checkout/atomic-rpc-guards.spec.ts` | ✅ Wave 0 gap: update `computeAuthoritativeTotal` to be mode-aware (Pitfall 3) before this spec can pass post-migration |
| TAX-05 | Receipts show decomposed subtotal+tax+total in both modes | unit | `npx vitest run src/shared/lib/receipt-format.test.ts` | ✅ Wave 0 gap: existing fixtures need `taxAmount`/`taxInclusive` fields added or the new line asserted absent-then-present (Pitfall 4) |

### Sampling Rate
- **Per task commit:** the specific test file(s) touched by that task (see table above)
- **Per wave merge:** `npm run test` (full unit suite — cheap, no dev server needed)
- **Phase gate:** `npm run test:e2e` full suite green (all 6 affected specs from Pitfall 3, plus `e2e/checkout/*`, `e2e/receipts/*`, `e2e/payments/*`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/helpers/tax.ts` — recommended new shared helper (mirrors `e2e/helpers/auth.ts`); if the planner instead chooses to patch the 6 specs independently, this gap doesn't apply but each of the 6 files still needs its `computeAuthoritativeTotal`/`getTaxRatePercent` updated for mode-awareness.
- [ ] A property-based test for inclusive-mode rounding (`fast-check`, Open Question 2) — no existing file covers this; add to `src/widgets/PaymentModal/ui/PaymentForm.test.tsx` or a new `src/shared/lib/tax.test.ts` if the formula is extracted into a shared client util.
- [ ] Fixture updates across `receipt-format.test.ts`, `receipt-pdf.test.ts`, `email-receipt.test.ts`, `ReceiptPreview.test.tsx`/`.stories.tsx`, `BillingSettingsTab.test.tsx`, `billing-settings.test.ts` — none are missing files, all need field additions (Pitfalls 4-6).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged — no auth surface touched |
| V3 Session Management | No | Unchanged |
| V4 Access Control | Yes | `taxInclusive` toggle lives under the existing `BillingSettingsTab`, already gated by `ProtectedAction action="manage_products"` `[VERIFIED: src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx:98-102]` — note this gate is `manage_products`, not `manage_settings`, despite CLAUDE.md describing the Settings page generally as `manage_settings`-gated; flag this pre-existing gate choice to the planner rather than silently "fixing" it as part of this phase (out of scope unless the planner deliberately decides to correct it). |
| V5 Input Validation | Yes | Zod (`BillingSettingsSchema`) validates `taxInclusive` client-side; the RPC re-reads the raw `settings` JSONB value with `COALESCE(...::boolean, true)` server-side, so a malformed/missing settings row fails safe to the new default rather than erroring the RPC. |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client submits a `p_amount` computed under the wrong mode (e.g. stale cached settings) to under-pay | Tampering | Already mitigated by the existing anti-tamper guard (`abs(p_amount - v_derived_total) > 0.01` in `process_direct_sale_atomic`) — this phase must ensure `v_derived_total` is computed with the *server's* `taxInclusive` value, never trusting a client-submitted mode flag (the client never sends one — mode is entirely server-settings-derived, which this phase's design already reflects). |

## Sources

### Primary (HIGH confidence — all `[VERIFIED]`, read directly this session)
- `src/widgets/PaymentModal/ui/PaymentForm.tsx` (lines 113, 150-330, 750-780) — current client tax calc, call sites, settings read
- `src/shared/lib/domain.ts:795-821` — `BillingSettingsSchema` current shape
- `supabase/migrations/20260816000001_direct_sale_authoritative_totals.sql`, `20260818000003_process_direct_sale_atomic_cost_snapshot.sql`, `20260828000001_drop_tip_amount.sql`, `20260831000003_bank_transfers_schema.sql` — full migration history of `process_direct_sale_atomic`, confirming current live signature/body
- `supabase/functions/process-direct-sale/index.ts`, `process-payment/index.ts`, `process-split-payment/index.ts` — receipt-building `subtotal`/`total` construction in all 3 edge functions
- `src/shared/lib/edge-function-contracts.ts:50-92` — current `ReceiptDataSchema`
- `src/shared/lib/receipt-format.ts` — `buildThermalReceiptText`, confirmed single shared render path
- `src/shared/lib/exporters/receipt-pdf.tsx`, `src/shared/lib/email-receipt.ts`, `src/features/process-payment/ui/ReceiptPreview.tsx` — confirmed all 3 wrap `buildThermalReceiptText`'s output, not independent renderers
- `src/entities/settings/model/queries.ts` — `DEFAULT_BILLING`, settings snapshot mapping
- `src/widgets/SettingsTabsPanel/tabs/BillingSettingsTab.tsx` — admin form + save payload
- `src/shared/lib/i18n/locales/es-MX/receipt.json` — existing `receipt.subtotal`/`receipt.total` key conventions
- `e2e/checkout/atomic-rpc-guards.spec.ts`, `soak/full-day-soak.spec.ts`, `tabs/reopen-closed-ticket.spec.ts`, `reports/report-tabs.spec.ts`, `inventory/loose-weight-hold-sale.spec.ts`, `infra/offline.spec.ts` — duplicated `computeAuthoritativeTotal` helper, confirmed via grep + read
- `src/shared/lib/receipt-format.test.ts`, `PaymentForm.test.tsx`, `PaymentModal.test.tsx`, `billing-settings.test.ts`, `BillingSettingsTab.test.tsx` — existing test fixtures needing updates
- `.planning/config.json` — confirmed `security_enforcement: true`, `nyquist_validation: true`

### Secondary (MEDIUM confidence)
None — no external/CITED sources were needed; this phase has no new library or public API surface.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack, only existing internal patterns verified by reading them
- Architecture: HIGH — every call site and edge function was read directly, not inferred
- Pitfalls: HIGH — all 6 pitfalls are grounded in actual grep/read results (migration timeline, edge-function bodies, duplicated e2e helper), not speculation

**Research date:** 2026-08-31
**Valid until:** Should be re-verified if any further `process_direct_sale_atomic`
migration lands before this phase is planned/executed (the function has been redefined 5 times
already in this repo's history) — check `grep -rl "process_direct_sale_atomic" supabase/migrations/` for anything newer than `20260831000003` before writing the plan's migration.
