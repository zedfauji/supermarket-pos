---
phase: 33-login-screen-store-branding
reviewed: 2026-09-11T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - supabase/migrations/20260911000001_store_branding_settings.sql
  - supabase/migrations/20260911000002_store_branding_storage.sql
  - src/shared/lib/domain.ts
  - src/shared/lib/domain.test.ts
  - src/entities/settings/model/queries.ts
  - src/entities/settings/model/store-logo-file.ts
  - src/entities/settings/model/store-logo-file.test.ts
  - src/entities/settings/model/useStoreLogoUpload.ts
  - src/entities/settings/model/index.ts
  - src/entities/settings/index.ts
  - src/entities/settings/ui/StoreLogoImage.tsx
  - src/entities/payment/model/queries.ts
  - src/shared/lib/edge-function-contracts.ts
  - src/shared/lib/receipt-format.ts
  - src/shared/lib/buildStartTicketText.ts
  - src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx
  - src/widgets/SettingsTabsPanel/tabs/HardwareSettingsTab.tsx
  - src/pages/login/index.tsx
  - supabase/functions/process-payment/index.ts
  - supabase/functions/process-split-payment/index.ts
  - supabase/functions/process-direct-sale/index.ts
  - e2e/settings/store-branding.spec.ts
  - e2e/settings/store-branding-rls.spec.ts
  - e2e/visual/login-branding-baseline.spec.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
fix_status: fixed
fixed_at: 2026-09-11T12:24:00Z
fix_scope: critical_warning
fix_report: 33-REVIEW-FIX.md
findings_fixed: 5
findings_skipped: 0
findings_out_of_scope: 1
---

# Phase 33: Code Review Report

**Reviewed:** 2026-09-11
**Depth:** standard
**Files Reviewed:** 21 source files (plus 3 fixture-rename-only files skimmed) across the phase's 3 plans, `8c0c131`'s true pre-phase base (`0a9fd10^`) through `HEAD`
**Status:** issues_found

## Summary

Phase 33 adds store-name + store-logo branding to the pre-auth login screen: a repo-wide `barName`→`storeName` rename, an anon-scoped RLS SELECT policy on `settings` (migration `...000001`), a private Storage bucket with anon-readable SELECT + `manage_settings`-gated writes (migration `...000002`), a validate/resize/upload/link pipeline, and login-hero + Settings-tab UI wiring.

The two migrations are correctly scoped — `settings_select_branding_anon` is pinned to `key = 'general'` only (verified against `billing`/`near_expiry` in the RLS spec), and all four `storage.objects` write policies are gated on `manage_settings` via the existing `role_permissions` EXISTS pattern; only `SELECT` is widened to `anon`, and only for the single-purpose `store-branding` bucket (no cross-bucket leak). That part of the phase is solid.

Two real defects were found in the application code, both squarely inside the risk areas called out for this review:

1. The `general` settings blob's "read-merge-write" pattern (`useStoreLogoUpload.ts`) trusts `parseGeneral()`'s all-or-nothing fallback-to-defaults behavior, which can be triggered by an ordinary admin action (saving an empty Address field) and then **permanently persists blanked storeName/timezone/currency/receiptFooterText** the next time a logo is uploaded or removed.
2. `StoreLogoImage`'s `imgFailed` state is never reset when the resolved signed URL changes, so a single failed image load (TTL expiry, transient network blip, CDN hiccup) **permanently breaks the login-hero logo** for the rest of that page mount, even after a fresh valid URL — or an entirely new logo — becomes available.

## Critical Issues

### CR-01: Read-merge-write can permanently blank storeName/address/timezone/currency on the next logo upload or remove

**Fix status:** fixed — commit `60cd552` — `parseGeneral()` in `src/entities/settings/model/queries.ts` now falls back field-by-field instead of collapsing the whole snapshot to `DEFAULT_GENERAL`, closing the hole at the single shared read path (`toSnapshot`) used by every consumer, including `useStoreLogoUpload`'s read-merge-write.

