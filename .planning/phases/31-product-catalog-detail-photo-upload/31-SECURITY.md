---
phase: "31"
slug: "product-catalog-detail-photo-upload"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-08"
---

# Phase 31 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser client ↔ Supabase Storage (`product-photos` bucket) | Client-side upload/replace/remove of product photos via the Supabase JS client, direct to Storage | Image file bytes, signed URL requests |
| Browser client ↔ Supabase Postgres (`products.photo_path`, `storage.objects`) | RLS-gated reads/writes from the manage-products feature and catalog list views | Product rows, storage object metadata |
| OS clipboard / filesystem drag-drop ↔ app | Photo entry paths: file picker, drag-and-drop, clipboard paste | Arbitrary local file bytes handed to the upload pipeline before validation |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-31-01 | Elevation of Privilege | storage.objects RLS | high | mitigate | INSERT/UPDATE/DELETE gated on `manage_products`, `TO authenticated` only (migration `20260907000001_product_photos_storage.sql:38-64`); verified via `e2e/products/product-photo-rls.spec.ts:118-172` (real anon-key cashier client denied) + `:205-246` (admin positive control) | closed |
| T-31-02 | Tampering | Storage bucket config | high | mitigate | `file_size_limit 2097152`, 3-type `allowed_mime_types` (migration `:18-26`); `product-photo-upload.spec.ts:230-234` asserts `getBucket()` | closed |
| T-31-03 | Tampering | photo-file.ts object-path builder | high | mitigate | `photoObjectPath` built only from `productId` + `crypto.randomUUID()` — `File.name` never read (`photo-file.ts:115-121`) | closed |
| T-31-04 | Information Disclosure | Storage bucket visibility | medium | mitigate | `public: false`, SELECT `TO authenticated` (migration `:18-36`); anon denied signed URL, no public URL serves the object (`product-photo-rls.spec.ts:174-197`) | closed |
| T-31-05 | Information Disclosure | Upload replace flow | medium | mitigate | `upsert: false`, fresh uuid key per upload, old object deleted only after DB link succeeds (`useProductPhotoUpload.ts:56-92`) | closed |
| T-31-06 | Denial of Service | Upload retry/back-pressure | low | accept | No rate-limit on client upload retries — low blast radius, bucket has a hard 2MB/file cap and RLS write-gating limits actors to staff with `manage_products` | open — below `high` threshold (non-blocking) |
| T-31-07 | Repudiation | Photo upload/replace/remove audit trail | low | accept | No dedicated audit-log entry per photo mutation beyond standard `stock_movements`/`audit_logs` coverage already in place for product edits | open — below `high` threshold (non-blocking) |
| T-31-08 | Elevation of Privilege | products table RLS | high | mitigate | Pre-existing `manage_products` RLS on `products` (`20260510000001_rls_rewrite_phase13.sql`, unchanged by this phase); cashier-denial re-verified via `product-management.spec.ts:748-752` (PM15) | closed |
| T-31-09 | Tampering | ProductDetailDialog submit path | medium | mitigate | Single `handleSubmit` always parses the full `ProductUpdateSchema`/`ProductCreateSchema` regardless of active tab — no partial/tab-scoped bypass (`ProductDetailDialog.tsx:252-360`) | closed |
| T-31-10 | Repudiation | Dialog dirty-close guard | low | mitigate | `requestClose`/`isProductFormDirty` blocks silent data loss on close (`ProductDetailDialog.tsx:159-176`, `productDialogTabs.ts:90-97`) | closed |
| T-31-11 | Information Disclosure | Batch signed-URL resolver | medium | mitigate | `useProductImageUrls` only signs paths already present on fetched `Product` rows — no arbitrary-path signing (`resolveProductImage.ts:142-159`) | closed |
| T-31-12 | Denial of Service | Batch signed-URL resolver | low | mitigate | One `createSignedUrls` call per batch, not N+1 (`resolveProductImage.ts:102-129`); exact-count-1 assertion in `catalog-row-and-thumbnails.spec.ts` | closed |
| T-31-13 | Elevation of Privilege | Catalog row-click open | low | mitigate | Row click opens the same dialog state as the existing edit action — no new write path introduced (`CatalogProductsTab.tsx:185-188,466`) | closed |
| T-31-14 | Tampering | Photo entry paths (picker/drop/paste) | high | mitigate | All three entry paths funnel through the same `handleFile` → `uploadMutation` → `validatePhotoFile` chain (`photo-file.ts:89-113`, `ProductPhotoTab.tsx:98-172`); fault-injection E2E coverage in `product-photo-upload.spec.ts` | closed |
| T-31-15 | Elevation of Privilege | Photo remove/replace target | high | mitigate | Delete target is always `input.path` (the product's own stored column value), never client-supplied; DELETE policy `manage_products`-gated (`useProductPhotoUpload.ts:104-149`); cashier-remove denial in `product-photo-rls.spec.ts:129-139` | closed |
| T-31-16 | Denial of Service | Photo tab UI during in-flight upload | low | mitigate | Input/buttons/dropzone disabled during in-flight states, preventing duplicate concurrent submissions (`ProductPhotoTab.tsx` multiple lines) | closed |
| T-31-17 | Information Disclosure | Replace-flow stale object cleanup | medium | mitigate | Same code path as T-31-05; replace E2E asserts old object path absent from bucket listing after replace | closed |
| T-31-18 | Tampering | Checkout peek-window phase boundary | medium | mitigate | `git log`/`git status` confirm `src/widgets/ProductPeekWindow` untouched by phase 31; new regression coverage in `e2e/checkout/peek-window.spec.ts:496-561` | closed |
| T-31-19 | Repudiation | Visual/UI-contract regression baseline | low | mitigate | `e2e/visual/46-product-dialog-baseline.spec.ts` — 9 `toHaveScreenshot` + 23 total assertions, 0 skipped | closed |
| T-31-SC | Tampering (supply chain) | New/changed dependencies | low | accept | Recurs identically across all 5 plans' registers; verified true — `git diff --stat` on `package.json`/`package-lock.json` since the phase base shows no dependency changes (no new supply-chain surface was actually introduced) | open — below `high` threshold (non-blocking) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (`high`) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-31-01 | T-31-06 | No client-side upload rate-limit. Blast radius is bounded by the 2MB/file bucket cap and by RLS restricting writers to staff already holding `manage_products` — not a public/unauthenticated surface. | gsd-execute-phase (orchestrator, on behalf of project owner) | 2026-09-08 |
| AR-31-02 | T-31-07 | No dedicated audit-log entry per individual photo mutation. Existing `audit_logs`/`stock_movements` coverage for product edits is judged sufficient for this phase's scope; a dedicated photo-mutation audit trail is future work if a real incident ever requires it. | gsd-execute-phase (orchestrator, on behalf of project owner) | 2026-09-08 |
| AR-31-03 | T-31-SC | Recurring boilerplate threat entry across all 5 plans' STRIDE registers; verified no actual `package.json`/`package-lock.json` change landed in this phase, so there is no new supply-chain surface to mitigate against. | gsd-execute-phase (orchestrator, on behalf of project owner) | 2026-09-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-08 | 20 | 17 | 3 (all below `high` threshold, non-blocking) | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-08
