import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PaymentForm } from '@widgets/PaymentModal/ui/PaymentForm';
import { ProductGrid } from '@widgets/ProductGrid/ui/ProductGrid';
import { useAddLooseWeightItem } from '@features/add-loose-weight-item/model/useAddLooseWeightItem';
import { WeightEntryDialog } from '@features/add-loose-weight-item/ui/WeightEntryDialog';
import { useCheckoutSale } from '@features/checkout-sale/model/useCheckoutSale';
import { HoldSaleBanner } from '@features/hold-sale/ui/HoldSaleBanner';
import {
  ADD_TO_CART_EVENT,
  BARCODE_SCANNED_EVENT,
  ensurePeekWindowShown,
} from '@features/open-product-peek-window/model/useProductPeekWindow';
import type { AddToCartPayload } from '@features/open-product-peek-window/model/useProductPeekWindow';
import { useNearExpiryAlerts } from '@entities/inventory';
import { useCategories, useProducts } from '@entities/product';
import { evaluateBestPromotion, usePromotions } from '@entities/promotion';
import { useSettings } from '@entities/settings';
import { useStaffStore } from '@entities/staff';
import { useCartStore } from '@entities/tab/model/cartStore';
import { CartItem } from '@entities/tab/ui/CartItem';
import { useOnlineStatus } from '@shared/lib/connectivity';
import type { Product } from '@shared/lib/domain';
import { formatMoney } from '@shared/lib/format';
import { useLockStateStore } from '@shared/lib/lock-state-store';
import { isTauri } from '@shared/lib/pos-printer';
import { useBarcodeScanner } from '@shared/lib/useBarcodeScanner';
import { MoneyDisplay, POSButton, ScrollArea } from '@shared/ui';

