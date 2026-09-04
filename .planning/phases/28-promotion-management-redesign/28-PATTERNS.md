# Phase 28: Promotion Management Redesign - Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/2026090X_promotion_targets.sql` | migration | batch/transform | `supabase/migrations/20260901000001_promotions_schema.sql` | exact |
| `supabase/migrations/2026090X_promotions_recurrence_manager_pin_audit.sql` | migration | request-response | `supabase/migrations/20260903090000_process_direct_sale_manager_pin_reverify.sql` | exact |
| `src/entities/promotion/model/promotion-pricing.ts` (extend) | service (pure fn) | transform | itself (existing) | exact |
| `src/entities/promotion/model/promotion-pricing.test.ts` (extend) | test | transform | existing test file (co-located) | exact |
| `src/shared/lib/domain.ts` (extend `PromotionSchema`, add `PromotionTargetSchema`) | model | CRUD | itself (existing) | exact |
| `src/features/manage-promotions/ui/PromotionWizardPage.tsx` | component (page-level) | request-response | `src/features/manage-promotions/ui/PromotionFormDialog.tsx` | role-match (dialog→page) |
| `src/features/manage-promotions/ui/wizard/StepBasicsDiscount.tsx` | component | request-response | `PromotionFormDialog.tsx` (name/discount fields section) | role-match |
| `src/features/manage-promotions/ui/wizard/StepScope.tsx` | component | request-response | `PromotionFormDialog.tsx` (scope-type + target section) + `CategoryTreePicker.tsx` | role-match |
| `src/features/manage-promotions/ui/wizard/StepValidityRecurrence.tsx` | component | request-response | `PromotionFormDialog.tsx` (date-range section) + `DateRangePicker.tsx` | role-match |
| `src/features/manage-promotions/ui/wizard/StepReview.tsx` | component | transform | `promotion-pricing.ts`'s `evaluateBestPromotion` (consumer) | partial (new pattern) |
| `src/features/manage-promotions/model/usePromotionWizardState.ts` | hook | event-driven (state machine) | none (new pattern in codebase) | no analog |
| `src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx` | component | request-response | `src/shared/ui/command.tsx` (cmdk primitive) + `src/features/manage-modifier-groups/ui/ModifierGroupEditor.tsx` (checkbox-list multi-select precedent) | role-match |
| `src/shared/ui/DateRangePicker.tsx` (extend with `presets` prop) | component | request-response | itself (existing) | exact |
| `src/features/process-refund/ui/RefundSheet.tsx` (fix `onSuccess`) | component | request-response | `src/widgets/PaymentModal/ui/PaymentForm.tsx` (already-fixed sibling, Plan 27-08) | exact |
| `src/features/reopen-tab` / `edit-paid-tab` UI dialogs (fix `onSuccess`) | component | request-response | `src/widgets/PaymentModal/ui/PaymentForm.tsx` | exact |
| `src/features/process-refund/model/useProcessRefund.ts` (thread `p_manager_pin`) | hook (mutation) | request-response | `src/features/checkout-sale` mutation hook that threads `p_manager_pin` (Plan 27-08) | exact |

## Pattern Assignments

### `supabase/migrations/2026090X_promotion_targets.sql` (migration, batch/transform)

**Analog:** `supabase/migrations/20260901000001_promotions_schema.sql` (current schema) — read this file directly for exact current column/constraint names before writing DROP statements (not excerpted here since RESEARCH.md already contains the full recommended replacement DDL — see RESEARCH.md "Code Examples" section, copy verbatim: junction table, partial unique indexes for Pitfall 2, recurrence columns, `needs_review` backfill).

