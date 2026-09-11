# Phase 33: Login Screen Store Branding - Research

**Researched:** 2026-09-11
**Domain:** In-repo pattern reuse — Zod schema rename, generic-JSON settings-blob extension, Supabase Storage bucket (second instance), login-page layout reshape
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Reuse and rename `general.barName` → `storeName`, rather than adding a separate
  `storeName` field alongside it. `barName` already functions as the store name today — it feeds
  receipt headers (`receipt-format.ts`), a payment fallback (`entities/payment/model/queries.ts:216`),
  and its own `GeneralSettingsTab` copy literally describes it as "Store name." Rejected: a second
  parallel `storeName` field. Reversibility: costly.
- **D-02:** The rename is repo-wide — column/field/type renamed to `storeName` everywhere (not just
  relabeling the UI while keeping the internal `barName` name).
- **D-03:** Fallback when unconfigured stays exactly today's behavior — the generic
  `t('login.brand')` string (currently "Supermarket POS") and the `ShoppingBasket` icon fallback.
- **D-04:** The logo becomes a hero-size, dominant element of the left brand panel — not merely a
  scaled-up version of today's 44px icon tile. Rejected: a moderately-enlarged icon.
- **D-05:** Desktop-only — the brand panel stays `hidden lg:flex` exactly as today; mobile keeps its
  existing small icon+text row above the PIN form, unchanged. Rejected: also enlarging the mobile
  header.
- **D-06:** All existing left-panel content is kept — date/live clock, tagline, terminal id all
  stay; the large logo (+ renamed store name) is added as the panel's header block above/beside
  them, not a replacement.
