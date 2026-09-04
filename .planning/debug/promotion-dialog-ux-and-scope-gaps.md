---
status: diagnosed
trigger: "UAT gap G-27-8 (27-UAT.md test 8): New Promotion Dialog is too limited — dialog should be a screen, multi-select scope across multiple products/categories, blank/generic store-wide promotion should be a valid save, validity semantics confusing ('last 7 days'), no time-of-day/day-of-week recurrence, single-step dialog instead of a validated wizard, AND percent discount field is uneditable (stuck at 0)."
created: 2026-09-03T00:00:00Z
updated: 2026-09-03T00:10:00Z
---

## Current Focus

hypothesis: "CONFIRMED both parts. Part A: number-typed React state (`useState(0)`) bound directly to a controlled `<input type=\"number\">` in PromotionFormDialog.tsx causes the field to (1) never truly clear (deleting always redisplays literal '0') and (2) accept new digits in front of the existing '0' rather than replacing it, because there's no select-on-focus and no string-buffer intermediate state — reproduced live in real Chromium via a temporary Playwright spec. Part B: five gaps characterized precisely against schema.sql/domain.ts/PromotionFormDialog.tsx/DateRangePicker.tsx with exact line citations."
test: "Live-browser repro (temporary Playwright spec, deleted after use) driving http://localhost:1520/promotions as admin; typed keystrokes into the percent field and read back real DOM inputValue() after each step."
expecting: "n/a — diagnosis complete, goal is find_root_cause_only"
next_action: "Return ROOT CAUSE FOUND / diagnosis to caller. No fix applied (goal: find_root_cause_only)."

## Symptoms

expected: "Percent-discount field accepts typed input; scope supports multi-select across multiple products/categories; blank/unscoped promotion is a valid save; validity has forward-looking recurring day-of-week/time-of-day windows; flow is a multi-step wizard validating on exit"
actual: "See verbatim UAT report in trigger. Percent field appears stuck at 0. Dialog is single-screen, single-product-OR-single-category scope only. No time-of-day/day-of-week recurrence anywhere."
errors: "None reported — UI interaction bug, not a crash"
reproduction: "Open /promotions (admin), click New Promotion, try to type into discount percentage field; review validity/date-range control; review scope selector (single product OR single category); confirm no time-of-day/day-of-week UI or schema field"
started: "Discovered during UAT after Phase 27 shipped 2026-09-02/03"

## Eliminated

## Evidence

- timestamp: 2026-09-03T00:00:00Z
  checked: "src/features/manage-promotions/ui/PromotionFormDialog.tsx (full file, 321 lines)"
  found: "Percent-type discount input (lines 266-282): controlled Input with value={discountValue} (number state, initialized useState(0) at line 58), onChange={e => setDiscountValue(Number(e.target.value))}. Fixed-type discount uses MoneyInput instead (line 289) — different component, not reported broken. No visible clamping/debounce in this file for the percent path."
  implication: "Wiring looks like a standard controlled-input pattern at first read. Need live-browser confirmation of actual failure mode before declaring root cause — will check shared/ui/Input, FormField (clone wrapper), and MoneyInput for hidden interference."

- timestamp: 2026-09-03T00:00:01Z
  checked: "src/shared/ui/input.tsx (Input component, 33 lines) and src/shared/ui/FormField.tsx (98 lines)"
  found: "Input is a bare forwardRef passthrough to <input> with only className merging — no value coercion, no debounce, no internal state. FormField clones its child element but only injects id/aria-invalid/aria-describedby — never touches value/onChange props."
  implication: "Neither shared wrapper explains a stuck-at-0 field. Root cause, if real, must be in PromotionFormDialog.tsx itself or a genuine React controlled-number-input quirk. Proceeding to live Playwright reproduction for ground truth."

