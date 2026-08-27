# Stack Research

**Domain:** Receipt template designer (ESC/POS thermal) + Purchase Order workflow + Inventory analytics/reporting, added to an existing Tauri 2 + React 19 + Supabase supermarket POS
**Researched:** 2026-08-19
**Confidence:** HIGH (verified against installed `package.json`/`Cargo.toml` and current source, not greenfield guessing)

## Headline Finding

**Almost nothing new needs installing.** This milestone is data modeling (Postgres tables/views) and UI composed from libraries already in the repo (`recharts`, `@react-pdf/renderer`, `xlsx`, `zod`, TanStack Query, shadcn). The only genuine gap is on the **Rust side of receipt printing**: the current ESC/POS encoder (`src-tauri/src/commands/printer.rs`) only accepts a flat `Vec<String>` of pre-formatted lines with one hardcoded bold+centered first line — it has no per-line alignment/bold/size control and no bit-image (logo) support. A real "receipt designer" requires extending that Rust command, not adding an npm package.

## Recommended Stack

### Core Technologies (all already installed — reuse, don't replace)

| Technology | Version (pinned) | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Postgres (Supabase) JSONB column + Zod schema | n/a (Postgres 15+, `zod ^4.3.6`) | Store the receipt template as structured, versioned config | `receipt_settings` is already a migration-tracked, RLS-protected singleton table (v1.1). Add a `template` JSONB column validated by a new Zod schema (`ReceiptTemplateSchema` in `domain.ts`) instead of inventing a second config store. |
| Rust hand-rolled ESC/POS byte builder (`printer.rs`) | n/a | Encode the template into ESC/POS commands sent to the thermal printer | Already working, already the sole path to the Windows printer via raw `WritePrinter`. Extend `lines_to_esc_pos` to take structured elements (`{text, align, bold, doubleSize}`) instead of `Vec<String>` — this is ~30 lines of additional byte constants (`ESC a`, `ESC E`, `GS !`), not a new dependency. |
| `recharts` | `^3.8.1` (installed) | Turnover/valuation trend charts, shrinkage-by-category bars | Already the project's charting library (used in existing Reports tabs). Reuse for the new analytics tabs — do not introduce a second charting library. |
| `@react-pdf/renderer` | `^4.5.1` (installed) | Printable PDF versions of PO documents (email to supplier) and inventory reports | Already used for email receipts/exports. A PO is structurally the same kind of "generate a printable document" problem — reuse the existing renderer and component patterns instead of a new PDF library. |
| `xlsx` (SheetJS, official npm package) | `^0.18.5` (installed) | Export valuation/turnover/shrinkage report tables | Already used for report export (`shared/lib/exporters`). Note: this is the official `xlsx` package from SheetJS's own CDN-redirected npm listing, not the unmaintained/malicious-adjacent `xlsx-style` fork — safe to keep using as-is. |
| TanStack Query v5 + Zustand v5 (installed) | `^5.99.0` / `^5.0.12` | PO list/detail server state, draft-PO local edit state | Same server-state/local-state split used everywhere else in the codebase (`entities/*/model/queries.ts` + `store.ts`). No new state library needed for a CRUD-plus-status-workflow feature. |

### New Additions (the only genuinely new pieces)