- **D-07:** 800px max edge for the client-side downscale before upload (canvas resize, mirroring
  Phase 31's `resizePhoto()` shape) — crisp enough for hero display without Phase 31's 1200px
  product-photo constant.
- **D-08:** Same pre-resize file constraints as Phase 31: 10MB pre-resize cap, JPEG/PNG/WebP
  accepted only (HEIC/HEIF rejected), re-encode to WebP with a JPEG fallback.
- **D-09:** New dedicated Storage bucket (not the existing `product-photos` bucket with a new path
  prefix). Store branding is store-wide singleton data, not per-product. Exact bucket name left to
  planner/researcher (e.g. `store-branding`). Reversibility: one-way — no DOWN migrations.
- **D-10 (implied by D-01/D-09):** The column stores a stable object path, signed on demand, same
  as Phase 31's D-16 (`photo_url` → `photo_path`) — call the column `store_logo_path` or similar
  from the start, don't repeat the naming correction mid-phase.
- **D-11:** Add `storeName`/logo fields to the existing `GeneralSettingsTab` rather than creating a
  new dedicated "Branding" tab. Rejected: a separate Branding tab.
- **D-12:** RBAC gate: `manage_settings`, admin-only — identical to every other field on
  `GeneralSettingsTab` and the Settings page's existing gate. No new permission introduced.

### Claude's Discretion

The user chose "ready for context" over further exploration; researcher and planner decide, using
these defaults unless research contradicts them:

- Exact bucket name and object path convention — e.g. `store-branding` bucket, `store/logo.<ext>`
  or `store/{uuid}.<ext>` path (singleton, so no product-id segment needed; planner should decide
  whether a stable filename or a uuid-per-upload, mirroring Phase 31's replace-on-upload
  orphan-avoidance reasoning, is worth it for a single global asset).
- Column/field naming — `storeLogoUrl` in REQUIREMENTS.md's phrasing vs. `storeLogoPath` per the
  D-10 naming lesson; planner picks one name and uses it consistently in migration, `domain.ts`,
  and generated types.
- Signed-URL TTL/caching — mirror Phase 31's `resolveProductImage.ts` conventions
  (`SIGNED_URL_TTL_SECONDS`, `staleTime` below TTL) rather than inventing new values.
- RLS write-policy shape — match however `manage_products`/`manage_settings` is already enforced in
  existing RLS policies (role_permissions join, per Phase 31 precedent); do not invent a third
  pattern. **Research finding: confirmed correct — see Summary and Pattern 1 below.**
- i18n — renaming `barName` → `storeName` touches `wAdmin.json`'s `generalSettingsTab.barNameLabel`
  key (both `es-MX`/`en-US`) plus any other `barName`-labeled copy; new logo-upload copy needs
  `wAdmin` (or `featMgmt`) entries in both locales per `i18next/no-literal-string`.
- E2E shape — STORE-03 requires both a functional spec (configured store shows real name/logo) and
  a visual-regression baseline (unconfigured fallback) in `e2e/visual/`, following Phase 31's
  UI-spec + RLS-spec two-file pattern for the Storage boundary.

### Deferred Ideas (OUT OF SCOPE)

- Mobile large-logo treatment — rejected in D-05; mobile keeps today's compact icon+text row.
  Revisit only if the store specifically wants branding visible on a mobile/tablet terminal.
- Retiring the receipt-only `logoDataUrl`/`headerLine2` fields — explicitly out of scope; they stay
  exactly as-is, serving only the printed receipt.
- Branding tab as its own Settings section — rejected in D-11 in favor of extending
  `GeneralSettingsTab`. Revisit only if General Settings becomes overcrowded.
- The existing receipt-only `logoDataUrl`/`headerLine2` fields and the `upload-logo` feature
  (unchanged, stays base64/canvas, still feeds only the printed receipt); mobile brand-panel
  redesign; Phase 31's product-photo code (pattern reused, not touched); Phase 18's barcode-scan
  peek window (unrelated).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STORE-01 | New dedicated `storeName` (text) and `storeLogoUrl`/`storeLogoPath` settings fields, populated via Supabase Storage upload using the same upload pattern as Phase 31's product photo — distinct from the existing receipt-only `headerLine2`/`logoDataUrl` fields, which are unchanged. | Pattern 1 (bucket+RLS migration), Pattern 2 (client-side downscale/upload), Pattern 3 (settings JSONB read/write), Pitfall 1 (data-migration for the `barName`→`storeName` stored key), Pitfall 2 (partial-write hazard on the JSONB blob), Code Examples (schema extension, signed-URL resolver) |
| STORE-02 | The login screen displays the configured store name and a large logo on the left side of the screen, with a sane default (e.g. generic app name, no logo) when unconfigured. | System Architecture Diagram, Pattern 3, Pitfall 3 (new component needed, not a `LogoImage` reuse), Recommended Project Structure (`pages/login/index.tsx` reshape) |
| STORE-03 | Automated Playwright E2E/visual-regression coverage proves the login screen renders a configured store name/logo and the unconfigured fallback. | Validation Architecture section (Phase Requirements → Test Map, Wave 0 Gaps), `e2e/products/product-photo-rls.spec.ts` RLS-spec pattern to mirror, `e2e/visual/45-visual-baseline.spec.ts` masking/visual-diff pattern to mirror |
</phase_requirements>

## Summary

This phase requires no new library, no new external service, and no new architectural pattern —
it is a same-shape repeat of Phase 31's product-photo Storage pipeline applied to a second,
store-wide singleton asset, plus a repo-wide rename of one existing field. Every piece the planner
needs (upload/resize/validate helpers, signed-URL resolver, bucket-migration SQL shape, RLS
precedent) already exists and passed real E2E coverage in Phase 31. The one genuinely new risk is
data-shape, not code-shape: `general.barName` is stored as a raw JSONB blob under `settings.key =
'general'` (not a dedicated column), and the planned field rename from `barName` to `storeName`
will silently break `parseGeneral`'s schema validation against every already-saved row unless a
forward data migration rewrites the stored JSON key — this is a real, previously-undocumented-at-
code-level pitfall (see Pitfall 1) that CONTEXT.md's Integration Points section anticipated at a
high level but did not spell out the actual failure mode for.

The second finding worth flagging to the planner: CONTEXT.md's "Claude's Discretion" section
says to match "however `manage_products`/`manage_settings` is already enforced in existing RLS
policies (role_permissions join, per Phase 31 precedent)." Reading the actual migrations confirms
this is correct for the `settings` table itself (`role_permissions` EXISTS join,
`20260510000001_rls_rewrite_phase13.sql:948-959`) — but a *more recent* migration
(`20260830000002_terminal_lock_settings.sql`) deliberately deviated to a direct
`get_user_role() = 'admin'` check for a settings-adjacent table, with an explicit code comment
explaining why. Since `manage_settings` is hard-coded admin-only in `rbac.ts` regardless of which
pattern is used, either RLS shape is behaviorally equivalent today — but the planner should pick
the `role_permissions` join (matching both the `settings` table itself and Phase 31's
`product-photos` bucket) for consistency, not the newer one-off deviation.

**Primary recommendation:** Do not create a new DB column for the logo path. Extend
`GeneralSettingsSchema` in `domain.ts` with `storeName` (renamed from `barName`) and a nullable
`storeLogoPath` field — both live inside the existing JSONB `settings.value` blob, so the only real
migration is (a) a new `store-branding` Storage bucket + RLS policies (mirroring
`20260907000001_product_photos_storage.sql` exactly) and (b) a one-time `UPDATE` that rewrites the
stored JSON key from `barName` to `storeName` in the existing `general` settings row.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Store name / logo path storage | API / Backend (Supabase `settings` table, JSONB blob) | — | Same generic key/value settings table already used for `general`, `billing`, etc. — no new table needed |
| Logo file storage | Database / Storage (Supabase Storage) | — | Binary object storage is Storage's job, not a DB column; matches Phase 31 precedent exactly |
| Client-side downscale/validate | Browser / Client | — | `resizePhoto`/`validatePhotoFile` run in-browser via Canvas API before any network call, per Phase 31 pattern |
| Signed-URL minting/caching | API / Backend (Supabase Storage `createSignedUrl`) via Frontend Server-side-equivalent (TanStack Query cache) | Browser / Client (renders the `<img>`) | Bucket is private; URL must be signed server-side (Supabase Storage), cached client-side with TTL-aware staleTime |
| RBAC write-gate (`manage_settings`) | API / Backend (Postgres RLS) | Browser / Client (`ProtectedAction` UI gate) | RLS is the authority; the client-side gate is UX-only, matching every other `manage_settings` field in this codebase |
| Login screen rendering | Browser / Client (React component, `pages/login`) | — | Pure presentational reshape of an existing page, reads settings via TanStack Query hook |

## Standard Stack

No new packages. This phase is entirely built from already-installed dependencies:

| Library | Version (installed) | Purpose | Why no alternative needed |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | already in `package.json` (used by every other Storage/DB call in `src/`) | Storage upload, signed URL, JSONB settings read/write | Same client instance (`@shared/lib/supabase`) Phase 31 already uses for Storage — zero new surface |
| `zod` v4 | already in `package.json` | `GeneralSettingsSchema` extension | Domain-types convention (`CLAUDE.md`) — no alternative permitted |
| Browser Canvas API (`createImageBitmap`, `canvas.toBlob`) | native | client-side downscale/re-encode | Native platform feature; Phase 31's `resizePhoto()` is a direct, working copy target |

**Package Legitimacy Audit:** Not applicable — no new packages are installed by this phase.
`## Package Legitimacy Audit` section is omitted per the "skip if no packages installed" rule.

**Installation:** None required.

## Architecture Patterns

### System Architecture Diagram

```
Admin (Settings -> General tab)
    |
    | 1. picks logo file (drag/drop/paste, mirrors Phase 31 FileDropZone-equivalent)
    v
[Browser] validatePhotoFile() -> resizePhoto() (800px max edge, D-07)
    |
    | 2. upload resized blob
    v
[Supabase Storage: store-branding bucket] (private, RLS-gated INSERT/UPDATE/DELETE -> manage_settings)
    |
    | 3. on upload success, write storeLogoPath into the JSONB `general` blob
    v
[Supabase Postgres: settings table, key='general'] <-- storeName + storeLogoPath live here (no new column)
    |
    | 4. useSettings() TanStack Query hook reads snapshot
    v
[LoginPage brand panel] --calls--> useMutationSignStoreLogo-equivalent (createSignedUrl, TTL-cached)
    |
    | 5. signed URL resolved (or null -> fallback icon+generic string, D-03)
    v
<img> hero logo + storeName text rendered in the `hidden lg:flex` brand aside
```

### Recommended Project Structure

No new top-level folders. New files slot into existing FSD locations:

```
supabase/migrations/
└── <timestamp>_store_branding_storage.sql   # bucket + RLS, mirrors 20260907000001_product_photos_storage.sql
└── <timestamp>_rename_barname_to_storename.sql  # data migration: rewrites stored JSON key (Pitfall 1)

src/entities/settings/model/
├── types.ts          # GeneralSettingsSchema: barName -> storeName, + storeLogoPath
├── queries.ts         # DEFAULT_GENERAL update; new resolveStoreLogo signed-URL helper (mirrors resolveProductImage.ts)

src/widgets/SettingsTabsPanel/tabs/
└── GeneralSettingsTab.tsx   # storeName field (renamed), + new logo upload control

src/pages/login/
└── index.tsx           # brand panel reshape (D-04/D-06), hero logo + storeName

src/widgets/LogoImage/  # UNCHANGED — stays receipt-only; new component needed for login logo (see Pitfall 2)
└── (new sibling component, e.g. StoreLogoImage, or a `source` prop added — planner's call, both legal under FSD)

e2e/settings/
└── store-branding.spec.ts     # functional: configured store shows name/logo

e2e/visual/
└── login-branding-baseline.spec.ts   # or added case to existing 45-visual-baseline.spec.ts (configured + unconfigured states)
```

### Pattern 1: Storage bucket + RLS migration (mirror exactly)

**What:** New private bucket, `INSERT`/`UPDATE`/`DELETE` gated by `manage_settings` via the
`role_permissions` join; `SELECT` open to any `authenticated` role (matches Phase 31's Decision B
reasoning — read access costs nothing extra and avoids inventing a second SELECT shape).
**When to use:** The new `store-branding` bucket migration.
**Example** — adapted directly from the verified file
`supabase/migrations/20260907000001_product_photos_storage.sql` (read in full this session):

```sql
-- Source: supabase/migrations/20260907000001_product_photos_storage.sql (verified pattern)
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-branding',
  'store-branding',
  false,                                -- private bucket, same as product-photos
  2097152,                              -- 2 MB server-side backstop (match D-08's 10MB pre-resize / re-encoded WebP output)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- NOTE: no `ALTER TABLE ... ADD COLUMN` here — storeLogoPath lives inside the
-- existing JSONB `settings.value` blob (key='general'), not a dedicated column.
-- See Pitfall 1/2 below for why this differs from Phase 31's product-photos migration.

DROP POLICY IF EXISTS store_branding_select ON storage.objects;
CREATE POLICY store_branding_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'store-branding');

DROP POLICY IF EXISTS store_branding_insert ON storage.objects;
CREATE POLICY store_branding_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-branding'
    AND EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_settings')
  );

DROP POLICY IF EXISTS store_branding_update ON storage.objects;
CREATE POLICY store_branding_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-branding'
    AND EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_settings')
  )
  WITH CHECK (
    bucket_id = 'store-branding'
    AND EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_settings')
  );

DROP POLICY IF EXISTS store_branding_delete ON storage.objects;
CREATE POLICY store_branding_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-branding'
    AND EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_settings')
  );

COMMIT;
-- No DOWN script (repo convention — all post-pivot migrations are forward-only).
```

### Pattern 2: Client-side downscale/upload (mirror, with the 800px constant per D-07)

**What:** `validatePhotoFile` -> `resizePhoto` -> Storage upload -> DB write -> delete-previous.
**When to use:** The store-logo upload mutation.
**Example** — adapted from `src/features/manage-products/model/photo-file.ts` (read in full this
session) and `useProductPhotoUpload.ts` (read in full this session):

```typescript
// Source: src/features/manage-products/model/photo-file.ts (verified pattern, adapt MAX_EDGE_PX)
const MAX_EDGE_PX = 800; // D-07: hero login display, not close-up product inspection (was 1200 in Phase 31)
const ENCODE_QUALITY = 0.8; // unchanged from Phase 31 (D-08: reuse exact validated numbers)

// photoObjectPath()-equivalent for a store-wide singleton (no productId segment):
export function storeLogoObjectPath(ext: string): string {
  return `store/${crypto.randomUUID()}.${ext}`;
}
```

```typescript
// Source: src/features/manage-products/model/useProductPhotoUpload.ts (verified pattern)
// Sequence: isOnline() guard -> validatePhotoFile -> resizePhoto -> Storage upload
// (upsert: false) -> settings JSONB write (see Pitfall 2, NOT a column .update()) ->
// delete-previous object last (logged orphan on failure, not user-facing).
```

### Pattern 3: Settings JSONB read/write via `useSettings`/`useMutationUpdateSetting`

**What:** `general.storeName`/`general.storeLogoPath` are read through the existing
`useSettings()` hook and written through the existing `useMutationUpdateSetting()` hook — no new
query/mutation hooks are needed for the *text* field, only for signing the logo path.
**Verified from** `src/entities/settings/model/queries.ts` (read in full this session), lines
252-328:

```typescript
// Source: src/entities/settings/model/queries.ts:141-144 (verified, quoted verbatim)
function parseGeneral(value: unknown): GeneralSettings {
  const parsed = GeneralSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GENERAL;
}
```

```typescript
// Source: src/entities/settings/model/queries.ts:300-311 (verified, quoted verbatim)
const payload: SettingsInsert = {
  key,
  value: value as unknown as TablesInsert<'settings'>['value'],
  updated_by: user?.id ?? null,
};

const res = await supabaseMutation(() =>
  supabase.from('settings').upsert(payload, { onConflict: 'key' }).select('id').single()
);
```

The mutation always upserts the **entire** `value` object for a key — there is no partial-update
path. This is why the logo-upload mutation cannot write `storeLogoPath` alone; see Pitfall 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image downscale/re-encode before upload | A new canvas pipeline | `resizePhoto()`-equivalent adapted from `src/features/manage-products/model/photo-file.ts` with `MAX_EDGE_PX = 800` | Already validated, already has a documented decode-failure path (Pitfall 5 in Phase 31's own research), no reason to reinvent |
| Signed-URL caching/TTL logic | A new resolver | Adapt `src/entities/product/model/resolveProductImage.ts`'s `SIGNED_URL_TTL_SECONDS`/`staleTime` pattern for a single global row (no batch resolver needed — one row, not a list) | Exact shape CONTEXT.md's discretion section calls out to mirror |
| RLS admin-gate check | A new policy shape | `role_permissions` EXISTS join, copied from `20260907000001_product_photos_storage.sql` and `20260510000001_rls_rewrite_phase13.sql:948-959` | Two independent existing precedents agree on this shape; the one deviation (`terminal_lock_settings`) documents itself as a deliberate one-off, not the norm |
| File-type/size validation | New MIME/size checks | `validatePhotoFile()` from `photo-file.ts` (10MB cap, JPEG/PNG/WebP only) | D-08 explicitly mandates reusing these exact numbers |

**Key insight:** Every piece of this phase's actual mechanics (upload, resize, sign, RLS) has a
working, E2E-tested twin already in the codebase from six weeks prior (Phase 31, shipped
2026-09-08). The only genuinely new engineering is the data-shape adaptation from
"per-row DB column" (products.photo_path) to "one key inside a shared JSONB settings blob"
(settings.value->'general'->'storeLogoPath') — which has no precedent and is exactly where the
pitfalls below live.

## Common Pitfalls

### Pitfall 1: Renaming `barName` -> `storeName` in the Zod schema silently drops existing stored data

**What goes wrong:** `general.barName`'s value is persisted as a raw JSONB object keyed by
whatever field names existed on the JS object at save time — not through any snake_case column
mapper (unlike `receipt_settings`, which has an explicit `mapReceiptRow`/`toReceiptPayload` pair).
Verified in `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:49-58` (read in full this
session): the save call literally does `value: { barName: form.barName.trim(), address: ..., }`.
That object is passed straight into `supabase.from('settings').upsert(payload, ...)` — the stored
JSON key **is** `"barName"`. If `GeneralSettingsSchema` is changed to require `storeName` instead
of `barName`, then `GeneralSettingsSchema.safeParse(existingRow)` (in `parseGeneral`,
`queries.ts:141-144`, quoted above) will **fail** on every already-saved `general` row, because the
stored JSON still has the key `barName`, not `storeName`. `parseGeneral` catches the failure
silently and falls back to `DEFAULT_GENERAL` — which per `queries.ts:56` is
`barName: 'Bola 8'` (soon to become an empty/generic `storeName`). The store's real name, address,
timezone, and receipt-footer text would all silently revert to defaults on every read until the
admin re-saves the General tab.
**Why it happens:** The `general` settings key has no column-level rename mechanism (unlike a real
`ALTER TABLE ... RENAME COLUMN`, which Postgres enforces atomically) — it's opaque JSONB, so a
Zod-schema rename and a stored-data rename are two separate, easy-to-forget steps.
**How to avoid:** Ship a forward data migration that rewrites the stored JSON key in the one
existing `general` row, in the same migration/transaction as the bucket creation, e.g.:
```sql
UPDATE settings
SET value = (value - 'barName') || jsonb_build_object('storeName', value->'barName')
WHERE key = 'general' AND value ? 'barName';
```
Run this **before** deploying the new schema/UI, or make `parseGeneral` tolerant of both keys
during a transition window. Confirm post-migration by re-reading the row and asserting
`value->>'storeName'` is non-null and `value ? 'barName' = false`.
**Warning signs:** After deploy, the Settings -> General tab shows an empty/default store name for
an existing installation, or the login screen falls back to the generic `t('login.brand')` string
even though the admin previously configured a real name.

### Pitfall 2: The logo-upload mutation cannot do a column-style partial write

**What goes wrong:** Phase 31's `useProductPhotoUpload.ts` links the new photo by running
`supabase.from('products').update({ photo_path: path }).eq('id', input.productId)` — a real
column, so a partial update is safe. `storeLogoPath` has no equivalent column; it must live inside
`settings.value` for `key='general'`. `useMutationUpdateSetting()` (verified,
`queries.ts:282-328`) always upserts the **whole** `value` object for a key (`upsert(payload, {
onConflict: 'key' })` with no JSONB merge operator) — writing `{ storeLogoPath: path }` alone would
wipe out `storeName`, `address`, `timezone`, `currency`, and `receiptFooterText` on that row.
**Why it happens:** `settings` is a generic key/value table with whole-blob upsert semantics;
there is no `jsonb_set`/merge RPC for partial writes today.
**How to avoid:** The logo-upload mutation must read the current `general` snapshot (from the
TanStack Query cache via `queryClient.getQueryData(settingsKeys.all)` or a fresh
`useSettings().data.general`) and spread it before calling `useMutationUpdateSetting().mutateAsync({
key: 'general', value: { ...currentGeneral, storeLogoPath: path } })`. Alternatively, add a small
dedicated RPC that does a real `jsonb_set` merge server-side — heavier, not necessary given the
existing whole-blob-read-then-write pattern already works everywhere else in this codebase (every
`GeneralSettingsTab`-style save already reads the full form state before saving).
**Warning signs:** After uploading a logo, the store name / address / other General-tab fields
revert to defaults.

### Pitfall 3: Two separate `LogoImage`-style components read from two different settings sources

**What goes wrong:** The existing `LogoImage` component (`src/widgets/LogoImage/index.tsx`,
verified, read in full this session) is hardcoded to `useReceiptSettings().data?.logoDataUrl` — a
base64 data URL from the *dedicated* `receipt_settings` table, not a Storage path. Naively
"reusing" `LogoImage` for the login hero logo (rather than building the D-01/D-09-mandated separate
component) would either show the wrong (tiny, receipt-only) logo or require overloading one
component with two unrelated data sources and rendering strategies (`<img src={dataUrl}>` vs. a
signed-URL fetch).
**Why it happens:** The names are similar ("logo") but the underlying storage/shape is completely
different — base64 inline data URL vs. Storage object path requiring an async sign step.
**How to avoid:** Build a new component (e.g. `StoreLogoImage` in `shared/` or `entities/settings/ui/`)
that reads `general.storeLogoPath`, signs it via a `useStoreLogoUrl()`-equivalent hook (mirroring
`useProductImageUrl` from `resolveProductImage.ts`), and renders the fallback icon+text per D-03
when unset. Do not modify `LogoImage` itself — CONTEXT.md's canonical refs are explicit that the
receipt-only fields/component stay untouched.
**Warning signs:** Login screen shows the small receipt logo instead of a hero-size store logo, or
shows nothing when a receipt logo happens to be configured but no store logo is.

### Pitfall 4: 24 files reference `barName` — a partial rename breaks TypeScript, not just tests

**What goes wrong:** `barName` appears in 24 files across `src/` (confirmed via repo-wide grep this
session): `domain.ts`, `entities/settings/model/queries.ts`, `entities/payment/model/queries.ts:216`
(fallback string `general?.barName ?? 'Supermarket POS'`), `shared/lib/edge-function-contracts.ts:55`
(`barName: z.string()` in a `PaymentSchema`-adjacent contract), `shared/lib/receipt-format.ts`
(`PreChequeData.barName`, `receipt.barName`), `shared/lib/buildStartTicketText.ts`
(`StartTicketOpts.barName`), `widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx`,
`widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx` (a receipt-preview mock default,
`barName: 'Tienda'`), plus 16 `.test.ts`/`.test.tsx`/`.stories.tsx` files. Renaming only the
`GeneralSettingsSchema` field without updating the consumers listed above leaves TypeScript
compile errors (strict mode, no `any` escape hatch permitted per CLAUDE.md) at every call site that
destructures `.barName` off a `GeneralSettings`-typed value.
**Why it happens:** D-02 explicitly scopes this as a repo-wide rename, but the receipt-format /
edge-function-contract / payment-fallback consumers are a **different** `barName` (they read the
receipt-rendering `PreChequeData`/`StartTicketOpts`/edge-function payload shapes, which are
independently-typed structs that happen to share the field name — not all of them derive from
`GeneralSettingsSchema` directly). Confirmed: `receipt-format.ts`'s `PreChequeData.barName` and
`buildStartTicketText.ts`'s `StartTicketOpts.barName` are locally-declared types, not imports of
`GeneralSettingsSchema`.
**How to avoid:** Treat this as two renames that happen to share a name: (1) the `GeneralSettings`
domain field (`domain.ts`, `entities/settings/model/queries.ts`, `GeneralSettingsTab.tsx`,
`entities/payment/model/queries.ts:216`, i18n `barNameLabel` key) — a real behavior-affecting rename
per D-02; and (2) the receipt-rendering plumbing's own separately-typed `barName` fields
(`receipt-format.ts`, `buildStartTicketText.ts`, `edge-function-contracts.ts:55`, and their
`HardwareSettingsTab.tsx` mock) — CONTEXT.md's canonical refs list these as "renamed but behavior
unchanged," so update the field name for consistency but confirm at each site whether the value it
receives is actually sourced from the new `storeName` (i.e. `entities/payment/model/queries.ts:216`
must read `general?.storeName` after the rename, not `general?.barName`, or the receipt/payment
fallback silently breaks).
**Warning signs:** `npm run typecheck` failures listing `Property 'barName' does not exist` at any
of the 24 sites; or (if the rename is done sloppily) a receipt that used to show the store name now
shows blank/undefined.

## Runtime State Inventory

> This phase is a rename (`barName` -> `storeName`) touching stored data, not a pure greenfield
> addition — Runtime State Inventory applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | One `settings` table row, `key='general'`, JSONB `value` column with key `barName` (default value `'Bola 8'` per `DEFAULT_GENERAL`, `queries.ts:56`, and per the phase's own CONTEXT.md specifics note). Same risk on any local/remote Supabase environment that has ever saved General settings. | **Data migration required** — see Pitfall 1's `UPDATE ... jsonb_build_object` statement. Both local dev Supabase and the remote production project (`taj-house-of-spices`, per STATE.md's deployment history) need this migration applied. |
| Live service config | None found — General settings are not exported to any external service/UI outside this app's own DB. | None. |
| OS-registered state | None found — no OS-level task/service embeds `barName`. | None. |
| Secrets/env vars | None found — `barName` is not an env var name (distinct from `BAR_NAME`, the *edge-function secret* referenced in `.planning/REQUIREMENTS.md` DEP-04, which is a separate, unrelated rename already tracked in a different milestone's scope, not touched by this phase). | None — explicitly out of scope, do not conflate with DEP-04. |
| Build artifacts | None found — `barName` is not baked into any build-time constant or generated file beyond `supabase.types.ts` (which is regenerated from the DB schema, not from this JSONB key, so it is unaffected). | None. |

## Common Pitfalls (continued from above — see full list)

*(See "Common Pitfalls" section above — 4 pitfalls documented, all HIGH confidence, all
verified by reading the actual source files this session.)*

## Code Examples

### Extending `GeneralSettingsSchema` (domain.ts)

```typescript
// Source: src/shared/lib/domain.ts:860-866 (verified, current state quoted verbatim)
export const GeneralSettingsSchema = z.object({
  barName: z.string().min(1).max(120),
  address: z.string().min(1).max(300),
  timezone: z.string().min(1).max(100),
  currency: z.string().length(3).default('MXN'),
  receiptFooterText: z.string().max(240).default(''),
});

// Proposed shape after this phase (planner should adapt exact field name per
// CONTEXT.md's storeLogoUrl-vs-storeLogoPath discretion — storeLogoPath is
// recommended per D-10's "path not URL" lesson from Phase 31):
export const GeneralSettingsSchema = z.object({
  storeName: z.string().min(1).max(120), // renamed from barName (Pitfall 1/4)
  address: z.string().min(1).max(300),
  timezone: z.string().min(1).max(100),
  currency: z.string().length(3).default('MXN'),
  receiptFooterText: z.string().max(240).default(''),
  storeLogoPath: z.string().nullable().default(null), // NEW — nullable+default so
    // pre-migration rows (which lack this key entirely) still parse successfully
    // under safeParse, per exactOptionalPropertyTypes convention (never `?:`).
});
```

### Signed-URL resolver for a single global row (mirrors `resolveProductImage.ts`)

```typescript
// Source: adapted from src/entities/product/model/resolveProductImage.ts:16-40 (verified pattern)
export const STORE_BRANDING_BUCKET = 'store-branding';
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // match Phase 31's 1h TTL, per CONTEXT.md discretion
export const SIGNED_URL_STALE_TIME_MS = 45 * 60 * 1000; // re-sign before TTL expiry

export async function signStoreLogo(path: string): Promise<Result<string>> {
  const { data, error } = await supabase.storage
    .from(STORE_BRANDING_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return err(supabaseError(error.message, undefined, error));
  return ok(data.signedUrl);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Receipt-only `logoDataUrl` (base64, `receipt_settings` dedicated table) | Storage-backed `photo_path`/signed-URL pattern | Phase 31, shipped 2026-09-08 | This phase reuses the *new* pattern, not the legacy base64 one — do not model the login logo on `LogoImage`/`ReceiptSettingsSchema.logoDataUrl` |
| Generic `barName` doing double duty as "the store's name" with a bar-pos-era default (`'Bola 8'`) | Explicit `storeName` field with a sane default | This phase | The stale bar-pos default must not be carried forward under the new name (per CONTEXT.md's Specific Ideas note) |

**Deprecated/outdated:** None — this is the first phase to formalize `storeName` as a first-class
concept; no prior pattern is being removed, only renamed and extended.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact new bucket name `store-branding` and object path `store/<uuid>.<ext>` | Pattern 1, Code Examples | Low — cosmetic; CONTEXT.md explicitly leaves this to planner's discretion, any consistent name works |
| A2 | Field name `storeLogoPath` (not `storeLogoUrl`) | Code Examples | Low — CONTEXT.md explicitly leaves this open; `storeLogoPath` is recommended only because it follows the D-10/Phase-31-D-16 "path not URL" lesson, but either name functions correctly if used consistently |
| A3 | 800px `MAX_EDGE_PX` is sufficient for a login hero image on typical desktop displays | Pattern 2 | Low-Medium — if a very high-DPI/large monitor shows visible upscale blur, the fix is a constant change, not a redesign; D-07 already made this call explicitly, not this research |

**All other claims in this research were verified by reading the actual source files this
session** (`domain.ts`, `entities/settings/model/queries.ts`, `pages/login/index.tsx`,
`widgets/LogoImage/index.tsx`, `GeneralSettingsTab.tsx`, `entities/payment/model/queries.ts`,
`edge-function-contracts.ts`, `receipt-format.ts`, `buildStartTicketText.ts`, `rbac.ts`, the
Phase-31 migration and Storage-pipeline files, two RLS migration files, and one i18n locale file) —
no user confirmation is needed for the stack/pattern/pitfall claims, only for A1-A3's naming/sizing
discretion items (which CONTEXT.md already delegates to the planner, not to the user).

## Open Questions

1. **Should the `barName` -> `storeName` data migration run as a single combined migration with
   the bucket creation, or as two separate migration files?**
   - What we know: Both are forward-only SQL run through the same `supabase/migrations/` pipeline;
     either ordering works as long as the data migration runs before any code path expects
     `storeName` to be present.
   - What's unclear: Whether this repo's migration-review convention prefers one bucket-creation
     migration + one data-migration migration (matching the "one concern per file" pattern seen in
     `20260907000001_product_photos_storage.sql` vs. other migrations), or combines them.
   - Recommendation: Two separate files — bucket/RLS migration (schema-only, idempotent,
     `ON CONFLICT DO NOTHING`/`DROP POLICY IF EXISTS`) and a data migration (the `UPDATE` in
     Pitfall 1, also idempotent via the `WHERE value ? 'barName'` guard) — mirrors this repo's
     existing convention of one migration file per logical change.

2. **Does the login page need a `gsd-ui-phase` UI-SPEC pass before planning, given `ui_phase: true`
   and `ui_review: true` are both enabled in `.planning/config.json`?**
   - What we know: This phase reshapes an existing page's visual layout (hero-size logo, D-04) —
     the kind of work `ui_phase`/`ui_hint` flags in this project's ROADMAP.md for other phases
     (Phase 32 shows `**UI hint**: yes`; Phase 33's ROADMAP.md entry, read this session, does not
     yet show a UI hint line).
   - What's unclear: Whether `/gsd-plan-phase 33` will auto-route to `gsd-ui-phase` given the
     config flags, or whether this is an orchestrator decision outside this research's scope.
   - Recommendation: Flag for the planner/orchestrator to decide; this research does not block on
     it since the phase's own CONTEXT.md already locked the visual decisions (D-04/D-06) in enough
     detail (hero-size, desktop-only, existing content kept) that a full UI-SPEC pass may be
     redundant, but that call belongs to the planning step, not research.

## Environment Availability

Skipped — this phase has no new external dependency. It reuses the already-provisioned local and
remote Supabase Storage service (proven working by Phase 31's live E2E suite,
`e2e/products/product-photo-rls.spec.ts`, verified passing per `.planning/STATE.md`'s Phase 31
re-verification note). One operational caveat carried over from Phase 31's own history: `STATE.md`
records that a prior local dev machine was missing the `20260907000001_product_photos_storage.sql`
migration until `npx supabase migration up --local` was run manually — the same check applies to
this phase's new migration on any local dev machine.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright v1.59 (functional + a separate visual-regression config) |
| Config file | `supermarket-pos/playwright.config.ts` (functional); a `playwright.visual.config.ts`-equivalent for `e2e/visual/` (confirmed via `npm run test:e2e:visual` reference in `45-visual-baseline.spec.ts`'s own header comment) |
| Quick run command | `npx playwright test e2e/settings/store-branding.spec.ts` |
| Full suite command | `npm run test:e2e` (functional) + `npm run test:e2e:visual` (visual baseline) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORE-01 | `storeName`/`storeLogoPath` fields save and persist via GeneralSettingsTab | functional (Playwright) | `npx playwright test e2e/settings/store-branding.spec.ts` | ❌ Wave 0 — new file |
| STORE-01 | Storage RLS denies a non-admin write to `store-branding` bucket | functional/RLS (Playwright, direct Supabase client, no page nav) | `npx playwright test e2e/settings/store-branding-rls.spec.ts` | ❌ Wave 0 — new file, mirror `e2e/products/product-photo-rls.spec.ts` |
| STORE-02 | Login screen shows configured store name + hero logo | functional (Playwright) | same `store-branding.spec.ts` file, configured-state test case | ❌ Wave 0 |
| STORE-02 | Login screen shows sane fallback (generic name, no logo) when unconfigured | functional (Playwright) | same file, unconfigured-state test case | ❌ Wave 0 |
| STORE-03 | Visual-regression baseline: configured vs. unconfigured login screen | visual (Playwright screenshot diff) | `npm run test:e2e:visual` | ❌ Wave 0 — new case in `45-visual-baseline.spec.ts` or a new `login-branding-baseline.spec.ts` |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/settings/store-branding.spec.ts` (functional only, fast)
- **Per wave merge:** `npm run test:e2e` + `npm run test:e2e:visual`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/settings/store-branding.spec.ts` — covers STORE-01/STORE-02 functional cases
- [ ] `e2e/settings/store-branding-rls.spec.ts` — covers STORE-01's RLS boundary (mirrors `e2e/products/product-photo-rls.spec.ts` structure exactly, same `test.describe.serial` + `beforeAll`/`afterAll` shape)
- [ ] `e2e/visual/login-branding-baseline.spec.ts` (or an added case in `45-visual-baseline.spec.ts`) — covers STORE-03's configured/unconfigured visual diff
- [ ] No new framework install needed — `@playwright/test`, `createRoleScopedClient`, `getServiceClient`, `requireIntegrationEnv` helpers all already exist in `e2e/helpers/`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase touches no auth flow |
| V3 Session Management | No | Not touched |
| V4 Access Control | Yes | `manage_settings` RBAC gate (client `ProtectedAction`) + Postgres RLS `role_permissions` join on both the `settings` table write and the new `store-branding` Storage bucket writes — RLS is the actual authority, matching Phase 31's precedent (client gate is UX-only) |
| V5 Input Validation | Yes | `validatePhotoFile()` (MIME allow-list, 10MB cap) client-side + the bucket's own `allowed_mime_types`/`file_size_limit` server-side backstop (2MB, matching Phase 31's `file_size_limit: 2097152` — note this is *below* the 10MB pre-resize client cap by design, since the client always re-encodes to WebP/JPEG before upload) |
| V6 Cryptography | No | No new crypto surface; signed URLs use Supabase Storage's existing signing, not hand-rolled |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via uploaded filename | Tampering | `crypto.randomUUID()`-generated object keys, never `File.name` — same mitigation already verified in `photoObjectPath()`, `photo-file.ts:119-121` |
| Non-admin write to a "private" bucket via direct Storage API call (bypassing the UI's RBAC gate) | Elevation of Privilege | Postgres RLS on `storage.objects`, `role_permissions` join — proven by the existing `product-photos` bucket's own RLS-boundary E2E spec, which this phase's new spec should mirror exactly |
| Stale/broken signed URL served after TTL expiry | Denial of Service (minor) | TanStack Query `staleTime` set below the signed-URL TTL, matching `resolveProductImage.ts`'s `SIGNED_URL_STALE_TIME_MS = 45 * 60 * 1000` vs. `SIGNED_URL_TTL_SECONDS = 60 * 60` |
| Silent data loss on the `general` settings JSONB blob (Pitfall 1/2) | Tampering (unintentional, self-inflicted) | Forward data migration + read-merge-write discipline on the upload mutation, not a traditional security control but a correctness gate with real user-facing impact |

## Sources

### Primary (HIGH confidence — all read in full this session)
- `D:/Projects/Code/supermarket-pos/src/shared/lib/domain.ts` (lines 1-1436, `GeneralSettingsSchema` at 860-866)
- `D:/Projects/Code/supermarket-pos/src/entities/settings/model/queries.ts` (full file, 562 lines)
- `D:/Projects/Code/supermarket-pos/src/pages/login/index.tsx` (full file, 89 lines)
- `D:/Projects/Code/supermarket-pos/src/widgets/LogoImage/index.tsx` (full file, 25 lines)
- `D:/Projects/Code/supermarket-pos/src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx` (full file, 148 lines)
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/model/photo-file.ts` (full file, 165 lines)
- `D:/Projects/Code/supermarket-pos/src/features/manage-products/model/useProductPhotoUpload.ts` (full file, 157 lines)
- `D:/Projects/Code/supermarket-pos/src/entities/product/model/resolveProductImage.ts` (full file, 159 lines)
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260907000001_product_photos_storage.sql` (full file, 67 lines)
- `D:/Projects/Code/supermarket-pos/src/shared/lib/rbac.ts` (full file, 104 lines)
- `D:/Projects/Code/supermarket-pos/e2e/products/product-photo-rls.spec.ts` (full file, 247 lines)
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260830000002_terminal_lock_settings.sql` (grep + context, RLS deviation note)
- `D:/Projects/Code/supermarket-pos/supabase/migrations/20260510000001_rls_rewrite_phase13.sql` (grep + context, `settings` table RLS shape, lines 946-963)
- `D:/Projects/Code/supermarket-pos/e2e/visual/45-visual-baseline.spec.ts` (partial, header + structure, lines 1-80)
- `D:/Projects/Code/supermarket-pos/e2e/settings/backup-restore.spec.ts` (partial, lines 1-60)
- `.planning/phases/33-login-screen-store-branding/33-CONTEXT.md` (full)
- `.planning/phases/31-product-catalog-detail-photo-upload/31-CONTEXT.md` (D-16 section, grep + context)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json`, `.planning/ROADMAP.md` (Phase 33 section)

### Secondary (MEDIUM confidence)
- None — no external web/docs sources were needed for this phase; every technical claim was
  verifiable directly against the codebase.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies, entirely in-repo verified
- Architecture: HIGH - direct reuse of a shipped, E2E-tested Phase 31 pattern, read in full
- Pitfalls: HIGH - all 4 pitfalls derived from reading actual source (not inferred), with exact line-number citations and verbatim quotes

**Research date:** 2026-09-11
**Valid until:** No fixed expiry — this research depends only on this repo's own code, which does
not go stale on an external release cadence. Re-verify only if `entities/settings/model/queries.ts`
or the Phase 31 Storage files change before this phase is planned/executed.
