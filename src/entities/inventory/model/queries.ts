/* eslint-disable i18next/no-literal-string, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSettings } from '@entities/settings';
import type { Inventory, InventoryAlert, InventoryLog, NearExpiryAlert, Product } from '@shared/lib/domain';
import { CategorySchema, InventoryAlertSchema, NearExpiryAlertSchema, ProductSchema } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
import {
  err,
  ok,
  supabaseMutation,
  supabaseQuery,
  unknownError,
  type Result,
} from '@shared/lib/result';
import { supabase } from '@shared/lib/supabase';
import type { Tables } from '@shared/lib/supabase.types';
import { useInventoryStore } from './store';
import { InventorySchema, InventoryLogSchema } from './types';

export const inventoryKeys = {
  all: ['inventory'] as const,
  product: (id: string) => [...inventoryKeys.all, 'product', id] as const,
  lowStock: () => [...inventoryKeys.all, 'low-stock'] as const,
  alerts: () => [...inventoryKeys.all, 'alerts'] as const,
  nearExpiry: (thresholdDays: number) => [...inventoryKeys.all, 'near-expiry', thresholdDays] as const,
  log: (productId?: string) => [...inventoryKeys.all, 'log', productId ?? 'all'] as const,
};

type ProductJoined = Tables<'products'> & {
  category: Tables<'categories'> | null;
};

type InventoryRow = Tables<'inventory'> & {
  product: ProductJoined | null;
};

function mapInventoryRow(row: InventoryRow): Result<Inventory> {
  try {
    let product: Product | undefined;
    if (row.product) {
      // Pre-type-regen workaround (CLAUDE.md): units_per_package /
      // parent_product_id aren't in supabase.types.ts yet, so `Tables<'products'>`
      // (ProductJoined's base) doesn't declare them even though the `products(*)`
      // select above returns them at runtime.
      const productRaw = row.product as unknown as Record<string, unknown>;
      const cat =
        row.product.category != null
          ? CategorySchema.parse({
              id: row.product.category.id,
              name: row.product.category.name,
              color: row.product.category.color,
              sortOrder: row.product.category.sort_order,
              // legacy HH start/end columns retired (Phase 20, D-01) — superseded
              // by the promotions engine; always null.
              happyHourStart: null,
              happyHourEnd: null,
              createdAt: new Date(row.product.category.created_at),
            })
          : undefined;
      product = ProductSchema.parse({
        id: row.product.id,
        name: row.product.name,
        categoryId: row.product.category_id,
        basePrice: row.product.base_price,
        // legacy HH price column retired (Phase 20, D-01) — superseded by the
        // promotions engine; always null.
        happyHourPrice: null,
        sku: row.product.sku,
        isActive: row.product.is_active,
        imageUrl: row.product.image_url,
        stock_threshold: row.product.stock_threshold ?? null,
        // Phase 27: ProductSchema requires these two keys present (nullable,
        // not optional) — omitting them entirely (as this call site did
        // before) makes `undefined` fail `.nullable()` validation, which
        // throws inside mapInventoryRow's try/catch and poisons the WHOLE
        // /inventory list (useInventory() bails out on the first row that
        // fails to parse), not just rows for open-unit-configured products.
        unitsPerPackage: (productRaw['units_per_package'] as number | null | undefined) ?? null,
        parentProductId: (productRaw['parent_product_id'] as string | null | undefined) ?? null,
        modifiers: [],
        category: cat,
      });
    }

    return ok(
      InventorySchema.parse({
        id: row.id,
        productId: row.product_id,
        quantityOnHand: row.quantity_on_hand,
        lowStockThreshold: row.low_stock_threshold,
        unit: row.unit,
        costPrice: (row as unknown as { cost_price?: number | null }).cost_price ?? null,
        expiryDate: (row as unknown as { expiry_date?: string | null }).expiry_date ?? null,
        product,
      })
    );
  } catch (e) {
    return err(unknownError(e));
  }
}

export function useInventory() {
  const query = useQuery({
    queryKey: inventoryKeys.all,
    queryFn: async (): Promise<Result<Inventory[]>> => {
      const res = await supabaseQuery(() =>
        supabase
          .from('inventory')
          .select(
            `
          *,
          product:products(*, category:categories(*))
        `
          )
          .order('product(name)')
      );

      if (!res.ok) {
        logger.error('inventory.fetch_failed', { message: res.error.message });
        return res;
      }

      const list: Inventory[] = [];
      for (const row of res.data as InventoryRow[]) {
        const m = mapInventoryRow(row);
        if (!m.ok) {
          logger.error('inventory.map_failed', { message: m.error.message });
          return m;
        }
        list.push(m.data);
      }
      return ok(list);
    },
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (query.data?.ok) {
      useInventoryStore.getState().setInventory(query.data.data);
    }
  }, [query.data]);

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

/**
 * Returns all products where stock_threshold is set and
 * current quantity_on_hand <= stock_threshold.
 *
 * Queries the inventory table joined with products, filtering server-side
 * to only rows where products.stock_threshold is not null, then applies
 * the <= threshold comparison client-side.
 *
 * Invalidated by the Realtime subscription in useInventoryStore.
 */
