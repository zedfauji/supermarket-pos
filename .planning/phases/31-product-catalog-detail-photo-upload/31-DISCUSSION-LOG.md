# Phase 31: Product Catalog Detail & Photo Upload - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 31-product-catalog-detail-photo-upload
**Areas discussed:** Dialog layout & shape, Photo capture & processing, Storage model & existing `image_url`, What "full detail" shows

---

## Dialog Layout & Shape

### Q1 — How should the reshaped product dialog be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Two-column, no tabs | Photo + key identity left, grouped sections right, one scroll. Smallest diff from today's flat form. | |
| Horizontal tabs | `shared/ui/tabs.tsx`, as used by InventoryPagePanel's 5-tab hub. | |
| Vertical tabs (sidebar) | `shared/ui/vertical-tabs.tsx`, the SettingsTabsPanel pattern — nav rail left, panel right. | ✓ |

**User's choice:** Vertical tabs (sidebar) → D-01
**Notes:** Chosen over the recommended lighter option; scales best for Phase 32's brand/weight additions.

### Q2 — What tabs should the sidebar have?

| Option | Description | Selected |
|--------|-------------|----------|
| Details / Photo / Links | Everyday-edit fields in Details; relational fields quarantined in Links. | ✓ |
| Details / Pricing & Packaging / Photo / Links | Four tabs; splits price + packaging out of Details. | |
| Details / Photo only | Two tabs; everything else stays in one long panel. | |

**User's choice:** Details / Photo / Links → D-02
**Notes:** Matched the recommendation; leaves an obvious slot in Details for Phase 32.

### Q3 — Does creating a new product use the same reshaped dialog?

| Option | Description | Selected |
|--------|-------------|----------|
| Same dialog, Photo tab locked until saved | One component for create+edit; Photo disabled until a product id exists. | ✓ |
| Same dialog, upload allowed on create | Needs a client-generated UUID or temp path + orphan cleanup. | |
| Create keeps today's compact form | Only edit gets the reshape; two divergent forms to maintain. | |

**User's choice:** Same dialog, Photo tab locked until saved → D-03
**Notes:** Carries forward Phase 28 D-10 (one shared create+edit component).

### Q4 — What opens the dialog from the Catalog table?

| Option | Description | Selected |
|--------|-------------|----------|
| Whole row opens it; Edit button goes away | Fewest controls; matches PCAT-01's wording literally. | |
| Whole row opens it; keep Edit and Delete buttons | Nothing removed; zero regression risk for muscle memory and E2E selectors. | ✓ |
| Only the product name cell is clickable | Safest against accidental touch opens; smaller target. | |

**User's choice:** Whole row opens it; keep Edit and Delete buttons → D-04
**Notes:** Chose regression safety over control-count cleanup.

### Q5 — Where do Save/Cancel live, and what do they cover?

| Option | Description | Selected |
|--------|-------------|----------|
| One footer, saves all tabs | Single ProductUpdate payload; tab split stays visual. Photo commits on upload. | ✓ |
| One footer, but photo also waits for Save | Most consistent mental model; slower save, rollback complexity. | |
| Per-tab save | Three save paths; product can end up half-updated. | |

**User's choice:** One footer, saves all tabs → D-05

### Q6 — Save pressed while a field on a hidden tab is invalid?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-switch to the offending tab + badge | Jumps to the first tab with an error; sidebar badge; FormField error. | ✓ |
| Badge only, don't move | Less jarring; one more step to the broken field. | |
| Block the save with a summary message | Simplest; weakest signal on a touch screen. | |

**User's choice:** Auto-switch to the offending tab + badge → D-06
**Notes:** Directly motivated by the two silent-validation-failure incidents documented in `ProductForm.tsx` itself.

### Q7 — Dialog closed with unsaved edits?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm before discarding | Dirty check → ConfirmDialog; tab switching stays free. | ✓ |
| Close immediately, no prompt | Today's behavior; consistent with every other dialog. | |
| Block outside-click, prompt only on X/Esc | Hardest to dismiss accidentally; breaks the app-wide dismissal pattern. | |

**User's choice:** Confirm before discarding → D-07

### Q8 — Dialog size and narrow-screen behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| max-w-4xl, fixed height, panel scrolls | ~80vh; sidebar+footer pinned; rail collapses below `lg`. | ✓ |
| Near-fullscreen (90vw × 90vh) | Maximum room; reads as a page rather than a modal. | |
| Keep max-w-2xl | Least disruption; cramped with a sidebar rail. | |

**User's choice:** max-w-4xl, fixed height, panel scrolls → D-08

---

## Photo Capture & Processing

### Q9 — How does a photo get into the Photo tab?

| Option | Description | Selected |
|--------|-------------|----------|
| File picker + drag-and-drop | Covers the realistic workflow; mirrors agent-chat's file-drop surface. | |
| File picker only | Smallest surface to build and E2E-test. | |
| Also paste from clipboard | Picker + drop + Ctrl+V; fast for copied supplier images; new code path. | ✓ |

**User's choice:** Also paste from clipboard → D-09
**Notes:** Took the broadest input surface over the recommended pair.

### Q10 — What happens to the file before upload?

| Option | Description | Selected |
|--------|-------------|----------|
| Downscale + re-encode client-side | ~1200px max edge, ~80% quality, one stored size. | ✓ |
| Downscale + a separate thumbnail | Two objects per product to keep in sync. | |
| Upload the original untouched | Simplest; multi-MB originals slow the catalog. | |

