import type { Result } from '@shared/lib/result';
import { err } from '@shared/lib/result';
import type { AgentActionContext } from '@shared/lib/telemetry';
import { checkDbConnection, getRecentErrors, getAgentAuditLog, runDiagnostic, generateDiagnosticReport, diagnosticToolDefinitions } from './diagnosticTools';
import {
  findProduct, findTab, confirmAction, cancelAction,
  guardToolDefinitions, checkWriteRateGuard,
} from './guardTools';
import { getMenu, addProduct, updateProduct, deactivateProduct, bulkImportProducts, menuToolDefinitions } from './menuTools';
import {
  listTabs, getTab, openTab, closeTab, addItemsToTab,
  posToolDefinitions,
} from './posTools';
import { generateSalesReport, getDailySummary, getTopProducts, reportToolDefinitions } from './reportTools';
import { getPosStatus, getCurrentShift, systemToolDefinitions } from './systemTools';

export const allToolDefinitions = [
  ...guardToolDefinitions,   // lookup tools first — Claude should reach for these
  ...posToolDefinitions,
  ...menuToolDefinitions,
  ...reportToolDefinitions,
  ...diagnosticToolDefinitions,
  ...systemToolDefinitions,
];

// Write tools subject to rate guard
const WRITE_TOOLS = new Set([
  'open_tab', 'close_tab', 'add_items_to_tab',
  'add_product', 'update_product', 'deactivate_product', 'bulk_import_products',
  'confirm_action',
]);

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentActionContext
): Promise<Result<unknown>> {
  // Rate guard for all write tools
  if (WRITE_TOOLS.has(name)) {
    const rateErr = checkWriteRateGuard();
    if (rateErr) return rateErr;
  }

  switch (name) {
    // ── Guard / lookup ──
    case 'find_product':    return findProduct(args as { name: string }, ctx);
    case 'find_tab':        return findTab(args as { customer_name?: string; table_number?: number }, ctx);
    case 'confirm_action':  return confirmAction(args as { token: string }, ctx);
    case 'cancel_action':   return cancelAction(args as { token: string }, ctx);
    // ── Menu ──
    case 'get_menu':             return getMenu(args as { category_id?: string }, ctx);
    case 'add_product':          return addProduct(args as { name: string; price: number; category_id?: string }, ctx);
    case 'update_product':       return updateProduct(args as { id: string; name?: string; price?: number }, ctx);
    case 'deactivate_product':   return deactivateProduct(args as { id: string }, ctx);
    case 'bulk_import_products': return bulkImportProducts(args as { products: Array<{ name: string; price: number; category_id?: string }> }, ctx);
    // ── Reports ──
    case 'generate_sales_report': return generateSalesReport(args as { from: string; to: string }, ctx);
    case 'get_daily_summary':     return getDailySummary({} as Record<string, never>, ctx);
    case 'get_top_products':      return getTopProducts(args as { limit?: number; days?: number }, ctx);
    // ── Diagnostics ──
    case 'check_db_connection':        return checkDbConnection({} as Record<string, never>, ctx);
    case 'get_recent_errors':          return getRecentErrors(args as { days?: number; limit?: number }, ctx);
    case 'get_agent_audit_log':        return getAgentAuditLog(args as { days?: number; limit?: number }, ctx);
    case 'run_diagnostic':             return runDiagnostic({} as Record<string, never>, ctx);
    case 'generate_diagnostic_report': return generateDiagnosticReport({} as Record<string, never>, ctx);
    // ── System ──
    case 'get_pos_status':    return getPosStatus({} as Record<string, never>, ctx);
    case 'get_current_shift': return getCurrentShift({} as Record<string, never>, ctx);
    // ── Tabs ──
    case 'list_tabs':        return listTabs({} as Record<string, never>, ctx);
    case 'get_tab':          return getTab(args as { tab_id: string }, ctx);
    case 'open_tab':         return openTab(args as { customer_name: string; table_number?: number; notes?: string }, ctx);
    case 'close_tab':        return closeTab(args as { tab_id: string }, ctx);
    case 'add_items_to_tab': return addItemsToTab(args as { tab_id: string; items: Array<{ product_id: string; quantity: number }>; notes?: string }, ctx);
    default:
      return err({ code: 'TOOL_EXECUTION_ERROR' as const, message: `Unknown tool: ${name}` });
  }
}