export function CheckoutPanel() {
  const { t } = useTranslation('wPanels');
  const weightEntry = useAddLooseWeightItem();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingWeightItemId, setEditingWeightItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Scanning is only safe on the ordinary cart screen: while payment/receipt
  // UI is mounted (paymentOpen) or a weight dialog owns the register
  // (weightEntry.isOpen for add, editingWeightItemId for edit), a scan must
  // not silently add to or reopen a cart that a modal transition is about to
  // clear or that is not currently editable (CHK-01, T-02-08-01). Also gated
  // on !locked (T-21-06, RESEARCH.md Pitfall 3): this hook's window-level
  // keydown listener is genuinely global -- it fires regardless of the
  // idle-lock overlay's own focus trap -- so without this gate a raw
  // barcode-scanner keystroke burst could still open/refresh the Product
  // Peek window while the screen visually appears locked, defeating the
  // lock's purpose even though no cart mutation occurs.
  const locked = useLockStateStore(s => s.locked);
  const scannerEnabled = !paymentOpen && !weightEntry.isOpen && editingWeightItemId === null && !locked;
  // A scan only populates the product search box — it never adds to the cart
  // by itself. useBarcodeScanner hands over the full scanned code in one
  // call, so this always replaces `search` rather than appending to it.
  useBarcodeScanner({
    enabled: scannerEnabled,
    onScan: code => {
      setSearch(code);
      void ensurePeekWindowShown(code);
    },
  });
  useProducts();
  useCategories();
  const promotionsQuery = usePromotions();
  const { data: activePromotions } = promotionsQuery;
  const nearExpiryQuery = useNearExpiryAlerts();
  const { data: nearExpiryAlerts } = nearExpiryQuery;
  const { data: appSettings } = useSettings();
  // Resolves the live, promotion-discounted price match for a product at
  // scan/select time (PROMO-03, display only — process_direct_sale_atomic
  // remains the sole price authority at checkout). Returns undefined when
  // no promotion/expiry-trigger qualifies, so callers fall back to
  // cartStore's own product.basePrice default. Also carries promotionId
  // (PROMO-08) so addItem/addWeightedItem can stamp the cart line's
  // promotion snapshot for later reconnect conflict detection.
  const resolvePromotionMatch = (product: Product) => {
    if (!activePromotions || !appSettings) return undefined;
    const daysUntilExpiry =
      nearExpiryAlerts?.find(alert => alert.productId === product.id)?.daysUntilExpiry ?? null;
    return evaluateBestPromotion(
      { productId: product.id, categoryId: product.categoryId, basePrice: product.basePrice },
      activePromotions,
      new Date(),
      appSettings.nearExpiry.discountPercent,
      daysUntilExpiry,
      appSettings.nearExpiry.thresholdDays
    );
  };
  // The ADD_TO_CART_EVENT listener below is registered once on mount
  // ([] deps, Tauri global event) — a plain closure over
  // resolvePromotionMatch would go stale the moment promotions/settings
  // finish loading after mount. Route through a ref updated every render
  // instead.
  const resolvePromotionMatchRef = useRef(resolvePromotionMatch);
  resolvePromotionMatchRef.current = resolvePromotionMatch;
  const items = useCartStore(state => state.items);
  const total = useCartStore(state => state.totalAmount());
  const addItem = useCartStore(state => state.addItem);
  const addWeightedItem = useCartStore(state => state.addWeightedItem);
  const removeItem = useCartStore(state => state.removeItem);
  const setLineQuantity = useCartStore(state => state.setLineQuantity);
  const setItemNotes = useCartStore(state => state.setItemNotes);
  const clearCart = useCartStore(state => state.clearCart);
  const holdCart = useCartStore(state => state.holdCart);
  const isHeld = useCartStore(state => state.heldCart !== null);
  const flagPriceConflict = useCartStore(state => state.flagPriceConflict);
  const staffId = useStaffStore(state => state.currentStaff?.id ?? '');
  const { syntheticTab, processors, resetIdempotencyKey } = useCheckoutSale();
  const editingWeightItem = items.find(item => item.tempId === editingWeightItemId);
  const hasPriceConflict = items.some(item => item.priceConflict);

  // PROMO-08: on reconnect, re-evaluate every promotion-sourced cart line
  // against freshly-refetched promotions/near-expiry data. A stale offline
  // discount is never silently re-priced or silently trusted — a changed or
  // vanished result flags the line for the cashier to review (see
  // OfflineQueueProcessor's wasOnlineRef/transitionedOnline pattern, mirrored
  // here as a local effect since this only needs this component's own
  // already-available data, not the tab-offline-queue machinery).
  const isOnline = useOnlineStatus();
  const wasOnlineRef = useRef<boolean>(isOnline);
  useEffect(() => {
    const previouslyOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    const transitionedOnline = isOnline && !previouslyOnline;
    if (!transitionedOnline || !appSettings) return;

    void (async () => {
      const [promotionsResult, nearExpiryResult] = await Promise.all([
        promotionsQuery.refetch(),
        nearExpiryQuery.refetch(),
      ]);
      const freshPromotions = promotionsResult.data?.ok ? promotionsResult.data.data : [];
      const freshNearExpiry = nearExpiryResult.data?.ok ? nearExpiryResult.data.data : [];

      for (const item of useCartStore.getState().items) {
        if (!item.promotionId) continue;
        const daysUntilExpiry =
          freshNearExpiry.find(alert => alert.productId === item.product.id)?.daysUntilExpiry ??
          null;
        const match = evaluateBestPromotion(
          {
            productId: item.product.id,
            categoryId: item.product.categoryId,
            basePrice: item.product.basePrice,
          },
          freshPromotions,
          new Date(),
          appSettings.nearExpiry.discountPercent,
          daysUntilExpiry,
          appSettings.nearExpiry.thresholdDays
        );
        const changed =
          !match ||
          match.promotionId !== item.promotionId ||
          match.discountedUnitPrice !== item.unitPrice;
        if (changed) {
          flagPriceConflict(item.tempId);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on the online transition itself
  }, [isOnline]);

  // Relays a rescan captured by the peek window (which has OS focus while
  // open) back into this window's own search box, and applies the peek
  // window's "Add to Cart" commit to the real cart — the peek window has no
  // direct cartStore access of its own (D-04, separate JS/webview context).
  useEffect(() => {
    // No-op outside a real Tauri runtime — `listen()` throws when
    // `window.__TAURI_INTERNALS__` is absent (plain browser tab, e.g. this
    // project's Playwright suite driving `npm run dev`). The peek-window E2E
    // spec explicitly injects the same `window.__TAURI__` global this checks
    // for, so real cross-window coverage is unaffected.
    if (!isTauri()) return undefined;
    const unlistenScanned = listen<{ code: string }>(BARCODE_SCANNED_EVENT, event => {
      setSearch(event.payload.code);
    });
    const unlistenAddToCart = listen<AddToCartPayload>(ADD_TO_CART_EVENT, event => {
      const { product, qty, weightGrams } = event.payload;
      const match = resolvePromotionMatchRef.current(product);
      if (weightGrams != null) {
        addWeightedItem(product, weightGrams, match?.discountedUnitPrice, match?.promotionId ?? null);
      } else {
        const times = qty ?? 1;
        for (let i = 0; i < times; i += 1) {
          addItem(product, [], match?.discountedUnitPrice, match?.promotionId ?? null);
        }
      }
    });
    return () => {
      void unlistenScanned.then(unlisten => {
        unlisten();
      });
      void unlistenAddToCart.then(unlisten => {
        unlisten();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addItem/addWeightedItem are stable Zustand action references (never change identity)
  }, []);

  if (paymentOpen) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <PaymentForm
          tab={syntheticTab}
          staffId={staffId}
          processors={processors}
          onPaymentSuccess={() => undefined}
          onClose={() => {
            resetIdempotencyKey();
            setPaymentOpen(false);
          }}
          onDone={() => {
            toast.success(t('checkoutPanel.saleComplete', { amount: formatMoney(total) }));
            resetIdempotencyKey();
            clearCart();
            setPaymentOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)] lg:p-6">
      <HoldSaleBanner />
      <ProductGrid
        weightEntry={weightEntry}
        search={search}
        onSearchChange={setSearch}
        onSelect={product => {
          const match = resolvePromotionMatch(product);
          addItem(product, [], match?.discountedUnitPrice, match?.promotionId ?? null);
        }}
      />
      <aside className="flex min-h-0 flex-col rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('checkoutPanel.cartTitle')}</h2>
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
            <p className="font-medium">{t('checkoutPanel.emptyCart')}</p>
            <p className="text-sm">{t('checkoutPanel.emptyCartDescription')}</p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <div className="space-y-3">
              {items.map(item => (
                <CartItem
                  key={item.tempId}
                  item={item}
                  onQuantitySet={quantity => {
                    setLineQuantity(item.tempId, quantity);
                  }}
                  onRemove={() => {
                    removeItem(item.tempId);
                  }}
                  onNotesChange={notes => {
                    setItemNotes(item.tempId, notes);
                  }}
                  {...(item.weightGrams != null
                    ? {
                        onEditWeight: () => {
                          setEditingWeightItemId(item.tempId);
                        },
                      }
                    : {})}
                />
              ))}
            </div>
          </ScrollArea>
        )}
        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <span className="font-medium">{t('checkoutPanel.cartTotal')}</span>
          <div className="flex items-center gap-3">
            <MoneyDisplay amount={total} size="xl" />
            <POSButton
              type="button"
              variant="outline"
              disabled={items.length === 0 || isHeld}
              onClick={holdCart}
            >
              {t('checkoutPanel.hold')}
            </POSButton>
          </div>
        </div>
        <POSButton
          type="button"
          touchSize="xl"
          className="mt-4 w-full"
          disabled={items.length === 0 || !staffId || hasPriceConflict}
          onClick={() => {
            setPaymentOpen(true);
          }}
        >
          {t('checkoutPanel.processPayment')}
        </POSButton>
      </aside>
      {editingWeightItem?.weightGrams != null && (
        <WeightEntryDialog
          open
          onOpenChange={open => {
            if (!open) setEditingWeightItemId(null);
          }}
          product={editingWeightItem.product}
          mode="edit"
          tempId={editingWeightItem.tempId}
          initialWeightGrams={editingWeightItem.weightGrams}
        />
      )}
    </div>
  );
}
