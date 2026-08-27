import { emit } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ImageOff, PackageSearch } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WeightEntryDialog } from '@features/add-loose-weight-item/ui/WeightEntryDialog';
import { useLookupProductByBarcode } from '@features/lookup-product-by-barcode/model/useLookupProductByBarcode';
import {
  ADD_TO_CART_EVENT,
  BARCODE_SCANNED_EVENT,
} from '@features/open-product-peek-window/model/useProductPeekWindow';
import { getProductRiskFlag } from '@entities/product/model/productRiskFlag';
import { useConfirmRiskyAdd } from '@entities/product/model/useConfirmRiskyAdd';
import type { Product } from '@shared/lib/domain';
import { useBarcodeScanner } from '@shared/lib/useBarcodeScanner';
import {
  CardSkeleton,
  EmptyState,
  MoneyDisplay,
  POSButton,
  QuantityControl,
  StatusBadge,
} from '@shared/ui';
import type { InventoryStockBadgeStatus } from '@shared/ui/StatusBadge';

/**
 * `InventoryRow.tsx`'s `stockTier()` is not exported and operates on
 * `Inventory` (non-optional fields), not `Product` (optional
 * `quantityOnHand`/`lowStockThreshold`) — inline the same three comparisons
 * here rather than importing something that doesn't fit this caller's type
 * (RESEARCH.md "Don't Hand-Roll"). An undefined inventory join (no row) is
 * treated as in-stock, not downgraded.
 */
function productStockTier(product: Product): InventoryStockBadgeStatus {
  const { quantityOnHand, lowStockThreshold } = product;
  if (quantityOnHand === undefined || lowStockThreshold === undefined) return 'inv_in_stock';
  if (quantityOnHand === 0) return 'inv_out_of_stock';
  if (quantityOnHand <= lowStockThreshold) return 'inv_low_stock';
  return 'inv_in_stock';
}

function PeekWindowShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">{children}</div>
      <div className="flex justify-end gap-2 border-t bg-muted/50 p-4">{footer}</div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('wPanels');
  return (
    <POSButton type="button" variant="outline" touchSize="large" onClick={onClose}>
      {t('common:actions.close')}
    </POSButton>
  );
}

function LoadingStateView({ onClose }: { onClose: () => void }) {
  return (
    <PeekWindowShell footer={<CloseButton onClose={onClose} />}>
      <CardSkeleton height={360} />
    </PeekWindowShell>
  );
}

function NotFoundStateView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('wPanels');
  return (
    <PeekWindowShell footer={<CloseButton onClose={onClose} />}>
      <EmptyState
        icon={PackageSearch}
        title={t('featOrders:scanBarcodeToCart.productNotFound')}
        description={t('productPeekPanel.notFoundBody')}
      />
    </PeekWindowShell>
  );
}

function ErrorStateView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('wPanels');
  return (
    <PeekWindowShell footer={<CloseButton onClose={onClose} />}>
      <p className="text-sm text-destructive" role="alert">
        {t('productPeekPanel.loadError')}
      </p>
    </PeekWindowShell>
  );
}

