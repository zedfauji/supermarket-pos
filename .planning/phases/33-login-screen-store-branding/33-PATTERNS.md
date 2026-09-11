# Phase 33: Login Screen Store Branding - Pattern Map

**Mapped:** 2026-09-11
**Files analyzed:** 14 (5 new, 9 modified)
**Analogs found:** 13 / 14

Every file in this phase has a direct in-repo twin from Phase 31 (product photo,
shipped 2026-09-08). This phase is a copy-and-adapt, not a design exercise.

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `supabase/migrations/<ts>_store_branding_storage.sql` | new | migration | file-I/O (bucket+RLS) | `supabase/migrations/20260907000001_product_photos_storage.sql` | exact |
| `supabase/migrations/<ts>_rename_barname_to_storename.sql` | new | migration | batch (JSONB data rewrite) | `supabase/migrations/20260422000006_kds_enabled_setting.sql` | role-match |
| `src/features/manage-settings/model/store-logo-file.ts`* | new | utility | transform (canvas) | `src/features/manage-products/model/photo-file.ts` | exact |
| `src/features/manage-settings/model/useStoreLogoUpload.ts`* | new | feature hook (mutation) | file-I/O + CRUD | `src/features/manage-products/model/useProductPhotoUpload.ts` | exact |
| `src/entities/settings/model/resolveStoreLogo.ts` | new | entity query/resolver | request-response (signed URL) | `src/entities/product/model/resolveProductImage.ts` | exact |
| `src/entities/settings/ui/StoreLogoImage.tsx` | new | component | request-response | `src/widgets/LogoImage/index.tsx` (shape) + `ProductPhotoTab`'s `<img>` block (signing/fallback) | partial |
| `src/shared/lib/domain.ts` (`GeneralSettingsSchema`) | mod | model (Zod) | — | itself (lines 860-866, quoted in RESEARCH.md) | exact |
| `src/entities/settings/model/queries.ts` (`DEFAULT_GENERAL`) | mod | entity queries | CRUD | itself (lines 55-61, 141-144, 282-328) | exact |
| `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx` | mod | widget (form) | CRUD + file-I/O | itself + `src/features/manage-products/ui/tabs/ProductPhotoTab.tsx` for the new upload control | exact |
| `src/pages/login/index.tsx` | mod | page | request-response | itself (lines 30-69) | exact |
| `src/entities/payment/model/queries.ts:216` | mod | entity queries | CRUD | itself (field rename only) | exact |
| `src/shared/lib/{receipt-format,buildStartTicketText,edge-function-contracts}.ts` | mod | utility/config | transform | itself (field rename only — see Pitfall 4 caveat) | exact |
| `e2e/settings/store-branding.spec.ts` + `store-branding-rls.spec.ts` | new | test | request-response | `e2e/products/product-photo-upload.spec.ts` / `e2e/products/product-photo-rls.spec.ts` | exact |
| `e2e/visual/login-branding-baseline.spec.ts` | new | test (visual) | — | `e2e/visual/46-product-dialog-baseline.spec.ts` | exact |

\* FSD placement note: Phase 31 put these under `features/manage-products/model/`.
There is no `features/manage-settings/` slice today (`GeneralSettingsTab` calls
`@entities/settings` hooks directly). Planner picks one: create the feature slice
(mirrors Phase 31 exactly) **or** put the upload hook in `entities/settings/model/`
next to `resolveStoreLogo.ts`. Both are FSD-legal from `widgets/SettingsTabsPanel`.
The signed-URL resolver **must** be in `entities/settings` (or `shared/`) because
`pages/login` cannot import from `features/`.

## Pattern Assignments

### `<ts>_store_branding_storage.sql` (migration, bucket + RLS)

**Analog:** `supabase/migrations/20260907000001_product_photos_storage.sql` (67 lines, full file read)

Copy verbatim, substituting `product-photos` → `store-branding` and
`manage_products` → `manage_settings`. **Drop the `ALTER TABLE ... ADD COLUMN`
line** — this phase has no column (the path lives in the `settings` JSONB blob).

