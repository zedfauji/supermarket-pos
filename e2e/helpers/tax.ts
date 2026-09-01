import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reads the live `billing` settings row the same way process_direct_sale_atomic
 * does (`settings.value->>'taxRatePercent'`/`->>'taxInclusive'`), falling back
 * to 16/true to match the migration's own COALESCE defaults when no row
 * exists yet (Plan 24-01's `taxInclusive` default is `true`).
 *
 * Single shared source for the mode-aware tax config read — previously
 * duplicated (additive-only, no `taxInclusive` branch) across 8 e2e spec
 * files (Phase 24 Plan 04, closing RESEARCH.md's Pitfall 3).
 */
export async function getBillingTaxConfig(
  admin: SupabaseClient
): Promise<{ taxRatePercent: number; taxInclusive: boolean }> {
  const { data } = await admin.from('settings').select('value').eq('key', 'billing').maybeSingle();
  const v = data?.value as { taxRatePercent?: number; taxInclusive?: boolean } | null;
  return {
    taxRatePercent: typeof v?.taxRatePercent === 'number' ? v.taxRatePercent : 16,
    taxInclusive: typeof v?.taxInclusive === 'boolean' ? v.taxInclusive : true,
  };
}

/**
 * Mode-aware authoritative-total computation matching process_direct_sale_atomic's
 * server-side branch (Plan 24-01): when taxInclusive, the catalog price sum IS
 * the charged total, unchanged (TAX-02); when not, mirrors the RPC's two-step
 * rounding (tax rounded first, then added to the subtotal) so amounts land
 * within the RPC's one-cent authority tolerance (TAX-03).
 */
export function computeAuthoritativeTotal(
  subtotal: number,
  taxRatePercent: number,
  taxInclusive: boolean
): number {
  if (taxInclusive) return subtotal;
  const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
  return Math.round((subtotal + tax) * 100) / 100;
}
