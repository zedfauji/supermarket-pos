# Phase 32: Brand Entity & Pack-Weight Catalog Attributes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-08
**Phase:** 32-brand-entity-pack-weight-catalog-attributes
**Areas discussed:** Brand entity shape & delete behavior, Brand management UI placement, Weight field UX & validation, Filter scope — where brand/weight filters surface

---

## Brand entity shape & delete behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Name only | Matches BRND-01's minimum bar; simplest CRUD | ✓ |
| Name + logo (image upload) | Reuses Phase 31's Storage/signed-URL pattern | |
| Name + sortOrder (no logo) | Matches Category's sortOrder field | |

**User's choice:** Name only.

| Option | Description | Selected |
|--------|-------------|----------|
| SET NULL (recommended) | brand_id is nullable — deleting a brand clears it from products | |
| RESTRICT (like Category) | Block delete while any product references the brand | ✓ |

**User's choice:** RESTRICT — the stricter option, matching `category_id`'s existing FK behavior even though `brand_id` is nullable.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, unique (recommended) | DB UNIQUE constraint on lower(name) | ✓ |
| No constraint | Allow duplicates | |

**User's choice:** Yes, unique.

---

## Brand management UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated Brands sub-tab (recommended) | Mirrors CatalogCategoriesTab.tsx exactly | ✓ |
| Inline-only from product dialog | "+ Add brand" inline option, no management screen | |

**User's choice:** Dedicated Brands sub-tab.

| Option | Description | Selected |
|--------|-------------|----------|
| Same manage_products gate (recommended) | Identical to Products/Categories sub-tabs | ✓ |
| Something else | | |

**User's choice:** Same manage_products gate.

---

## Weight field UX & validation

| Option | Description | Selected |
|--------|-------------|----------|
| Both-or-neither (recommended) | Zod .refine() pair check | ✓ |
| Fully independent, both optional | Either field can be set alone | |

**User's choice:** Both-or-neither.

| Option | Description | Selected |
|--------|-------------|----------|
| 2 decimal places (recommended) | Matches MoneySchema's multipleOf(0.01) pattern | ✓ |
| Whole numbers only | Simpler but can't express "0.5 kg" | |

**User's choice:** 2 decimal places.

| Option | Description | Selected |
|--------|-------------|----------|
| Right after Category (recommended) | Groups brand+weight as new catalog attributes near top | ✓ |
| At the end, after Active toggle | Keeps existing field order untouched | |

**User's choice:** Right after Category.

| Option | Description | Selected |
|--------|-------------|----------|
| No default — blank/placeholder (recommended) | Forces explicit choice | |
| Default to 'g' | Pre-selects grams for the common Indian-grocery case | ✓ |

**User's choice:** Default to 'g'. **Note:** flagged in CONTEXT.md D-09 as needing reconciliation with the both-or-neither validation (a defaulted-but-untouched unit must not count as "set").

---

## Filter scope — where brand/weight filters surface

| Option | Description | Selected |
|--------|-------------|----------|
| Admin Catalog page only (recommended) | CatalogProductsTab.tsx gets dropdown filters | |
| POS checkout grid only | CategoryTabs.tsx / ProductGrid gets filtering | |
| Both admin Catalog and POS checkout | Filters added in both places | ✓ |

**User's choice:** Both — a larger surface than the minimum BRND-04 wording implies.

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown selects above the table (recommended) | Filters the same client-side list as search | ✓ |
| Something else | | |

**User's choice:** Dropdown selects above the table.

| Option | Description | Selected |
|--------|-------------|----------|
| Secondary dropdown filters above ProductGrid (recommended) | Category tab stays primary; brand/weight narrow further (AND logic) | ✓ |
| Something else | | |

**User's choice:** Secondary dropdown filters above ProductGrid.

---

## Claude's Discretion

- Exact migration/column naming (`brands` table shape, FK column names, weight column types)
- Weight-unit enum representation (Postgres enum vs. text + CHECK)
- D-09's both-or-neither/default-unit reconciliation mechanism
- Filter dropdown component reuse between admin and POS surfaces
- Brand dropdown sort order (alphabetical, given no sortOrder field)
- i18n catalog entries (es-MX/en-US) for new labels
- E2E spec file organization for BRND-05 coverage

## Deferred Ideas

- **Brand logo/image** — rejected in D-01; revisit only if explicitly requested later (e.g. a
  branded shelf tag or receipt line).
- **Brand `sortOrder`** — rejected in D-01 in favor of alphabetical; revisit if the brand list
  grows unwieldy.

### Reviewed Todos (not folded)
- `todo.match-phase` returned 0 matches above the fold threshold (2 pending todos exist, neither
  scored high enough to surface).