**Idempotency header comment + bucket insert** (lines 11-26):
```sql
-- Idempotent by design: bucket insert is ON CONFLICT DO NOTHING, ... and every
-- policy is dropped-if-present before being recreated, so re-running is a no-op.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  false,                               -- private bucket (D-15)
  2097152,                             -- 2 MB server-side backstop (D-11)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

**RLS policy set** (lines 31-64) — note SELECT is open to all `authenticated`
with no permission predicate; writes carry the `role_permissions` EXISTS join:
```sql
DROP POLICY IF EXISTS product_photos_select ON storage.objects;
CREATE POLICY product_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-photos'
  );

DROP POLICY IF EXISTS product_photos_insert ON storage.objects;
CREATE POLICY product_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND EXISTS (SELECT 1 FROM role_permissions WHERE role = get_user_role() AND action = 'manage_products')
  );
```
(UPDATE repeats the predicate in both `USING` and `WITH CHECK`; DELETE uses
`USING` only. All four policies present.)

**Footer** (line 67-68):
```sql
COMMIT;
-- No DOWN script (CLAUDE.md convention -- post-pivot migrations ship forward-only).
```

**Note for the login screen:** the open-to-`authenticated` SELECT policy means a
logged-in user can sign the logo URL — but the **login screen renders pre-auth**.
Planner must confirm whether an anon session can mint the signed URL; if not, the
bucket must be `public: true` (a store logo is not secret) or the logo served via
a public URL. This is the one genuine divergence from Phase 31 and it is
load-bearing for STORE-02.

---

### `<ts>_rename_barname_to_storename.sql` (migration, JSONB data rewrite)

**Analog:** `supabase/migrations/20260422000006_kds_enabled_setting.sql` — the
repo's only precedent for mutating a settings JSONB blob in a migration. It is
this short, with no transaction wrapper:
```sql
-- Add kds_enabled to receipt settings JSON blob
UPDATE settings
SET value = value || '{"kds_enabled": false}'::jsonb
WHERE key = 'receipt';
```

Use RESEARCH.md's Pitfall-1 statement, which adds the idempotency guard this
analog lacks:
```sql
UPDATE settings
SET value = (value - 'barName') || jsonb_build_object('storeName', value->'barName')
WHERE key = 'general' AND value ? 'barName';
```

---

### `store-logo-file.ts` (utility, canvas transform)

**Analog:** `src/features/manage-products/model/photo-file.ts` (165 lines, full file read)

Copy `validatePhotoFile`, `targetDimensions`, `resizePhoto`, and the
drag/paste extractors. Change **only** `MAX_EDGE_PX` (1200 → 800, D-07) and the
object-path function.

**File header + eslint escape** (lines 1-17) — this file legitimately disables
`i18next/no-literal-string` for MIME/sentinel literals; copy the justification:
```typescript
/* eslint-disable i18next/no-literal-string -- internal AppError sentinels
   ('unknownType'), the VALIDATION_ERROR message (not shown verbatim — the UI
   selects its own translated copy by AppErrorCode), and MIME-type literals
   passed to canvas.toBlob(); none of this file's strings are rendered UI copy. */
import { err, ok, photoDecodeFailedError, photoTooLargeError, type Result } from '@shared/lib/result';

export const ACCEPTED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MAX_EDGE_PX = 1200;   // ← 800 for the store logo (D-07)
const ENCODE_QUALITY = 0.8; // ← unchanged (D-08)
```

**Validation** (lines 32-45):
```typescript
export function validatePhotoFile(file: File): Result<File> {
  const type = file.type;
  if (!(ACCEPTED_PHOTO_MIME_TYPES as readonly string[]).includes(type)) {
    return err({ code: 'VALIDATION_ERROR', message: 'Unsupported photo format.', detail: declaredType(file) });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return err(photoTooLargeError(bytesToMb(file.size)));
  }
  return ok(file);
}
```

**Object path — path-traversal mitigation** (lines 115-121). Drop the
`productId` segment; the store logo is a singleton:
```typescript
/**
 * Mints a fresh Storage object key. Built only from productId and a generated
 * uuid — File.name is never read into the key (path-traversal prevention).
 */