- timestamp: 2026-09-03T00:00:02Z
  checked: "src/widgets/SettingsTabsPanel/tabs/NearExpirySettingsTab.tsx line 49 (comparable percent Input field, UAT test 9 passed)"
  found: "NearExpirySettingsTab keeps discountPercent as a STRING state (useState('15')), onChange does setDiscountPercent(event.target.value) directly (no Number() coercion on every keystroke) — only coerces to Number once, at save time (line 28: Number(discountPercent))."
  implication: "This is a meaningfully different pattern from PromotionFormDialog's percent field, which stores discountValue as a NUMBER and re-coerces via Number(e.target.value) on every keystroke. This is the prime suspect: coercing a partially-typed/cleared numeric string back through Number() on every keystroke is the classic React controlled-number-input footgun. Needs live confirmation of the exact failure trigger (e.g., clearing the field, or a specific typed sequence)."

- timestamp: 2026-09-03T00:10:00Z
  checked: "Live browser reproduction — temporary Playwright spec (e2e/promotions/_repro-percent-field.spec.ts, deleted after use) against real Chromium + local dev server (localhost:1520), logged in as admin, /promotions -> New Promotion -> percent field"
  found: "BEFORE typing: value=\"0\". Click field + press \"2\": value becomes \"02\" (not \"2\" — the new digit is inserted BEFORE the existing \"0\", not replacing it, because clicking a lone-character field places the caret before the character in Chromium and there is no onFocus select-all). Press \"0\": value becomes \"020\". Select-all + Delete (an explicit attempt to clear the field): value snaps back to \"0\" (never becomes empty/blank) because the onChange handler computes Number(\"\") === 0, and React's controlled `value={discountValue}` prop forces the DOM back to the literal string \"0\" the instant the underlying number state is (or remains) 0. Typing \"35\" after that clear attempt produces \"035\" (again prepended before the persistent \"0\"), not \"35\"."
  implication: "This is the exact, reproducible mechanism behind the user's 'percentage of discount text box is uneditable, 0 stays always' report. It is not a crash, not a stale-value bug, and not caused by FormField/Input/MoneyInput (all ruled out earlier as bare passthroughs) — it is a controlled-number-input design defect local to PromotionFormDialog.tsx's percent branch."

- timestamp: 2026-09-03T00:11:00Z
  checked: "supabase/migrations/20260901000001_promotions_schema.sql (full file) + src/shared/lib/domain.ts lines 1647-1675 (PromotionSchema)"
  found: "promotions table: product_id/category_id are singular nullable uuid FKs (ON DELETE CASCADE), never arrays/junction tables (lines 33-34). CONSTRAINT promotions_exactly_one_target (line 47-49): `(product_id IS NOT NULL) <> (category_id IS NOT NULL)` — an XOR CHECK that REQUIRES exactly one of the two to be set; both NULL (a blank/store-wide promotion) is rejected at the DB level, both non-NULL is also rejected. PromotionSchema in domain.ts mirrors this exactly: productId/categoryId both UuidSchema.nullable() (lines 1658-1659), scopeType is a 2-value enum ('product'|'category', line 1650), discountValue is a single z.number().positive() (line 1661), startsAt/endsAt are the only temporal fields (TimestampSchema, lines 1662-1663) — no day-of-week/time-of-day fields exist anywhere in the schema."
  implication: "Confirms Part B items 1, 2, and 4 precisely: no multi-target cardinality exists in schema or types; a blank/unscoped promotion is actively rejected by a DB CHECK constraint (not just missing UI); no recurrence/time-window capability exists at any layer (DB, Zod, or component)."

- timestamp: 2026-09-03T00:12:00Z
  checked: "src/features/manage-promotions/ui/PromotionFormDialog.tsx scope-target UI (lines 201-240) and src/shared/ui/CategoryTreePicker/CategoryTreePicker.tsx line 31/33"
  found: "Product target uses shadcn `<Select>` with `onValueChange={val => setTargetId(val)}` (single string). Category target uses `<CategoryTreePicker value={targetId} onChange={setTargetId} .../>` whose own prop types are `value: string | null | undefined` / `onChange: (id: string | null) => void` (line 31, 33) — single-value only, no multi-select variant of this component exists anywhere in shared/ui."
  implication: "Confirms Part B item 1's second half: there is zero multi-select UI in the codebase for this use case — not a wiring gap in the dialog, a genuine absence of the component."

