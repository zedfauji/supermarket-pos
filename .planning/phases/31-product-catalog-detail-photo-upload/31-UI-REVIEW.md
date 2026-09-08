# Phase 31 — UI Review

**Audited:** 2026-09-08
**Baseline:** `31-UI-SPEC.md` (approved design contract, checker sign-off 7/7 PASS)
**Screenshots:** not captured — dev server at `localhost:1520` did not respond with a healthy root document (`curl` returned `404`); audit is code-only against `ProductDetailDialog.tsx`, `ProductDetailsTab.tsx`, `ProductLinksTab.tsx`, `ProductPhotoTab.tsx`, `CatalogProductsTab.tsx`, `dialog.tsx`, `DataTable.tsx`, and the existing visual-regression spec (`e2e/visual/46-product-dialog-baseline.spec.ts`, 2 tests / 9 snapshots / 11+ measurement assertions, reported passing in 31-05-SUMMARY.md).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Every new string is keyed in both locales exactly per the Copywriting Contract; error copy always names the offending thing + next step (D-11 rule honored). |
| 2. Visuals | 4/4 | Rail icon set, focal points (Name / drop zone / Save), and icon+label pairing all match the contract; dialog close button keeps its pre-existing sr-only label. |
| 3. Color | 4/4 | No hardcoded hex/rgb in any phase-31 file; brand accent confined to the 4 declared reservations (rail indicator, focus ring, drag-over state, nothing else). |
| 4. Typography | 4/4 | Exactly the declared 11/14/18px sizes and 400/600 weights; no stray `font-bold`, no undeclared size classes. |
| 5. Spacing | 3/4 | Dialog/panel/rail dimensions match the contract exactly, **but** the catalog photo column has no `w-14` (or any) fixed-width class — its ~72px width is incidental (`size-10` content + `TableCell`'s default `px-4`), not a declared, enforced column width. |
| 6. Experience Design | 4/4 | Full loading/error/empty/populated state matrix implemented for the Photo tab and dialog form, with two real production bugs (create-submit silent failure, unmemoized-columns edit-loss) found and fixed during the phase, not left as debt. |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **Catalog photo column has no declared fixed width** (`src/features/manage-products/ui/CatalogProductsTab.tsx:282-296`, `src/shared/ui/DataTable.tsx` — `TableHead`/`TableCell` render with no `size`/`meta.className`) — Impact: low today (thumbnail content is fixed at `size-10` so nothing currently grows the column), but the contract's explicit intent — "fixed `size-10` box… mixed rows never shift column width" — is enforced by luck (short header text), not by CSS. Fix: add a `size: 56` (or the measured-real 64–80px range) to the `photo` `ColumnDef` and thread it into a `width` style on the `TableHead`/`TableCell` in `DataTable.tsx`, or at minimum a `w-14`/`w-[4.5rem]` className on the header cell to match what 31-05's own visual-regression spec had to work around with a tolerance band instead of asserting a real contract value.
2. **31-UI-SPEC.md's own literal figure (`w-14` = 56px) is stale against the implementation** (~72.7px measured, per 31-05-SUMMARY.md's own note) — this is a spec/implementation drift that was caught and documented by the executor but never fed back into the contract. Fix: update `31-UI-SPEC.md`'s Catalog table row to state the real ~72px figure (or fix rung 1 above so 56px becomes true), so the design contract stays a source of truth rather than a known-wrong reference future phases might copy from.
3. **`CatalogProductsTab`'s search box is non-functional** (pre-existing defect, explicitly logged as out-of-scope in 31-05-SUMMARY.md, not introduced by this phase) — the `searchable` `DataTable` prop is wired but the interactive columns carry no `accessorFn`/`accessorKey`, so TanStack Table's global filter predicate has nothing to match. Not a phase-31 regression, but it sits directly on the surface this phase modified twice (Plan 03 added a column, Plan 05 had to route its own visual spec around it) — worth closing in the very next catalog-table touch rather than deferring again.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- All `productDialog.*` keys present in both `es-MX`/`en-US` `featMgmt.json` per the Copywriting Contract table (verified against `ProductDetailDialog.tsx`, `ProductPhotoTab.tsx` translation-key usage — every `t('manageProducts.productDialog....')` call site has a corresponding contract row).
- Error copy rule (D-11) honored in `ProductPhotoTab.tsx:60-84` (`errorCopyFor`) — every `AppErrorCode` branch names type/size/message per the contract, generic `{{message}}` only appended for `PHOTO_UPLOAD_FAILED`/`PHOTO_REMOVE_FAILED` (server/network failures), exactly as specified.
- Destructive confirms repeat action+object, never a bare verb (`removeConfirmLabel` = "Quitar foto", `discardConfirmLabel` = "Descartar cambios") — matches contract.
- No generic `Submit`/`Click Here`/`OK` literals found in any phase-31 file.

### Pillar 2: Visuals (4/4)
- Focal points match the contract exactly: Name input on Details (first field, `lg:col-span-2`), 320px drop zone on Photo, Save button with `focusEmphasis="high"` on the footer (`ProductDetailDialog.tsx:534-554`).
- Icon+label pairing: every icon-bearing control (`FileText`/`Image`/`Link2` rail triggers, `Upload`/`Trash2` photo buttons, `ImageOff`/`ImagePlus` states) ships a visible text label alongside the icon — no bare icon-only affordance was introduced.
- Dialog's built-in close button (`DialogContent`, `showCloseButton`) still carries its pre-existing `sr-only` `t('actions.close')` label (`src/shared/ui/dialog.tsx:71`) — untouched by this phase, verified not regressed.
- Hierarchy: eyebrow (11px/600) → body (14px/400-600) → heading (18px/600) is the only size ladder in every new element; stock-strip badges (`success`/`warning`/`muted` `Badge` variants) carry the only additional visual weight, exactly as the contract reserves.