export function photoObjectPath(productId: string, ext: string): string {
  return `products/${productId}/${crypto.randomUUID()}.${ext}`;
}
// → export function storeLogoObjectPath(ext: string): string {
//     return `store/${crypto.randomUUID()}.${ext}`;
//   }
// uuid-per-upload (not a stable `store/logo.ext`) keeps `upsert: false` valid
// and matches the delete-previous-last sequence below.
```

**Resize/re-encode with WebP→JPEG fallback** (lines 129-164) — copy whole,
including the `bitmap.close()` in `finally` and the every-failure-returns-an-
AppError discipline:
```typescript
export async function resizePhoto(file: File): Promise<Result<{ blob: Blob; ext: 'webp' | 'jpg' }>> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return err(photoDecodeFailedError(declaredType(file)));
  }
  try {
    const { width, height } = targetDimensions({ width: bitmap.width, height: bitmap.height });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return err(photoDecodeFailedError(declaredType(file)));
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webpBlob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/webp', ENCODE_QUALITY);
    });
    if (webpBlob) return ok({ blob: webpBlob, ext: 'webp' });

    const jpegBlob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', ENCODE_QUALITY);
    });
    if (jpegBlob) return ok({ blob: jpegBlob, ext: 'jpg' });

    return err(photoDecodeFailedError(declaredType(file)));
  } finally {
    bitmap.close();
  }
}
```

---

### `useStoreLogoUpload.ts` (feature hook, mutation)

**Analog:** `src/features/manage-products/model/useProductPhotoUpload.ts` (157 lines, full file read)

**Imports + MIME constants** (lines 9-29):
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateCatalogQueries, PRODUCT_PHOTO_BUCKET } from '@entities/product';
import { isOnline } from '@shared/lib/connectivity';
import { logger } from '@shared/lib/logger-instance';
import {
  err, networkOfflineError, ok, photoLinkFailedError, photoRemoveFailedError,
  photoUploadFailedError, supabaseMutation, type Result,
} from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import { photoObjectPath, resizePhoto, validatePhotoFile } from './photo-file';

/* eslint-disable i18next/no-literal-string -- MIME-type literals, not UI copy */
const WEBP_CONTENT_TYPE = 'image/webp';
const JPEG_CONTENT_TYPE = 'image/jpeg';
/* eslint-enable i18next/no-literal-string */
```
Note `isOnline` is imported from `@shared/lib/connectivity` (CLAUDE.md says
`@shared/lib/network` — the live path is `connectivity`; use what compiles).

**Core upload sequence** (lines 42-95) — offline guard → validate → resize →
upload (`upsert: false`) → link → delete-previous-last:
```typescript
mutationFn: async (input): Promise<Result<{ path: string }>> => {
  if (!isOnline()) return err(networkOfflineError());

  const validated = validatePhotoFile(input.file);
  if (!validated.ok) return validated;

  input.onStageChange?.('processing');
  const resized = await resizePhoto(validated.data);
  if (!resized.ok) return resized;

  input.onStageChange?.('uploading');
  const path = photoObjectPath(input.productId, resized.data.ext);
  const contentType = resized.data.ext === 'webp' ? WEBP_CONTENT_TYPE : JPEG_CONTENT_TYPE;

  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_PHOTO_BUCKET)
    .upload(path, resized.data.blob, { contentType, upsert: false });
  if (uploadError) {
    logger.error('product.photo.upload_failed', { message: uploadError.message, path });
    return err(photoUploadFailedError(uploadError.message, uploadError));
  }

  const linkResult = await supabaseMutation(() =>
    supabase.from('products').update({ photo_path: path }).eq('id', input.productId).select('id').single()
  );
  if (!linkResult.ok) { /* logger.error(...); */ return err(photoLinkFailedError(...)); }
  ...
}
```