| Addition | Where | Purpose | Why |
|----------|-------|---------|-----|
| `ReceiptTemplateSchema` (Zod) | `src/shared/lib/domain.ts` | Typed, validated shape for the template: ordered array of elements (`{type: 'text'|'divider'|'logo'|'spacer'|'field'}`, each with `align`, `bold`, `doubleSize`) | Matches the existing "Zod is the single source of truth for domain types" convention (CLAUDE.md). No template-engine library (Handlebars, Mustache) needed — the receipt has a fixed, small vocabulary of element types, not arbitrary logic. |
| Structured printer command (`print_receipt` payload) | `src-tauri/src/commands/printer.rs` | Accept `Vec<PrintElement>` instead of `Vec<String>`, each element serialized from the same template shape | Keeps the existing "TS builds content, Rust encodes bytes" split (documented in `printer.rs`'s own header comment) — just makes the content structured instead of flat strings. |
| `image` crate (Rust) | `src-tauri/Cargo.toml` | Decode the uploaded logo (`logoDataUrl`, already captured by the existing `upload-logo` feature but currently only consumed by the PDF/email receipt path — **not yet printed on the thermal receipt**) into a 1-bit raster for ESC/POS `GS v 0` bit-image printing | `image = "0.25"` (current, verified via crates.io). Decode + resize + grayscale + a ~15-line manual threshold dither is enough — do **not** add a separate dithering crate (`dither`, `bayer`) for one-shot logo conversion; that's over-engineering for a single small monochrome image printed on a receipt. |
| Postgres tables: `purchase_orders`, `purchase_order_items` | new migration | PO header (supplier, status, dates, totals) + line items (product, qty ordered, qty received, unit cost) | Same raw-SQL-migration + RLS convention as every other table in this repo (see `suppliers`/`shipments` from Phase 3). No ORM change — this project already uses hand-written SQL migrations + generated `supabase.types.ts`, not Drizzle/Prisma migrations (Drizzle is present in `package.json` but only for its `drizzle-orm` runtime types/query builder pattern already established elsewhere in the codebase — confirm existing usage before assuming it drives PO schema; if unused for schema authorship elsewhere, don't introduce it here either). |
| Postgres `CHECK` constraint or enum for PO status | same migration | Enforce valid status transitions (`draft → sent → partially_received → received`, plus `cancelled` from `draft`/`sent`) | A DB-level `CHECK`/enum is the correct layer for this, matching the project's existing pattern of enforcing invariants in Postgres (e.g., the v1.1 `receipt_settings` singleton constraint). **Do not add a client-side state-machine library** (`xstate`, `@xstate/react`) for a 4-state linear workflow — that's solving a one-paragraph problem with a framework. |
| Postgres views (not materialized) for reporting aggregates | new migration | `inventory_valuation`, `stock_turnover`, `expiry_loss` computed from existing `inventory`/`inventory_log`/`products`/`shipments` tables | Single store, small dataset (per PROJECT.md: 1-2 terminals) — a plain `CREATE VIEW` computed on read is enough. Do not reach for a materialized view + refresh trigger/cron, or an external analytics/OLAP tool (dbt, Metabase) — that's infrastructure for a scale this project explicitly doesn't have. |

## Installation

```bash
# npm: nothing new required for PO or reporting.
# The only optional npm addition (see "Conditional" below):
npm install @dnd-kit/core @dnd-kit/sortable   # ONLY if drag-to-reorder template elements is a hard UX requirement

# Rust (src-tauri/Cargo.toml):
cargo add image   # for logo bit-image printing (0.25.x)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Zod-typed JSONB template config | A full drag-drop page-builder library (GrapesJS, Craft.js, react-page) | Never for this project — single admin user, fixed 32-column monochrome thermal output, not a general document editor. A page-builder is solving a problem (arbitrary layouts, multiple output formats) this project doesn't have. |
| Up/down move buttons for template element ordering | `@dnd-kit/core` + `@dnd-kit/sortable` (`^6.3.1`, current, actively maintained fork replacing the deprecated `react-beautiful-dnd`) | Only if the owner genuinely needs drag-and-drop reordering of receipt sections in the UI. For a short, fixed list of ~6-8 element types (header, address, items, subtotal, total, payment, footer), numbered up/down buttons are one `<Button>` handler each — no library needed. Reach for `dnd-kit` only if user testing shows buttons are unusable, not preemptively. |
| Hand-rolled Rust ESC/POS byte constants (extend existing `printer.rs`) | A Rust ESC/POS crate (`escpos`, `esc-pos-encoder-rs`) | Only if this project ever needs to support multiple printer *brands/protocols* (e.g., Star vs. Epson command sets) or network/Bluetooth printers. Right now it targets one printer type via Windows raw `WritePrinter`, and the existing hand-rolled encoder already works — a crate would add an abstraction layer around functionality that's ~10 more constants to hand-write. |
| Plain Postgres `CREATE VIEW` for reporting | Materialized views, dbt, or a separate analytics DB/warehouse | Only if report queries become slow at real scale (this store: single location, bounded product catalog) or if reports need to run against historical snapshots that don't reconstruct cleanly from `inventory_log`. Revisit only if a specific view is measured to be slow. |
| Postgres `CHECK`/enum for PO status transitions | `xstate` / `@xstate/react` | Only if the PO workflow grows branching, guarded, or async-triggered transitions (e.g., auto-transitions on webhook events) — a 4-5 state linear-ish workflow with a couple of terminal states doesn't need a state-machine library. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| A second charting library (Chart.js, Nivo, Victory) for the new inventory reports | `recharts` is already installed and used throughout Reports — a second charting lib means two chart theming systems, two bundle-size costs, inconsistent look between old and new report tabs | `recharts` (already installed) |
| A dedicated PO/e-procurement npm package or template (there is no such standard package — this is a check to *not* go looking for one) | PO is domain-specific business logic (supplier, line items, status, totals) that belongs in this project's own Postgres schema + Zod types, matching how every other entity (`suppliers`, `shipments`) is modeled here | Hand-written migration + `entities/purchase-order/` following the existing FSD entity pattern |
| A Rust ESC/POS crate that owns the full print pipeline (bypassing the existing Windows `WritePrinter` raw-mode path) | Would require re-plumbing the already-working, tested Windows printing path (`win_print::send_raw`) for no functional gain — the gap is *content structure*, not byte encoding capability | Extend the existing hand-rolled `lines_to_esc_pos`/`try_send_raw` path |
| Client-side image dithering library (`dither`, `bayer`, `image-q`) in the TypeScript logo-upload path | Bit-image conversion should happen once, at print time, in Rust (where the byte-level printer protocol already lives) — doing it in the browser/TS layer means shipping pixel data across the Tauri IPC boundary for no reason, and duplicates logic if the PDF/email receipt path ever needs different image handling | `image` crate in Rust, invoked from `print_receipt`/a new `print_logo`-aware path |
| `xstate` for PO status | Four-ish linear states with a cancel branch is not a state-machine problem — it's a DB `CHECK` constraint plus a `switch` in the status-transition RPC (same pattern as `receive_shipment`'s atomic RPC) | Postgres `CHECK`/enum + a `transition_purchase_order_status` RPC mirroring existing atomic-RPC conventions |
| Materialized views / a BI tool for reporting | Single-store, bounded data volume — premature infrastructure per the project's own "scope discipline" constraint (PROJECT.md: "do not add speculative inventory machinery") | Plain `CREATE VIEW` / on-demand aggregate queries |

## Stack Patterns by Variant

**If the receipt designer needs live print preview matching the *actual* thermal output (not just an approximation):**
- Reuse the existing `<pre>`-based monospace preview pattern already in `pos-printer.ts`'s web fallback and `ReceiptPreview.tsx` — render the template through the same element-to-text logic that feeds the Rust encoder, so preview and print can't drift.
- Do not add a canvas-based ESC/POS simulator library — the receipt is plain monospace text plus a few format flags, not pixel-perfect rendering.

**If logo printing on the thermal receipt is deferred (branding customization scoped to text/layout only for this milestone):**
- Skip the `image` crate addition entirely for now; `logoDataUrl` continues to serve only the PDF/email receipt path as it does today. Revisit when/if thermal logo printing is explicitly requested.

**If PO needs to support partial receiving against a single PO (receive shipment in multiple deliveries):**
- Model `purchase_order_items.qty_received` as a running total updated by the same RPC pattern `receive_shipment` already uses, with PO status auto-transitioning to `partially_received`/`received` based on `qty_received` vs `qty_ordered` inside that RPC — no new library, just extending the existing atomic-RPC convention.

## Version Compatibility

| Package/Crate | Compatible With | Notes |
|-----------|-----------------|-------|
| `image = "0.25.10"` | Rust toolchain ≥ 1.88.0, `tauri` v2, existing `src-tauri/Cargo.toml` | Verify the project's current Rust MSRV before pinning; if the toolchain is older, use `image = "0.24"` instead (still receives maintenance). |
| `@dnd-kit/core` / `@dnd-kit/sortable` `^6.3.1` (only if adopted) | React 19 | Last published ~2 years ago but is the stable, unmaintained-but-not-abandoned successor generation to `react-beautiful-dnd` (which is formally deprecated); confirmed working with React 19 concurrent rendering in current community usage. Do not use `react-beautiful-dnd` — it is deprecated and has known React 18+/StrictMode issues. |
| Postgres JSONB template column | Existing Supabase Postgres 15+, existing `zod ^4.3.6` schema-as-source-of-truth convention | No migration-tooling change; follow the same raw SQL migration + `supabase gen types` regeneration flow already documented in `CLAUDE.md`. |

## Sources

- Direct inspection of installed `package.json` (dependencies/devDependencies) — HIGH confidence, ground truth.
- Direct inspection of `src/shared/lib/pos-printer.ts`, `src/shared/lib/receipt-format.ts`, `src-tauri/src/commands/printer.rs` — HIGH confidence, ground truth on current ESC/POS capability (flat string lines only, one hardcoded bold/center first line, no bit-image/logo support on the thermal path).
- Direct inspection of `src/features/upload-logo/` and `src/entities/settings/model/queries.ts` — HIGH confidence: `logoDataUrl` already exists in `receipt_settings` but is not yet wired into thermal printing.
- Migration directory scan (`supabase/migrations/`) — HIGH confidence: no `purchase_order*` tables exist yet; PO is genuinely new schema, confirming this is greenfield modeling work within an established migration convention.
- [crates.io: image](https://crates.io/crates/image) — current version 0.25.10, verified 2026-08-19.
- [npmjs.com: @dnd-kit/core](https://www.npmjs.com/package/@dnd-kit/core) — current version 6.3.1, verified 2026-08-19, noted as last published ~2 years ago (mature/stable, not a freshness concern for a small, well-scoped optional addition).
- `.planning/PROJECT.md` — milestone scope, explicit "Out of Scope" (no FIFO/FEFO, no multi-warehouse, no auto-PO, no forecasting) and "scope discipline" constraint, used to justify several "what NOT to use" entries above.

---
*Stack research for: Receipt Designer + Purchase Orders + Inventory Analytics (v1.3 milestone)*
*Researched: 2026-08-19*
