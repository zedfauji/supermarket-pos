import { AlertTriangle, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNearExpiryAlerts } from '@entities/inventory';
import { evaluateBestPromotion, usePromotions } from '@entities/promotion';
import { useSettings } from '@entities/settings';
import { useCartStore } from '@entities/tab/model/cartStore';
import type { CartItem as CartItemType } from '@shared/lib/domain';
import { formatMoney } from '@shared/lib/format';
import { MoneyDisplay } from '@shared/ui/MoneyDisplay';
import { POSButton } from '@shared/ui/POSButton';
import { QuantityControl } from '@shared/ui/QuantityControl';
import { Badge } from '@shared/ui/badge';
import { Input } from '@shared/ui/input';

export interface CartItemProps {
  item: CartItemType;
  onQuantitySet: (quantity: number) => void;
  onRemove: () => void;
  onNotesChange: (notes: string) => void;
  onEditWeight?: () => void;
}

export function CartItem({
  item,
  onQuantitySet,
  onRemove,
  onNotesChange,
  onEditWeight,
}: CartItemProps) {
  const { t } = useTranslation('entities');
  const { data: nearExpiryAlerts } = useNearExpiryAlerts();
  const nearExpiry = nearExpiryAlerts?.find(alert => alert.productId === item.product.id);
  // Detects any discounted line regardless of source (promotion or
  // expiry-trigger) — ad-hoc/custom discounts never touch cart-line
  // unitPrice (D-10), only promotions do, so this stays accurate.
  const isDiscounted = item.unitPrice !== item.product.basePrice;

  // PROMO-08: resolves the flagged line to its fresh price/promotion at tap
  // time (never a stale cached value) and clears priceConflict.
  const { data: activePromotions } = usePromotions();
  const { data: appSettings } = useSettings();
  const resolveConflict = useCartStore(state => state.resolveConflict);
  const handleResolveConflict = () => {
    if (!activePromotions || !appSettings) return;
    const daysUntilExpiry =
      nearExpiryAlerts?.find(alert => alert.productId === item.product.id)?.daysUntilExpiry ?? null;
    const match = evaluateBestPromotion(
      {
        productId: item.product.id,
        categoryId: item.product.categoryId,
        basePrice: item.product.basePrice,
      },
      activePromotions,
      new Date(),
      appSettings.nearExpiry.discountPercent,
      daysUntilExpiry,
      appSettings.nearExpiry.thresholdDays,
      appSettings.general.timezone
    );
    resolveConflict(
      item.tempId,
      match?.discountedUnitPrice ?? item.product.basePrice,
      match?.promotionId ?? null
    );
  };
  const discountPercent =
    isDiscounted && item.product.basePrice > 0
      ? Math.round(((item.product.basePrice - item.unitPrice) / item.product.basePrice) * 100)
      : null;
  return (
    <div className="flex gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h4 className="truncate text-sm font-medium">{item.product.name}</h4>
          <POSButton
            type="button"
            variant="ghost"
            touchSize="default"
            size="icon"
            className="shrink-0"
            onClick={onRemove}
            aria-label={t('cartItem.remove', { name: item.product.name })}
          >
            <X className="h-4 w-4" />
          </POSButton>
        </div>

        {nearExpiry ? (
          <Badge className="mb-2 bg-pos-warning text-amber-950 dark:text-amber-100">
            {t('cartItem.nearExpiry', { days: nearExpiry.daysUntilExpiry })}
          </Badge>
        ) : null}

        {item.priceConflict ? (
          <POSButton
            type="button"
            variant="destructive"
            touchSize="default"
            size="sm"
            className="mb-2 gap-1.5"
            onClick={handleResolveConflict}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('cartItem.priceConflict')}
          </POSButton>
        ) : null}

        {item.selectedModifiers.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {item.selectedModifiers.map(mod => (
              <Badge key={mod.id} variant="secondary" className="text-xs">
                {mod.name}
                {mod.priceDelta > 0 ? ` ${formatMoney(mod.priceDelta, { showSign: true })}` : ''}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {item.weightGrams != null ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t('cartItem.weight', { weight: (item.weightGrams / 1000).toFixed(3) })}
              </span>
              <POSButton type="button" variant="outline" touchSize="default" onClick={onEditWeight}>
                {t('cartItem.editWeight')}
              </POSButton>
            </div>
          ) : (
            <QuantityControl value={item.quantity} min={1} max={99} onChange={onQuantitySet} />
          )}
          <div className="flex shrink-0 items-center gap-1">
            {isDiscounted && (
              <Zap
                className="h-3.5 w-3.5 text-pos-accent"
                aria-label={t('cartItem.promotionApplied')}
              />
            )}
            {discountPercent !== null && discountPercent > 0 && (
              <Badge className="bg-pos-accent text-white">
                {t('cartItem.discountBadge', { percent: discountPercent })}
              </Badge>
            )}
            <MoneyDisplay amount={item.lineTotal} size="lg" />
          </div>
        </div>

        <Input
          data-testid={`cart-item-notes-${item.product.id}`}
          type="text"
          placeholder={t('cartItem.notesPlaceholder')}
          value={item.notes}
          maxLength={200}
          className="mt-2 h-7 text-xs"
          onChange={e => {
            onNotesChange(e.target.value);
          }}
          aria-label={t('cartItem.notesFor', { name: item.product.name })}
        />
      </div>
    </div>
  );
}