export function useInventoryAlerts() {
  const query = useQuery({
    queryKey: inventoryKeys.alerts(),
    queryFn: async (): Promise<Result<InventoryAlert[]>> => {
      // Select inventory joined with products; only include products that have
      // a stock_threshold configured (not null).
      const res = await supabaseQuery(() =>
        supabase
          .from('inventory')
          .select(
            `
            quantity_on_hand,
            product:products!inner(
              id,
              name,
              stock_threshold
            )
          `
          )
          .not('product.stock_threshold', 'is', null)
      );

      if (!res.ok) {
        logger.error('inventory.alerts.fetch_failed', { message: res.error.message });
        return res;
      }

      const alerts: InventoryAlert[] = [];

      // expiry_date was added in Phase 03 and awaits generated DB type refresh.
      for (const row of res.data as unknown as Array<{
        quantity_on_hand: number;
        product: { id: string; name: string; stock_threshold: number | null } | null;
      }>) {
        if (!row.product || row.product.stock_threshold === null) continue;

        const threshold = row.product.stock_threshold;
        if (row.quantity_on_hand > threshold) continue;

        try {
          alerts.push(
            InventoryAlertSchema.parse({
              productId: row.product.id,
              productName: row.product.name,
              currentStock: row.quantity_on_hand,
              threshold,
            })
          );
        } catch (e) {
          return err(unknownError(e));
        }
      }

      return ok(alerts);
    },
    staleTime: 30 * 1000,
  });

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

/** Returns products whose active expiry date falls within the configured window. */
export function useNearExpiryAlerts() {
  const { data: settings } = useSettings();
  const thresholdDays = settings?.nearExpiry.thresholdDays ?? 14;
  const query = useQuery({
    queryKey: inventoryKeys.nearExpiry(thresholdDays),
    queryFn: async (): Promise<Result<NearExpiryAlert[]>> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + thresholdDays);
      const res = await supabaseQuery(() =>
        supabase
          .from('inventory')
          .select('expiry_date, product:products!inner(id, name)')
          .not('expiry_date', 'is', null)
          .lte('expiry_date', cutoff.toISOString().slice(0, 10))
      );
      if (!res.ok) {
        logger.error('inventory.near_expiry.fetch_failed', { message: res.error.message });
        return res;
      }
      const alerts: NearExpiryAlert[] = [];
      // expiry_date was added in Phase 03 and awaits generated DB type refresh.
      for (const row of res.data as unknown as Array<{
        expiry_date: string | null;
        product: { id: string; name: string } | null;
      }>) {
        if (!row.product || !row.expiry_date) continue;
        try {
          const expiryDate = new Date(`${row.expiry_date}T00:00:00`);
          alerts.push(
            NearExpiryAlertSchema.parse({
              productId: row.product.id,
              productName: row.product.name,
              expiryDate: row.expiry_date,
              daysUntilExpiry: Math.ceil((expiryDate.getTime() - today.getTime()) / 86_400_000),
            })
          );
        } catch (e) {
          return err(unknownError(e));
        }
      }
      return ok(alerts);
    },
    staleTime: 30 * 1000,
  });
  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}

type AdjustInventoryContext = { previousList?: Result<Inventory[]> };

