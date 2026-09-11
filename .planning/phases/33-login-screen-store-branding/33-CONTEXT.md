# Phase 33: Login Screen Store Branding - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

The login screen (`LoginPage`, `src/pages/login/index.tsx`) shows the store's real name and a
large, hero-sized logo on the left brand panel, replacing today's hardcoded `t('login.brand')`
string and small 44px icon tile. Sourced from a renamed `storeName` field (reusing/renaming the
existing `general.barName`) and a new `storeLogoUrl` field backed by Supabase Storage upload
(same pattern as Phase 31's product photo — private bucket, signed URLs, client-side downscale),
admin-editable from Settings → General.

**In scope:** renaming `barName` → `storeName` everywhere it's consumed (receipts,
`entities/payment` fallback, edge-function contracts, `GeneralSettingsTab`), a new Supabase
Storage bucket + RLS for the logo upload, a new `storeLogoUrl`-style column, wiring both into the
`GeneralSettingsTab` UI, and reshaping `LoginPage`'s left brand panel to show them large/prominent
on desktop. Playwright E2E covering configured and unconfigured (fallback) states, per STORE-03.

**Out of scope:** the existing receipt-only `logoDataUrl`/`headerLine2` fields and the
`upload-logo` feature (unchanged, stays base64/canvas, still feeds only the printed receipt);
mobile brand-panel redesign (stays hidden below `lg`, unchanged small icon+text row); Phase 31's
product-photo code (pattern reused, not touched); Phase 18's barcode-scan peek window (unrelated).

</domain>

<decisions>
## Implementation Decisions

### Store Name Field