**⚠ The one place this phase MUST diverge (RESEARCH.md Pitfall 2):** the `link`
step above is a real column update. There is no `storeLogoPath` column. Replace
that block with a read-merge-write against the whole `general` blob:
```typescript
// current snapshot must be spread — useMutationUpdateSetting upserts the WHOLE value
await updateSetting.mutateAsync({ key: 'general', value: { ...currentGeneral, storeLogoPath: path } });
```

**Stage callback type** (lines 31-37) — reuse so the settings tab can show
processing-vs-uploading copy:
```typescript
export type ProductPhotoUploadInput = {
  productId: string;
  previousPath: string | null;
  file: File;
  onStageChange?: (stage: 'processing' | 'uploading') => void;
};
```

**Orphan tolerance on the previous-object delete** (lines 79-92) — copy this
exact policy and its comment; a failed old-object delete is a logged warning,
never a user-facing error:
```typescript
if (input.previousPath) {
  const { error: removeError } = await supabase.storage
    .from(PRODUCT_PHOTO_BUCKET).remove([input.previousPath]);
  if (removeError) {
    // Reported to the user as success (the new photo is live and linked) —
    // the old object is merely orphaned, not a broken reference. Logged so
    // it can be reclaimed later.
    logger.warn('product.photo.old_object_orphaned', { path: input.previousPath, message: removeError.message });
  }
}
```

**Remove mutation** (lines 116-157) — `useRemoveProductPhoto` is the template
for a "Remove logo" action: clear the reference first, delete the object second,
orphan-on-failure. Note its `path` is always read from the stored row, never
caller-supplied (line 104 comment).

---

### `resolveStoreLogo.ts` (entity resolver, signed URL)

**Analog:** `src/entities/product/model/resolveProductImage.ts` (159 lines, full file read)

Take the **single-row** half (lines 16-93). Skip `signProductPhotos` /
`useProductImageUrls` entirely — there is exactly one logo, no batch surface.

**Header comment explaining the FSD placement + hand-wrapped Storage errors**
(lines 1-13) — the same reasoning applies verbatim to why the logo resolver
lives in `entities/settings` and not `features/`:
```typescript
/**
 * ... Lives in entities/product because widgets/ and other entities/*
 * consumers may not import from features/ (FSD boundary).
 *
 * Storage responses are not Postgrest builders, so they're wrapped by hand
 * in ok/err here rather than through supabaseMutation/supabaseQuery.
 */
```