**File:** `src/entities/settings/model/useStoreLogoUpload.ts:50-53`, `src/entities/settings/model/queries.ts:142-145`, `src/shared/lib/domain.ts:860-867`, `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:94-112`

**Issue:** `GeneralSettingsSchema.address` is `z.string().min(1).max(300)` (required). `GeneralSettingsTab`'s Address `<Input>` has no `required`/validation before `save()` posts the raw form value straight to `settings.value` via `useMutationUpdateSetting` (no client-side schema check on the outbound payload) — so an admin can trivially save `address: ''`.

On the next read, `parseGeneral()` does:
```ts
function parseGeneral(value: unknown): GeneralSettings {
  const parsed = GeneralSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_GENERAL;
}
```
`safeParse` fails on the whole object (not per-field), so the fallback is the **entire** `DEFAULT_GENERAL` object — `storeName: ''`, `storeLogoPath: null`, `timezone: 'America/Mexico_City'`, `currency: 'MXN'`, `receiptFooterText: ''` — even though the real `storeName`/`storeLogoPath`/etc. are still sitting untouched in the actual DB row (only `address` was bad).

`useStoreLogoUpload`'s (and `useRemoveStoreLogo`'s) read-merge-write step trusts this collapsed snapshot without distinguishing "real value" from "validation-failure stand-in":
```ts
function currentGeneralSnapshot(queryClient: QueryClient): GeneralSettings | null {
  const cached = queryClient.getQueryData<Result<SettingsSnapshot>>(SETTINGS_QUERY_KEY);
  return cached?.ok ? cached.data.general : null; // may be DEFAULT_GENERAL, not the real row
}
...
const linkResult = await updateSetting.mutateAsync({
  key: 'general',
  value: { ...current, storeLogoPath: path }, // writes DEFAULT_GENERAL's fields back to the DB
});
```
The very next logo upload or removal after any single required field fails validation **writes `DEFAULT_GENERAL`'s placeholder values back over the real stored settings**, permanently losing `storeName`, `timezone`, `currency`, and `receiptFooterText` (not just the address that was actually bad). This is exactly the "read-merge-write must never blank sibling fields" risk called out for this review — it does, under a realistic admin action, and 33-03's own test-fixture bug (Deviation #1 in `33-03-SUMMARY.md`) independently reproduced the *display* half of this (`parseGeneral()` collapsing the whole object) without recognizing the *persistence* half (the logo pipeline turning that transient display glitch into a permanent write).

**Fix:** Make `parseGeneral` (and any snapshot the logo pipeline reads) fail closed per-field rather than collapsing to `DEFAULT_GENERAL` wholesale, e.g. merge parsed-or-default per key instead of an all-or-nothing `safeParse`:
```ts
function parseGeneral(value: unknown): GeneralSettings {
  const parsed = GeneralSettingsSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  // Fall back field-by-field so one bad field doesn't erase the rest.
  const raw = (value ?? {}) as Partial<GeneralSettings>;
  return {
    storeName: typeof raw.storeName === 'string' ? raw.storeName : DEFAULT_GENERAL.storeName,
    address: typeof raw.address === 'string' && raw.address.length > 0 ? raw.address : DEFAULT_GENERAL.address,
    timezone: typeof raw.timezone === 'string' && raw.timezone.length > 0 ? raw.timezone : DEFAULT_GENERAL.timezone,
    currency: typeof raw.currency === 'string' ? raw.currency : DEFAULT_GENERAL.currency,
    receiptFooterText: typeof raw.receiptFooterText === 'string' ? raw.receiptFooterText : DEFAULT_GENERAL.receiptFooterText,
    storeLogoPath: typeof raw.storeLogoPath === 'string' ? raw.storeLogoPath : null,
  };
}
```
and/or add `required`/a pre-submit guard on the Address field in `GeneralSettingsTab` so an empty address can never be written in the first place. Either alone closes the hole; both together is the lazy, root-cause fix (guard the write, and stop the read-side collapse from ever amplifying it).

### CR-02: Login-hero logo permanently shows the broken-image icon after any single failed load — never recovers, even on a fresh valid URL or a brand-new logo

**Fix status:** fixed — commit `be4d3d1` — `StoreLogoImage.tsx` now resets `imgFailed` in a `useEffect` keyed on `url`, matching the existing pattern already used in `GeneralSettingsTab.tsx`.

**File:** `src/entities/settings/ui/StoreLogoImage.tsx:28-59`

**Issue:**
```tsx
export function StoreLogoImage({ className, alt = 'Logo', fallback = null }: Props) {
  const { data } = useSettings();
  const storeLogoPath = data?.general.storeLogoPath ?? null;
  const { url, isLoading } = useStoreLogoUrl(storeLogoPath);
  const [imgFailed, setImgFailed] = useState(false);
  ...
  if (imgFailed) {
    return <ImageOff .../>;
  }
  ...
  return <img ... onError={() => { setImgFailed(true); }} />;
}
```
`imgFailed` is local `useState` with no `useEffect` resetting it when `storeLogoPath` or `url` changes. Once any `<img>` load fails — a transient network blip, a CDN hiccup, or (concretely) the signed URL's 60-minute TTL (`SIGNED_URL_TTL_SECONDS = 60 * 60` in `store-logo-file.ts`) expiring while the query's `staleTime` (45 min) never gets a chance to trigger a refetch because the app disables `refetchOnWindowFocus` globally (`src/app/providers.tsx:32`) and there is no polling/refetch interval on `useStoreLogoUrl` — the component permanently short-circuits to the `ImageOff` branch for the rest of that mount. This is true even after: (a) TanStack Query eventually refetches a fresh, valid signed URL on some other trigger, or (b) the admin uploads an entirely new logo (a different `storeLogoPath`, a different `url`) — `imgFailed` still gates the render before either `path` or `url` is even consulted. A kiosk-style Tauri login screen that stays mounted unattended for extended periods (its designed use case) is exactly the scenario this breaks.

**Fix:** Reset `imgFailed` whenever the resolved image source changes:
```tsx
const [imgFailed, setImgFailed] = useState(false);
useEffect(() => {
  setImgFailed(false);
}, [url]);
```
(Same latent pattern exists in `GeneralSettingsTab.tsx`'s own `imgFailed` state, but it's mitigated there because every user-initiated mutation — upload, remove — explicitly calls `setImgFailed(false)`; `StoreLogoImage` has no equivalent user action to key off, so it needs the `useEffect`.)

## Warnings

### WR-01: Newly-uploaded logo object is silently orphaned (unlogged) when the link write fails

**Fix status:** fixed — commit `828e1e5` — on link failure, `useStoreLogoUpload.ts` now attempts to remove the just-uploaded object and logs it as an orphan if that cleanup also fails.

**File:** `src/entities/settings/model/useStoreLogoUpload.ts:83-107`

**Issue:** The upload sequence is: upload new object → read cached snapshot → write `storeLogoPath` (link step) → delete old object. The *old* object's delete failure is deliberately orphan-tolerant and logged (`logger.warn('settings.store_logo.old_object_orphaned', ...)`). But if the **link step** itself fails (`current` is `null`, or `updateSetting.mutateAsync` errors), the function returns the error immediately — the just-uploaded *new* object is left in Storage, unlinked, with no cleanup attempt and no `logger.warn` marking it as an orphan (only `logger.error` for the link failure itself, which doesn't mention the orphaned object).