- **D-01:** **Reuse and rename `general.barName` → `storeName`**, rather than adding a separate
  `storeName` field alongside it. Rationale: `barName` already functions as the store name today
  — it feeds receipt headers (`receipt-format.ts`), a payment fallback
  (`entities/payment/model/queries.ts:216`), and its own `GeneralSettingsTab` copy literally
  describes it as "Store name." The phase's originating explore note (`product-catalog-branding-
  decisions.md`) claimed "no storeName config exists anywhere" — that premise was wrong; this
  supersedes it. Rejected: a second parallel `storeName` field, which would let receipt and login
  text diverge but forces duplicate data entry and leaves the misleading `barName` name in place.
  — **Reversibility:** costly — a rename touches every consumer (receipts, payment fallback,
  edge-function contracts, `GeneralSettingsTab`, tests/fixtures using `barName`); reverting means
  touching all of them again.
- **D-02:** The **rename is repo-wide** — column/field/type renamed to `storeName` everywhere
  (not just relabeling the UI while keeping the internal `barName` name). Rationale: the project's
  stated pivot/rebrand goal (PROJECT.md) is to remove bar-pos leftovers; a cosmetic-only relabel
  would leave the actual field name wrong under the hood.
- **D-03:** **Fallback when unconfigured stays exactly today's behavior** — the generic
  `t('login.brand')` string (currently "Supermarket POS") and the `ShoppingBasket` icon fallback
  in `LogoImage`-equivalent rendering. Satisfies STORE-02's "sane default" requirement with zero
  new fallback design.

### Logo Prominence & Mobile

- **D-04:** The logo becomes a **hero-size, dominant element** of the left brand panel — not
  merely a scaled-up version of today's 44px icon tile. Rejected: a moderately-enlarged icon,
  which under-delivers on STORE-02's "large logo" wording.
- **D-05:** **Desktop-only** — the brand panel stays `hidden lg:flex` exactly as today; mobile
  keeps its existing small icon+text row above the PIN form, unchanged. Rejected: also enlarging
  the mobile header, which risks pushing the PIN keypad below the fold on small screens.
- **D-06:** **All existing left-panel content is kept** — date/live clock, tagline, terminal id
  all stay; the large logo (+ renamed store name) is added as the panel's header block above/
  beside them, not a replacement.

### Logo Upload (Supabase Storage)

- **D-07:** **800px max edge** for the client-side downscale before upload (canvas resize,
  mirroring Phase 31's `resizePhoto()` shape) — crisp enough for hero display on a desktop login
  panel without the extra weight of Phase 31's 1200px product-photo constant, which is sized for
  close-up product inspection, not a login hero image.
- **D-08:** **Same pre-resize file constraints as Phase 31**: 10MB pre-resize cap, JPEG/PNG/WebP
  accepted only (HEIC/HEIF rejected — no browser canvas decoder), re-encode to WebP with a JPEG
  fallback. Reuses the exact validated `photo-file.ts` pattern rather than inventing new numbers.
- **D-09:** **New dedicated Storage bucket** (not the existing `product-photos` bucket with a new
  path prefix). Rationale: store branding is store-wide singleton data, not per-product — sharing
  a bucket whose RLS/lifecycle is designed around per-product-id paths would conflate two
  different access-pattern shapes. Exact bucket name left to planner/researcher (e.g.
  `store-branding`), following Phase 31's naming convention.
  — **Reversibility:** one-way — this repo has no DOWN migrations; consolidating buckets later
  means a forward migration plus moving objects.
- **D-10 (implied by D-01/D-09):** The column stores a **stable object path**, signed on demand,
  same as Phase 31's D-16 (`photo_url` → later renamed `photo_path`) — planner should apply the
  same "path not URL" naming lesson from Phase 31 directly (i.e. don't repeat that naming
  correction mid-phase; call the column `store_logo_path` or similar from the start).

### Settings UI Placement

- **D-11:** **Add `storeName`/logo fields to the existing `GeneralSettingsTab`** (`src/widgets/
  SettingsTabsPanel/tabs/GeneralSettingsTab.tsx`) rather than creating a new dedicated "Branding"
  tab. Rationale: `storeName` (renamed from `barName`) already lives there; keeping the logo
  upload alongside it keeps all store-identity fields in one place and avoids new tab/i18n-
  namespace overhead. Rejected: a separate Branding tab — cleaner separation of concerns, but
  splits store-identity config across two tabs for no functional benefit.
- **D-12:** **RBAC gate: `manage_settings`, admin-only** — identical to every other field on
  `GeneralSettingsTab` and the Settings page's existing gate. No new permission introduced.

### Claude's Discretion

The user chose "ready for context" over further exploration; researcher and planner decide, using
these defaults unless research contradicts them:

- **Exact bucket name and object path convention** — e.g. `store-branding` bucket,
  `store/logo.<ext>` or `store/{uuid}.<ext>` path (singleton, so no product-id segment needed;
  planner should decide whether a stable filename or a uuid-per-upload, mirroring Phase 31's
  replace-on-upload orphan-avoidance reasoning, is worth it for a single global asset).
- **Column/field naming** — `storeLogoUrl` in REQUIREMENTS.md's phrasing vs. `storeLogoPath` per
  the D-10 naming lesson; planner picks one name and uses it consistently in migration,
  `domain.ts`, and generated types (same guidance Phase 31 D-16 gave).
- **Signed-URL TTL/caching** — mirror Phase 31's `resolveProductImage.ts` conventions
  (`SIGNED_URL_TTL_SECONDS`, `staleTime` below TTL) rather than inventing new values.
- **RLS write-policy shape** — match however `manage_products`/`manage_settings` is already
  enforced in existing RLS policies (role_permissions join, per Phase 31 precedent); do not invent
  a third pattern.
- **i18n** — renaming `barName` → `storeName` touches `wAdmin.json`'s `generalSettingsTab.
  barNameLabel` key (both `es-MX`/`en-US`) plus any other `barName`-labeled copy; new logo-upload
  copy needs `wAdmin` (or `featMgmt`) entries in both locales per `i18next/no-literal-string`.
- **E2E shape** — STORE-03 requires both a functional spec (configured store shows real name/
  logo) and a visual-regression baseline (unconfigured fallback) in `e2e/visual/`, following
  Phase 31's UI-spec + RLS-spec two-file pattern for the Storage boundary.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase intent & requirements
- `.planning/ROADMAP.md` § "Phase 33: Login Screen Store Branding" — goal, dependencies (none),
  explicit note that this is not a reuse of the receipt-only logo/header fields.
- `.planning/REQUIREMENTS.md` lines 316-318 (STORE-01..03 verbatim), 447-449 (status table),
  465, 475 — the acceptance contract.
- `.planning/notes/product-catalog-branding-decisions.md` — the `/gsd-explore` decision record
  for Phases 31-33. **Note:** its "no storeName/store-branding config exists anywhere" finding is
  superseded by D-01's `barName` discovery — treat that one line as stale, the rest still holds
  (Storage-upload pattern, distinct-from-receipt-logo reasoning).

### Storage upload pattern to mirror (Phase 31 precedent)
- `.planning/phases/31-product-catalog-detail-photo-upload/31-CONTEXT.md` — full D-09..D-16
  decision record for the private-bucket/signed-URL/client-downscale pattern this phase reuses.
- `supabase/migrations/20260907000001_product_photos_storage.sql` — bucket creation + RLS policy
  shape (idempotent `ON CONFLICT DO NOTHING`, `DROP POLICY IF EXISTS`) to mirror for the new
  branding bucket.
- `src/features/manage-products/model/photo-file.ts` — `resizePhoto()`, `validatePhotoFile()`,
  `photoObjectPath()` — the client-side downscale/validate/path-naming logic to adapt (800px
  instead of 1200px per D-07, uuid-vs-stable-path decision left to planner).
- `src/features/manage-products/model/useProductPhotoUpload.ts` — the upload-sequence mutation
  shape (online check → validate → resize → upload → link → delete-previous) to mirror.
- `src/entities/product/model/resolveProductImage.ts` — the signed-URL resolver/cache pattern
  (`SIGNED_URL_TTL_SECONDS`, `staleTime`) to adapt for a single global logo row instead of
  per-product/batch resolution.

### Code this phase renames/touches
- `src/shared/lib/domain.ts` — `GeneralSettingsSchema` (`barName` → `storeName`,
  `.min(1).max(120)`); `ReceiptSettingsSchema` (`logoDataUrl`/`headerLine2`, explicitly NOT
  touched by this phase).
- `src/entities/settings/model/queries.ts` — `DEFAULT_GENERAL.barName`, `parseGeneral`.
- `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx` — the tab this phase extends with
  the logo upload UI; existing `barName` field becomes `storeName`.
- `src/pages/login/index.tsx` — `LoginPage`'s brand panel (lines ~30-69), reshaped per D-04/D-06.
- `src/widgets/LogoImage/index.tsx` — currently hardcoded to the receipt `logoDataUrl`; this
  phase needs a distinct rendering path (new component or a parameterized source) for the login
  logo, since D-01/D-09 keep the two logo sources fully separate.
- `src/entities/payment/model/queries.ts:216` — `general?.barName ?? 'Supermarket POS'` fallback
  string, needs the field-name update.
- `src/shared/lib/edge-function-contracts.ts:55` — `barName: z.string()` in whatever contract
  this belongs to, needs the rename.
- `src/shared/lib/receipt-format.ts`, `src/shared/lib/buildStartTicketText.ts` — read
  `data.barName`/`opts.barName` for receipt rendering; renamed but behavior unchanged (still
  receipt-only consumers of the same underlying value).
- `src/shared/lib/i18n/locales/{es-MX,en-US}/wAdmin.json` — `generalSettingsTab.barNameLabel` key
  needs updating alongside the rename.
- `src/shared/lib/i18n/locales/{es-MX,en-US}/pages.json` — `login.brand` (currently the generic
  fallback string) — behavior unchanged per D-03, but confirm this is where the fallback resolves
  from.

### Patterns to follow
- `src/shared/lib/result.ts` (`Result`, `supabaseQuery`, `supabaseMutation`) and
  `src/shared/lib/network.ts` (`isOnline`) — mandatory error/offline conventions (Storage upload
  should be online-gated per Phase 31's precedent).
- `.planning/codebase/CONVENTIONS.md` — naming, FSD boundaries, `exactOptionalPropertyTypes`,
  Zod-first typing, i18n literal-string enforcement.
- `CLAUDE.md` § "Testing & Verification Policy" — automated Playwright only; `human_needed` is not
  a valid terminal state for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The entire Phase 31 Storage pattern (`photo-file.ts`, `useProductPhotoUpload.ts`,
  `resolveProductImage.ts`, the migration's RLS policy shape) — this phase adapts it for a
  store-wide singleton asset instead of per-product rows.
- `GeneralSettingsTab.tsx`'s existing form/save wiring for `barName` — the field is renamed, not
  rebuilt; the logo upload UI is new but slots into the same tab/form region.
- `LoginPage`'s existing left-aside structure (gradient background, date/clock, tagline) — kept
  and extended, not rebuilt from scratch.

### Established Patterns
- FSD import direction is lint-enforced; a new login-logo rendering component (replacing or
  extending `LogoImage`'s receipt-only behavior) must sit in `shared/` or an appropriate
  `entities/` module to be legally importable from `pages/login`.
- All async work returns `Result<T>`; Supabase Storage calls follow the Phase 31 precedent
  (first-ever Storage usage in `src/`, now with one working example to copy instead of inventing
  the convention from scratch).
- Server state is TanStack Query; a signed-URL cache for the single logo row follows Phase 31's
  `resolveProductImage.ts` shape but simplified (no batch/list resolution needed — one global row).
- `exactOptionalPropertyTypes` is on — the new logo-path field must be declared
  `string | null`, never optional (`?:`).

### Integration Points
- A new forward migration: rename `settings` table's `general.barName` key's JSON shape (or
  however the column-vs-JSON-key storage works — `general` is a JSON `value` column keyed by
  `key='general'` in the generic `settings` table, per `entities/settings/model/queries.ts`, NOT
  a dedicated column like `receipt_settings`) plus a new Storage bucket + RLS policies for the
  logo. No DOWN script, per repo convention.
- `src/shared/lib/supabase.types.ts` must be regenerated after the bucket migration; until then
  the documented `const db = supabase as any` + file-level eslint-disable workaround applies if
  the new bucket/table isn't yet in generated types.
- `e2e/settings/` is the home for a new branding-settings spec (mirroring `backup-restore.spec.ts`
  structure); `e2e/products/product-photo-rls.spec.ts` is the direct template for a Storage RLS
  boundary spec on the new bucket.

</code_context>

<specifics>
## Specific Ideas

- The user took the recommended option on every single question in this discussion — no
  deviations from the scouted analysis. Plan directly from the decisions above without
  second-guessing them.
- `general.barName`'s literal default value today is `'Bola 8'` (a leftover from a prior bar-POS
  product name) — the rename should also mean this stale default gets replaced with something
  sane (empty string or a generic placeholder), not carried forward under the new field name.

</specifics>

<deferred>
## Deferred Ideas

- **Mobile large-logo treatment** — rejected in D-05; mobile keeps today's compact icon+text row.
  Revisit only if the store specifically wants branding visible on a mobile/tablet terminal.
- **Retiring the receipt-only `logoDataUrl`/`headerLine2` fields** — explicitly out of scope; they
  stay exactly as-is, serving only the printed receipt. A future housekeeping phase could unify
  them, but that's not this phase.
- **Branding tab as its own Settings section** — rejected in D-11 in favor of extending
  `GeneralSettingsTab`. Revisit only if General Settings becomes overcrowded.

### Reviewed Todos (not folded)
- `rotate-remote-supabase-db-password` — matched only on generic keyword "supabase"; an ops
  credential task, unrelated to branding.
- `rename-cargo-package-bar-pos` — matched only on generic keyword "name"; unrelated Cargo/Tauri
  housekeeping, not the `barName` field this phase renames.

</deferred>

---

*Phase: 33-login-screen-store-branding*
*Context gathered: 2026-09-11*
