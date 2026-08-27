import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
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
import { useCategories, useProducts } from '@entities/product';
import { useStaffStore } from '@entities/staff';
import { useCartStore } from '@entities/tab/model/cartStore';
import { CartItem } from '@entities/tab/ui/CartItem';
import { formatMoney } from '@shared/lib/format';
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
  // clear or that is not currently editable (CHK-01, T-02-08-01).
  const scannerEnabled = !paymentOpen && !weightEntry.isOpen && editingWeightItemId === null;
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
  const staffId = useStaffStore(state => state.currentStaff?.id ?? '');
  const { syntheticTab, processors, resetIdempotencyKey } = useCheckoutSale();
  const editingWeightItem = items.find(item => item.tempId === editingWeightItemId);

  // Relays a rescan captured by the peek window (which has OS focus while
  // open) back into this window's own search box, and applies the peek
  // window's "Add to Cart" commit to the real cart — the peek window has no
  // direct cartStore access of its own (D-04, separate JS/webview context).
  useEffect(() => {
    const unlistenScanned = listen<{ code: string }>(BARCODE_SCANNED_EVENT, event => {
      setSearch(event.payload.code);
    });
    const unlistenAddToCart = listen<AddToCartPayload>(ADD_TO_CART_EVENT, event => {
      const { product, qty, weightGrams } = event.payload;
      if (weightGrams != null) {
        addWeightedItem(product, weightGrams);
      } else {
        const times = qty ?? 1;
        for (let i = 0; i < times; i += 1) {
          addItem(product, []);
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
          addItem(product, []);
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
          disabled={items.length === 0 || !staffId}
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
