import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product, Modifier } from '@shared/lib/domain';
import { CartItemSchema } from '@shared/lib/domain';
import { logger } from '@shared/lib/logger-instance';
/* eslint-disable i18next/no-literal-string -- zustand persist store name below
   is a localStorage key, not UI copy. */

interface CartState {
  items: CartItem[];
  heldCart: CartItem[] | null;
}

interface CartActions {
  /**
   * Adds a product to the cart with the chosen modifiers.
   * If an identical product+modifier combination already exists, increments quantity instead.
   * Pass unitPrice to override the base price (e.g. happy hour resolved price).
   */
  addItem: (product: Product, modifiers: Modifier[], unitPrice?: number) => void;

  /** Adds a distinct gram-priced line; weighted products never merge. */
  addWeightedItem: (product: Product, weightGrams: number) => void;

  /** Reprices one weighted line without changing its position in the cart. */
  updateWeightedItem: (tempId: string, weightGrams: number) => void;

  /** Removes a cart line by its tempId. */
  removeItem: (tempId: string) => void;

  /** Updates the notes field on a cart line. */
  setItemNotes: (tempId: string, notes: string) => void;

  /**
   * Adjusts the quantity of a cart line by delta (+1 or -1).
   * Removes the line if quantity would drop to zero.
   */
  updateQuantity: (tempId: string, delta: 1 | -1) => void;

  /** Sets absolute quantity (1–99). Removes the line if quantity is 0 or less. */
  setLineQuantity: (tempId: string, quantity: number) => void;

  /** Empties the cart. */
  clearCart: () => void;

  holdCart: () => void;
  resumeHeld: () => void;
  discardHeld: () => void;
}

interface CartSelectors {
  /** Sum of all line totals in the cart. */
  totalAmount: () => number;

  /** Total number of individual units across all cart lines. */
  itemCount: () => number;

  /** True when the cart has no items. */
  isCartEmpty: () => boolean;
}

type CartStore = CartState & CartActions & CartSelectors;

const calcLineTotal = (unitPrice: number, modifiers: Modifier[], quantity: number): number =>
  (unitPrice + modifiers.reduce((sum, m) => sum + m.priceDelta, 0)) * quantity;

export const calcWeightedLineTotal = (pricePerKg: number, weightGrams: number): number =>
  Math.round(pricePerKg * (weightGrams / 1000) * 100) / 100;

/**
 * Local-storage key for the one persisted held-cart slot (D-01). Bump
 * HELD_CART_STORE_VERSION and extend `migrate` below on any future
 * incompatible change to CartItemSchema's persisted shape.
 */
const HELD_CART_STORE_NAME = 'direct-sale-held-cart';
const HELD_CART_STORE_VERSION = 1;

const PersistedHeldCartSchema = z.array(CartItemSchema).nullable();

/**
 * Validates a raw persisted `heldCart` value before it re-enters the store.
 * A missing, malformed, or tampered payload resolves to `null` (no held
 * cart) rather than a partial/incomplete cart — restart recovery must never
 * surface a sale that can't be trusted (T-02-09-01).
 */
function normalizePersistedHeldCart(value: unknown): CartItem[] | null {
  const parsed = PersistedHeldCartSchema.safeParse(value ?? null);
  if (!parsed.success) {
    logger.warn('cart.held.persisted_payload_invalid', { issueCount: parsed.error.issues.length });
    return null;
  }
  return parsed.data;
}