- timestamp: 2026-09-03T00:13:00Z
  checked: "src/shared/ui/DateRangePicker.tsx (full file, 100 lines) + grep for other consumers"
  found: "PRESETS array (lines 20-57) is exactly: 'Today', 'Yesterday', 'Last 7 Days' (from = today-6, to = today), 'This Month' (from = 1st-of-month, to = today) — every preset's `to` clamps at today or earlier; none can express a future/upcoming range. This is the same shared component used by src/pages/reports/index.tsx (confirmed via grep — DateRangePicker has exactly 2 real consumers: reports and PromotionFormDialog.tsx) — a reporting/analytics date-filter component (backward-looking by design, correct for its original use) reused as-is for promotion validity (which needs forward-looking scheduling). PromotionFormDialog.tsx wires it at lines 293-303 with no forward-looking presets added and no copy/label distinguishing 'when did this happen' from 'when will this run'."
  implication: "Precisely explains the user's 'What is last 7 days i mean? its not report its promotions for upcoming days' complaint — confirmed as literal component reuse of the Reports date-range picker, not a promotions-specific control. Confirms Part B item 3 exactly, with exact preset labels cited."

- timestamp: 2026-09-03T00:14:00Z
  checked: "src/features/manage-promotions/ui/PromotionFormDialog.tsx lines 153-320 (render tree) and src/pages/promotions/index.tsx lines 173-222"
  found: "`/promotions` (pages/promotions/index.tsx) IS a real routed page/screen (PageContainer + DataTable). But PromotionFormDialog.tsx wraps its entire content in `<Dialog open={open} onOpenChange={onOpenChange}><DialogContent className=\"max-w-lg\">` (lines 154-155) — a fixed 32rem-wide Radix modal, not a route. All fields (name, scope-type toggle, target picker, discount-type toggle, discount value, date range) live in one non-paginated `<div className=\"space-y-4\">` (lines 162-304) with a single `handleSave()` validation function (lines 106-151) that runs only on final Save click (line 311-313) — there is no step/page boundary, no per-step exit validation, no wizard state machine of any kind."
  implication: "Confirms Part B item 5 exactly: the create/edit FORM (not the list page) is the cramped, single-step modal the user is describing. A wizard/multi-step redesign would need to replace this Dialog-based component structurally, not just resize it."

## Resolution

root_cause: "Part A (genuine bug): PromotionFormDialog.tsx line 58 declares `const [discountValue, setDiscountValue] = useState(0)` (a NUMBER-typed state) and the percent-branch Input (lines 272-281) binds `value={discountValue}` with `onChange={e => setDiscountValue(Number(e.target.value))}`. Coercing straight to Number() on every keystroke, with no intermediate string buffer and no onFocus select-all, means: (a) the field can never display truly empty — clearing it yields Number('')===0, which the controlled `value` prop redisplays as the literal digit '0'; and (b) because '0' is always present and the field never auto-selects on focus, every newly typed digit is inserted in front of the persistent '0' (Chromium's default caret placement for a single-character field) rather than replacing it, producing '02', '020', '035', etc. instead of the typed number. This was reproduced live in a real Chromium browser against the running dev server (see Evidence above) — not a hypothesis, an observed mechanism. Contrast: the sibling NearExpirySettingsTab.tsx (UAT test 9, passed) keeps its equivalent percent field as a STRING state (`useState('15')`, onChange sets the raw string directly, Number() coercion deferred to save time only) — that pattern does not have this defect, confirming the number-state-with-per-keystroke-coercion pattern is specifically what's broken here, not number inputs in general in this codebase.; Part B (five scope/architecture gaps, not bugs — see Evidence Summary below for each)"
fix: ""
verification: ""
files_changed: []