**Constants** (lines 16-20) — reuse these exact TTL/staleTime numbers (CONTEXT.md
discretion says mirror, don't invent):
```typescript
export const PRODUCT_PHOTO_BUCKET = 'product-photos';
/** Signed-URL lifetime handed to Storage (D-16). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Re-sign before the TTL expires — TanStack Query staleTime for the signed-URL cache. */
export const SIGNED_URL_STALE_TIME_MS = 45 * 60 * 1000;
```

**Sign function with try/catch + logger + Result** (lines 22-40):
```typescript
export async function signProductPhoto(path: string): Promise<Result<string>> {
  try {
    const { data, error } = await supabase.storage
      .from(PRODUCT_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) {
      logger.error('product.photo.sign_failed', { message: error.message, path });
      return err(supabaseError(error.message, undefined, error));
    }
    return ok(data.signedUrl);
  } catch (e) {
    logger.error('product.photo.sign_failed', { message: e instanceof Error ? e.message : String(e), path });
    return err(unknownError(e));
  }
}
```

**Hook — never let a failure surface a broken src** (lines 78-93):
```typescript
export function useProductImageUrl(product): { url: string | null; isLoading: boolean } {
  const query = useQuery({
    // eslint-disable-next-line i18next/no-literal-string -- query-key namespace string, not UI copy
    queryKey: ['product-photo-url', id, photoPath, imageUrl],
    queryFn: () => resolveProductImageUrl({ photoPath, imageUrl }),
    staleTime: SIGNED_URL_STALE_TIME_MS,
  });
  return { url: query.data ?? null, isLoading: !!photoPath && query.isPending };
}
```
Key insight to carry over: the query key **includes the path**, so an
upload/replace/remove produces a fresh cache entry with zero manual invalidation.
For the logo: `['store-logo-url', storeLogoPath]`. And `isLoading` is false when
there is no path at all — so the D-03 fallback renders immediately, no skeleton
flash on an unconfigured store.

---

### `StoreLogoImage.tsx` (component)

**Analog (shape):** `src/widgets/LogoImage/index.tsx` (25 lines, full file read).
Do **not** modify or extend this component (RESEARCH.md Pitfall 3 — it is
hardcoded to the receipt `logoDataUrl` and stays receipt-only).

Its props contract and fallback-passthrough is exactly what the new component
needs, only with an async-signed src instead of a data URL:
```typescript
type Props = { className?: string; alt?: string; fallback?: ReactNode };

export function LogoImage({ className, alt = 'Logo', fallback = null }: Props) {
  const { data } = useReceiptSettings();
  const logoDataUrl = data?.logoDataUrl ?? null;
  if (!logoDataUrl) return <>{fallback}</>;
  return (
    <img data-testid="app-logo" src={logoDataUrl} alt={alt}
      className={cn('max-h-full max-w-full object-contain', className)} />
  );
}
```
`data-testid` on the `<img>` is the hook the E2E specs need — keep the
convention (`data-testid="store-logo"`).

**Analog (signing + load-failure states):** `ProductPhotoTab.tsx` lines 210-230
— skeleton while signing, `ImageOff` fallback when the `<img>` itself 404s (an
expired/deleted object), real image otherwise:
```tsx
{hasPhoto ? (
  isSigning || !url ? (
    <Skeleton className="size-full rounded-xl" />
  ) : imgFailed ? (
    <div className="flex size-full flex-col items-center justify-center gap-2">
      <ImageOff className="size-10 text-muted-foreground" aria-hidden="true" />
      ...
    </div>
  ) : (
    <img src={url} alt={...} className="size-full object-contain p-4"
      onError={() => { setImgFailed(true); }} />
  )
) : (
  /* empty state */
)}
```
For the login hero, the `imgFailed` branch should collapse to the same D-03
fallback (`ShoppingBasket` icon + `t('login.brand')`), not an error message —
the login screen has no one to report an error to.

---

### `src/pages/login/index.tsx` (page, brand-panel reshape)

**Analog:** itself. D-06 keeps everything; the header block (lines 42-56) is what
changes from a 44px tile to a hero block.

**Current header block to reshape** (lines 42-56):
```tsx
<div className="relative flex items-center gap-3">
  <div className="flex size-11 items-center justify-center overflow-hidden rounded-xl bg-ink-foreground/10 ring-1 ring-ink-foreground/15">
    <LogoImage
      alt={t('common.logoAlt')}
      className="size-full object-cover"
      fallback={<ShoppingBasket className="size-5" aria-hidden="true" />}
    />
  </div>
  <div className="leading-tight">
    <p className="text-sm font-semibold tracking-tight">{t('login.brand')}</p>
    <p className="text-xs text-ink-foreground/60">{t('login.terminal', { id: TERMINAL_ID })}</p>
  </div>
</div>
```
Swap `LogoImage` → `StoreLogoImage`, scale the tile, and make the name line
`general.storeName || t('login.brand')` (D-03). Terminal id line stays (D-06).

**Do NOT touch the mobile block** (lines 73-82) — D-05 freezes it, `LogoImage`
and all. Note this means `LogoImage` (receipt logo) stays on the mobile header
while the desktop panel shows the new store logo; that asymmetry is the locked
decision, not an oversight.

**Layout constraints to preserve:** the `hidden lg:flex lg:flex-col
lg:justify-between` aside (line 33) is a 2-child space-between flex column —
adding a third top-level child changes the vertical distribution. Keep the
header block and the date/clock/tagline block (lines 58-68) as the only two
children, or switch to an explicit layout.

**Existing pattern for reading settings in a page:** none here — `LoginPage`
currently reads no settings. `LogoImage` itself calls `useReceiptSettings()`
internally (widget-owns-its-data), so the new `StoreLogoImage` should likewise
call `useSettings()` itself rather than making `LoginPage` prop-drill.

---

### `GeneralSettingsTab.tsx` (widget form + new upload control)

**Analog:** itself (148 lines, full file read) for the text field; `ProductPhotoTab.tsx` for the upload control.

**Local-form-mirrors-server-state + dirty-guard pattern** (lines 32-46) — the
new `storeName` field and the logo path both slot into this shape:
```typescript
const [form, setForm] = useState<GeneralForm>(DEFAULT_FORM);
const [dirty, setDirty] = useState(false);

useEffect(() => {
  if (!data || dirty) return;
  /* eslint-disable react-hooks/set-state-in-effect */
  setForm({
    barName: data.general.barName,
    address: data.general.address,
    ...
  });
  /* eslint-enable react-hooks/set-state-in-effect */
}, [data, dirty]);
```

**Whole-blob save** (lines 48-65) — this is the concrete proof of Pitfall 2: the
save writes every key at once, so a logo-only write would wipe the rest:
```typescript
const save = async () => {
  const result = await updateSetting.mutateAsync({
    key: 'general',
    value: {
      barName: form.barName.trim(),
      address: form.address.trim(),
      timezone: form.timezone.trim(),
      currency: form.currency.trim().toUpperCase(),
      receiptFooterText: form.receiptFooterText.trim(),
    },
  });
  if (!result.ok) { toast.error(result.error.message); return; }
  setDirty(false);
  toast.success(t('generalSettingsTab.saved'));
};
```
After the rename this object gains `storeName` and must carry `storeLogoPath`
through unchanged (`storeLogoPath: form.storeLogoPath`), or a General-tab save
erases a logo uploaded earlier in the session.

**RBAC gate wrapping the whole tab** (lines 68-72) — the logo control inherits
it, no new gate needed (D-12):
```tsx
<ProtectedAction action="manage_settings" currentRole={currentRole} disabled={updateSetting.isPending}>
```

**Field markup + label/i18n convention** (lines 76-86) — `id` is kebab-case and
matches the `htmlFor`; the rename should carry `settings-bar-name` →
`settings-store-name` (and any E2E selector using it):
```tsx
<div className="space-y-2">
  <Label htmlFor="settings-bar-name">{t('generalSettingsTab.barNameLabel')}</Label>
  <Input
    id="settings-bar-name"
    value={form.barName}
    onChange={event => {
      setDirty(true);
      setForm(current => ({ ...current, barName: event.target.value }));
    }}
  />
</div>
```

**Upload-control markup** — lift from `ProductPhotoTab.tsx`:
- accept attr + hidden input (lines 35, 252-260): `const ACCEPT_ATTR = ACCEPTED_PHOTO_MIME_TYPES.join(',')`, `<input type="file" className="sr-only" .../>` with `e.target.value = ''` reset in the change handler (lines 145-150)
- keyboard-accessible dropzone (lines 91-96, 193-201): `role="button" tabIndex={0}` + Enter/Space `onKeyDown` — only applied when empty
- drag handlers (lines 152-172) using `firstImageFromDataTransfer`
- in-flight overlay with processing-vs-uploading copy (lines 241-250)
- `errorCopyFor(error: AppError)` switch mapping each AppErrorCode to a translated string (lines 60-84) — reuse the code list, new `wAdmin` keys
- `ConfirmDialog` for remove (lines 305-317)

---

### `domain.ts` / `entities/settings/model/queries.ts` (model + entity queries)

**Schema** — current shape at `domain.ts:860-866`; add `storeLogoPath:
z.string().nullable().default(null)` (nullable+default so pre-migration rows
still `safeParse`, and `exactOptionalPropertyTypes` forbids `?:`).

**Default blob** (`queries.ts:55-61`) — the stale `'Bola 8'` must not survive the
rename (CONTEXT.md Specific Ideas):
```typescript
const DEFAULT_GENERAL: GeneralSettings = {
  barName: 'Bola 8',
  address: '',
  timezone: 'America/Mexico_City',
  currency: 'MXN',
  receiptFooterText: '',
};
```
Same stale default is duplicated in `GeneralSettingsTab.tsx:20-26` (`DEFAULT_FORM`)
— fix both.

**Silent-fallback parser** (`queries.ts:141-144`) — the mechanism behind Pitfall 1:
```typescript
function parseGeneral(value: unknown): GeneralSettings {
  const parsed = GeneralSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GENERAL;
}
```

**Missing-generated-types workaround, if needed** (`queries.ts:43-47`) — the
in-repo precedent for the CLAUDE.md `as any` escape hatch:
```typescript
// terminal_lock_settings is not yet in generated supabase.types.ts (Phase 21) —
// scoped `any` per CLAUDE.md's "Missing generated types workaround", mirroring
// the receipt_settings hooks below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
const db = supabase as any;
```

---

### `e2e/settings/store-branding-rls.spec.ts` (test, RLS boundary)

**Analog:** `e2e/products/product-photo-rls.spec.ts` (247 lines; header + fixtures read)

**Header stating why this talks to Supabase directly** (lines 1-25) — reuse the
reasoning and the read-scope caveat (which is even more load-bearing here, given
the anon/login-screen read question above):
```
 * Proves the database, not the UI, denies a write against the `product-photos`
 * bucket's `storage.objects` rows for a role without `manage_products`, and
 * for an unauthenticated caller. Talks to Supabase directly — no page
 * navigation — because the claim under test is a database-layer one, and a
 * UI that merely hides a button proves nothing.
```

**Imports + helpers** (lines 26-33) — all already exist, nothing new to build:
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '../fixtures';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { createRoleScopedClient } from '../helpers/rls-clients';
import { getServiceClient } from '../helpers/supabase';

const BUCKET = 'product-photos';
```

**Anon client + fake bytes** (lines 47-64):
```typescript
function createAnonClient(): ReturnType<typeof createClient> {
  return createClient(getUrl(), getAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: `e2e-rls-anon-${String(Date.now())}` },
  });
}

