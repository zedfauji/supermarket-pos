/**
 * Unit tests for useInventoryAlerts()
 *
 * AC:
 * - S8-02-AC1: returns all products where current stock <= stock_threshold
 * - S8-02-AC3: returns Result<InventoryAlert[]> with productName, currentStock, threshold
 * - error branch: returns Result with ok:false on Supabase failure
 */

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@shared/lib/supabase';
import { createTestQueryClient } from '@shared/lib/test-utils';
import { inventoryKeys, useInventoryAlerts } from './queries';

// ---------------------------------------------------------------------------
// Supabase mock handle
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockedFrom = vi.mocked(supabase).from;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

/**
 * The hook calls .from().select().not() — three chained calls, then awaits.
 * `.not()` must be thenable so the hook can await the query result.
 */
function mockInventoryAlertsChain(resolvedValue: { data: unknown; error: unknown }) {
  mockedFrom.mockImplementation(
    () =>
      ({
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue(resolvedValue),
      }) as unknown as ReturnType<typeof supabase.from>
  );
}

// ---------------------------------------------------------------------------
// Raw DB row factory
// ---------------------------------------------------------------------------

function makeAlertRow(
  productId: string,
  productName: string,
  quantityOnHand: number,
  stockThreshold: number
) {
  return {
    quantity_on_hand: quantityOnHand,
    product: {
      id: productId,
      name: productName,
      stock_threshold: stockThreshold,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInventoryAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC1 + AC3: success — returns only products at or below threshold
  // -------------------------------------------------------------------------

  it('S8-02-AC1: returns products where stock <= threshold and omits products above threshold', async () => {
    const p1 = crypto.randomUUID();
    const p2 = crypto.randomUUID();
    const p3 = crypto.randomUUID();

    mockInventoryAlertsChain({
      data: [
        makeAlertRow(p1, 'Heineken', 2, 5), // at risk: 2 <= 5 ✓
        makeAlertRow(p2, 'Coke', 5, 5), // exactly at threshold: 5 <= 5 ✓
        makeAlertRow(p3, 'Water', 10, 5), // above threshold: 10 > 5 — excluded
      ],
      error: null,
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useInventoryAlerts(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map(a => a.productId)).toContain(p1);
    expect(result.current.data?.map(a => a.productId)).toContain(p2);
    expect(result.current.data?.map(a => a.productId)).not.toContain(p3);
  });

  it('S8-02-AC3: returned InventoryAlert objects include productName, currentStock, and threshold', async () => {
    const pid = crypto.randomUUID();

    mockInventoryAlertsChain({
      data: [makeAlertRow(pid, 'Amstel', 3, 10)],
      error: null,
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useInventoryAlerts(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });

    expect(result.current.data).toHaveLength(1);
    const alert = result.current.data?.[0];
    expect(alert).toMatchObject({
      productId: pid,
      productName: 'Amstel',
      currentStock: 3,
      threshold: 10,
    });
  });

  it('returns an empty array when no products breach their threshold', async () => {
    mockInventoryAlertsChain({
      data: [makeAlertRow(crypto.randomUUID(), 'Beer', 50, 5)],
      error: null,
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useInventoryAlerts(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true);
    });

    expect(result.current.data).toHaveLength(0);
  });

  it('returns an empty array when Supabase returns no rows (all thresholds null — filtered server-side)', async () => {
    mockInventoryAlertsChain({ data: [], error: null });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useInventoryAlerts(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Error branch
  // -------------------------------------------------------------------------

  it('returns Result with ok:false when Supabase returns an error', async () => {
    mockedFrom.mockImplementation(
      () =>
        ({
          select: vi.fn().mockReturnThis(),
          not: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'connection refused', code: '500' },
          }),
        }) as unknown as ReturnType<typeof supabase.from>
    );

    const qc = createTestQueryClient();
    const { result } = renderHook(() => useInventoryAlerts(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      // data from the raw query is the Result — check resultError is populated
      expect(result.current.resultError).toBeDefined();
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.resultError?.code).toBe('SUPABASE_ERROR');
  });

  // -------------------------------------------------------------------------
  // Query key
  // -------------------------------------------------------------------------

  it('uses inventoryKeys.alerts() as the query key', () => {
    expect(inventoryKeys.alerts()).toEqual(['inventory', 'alerts']);
  });

  // -------------------------------------------------------------------------
  // staleTime
  // -------------------------------------------------------------------------

  it('is configured with staleTime of 30 000ms', () => {
    mockInventoryAlertsChain({ data: [], error: null });

    const qc = createTestQueryClient();
    renderHook(() => useInventoryAlerts(), { wrapper: makeWrapper(qc) });

    const cache = qc.getQueryCache().findAll({ queryKey: inventoryKeys.alerts() });
    expect(cache.length).toBeGreaterThan(0);
    // staleTime is stored on the observer options
    expect(cache[0]?.observers[0]?.options.staleTime).toBe(30_000);
  });
});
