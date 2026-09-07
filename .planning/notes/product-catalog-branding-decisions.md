---
title: Product catalog & store branding exploration decisions
date: 2026-09-07
context: GSD exploration of 3 feature asks — product detail/photo dialog, brand/weight catalog attributes, login screen branding (Phases 31-33)
---

# Product Catalog & Store Branding Decisions

## Decisions

- **Product dialog shape (Phase 31, PCAT-01):** reshape the *existing* product add/edit dialog into
  a larger, tabbed/sectioned view+edit+photo layout. Not a new read-only layer in front of the
  existing dialog — one dialog, more capable.
- **Naming collision avoided:** Phase 18's "Barcode Scan Product Peek Window" (`PEEK-01..04`,
  already shipped) is a *different* feature — a separate Tauri OS window that pops up when scanning
  a barcode at checkout, letting a cashier inspect before adding to cart. Phase 31 is admin-side
  (Inventory → Catalog), unrelated code path. Deliberately did not reuse the word "peek" for Phase
  31 to keep the two apart.
- **Photo count (PCAT-03):** one photo per product, replace-on-upload. Not a gallery — simpler
  bucket/RLS, simpler UI, no ordering/multi-delete concerns.
- **Photo storage:** new Supabase Storage bucket, `products.photo_url` column. Codebase check
  confirmed zero existing `supabase.storage` usage anywhere in `src/` — this is a new integration,
  not an extension of one.
- **Brand (Phase 32, BRND-01/02):** full entity — new `brands` table with its own CRUD dialog
  (same pattern as existing Categories management), not a freeform text field on Product. Product
  picks a brand via dropdown.
- **Weight (Phase 32, BRND-03):** a *catalog/display* attribute (`weight_amount` numeric +
  `weight_unit` enum g/kg/lb/oz) describing pack size printed on packaging (e.g. "500 g", "1 kg").
  Explicitly independent of and does not replace the existing loose-weight-at-checkout / open-unit
  (case→piece) system — that system is about *selling* by weight; this is about *describing* a
  product's fixed pack size for browsing/filtering.
- **Login branding (Phase 33, STORE-01):** dedicated new `storeName` + `storeLogoUrl` fields
  (Supabase Storage upload, same pattern as Phase 31's product photo) — *not* a reuse of the
  existing `ReceiptSettingsSchema.logoDataUrl`/`headerLine2` fields. Reasoning: the receipt logo is
  a small base64 data URL sized for thermal-printer resolution and would look rough blown up large
  on a login screen; no store-name concept exists anywhere else in the app today (app title is the
  generic "Supermarket POS").

## Scope boundaries confirmed by codebase check

- No `unit_type`/`weight_unit`/`weight_amount` fields exist in `domain.ts` today (obs 8840/8841).
- No `supabase.storage` calls exist anywhere in `src/` today — Phase 31/33 are the first Storage
  usage in this codebase.
- No `storeName`/store-branding config exists anywhere; `index.html` title is the generic
  "Supermarket POS".

## Open for discuss-phase / plan-phase

- Exact dialog tab/section layout for the reshaped product dialog.
- Storage bucket naming convention, image size/format/dimension limits, and whether product photos
  need thumbnailing.
- Brand logo (if any) — BRND-01 leaves brand logo optional/undecided; not required for filtering to
  work.