**Backfill-before-drop ordering pattern** (from RESEARCH.md, mirrors this repo's own migration style):
```sql
-- 1. CREATE TABLE promotion_targets ... (junction table + partial unique indexes)
-- 2. INSERT INTO promotion_targets (promotion_id, product_id) SELECT id, product_id FROM promotions WHERE product_id IS NOT NULL;
--    INSERT INTO promotion_targets (promotion_id, category_id) SELECT id, category_id FROM promotions WHERE category_id IS NOT NULL;
-- 3. UPDATE promotions SET needs_review = true;  -- BEFORE dropping old columns, marks every pre-existing row
-- 4. ALTER TABLE promotions ADD COLUMN days_of_week int[], ADD COLUMN start_time time, ADD COLUMN end_time time,
--      ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
--      DROP COLUMN scope_type, DROP COLUMN product_id, DROP COLUMN category_id, DROP CONSTRAINT promotions_exactly_one_target;
-- 5. ADD CONSTRAINT promotions_recurrence_both_or_neither / promotions_recurrence_same_day / promotions_days_of_week_valid
```
End every migration file with `NOTIFY pgrst, 'reload schema';` (verbatim final line of the manager-pin-reverify migration below — every migration in this repo ends this way).

---

### `supabase/migrations/2026090X_promotions_recurrence_manager_pin_audit.sql` (migration, request-response) — Wave B (folded todo)

**Analog:** `supabase/migrations/20260903090000_process_direct_sale_manager_pin_reverify.sql` (full file read — the proven G-27-13 fix)

**Full re-key pattern to copy for `process_refund`, and append-param pattern for `reopen_tab`/`edit_paid_tab`** (lines 109-116 of the analog):
```sql
IF p_manager_override THEN
  SELECT p.id INTO v_manager_staff_id
  FROM profiles p JOIN role_permissions rp ON rp.role = p.role
  WHERE p.pin = p_manager_pin AND p.is_active = true AND rp.action = 'apply_custom_discount';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Not authorized to apply a manager override');
  END IF;
END IF;
```
For `process_refund` (already has `p_manager_pin`, currently unread): replace the existing
`SELECT id INTO v_staff_id FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin')`
pattern with `WHERE p.pin = p_manager_pin AND p.is_active = true AND rp.action = 'process_refund'`
(see RESEARCH.md "RPC re-verification fix template" for the exact before/after).

For `reopen_tab`/`edit_paid_tab` (no `p_manager_pin` today): append `p_manager_pin text DEFAULT NULL::text`
as the **last** parameter (never insert mid-list — PostgREST schema-cache/function-identity resolution
breaks otherwise, per the analog's own header comment "Pitfall 5"), preceded by
`DROP FUNCTION IF EXISTS public.<fn>(<old signature>);` before the `CREATE OR REPLACE`.

**`close_tab` disposition** — analog `20260703000004_close_tab_rpc.sql` (current live def, zero auth
check, lines 55-88 per RESEARCH.md). Recommended default: harden with the same
`profiles p JOIN role_permissions rp` pattern above rather than revoke `EXECUTE` (see RESEARCH.md
Open Question 2 — reversible either way, harden costs nothing).

**File-header comment convention** to copy: every fix migration in this repo opens with a
`-- ====` banner block explaining root cause, citing the `.planning/debug/` doc, and stating
scope boundary ("this migration is scoped to X, everything else copied verbatim") — see lines 1-36
of the analog.

---

### `src/entities/promotion/model/promotion-pricing.ts` (extend)

**Analog:** itself — read in full above (113 lines).

**What must change:** `evaluateBestPromotion`'s scope-match line (currently):
```typescript
const matchesScope =
  (promo.scopeType === 'product' && promo.productId === product.productId) ||
  (promo.scopeType === 'category' && promo.categoryId === product.categoryId);
```
becomes a junction-array-based match (0 targets = store-wide) plus a new AND-filter for
`daysOfWeek`/`startTime`/`endTime` using the `getStoreLocalDowAndTime` helper pattern given
verbatim in RESEARCH.md "Pattern 3" (lifted from `e2e/promotions/timezone-boundary.spec.ts`).
Keep the function's zero-import, pure-function contract — no new dependency.

**Error handling / fallback pattern:** none needed — pure function, `null` return is the existing
not-found signal, preserve as-is.

---

### `src/features/manage-promotions/ui/PromotionWizardPage.tsx` + `wizard/Step*.tsx`

**Analog:** `src/features/manage-promotions/ui/PromotionFormDialog.tsx` (full source read above, 337 lines)

**Imports pattern** (lines 1-23) — copy the import grouping convention (entities → shared/ui → local model):
```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCategories } from '@entities/category';
import { useProducts } from '@entities/product';
import type { Promotion } from '@entities/promotion';
import { useStaffStore } from '@entities/staff';
import type { DiscountType, PromotionScopeType } from '@shared/lib/domain';
import { DateRangePicker, FormField, Input, MoneyInput, POSButton, Select, ... } from '@shared/ui';
import { CategoryTreePicker, type CategoryPickerItem } from '@shared/ui/CategoryTreePicker';
import { useMutationSavePromotion } from '../model/useMutationSavePromotion';
```

**Create-vs-edit prefill pattern** (lines 69-96) — the `useEffect` that resets/prefills all field
state when `open`/`promotion` changes is the exact pattern `usePromotionWizardState.ts` should
follow (reset on mount for create, prefill from `promotion` prop for edit — same effect, same
eslint-disable comment for `react-hooks/set-state-in-effect`).

**String-buffered numeric-input pattern** (lines 59-62, 135) — reuse verbatim for any new numeric
wizard fields (e.g. a duration or count), not just discount percent:
```tsx
// String-buffered percent input: raw string state, no per-keystroke Number()
// coercion. Number() applied once, at validate/save time.
const [discountPercentStr, setDiscountPercentStr] = useState('0');
// ...
const percentValue = Number(discountPercentStr);
```

**Validation-before-save pattern** (lines 121-145) — per-field `setXError`/`hasError` accumulation,
`if (hasError) return;` guard. Reuse per-step in each `StepXxx.tsx`'s "can advance" check (D-08).

**Save + toast + close pattern** (lines 147-166):
```tsx
const result = await save.mutateAsync({ ...(promotion ? { id: promotion.id } : {}), /* fields */ });
if (!result.ok) {
  toast.error(result.error.message);
  return;
}
toast.success(t('promotionFormDialog.savedToast'));
onOpenChange(false); // → for wizard: navigate(-1) or navigate('/promotions')
```

**Scope-type toggle button-group pattern** (lines 105-110, 193-215) — reuse this exact
POSButton-pair toggle shape for any wizard step's binary/enum choice (e.g. discount type toggle
at lines 258-280 is the same pattern again):
```tsx
<div className="flex gap-2">
  {(['product', 'category'] as const).map(type => (
    <POSButton key={type} type="button" touchSize="default"
      variant={scopeType === type ? 'default' : 'outline'}
      onClick={() => { handleScopeTypeChange(type); }} className="flex-1">
      {type === 'product' ? t('...Product') : t('...Category')}
    </POSButton>
  ))}
</div>
```

**FormField wrapping pattern** (lines 179-191, 218-256) — every field is wrapped in
`<FormField label required error={...}>`; StepScope/StepValidityRecurrence should keep this
wrapping for every new field (multi-select, day checkboxes, time inputs).

**Date-range consumption** (lines 309-319) — `DateRangePicker` is used exactly this way today;
`StepValidityRecurrence.tsx` extends this same block with day-of-week checkboxes + start/end time
inputs directly below it.

---

### `src/shared/ui/MultiSelectPicker/MultiSelectPicker.tsx`

**Analogs:**
1. `src/shared/ui/CategoryTreePicker/CategoryTreePicker.tsx` (full source read above, 247 lines) —
   pure presentation component contract to mirror: accepts a flat `items` array + controlled
   `value`/`onChange`, does NOT fetch data itself, keyboard-accessible (`role="tree"`/`"treeitem"`,
   Enter/Space/Arrow handling). For `MultiSelectPicker`, mirror this shape but with
   `value: string[]` / `onChange: (ids: string[]) => void` and `role="listbox"`/`"option"` +
   `aria-multiselectable={true}` instead of `role="tree"`.
2. `src/shared/ui/command.tsx` (shadcn Command/cmdk primitive) — use for the search-as-you-type
   input inside the picker; RESEARCH.md confirms this is the only existing search-combobox
   primitive and currently has zero multi-select consumers.
3. `src/features/manage-modifier-groups/ui/ModifierGroupEditor.tsx` — codebase's own precedent
   for "select many of these" is a plain checkbox list (per RESEARCH.md "Explicitly NOT needed"
   table) — read this file directly before implementing if the checkbox-list (vs. cmdk-driven)
   approach is chosen for the non-search-input rows.

**Component doc-comment convention to copy** (CategoryTreePicker.tsx lines 1-10):
```tsx
/**
 * MultiSelectPicker
 *
 * [one-line purpose]. Supports controlled multi-selection via `value` / `onChange`.
 * Keyboard-accessible: ...
 *
 * This is a PURE presentation component — it accepts a flat list and renders
 * it locally. It does NOT fetch data.
 */
```

---

### `src/shared/ui/DateRangePicker.tsx` (extend with `presets` prop)

**Analog:** itself — full source read above (99 lines).

**Current preset shape to generalize (do not fork the component)**:
```tsx
type Preset = { label: string; from: () => string; to: () => string };
const PRESETS: Preset[] = [ { label: 'Today', from: () => toDateStr(new Date()), to: () => toDateStr(new Date()) }, ... ];
```
Add a `presets?: Preset[]` prop defaulting to the existing backward-looking `PRESETS` array (so
Reports keeps working unchanged); the promotion wizard passes a forward-looking array
(e.g. "Next 7 Days", "This Month", "Next 30 Days") built with the same `toDateStr`/`d.setDate`
helpers already in this file, just adding instead of subtracting days. `toDateStr` (lines 11-16)
is reused as-is.

---

### `RefundSheet.tsx` / reopen-tab / edit-paid-tab `onSuccess` fix (Wave B)

**Analog:** RESEARCH.md's "Client-side thread-through fix" example, itself derived from
`src/widgets/PaymentModal/ui/PaymentForm.tsx` (Plan 27-08's already-shipped fix — read that file
directly before implementing to confirm current exact shape).

**Pattern to copy verbatim across all three dialogs:**
```tsx
<ManagerPinDialog
  open={pinOpen}
  onOpenChange={setPinOpen}
  requiredAction="process_refund" // or the relevant action per dialog
  onSuccess={(staff) => {
    setPinOpen(false);
    void handleSubmitRefund(staff.pin); // was: void handleSubmitRefund()
  }}
/>
```
Then thread `staff.pin` through to the mutation hook's RPC call as `p_manager_pin` (mirrors
`useProcessRefund.ts:36`'s existing-but-unused parameter — remove the hardcoded `''`).

---

## Shared Patterns

### Form validation + toast-on-error
**Source:** `src/features/manage-promotions/ui/PromotionFormDialog.tsx:121-166`
**Apply to:** All four wizard step components and `usePromotionWizardState.ts`'s save handler —
per-field error state, `hasError` accumulation, `toast.error(result.error.message)` on `Result<T>`
failure, `toast.success(...)` + navigate-away on success.

### Store-local timezone conversion (TS side)
**Source:** `e2e/promotions/timezone-boundary.spec.ts` (pattern reproduced in RESEARCH.md Pattern 3)
**Apply to:** `promotion-pricing.ts`'s new recurrence filter and `StepReview.tsx`'s live preview —
never `Date.getDay()`/`Date.getHours()`, always `Intl.DateTimeFormat({ timeZone })`.

### Store-local timezone conversion (SQL side)
**Source:** `supabase/migrations/20260721000007_fix_peak_hours_timezone.sql` (existing `AT TIME ZONE` idiom) + RESEARCH.md Pattern 2
**Apply to:** the recurrence migration's plpgsql mirror in `process_direct_sale_atomic` — settings
lookup for `v_store_tz` uses the same `SELECT ... COALESCE(...) FROM settings WHERE key = '...'`
double-fallback pattern already used for `v_tax_rate`/`v_near_expiry_threshold` (lines 142-145 of
the manager-pin-reverify migration read above).

### Manager-PIN identity re-verification (server-side)
**Source:** `supabase/migrations/20260903090000_process_direct_sale_manager_pin_reverify.sql:109-116`
**Apply to:** `process_refund`, `reopen_tab`, `edit_paid_tab`, `close_tab` (Wave B) — always
`profiles p JOIN role_permissions rp ON rp.role = p.role WHERE p.pin = p_manager_pin AND p.is_active = true AND rp.action = '<action>'`,
never trust `auth.uid()`/`p_staff_id` for a privileged override.

### Migration file conventions
**Source:** every file under `supabase/migrations/` (see analogs above)
**Apply to:** both new migrations — header comment banner citing root-cause doc + scope statement,
append-only new RPC parameters (never insert mid-list, per "Pitfall 5"), end with
`NOTIFY pgrst, 'reload schema';`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/features/manage-promotions/model/usePromotionWizardState.ts` | hook (state machine) | event-driven | First multi-step wizard in this codebase (RESEARCH.md: "genuinely new territory... no prior wizard to compare against"). Use RESEARCH.md's "Pattern 1: Wizard as a controlled Tabs component" (Radix `shared/ui/tabs.tsx`, `currentStep`/`furthestValidStep` state) as the implementation spec instead of a codebase analog. |
| `src/features/manage-promotions/ui/wizard/StepReview.tsx`'s live-price-preview wiring | component | transform | No existing "preview computed output before save" UI pattern exists elsewhere in this codebase; build directly against `evaluateBestPromotion`'s existing signature (see `promotion-pricing.ts` excerpt above) rather than searching for a further UI analog. |

## Metadata

**Analog search scope:** `src/features/manage-promotions/`, `src/shared/ui/`, `src/entities/promotion/`, `supabase/migrations/`, `src/features/process-refund/`, `src/widgets/PaymentModal/`, `e2e/promotions/`
**Files scanned:** ~15 read in full (PromotionFormDialog.tsx, CategoryTreePicker.tsx, DateRangePicker.tsx, promotion-pricing.ts, 20260903090000_process_direct_sale_manager_pin_reverify.sql full body) plus RESEARCH.md's pre-verified excerpts of ManagerPinDialog.tsx, useProcessRefund.ts, RefundSheet.tsx, close_tab_rpc.sql, command.tsx
**Pattern extraction date:** 2026-09-04
