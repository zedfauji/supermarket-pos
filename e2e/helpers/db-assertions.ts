import { getServiceClient } from './supabase';

type InventoryAdjustReason =
  | 'sale'
  | 'manual_adjustment'
  | 'waste'
  | 'delivery'
  | 'correction'
  | 'physical_count'
  | 'expired'
  | 'refund';

// Service-role assertions read committed state only. Use role-scoped clients for RLS-denial tests.
export async function assertStockMovement(
  productId: string,
  expectedDelta: number,
  expectedReason: InventoryAdjustReason
): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('stock_movements')
    .select('quantity_delta, reason')
    .eq('product_id', productId)
    .eq('reason', expectedReason)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.quantity_delta !== expectedDelta) {
    throw new Error(
      `Expected stock movement for product ${productId} with delta ${expectedDelta} and reason ${expectedReason}, got ${JSON.stringify(data)}`
    );
  }
}

export async function assertPaymentRecorded(
  tabId: string,
  expectedAmount: number,
  expectedMethod: string
): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('payments')
    .select('amount, method')
    .eq('tab_id', tabId)
    .eq('is_deleted', false)
    .order('processed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.amount !== expectedAmount || data.method !== expectedMethod) {
    throw new Error(
      `Expected payment for tab ${tabId} with amount ${expectedAmount} and method ${expectedMethod}, got ${JSON.stringify(data)}`
    );
  }
}

export async function assertAuditLogEntry(
  entityType: string,
  entityId: string,
  expectedAction: string
): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('audit_logs')
    .select('action')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.action !== expectedAction) {
    throw new Error(
      `Expected audit log for ${entityType} ${entityId} with action ${expectedAction}, got ${JSON.stringify(data)}`
    );
  }
}

export async function assertCajaEntry(
  cajaSessionId: string,
  expectedType: string,
  expectedAmount: number
): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('caja_entries')
    .select('amount, type')
    .eq('caja_session_id', cajaSessionId)
    .eq('type', expectedType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.amount !== expectedAmount) {
    throw new Error(
      `Expected caja entry for session ${cajaSessionId} with type ${expectedType} and amount ${expectedAmount}, got ${JSON.stringify(data)}`
    );
  }
}

export async function assertPurchaseOrderStatus(
  poId: string,
  expectedStatus: string
): Promise<void> {
  const { data, error } = await getServiceClient()
    .from('purchase_orders')
    .select('status, received_at')
    .eq('id', poId)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    data.status !== expectedStatus ||
    (expectedStatus === 'received' && !data.received_at)
  ) {
    throw new Error(
      `Expected purchase order ${poId} with status ${expectedStatus}, got ${JSON.stringify(data)}`
    );
  }
}
