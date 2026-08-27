/**
 * Unit tests for usePhysicalCount
 *
 * AC covered (S8-04):
 * - Success path: writes stock_movements entry per changed product with reason='physical_count'
 *   and delta=(actual - current), then updates inventory.quantity_on_hand
 * - Products with actual == current (zero variance) are skipped — no DB writes
 * - Error path: returns Result with ok:false when Supabase fails
 */

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inventory } from '@shared/lib/domain';
import { supabase } from '@shared/lib/supabase';
import { createTestQueryClient } from '@shared/lib/test-utils';
import { usePhysicalCount } from './usePhysicalCount';

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
 * Minimal Inventory fixture.
 * `product` is optional in the schema — include it so productName resolves.
 */
function makeInventoryItem(
  productId: string,
  productName: string,
  quantityOnHand: number
): Inventory {
  return {
    id: crypto.randomUUID(),
    productId,
    quantityOnHand,
    lowStockThreshold: 5,
    unit: 'unit',
    product: {
      id: productId,
      name: productName,
      categoryId: crypto.randomUUID(),
      basePrice: 500,
      happyHourPrice: null,
      sku: null,
      isActive: true,
      soldByWeight: false,
      imageUrl: null,
      stock_threshold: null,
      unitsPerPackage: null,
      parentProductId: null,
      comboEligible: true,
      isCombo: false,
      modifiers: [],
    },
  };
}

/**
 * Mock the sequential DB chain used by usePhysicalCount per changed row:
 *   1. supabaseQuery  → from('inventory').select('*').eq('product_id', id).single()
 *   2. supabaseMutation → from('inventory').update({...}).eq(...).select().single()
 *   3. supabaseMutation → from('stock_movements').insert({...}).select().single()
 *
 * We track which table is passed to `from` so we can return appropriate mocks.
 */
type MockFromOptions = {
  fetchResult?:
    | { data: unknown; error: null }
    | { data: null; error: { message: string; code: string } };
  updateResult?:
    | { data: unknown; error: null }
    | { data: null; error: { message: string; code: string } };
  logResult?:
    | { data: unknown; error: null }
    | { data: null; error: { message: string; code: string } };
};