/**
 * Only `heldCart` is persisted (see `partialize` below) — the active `items`
 * cart, actions, and derived selectors are session-only and never survive a
 * restart.
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      heldCart: null,

      addItem: (product, modifiers, unitPrice?) => {
        const state = get();
        const modifierKey = modifiers
          .map(m => m.id)
          .sort()
          .join(',');

        const existingIndex = state.items.findIndex(
          item =>
            item.product.id === product.id &&
            item.selectedModifiers
              .map(m => m.id)
              .sort()
              .join(',') === modifierKey
        );

        if (existingIndex >= 0) {
          const updated = [...state.items];
          const existing = updated[existingIndex];
          if (!existing) {
            return;
          }
          const quantity = existing.quantity + 1;
          updated[existingIndex] = {
            ...existing,
            quantity,
            lineTotal: calcLineTotal(existing.unitPrice, existing.selectedModifiers, quantity),
          };
          logger.debug('cart.item.incremented', { tempId: existing.tempId, quantity });
          set({ items: updated });
        } else {
          const resolvedUnitPrice = unitPrice ?? product.basePrice;
          const newItem: CartItem = {
            tempId: crypto.randomUUID(),
            product,
            quantity: 1,
            selectedModifiers: modifiers,
            unitPrice: resolvedUnitPrice,
            notes: '',
            lineTotal: calcLineTotal(resolvedUnitPrice, modifiers, 1),
          };
          logger.debug('cart.item.added', { tempId: newItem.tempId, productId: product.id });
          set({ items: [...state.items, newItem] });
        }
      },

      addWeightedItem: (product, weightGrams) => {
        const newItem: CartItem = {
          tempId: crypto.randomUUID(),
          product,
          quantity: 1,
          weightGrams,
          selectedModifiers: [],
          unitPrice: product.basePrice,
          notes: '',
          lineTotal: calcWeightedLineTotal(product.basePrice, weightGrams),
        };
        logger.debug('cart.weighted_item.added', {
          tempId: newItem.tempId,
          productId: product.id,
          weightGrams,
        });
        set(state => ({ items: [...state.items, newItem] }));
      },

      updateWeightedItem: (tempId, weightGrams) => {
        set(state => ({
          items: state.items.map(item =>
            item.tempId === tempId
              ? {
                  ...item,
                  weightGrams,
                  lineTotal: calcWeightedLineTotal(item.product.basePrice, weightGrams),
                }
              : item
          ),
        }));
        logger.debug('cart.weighted_item.updated', { tempId, weightGrams });
      },

      removeItem: tempId => {
        logger.debug('cart.item.removed', { tempId });
        set(state => ({ items: state.items.filter(item => item.tempId !== tempId) }));
      },

      setItemNotes: (tempId, notes) => {
        const clamped = notes.slice(0, 200);
        set(state => ({
          items: state.items.map(item =>
            item.tempId === tempId ? { ...item, notes: clamped } : item
          ),
        }));
        logger.debug('cart.item.notes_set', { tempId });
      },

      updateQuantity: (tempId, delta) => {
        set(state => {
          const updated = state.items
            .map(item => {
              if (item.tempId !== tempId) return item;
              const quantity = item.quantity + delta;
              if (quantity <= 0) return null;
              return {
                ...item,
                quantity,
                lineTotal: calcLineTotal(item.unitPrice, item.selectedModifiers, quantity),
              };
            })
            .filter((item): item is CartItem => item !== null);
          logger.debug('cart.quantity.updated', { tempId, delta });
          return { items: updated };
        });
      },

      setLineQuantity: (tempId, quantity) => {
        set(state => {
          if (quantity <= 0) {
            logger.debug('cart.quantity.removed_line', { tempId });
            return { items: state.items.filter(item => item.tempId !== tempId) };
          }
          const clamped = Math.min(99, Math.max(1, Math.floor(quantity)));
          const updated = state.items.map(item => {
            if (item.tempId !== tempId) return item;
            return {
              ...item,
              quantity: clamped,
              lineTotal: calcLineTotal(item.unitPrice, item.selectedModifiers, clamped),
            };
          });
          logger.debug('cart.quantity.set', { tempId, quantity: clamped });
          return { items: updated };
        });
      },

      clearCart: () => {
        logger.info('cart.cleared');
        set({ items: [] });
      },

      holdCart: () => {
        const state = get();
        // D-01: one slot only. If a held sale already exists, do not replace it
        // — leave both the existing held cart and the current active cart
        // untouched. CheckoutPanel also disables the Hold control while
        // isHeld, but this guard is the authoritative check regardless of caller.
        if (state.heldCart !== null) {
          logger.warn('cart.held.blocked_slot_occupied');
          return;
        }
        logger.info('cart.held');
        set({ heldCart: state.items, items: [] });
      },

      resumeHeld: () => {
        let swappedActiveCart = false;
        set(state => {
          if (!state.heldCart) return state;
          swappedActiveCart = state.items.length > 0;
          return {
            items: state.heldCart,
            heldCart: swappedActiveCart ? state.items : null,
          };
        });
        logger.info('cart.resumed', { swappedActiveCart });
      },

      discardHeld: () => {
        logger.info('cart.held.discarded');
        set({ heldCart: null });
      },

      totalAmount: () => get().items.reduce((sum, item) => sum + item.lineTotal, 0),

      itemCount: () => get().items.reduce((count, item) => count + item.quantity, 0),

      isCartEmpty: () => get().items.length === 0,
    }),
    {
      name: HELD_CART_STORE_NAME,
      version: HELD_CART_STORE_VERSION,
      // Never serialize items, payment-attempt state, or any action —
      // only the one held-cart slot is restart-recoverable state.
      partialize: state => ({ heldCart: state.heldCart }),
      // Called only when the persisted version differs from
      // HELD_CART_STORE_VERSION. An obsolete version has no defined
      // migration path yet, so it resolves to no held cart rather than
      // risking a shape mismatch downstream.
      migrate: (_persistedState, version) => {
        if (version !== HELD_CART_STORE_VERSION) {
          logger.warn('cart.held.persisted_version_obsolete', { version });
          return { heldCart: null };
        }
        return _persistedState as { heldCart: unknown };
      },
      // Runs on every hydration (including right after `migrate`) — the
      // single point that validates the payload against CartItemSchema
      // before it re-enters live state (T-02-09-01).
      merge: (persistedState, currentState) => ({
        ...currentState,
        heldCart: normalizePersistedHeldCart(
          (persistedState as { heldCart?: unknown } | undefined)?.heldCart
        ),
      }),
    }
  )
);
