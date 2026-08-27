---
phase: 04-reports-hardening
reviewed: 2026-08-15T22:07:59Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - e2e/07-reports.spec.ts
  - e2e/55-full-day-soak.spec.ts
  - src/entities/staff/index.ts
  - src/entities/staff/model/index.ts
  - src/entities/staff/model/queries.staff-report.test.ts
  - src/entities/staff/model/queries.ts
  - src/entities/tab/model/modifier-popularity-report.integration.test.ts
  - src/entities/tab/model/product-sales-report.integration.test.ts
  - src/entities/tab/model/queries-reports.ts
  - src/features/export-report/model/useExportReport.ts
  - src/features/export-report/ui/ExportButtons.test.tsx
  - src/features/export-report/ui/ExportButtons.tsx
  - src/pages/reports/index.tsx
  - src/shared/lib/domain.test.ts
  - src/shared/lib/domain.ts
  - src/shared/lib/exporters/excel.test.ts
  - src/shared/lib/exporters/excel.ts
  - src/shared/lib/exporters/pdf.test.ts
  - src/shared/lib/exporters/pdf.tsx
  - src/shared/lib/i18n/locales/en-US/pages.json
  - src/shared/lib/i18n/locales/en-US/receipt.json
  - src/shared/lib/i18n/locales/en-US/wAdmin.json
  - src/shared/lib/i18n/locales/es-MX/pages.json
  - src/shared/lib/i18n/locales/es-MX/receipt.json
  - src/shared/lib/i18n/locales/es-MX/wAdmin.json
  - src/shared/lib/supabase.types.ts
  - src/widgets/ModifierPopularityReport/ModifierPopularityReport.tsx
  - src/widgets/ModifierPopularityReport/index.ts
  - src/widgets/ProductSalesPanel/ProductSalesExportFilter.test.tsx
  - src/widgets/ProductSalesPanel/ProductSalesPanel.test.tsx
  - src/widgets/ProductSalesPanel/ProductSalesPanel.tsx
  - src/widgets/TipDistributionPanel/TipDistributionPanel.test.tsx
  - src/widgets/TipDistributionPanel/TipDistributionPanel.tsx
  - src/widgets/TipDistributionPanel/index.ts
  - supabase/migrations/20260818000001_drop_modifier_popularity_report_rpc.sql
  - supabase/migrations/20260818000002_order_items_cost_price_snapshot.sql
  - supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql
  - supabase/migrations/20260818000004_close_caja_reconciliation_summary.sql
  - supabase/migrations/20260818000005_close_caja_session_authoritative_closed_by.sql
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-15T22:07:59Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

Reviewed the Phase 04 report removals, historical-cost margin path, Caja close migrations, and the 04-04 gap-closure tests. The gap closure correctly prevents forged Caja attribution and now proves receiving persistence, but weighted-product margins are materially wrong and the new close-attribution contract leaves an existing authenticated integration suite broken.

Verification: `npm run typecheck` passed. Existing 04-04 report-suite failures remain documented as deferred and were not reclassified here.

## Narrative Findings (AI reviewer)

## Critical Issues

### BL-01 [BLOCKER]: Weighted-item margins charge a full unit of cost for every fractional-weight sale

**File:** `/mnt/ai/POS/supermarket-pos/src/entities/tab/model/queries-reports.ts:234-240, 274-299`

**Issue:** The checkout RPC prices weighted products by `weight_grams / 1000` (`supabase/migrations/20260818000003_process_direct_sale_atomic_cost_snapshot.sql:63-71`), but this query does not select `weight_grams` and calculates cost as `quantity * cost_price_snapshot`. A 100 g sale therefore records one tenth of a unit's revenue but a full unit's cost, causing false negative margins and incorrect CSV/Excel/PDF exports for all weighted goods.

**Fix:** Select `weight_grams` and apply the same scale factor used by checkout when accumulating cost, while retaining `quantity` for multiple weighed units. For example:

```ts
const weightFactor = item.weight_grams == null ? 1 : item.weight_grams / 1000;
const lineCost = quantity * costPrice * weightFactor;
```

Use `lineCost` for both initial and accumulated `costTotal`, and add a weighted-product regression case.

## Warnings

### WR-01 [WARNING]: Authenticated Caja-close integration tests now always send an invalid actor

**File:** `/mnt/ai/POS/supermarket-pos/src/entities/caja/model/tip-distribution-rpc.integration.test.ts:331-336, 356-361, 389-394, 420-425, 452-457, 523-528`

**Issue:** The 04-04 migration correctly rejects `p_closed_by IS DISTINCT FROM auth.uid()` (`supabase/migrations/20260818000005_close_caja_session_authoritative_closed_by.sql:30-35`). Every authenticated call in this retained integration suite still supplies `p_closed_by: null`, so each is now rejected with `PERMISSION_DENIED`; the integration suite can no longer verify Caja close behavior.

**Fix:** Have `getAuthClient` return (or separately fetch) the authenticated profile ID and pass that ID as `p_closed_by` in each valid-close call. Keep the deliberately forged-ID test as the negative case.

---

_Reviewed: 2026-08-15T22:07:59Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