**Fix:** On link failure, either attempt to remove the just-uploaded object before returning, or at minimum log it as an orphan the same way the old-object path does:
```ts
if (!linkResult.ok) {
  logger.error('settings.store_logo.link_failed', { message: linkResult.error.message, path });
  const { error: cleanupError } = await supabase.storage.from(STORE_BRANDING_BUCKET).remove([path]);
  if (cleanupError) {
    logger.warn('settings.store_logo.unlinked_object_orphaned', { path, message: cleanupError.message });
  }
  return err(photoLinkFailedError(linkResult.error.message, linkResult.error));
}
```

### WR-02: Client-side `MAX_LOGO_UPLOAD_BYTES` (10MB) is 5x the server-side Storage backstop (2MB)

**Fix status:** fixed — commit `242f7cb` — `MAX_LOGO_UPLOAD_BYTES` lowered to 2MB to match the bucket's server-side `file_size_limit`. Follow-up commit `577e349` also corrected the now-stale "10 MB" copy in `logoHint`/`logoErrorTooLarge` (both locales) to "2 MB".

**File:** `src/entities/settings/model/store-logo-file.ts:39`, `supabase/migrations/20260911000002_store_branding_storage.sql:27`

**Issue:** `validateStoreLogoFile` accepts any file up to `10 * 1024 * 1024` bytes before resizing; the `store-branding` bucket's `file_size_limit` is `2097152` (2MB). The resize pipeline (800px max edge, WebP q0.8) makes an overage unlikely in practice, but it isn't guaranteed for all inputs, and when it does happen the admin sees only a generic `PHOTO_UPLOAD_FAILED`/`logoErrorUpload` message after a full decode+resize round-trip, not an upfront "still too large" rejection. The two limits should agree, or the client should re-check the *resized* blob's size against the server limit before uploading.