function PeekProductDetail({
  product,
  onClose,
  confirmRiskyAdd,
}: {
  product: Product;
  onClose: () => void;
  confirmRiskyAdd: ReturnType<typeof useConfirmRiskyAdd>;
}) {
  const { t } = useTranslation('wPanels');
  const [qty, setQty] = useState(1);
  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const stockTier = productStockTier(product);

  const commit = () => {
    if (product.soldByWeight) {
      setWeightDialogOpen(true);
      return;
    }
    void emit(ADD_TO_CART_EVENT, { product, qty });
    onClose();
  };

  const handleAddToCart = () => {
    const flag = getProductRiskFlag(product);
    if (flag) {
      confirmRiskyAdd(flag, product, commit);
      return;
    }
    commit();
  };

  return (
    <>
      <PeekWindowShell
        footer={
          <>
            <CloseButton onClose={onClose} />
            <POSButton type="button" touchSize="xl" onClick={handleAddToCart}>
              {t('productPeekPanel.addToCart')}
            </POSButton>
          </>
        }
      >
        <div className="mx-auto flex aspect-square max-w-[240px] items-center justify-center rounded-lg border bg-muted">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="object-contain size-full"
            />
          ) : (
            <>
              <ImageOff className="text-muted-foreground size-10" aria-hidden="true" />
              <span className="sr-only">{t('productPeekPanel.noPhoto')}</span>
            </>
          )}
        </div>

        {product.category && (
          <div className="flex items-center gap-2">
            <div
              className="shrink-0 rounded-full size-3"
              style={{ backgroundColor: product.category.color }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">{product.category.name}</span>
          </div>
        )}

        <h3 title={product.name} className="w-full truncate text-2xl font-heading font-semibold">
          {product.name}
        </h3>

        <MoneyDisplay amount={product.basePrice} size="xl" className="font-semibold" />

        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('productPeekPanel.skuLabel')}
            </span>
            <span>{product.sku ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('productPeekPanel.barcodeLabel')}
            </span>
            <span>{product.barcode ?? '—'}</span>
          </div>
          <p className="text-muted-foreground">
            {product.soldByWeight ? t('productPeekPanel.unitWeight') : t('productPeekPanel.unitPiece')}
          </p>
          <div className="flex items-center justify-between">
            <StatusBadge status={stockTier} />
            <span className="text-xs text-muted-foreground">
              {t('productPeekPanel.stockCount', { count: product.quantityOnHand ?? 0 })}
            </span>
          </div>
        </div>

        {!product.soldByWeight && <QuantityControl value={qty} onChange={setQty} />}
      </PeekWindowShell>
      {product.soldByWeight && (
        <WeightEntryDialog
          open={weightDialogOpen}
          onOpenChange={setWeightDialogOpen}
          product={product}
          mode="add"
          onConfirm={weightGrams => {
            void emit(ADD_TO_CART_EVENT, { product, weightGrams });
            onClose();
          }}
        />
      )}
    </>
  );
}

export function ProductPeekWindow() {
  const { lookup } = useLookupProductByBarcode();
  const confirmRiskyAdd = useConfirmRiskyAdd();
  // undefined = loading, null = not-found-or-error-resolved-null, Product = populated
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [hasError, setHasError] = useState(false);

  const loadProduct = useCallback(
    async (code: string) => {
      setHasError(false);
      setProduct(undefined);
      try {
        // Trim first — scanner whitespace/newline artifacts must never cause
        // a false not-found on the exact-match lookup (specless-fallback
        // PEEK-01/encoding, backstop).
        const result = await lookup(code.trim());
        setProduct(result);
      } catch {
        // Defensive last resort: useLookupProductByBarcode already swallows
        // Supabase errors into a resolved `null`, so a real RLS/auth-session
        // failure will present as "not found" (NotFoundStateView), not this
        // branch — Plan 18-03's dedicated session-restore E2E test is what
        // actually catches that failure mode.
        setHasError(true);
      }
    },
    [lookup]
  );

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('barcode');
    if (code) {
      void loadProduct(code);
    } else {
      // Defensive: ensurePeekWindowShown always supplies a barcode via the
      // creation URL, so this branch should not occur in practice.
      setProduct(null);
    }
    // Only ever read the barcode once, from the window that opened us.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount, loadProduct identity is stable across the single barcode read
  }, []);

  // Own scanner instance — the peek window has OS focus while open (D-01).
  // Rescanning here both re-fetches locally (PEEK-04) and relays the raw
  // code to the main window so its own search box stays in sync (D-02).
  useBarcodeScanner({
    onScan: code => {
      void loadProduct(code);
      void emit(BARCODE_SCANNED_EVENT, { code });
    },
  });

  const handleClose = () => {
    // Never .close()/.destroy() — the peek window is hidden and reused on
    // the next scan (D-03).
    void getCurrentWebviewWindow().hide();
  };

  if (hasError) return <ErrorStateView onClose={handleClose} />;
  if (product === undefined) return <LoadingStateView onClose={handleClose} />;
  if (product === null) return <NotFoundStateView onClose={handleClose} />;

  return (
    <PeekProductDetail
      key={product.id}
      product={product}
      onClose={handleClose}
      confirmRiskyAdd={confirmRiskyAdd}
    />
  );
}