**User's choice:** Downscale + re-encode client-side → D-10

### Q11 — Accepted formats and hard ceiling?

| Option | Description | Selected |
|--------|-------------|----------|
| JPEG/PNG/WebP in, 10 MB pre-resize cap | Tight bucket-level file-size limit as a server-side backstop. | ✓ |
| Add HEIC/HEIF | iPhone-native, but needs a decoder or server-side convert. | |
| Any image/*, 25 MB cap | Permissive; SVG becomes an upload vector. | |

**User's choice:** JPEG/PNG/WebP in, 10 MB pre-resize cap → D-11

### Q12 — Can a photo be removed, and what shows when there isn't one?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove button; deletes object + clears column | Same manage_products gate; empty state is a drop zone with placeholder. | ✓ |
| Clear the reference, keep the object | Non-destructive; accumulates unreferenced objects. | |
| Replace-only, no remove | Strictly PCAT-03; no path back to "no photo". | |

**User's choice:** Remove button; deletes object + clears column → D-12

---

## Storage Model & Existing `image_url`

*Context surfaced during scouting: `products.image_url` already exists as a free-text URL field and is read by tab/inventory/open-unit/purchase-order queries — a fact the `/gsd-explore` note had missed.*

### Q13 — New column or reuse `image_url`?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse image_url, drop the free-text input | Every existing consumer shows new photos for free; no second image column. | |
| New photo_url column, keep image_url | Clean separation of managed upload vs. arbitrary URL; needs a fallback at read sites. | ✓ |
| New photo_url, migrate and retire image_url | Cleanest end state; biggest migration in a repo with no DOWN scripts. | |

**User's choice:** New photo_url column, keep image_url → D-13
**Notes:** Took isolation over the cheaper reuse path.

### Q14 — What do the other consumers render?

| Option | Description | Selected |
|--------|-------------|----------|
| photo_url ?? image_url everywhere | One shared resolver; precedence answered in one place. | ✓ |
| Dialog only; leave other consumers on image_url | Tightest blast radius; uploads wouldn't appear in cart/inventory. | |
| photo_url only where set, no shared resolver | Same null logic rewritten and drifting at every site. | |

**User's choice:** photo_url ?? image_url everywhere → D-14

### Q15 — Public bucket or signed URLs?

| Option | Description | Selected |
|--------|-------------|----------|
| Public read, RLS-gated write | Permanent URLs, no token refresh, zero extra code. | |
| Private bucket, signed URLs | Nothing fetchable without a session; column can't hold a durable URL. | ✓ |
| Public read, and public write | Fails PCAT-03; listed only to record the rejection. | |

**User's choice:** Private bucket, signed URLs → D-15
**Notes:** Chose the stricter option over the recommended public-read bucket, accepting the signing layer.

### Q16 — What does the column hold, and where do signed URLs come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Store the object path; sign on demand, cached | ~1h TTL, TanStack Query cache below TTL, batch signing for lists. | ✓ |
| Store the path; sign only in the dialog | Least code; lists stay imageless, walking back D-14. | |
| Store a long-lived signed URL in the column | No signing logic for readers; silent 403s on expiry, leaked URLs stay valid. | |

**User's choice:** Store the object path; sign on demand, cached → D-16
**Notes:** Surfaced a naming consequence — the column holds a path, so `photo_path` reads truer than `photo_url`; left to the planner to pick one name consistently.

---

## What "Full Detail" Shows

### Q17 — What read-only context appears, and where?

| Option | Description | Selected |
|--------|-------------|----------|
| Compact read-only strip in the dialog header | Stock on hand, low-stock threshold, active state — data ProductSchema already carries. | ✓ |
| Header strip + a read-only Stock tab | Adds expiry, reorder point, stock_movements history; new queries; duplicates Inventory's Movements tab. | |
| Editable fields only | Strictest phase boundary; dialog tells you nothing the table row didn't. | |

**User's choice:** Compact read-only strip in the dialog header → D-17

---

## Claude's Discretion

The user selected "I'm ready for context" rather than exploring these; defaults are recorded in CONTEXT.md § Claude's Discretion:

- Bucket name and object-path convention
- Replace semantics (new uuid key + delete old, vs. overwrite in place)
- Offline upload behavior (`isOnline()` guard vs. queueing — the offline queue replays mutations, not file bodies)
- RLS write-policy shape (`profiles.role` vs. `role_permissions` override table)
- Whether the Catalog table row renders a thumbnail
- E2E shape, including whether a new `e2e/visual/` baseline is needed
- i18n catalog entries for the new tab labels and photo copy (es-MX + en-US)

## Deferred Ideas

- Read-only Stock tab inside the product dialog (rejected in D-17 — duplicates the Inventory page's Movements tab)
- Multi-photo gallery (PCAT-03 locks one photo per product)
- HEIC/HEIF support (rejected in D-11 — needs a decoder or server-side convert)
- Thumbnail pipeline / server-side image processing (rejected in D-10)
- Retiring `image_url` entirely (D-13 keeps both columns; a later housekeeping phase could migrate and drop it)

**Reviewed todos, not folded:** `rename-cargo-package-bar-pos` and `rotate-remote-supabase-db-password` — both matched on generic keywords ("pos", "supabase") only, neither is catalog work.
