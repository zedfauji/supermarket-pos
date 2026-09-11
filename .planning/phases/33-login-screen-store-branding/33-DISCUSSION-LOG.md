# Phase 33: Login Screen Store Branding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 33-login-screen-store-branding
**Areas discussed:** Store name field, Logo prominence & mobile behavior, Logo upload size/dimension limits, Settings UI placement

---

## Store name field: reuse barName vs. new field

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse/rename barName (recommended) | One field powers receipts + login. Closes the bar-pos-leftover naming gap. | ✓ |
| New separate storeName field | Matches REQUIREMENTS.md's literal "distinct" wording; barName stays receipt-only. | |

**User's choice:** Reuse/rename barName
**Notes:** Scouting found `general.barName` already functions as the store name (feeds receipts,
a payment fallback, and its own settings-tab copy says "Store name"). The phase's originating
explore note assumed no such field existed — that assumption was wrong.

| Option | Description | Selected |
|--------|-------------|----------|
| Rename everywhere (recommended) | Column, Zod field, all consumers renamed store-wide. | ✓ |
| Keep barName internally, relabel UI only | Smaller diff, leaves the misleading internal name in place. | |

**User's choice:** Rename everywhere

| Option | Description | Selected |
|--------|-------------|----------|
| Keep "Supermarket POS" (t('login.brand')) | Matches today's behavior exactly. | ✓ |
| Other/blank | | |

**User's choice:** Keep "Supermarket POS"

---

## Logo prominence & mobile behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Hero-size, dominant element (recommended) | Logo becomes the visual focal point of the left panel. | ✓ |
| Enlarged icon | Bigger version of today's tile, smaller redesign risk. | |

**User's choice:** Hero-size, dominant element

| Option | Description | Selected |
|--------|-------------|----------|
| Keep desktop-only, small icon stays on mobile (recommended) | No change to mobile layout. | ✓ |
| Show large logo on mobile too | Requires redesigning the mobile fallback header. | |

**User's choice:** Keep desktop-only

| Option | Description | Selected |
|--------|-------------|----------|
| Keep all existing content, logo added above/beside it (recommended) | No loss of existing functionality. | ✓ |
| Other | | |

**User's choice:** Keep all existing content

---

## Logo upload size/dimension limits

| Option | Description | Selected |
|--------|-------------|----------|
| 800px max edge (recommended) | Crisp at hero size without over-sizing; below Phase 31's 1200px. | ✓ |
| Reuse Phase 31's 1200px max edge | Same constant as product photos. | |

**User's choice:** 800px max edge

| Option | Description | Selected |
|--------|-------------|----------|
| Same as Phase 31 (recommended) | 10MB pre-resize cap, JPEG/PNG/WebP only. | ✓ |
| Other | | |

**User's choice:** Same as Phase 31

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated bucket (recommended) | Store branding is store-wide singleton data, not per-product. | ✓ |
| Reuse product-photos bucket, new path prefix | One less bucket, but mixes access-pattern shapes. | |

**User's choice:** New dedicated bucket

---

## Settings UI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Add to GeneralSettingsTab (recommended) | storeName already lives there; one tab for store identity. | ✓ |
| New dedicated Branding tab | Cleaner separation, but splits store-identity config. | |

**User's choice:** Add to GeneralSettingsTab

| Option | Description | Selected |
|--------|-------------|----------|
| manage_settings, admin-only (recommended) | Matches every other field on the tab. | ✓ |
| Other | | |

**User's choice:** manage_settings, admin-only

---

## Claude's Discretion

- Exact bucket name and object path convention (singleton, so no product-id path segment needed).
- Final field/column naming (`storeLogoUrl` vs. `storeLogoPath` per the "path not URL" lesson from
  Phase 31 D-16).
- Signed-URL TTL/caching values (mirror Phase 31's `resolveProductImage.ts` conventions).
- RLS write-policy shape (match existing `manage_settings`/`manage_products` enforcement pattern).
- i18n key updates for the `barName` → `storeName` rename and new logo-upload copy.
- E2E shape (functional spec + visual-regression baseline + Storage RLS boundary spec).

## Deferred Ideas

- Mobile large-logo treatment — rejected; mobile keeps today's compact icon+text row.
- Retiring the receipt-only `logoDataUrl`/`headerLine2` fields — explicitly out of scope.
- Branding tab as its own Settings section — rejected in favor of extending GeneralSettingsTab.

**Reviewed but not folded todos:** `rotate-remote-supabase-db-password` (unrelated ops task),
`rename-cargo-package-bar-pos` (unrelated Cargo/Tauri housekeeping, not this phase's barName
field).
