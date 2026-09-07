# API Coverage — Supabase Storage (`@supabase/supabase-js` ^2.103.0, `storage-js`)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Surface enumerated from the installed package source
> (`node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts` and
> `StorageBucketApi.ts`), per 31-RESEARCH.md § Standard Stack.
> Detector: `api-coverage.cjs --json` → `detected: true` (signals: `api`, `sdk`).

## `StorageFileApi` — `supabase.storage.from('product-photos')`

| capability | decision | reason |
|---|---|---|
| `upload` | INTEGRATE | |
| `createSignedUrl` | INTEGRATE | |
| `createSignedUrls` | INTEGRATE | |
| `remove` | INTEGRATE | |
| `update` | OPT-OUT | replace writes a NEW uuid key then deletes the old one (CONTEXT.md Claude's Discretion) — overwriting the same key lets a cached signed URL serve stale bytes |
| `move` | OPT-OUT | object paths are immutable once written; a replace is new-key-then-delete, never a rename |
| `copy` | OPT-OUT | PCAT-03 locks one photo per product — no duplication flow exists to serve |
| `list` | OPT-OUT (app code) | `products.photo_path` is the index of record; a per-product lookup never needs a bucket listing. Used only from the E2E service client as ground truth (31-01 Task 3, 31-04 Task 3 assert exactly one object under `products/{productId}/` after a replace) — never from `src/`. |
| `download` | OPT-OUT | the browser fetches bytes itself through the signed URL in `<img src>`; no in-app byte access is needed |
| `info` | OPT-OUT | the column is the source of truth; a missing object degrades to the `photo.errorLoad` state (31-UI-SPEC.md) |
| `exists` | OPT-OUT | same as `info` — existence is inferred from the render outcome, not pre-checked on every read |
| `getPublicUrl` | OPT-OUT | the bucket is private (D-15); a public URL would not resolve |
| `createSignedUploadUrl` | OPT-OUT | pre-signed upload URLs exist for untrusted/server-brokered uploads; this phase uploads directly from an authenticated client under `storage.objects` RLS |
| `uploadToSignedUrl` | OPT-OUT | counterpart of `createSignedUploadUrl` — same reason |

## `StorageBucketApi` — `supabase.storage`

| capability | decision | reason |
|---|---|---|
| `getBucket` | INTEGRATE | used by the E2E gate to assert bucket visibility / size limit / MIME allow-list, and as the pre-migration existence check for 31-RESEARCH.md Open Question 2 |
| `createBucket` | OPT-OUT | the renderer only ever holds an anon key (CLAUDE.md forbids a service-role key in the renderer); the bucket ships as a SQL migration instead |
| `listBuckets` | OPT-OUT | bucket lifecycle is owned by migrations, not the app |
| `updateBucket` | OPT-OUT | bucket lifecycle is owned by migrations, not the app |
| `emptyBucket` | OPT-OUT | destructive bulk operation with no product surface; per-object `remove` covers D-12 |
| `deleteBucket` | OPT-OUT | bucket lifecycle is owned by migrations, not the app |