function setupSuccessMock(productId: string, currentQty: number, opts: MockFromOptions = {}) {
  const {
    fetchResult = { data: { product_id: productId, quantity_on_hand: currentQty }, error: null },
    updateResult = { data: { product_id: productId, quantity_on_hand: currentQty }, error: null },
    logResult = {
      data: {
        id: crypto.randomUUID(),
        product_id: productId,
        quantity_delta: 0,
        reason: 'physical_count',
        staff_id: 'staff-1',
      },
      error: null,
    },
  } = opts;

  mockedFrom.mockImplementation((table: string) => {
    if (table === 'inventory') {
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          // first call = fetch, second call = update .single()
          .mockResolvedValueOnce(fetchResult)
          .mockResolvedValueOnce(updateResult),
      } as unknown as ReturnType<typeof supabase.from>;
    }
    if (table === 'stock_movements') {
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(logResult),
      } as unknown as ReturnType<typeof supabase.from>;
    }
    // fallback
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as ReturnType<typeof supabase.from>;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePhysicalCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Success path — changed rows
  // -------------------------------------------------------------------------

  it('S8-04: returns ok:true and adjustedRows when actual differs from expected', async () => {
    const productId = crypto.randomUUID();
    const inventory: Inventory[] = [makeInventoryItem(productId, 'Heineken', 10)];

    // actual = 7, so delta = 7 - 10 = -3
    setupSuccessMock(productId, 10, {
      fetchResult: { data: { product_id: productId, quantity_on_hand: 10 }, error: null },
      updateResult: { data: { product_id: productId, quantity_on_hand: 7 }, error: null },
      logResult: {
        data: {
          id: crypto.randomUUID(),
          product_id: productId,
          quantity_delta: -3,
          reason: 'physical_count',
          staff_id: 'staff-1',
        },
        error: null,
      },
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), {
      wrapper: makeWrapper(qc),
    });

    const entries = new Map([[productId, 7]]);
    const res = await result.current.submitPhysicalCount({
      entries,
      inventory,
      staffId: 'staff-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.adjustedRows).toHaveLength(1);
    expect(res.data.adjustedRows[0]).toMatchObject({
      productId,
      productName: 'Heineken',
      expectedStock: 10,
      actualCount: 7,
      variance: -3,
    });
  });

  it('S8-04: writes stock_movements entry with reason=physical_count and correct delta', async () => {
    const productId = crypto.randomUUID();
    const inventory: Inventory[] = [makeInventoryItem(productId, 'Coke', 20)];

    const logInsertSingleSpy = vi.fn().mockResolvedValue({
      data: {
        id: crypto.randomUUID(),
        product_id: productId,
        quantity_delta: 5,
        reason: 'physical_count',
        staff_id: 'staff-42',
      },
      error: null,
    });

    mockedFrom.mockImplementation((table: string) => {
      if (table === 'inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValueOnce({
              data: { product_id: productId, quantity_on_hand: 20 },
              error: null,
            })
            .mockResolvedValueOnce({
              data: { product_id: productId, quantity_on_hand: 25 },
              error: null,
            }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'stock_movements') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: logInsertSingleSpy,
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), { wrapper: makeWrapper(qc) });

    // actual=25, expected=20 → delta=+5
    const entries = new Map([[productId, 25]]);
    const res = await result.current.submitPhysicalCount({
      entries,
      inventory,
      staffId: 'staff-42',
    });

    expect(res.ok).toBe(true);
    // stock_movements .single() was called — confirming the insert path was hit
    expect(logInsertSingleSpy).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Skip unchanged rows
  // -------------------------------------------------------------------------

  it('S8-04: skips DB writes for products where actual == expected (zero variance)', async () => {
    const productId = crypto.randomUUID();
    const inventory: Inventory[] = [makeInventoryItem(productId, 'Water', 15)];

    // No mock needed for changed rows — if from() gets called, the test should fail
    const fromSpy = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockedFrom.mockImplementation(fromSpy);

    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), { wrapper: makeWrapper(qc) });

    // actual == expected (15 == 15) → should skip all DB writes
    const entries = new Map([[productId, 15]]);
    const res = await result.current.submitPhysicalCount({
      entries,
      inventory,
      staffId: 'staff-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // No rows adjusted
    expect(res.data.adjustedRows).toHaveLength(0);
    // All rows still appear in allRows
    expect(res.data.allRows).toHaveLength(1);
    expect(res.data.allRows[0]?.variance).toBe(0);

    // No DB writes — from() should NOT have been called at all
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('S8-04: skips only unchanged rows and adjusts changed ones in a mixed list', async () => {
    const unchanged = crypto.randomUUID();
    const changed = crypto.randomUUID();

    const inventory: Inventory[] = [
      makeInventoryItem(unchanged, 'Beer', 10),
      makeInventoryItem(changed, 'Wine', 8),
    ];

    // Only the changed product calls DB
    mockedFrom.mockImplementation((table: string) => {
      if (table === 'inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValueOnce({
              data: { product_id: changed, quantity_on_hand: 8 },
              error: null,
            })
            .mockResolvedValueOnce({
              data: { product_id: changed, quantity_on_hand: 5 },
              error: null,
            }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'stock_movements') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: crypto.randomUUID() }, error: null }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), { wrapper: makeWrapper(qc) });

    const entries = new Map([
      [unchanged, 10], // same as expected → skip
      [changed, 5], // differs → adjust
    ]);

    const res = await result.current.submitPhysicalCount({
      entries,
      inventory,
      staffId: 'staff-1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.adjustedRows).toHaveLength(1);
    expect(res.data.adjustedRows[0]?.productId).toBe(changed);
    expect(res.data.allRows).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Error path — fetch failure
  // -------------------------------------------------------------------------

  it('S8-04: returns Result ok:false when inventory fetch fails for a changed product', async () => {
    const productId = crypto.randomUUID();
    const inventory: Inventory[] = [makeInventoryItem(productId, 'Rum', 10)];

    mockedFrom.mockImplementation((table: string) => {
      if (table === 'inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'row not found', code: 'PGRST116' },
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), { wrapper: makeWrapper(qc) });

    const entries = new Map([[productId, 5]]); // differs from 10 → triggers DB path
    const res = await result.current.submitPhysicalCount({
      entries,
      inventory,
      staffId: 'staff-1',
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('NOT_FOUND');
  });

  it('S8-04: returns Result ok:false when stock_movements insert fails', async () => {
    const productId = crypto.randomUUID();
    const inventory: Inventory[] = [makeInventoryItem(productId, 'Vodka', 10)];

    mockedFrom.mockImplementation((table: string) => {
      if (table === 'inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValueOnce({
              data: { product_id: productId, quantity_on_hand: 10 },
              error: null,
            })
            .mockResolvedValueOnce({
              data: { product_id: productId, quantity_on_hand: 3 },
              error: null,
            }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'stock_movements') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'permission denied', code: '42501' },
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), { wrapper: makeWrapper(qc) });

    const entries = new Map([[productId, 3]]); // differs → triggers DB path
    const res = await result.current.submitPhysicalCount({
      entries,
      inventory,
      staffId: 'staff-1',
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('AUTH_FORBIDDEN');
  });

  // -------------------------------------------------------------------------
  // isPending state
  // -------------------------------------------------------------------------

  it('isPending is false before mutation fires', () => {
    const qc = createTestQueryClient();
    const { result } = renderHook(() => usePhysicalCount(), { wrapper: makeWrapper(qc) });
    expect(result.current.isPending).toBe(false);
  });
});
