/**
 * Groups flat OrderItem[] into summarised rows.
 * Items with the same productId + same modifier set are merged;
 * quantities are summed and lineTotal is recomputed.
 */

import type { Tab } from '@shared/lib/domain';

export type OrderItem = Tab['items'][number];

export type GroupedOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  modifierPriceDelta: number;
  lineTotal: number;
  modifierIds: string[];
};

/**
 * Merges duplicate order items (same product + same modifiers).
 * Result is sorted alphabetically by productName.
 */
export function groupOrderItems(items: OrderItem[]): GroupedOrderItem[] {
  const map = new Map<string, GroupedOrderItem>();

  for (const item of items) {
    const sortedModIds = [...item.modifierIds].sort();
    const key = `${item.productId}::${sortedModIds.join(',')}`;

    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.lineTotal =
        Math.round((existing.unitPrice + existing.modifierPriceDelta) * existing.quantity * 100) /
        100;
    } else {
      const unitPrice = item.unitPrice;
      const modifierPriceDelta = item.modifierPriceDelta;
      map.set(key, {
        productId: item.productId,
        productName: item.product?.name ?? 'Menu item',
        quantity: item.quantity,
        unitPrice,
        modifierPriceDelta,
        lineTotal: Math.round((unitPrice + modifierPriceDelta) * item.quantity * 100) / 100,
        modifierIds: sortedModIds,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName));
}