### Pillar 3: Color (4/4)
- `grep` for hex/rgb literals across `src/features/manage-products/` returns 2 hits, both in `CategoryForm.tsx`/`CatalogCategoriesTab.tsx` — neither file is in this phase's `key-files`/`affects` lists across all 5 plan SUMMARYs; both predate this phase and are out of scope.
- Brand accent (`bg-brand`/`text-brand`/`border-brand`/`bg-brand-soft`) appears exactly where the contract reserves it: the rail's inherited active-indicator, focus rings (inherited), and the Photo tab's drag-over state (`ProductPhotoTab.tsx:181-207`) — no 5th usage.
- Destructive/warning/success tokens used only where declared: field errors, tab error dot, Remove-photo button, discard/remove confirm, `Stock bajo`/`Activo`/`Inactivo` badges.

### Pillar 4: Typography (4/4)
- `grep` for undeclared size classes (`text-xs`/`text-base`/`text-xl`/`text-2xl`/`text-3xl`) and undeclared weights (`font-bold`/`font-extrabold`/`font-light`/`font-thin`) across `src/features/manage-products/` returns zero hits inside this phase's touched files (the one `text-xs` hit is in `CatalogCategoriesTab.tsx`, untouched by any of the 5 plans).
- Eyebrow labels use the exact declared class string (`text-[0.6875rem] font-semibold tracking-[0.12em] uppercase`, `ProductDetailDialog.tsx:392,406`); `EmptyState`'s default 16px title is correctly lifted to 18px via `className="[&_h3]:text-lg"` (`ProductPhotoTab.tsx:233`) exactly as the contract prescribes.

### Pillar 5: Spacing (3/4)
- Dialog skeleton dimensions match the contract verbatim: `max-w-4xl max-h-[80vh] flex flex-col overflow-hidden` (`ProductDetailDialog.tsx:376`), rail `lg:grid-cols-[13rem_minmax(0,1fr)]` (line 430), tab panels `p-4 lg:p-6 rounded-xl border bg-card shadow-xs` (lines 471, 493, 505), photo frame `aspect-square w-full max-w-[20rem]` (`ProductPhotoTab.tsx:182`) — all correct, all multiples of 4.
- **Deviation:** the catalog `photo` column (`CatalogProductsTab.tsx:282-296`) has no explicit width — `DataTable.tsx`'s `TableHead`/`TableCell` (lines 116, 212) render with zero `size`/`className` width control. The column's real ~72.7px width (measured and asserted with a 64–80px tolerance band in `46-product-dialog-baseline.spec.ts:354-357`, per 31-05-SUMMARY.md's own documented deviation) is an accident of the header text being short and the thumbnail content being fixed-size, not an enforced contract value. A future column addition or a longer localized header string (`productsTab.photoHeader`) could grow this column with no test catching it, because nothing asserts the *column* is fixed — only that today's *specific* row heights/widths happen to fall in a range.

### Pillar 6: Experience Design (4/4)
- Full state matrix implemented and each state independently reachable: empty/drag-over/paste/processing/uploading/populated/signed-URL-loading/load-failed/validation-error/offline (`ProductPhotoTab.tsx`), matching all 8 rows of the spec's Photo tab table.
- Loading: submit disables every field + rail trigger + Cancel (`disabled={submitting}` threaded through both tab panels and `VerticalTabsTrigger`s); photo mutations disable file input and both action buttons during upload/remove.
- Error: D-06 auto-switch-to-erroring-tab + focus-move + destructive-dot badge all wired (`ProductDetailDialog.tsx:200-225`); server failure surfaces both a `_form` inline alert and (per Plan summaries) a toast.
- Destructive confirmation: both Remove-photo and Discard-changes gate behind `ConfirmDialog`, no single-click destructive path exists.
- Two real production bugs were found and fixed via the phase's own E2E work rather than left as latent defects: the create-submit path silently failing Zod validation (Plan 02), and an unmemoized `columns` array silently discarding every inline table edit on keystroke (Plan 03) — both are exactly the kind of Experience Design failure this pillar penalizes, and both were closed with a real code fix + regression test in the same phase, which is why this scores 4 rather than being capped for "found bugs."

---

## Registry Safety

`components.json` present; `31-UI-SPEC.md`'s Registry Safety table declares zero third-party registries (`"registries": {}`) and zero new shadcn primitives added this phase. Registry audit: 0 third-party blocks checked — not applicable, no flags.

---

## Files Audited

- `src/features/manage-products/ui/ProductDetailDialog.tsx`
- `src/features/manage-products/ui/tabs/ProductDetailsTab.tsx`
- `src/features/manage-products/ui/tabs/ProductLinksTab.tsx`
- `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx`
- `src/features/manage-products/ui/CatalogProductsTab.tsx`
- `src/shared/ui/dialog.tsx`
- `src/shared/ui/DataTable.tsx`
- `e2e/visual/46-product-dialog-baseline.spec.ts`
- `.planning/phases/31-product-catalog-detail-photo-upload/31-UI-SPEC.md`
- `.planning/phases/31-product-catalog-detail-photo-upload/31-0{1..5}-SUMMARY.md`