**Fix:** Lower `MAX_LOGO_UPLOAD_BYTES` to match (or stay safely under) 2MB, or add a post-resize size check in `resizeStoreLogo`/`useStoreLogoUpload` that returns a clear "still too large" error instead of relying on the Storage upload call to reject it.

### WR-03: Unmapped `AppErrorCode`s surface raw, untranslated `error.message` to the admin

**Fix status:** fixed — commit `577e349` — `logoErrorCopyFor`'s `default` branch now returns a new translated `logoErrorGeneric` key (added to both `es-MX`/`en-US` `wAdmin.json`) instead of `error.message`.

**File:** `src/widgets/SettingsTabsPanel/tabs/GeneralSettingsTab.tsx:114-133`

**Issue:** `logoErrorCopyFor`'s `default` branch returns `error.message` verbatim for any `AppErrorCode` not explicitly enumerated (e.g. `SUPABASE_ERROR`, `UNKNOWN_ERROR` bubbling out of `signStoreLogo`/the upload call). That message is developer/log-facing text (English, not run through i18n), inconsistent with the rest of this project's strict i18n enforcement (`i18next/no-literal-string: error` on this exact layer).

**Fix:** Add a translated generic fallback (e.g. `t('generalSettingsTab.logoErrorGeneric')`) as the `default` case instead of surfacing `error.message` directly to the UI.

## Info

### IN-01: `store_branding_select` policy permits anonymous listing of every object in the bucket, including orphans

**Fix status:** out of scope for this fix pass (fix_scope: critical_warning) — not fixed. Noted by the review as a future-cleanup item, not a blocker.

**File:** `supabase/migrations/20260911000002_store_branding_storage.sql:36-41`

**Issue:** The SELECT policy predicate is `bucket_id = 'store-branding'` only (no path/owner scoping), which is the intended Option-B widening for the singleton logo — not a cross-bucket leak, and every object in this single-purpose bucket is non-sensitive branding imagery by design, so this isn't a vulnerability. It does mean any orphaned objects left behind by WR-01 (or the pre-existing "old object orphaned" path) remain anonymously listable/signable indefinitely since nothing purges them. Worth a note for a future cleanup job, not a blocker.

---

_Reviewed: 2026-09-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