/** Tiny, deterministic bytes — RLS denial is asserted before any content
 * validation would ever run ... */
function fakePhotoBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
```

**Serial + shared-client structure** (lines 78-90) — `createRoleScopedClient`
costs 1-2s per call, so provision once per role in `beforeAll`:
```typescript
test.describe.serial('Product photo Storage RLS boundary — cashier and anonymous denial', () => {
  test.beforeAll(async () => {
    requireIntegrationEnv();
    const admin = getServiceClient();
    ...
  });
```
Every denial assertion is paired with a service-client ground-truth read (line
24) — carry that discipline over.

---

### `e2e/visual/login-branding-baseline.spec.ts` (test, visual regression)

**Analog:** `e2e/visual/46-product-dialog-baseline.spec.ts` (header + fixtures read)

**Header conventions to copy** (lines 1-24) — the run command, the "mirror 45's
structure" instruction, and the untracked-baseline note:
```
 * Mirrors 45-visual-baseline.spec.ts's structure, auth flow, and
 * `waitForPageReady` stabilisation helper rather than inventing a new
 * convention. Run in isolation via `npm run test:e2e:visual`
 * (playwright.visual.config.ts — headless, no slowMo).
 *
 * NOTE on baseline image storage: `.gitignore` has a project-wide rule
 * (`e2e/visual/**\/*-snapshots/`) excluding every visual-regression spec's
 * generated PNGs from version control ... Baselines are local,
 * regenerated-on-first-run artifacts per machine, not committed alongside the spec
```

**Imports** (lines 46-50):
```typescript
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from '../fixtures';
import { gotoAuthed, loginAs } from '../helpers/auth';
import { requireIntegrationEnv } from '../helpers/requireEnv';
import { getServiceClient, openCaja, resetTestState } from '../helpers/supabase';
```

**Pairing rule worth copying** (lines 4-8): each visual baseline is paired with
a deterministic measurement "so a failure says which of the two broke." For this
phase: pair the hero-logo screenshot with a `boundingBox()` assertion that the
logo is materially larger than the old 44px tile — that turns D-04's "hero-size,
dominant" from a subjective screenshot into a testable claim.

**Login-screen specific:** the login page is pre-auth, so this spec does **not**
need `loginAs`/`openCaja`; it needs the service client in `beforeAll` to write
`settings.general` (configured state) and to clear it (fallback state), then a
plain `page.goto('/login')` per case. `LiveTimeDisplay` (login/index.tsx:63) is a
ticking clock — it **must** be masked or the baseline flakes every second.

## Shared Patterns

### Result<T> + logger on every async boundary
**Source:** `resolveProductImage.ts:22-40`, `useProductPhotoUpload.ts:59-77`
**Apply to:** every new hook/resolver/mutation in this phase
Storage calls return `{ data, error }`, not a Postgrest builder — wrap by hand in
`ok`/`err` (never `supabaseQuery`/`supabaseMutation`); DB calls go through
`supabaseMutation`. Every error path logs a dotted event name with structured
fields before returning.

### Offline gate before any network mutation
**Source:** `useProductPhotoUpload.ts:44-46`
**Apply to:** the logo upload and remove mutations
```typescript
if (!isOnline()) return err(networkOfflineError());
```

### RBAC: RLS is the authority, `ProtectedAction` is UX
**Source:** `GeneralSettingsTab.tsx:68-72` (client) + `20260907000001_product_photos_storage.sql:38-44` (server)
**Apply to:** the settings tab (client gate) and the new bucket policies (server gate)
Both layers, same action (`manage_settings`). The E2E RLS spec exists precisely
because the client gate proves nothing.

### i18n literal-string discipline
**Source:** `photo-file.ts:6-9`, `useProductPhotoUpload.ts:26-29`, `resolveProductImage.ts:83`
**Apply to:** all new files
`i18next/no-literal-string` is `error` in `shared/ui`, `entities`, `features`,
`widgets`, `pages`. MIME literals, query-key namespaces, and AppError sentinels
get a scoped `eslint-disable` **with a justification naming why it isn't UI copy**.
Real UI copy gets `wAdmin` keys in **both** `es-MX` and `en-US`.

### Query-key-encodes-the-input (no manual invalidation)
**Source:** `resolveProductImage.ts:82-87`
**Apply to:** the store-logo signed-URL hook
Put the path in the key; a new upload naturally produces a new cache entry.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none — every file has a match) | | | |

**Closest thing to a gap:** there is no precedent in this repo for rendering a
Storage-backed asset on a **pre-authentication** screen. Every existing signed-URL
consumer (`ProductPhotoTab`, catalog thumbnails) runs behind `ProtectedRoute`.
The planner must resolve the anon-read question before Plan 1's migration is
written, because it decides `public: true` vs `false` on the bucket — and that is
the one decision in this phase with no in-repo answer to copy.

## Metadata

**Analog search scope:** `src/features/manage-products/`, `src/entities/product/`,
`src/entities/settings/`, `src/widgets/SettingsTabsPanel/`, `src/widgets/LogoImage/`,
`src/pages/login/`, `supabase/migrations/`, `e2e/{products,settings,visual}/`
**Files read in full:** 8 (`photo-file.ts`, `useProductPhotoUpload.ts`,
`resolveProductImage.ts`, `pages/login/index.tsx`, `GeneralSettingsTab.tsx`,
`LogoImage/index.tsx`, `ProductPhotoTab.tsx`, `20260907000001_product_photos_storage.sql`,
`20260422000006_kds_enabled_setting.sql`)
**Files read partially:** 3 (`entities/settings/model/queries.ts` lines 40-159 +
250-334; `e2e/products/product-photo-rls.spec.ts` lines 1-90;
`e2e/visual/46-product-dialog-baseline.spec.ts` lines 1-70)
**Pattern extraction date:** 2026-09-11