export function useMutationAdjustInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      quantityDelta,
      reason,
      staffId,
    }: {
      productId: string;
      quantityDelta: number;
      reason: string;
      staffId: string;
    }): Promise<Result<{ inventory: Inventory; log: InventoryLog }>> => {
      const currentRes = await supabaseQuery<Tables<'inventory'>>(() =>
        supabase.from('inventory').select('*').eq('product_id', productId).single()
      );

      if (!currentRes.ok) {
        logger.error('inventory.adjust.fetch_failed', { message: currentRes.error.message });
        return currentRes;
      }

      const newQuantity = currentRes.data.quantity_on_hand + quantityDelta;
      if (newQuantity < 0) {
        logger.error('inventory.adjust.negative', { productId, newQuantity });
        return err(unknownError('quantity_negative'));
      }

      const updateRes = await supabaseMutation<Tables<'inventory'>>(() =>
        supabase
          .from('inventory')
          .update({ quantity_on_hand: newQuantity })
          .eq('product_id', productId)
          .select()
          .single()
      );

      if (!updateRes.ok) {
        logger.error('inventory.adjust.update_failed', {
          message: updateRes.error.message,
        });
        return updateRes;
      }
      if (updateRes.data === null) {
        return err(unknownError('no_row'));
      }

      const logInsert = {
        product_id: productId,
        quantity_delta: quantityDelta,
        reason,
        staff_id: staffId,
      };

      const logRes = await supabaseMutation<Tables<'stock_movements'>>(() =>
        supabase.from('stock_movements').insert(logInsert).select().single()
      );

      if (!logRes.ok) {
        logger.error('inventory.adjust.log_failed', {
          message: logRes.error.message,
        });
        return logRes;
      }
      if (logRes.data === null) {
        return err(unknownError('no_row'));
      }

      try {
        const inventory = InventorySchema.parse({
          id: updateRes.data.id,
          productId: updateRes.data.product_id,
          quantityOnHand: updateRes.data.quantity_on_hand,
          lowStockThreshold: updateRes.data.low_stock_threshold,
          unit: updateRes.data.unit,
        });
        const log = InventoryLogSchema.parse({
          id: logRes.data.id,
          productId: logRes.data.product_id,
          quantityDelta: logRes.data.quantity_delta,
          reason: logRes.data.reason as InventoryLog['reason'],
          staffId: logRes.data.staff_id,
          createdAt: new Date(logRes.data.created_at),
        });
        return ok({ inventory, log });
      } catch (e) {
        return err(unknownError(e));
      }
    },

    onMutate: async ({ productId, quantityDelta }) => {
      await queryClient.cancelQueries({ queryKey: inventoryKeys.all });
      const previousList = queryClient.getQueryData<Result<Inventory[]>>(inventoryKeys.all);
      useInventoryStore.setState(s => ({
        inventory: s.inventory.map(i =>
          i.productId === productId
            ? { ...i, quantityOnHand: Math.max(0, i.quantityOnHand + quantityDelta) }
            : i
        ),
      }));
      useInventoryStore.getState().refreshAlerts();
      queryClient.setQueryData<Result<Inventory[]>>(inventoryKeys.all, old => {
        if (!old?.ok) return old;
        return ok(
          old.data.map(i =>
            i.productId === productId
              ? { ...i, quantityOnHand: Math.max(0, i.quantityOnHand + quantityDelta) }
              : i
          )
        );
      });
      return { previousList } as AdjustInventoryContext;
    },

    onSuccess: (result, variables, ctx) => {
      const c = ctx as AdjustInventoryContext | undefined;
      if (!result.ok) {
        if (c?.previousList !== undefined) {
          queryClient.setQueryData(inventoryKeys.all, c.previousList);
          if (c.previousList.ok) {
            useInventoryStore.getState().setInventory(c.previousList.data);
          }
        }
        return;
      }
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.log() });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.product(variables.productId) });
    },

    onError: (_e, _v, ctx) => {
      const prev = ctx?.previousList;
      if (prev !== undefined) {
        queryClient.setQueryData(inventoryKeys.all, prev);
        if (prev.ok) useInventoryStore.getState().setInventory(prev.data);
      }
    },
  });
}

export function useInventoryLog(productId?: string) {
  const query = useQuery({
    queryKey: inventoryKeys.log(productId),
    queryFn: async (): Promise<Result<InventoryLog[]>> => {
      const base = supabase
        .from('stock_movements')
        .select(
          `
          *,
          product:products(
            id,
            name,
            sku
          ),
          staff:profiles(
            id,
            name
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(100);

      const res = await supabaseQuery<any[]>(() =>
        productId ? base.eq('product_id', productId) : base
      );

      if (!res.ok) {
        logger.error('inventory.log.fetch_failed', { message: res.error.message });
        return res;
      }

      const logs: InventoryLog[] = [];
      for (const row of res.data) {
        try {
          logs.push(
            InventoryLogSchema.parse({
              id: row.id,
              productId: row.product_id,
              quantityDelta: row.quantity_delta,
              reason: row.reason,
              staffId: row.staff_id,
              createdAt: new Date(row.created_at),
            })
          );
        } catch (e) {
          return err(unknownError(e));
        }
      }
      return ok(logs);
    },
  });

  const r = query.data;
  return {
    ...query,
    data: r?.ok ? r.data : undefined,
    resultError: r && !r.ok ? r.error : undefined,
    isEmpty: query.isSuccess && !!r?.ok && r.data.length === 0,
    isIdleOrLoading: query.isPending || query.isLoading,
  };
}
